// Σύγκριση ομάδων/παικτών: κατάλογος metrics, splits ομάδων, μόνιμα URLs (κανονική σειρά), validation επιλογών.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAM_METRICS, TEAM_KEYS, PLAYER_METRICS, formatMetric, bestValue, isLowerBetter, LOWER_PLAYER } from '../src/compare/catalog.mjs';
import { teamSplitMetrics, teamSplits } from '../src/compare/teams.mjs';
import { canonicalOrder, pairSlug, parsePairSlug, sanitizeIds } from '../src/compare/pairs.mjs';
import { percentileRank, LOWER_BETTER, playerMetrics, R } from '../src/compare/metrics.mjs';
import { SK } from '../src/analytics/metrics.mjs';

test('κατάλογος: κάθε metric έχει μορφή, ακρίβεια, κατεύθυνση, κατηγορία', () => {
  for (const [k, m] of [...Object.entries(TEAM_METRICS), ...Object.entries(PLAYER_METRICS)]) {
    assert.ok(['pct', 'num', 'int', 'signed', 'ratio'].includes(m.format), k);
    assert.ok(Number.isInteger(m.precision), k);
    assert.ok(['higher', 'lower', 'none'].includes(m.direction), k);
    assert.ok(m.category, k);
    if (m.radar) assert.notEqual(m.direction, 'none', `${k}: radar χωρίς κατεύθυνση`);
  }
  for (const k of TEAM_KEYS) assert.ok(TEAM_METRICS[k], k);
});

test('μικρότερο = καλύτερο: DRtg, λάθη, πόντοι κατά, eFG% αντιπάλων (και ίδιο σύνολο με πριν για τους παίκτες)', () => {
  for (const k of ['drtg', 'tovpg', 'papg', 'oefg']) assert.equal(isLowerBetter(k, 'team'), true, k);
  for (const k of ['ortg', 'net', 'wpct', 'p3']) assert.equal(isLowerBetter(k, 'team'), false, k);
  assert.deepEqual([...LOWER_BETTER].sort(), ['drtg', 'pf', 'pf36', 'tov', 'tov100', 'tov36', 'tovp']);
  assert.equal(LOWER_BETTER, LOWER_PLAYER);
});

test('καλύτερη τιμή: σωστή κατεύθυνση, καμία για ρυθμό/λεπτά, καμία όταν όλες ίσες ή λείπουν', () => {
  assert.equal(bestValue('ortg', [110, 118, 104], 'team'), 118);
  assert.equal(bestValue('drtg', [110, 118, 104], 'team'), 104);
  assert.equal(bestValue('tov', [2.1, 1.4], 'player'), 1.4);
  assert.equal(bestValue('pace', [70, 75], 'team'), null);
  assert.equal(bestValue('mpg', [20, 30], 'player'), null);
  assert.equal(bestValue('ortg', [110, 110], 'team'), null);
  assert.equal(bestValue('ortg', [110, null], 'team'), null);
});

test('μορφοποίηση: ποσοστά, πρόσημο, ακέραιοι, ελλιπείς τιμές', () => {
  assert.equal(formatMetric('p3', 0.3512, 'team'), '35.1%');
  assert.equal(formatMetric('net', 7.42, 'team'), '+7.4');
  assert.equal(formatMetric('net', -2.4, 'team'), '−2.4');
  assert.equal(formatMetric('gp', 10, 'team'), '10');
  assert.equal(formatMetric('net', -0.01, 'team'), '0.0');
  assert.equal(formatMetric('astto', 1.4254, 'team'), '1.43');
  assert.equal(formatMetric('ortg', null, 'team'), '–');
  assert.equal(formatMetric('ortg', NaN, 'team'), '–');
});

test('percentiles: αντιστροφή όπου μικρότερο είναι καλύτερο, null για ελλιπή', () => {
  const xs = [100, 105, 110, 115, 120];
  assert.equal(percentileRank(xs, 100, true), 100);
  assert.equal(percentileRank(xs, 120, true), 0);
  assert.equal(percentileRank(xs, 120, false), 100);
  assert.equal(percentileRank([null, 110], 110), null);
  assert.equal(percentileRank(xs, null), null);
});

// συνθετικός αγώνας ομάδας στη σειρά του SK
const box = o => SK.map(k => o[k] || 0);
const game = (home, pf, pa, r, own = {}, opp = {}) => ({ home, pf, pa, r, secs: 2400, own: box({ pts: pf, fgm2: 20, fga2: 40, fgm3: 8, fga3: 24, ftm: 15, fta: 20, oreb: 10, dreb: 25, tov: 12, ast: 18, stl: 7, blk: 3, ...own }), opp: box({ pts: pa, fgm2: 18, fga2: 40, fgm3: 9, fga3: 26, ftm: 12, fta: 16, oreb: 9, dreb: 24, tov: 13, ...opp }) });

