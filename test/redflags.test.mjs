// «Κόκκινοι» αγώνες: διαφωνία μοντέλου–αγοράς πάνω από 8 μονάδες με θετική αξία
import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, currentFlags, trackRecord, RED_PP } from '../src/odds/redflags.mjs';

const REG = { brands: { stoiximan: { brand: 'Stoiximan', greek_prices: 'confirmed', feeds: ['stoiximan'] }, x: { brand: 'X', greek_prices: 'unconfirmed', feeds: [] } } };

test('όριο 8 μονάδων και θετική αξία', () => {
  assert.equal(RED_PP, 8);
  // αγορά ~28% για τον φιλοξενούμενο, μοντέλο 43% → κόκκινος, πλευρά 2
  const j = judge(0.57, [{ title: 'S', prices: [1.36, 3.55] }]);
  assert.equal(j.red, true); assert.equal(j.side, 1); assert.ok(j.gap > 8); assert.ok(j.ev > 0); assert.equal(j.price, 3.55);
  // μικρή διαφορά → όχι
  assert.equal(judge(0.5, [{ title: 'S', prices: [1.9, 1.9] }]).red, false);
  // χωρίς τιμές ή πρόβλεψη → null
  assert.equal(judge(null, [{ title: 'S', prices: [1.9, 1.9] }]), null);
  assert.equal(judge(0.5, []), null);
});

test('τρέχοντες: αγνοεί παλιές τιμές', () => {
  const g = (stale, p) => ({ gid: 'E-13-A-B', r: 13, h: 'A', a: 'B', t: '2026-11-20T19:00:00Z', stale, markets: { ml: [{ sel: [{ model: p }], rows: [{ title: 'S', prices: [1.9, 1.9] }] }] } });
  assert.equal(currentFlags([g(false, 0.7)]).length, 1);
  assert.equal(currentFlags([g(true, 0.7)]).length, 0);
  assert.equal(currentFlags([g(false, 0.52)]).length, 0);
});

test('απολογισμός: μόνο επιβεβαιωμένα ελληνικά feeds, closing πριν από το τζάμπολ, κέρδος ανά μονάδα', () => {
  const t = '2026-11-12T19:00:00Z';
  const H = (book, sel, price, seen) => ({ event: 'E-11-A-B', book, market: 'ml', sel, price, t, seen });
  const O = { latest: { games: { 'E-11-A-B': { commence: t } } }, plog: { 'E-11-A-B': { last: { p: 0.7, t: '2026-11-12T18:00:00Z' } } },
    hist: [H('stoiximan', 'home', 2.0, '2026-11-12T10:00:00Z'), H('stoiximan', 'away', 1.8, '2026-11-12T10:00:00Z'),
      H('stoiximan', 'home', 1.95, '2026-11-12T18:30:00Z'), H('stoiximan', 'away', 1.85, '2026-11-12T18:30:00Z'),
      H('stoiximan', 'home', 1.2, '2026-11-12T20:00:00Z'), H('stoiximan', 'away', 4.0, '2026-11-12T20:00:00Z'),   // μετά το τζάμπολ: δεν μετράει
      H('x', 'home', 9, '2026-11-12T18:30:00Z'), H('x', 'away', 9, '2026-11-12T18:30:00Z')] };
  const games = [[11, 'w', 'A', 'B', 90, 80, 1]];
  const T = trackRecord(O, REG, games);
  assert.equal(T.n, 1); assert.equal(T.rows[0].price, 1.95); assert.equal(T.rows[0].won, true); assert.equal(T.profit, 0.95);
  O.plog['E-11-A-B'].last.t = '2026-11-12T19:30:00Z';   // πρόβλεψη μετά το τζάμπολ → εκτός
  assert.equal(trackRecord(O, REG, games).n, 0);
});
