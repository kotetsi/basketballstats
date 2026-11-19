// Δημόσιο, αμετάβλητο αρχείο προβλέψεων (track record για επενδυτές).
// Κάθε γραμμή του data/ledger/predictions.jsonl είναι μία πρόβλεψη ΠΡΙΝ από το τζάμπολ, με:
//   - ώρα καταγραφής (t), αγώνα, έκδοση μοντέλου, πιθανότητα, διαφορά, σύνολο
//   - την καλύτερη ελληνική τιμή εκείνη τη στιγμή (για CLV αργότερα)
//   - prev = hash της προηγούμενης γραμμής, hash = sha256(prev + περιεχόμενο)
// Αν κάποιος αλλάξει ή σβήσει μια παλιά γραμμή, όλα τα επόμενα hash σπάνε (verifyChain).
// Μαζί με τα commits του git (χρονοσφραγίδα GitHub) αποδεικνύεται ότι η πρόβλεψη υπήρχε πριν από τον αγώνα.
import { createHash } from 'node:crypto';
import { devig } from './core.mjs';
import { confirmedFeeds } from './value.mjs';

const r4 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
export const GENESIS = '0'.repeat(64);
const FIELDS = ['seq', 't', 'gid', 'comp', 'tip', 'mv', 'p', 'margin', 'total', 'mkt', 'prev'];

export function canon(e) { return JSON.stringify(FIELDS.map(k => e[k] ?? null)); }
export function hashOf(e) { return createHash('sha256').update(e.prev + canon(e)).digest('hex'); }

/** καλύτερη τιμή και αγορά χωρίς γκανιότα από τα επιβεβαιωμένα ελληνικά feeds τη στιγμή της πρόβλεψης */
export function marketSnap(oddsGame, reg) {
  if (!oddsGame?.books) return null;
  const ok = reg ? confirmedFeeds(reg) : null;
  const L = Object.entries(oddsGame.books).filter(([k, b]) => (!ok || ok.has(k)) && b.ml?.[0] > 1 && b.ml?.[1] > 1);
  if (!L.length) return null;
  const best = [0, 1].map(i => L.reduce((m, [k, b]) => (b.ml[i] > m.price ? { price: b.ml[i], book: b.title || k } : m), { price: 0 }));
  const fair = L.map(([, b]) => devig(b.ml)?.fair).filter(Boolean);
  const pm = fair.length ? fair.reduce((s, f) => s + f[0], 0) / fair.length : null;
  return { best: best.map(b => b.price), books: best.map(b => b.book), p: r4(pm), n: L.length };
}

/**
 * Νέες γραμμές για το ledger. Γράφεται γραμμή μόνο αν ο αγώνας δεν έχει ξεκινήσει και η πρόβλεψη
 * (ή η έκδοση του μοντέλου) άλλαξε από την τελευταία καταγραφή του ίδιου αγώνα.
 */
export function appendEntries(lines, preds, oddsLatest, reg, now = new Date()) {
  const last = lines.at(-1);
  let prev = last ? last.hash : GENESIS, seq = last ? last.seq + 1 : 0;
  const lastBy = {};
  for (const e of lines) lastBy[e.gid] = e;
  const out = [];
  const t = new Date(now).toISOString().replace(/\.\d+Z$/, 'Z');
  for (const g of [...(preds?.games || [])].sort((a, b) => a.t.localeCompare(b.t) || a.h.localeCompare(b.h))) {
    if (new Date(g.t) <= now) continue;
    const gid = `${g.comp}-${g.r}-${g.h}-${g.a}`;
    const p = r4(g.p_home), mv = preds.model_version || null;
    const o = lastBy[gid];
    if (o && o.p === p && o.mv === mv && o.total === g.total && o.margin === g.margin) continue;
    const e = { seq, t, gid, comp: g.comp, tip: g.t, mv, p, margin: g.margin, total: g.total, mkt: marketSnap(oddsLatest?.games?.[gid], reg), prev };
    e.hash = hashOf(e);
    out.push(e); lastBy[gid] = e; prev = e.hash; seq++;
  }
  return out;
}

/** έλεγχος αλυσίδας: επιστρέφει { ok, n, head, bad } */
export function verifyChain(lines) {
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    const e = lines[i];
    if (e.seq !== i || e.prev !== prev || hashOf(e) !== e.hash) return { ok: false, n: lines.length, bad: i, head: null };
    prev = e.hash;
  }
  return { ok: true, n: lines.length, head: prev, bad: null };
}