test('splits ομάδας: εντός/εκτός/τελευταίοι 5/10 και μέσοι όροι ανά αγώνα', () => {
  const gs = [];
  for (let i = 1; i <= 12; i++) gs.push(game(i % 2 === 1, 80 + i, 78, i));
  const S = teamSplits(gs, g => 90 + g.r);
  assert.equal(S.all.gp, 12); assert.equal(S.home.gp, 6); assert.equal(S.away.gp, 6); assert.equal(S.l5.gp, 5); assert.equal(S.l10.gp, 10);
  assert.equal(S.l5.pfpg, (88 + 89 + 90 + 91 + 92) / 5);
  assert.equal(S.all.w, 12); assert.equal(S.all.wpct, 1);
  assert.equal(S.all.rpg, 35); assert.equal(S.all.apg, 18); assert.equal(S.all.tovpg, 12);
  assert.equal(S.all.p2, 0.5); assert.equal(S.all.p3, 8 / 24); assert.equal(S.all.ft, 0.75); assert.equal(S.all.astto, 1.5);
  assert.ok(Math.abs(S.all.diff - (S.all.pfpg - S.all.papg)) < 1e-9);
  assert.ok(S.all.ortg > 0 && S.all.drtg > 0 && Math.abs(S.all.net - (S.all.ortg - S.all.drtg)) < 1e-9);
  assert.equal(S.l5.pir, (98 + 99 + 100 + 101 + 102) / 5);
});

test('splits ομάδας: PIR μόνο αν υπάρχει για όλους τους αγώνες, κενό split → null, χωρίς βολές → null FT%', () => {
  const gs = [game(true, 80, 70, 1), game(false, 75, 79, 2, { fta: 0, ftm: 0 })];
  assert.equal(teamSplitMetrics(gs, g => (g.r === 1 ? 90 : null)).pir, null);
  assert.equal(teamSplitMetrics(gs).pir, null);
  assert.equal(teamSplitMetrics([]), null);
  assert.equal(teamSplitMetrics([gs[1]]).ft, null);
  assert.equal(teamSplitMetrics(gs).w, 1); assert.equal(teamSplitMetrics(gs).l, 1);
});

test('AST/TO παίκτη και 2P%', () => {
  const row = o => { const r = new Array(26).fill(0); r[R.sec] = 1800; for (const [k, v] of Object.entries(o)) r[R[k]] = v; return r; };
  const m = playerMetrics([row({ ast: 6, tov: 2, m2: 4, a2: 8 }), row({ ast: 2, tov: 2, m2: 1, a2: 2 })], null, 2);
  assert.equal(m.astto, 2); assert.equal(m.p2, 0.5);
  assert.equal(playerMetrics([row({ ast: 3 })], null, 1).astto, null);
});

test('μόνιμα URLs: κανονική σειρά, ίδια σελίδα για Α-Β και Β-Α, όριο 2-4', () => {
  assert.deepEqual(canonicalOrder(['panathinaikos', 'olympiakos']), ['olympiakos', 'panathinaikos']);
  assert.equal(pairSlug(['panathinaikos', 'olympiakos']), 'olympiakos-vs-panathinaikos');
  assert.equal(pairSlug(['olympiakos', 'panathinaikos']), pairSlug(['panathinaikos', 'olympiakos']));
  assert.equal(pairSlug(['olympiakos']), null);
  assert.equal(pairSlug(['olympiakos', 'olympiakos']), null);
  assert.equal(pairSlug(['a', 'b', 'c', 'd', 'e']), null);
});

test('μόνιμα URLs: ανάλυση με validation (άγνωστα, διπλά, λάθος σειρά)', () => {
  const ok = new Set(['olympiakos', 'panathinaikos', 'real-madrid']);
  assert.deepEqual(parsePairSlug('olympiakos-vs-panathinaikos', ok), { parts: ['olympiakos', 'panathinaikos'], canonical: 'olympiakos-vs-panathinaikos', isCanonical: true });
  assert.equal(parsePairSlug('panathinaikos-vs-olympiakos', ok).isCanonical, false);
  assert.equal(parsePairSlug('olympiakos-vs-hacker', ok), null);
  assert.equal(parsePairSlug('olympiakos-vs-olympiakos', ok), null);
  assert.equal(parsePairSlug('olympiakos', ok), null);
  assert.equal(parsePairSlug('<script>-vs-olympiakos', ok), null);
});

test('επιλογές από το URL: μόνο γνωστά, χωρίς διπλά, έως 4', () => {
  const known = id => ['A', 'B', 'C', 'D', 'E'].includes(id);
  assert.deepEqual(sanitizeIds('A,B,A,X,C', known), ['A', 'B', 'C']);
  assert.deepEqual(sanitizeIds('A,B,C,D,E', known), ['A', 'B', 'C', 'D']);
  assert.deepEqual(sanitizeIds('', known), []);
  assert.deepEqual(sanitizeIds(null, known), []);
  assert.deepEqual(sanitizeIds(' A , B ', known, 2), ['A', 'B']);
});
