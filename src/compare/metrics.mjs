// Player & Team Comparison: μετρικές, κανονικοποιήσεις, percentiles, radar, παρόμοιοι παίκτες, splits.
// Ίδιος κώδικας σε build, browser και tests.
//
// Γραμμή αγώνα παίκτη (όπως στο data/cache.json):
// [αγωνιστική, ημερομηνία, αντίπαλος, εντός(1/0), σκορ ομάδας, σκορ αντιπάλου, βασικός, δευτερόλεπτα, πόντοι,
//  2πM, 2πA, 3πM, 3πA, βολέςM, βολέςA, OREB, DREB, AST, STL, TOV, BLK, BLKκατά, φάουλ, φάουλ που δέχτηκε, +/-, PIR]
import { LOWER_PLAYER } from './catalog.mjs';

export const R = { round: 0, date: 1, opp: 2, home: 3, ts: 4, os: 5, start: 6, sec: 7, pts: 8, m2: 9, a2: 10, m3: 11, a3: 12, ftm: 13, fta: 14, oreb: 15, dreb: 16, ast: 17, stl: 18, tov: 19, blk: 20, blka: 21, pf: 22, pfd: 23, pm: 24, pir: 25 };
// Σύνολα ομάδας ανά αγώνα: [λεπτά·5 (δευτ.), FGM, FGA, FTA, TOV, OREB, DREB, κατοχές] και ίδια για τον αντίπαλο
export const TG = { sec: 0, fgm: 1, fga: 2, fta: 3, tov: 4, oreb: 5, dreb: 6, poss: 7 };

export const possessions = (fga, oreb, tov, fta) => fga - oreb + tov + 0.44 * fta;
export const per36 = (v, min) => (min > 0 ? (v * 36) / min : null);
export const per100 = (v, poss) => (poss > 0 ? (v * 100) / poss : null);
const div = (a, b) => (b > 0 ? a / b : null);

/**
 * Μετρικές ενός παίκτη από τις γραμμές αγώνων του.
 * @param rows    γραμμές αγώνων (μόνο όσοι αγωνίστηκε μετρούν στα ποσοστά, όλοι στη διαθεσιμότητα)
 * @param teamTot (row) => { own:[...TG], opp:[...TG] } σύνολα ομάδας/αντιπάλου του συγκεκριμένου αγώνα
 * @param teamGames πόσους αγώνες έδωσε η ομάδα (για availability)
 */
