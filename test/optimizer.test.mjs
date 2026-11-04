import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, validate, objectiveOf, playerValue } from '../src/fantasy/solver.mjs';
import { planTurns, enumerateLineups } from '../src/fantasy/turns.mjs';
import { explain } from '../src/fantasy/explain.mjs';
import { coachPoints, playerPoints, FORMATIONS } from '../src/fantasy/rules.mjs';

// ψευδοτυχαίο αλλά σταθερό σύνολο παικτών
function league(seed = 3, nG = 14, nF = 14, nC = 8, teams = 8) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  const mk = (pos, i) => { const pp = Math.round(3 + r() * 20), price = Math.round((4 + pp * 0.7 + (r() - 0.5) * 4) * 10) / 10; return { c: pos[0] + i, pos, t: 'T' + Math.floor(r() * teams), price: Math.max(4, price), pp, pp0: pp, p10: pp * 0.45, p50: pp, p90: pp * 1.6, pwin: 0.3 + r() * 0.4, status: 'playing', opp: 'X', day: Math.floor(r() * 2), gp: 8, start: 0.8, nx: [[1, 'X', 1, pp, 3, 0]] }; };
  for (let i = 0; i < nG; i++) out.push(mk('Guard', i));
  for (let i = 0; i < nF; i++) out.push(mk('Forward', i));
  for (let i = 0; i < nC; i++) out.push(mk('Center', i));
  return out;
}
const coaches = [{ t: 'T0', price: 8, exp: 9, p10: -5, p50: 10, p90: 20, pwin: 0.7, day: 0, opp: 'X' }, { t: 'T1', price: 4, exp: 1, p10: -10, p50: 10, p90: 10, pwin: 0.4, day: 1, opp: 'X' }, { t: 'T2', price: 6, exp: 5, p10: -5, p50: 10, p90: 20, pwin: 0.55, day: 0, opp: 'X' }];

// brute force: όλες οι 10άδες × όλες οι τοποθετήσεις, για επαλήθευση του βέλτιστου
function brute(players, coaches, { budget = 100, maxPerTeam = 6, mode = 'expected' } = {}) {
  const by = { Guard: [], Forward: [], Center: [] }; for (const p of players) by[p.pos].push(p);
  const comb = (a, k) => { const o = []; const rec = (i, acc) => { if (acc.length === k) return o.push(acc.slice()); for (let j = i; j < a.length; j++) { acc.push(a[j]); rec(j + 1, acc); acc.pop(); } }; rec(0, []); return o; };
  const v = p => playerValue(p, mode);
  let best = -Infinity;
  const lineupBest = ro => { let b = -Infinity; for (const [, need] of Object.entries(FORMATIONS)) { const ps = ['Guard', 'Forward', 'Center'].map((x, i) => ro.filter(p => p.pos === x).sort((a, c) => v(c) - v(a))); const start = ps.flatMap((l, i) => l.slice(0, need[i])); const rest = ro.filter(p => !start.includes(p)).sort((a, c) => v(c) - v(a)); const sc = start.reduce((s, p) => s + v(p), 0) + Math.max(...start.map(v)) + v(rest[0]) + rest.slice(1).reduce((s, p) => s + 0.5 * v(p), 0); if (sc > b) b = sc; } return b; };
  for (const g of comb(by.Guard, 4)) for (const f of comb(by.Forward, 4)) for (const c of comb(by.Center, 2)) {
    const ro = [...g, ...f, ...c], cost = ro.reduce((s, p) => s + p.price, 0);
    const tc = {}; for (const p of ro) tc[p.t] = (tc[p.t] || 0) + 1; if (Object.values(tc).some(n => n > maxPerTeam)) continue;
    const lb = lineupBest(ro);
    for (const co of coaches) if (cost + co.price <= budget + 1e-9) best = Math.max(best, lb + co.exp);
  }
  return best;
}

