// Prop Analyzer: καθαροί υπολογισμοί (ίδιοι στον browser και στα tests).
// Γραμμή αγώνα στο assets/props/data.json (cols):
//   0 αγωνιστική, 1 ημερομηνία, 2 αντίπαλος, 3 έδρα(1/0), 4 νίκη(1/0), 5 βασικός(1/0), 6 λεπτά, 7 πόντοι, 8 ριμπάουντ,
//   9 ασίστ, 10 τρίποντα, 11 κλεψίματα, 12 κοψίματα, 13 λάθη, 14 PIR, 15 σκορ ομάδας, 16 σκορ αντιπάλου
import { pOver, noVig, ev } from './model.mjs';

export const VAL = {
  pts: r => r[7], reb: r => r[8], ast: r => r[9], fg3: r => r[10], pr: r => r[7] + r[8], pa: r => r[7] + r[9],
  pra: r => r[7] + r[8] + r[9], ar: r => r[8] + r[9], stl: r => r[11], blk: r => r[12], pir: r => r[14],
};
/** stats με πρόβλεψη μοντέλου (και αγορές στους bookmakers)· τα υπόλοιπα μόνο με ιστορικό */
export const MODEL_STATS = ['pts', 'reb', 'ast', 'fg3', 'pr', 'pa', 'pra', 'ar'];
export const ALL_STATS = [...MODEL_STATS, 'stl', 'blk', 'pir'];

/** over/under/push· push μόνο σε ακέραια γραμμή. rate = ποσοστό της πλευράς (χωρίς τα push) */
export function hits(values, line, side = 'over') {
  let o = 0, u = 0, p = 0;
  for (const v of values) { if (v > line) o++; else if (v < line) u++; else p++; }
  const n = values.length, d = n - p, w = side === 'over' ? o : u;
  return { n, over: o, under: u, push: p, win: w, rate: d ? w / d : null };
}

/** φίλτρα αγώνων: range (5/10/20/0 = όλοι), venue (home/away), role (start/bench), without (σύνολο αγωνιστικών χωρίς τον συμπαίκτη), opp */
export function filterGames(g, { range = 0, venue = 'all', role = 'all', without = null, opp = null } = {}) {
  let x = g.filter(r => (venue === 'all' || (venue === 'home' ? r[3] === 1 : r[3] === 0))
    && (role === 'all' || (role === 'start' ? r[5] === 1 : r[5] === 0))
    && (!without || without.has(r[0])) && (!opp || r[2] === opp));
  if (range > 0) x = x.slice(-range);
  return x;
}

/** αγωνιστικές όπου ο παίκτης έπαιξε ενώ ο συμπαίκτης όχι */
export function roundsWithout(player, mate) {
  const m = new Set(mate.g.map(r => r[0]));
  return new Set(player.g.map(r => r[0]).filter(r => !m.has(r)));
}

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export function median(xs) { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; }

/** σύνοψη: hit rates σε L5/L10/L20/σεζόν, έδρα/εκτός (όπως ο επόμενος αγώνας), με τον αντίπαλο, μ.ο. και διάμεσος */
export function summary(player, stat, line, { side = 'over', next = null } = {}) {
  const f = VAL[stat], g = player.g, v = rows => rows.map(f);
  const out = {
    L5: hits(v(g.slice(-5)), line, side), L10: hits(v(g.slice(-10)), line, side), L20: hits(v(g.slice(-20)), line, side), all: hits(v(g), line, side),
    avg: mean(v(g)), l5avg: mean(v(g.slice(-5))), med: median(v(g)), min: mean(g.map(r => r[6])), l5min: mean(g.slice(-5).map(r => r[6])),
  };
  if (next) {
    out.venue = hits(v(g.filter(r => r[3] === next.home)), line, side);
    out.h2h = hits(v(g.filter(r => r[2] === next.opp)), line, side);
  }
  return out;
}

