import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../video-factory/src/config.mjs';
import { loadContext } from '../src/datasets.mjs';
import { loadFormats, generate } from '../src/engine.mjs';
import { scoreRequest, WEIGHTS } from '../src/scoring.mjs';
import { buildCalendar, addPlanEntry, loadPlan } from '../src/calendar.mjs';
import { performanceByFormat, MIN_SAMPLE } from '../src/analytics.mjs';
import { createServer } from '../../video-factory/dashboard/server.mjs';
import formatsPlugin from '../dashboard/plugin.mjs';
import { StoryStore } from '../../video-factory/src/stories/store.mjs';

const REPO_DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const ctx = loadContext(REPO_DATA, { season: 'E2026' });
const F = await loadFormats();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vl-'));

test('opportunity score: transparent components; originality drops after a recent similar video', async () => {
  const spec = F.find(f => f.id === 'statistical-twin');
  const [q] = (await generate(ctx, spec, {}, { enabled: {} })).requests;
  if (!q) return;
  const a = scoreRequest(q, spec, ctx);
  assert.ok(a.score >= 0 && a.score <= 100);
  assert.deepEqual(Object.keys(a.components).sort(), Object.keys(WEIGHTS).sort());
  assert.match(a.note, /not a guarantee/);
  const b = scoreRequest(q, spec, ctx, { history: [{ format: spec.id, createdAt: new Date().toISOString(), entities: q.entities }] });
  assert.ok(b.components.originality < a.components.originality && b.score < a.score);
  const good = scoreRequest(q, spec, ctx, { perf: { [spec.id]: { published: 5, relative: 1.8 } } });
  assert.ok(good.components.pastPerformance > a.components.pastPerformance);
  const thin = scoreRequest(q, spec, ctx, { perf: { [spec.id]: { published: 1, relative: 3 } } });
  assert.equal(thin.components.pastPerformance, 0.5, 'needs a minimum sample');
});

test('calendar: game days, morning after, cool-downs, manual entries; recommendations only', async () => {
  const fx = ctx.fixtures().filter(x => x.comp === 'E');
  const gameDay = new Date(fx[0].t).toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
  const plan = path.join(tmp(), 'cal.json');
  addPlanEntry({ date: gameDay, formatId: 'guess-the-player', note: 'derby special' }, plan);
  assert.throws(() => addPlanEntry({ date: 'tomorrow', formatId: 'x' }, plan));
  const c = await buildCalendar(ctx, F, { days: 21, start: new Date(`${gameDay}T09:00:00Z`), planFile: plan, settings: { enabled: {} } });
  const d0 = c.days[0];
  assert.ok(d0.gameDay); assert.ok(d0.slots.some(s => s.formatId === 'matchup-lab'));
  assert.ok(d0.slots.some(s => s.manual && s.reason === 'derby special'));
  const after = c.days.find((d, i) => i > 0 && c.days[i - 1].gameDay && !d.gameDay);
  if (after) assert.ok(after.slots.some(s => s.formatId === 'basketball-daily-show'));
  const seen = {};
  for (const [i, d] of c.days.entries()) for (const s of d.slots.filter(x => !x.manual)) {
    if (!['basketball-daily-show', 'matchup-lab', 'who-would-you-pick'].includes(s.formatId) && seen[s.formatId] != null) assert.ok(i - seen[s.formatId] >= 6, `${s.formatId} repeated after ${i - seen[s.formatId]} days`);
    seen[s.formatId] = i;
  }
  assert.match(c.note, /Recommendations only/);
  assert.equal(loadPlan(plan).entries.length, 1);
});

