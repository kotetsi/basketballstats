// EuroLeague Odds & Value Bets για την ελληνική αγορά.
//   - μόνο feeds με επιβεβαιωμένες ελληνικές τιμές (data/odds/bookmakers-gr.json)
//   - EV από το μοντέλο (Game Predictor) ΧΩΡΙΣΤΑ από τις απλές διαφορές τιμών μεταξύ bookmakers
//   - καμία τιμή χωρίς ώρα λήψης· παλιές τιμές σημαίνονται και δεν μετράνε για value
import { devig, ncdf } from './core.mjs';

/** feed → μάρκα, μόνο για feeds με greek_prices = confirmed */
export function confirmedFeeds(reg) {
  const m = new Map();
  for (const [k, b] of Object.entries(reg?.brands || {})) if (b.greek_prices === 'confirmed') for (const f of b.feeds || []) m.set(f, k);
  return m;
}

/** η άδεια «gr» κάθε feed ορίζεται ΜΟΝΟ από το μητρώο (επιβεβαιωμένα ελληνικά feeds) — για όλες τις ελληνικές σελίδες */
export function applyGrRegistry(latest, reg) {
  if (!latest?.games || !reg?.brands) return latest;
  const ok = confirmedFeeds(reg);
  for (const G of Object.values(latest.games)) for (const [k, b] of Object.entries(G.books || {})) {
    const lic = (b.lic || []).filter(j => j !== 'gr');
    if (ok.has(k)) lic.push('gr');
    b.lic = lic;
  }
  return latest;
}

/** κατάσταση δεδομένων κάθε μάρκας: available | no_current_odds | excluded_unconfirmed | no_feed */
export function registryStatus(reg, latest, now = Date.now()) {
  const upcoming = Object.values(latest?.games || {}).filter(G => new Date(G.t) > now);
  return Object.entries(reg?.brands || {}).map(([key, b]) => {
    const feeds = b.feeds || [];
    const games = upcoming.filter(G => feeds.some(f => G.books?.[f] && (G.books[f].ml || G.books[f].spread || G.books[f].total))).length;
    const data_status = b.greek_prices === 'confirmed' ? (games ? 'available' : 'no_current_odds') : b.greek_prices === 'unconfirmed' ? 'excluded_unconfirmed' : 'no_feed';
    return { key, ...b, games, data_status };
  });
}

const r4 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);

/** πιθανότητα μοντέλου για μια επιλογή. ml: [home, away]· spread: ο γηπεδούχος καλύπτει αν διαφορά > −line· total: over */
export function modelProb(pred, market, line, sig) {
  if (!pred) return null;
  if (market === 'ml') return [pred.p_home, 1 - pred.p_home];
  if (market === 'spread') { if (pred.margin == null) return null; const p = 1 - ncdf((-line - pred.margin) / (sig.margin || 12)); return [p, 1 - p]; }
  if (market === 'total') { if (pred.total == null) return null; const p = 1 - ncdf((line - pred.total) / (sig.total || 17)); return [p, 1 - p]; }
  return null;
}
export const fairOdds = p => (p > 0 ? 1 / p : null);
export const evPct = (p, price) => (p == null || !(price > 1) ? null : 100 * (p * price - 1));

const SELS = { ml: ['home', 'away'], spread: ['home', 'away'], total: ['over', 'under'] };
const pricesOf = (b, m) => (m === 'ml' ? (b.ml?.[0] > 1 && b.ml?.[1] > 1 ? { line: null, p: b.ml } : null)
  : m === 'spread' ? (b.spread?.h > 1 && b.spread?.a > 1 ? { line: b.spread.line, p: [b.spread.h, b.spread.a] } : null)
  : (b.total?.over > 1 && b.total?.under > 1 ? { line: b.total.line, p: [b.total.over, b.total.under] } : null));

/**
 * Πίνακας αγώνων.
 * games: προβλέψεις [{comp, r, h, a, t, p_home, margin, total, conf}] (επόμενοι αγώνες) — ο πίνακας εμφανίζει και αγώνες χωρίς αποδόσεις
 * latest: data/odds/latest.json, reg: μητρώο, sig: σφάλματα backtest, staleH: όριο ηλικίας λήψης (ώρες)
 */
