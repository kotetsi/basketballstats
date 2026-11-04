// Multi-turn planner: για μια 10άδα (+ προπονητή) αξιολογεί αρχικές τοποθετήσεις με Monte Carlo
// και εφαρμόζει την πολιτική αλλαγών ανάμεσα στα turns:
//   • αρχηγός: αν όποιος έχει το περιβραχιόνιο έπαιξε και έφερε λιγότερο από την εκτίμηση ενός βασικού που δεν έχει παίξει, το παίρνει εκείνος
//   • field ↔ bench: ενεργός που έπαιξε με α PIR ↔ παίκτης πάγκου που δεν έχει παίξει με εκτίμηση y: αλλαγή αν α < y
//     (πριν: α + 0,5y, μετά: 0,5α + y), εφόσον η πεντάδα μένει σε έγκυρο σχηματισμό· όποιος έπαιξε δεν ξαναμπαίνει σε ενεργή θέση
// Οι πόντοι μετρούν με το τελικό slot κάθε παίκτη. Ίδιοι τυχαίοι αριθμοί για όλες τις τοποθετήσεις (common random numbers).
import { FORMATIONS, OUT, coachPoints } from './rules.mjs';
import { sdOf } from './solver.mjs';

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const nppf = p => { const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628274631], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6); if (q < 0.02425) { const x = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * x + c[1]) * x + c[2]) * x + c[3]) * x + c[4]) * x + c[5]) / ((((d[0] * x + d[1]) * x + d[2]) * x + d[3]) * x + 1); }
  if (q > 1 - 0.02425) return -nppf(1 - q); const x = q - 0.5, r = x * x; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * x / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); };
const formOK = (start, P) => { const n = [0, 0, 0]; for (const c of start) n[['Guard', 'Forward', 'Center'].indexOf(P.get(c).pos)]++; return !!FORMATIONS[n.join('-')]; };

/** σενάρια: για κάθε παίκτη PIR, για κάθε ομάδα νίκη ναι/όχι και διαφορά (για τον προπονητή) */
export function drawScenarios(players, coach, nSim = 600, seed = 7) {
  const r = rng(seed), out = [];
  const teams = [...new Set(players.map(p => p.t).concat(coach ? [coach.t] : []))];
  for (let s = 0; s < nSim; s++) {
    const margin = {};
    for (const t of teams) {
      const p = players.find(x => x.t === t) || null, pw = t === coach?.t ? coach.pwin : p?.pwin ?? 0.5;
      margin[t] = 11 * nppf(pw ?? 0.5) + 11 * gauss(r);
    }
    const pir = {};
    for (const p of players) {
      if (p.actual != null) { pir[p.c] = p.actual; continue; }   // έχει ήδη παίξει: πραγματικό PIR
      if (OUT(p.status)) { pir[p.c] = 0; continue; }
      const fit = p.pp0 ?? p.pp ?? 0, playP = p.status === 'doubtful' && fit > 0 ? Math.min(1, (p.pp || 0) / fit) : 1;
      if (r() > playP) { pir[p.c] = 0; continue; }   // αμφίβολος που τελικά δεν παίζει
      const mean = p.status === 'doubtful' ? fit : p.pp || 0, sd = sdOf(p) / (p.status === 'doubtful' && playP > 0 ? playP : 1);
      pir[p.c] = Math.round(mean + sd * gauss(r));
    }
    out.push({ pir, margin });
  }
  return out;
}