/** γραμμή μοντέλου όταν δεν υπάρχει bookmaker: η μισή γραμμή κάτω από την πρόβλεψη (όπως οι εσωτερικές γραμμές του site) */
export const modelLine = mu => Math.max(0.5, Math.floor(mu) + 0.5);

/** κύρια γραμμή bookmaker για (παίκτη, stat): με τιμές και στις δύο πλευρές, όσο πιο κοντά στο 50-50 */
export function mainLine(lines) {
  if (!lines?.length) return null;
  const sc = x => { const nv = x.o && x.u ? noVig(x.o[0], x.u[0]) : null; return nv ? Math.abs(nv.over - 0.5) : 1 + (x.o ? 0 : 0.5); };
  return lines.slice().sort((a, b) => sc(a) - sc(b) || a.l - b.l)[0];
}

/** μοντέλο σε μια γραμμή: πιθανότητα, δίκαιη απόδοση και (με τιμές bookmaker) αγορά χωρίς vig, μικτή πιθανότητα και EV.
 *  pj = [mu, var], book = { o: [τιμή, ...], u: [τιμή, ...] } (καλύτερες τιμές), blend = βάρος μοντέλου */
export function evaluate(pj, line, book = null, blend = 0.5) {
  const res = { pm: null, mk: null, pb: null, evO: null, evU: null };
  if (pj) res.pm = pOver(pj[0], pj[1], line);
  if (book?.o && book?.u) { const nv = noVig(book.o[0], book.u[0]); if (nv) res.mk = nv.over; }
  if (res.pm != null) {
    res.pb = res.mk == null ? res.pm : blend * res.pm + (1 - blend) * res.mk;
    if (book?.o) res.evO = ev(res.pb, book.o[0]);
    if (book?.u) res.evU = ev(1 - res.pb, book.u[0]);
  }
  return res;
}

/** πίνακας: μία γραμμή ανά (παίκτη, stat) με επόμενο αγώνα. Γραμμή bookmaker όταν υπάρχει (κύρια), αλλιώς γραμμή μοντέλου.
 *  Πλευρά = όπου γέρνει η πιθανότητα (μικτή με την αγορά όταν υπάρχει). lines: { 'code|stat': [γραμμές] } */
export function board(D, lines, { stats = MODEL_STATS, blend = D.blend ?? 0.5, minGames = 5, minMin = 12, minLine = 1.5 } = {}) {
  const rows = [];
  for (const p of D.players) {
    const nx = D.next[p.t]; if (!nx || p.out || p.g.length < 3) continue;
    // γραμμές μοντέλου μόνο για παίκτες με ρόλο και δείγμα (αλλιώς ο πίνακας γεμίζει «Under 0.5» παικτών του πάγκου)
    const solid = p.g.length >= minGames && (p.min ?? 0) >= minMin;
    for (const s of stats) {
      const pj = p.pj?.[s], L = lines[`${p.c}|${s}`] || [], m = mainLine(L);
      if (!pj && !m) continue;
      if (!m && (!solid || modelLine(pj[0]) < minLine)) continue;
      const line = m ? m.l : modelLine(pj[0]);
      const E = evaluate(pj, line, m, blend);
      const pOv = E.pb ?? E.pm; if (pOv == null) continue;
      const side = pOv >= 0.5 ? 'over' : 'under', S = summary(p, s, line, { side, next: nx });
      rows.push({ c: p.c, t: p.t, s, line, src: m ? 'book' : 'model', side, p: side === 'over' ? pOv : 1 - pOv, mu: pj ? pj[0] : null,
        L5: S.L5, L10: S.L10, all: S.all, h2h: S.h2h, avg: S.avg, gid: nx.gid,
        price: m ? (side === 'over' ? m.o?.[0] : m.u?.[0]) ?? null : null, book: m ? (side === 'over' ? m.o?.[1] : m.u?.[1]) ?? null : null,
        ev: m ? (side === 'over' ? E.evO : E.evU) : null });
    }
  }
  return rows;
}