export function playerMetrics(rows, teamTot, teamGames) {
  const g = rows.filter(r => r[R.sec] > 0);
  const S = k => g.reduce((a, r) => a + r[R[k]], 0);
  const G = g.length, min = S('sec') / 60;
  const fgm = S('m2') + S('m3'), fga = S('a2') + S('a3'), reb = S('oreb') + S('dreb');
  // ομαδικά σύνολα μόνο στους αγώνες που έπαιξε
  let tMin = 0, tFgm = 0, tFga = 0, tFta = 0, tTov = 0, tOreb = 0, tDreb = 0, oOreb = 0, oDreb = 0, tPoss = 0, oFga = 0, oPoss = 0, onPoss = 0;
  for (const r of g) {
    const t = teamTot ? teamTot(r) : null; if (!t) continue;
    const share = r[R.sec] / (t.own[TG.sec] || 12000);
    tMin += t.own[TG.sec] / 60; tFgm += t.own[TG.fgm]; tFga += t.own[TG.fga]; tFta += t.own[TG.fta]; tTov += t.own[TG.tov];
    tOreb += t.own[TG.oreb]; tDreb += t.own[TG.dreb]; oOreb += t.opp[TG.oreb]; oDreb += t.opp[TG.dreb];
    tPoss += t.own[TG.poss]; oPoss += t.opp[TG.poss]; oFga += t.opp[TG.fga];
    onPoss += 5 * share * (t.own[TG.poss] + t.opp[TG.poss]) / 2;   // κατοχές της ομάδας με τον παίκτη στο παρκέ (εκτίμηση από τα λεπτά)
  }
  const tsa = fga + 0.44 * S('fta');
  const m = {
    G, mpg: div(min, G), min,
    pts: div(S('pts'), G), reb: div(reb, G), oreb: div(S('oreb'), G), dreb: div(S('dreb'), G), ast: div(S('ast'), G), stl: div(S('stl'), G), blk: div(S('blk'), G),
    tov: div(S('tov'), G), pf: div(S('pf'), G), pir: div(S('pir'), G),
    pir36: per36(S('pir'), min), pirmin: div(S('pir'), min),
    fg: div(fgm, fga), p3: div(S('m3'), S('a3')), ft: div(S('ftm'), S('fta')), p2: div(S('m2'), S('a2')),
    ts: div(S('pts'), 2 * tsa), efg: div(fgm + 0.5 * S('m3'), fga), tsa36: per36(tsa, min),
    a3rate: div(S('a3'), fga), ftr: div(S('fta'), fga),
    avail: teamGames ? Math.min(1, G / teamGames) : null,
    pm: div(S('pm'), G), starts: div(g.filter(r => r[R.start]).length, G), astto: div(S('ast'), S('tov')),
  };
  // usage, AST%, TOV%, rebound rate (τύποι Basketball-Reference, με τα σύνολα ομάδας)
  if (tMin > 0 && min > 0) {
    const tm5 = tMin / 5;
    m.usg = div((fga + 0.44 * S('fta') + S('tov')) * tm5, min * (tFga + 0.44 * tFta + tTov));
    m.astp = div(S('ast'), (min / tm5) * tFgm - fgm);
    m.tovp = div(S('tov'), fga + 0.44 * S('fta') + S('tov'));
    m.rebp = div(reb * tm5, min * (tOreb + tDreb + oOreb + oDreb));
    m.orebp = div(S('oreb') * tm5, min * (tOreb + oDreb));
    m.drebp = div(S('dreb') * tm5, min * (tDreb + oOreb));
    m.stlp = div(S('stl') * tm5, min * oPoss);
    m.blkp = div(S('blk') * tm5, min * oFga);
    m.onPoss = onPoss;
    for (const k of ['pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pir']) m[k + '100'] = per100(S(k === 'reb' ? 'oreb' : k) + (k === 'reb' ? S('dreb') : 0), onPoss);
  }
  for (const k of ['pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf']) m[k + '36'] = per36(k === 'reb' ? reb : S(k), min);
  return m;
}

// Percentile (0-100) μιας τιμής ανάμεσα σε άλλες. lowerBetter για λάθη, φάουλ, DRtg.
export function percentileRank(values, v, lowerBetter = false) {
  const xs = values.filter(x => x != null && Number.isFinite(x));
  if (v == null || !Number.isFinite(v) || xs.length < 2) return null;
  let below = 0, eq = 0;
  for (const x of xs) { if (lowerBetter ? x > v : x < v) below++; else if (x === v) eq++; }
  return Math.round((100 * (below + 0.5 * Math.max(0, eq - 1))) / (xs.length - 1));
}

// από τον κεντρικό κατάλογο (catalog.mjs): λάθη, φάουλ, TOV%, DRtg
export const LOWER_BETTER = LOWER_PLAYER;

// Ομάδες θέσεων για το baseline
export const posGroup = pos => (/guard/i.test(pos || '') ? 'G' : /center/i.test(pos || '') ? 'C' : /forward/i.test(pos || '') ? 'F' : '');

// Radar: 8 κατηγορίες, η καθεμία = μέσος όρος percentiles των metrics της (0-100)
export const RADAR = {
  scoring: ['pts36', 'tsa36', 'usg'], playmaking: ['ast36', 'astp'], rebounding: ['reb36', 'rebp'], defense: ['stl36', 'blk36', 'stlp', 'blkp'],
  efficiency: ['ts', 'efg', 'pirmin'], availability: ['avail', 'mpg'], versatility: ['_vers'], impact: ['net', 'pm', 'pir36'],
};