/** μία προσομοίωση της πολιτικής για μια αρχική τοποθέτηση */
function runPolicy(lu, P, days, sc, curTurn, record) {
  let start = lu.start.slice(), sixth = lu.sixth, bench = lu.bench.slice(), cap = lu.captain;
  const played = new Set(), acts = record ? [] : null;
  for (let t = 0; t < days.length; t++) {
    for (const c of [...start, sixth, ...bench]) if (P.get(c).day === t) played.add(c);
    if (t < curTurn - 1) continue;
    // αρχηγός
    if (played.has(cap)) {
      const a = sc.pir[cap];
      const alt = start.filter(c => !played.has(c) && !OUT(P.get(c).status)).sort((x, y) => P.get(y).pp - P.get(x).pp)[0];
      if (alt && P.get(alt).pp > a) { if (acts) acts.push({ t, k: 'captain', from: cap, to: alt, a, y: P.get(alt).pp }); cap = alt; }
    }
    // field ↔ bench
    let moved = true;
    while (moved) {
      moved = false;
      const ups = bench.filter(c => !played.has(c) && !OUT(P.get(c).status)).sort((x, y) => P.get(y).pp - P.get(x).pp);
      const downs = [...start.map(c => [c, 'start']), [sixth, 'sixth']].filter(([c]) => played.has(c) && c !== cap).sort((x, y) => sc.pir[x[0]] - sc.pir[y[0]]);
      outer: for (const [d, slot] of downs) for (const u of ups) {
        if (sc.pir[d] >= P.get(u).pp) continue;
        if (slot === 'start') { const ns = start.map(c => (c === d ? u : c)); if (!formOK(ns, P)) continue; start = ns; } else sixth = u;
        bench = bench.map(c => (c === u ? d : c));
        if (acts) acts.push({ t, k: 'swap', down: d, up: u, a: sc.pir[d], y: P.get(u).pp });
        moved = true; break outer;
      }
    }
  }
  // τελικοί πόντοι, ανά turn παιχνιδιού
  const byTurn = new Array(days.length).fill(0);
  const add = (c, m) => { const p = P.get(c), won = sc.margin[p.t] > 0; const v = sc.pir[c] * (won ? 1.1 : 1) * m; if (p.day != null && p.day >= 0 && p.day < days.length) byTurn[p.day] += v; else byTurn[0] += v; return v; };
  let tot = 0;
  for (const c of start) tot += add(c, c === cap ? 2 : 1);
  tot += add(sixth, 1);
  for (const c of bench) tot += add(c, 0.5);
  return { tot, byTurn, acts, final: { start, sixth, bench, captain: cap } };
}

/** όλες οι έγκυρες αρχικές τοποθετήσεις μιας 10άδας (σχηματισμός × πεντάδα × 6ος × αρχηγός) */
export function enumerateLineups(roster, P, { formation = 'auto', fixed = {} } = {}) {
  const by = { Guard: [], Forward: [], Center: [] };
  for (const c of roster) by[P.get(c).pos].push(c);
  const comb = (arr, k) => { const out = []; const rec = (i, acc) => { if (acc.length === k) return out.push(acc.slice()); for (let j = i; j < arr.length; j++) { acc.push(arr[j]); rec(j + 1, acc); acc.pop(); } }; rec(0, []); return out; };
  const res = [];
  for (const [f, need] of Object.entries(FORMATIONS)) {
    if (formation !== 'auto' && f !== formation) continue;
    for (const g of comb(by.Guard, need[0])) for (const fw of comb(by.Forward, need[1])) for (const ce of comb(by.Center, need[2])) {
      const start = [...g, ...fw, ...ce];
      if (start.some(c => OUT(P.get(c).status) && !fixed[c])) continue;
      const rest = roster.filter(c => !start.includes(c));
      for (const six of rest) {
        if (OUT(P.get(six).status) && !fixed[six]) continue;
        const bench = rest.filter(c => c !== six);
        // όσοι έχουν παίξει κρατούν το slot τους
        const ok = Object.entries(fixed).every(([c, s]) => (s === 'bench' ? bench.includes(c) : s === 'sixth' ? six === c : start.includes(c)));
        if (!ok) continue;
        for (const cap of start) { if (OUT(P.get(cap).status)) continue; if (fixed[cap] && fixed[cap] !== 'captain' && Object.values(fixed).includes('captain')) continue; res.push({ formation: f, start, sixth: six, bench, captain: cap }); }
      }
    }
  }
  return res;
}

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };
const statOf = (tots, mode) => { const m = tots.reduce((s, x) => s + x, 0) / tots.length; return mode === 'safe' ? q(tots, 0.5) - 0.25 * (q(tots, 0.5) - q(tots, 0.1)) : mode === 'ceiling' ? q(tots, 0.9) : m - 0.1 * Math.sqrt(tots.reduce((s, x) => s + (x - m) ** 2, 0) / tots.length); };

/**
 * planTurns(roster codes, coach code, players, coaches, days, { mode, curTurn, formation, fixed, nSim, topK })
 * Επιστρέφει: καλύτερη αρχική τοποθέτηση, στατιστικά (μ.ό., P10/P50/P90), πόντους ανά turn, κανόνες αλλαγών,
 * και σύγκριση με τη «στατική» καλύτερη (χωρίς αλλαγές) για να φανεί πότε αξίζει να μείνει καλός παίκτης στον πάγκο.
 */
