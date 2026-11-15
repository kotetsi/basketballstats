// Odds Intelligence για το build: συνδυάζει αποδόσεις (data/odds) με τον Game Predictor.
import fs from 'node:fs/promises';
import path from 'node:path';
import { devig, edgePP, classify, tier, bestAndAverage, movement, clv, clvSummary, ncdf } from './core.mjs';

const readJSON = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };

export async function loadOdds(ROOT) {
  const dir = path.join(ROOT, 'data', 'odds');
  const latest = await readJSON(path.join(dir, 'latest.json'), null);
  const status = await readJSON(path.join(dir, 'status.json'), null);
  const affiliates = await readJSON(path.join(dir, 'affiliates.json'), {});
  const licensed = await readJSON(path.join(dir, 'licensed.json'), {});
  const plog = await readJSON(path.join(ROOT, 'data', 'matchups', 'pred_log.json'), {});
  const hist = (await fs.readFile(path.join(dir, 'history.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return { latest, status, affiliates, plog, hist, licensed };
}

// σειρά τιμών (μέση τιμή αγοράς σε κάθε στιγμή) για αγώνα/αγορά/επιλογή
function series(hist, gid, market, sel, ok = () => true) {
  const rows = hist.filter(h => h.event === gid && h.market === market && h.sel === sel && ok(h.book)).sort((a, b) => a.seen.localeCompare(b.seen));
  const cur = {}, out = [];
  for (const r of rows) { cur[r.book] = r.price; const v = Object.values(cur); out.push([r.seen, Math.round(1000 * v.reduce((a, b) => a + b, 0) / v.length) / 1000]); }
  // μία τιμή ανά χρονική στιγμή
  return out.filter((x, i) => i === out.length - 1 || out[i + 1][0] !== x[0]);
}
// closing line: η τελευταία τιμή κάθε bookmaker πριν από το τζάμπολ
function closing(hist, gid, market, sels, commence, ok = () => true) {
  const per = {};
  for (const h of hist) if (h.event === gid && h.market === market && h.seen <= commence && ok(h.book)) (per[h.book] ||= {})[h.sel] = h.price;
  const books = Object.values(per).filter(b => sels.every(s => b[s] > 1));
  if (!books.length) return null;
  const fair = sels.map((_, i) => books.map(b => devig(sels.map(s => b[s])).fair[i]).reduce((a, c) => a + c, 0) / books.length);
  return { fair, books: books.length };
}

/**
 * @param pred  πρόβλεψη Game Predictor για τον αγώνα (p_home, margin, total, conf, sim.sigma)
 * @param sig   { margin σ, total σ } από το backtest
 */
export function gameIntel(O, gid, pred, sig, jur) {
  const G = O.latest?.games?.[gid]; if (!G) return null;
  // μόνο bookmakers με άδεια στη χώρα της έκδοσης
  const books = Object.entries(G.books || {}).map(([k, b]) => ({ key: k, ...b })).filter(b => (b.lic || []).includes(jur));
  if (!books.length) return null;
  const okB = new Set(books.map(b => b.key)), ok = k => okB.has(k);
  const ageMin = (Date.now() - new Date(O.latest.updated)) / 60000;
  const out = { gid, updated: O.latest.updated, provider: O.latest.provider, books: books.map(b => ({ key: b.key, title: b.title, upd: b.upd, ml: b.ml, spread: b.spread, total: b.total })) };
  // moneyline
  const mlB = books.filter(b => b.ml?.[0] > 1 && b.ml?.[1] > 1);
  if (mlB.length) {
    const ba = bestAndAverage(mlB.map(b => ({ book: b.title, prices: b.ml })), 2);
    const fairs = mlB.map(b => devig(b.ml).fair), cons = [0, 1].map(i => fairs.reduce((a, f) => a + f[i], 0) / fairs.length);
    const margins = mlB.map(b => devig(b.ml).margin), bestDv = devig(ba.best);
    const model = pred ? [pred.p_home, 1 - pred.p_home] : null;
    out.ml = { best: ba.best, bestBook: ba.bestBook, avg: ba.avg, consensusFair: cons, bestImplied: ba.best.map(p => 1 / p), bestFair: bestDv?.fair, avgMargin: margins.reduce((a, b) => a + b, 0) / margins.length, model,
      edge: model ? model.map((m, i) => edgePP(m, cons[i])) : null };
    if (model) { out.ml.cls = out.ml.edge.map(classify); out.ml.tier = out.ml.edge.map(e => tier(e, pred.conf, ageMin)); }
    out.ml.move = [movement(series(O.hist, gid, 'ml', 'home', ok)), movement(series(O.hist, gid, 'ml', 'away', ok))];
    out.ml.series = [series(O.hist, gid, 'ml', 'home', ok), series(O.hist, gid, 'ml', 'away', ok)];
  }
  // handicap: πιθανότητα κάλυψης από την προβλεπόμενη διαφορά και το σ του backtest
  const spB = books.filter(b => b.spread?.h > 1 && b.spread?.a > 1);
  if (spB.length) {
    const line = spB[0].spread.line, same = spB.filter(b => b.spread.line === line);
    const ba = bestAndAverage(same.map(b => ({ book: b.title, prices: [b.spread.h, b.spread.a] })), 2);
    const cons = [0, 1].map(i => same.map(b => devig([b.spread.h, b.spread.a]).fair[i]).reduce((a, c) => a + c, 0) / same.length);
    const pm = pred ? 1 - ncdf((-line - pred.margin) / (sig.margin || 12)) : null; // γηπεδούχος καλύπτει αν διαφορά > −line
    out.spread = { line, best: ba.best, bestBook: ba.bestBook, avg: ba.avg, consensusFair: cons, model: pm == null ? null : [pm, 1 - pm], edge: pm == null ? null : [edgePP(pm, cons[0]), edgePP(1 - pm, cons[1])] };
    out.spread.move = [movement(series(O.hist, gid, 'spread', 'home', ok))];
  }
  const toB = books.filter(b => b.total?.over > 1 && b.total?.under > 1);
  if (toB.length) {
    const line = toB[0].total.line, same = toB.filter(b => b.total.line === line);
    const ba = bestAndAverage(same.map(b => ({ book: b.title, prices: [b.total.over, b.total.under] })), 2);
    const cons = [0, 1].map(i => same.map(b => devig([b.total.over, b.total.under]).fair[i]).reduce((a, c) => a + c, 0) / same.length);
    const po = pred ? 1 - ncdf((line - pred.total) / (sig.total || 17)) : null;
    out.total = { line, best: ba.best, bestBook: ba.bestBook, avg: ba.avg, consensusFair: cons, model: po == null ? null : [po, 1 - po], edge: po == null ? null : [edgePP(po, cons[0]), edgePP(1 - po, cons[1])] };
    out.total.move = [movement(series(O.hist, gid, 'total', 'over', ok))];
  }
  return out;
}

// Closing Line Value για όλους τους αγώνες που έχουν ξεκινήσει
export function clvReport(O, jur) {
  const lic = new Set(Object.values(O.latest?.games || {}).flatMap(G => Object.entries(G.books || {}).filter(([, b]) => (b.lic || []).includes(jur)).map(([k]) => k)));
  const ok = k => lic.has(k);
  const rows = [];
  const gids = [...new Set(O.hist.map(h => h.event))];
  for (const gid of gids) {
    const lp = O.plog[gid]?.last; if (!lp) continue;
    const commence = O.hist.find(h => h.event === gid)?.t; // ώρα από το πρώτο snapshot (ο πάροχος)
    const c = closing(O.hist, gid, 'ml', ['home', 'away'], O.latest?.games?.[gid]?.commence || commence || '9999', ok);
    if (!c) continue;
    const model = [lp.p, 1 - lp.p];
    const side = model[0] - c.fair[0] >= model[1] - c.fair[1] ? 0 : 1; // η πλευρά που «έβλεπε» το μοντέλο
    const [, r, h, a] = gid.split('-');
    rows.push({ gid, r: +r, h, a, side, model: model[side], closing: c.fair[side], clv: clv(model[side], c.fair[side]), month: (lp.t || '').slice(0, 7), team: side ? a : h });
  }
  return { rows, total: clvSummary(rows), byMonth: clvSummary(rows, x => x.month), byTeam: clvSummary(rows, x => x.team) };
}

/**
 * Απολογισμός μοντέλου στα σύνολα πόντων (Over/Under) από εδώ και πέρα: για κάθε αγώνα που παίχτηκε,
 * η closing κύρια γραμμή (διάμεση των bookmakers της χώρας), οι καλύτερες τιμές σε αυτή, η τελευταία πρόβλεψη
 * του μοντέλου πριν από το τζάμπολ και το τελικό σύνολο. Πλευρά = όπου είναι η πρόβλεψη σε σχέση με τη γραμμή.
 * EV με την ίδια μίξη (μισό μοντέλο, μισό αγορά χωρίς vig) που χρησιμοποιεί και η σελίδα value.
 *  results: { gid: τελικό σύνολο }, sig: σφάλμα συνόλου του backtest
 */
export function totalsReport(O, jur, results, { sig = 17, blend = 0.5 } = {}) {
  const lic = new Set(Object.values(O.latest?.games || {}).flatMap(G => Object.entries(G.books || {}).filter(([, b]) => (b.lic || []).includes(jur)).map(([k]) => k)));
  const rows = [];
  for (const gid of [...new Set(O.hist.filter(h => h.market === 'total').map(h => h.event))]) {
    const y = results[gid], lp = O.plog[gid]?.last;
    if (y == null || lp?.total == null) continue;
    const commence = O.latest?.games?.[gid]?.commence || O.hist.find(h => h.event === gid)?.t || '9999';
    const per = {};
    for (const h of O.hist) if (h.event === gid && h.market === 'total' && h.seen <= commence && lic.has(h.book)) {
      const b = (per[h.book] ||= {}); if (b.line !== h.line) { b.line = h.line; b.over = b.under = null; } b[h.sel] = h.price;
    }
    const books = Object.entries(per).filter(([, b]) => b.over > 1 && b.under > 1);
    if (!books.length) continue;
    const ls = books.map(([, b]) => b.line).sort((a, b) => a - b), line = ls[(ls.length - 1) >> 1];
    const at = books.filter(([, b]) => b.line === line);
    const bo = at.reduce((m, [k, b]) => (b.over > m[0] ? [b.over, k] : m), [0, null]), bu = at.reduce((m, [k, b]) => (b.under > m[0] ? [b.under, k] : m), [0, null]);
    const mk = at.map(([, b]) => devig([b.over, b.under]).fair[0]).reduce((a, c) => a + c, 0) / at.length;
    const pm = 1 - ncdf((line - lp.total) / sig), pb = blend * pm + (1 - blend) * mk;
    const side = lp.total >= line ? 'over' : 'under', price = side === 'over' ? bo[0] : bu[0], book = side === 'over' ? bo[1] : bu[1];
    const p = side === 'over' ? pb : 1 - pb, res = y === line ? 'push' : (y > line) === (side === 'over') ? 'win' : 'loss';
    const [, r, h, a] = gid.split('-');
    rows.push({ gid, r: +r, h, a, line, model: +lp.total.toFixed(1), diff: +(lp.total - line).toFixed(1), side, price, book, ev: p * price - 1, y, res, pnl: res === 'win' ? price - 1 : res === 'loss' ? -1 : 0 });
  }
  const sum = L => { const n = L.filter(x => x.res !== 'push').length, w = L.filter(x => x.res === 'win').length, pnl = L.reduce((a, x) => a + x.pnl, 0); return { n: L.length, w, rate: n ? w / n : null, pnl, roi: L.length ? pnl / L.length : null }; };
  const buckets = [['all', () => true], ['d3', x => Math.abs(x.diff) >= 3], ['d5', x => Math.abs(x.diff) >= 5], ['d7', x => Math.abs(x.diff) >= 7], ['ev8', x => x.ev >= 0.08], ['over', x => x.side === 'over'], ['under', x => x.side === 'under']];
  return { rows: rows.sort((x, y) => y.r - x.r || x.gid.localeCompare(y.gid)), sum: Object.fromEntries(buckets.map(([k, f]) => [k, sum(rows.filter(f))])) };
}
