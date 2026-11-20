import test from 'node:test';
import assert from 'node:assert/strict';
import { closingMove } from '../src/odds/closing.mjs';

const R = (market, sel, line, price, seen) => ({ market, sel, line, price, seen });
const rows = [
  R('ml', 'home', null, 2.10, '2026-11-18T10:00:00Z'), R('ml', 'home', null, 2.02, '2026-11-19T14:37:00Z'),
  R('spread', 'home', 6.5, 1.75, '2026-11-18T10:00:00Z'), R('spread', 'home', 5.5, 1.65, '2026-11-19T16:24:00Z'),
  R('total', 'under', 185.5, 1.93, '2026-11-19T16:24:00Z'), R('total', 'under', 183.5, 2.2, '2026-11-19T16:24:00Z'),
  R('ml', 'home', null, 1.5, '2026-11-19T21:00:00Z') // μετά το τζάμπολ: αγνοείται
];
const tip = Date.parse('2026-11-19T18:00:00Z');

test('νίκη: μικρότερη απόδοση από το κλείσιμο = χειρότερη τιμή', () => {
  const m = closingMove(rows, { kind: 'ml', side: 1 }, 1.95, tip);
  assert.equal(m.status, 'worse'); assert.equal(m.closePrice, 2.02); assert.equal(m.by, 'price');
});
test('χάντικαπ: +6,5 όταν έκλεισε +5,5 = καλύτερη τιμή κατά 1 πόντο', () => {
  const m = closingMove(rows, { kind: 'hc', side: 1, line: 6.5 }, 1.78, tip);
  assert.equal(m.status, 'better'); assert.equal(m.by, 'line'); assert.equal(m.pts, 1); assert.equal(m.closeLine, 5.5); assert.ok(m.diff > 0.1);
});
test('under: 183,5 όταν η κύρια γραμμή έκλεισε 185,5 = χειρότερη τιμή', () => {
  const m = closingMove(rows, { kind: 'tot', over: false, line: 183.5 }, 2.10, tip);
  assert.equal(m.closeLine, 185.5); assert.equal(m.pts, -2); assert.equal(m.status, 'worse');
});
test('χωρίς δεδομένα ή χωρίς απόδοση: τίποτα', () => {
  assert.equal(closingMove([], { kind: 'ml', side: 1 }, 1.9, tip), null);
  assert.equal(closingMove(rows, { kind: 'ml', side: 1 }, null, tip), null);
});
