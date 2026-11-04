import test from 'node:test';
import assert from 'node:assert/strict';
import { per36, per100, percentileRank, percentilesFor, radarScores, similarPlayers, playerMetrics, teamTotals, splitRows, compareSentence, posGroup, R } from '../src/compare/metrics.mjs';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);
const row = (o = {}) => { const r = new Array(26).fill(0); r[R.sec] = 1800; r[R.date] = '2026-10-01'; for (const [k, v] of Object.entries(o)) r[R[k]] = v; return r; };

test('per 36 και per 100 κατοχές', () => {
  near(per36(18, 30), 21.6); assert.equal(per36(5, 0), null);
  near(per100(20, 80), 25); assert.equal(per100(5, 0), null);
});

test('percentile rank (και ανάποδα για λάθη)', () => {
  assert.equal(percentileRank([1, 2, 3, 4, 5], 5), 100);
  assert.equal(percentileRank([1, 2, 3, 4, 5], 1), 0);
  assert.equal(percentileRank([1, 2, 3, 4, 5], 3), 50);
  assert.equal(percentileRank([1, 2, 3, 4, 5], 1, true), 100);
  assert.equal(percentileRank([1], 1), null);
});

test('μετρικές παίκτη: TS%, eFG%, PIR/min, usage, availability', () => {
  const rows = [row({ round: 1, pts: 20, m2: 4, a2: 8, m3: 4, a3: 8, ftm: 0, fta: 0, tov: 2, pir: 18, ast: 3 }), row({ round: 2, pts: 10, m2: 5, a2: 10, tov: 0, pir: 12, ast: 1 }), row({ round: 3, sec: 0 })];
  const tt = () => ({ own: [12000, 30, 70, 20, 12, 10, 25, 0], opp: [12000, 28, 68, 18, 14, 9, 24, 0] });
  const m = playerMetrics(rows, tt, 4);
  assert.equal(m.G, 2); near(m.mpg, 30); near(m.pts, 15); near(m.pir36, 30 * 36 / 60); near(m.pirmin, 0.5);
  near(m.ts, 30 / (2 * 26)); near(m.efg, (13 + 2) / 26); near(m.avail, 0.5);
  // usage = (FGA + .44 FTA + TOV)·(Tm min/5) / (min · (Tm FGA + .44 Tm FTA + Tm TOV))
  near(m.usg, (26 + 2) * (400 / 5) / (60 * (140 + 0.44 * 40 + 24)));
});

test('σύνολα ομάδας από game logs', () => {
  const P = [{ t: 'AAA', g: [row({ round: 1, opp: 'BBB', a2: 10, m2: 5 })] }, { t: 'BBB', g: [row({ round: 1, opp: 'AAA', a2: 8, m2: 4 })] }];
  const T = teamTotals(P);
  assert.equal(T['AAA|1'].own[2], 10); assert.equal(T['AAA|1'].opp[2], 8);
});

test('radar: κανονικοποίηση 0-100', () => {
  const pool = [1, 2, 3, 4, 5].map(i => ({ id: 'p' + i, pos: 'Guard', m: { pts36: i, tsa36: i, usg: i, ast36: 6 - i, astp: 6 - i, ts: i, efg: i, pirmin: i } }));
  const pct = percentilesFor(pool, ['pts36', 'tsa36', 'usg', 'ast36', 'astp', 'ts', 'efg', 'pirmin']);
  const r = radarScores(pct.p5);
  assert.equal(r.scoring, 100); assert.equal(r.playmaking, 0); assert.equal(r.efficiency, 100);
  for (const v of Object.values(radarScores(pct.p3))) assert.ok(v == null || (v >= 0 && v <= 100));
  assert.equal(posGroup('Center'), 'C'); assert.equal(posGroup('Guard'), 'G');
});

test('παρόμοιοι παίκτες (cosine similarity)', () => {
  const pool = [
    { id: 'a', pos: 'Guard', m: { usg: 0.3, ts: 0.6, astp: 0.35 } }, { id: 'b', pos: 'Guard', m: { usg: 0.29, ts: 0.59, astp: 0.33 } },
    { id: 'c', pos: 'Center', m: { usg: 0.15, ts: 0.65, astp: 0.05 } }, { id: 'd', pos: 'Forward', m: { usg: 0.2, ts: 0.55, astp: 0.12 } },
  ];
  const s = similarPlayers(pool, 'a', 3, ['usg', 'ts', 'astp']);
  assert.equal(s[0].id, 'b'); assert.equal(s.length, 3); assert.ok(!s.some(x => x.id === 'a'));
});

test('splits και πρόταση σύγκρισης', () => {
  const rows = [row({ home: 1, ts: 80, os: 70, opp: 'X' }), row({ home: 0, ts: 60, os: 70, opp: 'Y', date: '2026-10-02' }), row({ home: 1, ts: 90, os: 70, opp: 'Z', date: '2026-10-09' })];
  assert.equal(splitRows(rows, 'home').length, 2); assert.equal(splitRows(rows, 'losses').length, 1);
  assert.equal(splitRows(rows, 'top4', { top4: ['X', 'Z'] }).length, 2); assert.equal(splitRows(rows, 'b2b').length, 1); assert.equal(splitRows(rows, 'l5').length, 3);
  const L = { pirmin: 'PIR/min', ts: 'TS%', usg: 'usage', ast36: 'ασίστ/36', _and: ' και ', _both: 'Ο {a} έχει καλύτερο {x}, ενώ ο {b} {y}.', _one: 'Ο {a} υπερέχει σε {x}.', _even: 'Ισορροπία.' };
  const s = compareSentence({ pirmin: 0.8, ts: 0.65, usg: 0.2, ast36: 3 }, { pirmin: 0.6, ts: 0.55, usg: 0.28, ast36: 7 }, ['Α', 'Β'], L, ['pirmin', 'ts', 'usg', 'ast36']);
  assert.ok(s.includes('Α') && s.includes('PIR/min') && s.includes('ασίστ/36'));
});
