// node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStints, clock, flatten } from '../src/analytics/pbp-core.mjs';
import { possessions, rate, onOff, wowy, groupLineups, combos, zero, I, percentile, rank } from '../src/analytics/metrics.mjs';

const S = o => { const z = zero(); for (const [k, v] of Object.entries(o)) z[I[k]] = v; return z; };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);

test('possessions = FGA − OREB + TOV + 0.44·FTA', () => {
  // FGA = 40+25 = 65, OREB 10, TOV 12, FTA 20 → 65 − 10 + 12 + 8.8 = 75.8
  near(possessions(S({ fga2: 40, fga3: 25, oreb: 10, tov: 12, fta: 20 })), 75.8);
});

test('ORtg / DRtg / Net / Pace / Four Factors', () => {
  const own = S({ pts: 80, fgm2: 20, fga2: 40, fgm3: 10, fga3: 25, fta: 20, ftm: 10, oreb: 10, dreb: 25, tov: 12, ast: 18 });
  const opp = S({ pts: 70, fgm2: 20, fga2: 45, fgm3: 6, fga3: 20, fta: 15, ftm: 12, oreb: 8, dreb: 20, tov: 14 });
  const r = rate(own, opp, 2400);
  const pO = 65 - 10 + 12 + 8.8, pD = 65 - 8 + 14 + 6.6, poss = (pO + pD) / 2;
  near(r.poss, poss); near(r.ortg, 8000 / poss); near(r.drtg, 7000 / poss); near(r.net, r.ortg - r.drtg);
  near(r.pace, poss); // 40 λεπτά → pace = κατοχές
  near(r.efg, (30 + 5) / 65); near(r.tov, 12 / poss); near(r.oreb, 10 / (10 + 20)); near(r.ftr, 20 / 65);
  near(r.ts, 80 / (2 * (65 + 8.8)));
});

test('clock + flatten: χρόνος από την αρχή του αγώνα', () => {
  assert.equal(clock('07:43'), 463);
  const ev = flatten({ FirstQuarter: [{ PLAYTYPE: 'BP', MARKERTIME: '' }, { PLAYTYPE: '2FGM', MARKERTIME: '09:30' }], SecondQuarter: [{ PLAYTYPE: 'BP', MARKERTIME: '' }, { PLAYTYPE: 'TO', MARKERTIME: '10:00' }] });
  assert.deepEqual(ev.map(e => e.t), [0, 30, 600, 600]);
});

// Συνθετικός αγώνας: Α (a1..a6) εναντίον Β (b1..b5), 40 λεπτά
const E = (q, tm, pid, type, mt) => ({ PLAYTYPE: type, CODETEAM: tm, PLAYER_ID: pid, MARKERTIME: mt });
const A5 = ['a1', 'a2', 'a3', 'a4', 'a5'], B5 = ['b1', 'b2', 'b3', 'b4', 'b5'];
const game = {
  CodeTeamA: 'AAA', CodeTeamB: 'BBB',
  FirstQuarter: [E(1, '', '', 'BP', ''), E(1, 'AAA', 'a1', '2FGM', '09:00'), E(1, 'BBB', 'b1', '3FGM', '08:00'),
    E(1, 'AAA', 'a5', 'OUT', '05:00'), E(1, 'AAA', 'a6', 'IN', '05:00'), E(1, 'AAA', 'a6', '3FGM', '04:00')],
  SecondQuarter: [E(2, '', '', 'BP', '')], ThirdQuarter: [E(3, '', '', 'BP', '')],
  ForthQuarter: [E(4, '', '', 'BP', ''), E(4, 'AAA', 'a2', 'FTM', '02:00'), E(4, 'BBB', 'b2', 'TO', '01:00')],
};

