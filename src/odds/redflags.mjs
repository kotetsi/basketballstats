// «Μεγάλες διαφωνίες με την αγορά» (σελίδα Προγνωστικά).
// Αγώνας «κόκκινος» = η πιθανότητα νίκης του Game Predictor απέχει πάνω από RED_PP μονάδες από την
// πιθανότητα της αγοράς χωρίς γκανιότα (μέσος όρος των επιβεβαιωμένων ελληνικών feeds) ΚΑΙ η πλευρά του
// μοντέλου έχει θετική αξία στην καλύτερη ελληνική τιμή.
//   - τρέχοντες αγώνες: από το valueBoard (ίδιο φίλτρο feeds, καμία παλιά τιμή, κανένας αγώνας που ξεκίνησε)
//   - απολογισμός: τελευταία πρόβλεψη πριν από το τζάμπολ (pred_log) απέναντι στις closing τιμές (history.jsonl)
import { devig } from './core.mjs';
import { confirmedFeeds } from './value.mjs';

export const RED_PP = 8;
const r4 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);

/** απόφαση για έναν αγώνα. pHome: μοντέλο· books: [{title, prices:[h,a]}] */
export function judge(pHome, books, { pp = RED_PP } = {}) {
  const rows = (books || []).filter(b => b.prices?.[0] > 1 && b.prices?.[1] > 1);
  if (pHome == null || !rows.length) return null;
  const cons = [0, 1].map(i => rows.reduce((s, b) => s + devig(b.prices).fair[i], 0) / rows.length);
  const model = [pHome, 1 - pHome];
  const best = [0, 1].map(i => rows.reduce((a, b) => (!a || b.prices[i] > a.price ? { price: b.prices[i], book: b.title } : a), null));
  const ev = [0, 1].map(i => model[i] * best[i].price - 1);
  const side = ev[0] >= ev[1] ? 0 : 1;
  const gap = 100 * (model[0] - cons[0]);
  const red = Math.abs(gap) > pp && ev[side] > 0;
  return { red, side, model: r4(model[side]), market: r4(cons[side]), gap: r4(Math.abs(gap)), price: best[side].price, book: best[side].book, ev: r4(100 * ev[side]), books: rows.length };
}

/** τρέχοντες αγώνες από το valueBoard (αγορά ml) */
export function currentFlags(vboard, opts) {
  const out = [];
  for (const g of vboard || []) {
    if (g.stale) continue;
    const ml = g.markets?.ml?.[0]; if (!ml) continue;
    const pHome = ml.sel?.[0]?.model; if (pHome == null) continue;
    const j = judge(pHome, ml.rows.map(r => ({ title: r.title, prices: r.prices })), opts);
    if (j?.red) out.push({ gid: g.gid, r: g.r, h: g.h, a: g.a, t: g.t, conf: g.conf, team: j.side ? g.a : g.h, ...j });
  }
  return out.sort((a, b) => String(a.t).localeCompare(String(b.t)));
}

/**
 * απολογισμός: για κάθε αγώνα που παίχτηκε και έχει πρόβλεψη πριν από το τζάμπολ και closing ελληνικές τιμές.
 * O: loadOdds (latest, hist, plog) · reg: μητρώο · games: league.games [r, w, h, a, hs, as, played]
 * Στοίχημα 1 μονάδα στην καλύτερη closing ελληνική τιμή της πλευράς του μοντέλου.
 */
export function trackRecord(O, reg, games, opts) {
  const ok = confirmedFeeds(reg);
  const res = Object.fromEntries((games || []).filter(g => g[6]).map(g => [`E-${g[0]}-${g[2]}-${g[3]}`, g]));
  const byEv = {};
  for (const h of O?.hist || []) if (h.market === 'ml' && ok.has(h.book)) (byEv[h.event] ||= []).push(h);
  const rows = [];
  for (const [gid, H] of Object.entries(byEv)) {
    const g = res[gid], lp = O?.plog?.[gid]?.last; if (!g || lp?.p == null) continue;
    const tip = O.latest?.games?.[gid]?.commence || H[0].t;
    if (lp.t && tip && new Date(lp.t) > new Date(tip)) continue;              // μόνο πρόβλεψη πριν από το τζάμπολ
    const per = {};
    for (const h of H) if (!tip || h.seen <= tip) { const o = (per[h.book] ||= {}); if (!o[h.sel] || h.seen >= o[h.sel].seen) o[h.sel] = { price: h.price, seen: h.seen }; }
    const books = Object.entries(per).filter(([, b]) => b.home && b.away).map(([k, b]) => ({ title: reg.brands[ok.get(k)]?.brand || k, prices: [b.home.price, b.away.price] }));
    const j = judge(lp.p, books, opts); if (!j?.red) continue;
    const won = j.side === 0 ? g[4] > g[5] : g[5] > g[4];
    rows.push({ gid, r: g[0], h: g[2], a: g[3], hs: g[4], as: g[5], team: j.side ? g[3] : g[2], ...j, won, profit: r4(won ? j.price - 1 : -1) });
  }
  rows.sort((a, b) => b.r - a.r || a.gid.localeCompare(b.gid));
  const n = rows.length, w = rows.filter(x => x.won).length, profit = r4(rows.reduce((s, x) => s + x.profit, 0));
  return { rows, n, won: w, profit, roi: n ? r4(100 * profit / n) : null };
}
