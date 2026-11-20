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
  return { best: best.map(b => b.price), books: best.map(b => b.book), p: r4(pm), n: L.length, ah: ahSnap(oddsGame, ok) };
}

/** κύρια γραμμή χάντικαπ (γηπεδούχου) στα επιβεβαιωμένα feeds: η πιο συχνή γραμμή, με την καλύτερη τιμή ανά πλευρά */
export function ahSnap(oddsGame, ok) {
  const S = Object.entries(oddsGame?.books || {}).filter(([k, b]) => (!ok || ok.has(k)) && b.spread?.line != null && b.spread.h > 1 && b.spread.a > 1);
  if (!S.length) return null;
  const cnt = {};
  for (const [, b] of S) cnt[b.spread.line] = (cnt[b.spread.line] || 0) + 1;
  const line = +Object.entries(cnt).sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))[0][0];
  const L = S.filter(([, b]) => b.spread.line === line);
  return { line, best: [Math.max(...L.map(([, b]) => b.spread.h)), Math.max(...L.map(([, b]) => b.spread.a))], n: L.length };
}

/** επιλογή χάντικαπ: όταν η προβλεπόμενη διαφορά απέχει AH_MIN+ πόντους από τη γραμμή (backtest 3 σεζόν: +5% σε ~250 επιλογές, όχι ακόμα αποδεδειγμένο) */
export const AH_MIN = 3;
export function ahPick(margin, ah) {
  if (margin == null || !ah) return null;
  const edge = margin + ah.line;
  if (Math.abs(edge) < AH_MIN) return null;
  const side = edge > 0 ? 0 : 1;
  return { side, line: ah.line, price: ah.best[side], edge: Math.round(edge * 10) / 10 };
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
  const closeAh = {};
  for (const h of O?.hist || []) {
    if (h.market !== 'spread' || h.sel !== 'home' || (ok && !ok.has(h.book))) continue;
    const e = lastPre[h.event]; if (!e || h.seen > e.tip) continue;
    const b = ((closeAh[h.event] ||= {})[h.book]);
    if (!b || h.seen >= b.seen) closeAh[h.event][h.book] = { line: h.line, seen: h.seen };
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
    const ap = ahPick(e.margin, e.mkt?.ah);
    if (ap) {
      const d = g[4] - g[5] + ap.line, cover = ap.side === 0 ? d > 0 : d < 0;
      const cl = Object.values(closeAh[gid] || {}).map(x => x.line);
      const lc = cl.length ? cl.sort((a, b) => a - b)[Math.floor(cl.length / 2)] : null;
      row.ah = { ...ap, push: d === 0, won: d !== 0 && cover, profit: d === 0 ? 0 : r4(cover ? ap.price - 1 : -1), clvPts: lc == null ? null : (ap.side === 0 ? ap.line - lc : lc - ap.line) };
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
    ...(() => { const A = rows.filter(x => x.ah), Ac = A.filter(x => x.ah.clvPts != null);
      return { ahN: A.length, ahWon: A.filter(x => x.ah.won).length, ahProfit: r4(A.reduce((s, x) => s + x.ah.profit, 0)), ahRoi: A.length ? r4(100 * A.reduce((s, x) => s + x.ah.profit, 0) / A.length) : null, ahClv: Ac.length ? r4(Ac.reduce((s, x) => s + x.ah.clvPts, 0) / Ac.length) : null }; })(),
    rows,
  };
}
