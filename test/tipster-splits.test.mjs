// Ρεκόρ tipster ανά είδος και ζώνη απόδοσης (src/tipsters/splits.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickSplits } from '../src/tipsters/splits.mjs';

test('ανά είδος και ανά ζώνη απόδοσης, μόνο κριμένα W/L, μονάδες με 1 μονάδα', () => {
  const P = [
    { kind: 'tot', ov: true, odds: 1.8, res: 'W' }, { kind: 'tot', ov: true, odds: 1.9, res: 'W' },
    { kind: 'prop', ov: false, odds: 2.1, res: 'L' }, { kind: 'prop', ov: true, odds: 1.7, res: 'W' },
    { kind: 'ml', odds: 1.7, res: 'L' }, { kind: 'hc', odds: 1.78, res: 'P' }, { kind: 'tot', ov: false, odds: 1.8, res: 'pending' },
  ];
  const S = pickSplits(P);
  assert.equal(S.n, 5);
  assert.deepEqual(S.types.map(r => [r.key, r.W, r.L, r.units]), [['tot-o', 2, 0, 1.7], ['ml', 0, 1, -1], ['prop-o', 1, 0, 0.7], ['prop-u', 0, 1, -1]]);
  const b = Object.fromEntries(S.bands.map(r => [r.lo, r]));
  assert.equal(b[0].all.n, 2); assert.equal(b[0].prop.W, 1); assert.equal(b[0].team.L, 1);
  assert.equal(b[1.75].all.W, 1); assert.equal(b[1.85].all.W, 1); assert.equal(b[1.95].prop.L, 1);
});