test('performance by format: engagement, minimum sample, recommendation', () => {
  const dir = tmp();
  const mk = (i, format, views, likes, published = true) => {
    fs.mkdirSync(path.join(dir, `p${i}`));
    fs.writeFileSync(path.join(dir, `p${i}`, 'production.json'), JSON.stringify({ id: `p${i}`, format, story: { format }, createdAt: new Date().toISOString(), publication: { publishedTo: published ? [{ platform: 'tiktok' }] : [] }, performance: { tiktok: { views, likes, comments: 1, shares: 1, avgWatchSecs: 10, completionRate: 40, siteSessions: 3, registrations: 1 } } }));
  };
  let i = 0;
  for (let k = 0; k < 3; k++) mk(i++, 'guess-the-player', 1000, 200);
  for (let k = 0; k < 3; k++) mk(i++, 'team-dna', 1000, 20);
  for (let k = 0; k < 3; k++) mk(i++, 'shot-diet', 1000, 60);
  mk(i++, 'stat-paradox', 500, 50);
  const r = performanceByFormat(dir, F);
  const g = r.formats.find(x => x.format === 'guess-the-player'), t = r.formats.find(x => x.format === 'team-dna'), s = r.formats.find(x => x.format === 'stat-paradox');
  assert.equal(g.views, 3000); assert.equal(g.engagementRate, 20.2); assert.equal(g.registrations, 3);
  assert.match(g.recommendation, /invest more/); assert.match(t.recommendation, /rethink|reduce/);
  assert.match(s.recommendation, new RegExp(`not enough data \\(1/${MIN_SAMPLE}`));
  assert.match(r.note, /does not guarantee/);
});

test('admin API (plugin in the Video Factory dashboard): browse, disable, generate, approve, calendar', async () => {
  const d = tmp();
  const cfg = loadConfig({ dataDir: REPO_DATA, storiesDir: path.join(d, 'stories'), productionsDir: path.join(d, 'prod'), outDir: path.join(d, 'out'), cacheDir: path.join(d, 'cache') });
  const srv = createServer(cfg, { password: '', plugins: [formatsPlugin], formatSettingsFile: path.join(d, 'settings.json'), calendarFile: path.join(d, 'cal.json'), formatContext: ctx });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b && JSON.stringify(b) }); return { s: r.status, j: await r.json().catch(() => null) }; };
  try {
    const list = await call('GET', '/api/formats');
    assert.equal(list.j.formats.length, 30);
    assert.ok(!('candidates' in list.j.formats[0]));
    await call('PUT', '/api/formats/guess-the-player/settings', { enabled: false, defaults: { theme: 'gold', preset: 'short', count: '2', junk: 'x' } });
    const again = (await call('GET', '/api/formats')).j.formats.find(f => f.id === 'guess-the-player');
    assert.equal(again.availability.status, 'disabled'); assert.deepEqual(again.settings, { preset: 'short', theme: 'gold', count: 2 });
    assert.equal((await call('POST', '/api/formats/guess-the-player/generate', {})).j.items.length, 0, 'disabled formats generate nothing');
    const g = await call('POST', '/api/formats/home-court-myth/generate', {});
    assert.equal(g.s, 200);
    if (g.j.items.length) {
      assert.ok(g.j.items[0].score.score > 0);
      const acc = await call('POST', `/api/formats/requests/${encodeURIComponent(g.j.items[0].id)}/accept`, {});
      assert.equal(acc.j.status, 'approved');
      assert.equal(new StoryStore(cfg.storiesDir).get(acc.j.story).format, 'home-court-myth');
    }
    const cal = await call('GET', '/api/calendar?days=7');
    assert.equal(cal.j.days.length, 7);
    const add = await call('POST', '/api/calendar', { date: cal.j.days[1].date, formatId: 'team-dna', note: 'x' });
    assert.equal(add.s, 201);
    assert.equal((await call('POST', '/api/calendar', { date: cal.j.days[1].date, formatId: 'nope' })).s, 400);
    assert.equal((await call('DELETE', `/api/calendar/${add.j.entries[0].id}`, {})).j.entries.length, 0);
    assert.match(await (await fetch(base + '/formats')).text(), /FORMAT <i>LIBRARY/);
    assert.ok((await call('GET', '/api/meta')).j.plugins.includes('/formats'));
  } finally { srv.close(); }
});
