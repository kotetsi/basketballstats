import test from 'node:test';
import assert from 'node:assert/strict';
import { model, tmpCfg, HAS_ESPEAK, HAS_FFMPEG, hasBrowser } from './helpers.mjs';
import { buildStory } from '../src/stories/builders.mjs';
import { StoryStore } from '../src/stories/store.mjs';
import { Productions } from '../src/productions/pipeline.mjs';
import { platformPackages, PLATFORMS, publish } from '../src/platforms/platforms.mjs';
import { createServer } from '../dashboard/server.mjs';

function setup() {
  const cfg = tmpCfg(), S = new StoryStore(cfg.storiesDir);
  const st = S.save(buildStory(model(), { type: 'leaderboard', params: { metric: 'pir', limit: 5 } }));
  return { cfg, S, st, P: new Productions(cfg, { model: model() }) };
}

test('production lifecycle rules: approved story, script, render, approval, publication', async () => {
  const { S, st, P } = setup();
  assert.throws(() => P.create({ storyId: st.id }), /not approved/);
  S.approve(st.id);
  assert.throws(() => P.create({ storyId: st.id, formats: ['4x3'] }), /format/);
  const p = P.create({ storyId: st.id, formats: ['9x16', '16x9'], preset: 'short', voiceId: 'local-en' });
  assert.equal(p.status, 'draft');
  await assert.rejects(P.render(p.id), /script first/);
  const s = await P.script(p.id, { useLlm: false });
  assert.equal(s.status, 'scripted'); assert.ok(s.script.factCheck.ok);
  const e = P.editScript(p.id, [{ id: 'intro', text: 'The top 5, plus a made-up 77.7 for fun.' }]);
  assert.deepEqual(e.script.factCheck.unsupported, ['77.7']);
  assert.throws(() => P.approve(p.id), /render the final video/);
  assert.throws(() => P.markPublished(p.id, { platform: 'tiktok' }), /approve before/);
  P.editScript(p.id, [{ id: 'intro', text: 'The top 5 in PIR.' }]);
  assert.ok(P.get(p.id).script.factCheck.ok);
  const m = P.recordMetrics(p.id, 'tiktok', { views: '1200', avgWatchSecs: '9.5', junk: 'x', shares: 'abc' });
  assert.deepEqual(Object.keys(m.performance.tiktok).sort(), ['avgWatchSecs', 'updatedAt', 'views']);
  assert.ok(P.get(p.id).history.length >= 5);
});

test('unavailable voice is reported, not silently replaced', async () => {
  const { S, st, P } = setup(); S.approve(st.id);
  const p = P.create({ storyId: st.id, voiceId: 'openai-onyx' });
  await P.script(p.id, { useLlm: false });
  await assert.rejects(new Productions(P.cfg, { model: model(), env: {} }).render(p.id), /missing OPENAI_API_KEY/);
});

