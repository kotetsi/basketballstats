// RAPM (src/analytics/rapm.mjs) και ζεύγη πεντάδων στο pbp-core
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStints } from '../src/analytics/pbp-core.mjs';
import { rapmRows, fitRapm, chooseLambda, possOf } from '../src/analytics/rapm.mjs';

const E = (tm, pid, type, mt) => ({ PLAYTYPE: type, CODETEAM: tm, PLAYER_ID: pid, MARKERTIME: mt });
const A5 = ['a1', 'a2', 'a3', 'a4', 'a5'], B5 = ['b1', 'b2', 'b3', 'b4', 'b5'];
const game = {
  CodeTeamA: 'AAA', CodeTeamB: 'BBB',
  FirstQuarter: [E('', '', 'BP', ''), E('AAA', 'a1', '2FGM', '09:00'), E('BBB', 'b1', '3FGM', '08:00'), E('BBB', 'b2', '2FGA', '07:00'), E('AAA', 'a1', 'D', '07:00'),
    E('AAA', 'a5', 'OUT', '05:00'), E('AAA', 'a6', 'IN', '05:00'), E('AAA', 'a6', '3FGM', '04:00')],
  SecondQuarter: [E('', '', 'BP', '')], ThirdQuarter: [E('', '', 'BP', '')],
  ForthQuarter: [E('', '', 'BP', ''), E('AAA', 'a2', 'FTM', '02:00'), E('BBB', 'b2', 'TO', '01:00')],
};

test('ζεύγη πεντάδων: χρόνος και πόντοι αθροίζουν στο σύνολο, χωρισμένα στην αλλαγή', () => {
  const r = buildStints(game, { AAA: A5, BBB: B5 }), M = r.matchups;
  assert.equal(M.reduce((s, m) => s + m.s, 0), 2400);
  assert.equal(M.reduce((s, m) => s + m.sa[0], 0), 6); assert.equal(M.reduce((s, m) => s + m.sb[0], 0), 3);
  const first = M.find(m => m.a.includes('a5'));
  assert.equal(first.s, 300); assert.deepEqual(first.sa, [2, 1, 0, 0, 0]); assert.deepEqual(first.sb, [3, 2, 0, 0, 0]);
  const second = M.find(m => m.a.includes('a6')); assert.deepEqual(second.sb, [0, 0, 0, 0, 1]); assert.equal(second.sa[2], 1);
  assert.equal(possOf([10, 8, 5, 2, 3]), 8 - 2 + 3 + 0.44 * 5);
});

test('RAPM: βρίσκει τους πραγματικά καλούς παίκτες σε συνθετικούς αγώνες', () => {
  let s = 12345; const R = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());
  // 4 ομάδες × 8 παίκτες· ο x0 κάθε ομάδας +6 επίθεση, ο x1 +5 άμυνα
  const T = ['A', 'B', 'C', 'D'], roster = Object.fromEntries(T.map(t => [t, Array.from({ length: 8 }, (_, i) => t + i)]));
  const trueO = {}, trueD = {};
  for (const t of T) roster[t].forEach((p, i) => { trueO[p] = i === 0 ? 6 : gauss() * 0.5; trueD[p] = i === 1 ? 5 : gauss() * 0.5; });
  const games = [];
  for (let g = 0; g < 120; g++) {
    const h = T[g % 4], a = T[(g + 1 + (g >> 2) % 3) % 4]; if (h === a) continue;
    const ids = [...roster[h], ...roster[a]], ix = Object.fromEntries(ids.map((p, i) => [p, i])), mu = [];
    for (let k = 0; k < 12; k++) {
      const pick = t => roster[t].slice().sort(() => R() - 0.5).slice(0, 5);
      const A = pick(h), B = pick(a), poss = 8;
      const ra = 112 + 1.5 + A.reduce((x, p) => x + trueO[p], 0) - B.reduce((x, p) => x + trueD[p], 0) + gauss() * 25 / Math.sqrt(poss);
      const rb = 112 - 1.5 + B.reduce((x, p) => x + trueO[p], 0) - A.reduce((x, p) => x + trueD[p], 0) + gauss() * 25 / Math.sqrt(poss);
      mu.push([A.map(p => ix[p]), B.map(p => ix[p]), 300, [ra * poss / 100, poss, 0, 0, 0], [rb * poss / 100, poss, 0, 0, 0]]);
    }
    games.push({ id: g, ids, mu });
  }
  const { rows, avg } = rapmRows(games);
  assert.ok(Math.abs(avg - 112) < 3);
  const fit = fitRapm(rows, 200);
  for (const t of T) {
    const byO = roster[t].slice().sort((x, y) => fit.off[y] - fit.off[x]), byD = roster[t].slice().sort((x, y) => fit.def[y] - fit.def[x]);
    assert.equal(byO[0], t + '0'); assert.equal(byD[0], t + '1');
  }
  assert.ok(fit.h > 0);
  // shrinkage: μεγαλύτερο λ → μικρότερες τιμές
  const big = fitRapm(rows, 20000); assert.ok(Math.abs(big.off.A0) < Math.abs(fit.off.A0));
  const gid = new Map(); games.forEach(g => g.mu.forEach(() => {})); let i = 0; for (const g of games) for (const m of g.mu) { gid.set(rows[i], g.id); gid.set(rows[i + 1], g.id); i += 2; }
  const cv = chooseLambda(rows, r => gid.get(r), [50, 200, 1000, 5000], 4);
  assert.ok(cv.err.every(([, e]) => e < cv.base));
});