test('stints: αλλαγές, χρόνος, πόντοι, clutch', () => {
  const r = buildStints(game, { AAA: A5, BBB: B5 });
  assert.equal(r.checks.scoreA, 6); assert.equal(r.checks.scoreB, 3);
  assert.equal(r.checks.stintPtsA, 6); assert.equal(r.checks.lostSecs, 0);
  const sa = r.stints.AAA, secs = sa.reduce((a, x) => a + x.s, 0);
  assert.equal(secs, 2400);
  const first = sa.find(x => x.p.includes('a5')), second = sa.filter(x => x.p.includes('a6'));
  assert.equal(first.s, 300); assert.equal(first.own[I.pts], 2); assert.equal(first.opp[I.pts], 3);
  // στα τελευταία 5' του 4ου με διαφορά ≤5 → clutch
  const cl = second.find(x => x.c === 1); assert.ok(cl); assert.equal(cl.s, 300); assert.equal(cl.own[I.pts], 1); assert.equal(cl.opp[I.tov], 1);
});

test('stints: αλλαγή ανάμεσα σε περιόδους που δεν καταγράφηκε', () => {
  // ο a5 παίζει στη 2η περίοδο χωρίς να έχει καταγραφεί ότι μπήκε· ο a6 δεν εμφανίζεται → βγήκε
  const g = { ...game, SecondQuarter: [E(2, '', '', 'BP', ''), ...['a1', 'a2', 'a3', 'a4', 'a5'].map(p => E(2, 'AAA', p, 'D', '09:00'))] };
  const r = buildStints(g, { AAA: A5, BBB: B5 });
  assert.equal(r.checks.lostEvents, 0);
});

const st = [
  { g: 1, p: ['a1', 'a2', 'a3', 'a4', 'a5'], s: 600, own: S({ pts: 20, fga2: 15, fgm2: 10 }), opp: S({ pts: 10, fga2: 15, fgm2: 5 }) },
  { g: 1, p: ['a1', 'a2', 'a3', 'a4', 'a6'], s: 600, own: S({ pts: 10, fga2: 15, fgm2: 5 }), opp: S({ pts: 16, fga2: 15, fgm2: 8 }) },
  { g: 1, p: ['a2', 'a3', 'a4', 'a5', 'a6'], s: 1200, own: S({ pts: 30, fga2: 30, fgm2: 15 }), opp: S({ pts: 30, fga2: 30, fgm2: 15 }) },
  { g: 2, p: ['a2', 'a3', 'a4', 'a5', 'a6'], s: 2400, own: S({ pts: 60, fga2: 60, fgm2: 30 }), opp: S({ pts: 60, fga2: 60, fgm2: 30 }) },
];

test('on/off: διαφορά και μόνο αγώνες που αγωνίστηκε', () => {
  const r = onOff(st, 'a1');
  near(r.on.poss, 30); near(r.on.net, (30 - 26) * 100 / 30);
  near(r.off.poss, 30); near(r.off.net, 0); // ο αγώνας 2 (απουσία) δεν μετρά
  near(r.diff.net, r.on.net - r.off.net);
});

test('WOWY: μαζί / χωρίς', () => {
  const w = wowy(st, 'a1', 'a5');
  near(w.together.poss, 15); near(w.aWithoutB.poss, 15);
  near(w.bWithoutA.poss, 90); assert.equal(w.neither.poss, 0);
});

test('lineup grouping 2/3/5', () => {
  assert.equal(combos(['a', 'b', 'c', 'd', 'e'], 2).length, 10);
  assert.equal(combos(['a', 'b', 'c', 'd', 'e'], 3).length, 10);
  const five = groupLineups(st, 5); assert.equal(five.length, 3);
  const big = five.find(x => x.k === 'a2-a3-a4-a5-a6'); assert.equal(big.games, 2); near(big.poss, 90);
  const pair = groupLineups(st, 2).find(x => x.k === 'a1-a2'); near(pair.poss, 30);
});

test('percentile / rank', () => {
  assert.equal(rank([1, 2, 3], 3), 1); assert.equal(rank([1, 2, 3], 1, false), 1);
  assert.equal(percentile([1, 2, 3], 3), 100); assert.equal(percentile([1, 2, 3], 1), 0);
});