export function planTurns(roster, coachT, players, coaches, days, o = {}) {
  const { mode = 'balanced', curTurn = 0, formation = 'auto', fixed = {}, nSim = 500, topK = 120 } = o;
  const P = new Map(players.map(p => [p.c, p])), coach = coaches.find(c => c.t === coachT) || null;
  const nd = Math.max(1, days.length);
  const all = enumerateLineups(roster, P, { formation, fixed });
  if (!all.length) return null;
  const wb = c => 1 + 0.1 * (P.get(c).pwin ?? 0.5);
  const stat = l => l.start.reduce((s, c) => s + P.get(c).pp * wb(c), 0) + P.get(l.captain).pp * wb(l.captain) + P.get(l.sixth).pp * wb(l.sixth) + l.bench.reduce((s, c) => s + 0.5 * P.get(c).pp * wb(c), 0);
  all.forEach(l => { l.static = stat(l); });
  all.sort((a, b) => b.static - a.static);
  const cands = all.slice(0, topK);
  const sc = drawScenarios(roster.map(c => P.get(c)), coach, nSim);
  const coachPts = sc.map(s => (coach ? coachPoints(Math.round(s.margin[coach.t]) || 1) : 0));
  let best = null;
  for (const l of cands) {
    const tots = sc.map((s, i) => runPolicy(l, P, days.length ? days : [0], s, curTurn, false).tot + coachPts[i]);
    const score = statOf(tots, mode);
    if (!best || score > best.score) best = { l, score, tots };
  }
  const staticBest = cands[0];
  const staticTots = sc.map((s, i) => runPolicy(staticBest, P, [0], { ...s }, 99, false).tot + coachPts[i]);   // χωρίς αλλαγές
  // ανά turn και συχνότερες ενέργειες
  const byTurn = new Array(nd).fill(0), actCount = {};
  for (let i = 0; i < sc.length; i++) {
    const r = runPolicy(best.l, P, days.length ? days : [0], sc[i], curTurn, true);
    r.byTurn.forEach((v, t) => { byTurn[t] += v / sc.length; });
    for (const a of r.acts) { const k = a.k === 'captain' ? `c|${a.t}|${a.from}|${a.to}` : `s|${a.t}|${a.down}|${a.up}`; actCount[k] = (actCount[k] || 0) + 1; }
  }
  if (coach && coach.day != null && coach.day < nd) byTurn[coach.day] += coachPts.reduce((s, x) => s + x, 0) / sc.length;
  const L = best.l;
  const turns = Array.from({ length: nd }, (_, t) => {
    const playing = roster.filter(c => P.get(c).day === t);
    const capNow = L.captain;
    const subs = Object.entries(actCount).filter(([k]) => k.split('|')[1] === String(t)).map(([k, n]) => { const [kind, , a, b] = k.split('|'); return kind === 'c' ? { k: 'captain', from: a, to: b, threshold: +P.get(b).pp.toFixed(1), freq: +(n / sc.length).toFixed(2) } : { k: 'swap', down: a, up: b, threshold: +P.get(b).pp.toFixed(1), freq: +(n / sc.length).toFixed(2) }; }).sort((x, y) => y.freq - x.freq);
    const available = roster.filter(c => (P.get(c).day ?? 99) >= t && !OUT(P.get(c).status));
    const bestCap = L.start.filter(c => (P.get(c).day ?? 99) >= t && !OUT(P.get(c).status)).sort((x, y) => P.get(y).pp - P.get(x).pp)[0] || null;
    return { turn: t, date: days[t] ?? null, playing, available, captain: t === 0 ? capNow : bestCap, subs, expected: +byTurn[t].toFixed(1), state: t < curTurn ? 'done' : t === curTurn ? 'current' : 'next' };
  });
  const s = best.tots, mean = s.reduce((a, b) => a + b, 0) / s.length, sm = staticTots.reduce((a, b) => a + b, 0) / staticTots.length;
  // παίκτες που κρατήθηκαν στον πάγκο ενώ ήταν στην «στατική» πεντάδα (= κρατάς καλό παίκτη για επόμενη μέρα)
  const heldBack = staticBest.start.filter(c => L.bench.includes(c)).map(c => ({ c, day: P.get(c).day }));
  return {
    lineup: { formation: L.formation, start: L.start, sixth: L.sixth, bench: L.bench, captain: L.captain, coach: coachT },
    expected: +mean.toFixed(1), floor: +q(s, 0.1).toFixed(1), median: +q(s, 0.5).toFixed(1), ceiling: +q(s, 0.9).toFixed(1),
    staticExpected: +sm.toFixed(1), gainFromTurns: +(mean - sm).toFixed(1), heldBack, turns, nSim: sc.length, evaluated: cands.length, multiTurn: nd > 1,
  };
}