// pool: [{id, pos, m}] · επιστρέφει { [id]: { metric: pct } } και τα radar scores
export function percentilesFor(pool, keys, group = 'all') {
  const base = group === 'all' ? pool : pool.filter(p => posGroup(p.pos) === group);
  const out = {};
  for (const k of keys) {
    const vals = base.map(p => p.m[k]);
    for (const p of pool) (out[p.id] ||= {})[k] = percentileRank(vals, p.m[k], LOWER_BETTER.has(k));
  }
  return out;
}
export function radarScores(pct) {
  const r = {};
  for (const [cat, ks] of Object.entries(RADAR)) {
    if (cat === 'versatility') {
      // ευελιξία: πόσες από τις βασικές κατηγορίες (πόντοι, ριμπάουντ, ασίστ, κλεψίματα, κοψίματα) είναι πάνω από το 50ό percentile
      const b = ['pts36', 'reb36', 'ast36', 'stl36', 'blk36'].map(k => pct[k]).filter(v => v != null);
      r[cat] = b.length ? Math.round(100 * b.filter(v => v >= 50).length / b.length) : null; continue;
    }
    const v = ks.map(k => pct[k]).filter(x => x != null);
    r[cat] = v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  }
  return r;
}

// Παρόμοιοι παίκτες: cosine similarity σε z-scores επιλεγμένων χαρακτηριστικών (+ βάρος για ίδια θέση)
export const SIM_KEYS = ['usg', 'pirmin', 'ts', 'astp', 'rebp', 'mpg', 'stlp', 'blkp', 'a3rate', 'ftr', 'tovp'];
export function similarPlayers(pool, id, n = 8, keys = SIM_KEYS) {
  const mu = {}, sd = {};
  for (const k of keys) {
    const xs = pool.map(p => p.m[k]).filter(x => x != null);
    mu[k] = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    sd[k] = Math.sqrt(xs.reduce((a, b) => a + (b - mu[k]) ** 2, 0) / (xs.length || 1)) || 1;
  }
  const vec = p => keys.map(k => (p.m[k] == null ? 0 : (p.m[k] - mu[k]) / sd[k]));
  const me = pool.find(p => p.id === id); if (!me) return [];
  const a = vec(me), na = Math.hypot(...a) || 1;
  return pool.filter(p => p.id !== id).map(p => {
    const b = vec(p), nb = Math.hypot(...b) || 1;
    let cos = a.reduce((s, v, i) => s + v * b[i], 0) / (na * nb);
    if (posGroup(p.pos) && posGroup(p.pos) === posGroup(me.pos)) cos += 0.05;
    return { id: p.id, sim: cos };
  }).sort((x, y) => y.sim - x.sim).slice(0, n).map(x => ({ ...x, sim: Math.round(1000 * Math.min(1, x.sim)) / 1000 }));
}

// Splits: φίλτρα πάνω στις γραμμές αγώνων
export function splitRows(rows, kind, ctx = {}) {
  const played = rows.filter(r => r[R.sec] > 0);
  switch (kind) {
    case 'home': return rows.filter(r => r[R.home]);
    case 'away': return rows.filter(r => !r[R.home]);
    case 'wins': return rows.filter(r => r[R.ts] > r[R.os]);
    case 'losses': return rows.filter(r => r[R.ts] < r[R.os]);
    case 'l5': return played.slice(-5);
    case 'l10': return played.slice(-10);
    case 'l20': return played.slice(-20);
    case 'top4': return rows.filter(r => (ctx.top4 || []).includes(r[R.opp]));
    case 'bottom4': return rows.filter(r => (ctx.bottom4 || []).includes(r[R.opp]));
    case 'b2b': return rows.filter((r, i) => i > 0 && dayDiff(rows[i - 1][R.date], r[R.date]) <= 2);
    case 'rs': return rows.filter(r => r[R.round] <= (ctx.rsMax || 34));
    case 'po': return rows.filter(r => r[R.round] > (ctx.rsMax || 34));
    default: return rows;
  }
}
const dayDiff = (a, b) => (new Date(b) - new Date(a)) / 864e5;

