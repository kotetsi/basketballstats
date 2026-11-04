// Scenario simulator του Matchup Center. Καθαρές συναρτήσεις: ίδιος κώδικας στον browser και στα tests.
//
// Βάση: η πρόβλεψη του μοντέλου (p, margin, total, pace) + ευαισθησίες που υπολόγισε το ίδιο το μοντέλο
// (ανεστραμμένη έδρα, μέρες ξεκούρασης, απουσία κάθε βασικού παίκτη). Pace και άμυνα εφαρμόζονται αναλυτικά.

export function ncdf(x) {
  // Abramowitz-Stegun 7.1.26 μέσω erf
  const s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}
export function nppf(p) {
  // αντίστροφη κανονική (Acklam), αρκετά ακριβής για 0.001 < p < 0.999
  p = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = p < 0.02425 ? Math.sqrt(-2 * Math.log(p)) : p > 1 - 0.02425 ? Math.sqrt(-2 * Math.log(1 - p)) : null;
  if (q !== null) { const v = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); return p < 0.5 ? v : -v; }
  const r = p - 0.5, s = r * r;
  return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

// Γραμμική παρεμβολή στον πίνακα ευαισθησίας ξεκούρασης {"1":Δ,"2":Δ,...}
export function restDelta(table, days) {
  const xs = Object.keys(table || {}).map(Number).sort((a, b) => a - b);
  if (!xs.length) return 0;
  if (days <= xs[0]) return table[xs[0]];
  if (days >= xs[xs.length - 1]) return table[xs[xs.length - 1]];
  for (let i = 1; i < xs.length; i++) if (days <= xs[i]) { const x0 = xs[i - 1], x1 = xs[i], t = (days - x0) / (x1 - x0); return table[x0] + t * (table[x1] - table[x0]); }
  return 0;
}

/**
 * @param g    πρόβλεψη (p_home, margin, total, pace, h_rest, a_rest, sim:{sigma, swap, rest, players})
 * @param o    { swapVenue, hRest, aRest, out:Set(ids που ΛΕΙΠΟΥΝ), pace (κατοχές), hDrtg, aDrtg (±πόντοι/100 που δέχεται κάθε ομάδα) }
 * @returns    { p_home, p_away, hs, as, margin, total, pace }
 */
export function simulate(g, o = {}) {
  const S = g.sim || {};
  const sigma = S.sigma || 12;
  let p = g.p_home, margin = g.margin, total = g.total;
  if (o.swapVenue && S.swap) { p = S.swap.p_home; margin = S.swap.margin; total = S.swap.total; }
  let dm = 0;
  // ξεκούραση: διαφορά από τη βάση του μοντέλου
  if (S.rest) {
    if (o.hRest != null) dm += restDelta(S.rest.h, o.hRest) - restDelta(S.rest.h, g.h_rest);
    if (o.aRest != null) dm += restDelta(S.rest.a, o.aRest) - restDelta(S.rest.a, g.a_rest);
  }
  // απουσίες: dm = πόσο αλλάζει η διαφορά όταν ο παίκτης λείπει
  for (const pl of S.players || []) {
    const outNow = o.out ? o.out.has(pl.id) : pl.out;
    if (outNow && !pl.out) dm += pl.dm;
    if (!outNow && pl.out) dm -= pl.dm;
  }
  const base = margin;
  margin += dm;
  // pace: οι πόντοι κάθε ομάδας κλιμακώνονται με τις κατοχές
  const pace0 = g.pace || 72, pace = o.pace || pace0, k = pace / pace0;
  let hs = (total + margin) / 2 * k, as = (total - margin) / 2 * k;
  // άμυνα: +x DRtg = η ομάδα δέχεται x πόντους περισσότερους ανά 100 κατοχές
  if (o.hDrtg) as += o.hDrtg * pace / 100;
  if (o.aDrtg) hs += o.aDrtg * pace / 100;
  const m1 = hs - as, t1 = hs + as;
  // πιθανότητα: μετατόπιση πάνω στην κανονική, ώστε χωρίς αλλαγές να μένει ακριβώς η πιθανότητα του μοντέλου
  const p1 = ncdf(nppf(p) + (m1 - base) / sigma);
  return { p_home: p1, p_away: 1 - p1, hs, as, margin: m1, total: t1, pace };
}

// «Panathinaikos 58% win probability | Projected score: 84-79 | ...»
export function headline(g, names, L) {
  const fav = g.p_home >= 0.5 ? names[0] : names[1], pr = Math.round(Math.max(g.p_home, 1 - g.p_home) * 100);
  return `${fav} ${pr}% ${L.win} | ${L.score}: ${Math.round(g.hs)}-${Math.round(g.as)} | ${L.total}: ${Math.round(g.total)} | Pace: ${g.pace.toFixed(1)} | ${L.conf}: ${L[g.conf] || g.conf}`;
}

// ---- αποδόσεις (μόνο από αδειοδοτημένο πάροχο, όταν υπάρχει data/odds/latest.json)
// δεκαδικές αποδόσεις → πιθανότητες χωρίς το περιθώριο του bookmaker (κανονικοποίηση)
export function impliedProbs(odds) {
  const raw = odds.map(o => (o > 1 ? 1 / o : 0)), s = raw.reduce((a, b) => a + b, 0);
  return { probs: raw.map(x => (s ? x / s : 0)), overround: s - 1 };
}
export const edge = (model, implied) => model - implied;
