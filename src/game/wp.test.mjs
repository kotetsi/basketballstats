import test from 'node:test';
import assert from 'node:assert/strict';
import { winProb, wpSeries, clockOf, periodEnd } from './wp.mjs';

test('winProb: όρια και συμμετρία', () => {
  assert.equal(winProb(0, 0), 0.5);
  assert.ok(Math.abs(winProb(5, 1200) + winProb(-5, 1200) - 1) < 1e-9);
  assert.ok(winProb(3, 2390) > winProb(3, 1200));
  assert.equal(winProb(1, 2400), 1);
  assert.equal(winProb(0, 2400), 0.5);
  assert.ok(winProb(0, 0, 5) > 0.6);
});
test('periodEnd/clockOf', () => {
  assert.equal(periodEnd(100), 2400); assert.equal(periodEnd(2400), 2400); assert.equal(periodEnd(2450), 2700);
  assert.equal(clockOf(0), 'Q1 10:00'); assert.equal(clockOf(2266), 'Q4 2:14'); assert.equal(clockOf(2500), 'OT1 3:20');
});
test('wpSeries: νικητής, κρίσιμες φάσεις, WPA', () => {
  const sc = [[60, 0, 2, 0, 2, 0], [1300, 1, 3, 1, 2, 3], [2395, 0, 3, 0, 5, 3]];
  const S = wpSeries(sc);
  assert.equal(S.winner, 0);
  assert.equal(S.pts[S.pts.length - 1].p, 1);
  assert.equal(S.key[S.key.length - 1].t, 2395);
  assert.equal(S.players[0].pid, 0);
  assert.equal(S.leadChanges, 2);
});