export function valueBoard({ games, latest, reg, sig = {}, now = Date.now(), staleH = 12, minEv = 0, days = 8, gapPP = 15 }) {
  const ok = confirmedFeeds(reg), snap = latest?.updated || null;
  const snapAgeH = snap ? (now - new Date(snap)) / 36e5 : null, stale = snapAgeH == null || snapAgeH > staleH;
  const out = [];
  for (const pr of games || []) {
    if (pr.comp && pr.comp !== 'E') continue;
    const gid = `E-${pr.r}-${pr.h}-${pr.a}`, G = latest?.games?.[gid];
    const t = pr.t || G?.t; if (t && new Date(t) <= now) continue;          // ποτέ τιμές αγώνα που ξεκίνησε
    if (t && new Date(t) - now > days * 864e5) continue;
    const books = Object.entries(G?.books || {}).filter(([k]) => ok.has(k)).map(([k, b]) => ({ key: k, brand: ok.get(k), title: reg.brands[ok.get(k)].brand, domain: reg.brands[ok.get(k)].domain, changed: b.upd || null, b }));
    const markets = {};
    for (const m of ['ml', 'spread', 'total']) {
      // ανά γραμμή (διαφορετικοί bookmakers μπορεί να έχουν διαφορετική γραμμή)
      const byLine = {};
      for (const x of books) { const q = pricesOf(x.b, m); if (q) (byLine[q.line ?? '-'] ||= []).push({ ...x, line: q.line, prices: q.p }); }
      const lines = Object.entries(byLine).map(([, rows]) => {
        const line = rows[0].line, model = modelProb(pr, m, line, sig);
        const cons = rows.length >= 2 ? [0, 1].map(i => rows.reduce((s, r) => s + devig(r.prices).fair[i], 0) / rows.length) : null;
        const sel = SELS[m].map((name, i) => {
          const best = rows.reduce((a, r) => (!a || r.prices[i] > a.price ? { price: r.prices[i], brand: r.title } : a), null);
          const p = model ? model[i] : null;
          const flags = [];
          if (p != null && cons && Math.abs(p - cons[i]) * 100 > gapPP) flags.push('gap');        // μεγάλη διαφωνία με την αγορά: πιθανή είδηση που δεν ξέρει το μοντέλο
          if (p != null && !cons && Math.abs(p - devig(rows[0].prices).fair[i]) * 100 > gapPP) flags.push('gap');
          if (pr.conf === 'low') flags.push('low_conf');
          return { name, model: r4(p), fair: r4(fairOdds(p)), best, ev: stale ? null : r4(evPct(p, best?.price)), flags,
            // απλή διαφορά τιμών (χωρίς μοντέλο): καλύτερη τιμή σε σχέση με τη μέση πιθανότητα χωρίς vig των υπόλοιπων
            disc: stale || !cons ? null : r4(100 * (cons[i] * best.price - 1)) };
        });
        return { line, sel, rows: rows.map(r => ({ brand: r.brand, title: r.title, domain: r.domain, prices: r.prices, changed: r.changed, ev: model && !stale ? r.prices.map((p, i) => r4(evPct(model[i], p))) : null })) };
      });
      markets[m] = lines.sort((a, b) => b.rows.length - a.rows.length);
    }
    const value = Object.entries(markets).flatMap(([m, ls]) => ls.flatMap(l => l.sel.filter(s => s.ev != null && s.ev >= minEv * 100 && s.ev > 0).map(s => ({ market: m, line: l.line, ...s }))));
    out.push({ gid, r: pr.r, h: pr.h, a: pr.a, t, conf: pr.conf || null, hasPred: pr.p_home != null, snap, stale, markets, value,
      missing: [...new Set([...ok.values()])].filter(br => !books.some(x => x.brand === br)) });
  }
  return out.sort((a, b) => String(a.t).localeCompare(String(b.t)));
}

/** αξιοπιστία: βαθμονόμηση (walk-forward backtest) + CLV. «reliable» μόνο αν περνά όλα τα όρια */
export function reliability(backtest, clvTotal, { maxEce = 0.05, minN = 500, minClvN = 100 } = {}) {
  const s = backtest?.summary || {}, c = clvTotal?.all || null;
  const checks = {
    calibration: s.ece != null && s.n >= minN ? s.ece <= maxEce : null,
    clv_sample: c ? c.n >= minClvN : false,
    clv_positive: c && c.n >= minClvN ? c.mean > 0 : null,
  };
  const status = checks.calibration && checks.clv_sample && checks.clv_positive ? 'reliable' : 'evaluating';
  return { status, ece: s.ece ?? null, n: s.n ?? null, brier: s.brier ?? null, clv: c, checks, minClvN };
}
