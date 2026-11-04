import test from 'node:test';
import assert from 'node:assert/strict';
import { capPoints, riskScore, captainValue, adviseCaptain, differentialScore } from '../src/fantasy/captain.mjs';
import { simulate, applyOverride, saveScenario, compareScenarios, delta, MAX_SCEN } from '../src/fantasy/whatif.mjs';
import { valuePerCredit, percentileRanks, valueBoard, signalOf, gradeOf } from '../src/fantasy/value.mjs';

const mk = (c, pos, t, price, pp, day = 0, x = {}) => ({ c, pos, t, price, pp, pp0: pp, p10: pp * 0.5, p50: pp, p90: pp * 1.5, pm: 25, pm0: 25, m3: 25, m10: 25, mcv: 0.1, hneg: 0, gp: 8, conf: 70, start: 1, day, pwin: 0.5, status: 'playing', l3: pp, l10: pp, ph: [[1, 10], [2, 10], [3, 10], [4, 10]], nx: [[1, 'A', 1, pp, 3, 0], [2, 'B', 0, pp, 3, 0], [3, 'C', 1, pp, 3, 0]], p3: pp * 3, ...x });
const R = [mk('g1', 'Guard', 'AAA', 10, 12, 0), mk('g2', 'Guard', 'AAA', 9, 10, 1), mk('g3', 'Guard', 'BBB', 8, 8, 0), mk('g4', 'Guard', 'BBB', 6, 5, 2),
  mk('f1', 'Forward', 'CCC', 12, 14, 1), mk('f2', 'Forward', 'CCC', 10, 11, 0), mk('f3', 'Forward', 'DDD', 8, 7, 2), mk('f4', 'Forward', 'DDD', 6, 4, 1),
  mk('c1', 'Center', 'EEE', 11, 13, 2), mk('c2', 'Center', 'EEE', 7, 6, 0)];
const coaches = [{ t: 'AAA', price: 6, exp: 5, p10: -5, p50: 10, p90: 20, pwin: 0.6, day: 0 }];
const lineup = { start: ['g1', 'g2', 'f1', 'f2', 'c1'], sixth: 'g3', bench: ['g4', 'f3', 'f4', 'c2'], captain: 'f1', coach: 'AAA', formation: '2-2-1' };