test('platform packages: right format per platform, limits, UTM per production; publishing disabled', () => {
  const st = buildStory(model(), { type: 'spotlight', params: { player: 'sasha-vezenkov' } });
  const prod = { id: 'p1', renders: [{ mode: 'final', format: '9x16', secs: 45 }, { mode: 'final', format: '16x9', secs: 45 }] };
  const pk = platformPackages(prod, st);
  assert.deepEqual(Object.keys(pk), Object.keys(PLATFORMS));
  assert.equal(pk.youtube.format, '16x9'); assert.equal(pk.tiktok.format, '9x16');
  assert.ok(Object.values(pk).every(x => x.ready));
  assert.match(pk.youtube.link, /\/en\/player\/sasha-vezenkov\/\?utm_source=youtube&utm_medium=video&utm_campaign=video_factory&utm_content=p1/);
  assert.match(pk.youtube_shorts.title, /#Shorts$/); assert.ok(pk.youtube_shorts.title.length <= 100);
  assert.ok(Object.values(pk).every(x => x.hashtags.length <= PLATFORMS[Object.keys(pk).find(k => pk[k] === x)].hashtags));
  const long = platformPackages({ id: 'p2', renders: [{ mode: 'final', format: '9x16', secs: 120 }] }, st);
  assert.ok(!long.facebook_reels.ready && /limit 90s/.test(long.facebook_reels.issues[0]));
  assert.ok(!long.youtube.ready);
  assert.throws(() => publish(), /not enabled/);
});

test('dashboard API: stories, productions, script editing, guards', async () => {
  const cfg = tmpCfg();
  const srv = createServer(cfg, { model: model(), password: '', env: {} });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b && JSON.stringify(b) }); return { s: r.status, j: await r.json().catch(() => null) }; };
  try {
    const meta = await call('GET', '/api/meta');
    assert.ok(meta.j.players.length > 10); assert.equal(meta.j.voices['openai-onyx'].available.ok, false); assert.equal(meta.j.llm.available, false);
    const st = await call('POST', '/api/stories', { type: 'comparison', params: { a: 'sasha-vezenkov', b: 'kendrick-nunn' } });
    assert.equal(st.s, 201); assert.equal(st.j.status, 'draft');
    assert.equal((await call('POST', '/api/productions', { storyId: st.j.id })).s, 400, 'draft story refused');
    await call('POST', `/api/stories/${st.j.id}/approve`, {});
    const p = await call('POST', '/api/productions', { storyId: st.j.id, formats: ['9x16'], preset: 'short' });
    assert.equal(p.s, 201);
    const sc = await call('POST', `/api/productions/${p.j.id}/script`, { useLlm: true });
    assert.match(sc.j.script.llmNote, /ANTHROPIC_API_KEY/);
    const ed = await call('PUT', `/api/productions/${p.j.id}/script`, { segments: [{ id: 'intro', text: 'Who is better?' }] });
    assert.equal(ed.j.script.segments[0].text, 'Who is better?');
    assert.equal((await call('POST', `/api/productions/${p.j.id}/approve`, {})).s, 400);
    assert.equal((await call('POST', '/api/stories', { type: 'spotlight', params: { player: 'zzz' } })).s, 400);
    assert.equal((await fetch(`${base}/media/${p.j.id}/..%2F..%2Fetc%2Fpasswd`)).status, 404);
    assert.equal((await fetch(`${base}/api/productions`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await fetch(`${base}/api/productions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' })).status, 403);
    assert.match(await (await fetch(base + '/')).text(), /VIDEO <i>FACTORY/);
  } finally { srv.close(); }
});

test('dashboard: preview render job produces a playable MP4', { skip: !(HAS_ESPEAK && HAS_FFMPEG) }, async t => {
  if (!(await hasBrowser())) return t.skip('no headless browser');
  const cfg = tmpCfg({ previewScale: 0.25, previewFps: 8 });
  const S = new StoryStore(cfg.storiesDir);
  const st = S.save(buildStory(model(), { type: 'spotlight', params: { player: 'sasha-vezenkov', n: 4 } })); S.approve(st.id);
  const srv = createServer(cfg, { model: model(), password: '' });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (m, p, b) => (await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b && JSON.stringify(b) })).json();
  try {
    const p = await call('POST', '/api/productions', { storyId: st.id, formats: ['16x9'], preset: 'short' });
    await call('POST', `/api/productions/${p.id}/script`, { useLlm: false });
    const job = await call('POST', `/api/productions/${p.id}/render`, { mode: 'preview' });
    let j; for (let i = 0; i < 240; i++) { j = await call('GET', `/api/jobs/${job.id}`); if (['done', 'failed'].includes(j.status)) break; await new Promise(r => setTimeout(r, 500)); }
    assert.equal(j.status, 'done', j.error);
    const prod = await call('GET', `/api/productions/${p.id}`);
    assert.equal(prod.status, 'previewed');
    const r = prod.renders[0];
    assert.equal(r.w, 480); assert.equal(r.h, 270);
    const res = await fetch(`${base}/media/${p.id}/preview-16x9.mp4`, { headers: { Range: 'bytes=0-99' } });
    assert.equal(res.status, 206); assert.equal((await res.arrayBuffer()).byteLength, 100);
  } finally { srv.close(); }
});
