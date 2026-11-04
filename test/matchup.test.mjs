import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, ncdf, nppf, restDelta } from '../src/matchup/sim.mjs';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);
const G = { p_home: 0.6, margin: 4, total: 160, pace: 72, h_rest: 3, a_rest: 3,
  sim: { sigma: 12, swap: { p_home: 0.45, margin: -1, total: 158 }, rest: { h: { 1: -2, 3: 0, 7: 1 }, a: { 1: 2, 3: 0, 7: -1 } }, players: [{ side: 'h', id: 'X', dm: -3, out: false }, { side: 'a', id: 'Y', dm: 2.5, out: true }] } };

test('ncdf / nppf αντίστροφες', () => { for (const p of [0.05, 0.3, 0.5, 0.77, 0.95]) near(ncdf(nppf(p)), p, 1e-4); near(ncdf(0), 0.5); });
test('simulator: χωρίς αλλαγές = πρόβλεψη μοντέλου', () => {
  const r = simulate(G, {}); near(r.p_home, 0.6, 1e-4); near(r.margin, 4); near(r.total, 160); near(r.hs, 82); near(r.as, 78);
});
test('simulator: ανεστραμμένη έδρα', () => { const r = simulate(G, { swapVenue: true }); near(r.p_home, 0.45, 1e-4); near(r.margin, -1); });
test('simulator: ξεκούραση με παρεμβολή', () => {
  near(restDelta(G.sim.rest.h, 2), -1); near(restDelta(G.sim.rest.h, 5), 0.5);
  const r = simulate(G, { hRest: 1 }); near(r.margin, 2); assert.ok(r.p_home < 0.6);
});
test('simulator: απουσίες (και επιστροφή παίκτη που λείπει)', () => {
  const r = simulate(G, { out: new Set(['X', 'Y']) }); near(r.margin, 1);      // ο Χ λείπει: −3
  const r2 = simulate(G, { out: new Set() }); near(r2.margin, 1.5);             // ο Y επιστρέφει: −2.5
});
test('simulator: pace και άμυνα', () => {
  const r = simulate(G, { pace: 80 }); near(r.total, 160 * 80 / 72); near(r.margin, 4 * 80 / 72);
  const d = simulate(G, { hDrtg: 5 }); near(d.as, 78 + 5 * 72 / 100); assert.ok(d.p_home < 0.6);
});
import { impliedProbs, edge } from '../src/matchup/sim.mjs';
test('implied probability χωρίς περιθώριο και edge', () => {
  const { probs, overround } = impliedProbs([1.8, 2.0]);
  near(probs[0] + probs[1], 1); near(probs[0], (1 / 1.8) / (1 / 1.8 + 0.5)); near(overround, 1 / 1.8 + 0.5 - 1);
  near(edge(0.6, probs[0]), 0.6 - probs[0]);
});
