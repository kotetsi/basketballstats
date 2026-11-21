// RAPM (Regularized Adjusted Plus-Minus): επιθετική και αμυντική επίδραση κάθε παίκτη ανά 100 κατοχές,
// αφού αφαιρεθεί η επίδραση των άλλων εννέα στο παρκέ. Ridge regression στα ζεύγη πεντάδων του play-by-play.
//
// Κάθε ζεύγος δίνει δύο γραμμές: «A επιτίθεται, B αμύνεται» και αντίστροφα.
//   y = 100·πόντοι/κατοχές − μ.ό. λίγκας,   βάρος = κατοχές,
//   y ≈ h·(επιτίθεται ο γηπεδούχος ? +1 : −1) + Σ O[επιθετικοί] − Σ D[αμυνόμενοι]
// (D > 0 = καλή άμυνα). Shrinkage λ προς το 0 (= μέσος παίκτης). Καθαρές συναρτήσεις.

/** κατοχές μιας πλευράς από [πόντοι, FGA, FTA, OREB, TOV] */
export const possOf = s => Math.max(0, s[1] - s[3] + s[4] + 0.44 * s[2]);

/**
 * games = [{ home: [ids], away: [ids], mu: [[aIdx×5, bIdx×5, secs, sa, sb]], w }] (a = γηπεδούχος όπως στο data/pbp: h = CodeTeamA)
 *   ids: τα ids του αγώνα (για την αντιστοίχιση των indices) · w: βάρος του αγώνα (π.χ. μικρότερο για προηγούμενη σεζόν)
 * returns { rows: [{ off:[pid×5], def:[pid×5], home:±1, y, w, pts, poss }], avg }
 */
export function rapmRows(games) {
  const rows = [];
  let P = 0, N = 0;
  for (const g of games) for (const [a, b, , sa, sb] of g.mu || []) {
    const A = a.map(i => g.ids[i]), B = b.map(i => g.ids[i]);
    if (A.length !== 5 || B.length !== 5 || A.some(x => !x) || B.some(x => !x)) continue;
    const pa = possOf(sa), pb = possOf(sb), w = g.w ?? 1;
    if (pa > 0) { rows.push({ off: A, def: B, home: 1, pts: sa[0], poss: pa, w }); P += sa[0] * w; N += pa * w; }
    if (pb > 0) { rows.push({ off: B, def: A, home: -1, pts: sb[0], poss: pb, w }); P += sb[0] * w; N += pb * w; }
  }
  const avg = N ? 100 * P / N : 0;
  for (const r of rows) r.y = 100 * r.pts / r.poss - avg;
  return { rows, avg };
}

/** λύση του (A + λI)x = b με Cholesky (A συμμετρικός θετικά ορισμένος μετά το λ) */
function solve(A, b) {
  const n = b.length, L = A.map(r => r.slice());
  for (let j = 0; j < n; j++) {
    let d = L[j][j]; for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
    d = Math.sqrt(Math.max(d, 1e-12)); L[j][j] = d;
    for (let i = j + 1; i < n; i++) { let s = L[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = s / d; }
  }
  const y = new Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

/**
 * fitRapm(rows, λ) → { off: {pid: O}, def: {pid: D}, h, poss: {pid: κατοχές στο παρκέ} }
 * Άγνωστοι: O και D κάθε παίκτη + πλεονέκτημα έδρας h (χωρίς shrinkage στο h).
 */
export function fitRapm(rows, lam) {
  const ids = [...new Set(rows.flatMap(r => [...r.off, ...r.def]))].sort(), ix = Object.fromEntries(ids.map((p, i) => [p, i]));
  const n = 2 * ids.length + 1, H = n - 1;
  const A = Array.from({ length: n }, () => new Float64Array(n)), b = new Float64Array(n), poss = {};
  for (const r of rows) {
    const W = r.w * r.poss, cols = [...r.off.map(p => [ix[p], 1]), ...r.def.map(p => [ids.length + ix[p], -1]), [H, r.home]];
    for (const [i, vi] of cols) { b[i] += W * vi * r.y; for (const [j, vj] of cols) A[i][j] += W * vi * vj; }
    for (const p of [...r.off, ...r.def]) poss[p] = (poss[p] || 0) + r.poss / 2;   // κάθε κατοχή μετρά μισή ανά γραμμή (επίθεση + άμυνα = μία)
  }
  for (let i = 0; i < H; i++) A[i][i] += lam;
  A[H][H] += 1e-6;
  const x = solve(A.map(r => Array.from(r)), Array.from(b));
  const off = {}, def = {};
  ids.forEach((p, i) => { off[p] = x[i]; def[p] = x[ids.length + i]; });
  return { off, def, h: x[H], poss };
}

/** σφάλμα πρόβλεψης (σταθμισμένο με κατοχές) σε γραμμές που δεν χρησιμοποιήθηκαν στο fit */
export function rapmError(fit, rows) {
  let se = 0, w = 0;
  for (const r of rows) {
    const pred = fit.h * r.home + r.off.reduce((s, p) => s + (fit.off[p] || 0), 0) - r.def.reduce((s, p) => s + (fit.def[p] || 0), 0);
    se += r.poss * (r.y - pred) ** 2; w += r.poss;
  }
  return w ? se / w : 0;
}

/** επιλογή λ με k-fold ανά αγώνα (gameOf: γραμμή → id αγώνα). Επιστρέφει { lam, err: [[λ, σφάλμα]], base: σφάλμα με όλα 0 } */
export function chooseLambda(rows, gameOf, lams = [500, 1000, 2000, 3000, 5000, 8000], k = 5) {
  const games = [...new Set(rows.map(gameOf))].sort(), fold = Object.fromEntries(games.map((g, i) => [g, i % k]));
  const err = lams.map(l => {
    let e = 0;
    for (let f = 0; f < k; f++) {
      const tr = rows.filter(r => fold[gameOf(r)] !== f), te = rows.filter(r => fold[gameOf(r)] === f);
      e += rapmError(fitRapm(tr, l), te) * te.reduce((s, r) => s + r.poss, 0);
    }
    return [l, e / rows.reduce((s, r) => s + r.poss, 0)];
  });
  const base = rapmError({ off: {}, def: {}, h: 0 }, rows);
  return { lam: err.slice().sort((a, b) => a[1] - b[1])[0][0], err, base };
}
