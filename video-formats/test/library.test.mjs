import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, DURATIONS } from '../../video-factory/src/config.mjs';
import { loadContext } from '../src/datasets.mjs';
import { loadFormats, availability, generate, toRequest, FAMILIES } from '../src/engine.mjs';
import { templateScript } from '../../video-factory/src/script/generator.mjs';
import { buildTimeline, buildCues } from '../../video-factory/src/subtitles/timeline.mjs';
import { buildPage } from '../../video-factory/src/templates/page.mjs';
import { percentile } from '../src/stats.mjs';

// These tests run on the repository's real data/ (it changes nightly), so they check invariants
// and recompute expected values from the data instead of hard-coding numbers.

const REPO_DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const ctx = loadContext(REPO_DATA, { season: 'E2026' });
const settings = { enabled: {}, defaults: {} };
const KINDS = new Set(['title', 'board', 'compare', 'radar', 'big', 'bars', 'statement', 'question', 'clues', 'court', 'split', 'outro']);
const F = await loadFormats();

test('registry: 30 formats, unique, complete specs, 5 families', () => {
  assert.equal(F.length, 30);
  assert.deepEqual(F.map(f => f.number), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.equal(new Set(F.map(f => f.id)).size, 30);
  assert.deepEqual(new Set(F.map(f => f.family)), new Set(Object.keys(FAMILIES)));
  for (const f of F) for (const k of ['description', 'concept', 'audience', 'example', 'frequency', 'visual']) assert.ok(String(f[k]).length > 5, `${f.id}.${k}`);
  const functional = F.filter(f => f.functional);
  assert.ok(functional.length >= 10, `${functional.length} functional`);
  assert.ok(new Set(functional.map(f => f.family)).size >= 3);
});

test('availability: never pretends; missing data is named', () => {
  for (const f of F) {
    const a = availability(ctx, f, settings);
    assert.ok(['available', 'planned', 'missing-data', 'insufficient', 'disabled'].includes(a.status), f.id);
    if (a.status === 'missing-data') assert.ok(a.missing.length && a.missing.every(m => m.detail), f.id);
  }
  assert.equal(availability(ctx, F.find(f => f.id === 'basketball-world-ranking'), settings).status, 'missing-data');
  // remove shot data → shot formats become unavailable with the reason
  const noShots = { ...ctx, datasets: { ...ctx.datasets, shots: { ...ctx.datasets.shots, available: false, note: 'no shot files' } } };
  for (const id of ['shot-diet', 'clutch-report']) {
    const a = availability(noShots, F.find(f => f.id === id), settings);
    assert.equal(a.status, 'missing-data'); assert.match(a.missing[0].detail, /no shot files/);
  }
  assert.equal(availability(ctx, F.find(f => f.id === 'guess-the-player'), settings, { lang: 'el' }).status, 'missing-data');
  assert.equal(availability(ctx, F.find(f => f.id === 'guess-the-player'), { enabled: { 'guess-the-player': false } }).status, 'disabled');
});

test('every functional format yields valid, renderable Video Factory requests', async () => {
  let n = 0;
  for (const spec of F.filter(f => f.functional)) {
    const r = await generate(ctx, spec, {}, settings);
    if (r.availability.status !== 'available') { assert.ok(r.availability.reason, `${spec.id} gives a reason`); continue; }
    assert.ok(r.requests.length >= 1, spec.id);
    for (const q of r.requests) {
      assert.equal(q.type, 'format'); assert.equal(q.format, spec.id);
      const ids = new Set(q.plan.map(s => s.id));
      assert.ok(q.plan.every(s => KINDS.has(s.kind)), `${spec.id} scene kinds`);
      assert.ok(q.meta.question, `${spec.id} has an audience question`);
      for (const preset of Object.keys(DURATIONS)) {
        const sc = templateScript(q, { preset });
        assert.ok(sc.factCheck.ok, `${q.id} ${preset}: ${sc.factCheck.unsupported}`);
        assert.ok(sc.segments.every(s => ids.has(s.scene)), `${q.id} scenes`);
        for (const role of ['hook', 'evidence', 'conclusion', 'question']) assert.ok(sc.segments.some(s => s.role === role), `${q.id} ${preset} ${role}`);
      }
      const sc = templateScript(q, { preset: spec.durations.recommended });
      const tl = buildTimeline(sc, { segments: sc.segments.map(s => ({ id: s.id, secs: 2 })) });
      const html = buildPage({ story: q, timeline: tl, cues: buildCues(tl) });
      assert.match(html, /window\.setT/); assert.match(html, /\$\$\(/, 'kit runtime intact');
      n++;
    }
  }
  assert.ok(n >= 15, `${n} requests`);
});

test('request content matches the data it came from', async () => {
  const g = async id => (await generate(ctx, F.find(f => f.id === id), {}, settings)).requests;
  const [ndl] = await g('numbers-dont-lie');
  if (ndl) assert.equal(ndl.data.leader.value, ctx.model.byCode.get(ndl.data.leader.code).season[ndl.data.metric]);
  const [home] = await g('home-court-myth');
  if (home) assert.equal(home.data.pct, Math.round(100 * ctx.played.filter(x => x[4] > x[5]).length / ctx.played.length));
  for (const tm of await g('basketball-time-machine')) {
    const fin = ctx.hist()[`E${tm.data.seasonYears[0]}`].final;
    assert.equal(tm.data.champion.code, fin[2] > fin[5] ? fin[0] : fin[3]);
  }
  const [show] = await g('basketball-daily-show');
  if (show) for (const row of show.data.rows) assert.ok(ctx.played.some(x => x[0] === show.data.round && x[2] === row.h && x[3] === row.a && x[4] === row.hs));
  const [twin] = await g('statistical-twin');
  if (twin) { assert.notEqual(twin.data.a.team, twin.data.b.team); assert.ok(twin.data.similarity >= 90); }
  assert.equal(percentile([1, 2, 3, 4], 4), 88);
});

test('validation rejects a candidate with an invented number', () => {
  const spec = { id: 'x', name: 'X', version: 1, family: 'statistical', durations: { recommended: 'short' }, narration: { style: 'analyst', notes: '' } };
  const cand = { key: 'k', title: 'T', data: { v: 12.5 }, plan: [{ id: 's', kind: 'statement', text: 'x' }], question: 'Q?',
    beats: [{ id: 'h', scene: 'intro', role: 'hook', text: 'Hook.' }, { id: 'e', scene: 's', role: 'evidence', text: 'He averages 12.5 and 99.1.' }, { id: 'c', scene: 's', role: 'conclusion', text: 'Done.' }] };
  const { problems } = toRequest(spec, cand, ctx);
  assert.ok(problems.some(p => /99\.1/.test(p)));
  const bad = { ...cand, beats: cand.beats.filter(b => b.role !== 'evidence') };
  assert.ok(toRequest(spec, bad, ctx).problems.some(p => /missing roles: evidence/.test(p)));
});

test('a new format is added by dropping in a file (no engine changes)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-'));
  fs.writeFileSync(path.join(dir, 'z.mjs'), `export default {
    id: 'tallest-team', number: 31, name: 'Tallest Team', family: 'special', description: 'd', concept: 'c', audience: 'a',
    durations: { recommended: 'short', supported: ['short'] }, aspects: ['9x16'], requires: [{ dataset: 'bio', why: 'heights' }],
    validation: ['v'], scriptStructure: ['hook'], visual: 'kit: big', narration: { style: 'analyst', notes: '' }, frequency: 'once', example: 'e',
    candidates(ctx) { const h = ctx.cache.players.filter(p => p.h).sort((a, b) => b.h - a.h)[0];
      return [{ key: 'k', title: 'Tallest', data: { h: h.h }, question: 'Taller?', plan: [{ id: 'b', kind: 'big', value: h.h, label: 'cm' }],
        beats: [{ id: 'h', scene: 'intro', role: 'hook', text: 'Tall.' }, { id: 'e', scene: 'b', role: 'evidence', text: 'He is ' + h.h + ' centimetres.' }, { id: 'c', scene: 'b', role: 'conclusion', text: 'Tall indeed.' }] }]; } };`);
  const list = await loadFormats(dir);
  assert.equal(list.length, 1);
  const r = await generate(ctx, list[0], {}, settings);
  assert.equal(r.requests.length, 1, JSON.stringify(r.rejected));
});

test('customisation: theme, duration fit, counts are honoured', async () => {
  const spec = F.find(f => f.id === 'numbers-dont-lie');
  const r = await generate(ctx, spec, { theme: 'ocean', count: 4 }, settings);
  if (!r.requests.length) return;
  assert.equal(r.requests[0].theme, 'ocean');
  assert.equal(r.requests[0].data.rows.length, 4);
  const q = r.requests[0];
  assert.ok(q.estSecs.short <= q.estSecs.medium);
  const html = buildPage({ story: q, timeline: buildTimeline(templateScript(q, { preset: 'short' }), { segments: templateScript(q, { preset: 'short' }).segments.map(s => ({ id: s.id, secs: 1 })) }), cues: [] });
  assert.match(html, /--acc:#2f80ed/);
});