// Αυτόματη πρόταση σύγκρισης δύο παικτών (ποιος υπερέχει πού)
export function compareSentence(A, B, names, L, keys = ['pirmin', 'ts', 'usg', 'ast36', 'reb36', 'efg', 'pts36', 'stl36']) {
  const better = (k, a, b) => (a == null || b == null ? 0 : LOWER_BETTER.has(k) ? Math.sign(b - a) : Math.sign(a - b));
  const relDiff = (a, b) => Math.abs(a - b) / ((Math.abs(a) + Math.abs(b)) / 2 || 1);
  const ranked = keys.filter(k => A[k] != null && B[k] != null && relDiff(A[k], B[k]) > 0.05).map(k => ({ k, w: better(k, A[k], B[k]), d: relDiff(A[k], B[k]) })).sort((x, y) => y.d - x.d);
  const aw = ranked.filter(x => x.w > 0).slice(0, 2).map(x => L[x.k]), bw = ranked.filter(x => x.w < 0).slice(0, 2).map(x => L[x.k]);
  if (!aw.length && !bw.length) return L._even.replace('{a}', names[0]).replace('{b}', names[1]);
  if (aw.length && bw.length) return L._both.replace('{a}', names[0]).replace('{x}', aw.join(L._and)).replace('{b}', names[1]).replace('{y}', bw.join(L._and));
  const [n, w] = aw.length ? [names[0], aw] : [names[1], bw];
  return L._one.replace('{a}', n).replace('{x}', w.join(L._and));
}

// Σύνολα ομάδας ανά αγώνα από τα game logs όλων των παικτών: { 'ΟΜΑΔΑ|αγωνιστική': { own, opp } }
export function teamTotals(players) {
  const T = {};
  const add = (tm, r) => {
    const k = tm + '|' + r[R.round];
    const a = (T[k] ||= { team: tm, opp: r[R.opp], round: r[R.round], s: [0, 0, 0, 0, 0, 0, 0, 0] });
    a.s[TG.sec] += r[R.sec]; a.s[TG.fgm] += r[R.m2] + r[R.m3]; a.s[TG.fga] += r[R.a2] + r[R.a3]; a.s[TG.fta] += r[R.fta];
    a.s[TG.tov] += r[R.tov]; a.s[TG.oreb] += r[R.oreb]; a.s[TG.dreb] += r[R.dreb];
  };
  const multi = [];
  for (const p of players) for (const r of p.g) {
    if (!(r[R.sec] > 0)) continue;
    if (p.t.includes(';')) multi.push([p, r]); else add(p.t, r);
  }
  // παίκτες που άλλαξαν ομάδα: η γραμμή πάει στην ομάδα που εκείνη την αγωνιστική έπαιξε με τον ίδιο αντίπαλο
  for (const [p, r] of multi) { const tm = p.t.split(';').find(t => T[t + '|' + r[R.round]]?.opp === r[R.opp]); if (tm) add(tm, r); }
  for (const a of Object.values(T)) a.s[TG.poss] = possessions(a.s[TG.fga], a.s[TG.oreb], a.s[TG.tov], a.s[TG.fta]);
  const out = {};
  for (const [k, a] of Object.entries(T)) { const o = T[a.opp + '|' + a.round]; if (o) out[k] = { own: a.s, opp: o.s }; }
  return out;
}
export const teamOfRow = (p, r, TT) => p.t.split(';').find(t => TT[t + '|' + r[R.round]]) || p.t.split(';').pop();
