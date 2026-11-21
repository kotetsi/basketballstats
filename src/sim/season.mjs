// Season simulation shared by the browser (inlined at the top of assets/app.js by build.mjs) and by build.mjs
// (history of the title odds per round). Pure functions only: no DOM, no fetch, no Greek string literals
// (app.js is translated by phrase replacement).
//
// Regular season: every remaining game is decided by the model margin + a per-simulation team level offset + game noise.
// Then the official EuroLeague format: play-in (7v8, 9v10, loser 7v8 v winner 9v10), playoffs best of 5 with
// home court 2-2-1 (1v8, 2v7, 3v6, 4v5), Final Four on neutral court (1/8 v 4/5, 2/7 v 3/6), final.

export function simRng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** Team ratings from player game rows (same formulas as the team pages): ortg, drtg, pace per team code. */
export function simRatings(players) {
  const TG = {}, TS = {};
  for (const p of players) {
    if (String(p.t).includes(';')) continue;
    for (const r of (p.g || p.games || [])) {
      if (!(r[7] > 0)) continue;
      const k = p.t + '|' + r[0], a = TG[k] || (TG[k] = { team: p.t, opp: r[2], round: r[0], s: new Array(26).fill(0) });
      for (let i = 7; i < 26; i++) a.s[i] += r[i];
    }
  }
  for (const g of Object.values(TG)) {
    const T = TS[g.team] || (TS[g.team] = { g: 0, s: new Array(26).fill(0), o: new Array(26).fill(0) });
    T.g++; for (let i = 7; i < 26; i++) T.s[i] += g.s[i];
    const O = TG[g.opp + '|' + g.round]; if (O) for (let i = 7; i < 26; i++) T.o[i] += O.s[i];
  }
  const out = {};
  for (const [c, T] of Object.entries(TS)) {
    const s = T.s, o = T.o, G = T.g || 1;
    const poss = s[10] + s[12] - s[15] + s[19] + 0.44 * s[14], oposs = o[10] + o[12] - o[15] + o[19] + 0.44 * o[14], pp = (poss + oposs) / 2 || 1;
    out[c] = { ortg: s[8] / pp * 100, drtg: o[8] / pp * 100, pace: pp / G };
  }
  return out;
}

/**
 * o = { teams: [codes in standings order], bW: [current wins], bD: [current point diff],
 *       rem: [[homeIdx, awayIdx, margin]], mg: (i, j) => expected margin with i at home, hca, N, seed }
 * returns { N, rem, by: { code: { p:[place probs], top4, top6, pin, out, w, best, po, f4, fin, champ } } }
 * po = reached the playoffs (top 6 or through the play-in), f4 = Final Four, fin = final, champ = title.
 */
export function simSeason(o) {
  const { teams, bW, bD, rem, mg, hca = 3, N = 5000 } = o, n = teams.length;
  const R = simRng(o.seed), gs = () => { let u = 0; while (!u) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
  const cnt = teams.map(() => new Array(n).fill(0)), ws = new Array(n).fill(0);
  const po = new Array(n).fill(0), f4 = new Array(n).fill(0), fin = new Array(n).fill(0), ch = new Array(n).fill(0);
  const M = {}, home = (i, j) => { const k = i * 64 + j; return k in M ? M[k] : (M[k] = mg(i, j)); };
  const neutral = (i, j) => (home(i, j) - home(j, i)) / 2;
  const playoffs = n >= 10;
  for (let s = 0; s < N; s++) {
    const W = bW.slice(), Dd = bD.slice(), off = teams.map(() => 3 * gs());
    for (const [h, a, m] of rem) { const d = m + off[h] - off[a] + 11 * gs(); if (d > 0) W[h]++; else W[a]++; Dd[h] += d; Dd[a] -= d; }
    const order = teams.map((_, i) => i).sort((x, y) => W[y] - W[x] || Dd[y] - Dd[x]);
    order.forEach((t, p) => { cnt[t][p]++; });
    for (let i = 0; i < n; i++) ws[i] += W[i];
    if (!playoffs) continue;
    const game = (h, a) => home(h, a) + off[h] - off[a] + 11 * gs() > 0 ? h : a;            // h at home
    const ngame = (x, y) => neutral(x, y) + off[x] - off[y] + 11 * gs() > 0 ? x : y;       // neutral court
    const series = (hi, lo) => { let a = 0, b = 0; for (let g = 0; a < 3 && b < 3; g++) { const atHi = g === 0 || g === 1 || g === 4; const w = atHi ? game(hi, lo) : game(lo, hi); if (w === hi) a++; else b++; } return a === 3 ? hi : lo; };
    const sd = order;                                   // sd[0] = 1st seed …
    const w78 = game(sd[6], sd[7]), l78 = w78 === sd[6] ? sd[7] : sd[6], w910 = game(sd[8], sd[9]);
    const s7 = w78, s8 = game(l78, w910);
    const seeds = [sd[0], sd[1], sd[2], sd[3], sd[4], sd[5], s7, s8];
    for (const t of seeds) po[t]++;
    const q1 = series(seeds[0], seeds[7]), q4 = series(seeds[3], seeds[4]), q2 = series(seeds[1], seeds[6]), q3 = series(seeds[2], seeds[5]);
    for (const t of [q1, q2, q3, q4]) f4[t]++;
    const a = ngame(q1, q4), b = ngame(q2, q3); fin[a]++; fin[b]++;
    ch[ngame(a, b)]++;
  }
  return {
    N, rem: rem.length, by: Object.fromEntries(teams.map((c, i) => {
      const p = cnt[i].map(x => x / N), sum = (a, b) => p.slice(a, b).reduce((x, y) => x + y, 0);
      let best = 0; p.forEach((x, j) => { if (x > p[best]) best = j; });
      return [c, { p, top4: sum(0, 4), top6: sum(0, 6), pin: sum(6, 10), out: sum(10, n), w: ws[i] / N, best: best + 1, po: po[i] / N, f4: f4[i] / N, fin: fin[i] / N, champ: ch[i] / N }];
    })),
  };
}
