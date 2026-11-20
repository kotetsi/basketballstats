import test from 'node:test';
import assert from 'node:assert/strict';
import { blendPreds } from '../src/odds/blend.mjs';
const now = Date.parse('2026-01-01T10:00:00Z');
const mk = () => ({ games: [{ comp: 'E', r: 1, h: 'A', a: 'B', t: '2026-01-02T19:00:00Z', p_home: 0.8, p_away: 0.2 }, { comp: 'U', r: 1, h: 'C', a: 'D', t: '2026-01-02T19:00:00Z', p_home: 0.7, p_away: 0.3 }] });
const odds = { updated: '2026-01-01T09:00:00Z', games: { 'E-1-A-B': { books: { b: { ml: [2, 2] } } } } };
test('30/70 μίξη με την αγορά, μόνο EuroLeague', () => {
  const P = mk(); assert.equal(blendPreds(P, odds, null, { now }), 1);
  assert.equal(P.games[0].p_model, 0.8); assert.equal(P.games[0].p_mkt, 0.5);
  assert.ok(Math.abs(P.games[0].p_home - 0.59) < 1e-9);
  assert.equal(P.games[1].p_home, 0.7);
});
test('παλιές τιμές: μένει το μοντέλο', () => {
  const P = mk(); assert.equal(blendPreds(P, { ...odds, updated: '2025-12-30T00:00:00Z' }, null, { now }), 0);
  assert.equal(P.games[0].p_home, 0.8);
});