export function parseLedger(txt) { return (txt || '').split('\n').filter(Boolean).map(l => JSON.parse(l)); }

const ll = (y, p) => -(y * Math.log(Math.max(p, 1e-6)) + (1 - y) * Math.log(Math.max(1 - p, 1e-6)));

/**
 * Απολογισμός: για κάθε τελειωμένο αγώνα EuroLeague η ΤΕΛΕΥΤΑΙΑ γραμμή του ledger πριν από το τζάμπολ,
 * απέναντι στο αποτέλεσμα και στις closing τιμές των επιβεβαιωμένων ελληνικών feeds (history.jsonl).
 * - accuracy / log loss μοντέλου και αγοράς κλεισίματος (το πραγματικό benchmark)
 * - «στοίχημα» = πλευρά με θετική αξία στην καλύτερη τιμή τη στιγμή της καταγραφής· CLV = τιμή καταγραφής / closing χωρίς γκανιότα − 1
 */
export function ledgerReport(lines, O, reg, games, { minEv = 0 } = {}) {
  const ok = reg ? confirmedFeeds(reg) : null;
  const res = Object.fromEntries((games || []).filter(g => g[6]).map(g => [`E-${g[0]}-${g[2]}-${g[3]}`, g]));
  const lastPre = {};
  for (const e of lines) if (e.comp === 'E' && e.t < e.tip) lastPre[e.gid] = e;
  const close = {};
  for (const h of O?.hist || []) {
    if (h.market !== 'ml' || (ok && !ok.has(h.book))) continue;
    const e = lastPre[h.event]; if (!e || h.seen > e.tip) continue;
    const b = ((close[h.event] ||= {})[h.book] ||= {});
    if (!b[h.sel] || h.seen >= b[h.sel].seen) b[h.sel] = { price: h.price, seen: h.seen };
  }
  const rows = [];
  for (const [gid, e] of Object.entries(lastPre)) {
    const g = res[gid]; if (!g) continue;
    const y = g[4] > g[5] ? 1 : 0;
    const C = Object.values(close[gid] || {}).filter(b => b.home && b.away).map(b => devig([b.home.price, b.away.price])?.fair).filter(Boolean);
    const pc = C.length ? C.reduce((s, f) => s + f[0], 0) / C.length : null;
    const row = { gid, r: g[0], h: g[2], a: g[3], hs: g[4], as: g[5], t: e.t, seq: e.seq, p: e.p, pc: r4(pc), hit: (e.p >= 0.5 ? 1 : 0) === y, ll: r4(ll(y, e.p)), llc: pc == null ? null : r4(ll(y, pc)) };
    if (e.mkt?.best) {
      const ev = [e.p * e.mkt.best[0] - 1, (1 - e.p) * e.mkt.best[1] - 1];
      const s = ev[0] >= ev[1] ? 0 : 1;
      if (ev[s] > minEv) {
        const won = s === 0 ? y === 1 : y === 0, price = e.mkt.best[s];
        row.bet = { side: s, price, book: e.mkt.books?.[s], ev: r4(ev[s]), won, profit: r4(won ? price - 1 : -1), clv: pc == null ? null : r4(price * (s === 0 ? pc : 1 - pc) - 1) };
      }
    }
    rows.push(row);
  }
  rows.sort((a, b) => b.r - a.r || a.gid.localeCompare(b.gid));
  const n = rows.length, wc = rows.filter(x => x.llc != null);
  const bets = rows.filter(x => x.bet), bc = bets.filter(x => x.bet.clv != null);
  const avg = (L, f) => (L.length ? r4(L.reduce((s, x) => s + f(x), 0) / L.length) : null);
  return {
    n, acc: avg(rows, x => +x.hit), ll: avg(rows, x => x.ll),
    nc: wc.length, llModelVsClose: avg(wc, x => x.ll), llClose: avg(wc, x => x.llc), accClose: avg(wc, x => +((x.pc >= 0.5 ? 1 : 0) === (x.hs > x.as ? 1 : 0))),
    bets: bets.length, won: bets.filter(x => x.bet.won).length, profit: r4(bets.reduce((s, x) => s + x.bet.profit, 0)),
    roi: bets.length ? r4(100 * bets.reduce((s, x) => s + x.bet.profit, 0) / bets.length) : null,
    clvN: bc.length, clv: avg(bc, x => x.bet.clv), clvPos: bc.length ? r4(bc.filter(x => x.bet.clv > 0).length / bc.length) : null,
    rows,
  };
}
