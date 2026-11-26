import test from 'node:test';
import assert from 'node:assert/strict';
import { implied, devig, edgePP, classify, tier, bestAndAverage, movement, clv, clvSummary, pirOverProb, internalLine, hitRate, minutesRisk, appendChanges, appendPropSnapshots, consensusProbability } from '../src/odds/core.mjs';
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);

test('implied probability', () => { near(implied(2), 0.5); near(implied(1.25), 0.8); assert.equal(implied(1), null); });
test('vig removal', () => {
  const d = devig([1.85, 1.95]);
  near(d.overround, 1 / 1.85 + 1 / 1.95 - 1); near(d.fair[0] + d.fair[1], 1); near(d.fair[0], (1 / 1.85) / (1 / 1.85 + 1 / 1.95));
  assert.equal(devig([1.9, null]), null);
});
test('model edge και κατηγορίες', () => {
  near(edgePP(0.58, 0.52), 6); assert.equal(classify(6), 'model'); assert.equal(classify(-3), 'market'); assert.equal(classify(1), 'neutral');
  assert.equal(tier(7, 'high', 30), 'high'); assert.equal(tier(1, 'medium', 30), 'low'); assert.equal(tier(4, 'medium', 400), 'low');
});
test('καλύτερη τιμή / μέσος όρος', () => {
  const r = bestAndAverage([{ book: 'A', prices: [1.8, 2.0] }, { book: 'B', prices: [1.9, 1.95] }], 2);
  assert.deepEqual(r.best, [1.9, 2.0]); assert.deepEqual(r.bestBook, ['B', 'A']); near(r.avg[0], 1.85);
});
test('line movement και steam', () => {
  const m = movement([['2026-11-04T10:00:00Z', 1.85], ['2026-11-04T12:00:00Z', 1.84], ['2026-11-04T12:30:00Z', 1.76], ['2026-11-04T15:00:00Z', 1.78]]);
  assert.equal(m.open, 1.85); assert.equal(m.current, 1.78); assert.equal(m.high, 1.85); assert.equal(m.low, 1.76);
  assert.equal(m.direction, 'shorten'); assert.equal(m.steams.length, 1); assert.equal(m.steams[0].min, 30);
});
test('CLV', () => {
  near(clv(0.55, 0.5), 5);
  const s = clvSummary([{ clv: 2, m: 'ml' }, { clv: -1, m: 'ml' }, { clv: 4, m: 'tot' }], r => r.m);
  near(s.ml.mean, 0.5); near(s.ml.pos, 0.5); assert.equal(s.tot.n, 1);
});
test('PIR props', () => {
  near(pirOverProb(16, 6, 16, 26), 0.5, 1e-6);
  assert.ok(pirOverProb(10, 6, 16, 26) > 0.75); assert.ok(pirOverProb(25, 6, 16, 26) < 0.15);
  assert.equal(internalLine(16.4), 15.5); assert.equal(internalLine(16.6), 16.5);
  near(hitRate([10, 20, 16, 15], 15.5), 0.5);
  assert.equal(minutesRisk([25, 26, 24, 27], 'playing'), 'low'); assert.equal(minutesRisk([5, 30, 10, 28], 'playing'), 'high'); assert.equal(minutesRisk([25, 26, 24], 'injured'), 'high');
});
test('idempotent ingestion: μόνο αλλαγές', () => {
  const h = [{ provider: 'p', event: 'e', book: 'b', market: 'ml', sel: 'home', price: 1.8 }];
  const add = appendChanges(h, [{ provider: 'p', event: 'e', book: 'b', market: 'ml', sel: 'home', price: 1.8 }, { provider: 'p', event: 'e', book: 'b', market: 'ml', sel: 'away', price: 2.0 }]);
  assert.equal(add.length, 1); assert.equal(add[0].sel, 'away');
  assert.equal(appendChanges([...h, ...add], add).length, 0);
});


test('player prop snapshots: retain unchanged quotes at later captures and deduplicate reruns', () => {
  const base = { provider: 'p', event: 'e', book: 'b', market: 'prop:pts', sel: 'over', player: 'Player A', line: 15.5, price: 1.9, t: '2026-11-16T10:00:00Z' };
  const first = { ...base, seen: '2026-11-16T10:01:00Z', commence: '2026-11-16T19:00:00Z', window: 'open' };
  const close = { ...base, seen: '2026-11-16T15:00:00Z', window: 'close' };
  const added = appendPropSnapshots([], [first]);
  assert.equal(added.length, 1);
  const later = appendPropSnapshots(added, [close]);
  assert.equal(later.length, 1, 'unchanged price at a later capture is still a new snapshot');
  assert.equal(later[0].price, first.price);
  assert.equal(appendPropSnapshots([...added, ...later], [close]).length, 0, 'same capture rerun is idempotent');
});


test('multi-book market consensus: de-vig probabilities, median, and minimum coverage', () => {
  const c = consensusProbability([
    { book: 'A', probability: 0.54 }, { book: 'B', probability: 0.56 },
    { book: 'C', probability: 0.91 }, { book: 'A', probability: 0.99 },
  ]);
  near(c.probability, 0.56); assert.equal(c.books, 3); near(c.mean, (0.54 + 0.56 + 0.91) / 3);
  near(c.spread, 0.37);
  assert.equal(consensusProbability([{ book: 'A', probability: 0.55 }]), null);
  assert.equal(consensusProbability([{ book: 'A', probability: 0.55 }, { book: 'A', probability: 0.57 }]), null);
});


test('quota exhaustion is fatal and distinguishable from ordinary provider errors', async () => {
  const { isQuotaLimitError } = await import('../scripts/odds.mjs');
  assert.equal(isQuotaLimitError(new Error('μηνιαίο όριο 250 κλήσεων')), true);
  assert.equal(isQuotaLimitError(new Error('OddsPapi /odds 503: unavailable')), false);
  assert.equal(isQuotaLimitError('μηνιαίο όριο 240 κλήσεων'), true);
});


test('market audit exposes OddsPapi monthly quota exhaustion', async () => {
  const { auditPropsMarket } = await import('../scripts/props-market-audit.mjs');
  const r = auditPropsMarket({ status: { quotaExhausted: true, quota: { used: 250, cap: 250 } }, now: Date.parse('2026-11-27T00:00:00Z') });
  assert.equal(r.quotaExhausted, true);
  assert.deepEqual(r.providerQuota, { used: 250, cap: 250 });
  assert.ok(r.warnings.some(w => /quota.*OddsPapi|OddsPapi.*quota/i.test(w)));
});
