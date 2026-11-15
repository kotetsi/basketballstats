// Απολογισμός συνόλων: closing κύρια γραμμή (διάμεση), καλύτερη τιμή, πλευρά μοντέλου, αποτέλεσμα, ROI ανά ομάδα.
import test from 'node:test';
import assert from 'node:assert/strict';
import { totalsReport } from '../src/odds/build-odds.mjs';

const H = (book, sel, line, price, seen) => ({ event: 'E-12-OLY-PAN', book, market: 'total', sel, line, price, seen, t: seen });
test('closing γραμμή, πλευρά και αποτέλεσμα', () => {
  const O = {
    latest: { games: { 'E-12-OLY-PAN': { commence: '2026-11-17T18:00:00Z', books: { a: { lic: ['gr'] }, b: { lic: ['gr'] }, c: { lic: ['uk'] } } } } },
    plog: { 'E-12-OLY-PAN': { last: { total: 170.2 } } },
    hist: [
      H('a', 'over', 172.5, 1.9, '2026-11-16T10:00:00Z'), H('a', 'under', 172.5, 1.9, '2026-11-16T10:00:00Z'),
      H('a', 'over', 174.5, 1.95, '2026-11-17T15:00:00Z'), H('a', 'under', 174.5, 1.85, '2026-11-17T15:00:00Z'),   // η γραμμή άλλαξε
      H('b', 'over', 174.5, 1.88, '2026-11-17T16:00:00Z'), H('b', 'under', 174.5, 1.92, '2026-11-17T16:00:00Z'),
      H('b', 'under', 174.5, 2.5, '2026-11-17T19:00:00Z'),   // μετά το τζάμπολ: αγνοείται
      H('c', 'over', 160.5, 1.9, '2026-11-17T16:00:00Z'), H('c', 'under', 160.5, 1.9, '2026-11-17T16:00:00Z'),   // άλλη χώρα
    ],
  };
  const R = totalsReport(O, 'gr', { 'E-12-OLY-PAN': 168 }, { sig: 17 });
  assert.equal(R.rows.length, 1);
  const x = R.rows[0];
  assert.equal(x.line, 174.5); assert.equal(x.side, 'under'); assert.equal(x.price, 1.92); assert.equal(x.book, 'b');
  assert.equal(x.res, 'win'); assert.ok(Math.abs(x.pnl - 0.92) < 1e-9); assert.equal(x.diff, -4.3);
  assert.equal(R.sum.d3.n, 1); assert.equal(R.sum.d5.n, 0); assert.equal(R.sum.under.w, 1);
  assert.equal(totalsReport(O, 'gr', {}, {}).rows.length, 0);   // χωρίς αποτέλεσμα
});
