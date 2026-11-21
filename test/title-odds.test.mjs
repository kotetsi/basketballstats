// Προσομοίωση σεζόν (src/sim/season.mjs): playoffs, Final Four και τίτλος
import test from 'node:test';
import assert from 'node:assert/strict';
import { simSeason, simRatings } from '../src/sim/season.mjs';

const n = 20, teams = Array.from({ length: n }, (_, i) => 'T' + i);
const str = teams.map((_, i) => (n / 2 - i) * 1.2);                 // T0 η δυνατότερη
const mg = (i, j) => str[i] - str[j] + 3;
const rem = [];
for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && (i + j) % 3 === 0) rem.push([i, j, mg(i, j)]);
const run = seed => simSeason({ teams, bW: teams.map(() => 5), bD: teams.map(() => 0), rem, mg, hca: 3, N: 3000, seed });

test('οι πιθανότητες αθροίζουν σωστά (1 πρωταθλήτρια, 2 φιναλίστ, 4 στο F4, 8 στα playoffs)', () => {
  const S = run(7), sum = k => teams.reduce((s, c) => s + S.by[c][k], 0);
  assert.ok(Math.abs(sum('champ') - 1) < 1e-9);
  assert.ok(Math.abs(sum('fin') - 2) < 1e-9);
  assert.ok(Math.abs(sum('f4') - 4) < 1e-9);
  assert.ok(Math.abs(sum('po') - 8) < 1e-9);
  for (const c of teams) { const x = S.by[c]; assert.ok(x.champ <= x.fin && x.fin <= x.f4 && x.f4 <= x.po + 1e-12); assert.ok(x.top6 <= x.po + 1e-12); }
});

test('ίδιο seed → ίδια αποτελέσματα· η δυνατότερη ομάδα έχει τη μεγαλύτερη πιθανότητα τίτλου', () => {
  assert.deepEqual(run(11).by.T0, run(11).by.T0);
  const S = run(11);
  assert.ok(S.by.T0.champ > S.by.T5.champ && S.by.T5.champ > S.by.T15.champ);
  assert.equal(S.by.T19.champ < 0.01, true);
});

test('simRatings: ortg/drtg/pace από τις γραμμές αγώνων, χωρίς παίκτες με μεταγραφή', () => {
  const row = (r, opp, pts, a2, a3, or, tov, fta) => { const x = new Array(26).fill(0); x[0] = r; x[2] = opp; x[7] = 600; x[8] = pts; x[10] = a2; x[12] = a3; x[15] = or; x[19] = tov; x[14] = fta; return x; };
  const R = simRatings([{ t: 'A', g: [row(1, 'B', 80, 40, 25, 10, 12, 20)] }, { t: 'B', g: [row(1, 'A', 70, 42, 22, 8, 14, 15)] }, { t: 'A;B', g: [row(1, 'B', 99, 1, 1, 0, 0, 0)] }]);
  const pA = 40 + 25 - 10 + 12 + 0.44 * 20, pB = 42 + 22 - 8 + 14 + 0.44 * 15, pp = (pA + pB) / 2;
  assert.ok(Math.abs(R.A.ortg - 80 / pp * 100) < 1e-9 && Math.abs(R.A.drtg - 70 / pp * 100) < 1e-9 && Math.abs(R.A.pace - pp) < 1e-9);
});
