// Προχωρημένοι δείκτες ομάδων, lineups και on/off. Ίδιος κώδικας για build και browser.
// Είσοδος: αθροισμένα στατιστικά (own, opp) στη σειρά του SK, και δευτερόλεπτα.

export const SK = ['pts', 'fgm2', 'fga2', 'fgm3', 'fga3', 'ftm', 'fta', 'oreb', 'dreb', 'tov', 'ast', 'stl', 'blk', 'pf'];
export const I = Object.fromEntries(SK.map((k, i) => [k, i]));
export const zero = () => new Array(SK.length).fill(0);
export const add = (a, b) => { for (let i = 0; i < a.length; i++) a[i] += b[i] || 0; return a; };

const fgm = s => s[I.fgm2] + s[I.fgm3];
const fga = s => s[I.fga2] + s[I.fga3];
const div = (a, b) => (b > 0 ? a / b : null);

// Κατοχές με τον τυπικό τύπο: FGA − OREB + TOV + 0.44·FTA
export const possessions = s => fga(s) - s[I.oreb] + s[I.tov] + 0.44 * s[I.fta];

/**
 * @param own  στατιστικά της ομάδας / του lineup
 * @param opp  στατιστικά του αντιπάλου στο ίδιο διάστημα
 * @param secs δευτερόλεπτα (για pace)
 */
export function rate(own, opp, secs) {
  const pO = possessions(own), pD = possessions(opp);
  const poss = (pO + pD) / 2; // μέσος όρος των δύο πλευρών: σταθερότερη εκτίμηση
  const r = {
    secs, min: secs / 60, poss,
    pts: own[I.pts], ptsA: opp[I.pts],
    ortg: div(own[I.pts] * 100, poss), drtg: div(opp[I.pts] * 100, poss),
    pace: secs > 0 ? poss * 40 * 60 / secs : null,
    ppp: div(own[I.pts], poss),
    efg: div(fgm(own) + 0.5 * own[I.fgm3], fga(own)), oefg: div(fgm(opp) + 0.5 * opp[I.fgm3], fga(opp)),
    ts: div(own[I.pts], 2 * (fga(own) + 0.44 * own[I.fta])), ots: div(opp[I.pts], 2 * (fga(opp) + 0.44 * opp[I.fta])),
    ast: div(own[I.ast], fgm(own)),
    tov: div(own[I.tov], poss), otov: div(opp[I.tov], poss),
    oreb: div(own[I.oreb], own[I.oreb] + opp[I.dreb]), dreb: div(own[I.dreb], own[I.dreb] + opp[I.oreb]),
    ooreb: div(opp[I.oreb], opp[I.oreb] + own[I.dreb]),
    reb: div(own[I.oreb] + own[I.dreb], own[I.oreb] + own[I.dreb] + opp[I.oreb] + opp[I.dreb]),
    ftr: div(own[I.fta], fga(own)), oftr: div(opp[I.fta], fga(opp)),
    tp: div(own[I.fga3], fga(own)),
  };
  r.net = r.ortg != null && r.drtg != null ? r.ortg - r.drtg : null;
  return r;
}

// stints: [{p:[ids], s, c, own, opp, g}] → άθροισμα με φίλτρο
export function sum(stints, pred = () => true) {
  const own = zero(), opp = zero(); let s = 0, n = 0; const games = new Set();
  for (const x of stints) if (pred(x)) { add(own, x.own); add(opp, x.opp); s += x.s; n++; if (x.g != null) games.add(x.g); }
  return { own, opp, s, n, games: games.size };
}
export const rated = agg => ({ ...rate(agg.own, agg.opp, agg.s), games: agg.games });

// On/Off ενός παίκτη: μόνο σε αγώνες που αγωνίστηκε (για να μη μετρούν τραυματισμοί ως «εκτός»)
export function onOff(stints, pid, pred = () => true) {
  const played = new Set(stints.filter(x => x.p.includes(pid)).map(x => x.g));
  const base = x => pred(x) && played.has(x.g);
  const on = rated(sum(stints, x => base(x) && x.p.includes(pid)));
  const off = rated(sum(stints, x => base(x) && !x.p.includes(pid)));
  const d = (a, b) => (a != null && b != null ? a - b : null);
  return { on, off, diff: { net: d(on.net, off.net), ortg: d(on.ortg, off.ortg), drtg: d(on.drtg, off.drtg), pace: d(on.pace, off.pace), efg: d(on.efg, off.efg), oefg: d(on.oefg, off.oefg), reb: d(on.reb, off.reb), tov: d(on.tov, off.tov) } };
}

// WOWY: παίκτης Α με/χωρίς τον συμπαίκτη Β
export function wowy(stints, a, b, pred = () => true) {
  const has = (x, id) => x.p.includes(id);
  return {
    together: rated(sum(stints, x => pred(x) && has(x, a) && has(x, b))),
    aWithoutB: rated(sum(stints, x => pred(x) && has(x, a) && !has(x, b))),
    bWithoutA: rated(sum(stints, x => pred(x) && !has(x, a) && has(x, b))),
    neither: rated(sum(stints, x => pred(x) && !has(x, a) && !has(x, b))),
  };
}

// Όλοι οι συνδυασμοί k παικτών μιας πεντάδας
export function combos(arr, k) {
  const out = [], cur = [];
  (function go(i) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let j = i; j < arr.length; j++) { cur.push(arr[j]); go(j + 1); cur.pop(); }
  })(0);
  return out;
}

// Ομαδοποίηση σε 2/3/4/5-άδες
export function groupLineups(stints, size, pred = () => true) {
  const m = new Map();
  for (const x of stints) {
    if (!pred(x) || x.p.length !== 5) continue;
    for (const c of combos([...x.p].sort(), size)) {
      const k = c.join('-');
      let v = m.get(k); if (!v) { v = { k, p: c, own: zero(), opp: zero(), s: 0, gs: new Set() }; m.set(k, v); }
      add(v.own, x.own); add(v.opp, x.opp); v.s += x.s; v.gs.add(x.g);
    }
  }
  return [...m.values()].map(v => ({ k: v.k, p: v.p, ...rate(v.own, v.opp, v.s), games: v.gs.size }));
}

// Θέση ανάμεσα σε τιμές (0-100). higherBetter=false για δείκτες όπου το χαμηλό είναι καλό (DRtg, TOV%)
export function percentile(values, v, higherBetter = true) {
  const xs = values.filter(x => x != null);
  if (v == null || !xs.length) return null;
  const below = xs.filter(x => (higherBetter ? x < v : x > v)).length, eq = xs.filter(x => x === v).length;
  return Math.round(100 * (below + 0.5 * (eq - 1)) / Math.max(1, xs.length - 1));
}
export function rank(values, v, higherBetter = true) {
  if (v == null) return null;
  return 1 + values.filter(x => x != null && (higherBetter ? x > v : x < v)).length;
}