test('scoring: αρχηγός = μία επιπλέον πλήρης φορά, πάγκος 0,5, μπόνους νίκης', () => {
  assert.equal(playerPoints(10, { slot: 'start' }), 10);
  assert.equal(playerPoints(10, { slot: 'start', captain: true }), 20);
  assert.equal(playerPoints(10, { slot: 'bench' }), 5);
  assert.equal(playerPoints(10, { slot: 'bench', captain: true }), 5);   // αρχηγός μόνο από πεντάδα
  assert.equal(playerPoints(10, { slot: 'start', captain: true, won: true }), 22);
  assert.equal(playerPoints(10, { slot: 'sixth', won: true }), 11);
  assert.deepEqual([coachPoints(5), coachPoints(15), coachPoints(25), coachPoints(-5), coachPoints(-15), coachPoints(-25), coachPoints(-3, true), coachPoints(2, true)], [10, 20, 25, -5, -10, -20, -5, 10]);
});
test('ακριβές βέλτιστο: ίδιο με brute force (πλήρες budget, χαμηλό budget, όριο ομάδας)', () => {
  const pl = league(5, 7, 7, 4, 4);
  const minCost = ['Guard', 'Forward', 'Center'].reduce((s, ps, i) => s + pl.filter(p => p.pos === ps).map(p => p.price).sort((a, b) => a - b).slice(0, [4, 4, 2][i]).reduce((a, b) => a + b, 0), 0) + 4;
  for (const o of [{ budget: Math.ceil(minCost + 25) }, { budget: Math.ceil(minCost + 3) }, { budget: Math.ceil(minCost + 25), maxPerTeam: 3 }]) {
    const r = solve(pl, coaches, { ...o, mode: 'expected' });
    assert.equal(r.status, 'optimal', JSON.stringify(o) + ' ' + JSON.stringify(r.errors));
    assert.deepEqual(validate(r, pl, coaches, o), []);
    assert.ok(Math.abs(r.objective - brute(pl, coaches, { ...o, mode: 'expected' })) < 0.02, `${r.objective} vs brute`);
    assert.ok(Math.abs(objectiveOf(r, pl, coaches, 'expected') - r.objective) < 0.02);
  }
});
test('locked και excluded παίκτες', () => {
  const pl = league();
  const free = solve(pl, coaches, { mode: 'expected' });
  const lockP = pl.filter(p => !free.roster.includes(p.c)).sort((a, b) => a.pp - b.pp)[0].c;
  const r = solve(pl, coaches, { mode: 'expected', lock: [lockP] });
  assert.ok(r.roster.includes(lockP)); assert.ok(r.objective <= free.objective + 1e-9); assert.deepEqual(validate(r, pl, coaches, { lock: [lockP] }), []);
  const ex = free.captain;
  const r2 = solve(pl, coaches, { mode: 'expected', exclude: [ex], sold: [free.roster[1]] });
  assert.ok(!r2.roster.includes(ex) && !r2.roster.includes(free.roster[1]));
});
test('τραυματίες δεν μπαίνουν σε ενεργή θέση· αμφίβολοι με penalty', () => {
  const pl = league().map((p, i) => (i < 3 ? { ...p, pp: 30, p50: 30, p90: 40, p10: 20, status: 'injured' } : p));
  const r = solve(pl, coaches, { mode: 'balanced', budget: 150 });
  assert.ok(!r.roster.some(c => pl.find(p => p.c === c).status === 'injured'));   // τραυματίες δεν προτείνονται καθόλου
  for (const c of [...r.start, r.sixth]) assert.notEqual(pl.find(p => p.c === c).status, 'injured');
  const d = { ...pl[5], status: 'doubtful' };
  assert.ok(playerValue(d, 'balanced') < playerValue(pl[5], 'balanced'));
  const locked = solve(pl, coaches, { mode: 'balanced', budget: 150, lock: [pl[0].c] });
  assert.ok(locked.bench.includes(pl[0].c));   // κλειδωμένος τραυματίας → μόνο πάγκος
});
test('κανένα feasible: καθαρό μήνυμα', () => {
  const pl = league();
  assert.equal(solve(pl, coaches, { budget: 30 }).status, 'infeasible');
  const r = solve(pl, coaches, { lock: pl.filter(p => p.pos === 'Center').slice(0, 3).map(p => p.c) });
  assert.equal(r.status, 'infeasible'); assert.equal(r.errors[0].k, 'lock_pos');
  assert.equal(solve(pl.filter(p => p.pos !== 'Center' || p.c === 'C0'), coaches, {}).errors[0].k, 'pool_pos');
});
test('validate πιάνει κάθε παραβίαση', () => {
  const pl = league(), r = solve(pl, coaches, {});
  assert.ok(validate({ ...r, captain: r.bench[0] }, pl, coaches).some(e => e.k === 'captain_slot'));
  assert.ok(validate({ ...r, bench: [r.bench[0], r.bench[0], r.bench[1], r.bench[2]] }, pl, coaches).some(e => e.k === 'dup'));
  assert.ok(validate(r, pl, coaches, { budget: r.cost - 1 }).some(e => e.k === 'budget'));
});
test('multi-turn: δεν ξαναμπαίνει όποιος έπαιξε, αρχηγός από πεντάδα, κέρδος από αλλαγές ≥ 0', () => {
  const pl = league(), r = solve(pl, coaches, { mode: 'balanced' });
  const pt = planTurns(r.roster, r.coach, pl, coaches, ['d0', 'd1'], { nSim: 200, topK: 40 });
  assert.ok(pt.lineup.start.includes(pt.lineup.captain));
  assert.equal(pt.turns.length, 2);
  assert.ok(pt.expected + 0.5 >= pt.staticExpected);
  for (const t of pt.turns) for (const s of t.subs) if (s.k === 'swap') assert.ok((pl.find(p => p.c === s.up).day) > t.turn);
});
test('γύρος με ένα turn: καμία αλλαγή, ίδιο με στατικό', () => {
  const pl = league().map(p => ({ ...p, day: 0 })), r = solve(pl, coaches, {});
  const pt = planTurns(r.roster, r.coach, pl, coaches, ['d0'], { nSim: 150, topK: 20 });
  assert.equal(pt.turns.length, 1); assert.equal(pt.turns[0].subs.length, 0);
  assert.ok(Math.abs(pt.gainFromTurns) < 0.5);
  assert.ok(enumerateLineups(r.roster, new Map(pl.map(p => [p.c, p]))).every(l => l.start.includes(l.captain)));
});
test('εξηγήσεις', () => {
  const pl = league(), r = solve(pl, coaches, {}), e = explain(r, pl, coaches, {});
  assert.equal(e.players.length, 10); assert.ok(e.players.every(x => x.reasons.length >= 0)); assert.ok(e.notSelected.length > 0);
});
