import test from 'node:test';
import assert from 'node:assert/strict';
import { appendEntries, verifyChain, ledgerReport } from '../src/odds/ledger.mjs';

const preds = { model_version: 'mp-x', games: [{ comp: 'E', r: 1, h: 'AAA', a: 'BBB', t: '2026-01-02T19:00:00Z', p_home: 0.6, margin: 3, total: 160 }] };
const odds = { games: { 'E-1-AAA-BBB': { books: { b1: { title: 'B1', ml: [2.0, 1.8] } } } } };

test('γραμμή μόνο όταν αλλάζει η πρόβλεψη, και αλυσίδα που ελέγχεται', () => {
  const now = new Date('2026-01-01T10:00:00Z');
  const a = appendEntries([], preds, odds, null, now);
  assert.equal(a.length, 1);
  assert.equal(appendEntries(a, preds, odds, null, now).length, 0);
  const b = appendEntries(a, { ...preds, games: [{ ...preds.games[0], p_home: 0.62 }] }, odds, null, now);
  const L = [...a, ...b];
  assert.equal(verifyChain(L).ok, true);
  const T = structuredClone(L); T[0].p = 0.9;
  assert.equal(verifyChain(T).ok, false);
});

test('καμία καταγραφή μετά το τζάμπολ', () => {
  assert.equal(appendEntries([], preds, odds, null, new Date('2026-01-02T19:01:00Z')).length, 0);
});

test('απολογισμός με CLV απέναντι στο κλείσιμο', () => {
  const L = appendEntries([], preds, odds, null, new Date('2026-01-01T10:00:00Z'));
  const hist = [
    { event: 'E-1-AAA-BBB', book: 'b1', market: 'ml', sel: 'home', price: 1.8, seen: '2026-01-02T18:00:00Z' },
    { event: 'E-1-AAA-BBB', book: 'b1', market: 'ml', sel: 'away', price: 2.0, seen: '2026-01-02T18:00:00Z' },
  ];
  const R = ledgerReport(L, { hist }, null, [[1, 0, 'AAA', 'BBB', 80, 70, 1]]);
  assert.equal(R.n, 1); assert.equal(R.bets, 1); assert.equal(R.won, 1);
  assert.ok(R.clv > 0);   // πήραμε 2.00, κλείσιμο χωρίς γκανιότα ≈ 52.6% → 2.00·0.526 − 1 > 0
});

test('χάντικαπ: επιλογή με διαφορά 3+ πόντων και εκκαθάριση', async () => {
  const { ahPick, ahSnap } = await import('../src/odds/ledger.mjs');
  const ah = ahSnap({ books: { a: { spread: { line: -4.5, h: 1.9, a: 1.9 } }, b: { spread: { line: -4.5, h: 1.95, a: 1.85 } }, c: { spread: { line: -5.5, h: 2, a: 1.8 } } } }, null);
  assert.equal(ah.line, -4.5); assert.equal(ah.best[0], 1.95);
  assert.equal(ahPick(6, ah), null);            // 6 − 4,5 = 1,5 < 3
  assert.equal(ahPick(9, ah).side, 0);          // 9 − 4,5 = 4,5 ⇒ γηπεδούχος −4,5
  assert.equal(ahPick(0, ah).side, 1);          // 0 − 4,5 = −4,5 ⇒ φιλοξενούμενος +4,5
  const p2 = { model_version: 'm', games: [{ comp: 'E', r: 1, h: 'AAA', a: 'BBB', t: '2026-01-02T19:00:00Z', p_home: 0.7, margin: 9, total: 160 }] };
  const o2 = { games: { 'E-1-AAA-BBB': { books: { b1: { ml: [1.5, 2.6], spread: { line: -4.5, h: 1.9, a: 1.9 } } } } } };
  const L = appendEntries([], p2, o2, null, new Date('2026-01-01T10:00:00Z'));
  const R = ledgerReport(L, { hist: [] }, null, [[1, 0, 'AAA', 'BBB', 85, 78, 1]]);
  assert.equal(R.ahN, 1); assert.equal(R.ahWon, 1); assert.ok(Math.abs(R.ahProfit - 0.9) < 1e-9);
});
