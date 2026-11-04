// Betting Insights & Odds Intelligence: καθαρές συναρτήσεις (build, browser, tests).
// Σημείωση: πρόκειται για στατιστικές μετρικές ποιότητας μοντέλου, όχι για συμβουλές ή εγγυήσεις.

export const implied = odds => (odds > 1 ? 1 / odds : null);

// overround (vig) μιας αγοράς και πιθανότητες χωρίς vig (κανονικοποίηση)
export function devig(prices) {
  const raw = prices.map(implied);
  if (raw.some(x => x == null)) return null;
  const s = raw.reduce((a, b) => a + b, 0);
  return { raw, overround: s - 1, margin: (s - 1) / s, fair: raw.map(x => x / s) };
}

export const edgePP = (model, fair) => (model == null || fair == null ? null : 100 * (model - fair));
export function classify(pp, thr = 2.5) {
  if (pp == null) return 'na';
  return pp >= thr ? 'model' : pp <= -thr ? 'market' : 'neutral';
}
// confidence tier: συνδυασμός μεγέθους edge, βεβαιότητας του μοντέλου και ηλικίας της απόδοσης
export function tier(pp, modelConf, ageMin) {
  if (pp == null) return 'low';
  let s = Math.abs(pp) >= 6 ? 2 : Math.abs(pp) >= 3.5 ? 1 : 0;
  if (modelConf === 'high') s++;
  if (modelConf === 'low') s--;
  if (ageMin != null && ageMin > 180) s--;
  return s >= 2 ? 'high' : s === 1 ? 'medium' : 'low';
}

// Καλύτερη τιμή και μέσος όρος αγοράς για κάθε επιλογή: books = [{book, prices:[...]}]
export function bestAndAverage(books, n) {
  const best = new Array(n).fill(null), bestBook = new Array(n).fill(null), sum = new Array(n).fill(0), cnt = new Array(n).fill(0);
  for (const b of books) b.prices.forEach((p, i) => { if (!(p > 1)) return; if (best[i] == null || p > best[i]) { best[i] = p; bestBook[i] = b.book; } sum[i] += p; cnt[i]++; });
  return { best, bestBook, avg: sum.map((s, i) => (cnt[i] ? s / cnt[i] : null)) };
}

/**
 * Κίνηση γραμμής από ιστορικό [ [isoTime, price], ... ] (ταξινομημένο ή όχι)
 * steam = αλλαγή ≥ steamPct % μέσα σε ≤ steamMin λεπτά
 */
export function movement(hist, { steamPct = 4, steamMin = 60 } = {}) {
  const H = [...hist].filter(h => h[1] > 1).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  if (!H.length) return null;
  const open = H[0], cur = H[H.length - 1];
  const prices = H.map(h => h[1]);
  const steams = [];
  for (let i = 1; i < H.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      const dt = (new Date(H[i][0]) - new Date(H[j][0])) / 60000;
      if (dt > steamMin) break;
      const ch = (100 * (H[i][1] - H[j][1])) / H[j][1];
      if (Math.abs(ch) >= steamPct) { steams.push({ from: H[j], to: H[i], pct: Math.round(ch * 10) / 10, min: Math.round(dt) }); break; }
    }
  }
  const lastMove = [...H].reverse().find((h, i, arr) => i + 1 < arr.length && arr[i + 1][1] !== h[1]);
  return { open: open[1], openAt: open[0], current: cur[1], currentAt: cur[0], high: Math.max(...prices), low: Math.min(...prices),
    direction: cur[1] > open[1] ? 'drift' : cur[1] < open[1] ? 'shorten' : 'flat', changePct: Math.round((1000 * (cur[1] - open[1])) / open[1]) / 10,
    lastMoveAt: lastMove ? lastMove[0] : null, steams };
}

// Closing Line Value: model_probability − closing_implied_probability (χωρίς vig), σε ποσοστιαίες μονάδες
export const clv = (model, closingFair) => edgePP(model, closingFair);
export function clvSummary(rows, keyFn = () => 'all') {
  const g = {};
  for (const r of rows) { if (r.clv == null) continue; const k = keyFn(r); (g[k] ||= []).push(r.clv); }
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length, pos: v.filter(x => x > 0).length / v.length }]));
}

// ---- PIR props: κανονική κατανομή από τα P10/P50/P90 της πρόβλεψης
const erf = x => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); };
export const ncdf = x => 0.5 * (1 + erf(x / Math.SQRT2));
export function pirOverProb(line, p10, p50, p90) {
  const sd = Math.max(1, (p90 - p10) / 2.5631); // P90−P10 = 2·1.2816·σ
  return 1 - ncdf((line - p50) / sd);
}
// εσωτερική γραμμή: η πλησιέστερη «μισή» τιμή κάτω από τη διάμεσο (π.χ. 16.4 → 15.5)
export const internalLine = p50 => Math.floor(p50 - 0.5) + 0.5;
export function hitRate(values, line) {
  const v = values.filter(x => x != null);
  return v.length ? v.filter(x => x > line).length / v.length : null;
}
// ρίσκο λεπτών: διακύμανση λεπτών + κατάσταση διαθεσιμότητας
export function minutesRisk(mins, status) {
  if (status === 'injured' || status === 'rest') return 'high';
  const v = mins.filter(m => m > 0);
  if (v.length < 3) return 'high';
  const mu = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length);
  const cv = sd / (mu || 1);
  if (status === 'doubtful' || cv > 0.35 || mu < 15) return 'high';
  return cv > 0.2 ? 'medium' : 'low';
}

// ---- normalisation ενός snapshot παρόχου: idempotent κλειδί
export const snapKey = s => [s.provider, s.event, s.book, s.market, s.sel, s.line ?? '', s.price].join('|');
// προσθέτει μόνο όσα άλλαξαν σε σχέση με την τελευταία γνωστή τιμή κάθε (event, book, market, sel, line)
export function appendChanges(history, snaps) {
  const last = new Map();
  for (const h of history) last.set([h.provider, h.event, h.book, h.market, h.sel, h.line ?? ''].join('|'), h.price);
  const added = [];
  for (const s of snaps) {
    const k = [s.provider, s.event, s.book, s.market, s.sel, s.line ?? ''].join('|');
    if (last.get(k) === s.price) continue;
    last.set(k, s.price); added.push(s);
  }
  return added;
}