test('captain projected points: ×2 και +10% σε νίκη σταθμισμένο', () => {
  const c = capPoints(mk('x', 'Guard', 'A', 10, 20, 0, { pwin: 0.5 }));
  assert.equal(c.exp, 42); assert.equal(c.floor, 21); assert.equal(c.ceiling, 63);
});
test('captain risk score', () => {
  assert.equal(riskScore(mk('x', 'Guard', 'A', 10, 20, 0, { status: 'injured' })).score, 100);
  const a = riskScore(mk('x', 'Guard', 'A', 10, 20)).score, b = riskScore(mk('x', 'Guard', 'A', 10, 20, 0, { status: 'doubtful' })).score;
  assert.ok(b - a >= 40);
  assert.ok(riskScore(mk('x', 'Guard', 'A', 10, 20, 0, { gp: 2 })).score > a);
  assert.ok(captainValue(40, 0) > captainValue(40, 50));
  assert.ok(differentialScore({ p50: 10, p90: 20 }) > differentialScore({ p50: 10, p90: 12 }));
});
test('captain advisor: 3 προτάσεις, έλεγχος «έχει παίξει», swap', () => {
  const a = adviseCaptain(lineup, R, 1);
  assert.equal(a.rows.find(r => r.c === 'g1').warn, 'played');
  assert.ok(![a.best.c, a.safest.c, a.ceiling.c].includes('g1'));
  assert.equal(a.best.c, 'f1');
  const b = adviseCaptain({ ...lineup, captain: 'g2' }, R, 0);
  assert.ok(b.compare.vsBest > 0);
  assert.equal(b.swap.to, 'c1');   // ο c1 παίζει αργότερα (μέρα 2)
  const inj = R.map(p => (p.c === 'f1' ? { ...p, status: 'injured', pp: 0, p10: 0, p50: 0, p90: 0 } : p));
  assert.ok(adviseCaptain(lineup, inj, 0).warnings.some(w => w.k === 'out'));
});
test('what-if: επανυπολογισμός μετά από αλλαγές', () => {
  const base = simulate(lineup, R, coaches);
  assert.ok(base.floor < base.expected && base.expected < base.ceiling);
  assert.equal(base.cost, 93); assert.equal(base.budget, 7); assert.equal(base.warnings.length, 0);
  const capG4 = simulate({ ...lineup, captain: 'c1' }, R, coaches);
  assert.ok(capG4.expected < base.expected);
  const inj = simulate({ ...lineup, overrides: { f1: { status: 'injured' } } }, R, coaches);
  assert.ok(base.expected - inj.expected > 2 * 14);   // χάνει και την αρχηγία
  const mins = applyOverride(R[0], { min: 50 });
  assert.equal(mins.pp, 24);
  const trade = simulate({ ...lineup, trades: [{ out: 'g4', in: 'gx' }] }, [...R, mk('gx', 'Guard', 'FFF', 9, 15, 1)], coaches);
  assert.equal(trade.budget, 4); assert.ok(trade.expected > base.expected);
  assert.ok(simulate({ ...lineup, formation: '1-2-2' }, R, coaches).warnings.some(w => w.k === 'formation'));
  assert.ok(simulate({ ...lineup, captain: 'g4' }, R, coaches).warnings.some(w => w.k === 'captain_not_starter'));
  const d = delta(base, inj); assert.ok(d.expected < 0);
});
test('scenarios: έως 5 ανά γύρο και σύγκριση', () => {
  let list = []; const r = simulate(lineup, R, coaches);
  for (let i = 0; i < MAX_SCEN; i++) list = saveScenario(list, 10, 'S' + i, lineup, r).list;
  assert.equal(saveScenario(list, 10, 'S9', lineup, r).ok, false);
  assert.equal(saveScenario(list, 11, 'S9', lineup, r).ok, true);
  assert.equal(saveScenario(list, 10, 'S0', lineup, r).list.length, MAX_SCEN);
  const r2 = simulate({ ...lineup, captain: 'c1' }, R, coaches);
  const cmp = compareScenarios([{ name: 'A', result: r }, { name: 'B', result: r2 }]);
  assert.equal(cmp.best.expected, 0); assert.equal(cmp.norm[0].expected, 1); assert.equal(cmp.norm[1].expected, 0);
});
test('value per credit και positional percentile', () => {
  assert.equal(valuePerCredit(20, 10), 2); assert.equal(valuePerCredit(5, 0), 0);
  assert.deepEqual(percentileRanks([{ v: 1 }, { v: 2 }, { v: 3 }], x => x.v), [0, 50, 100]);
  const vb = valueBoard([mk('g', 'Guard', 'A', 10, 20), mk('g2', 'Guard', 'A', 10, 10), mk('c', 'Center', 'B', 10, 12), mk('c2', 'Center', 'B', 10, 6)]);
  // ο καλύτερος σέντερ έχει 100ό εκατοστημόριο στη θέση του, ακόμα κι αν ο καλύτερος γκαρντ έχει περισσότερο PIR/credit
  assert.equal(vb.find(r => r.p.c === 'c').posPct, 100); assert.equal(vb.find(r => r.p.c === 'g').posPct, 100);
  assert.equal(vb.find(r => r.p.c === 'c').posRank, 1);
  assert.equal(gradeOf(96), 'A+'); assert.equal(gradeOf(10), 'D');
});
test('buy-low / sell-high / hold / avoid', () => {
  const dip = signalOf(mk('x', 'Guard', 'A', 8, 15, 0, { l3: 8, l10: 15, ph: [[1, 10], [2, 10], [3, 9], [4, 8]] }), 85);
  assert.equal(dip.sig, 'buy_low'); assert.ok(dip.score >= 25 && dip.score <= 100);
  const hi = signalOf(mk('x', 'Guard', 'A', 18, 10, 0, { m3: 15, m10: 25, ph: [[1, 15], [2, 16], [3, 17], [4, 18]], nx: [[1, 'A', 0, 10, 5, 0], [2, 'B', 0, 10, 5, 0], [3, 'C', 0, 10, 5, 0]] }), 20);
  assert.equal(hi.sig, 'sell_high'); assert.ok(hi.score <= -25 && hi.score >= -100);
  assert.equal(signalOf(mk('x', 'Guard', 'A', 6, 3, 0, { status: 'injured' }), 50).sig, 'avoid');
  assert.equal(signalOf(mk('x', 'Guard', 'A', 10, 10), 50).sig, 'hold');
  assert.equal(signalOf(mk('x', 'Guard', 'A', 10, 10, 0, { gp: 2 }), 50).confidence, 'low');
  assert.ok(dip.factors.length >= 1 && dip.factors.length <= 3);
});
