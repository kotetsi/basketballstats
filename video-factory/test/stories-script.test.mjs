import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA, model, tmpCfg, fakeFetch } from './helpers.mjs';
import { COL, findPlayer } from '../src/data/model.mjs';
import { buildStory } from '../src/stories/builders.mjs';
import { StoryStore, requireApproved } from '../src/stories/store.mjs';
import { templateScript, estimateSecs, fitToDuration } from '../src/script/generator.mjs';
import { checkNumbers, allowedNumbers } from '../src/script/factGuard.mjs';
import { llmScript } from '../src/script/llm.mjs';
import { DURATIONS } from '../src/config.mjs';

test('model: season averages come from the raw box-score rows', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8')).players[0];
  const played = raw.g.filter(r => r[COL.seconds] > 0);
  const p = model().byCode.get(raw.c);
  assert.equal(p.season.pir, Math.round((played.reduce((s, r) => s + r[COL.pir], 0) / played.length) * 10) / 10);
  assert.equal(p.season.games, played.length);
  assert.equal(model().season, 'E2026');
  assert.equal(findPlayer(model(), 'Vezenkov')?.slug, 'sasha-vezenkov');
});

test('leaderboard: sorted, limited, minimum games, round scope uses that round', () => {
  const m = model();
  const s = buildStory(m, { type: 'leaderboard', params: { metric: 'pir', limit: 5 } });
  const v = s.data.items.map(i => i.value);
  assert.equal(v.length, 5);
  assert.deepEqual(v, [...v].sort((a, b) => b - a));
  assert.ok(s.data.items.every(i => i.games >= s.data.minGames));
  const r = buildStory(m, { type: 'leaderboard', params: { metric: 'pts', scope: 'round', round: m.lastRound } });
  for (const it of r.data.items) assert.equal(it.value, m.byCode.get(it.code).games.find(g => g.round === m.lastRound).pts);
  assert.match(s.title, /Season 2026-27/);
});

test('comparison and spotlight resolve real values; bad input is rejected', () => {
  const m = model();
  const c = buildStory(m, { type: 'comparison', params: { a: 'sasha-vezenkov', b: 'kendrick-nunn' } });
  assert.equal(c.data.players[0].pir, m.bySlug.get('sasha-vezenkov').season.pir);
  assert.ok(Object.values(c.data.players[0].radar).every(x => x >= 0 && x <= 100));
  const s = buildStory(m, { type: 'spotlight', params: { player: 'sasha-vezenkov', n: 6 } });
  assert.equal(s.data.games.length, 6);
  assert.equal(s.data.best.pir, Math.max(...m.bySlug.get('sasha-vezenkov').games.map(g => g.pir)));
  assert.throws(() => buildStory(m, { type: 'comparison', params: { a: 'sasha-vezenkov', b: 'sasha-vezenkov' } }), /different/);
  assert.throws(() => buildStory(m, { type: 'spotlight', params: { player: 'nobody-here' } }), /not found/);
  assert.throws(() => buildStory(m, { type: 'nope' }), /unknown story type/);
});

test('every template script, every player, every duration: only numbers from the data', () => {
  const m = model(), ps = m.players.filter(p => p.season);
  let n = 0;
  for (const preset of Object.keys(DURATIONS)) {
    for (const st of [
      buildStory(m, { type: 'leaderboard', params: { metric: 'pir', limit: 10 } }),
      buildStory(m, { type: 'leaderboard', params: { metric: 'ast', scope: 'round' } }),
      ...ps.map(p => buildStory(m, { type: 'spotlight', params: { player: p.slug } })),
      ...ps.slice(1).map((p, i) => buildStory(m, { type: 'comparison', params: { a: ps[i].slug, b: p.slug } })),
    ]) {
      const sc = templateScript(st, { preset });
      assert.ok(sc.factCheck.ok, `${st.id} ${preset}: ${sc.factCheck.unsupported}`);
      assert.equal(sc.segments[0].id, 'intro'); assert.equal(sc.segments.at(-1).id, 'outro');
      assert.match(sc.segments.at(-1).say, /dot E U/);
      n++;
    }
  }
  assert.ok(n > 200, `${n} scripts`);
});

test('durations: short scripts are shorter, scripts fit their maximum', () => {
  const st = buildStory(model(), { type: 'leaderboard', params: { metric: 'pir', limit: 10 } });
  const short = templateScript(st, { preset: 'short' }), long = templateScript(st, { preset: 'long' });
  assert.ok(short.estSecs < long.estSecs);
  assert.ok(short.estSecs <= DURATIONS.short.max, `${short.estSecs}`);
  const segs = [{ id: 'a', text: 'word '.repeat(200), optional: true }, { id: 'b', text: 'two words' }];
  assert.deepEqual(fitToDuration(segs, 'short').map(s => s.id), ['b']);
  assert.ok(estimateSecs([{ text: 'one two three four five' }]) > 2);
});

test('fact guard flags invented numbers', () => {
  const allowed = allowedNumbers({ a: 23.9, list: [{ v: 15 }] });
  assert.ok(checkNumbers('He has 23.9 PIR and 15 points in 2026', allowed).ok);
  assert.deepEqual(checkNumbers('He averages 31.2 PIR', allowed).unsupported, ['31.2']);
  assert.ok(checkNumbers('More at basketballstats.eu', allowed).ok);
});

test('stories must be approved before production', () => {
  const cfg = tmpCfg(), S = new StoryStore(cfg.storiesDir);
  const s = S.save(buildStory(model(), { type: 'spotlight', params: { player: 'sasha-vezenkov' } }));
  assert.throws(() => requireApproved(S.get(s.id)), /not approved/);
  assert.equal(S.approve(s.id).status, 'approved');
  assert.throws(() => S.get('../etc/passwd'), /invalid id/);
});

test('AI script: accepted only with the same structure and only data numbers', async () => {
  const cfg = tmpCfg();
  const st = buildStory(model(), { type: 'spotlight', params: { player: 'sasha-vezenkov' } });
  const draft = templateScript(st, { preset: 'medium' });
  const reply = segs => fakeFetch([[/anthropic/, () => ({ body: { content: [{ type: 'text', text: JSON.stringify({ segments: segs }) }] } })]]);
  const good = draft.segments.map(s => ({ id: s.id, text: s.text.replace('in numbers', 'by the numbers') }));
  const ok = await llmScript(st, draft, cfg, { fetchImpl: reply(good), env: { ANTHROPIC_API_KEY: 'k' } });
  assert.match(ok.script.generator, /^llm:/);
  assert.match(ok.script.segments[0].text, /by the numbers/);
  assert.equal(ok.script.segments.at(-1).say, draft.segments.at(-1).say, 'outro keeps the spoken site name');
  const invented = draft.segments.map(s => ({ id: s.id, text: s.id === 'avg' ? 'He averages 99.9 PIR.' : s.text }));
  assert.match((await llmScript(st, draft, cfg, { fetchImpl: reply(invented), env: { ANTHROPIC_API_KEY: 'k' } })).rejected, /99\.9/);
  assert.match((await llmScript(st, draft, cfg, { fetchImpl: reply(good.slice(1)), env: { ANTHROPIC_API_KEY: 'k' } })).rejected, /structure/);
  assert.ok((await llmScript(st, draft, cfg, { env: {} })).skipped);
  const f = reply(good); await llmScript(st, draft, cfg, { fetchImpl: f, env: { ANTHROPIC_API_KEY: 'k' } });
  assert.equal(f.calls[0].body.model, cfg.llm.model);
});
