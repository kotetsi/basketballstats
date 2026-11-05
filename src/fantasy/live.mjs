// Fantasy Live Tracker: live scoring, turn progression, live projection, recommendations, alerts και round review.
// Καθαρές συναρτήσεις (browser + tests). Δεδομένα: επίσημα live box scores της EuroLeague (feed) + τελικά από το build.
import { coachPoints, FORMATIONS, OUT } from './rules.mjs';
import { riskScore } from './captain.mjs';

const Z = 1.2816;
const wbExp = p => 1 + 0.1 * (p.pwin ?? 0.5);
const sdOf = p => Math.max(0, ((p.p90 || 0) - (p.p10 || 0)) / (2 * Z));
const r1 = x => Math.round(x * 10) / 10;
export const SLOT_M = { start: 1, sixth: 1, bench: 0.5 };

/**
 * Κατάσταση παίκτη από την κατάσταση του αγώνα του και το box score:
 * not_started · playing (ο αγώνας παίζεται) · finished · dnp (τελείωσε με 0 λεπτά) · injured (εκτός πριν από τον αγώνα) · no_game
 */
export function playerState(p, game, box) {
  if (!game) return 'no_game';
  if (game.state === 'final') return box && box.min > 0 ? 'finished' : 'dnp';
  if (game.state === 'live') return 'playing';
  return OUT(p.status) ? 'injured' : 'not_started';
}

/** fantasy points ενός παίκτη μέχρι τώρα: PIR × slot × (αρχηγός 2) × (1,1 μόνο αν ο αγώνας τελείωσε και η ομάδα κέρδισε) */
export function liveFP(pir, { slot = 'start', captain = false, finished = false, won = false } = {}) {
  const base = pir * (SLOT_M[slot] ?? 1) * (finished && won ? 1.1 : 1);
  return base * (captain && slot === 'start' ? 2 : 1);
}
const projFP = (p, slot, captain) => (p.pp || 0) * wbExp(p) * (SLOT_M[slot] ?? 1) * (captain && slot === 'start' ? 2 : 1);

/**
 * lineup = { start:[5], sixth, bench:[4], captain, coach }
 * games = { TEAM: { state: 'scheduled'|'live'|'final', hs, as, home: bool, margin (για την ομάδα), frac: ποσοστό αγώνα που έχει παιχτεί 0–1, day } }
 * box = { code: { min, pir, pts, reb, ast, stl, blk, tov, fgm2, fga2, fgm3, fga3, ftm, fta, pf } }
 */
export function liveScore(lu, players, coaches, games, box) {
  const P = new Map(players.map(p => [p.c, p]));
  const slots = [...lu.start.map(c => [c, 'start']), [lu.sixth, 'sixth'], ...lu.bench.map(c => [c, 'bench'])].filter(([c]) => c && P.has(c));
  const rows = slots.map(([c, slot]) => {
    const p = P.get(c), g = games[p.t] || null, b = box[c] || null, st = playerState(p, g, b), cap = c === lu.captain && slot === 'start';
    const pir = b ? b.pir : 0, finished = st === 'finished' || st === 'dnp', won = !!(g && g.state === 'final' && g.margin > 0);
    const actual = st === 'not_started' || st === 'injured' || st === 'no_game' ? 0 : liveFP(pir, { slot, captain: cap, finished, won });
    const projected = projFP(p, slot, cap);
    // υπόλοιπο: όσοι δεν έχουν ξεκινήσει → όλο το projection· όσοι παίζουν → projection × υπόλοιπο ποσοστό αγώνα (+ αναμενόμενο μπόνους νίκης)
    let remaining = 0;
    if (st === 'not_started') remaining = projected;
    else if (st === 'playing') { const frac = Math.min(1, Math.max(0, g.frac ?? 0)); remaining = (p.pp || 0) * (1 - frac) * (SLOT_M[slot] ?? 1) * (cap ? 2 : 1) + 0.1 * (p.pwin ?? 0.5) * ((pir + (p.pp || 0) * (1 - frac)) * (SLOT_M[slot] ?? 1) * (cap ? 2 : 1)); }
    const show = st === 'not_started' ? projected : actual;   // όσοι δεν έχουν ξεκινήσει δείχνουν projected, όχι 0
    return { c, slot, captain: cap, state: st, pir, min: b ? b.min : 0, stats: b, actual: r1(actual), projected: r1(projected), remaining: r1(remaining), show: r1(show), diffPIR: b ? r1(pir - (p.pp || 0)) : null, day: p.day, team: p.t, margin: g?.margin ?? null, gameState: g?.state ?? null };
  });
  const coach = coaches.find(c => c.t === lu.coach) || null, cg = coach ? games[coach.t] : null;
  const coachActual = cg && cg.state === 'final' ? coachPoints(cg.margin, !!cg.ot) : 0;   // μόνο στο τελικό
  const coachRem = cg && cg.state === 'final' ? 0 : coach ? coach.exp : 0;
  const sum = (f, k) => r1(rows.filter(f).reduce((s, x) => s + x[k], 0));
  const actual = sum(() => true, 'actual') + coachActual, remaining = sum(() => true, 'remaining') + coachRem;
  return {
    rows, coach: coach ? { t: coach.t, state: cg?.state || 'scheduled', actual: coachActual, projected: coach.exp, margin: cg?.margin ?? null } : null,
    actual: r1(actual), remaining: r1(remaining), updated: r1(actual + remaining),
    byGroup: { start: sum(x => x.slot === 'start' && !x.captain, 'actual'), captain: sum(x => x.captain, 'actual'), sixth: sum(x => x.slot === 'sixth', 'actual'), bench: sum(x => x.slot === 'bench', 'actual'), coach: coachActual },
  };
}

/** turn που τρέχει: η πρώτη μέρα του γύρου που δεν έχει ολοκληρωθεί */
export function currentTurn(days, games) {
  const byDay = days.map((_, i) => Object.values(games).filter(g => g.day === i));
  for (let i = 0; i < days.length; i++) if (byDay[i].some(g => g.state !== 'final')) return i;
  return days.length;   // ο γύρος ολοκληρώθηκε
}
const formOK = (start, P) => { const n = [0, 0, 0]; for (const c of start) n[['Guard', 'Forward', 'Center'].indexOf(P.get(c).pos)]++; return FORMATIONS[n.join('-')] ? n.join('-') : null; };

/** timeline ανά turn */
export function turnTimeline(lu, players, coaches, games, box, days) {
  const P = new Map(players.map(p => [p.c, p]));
  const S = liveScore(lu, players, coaches, games, box), R = new Map(S.rows.map(r => [r.c, r]));
  const cur = currentTurn(days, games);
  const all = [...lu.start, lu.sixth, ...lu.bench];
  const done = c => ['finished', 'dnp', 'playing'].includes(R.get(c)?.state);
  return days.map((d, i) => {
    const gs = Object.entries(games).filter(([, g]) => g.day === i);
    const teamsToday = new Set(gs.map(([t]) => t));
    const pl = all.filter(c => teamsToday.has(P.get(c).t));
    const playedBefore = all.filter(c => (P.get(c).day ?? 99) < i || (i <= cur && done(c) && (P.get(c).day ?? 99) <= i));
    const avail = all.filter(c => (P.get(c).day ?? -1) >= i && !done(c));
    const capNow = lu.captain;
    const bestCap = lu.start.filter(c => (P.get(c).day ?? -1) >= i && !done(c) && !OUT(P.get(c).status)).sort((a, b) => P.get(b).pp - P.get(a).pp)[0] || null;
    const pts = pl.reduce((s, c) => s + R.get(c).actual, 0) + (S.coach && P && gs.some(([t]) => t === S.coach.t) ? S.coach.actual : 0);
    const rem = pl.reduce((s, c) => s + R.get(c).remaining, 0);
    const state = gs.length && gs.every(([, g]) => g.state === 'final') ? 'done' : gs.some(([, g]) => g.state === 'live') ? 'live' : i < cur ? 'done' : i === cur ? 'current' : 'next';
    return { turn: i, date: d, state, games: gs.map(([t, g]) => ({ t, ...g })).filter(g => g.home), players: pl, playedBefore, available: avail, captain: capNow, bestCaptain: bestCap, points: r1(pts), remaining: r1(rem) };
  });
}

/** recommendations για τα επόμενα turns (με βάση ό,τι έχει ήδη γίνει) */
export function recommendations(lu, players, coaches, games, box, days) {
  const P = new Map(players.map(p => [p.c, p])), S = liveScore(lu, players, coaches, games, box), R = new Map(S.rows.map(r => [r.c, r]));
  const out = [];
  const played = c => ['finished', 'dnp'].includes(R.get(c).state), notYet = c => R.get(c).state === 'not_started';
  const conf = p => ((p.gp ?? 9) < 3 || (p.conf ?? 60) < 40 ? 'low' : (p.conf ?? 60) >= 60 ? 'high' : 'medium');
  const risk = p => { const s = riskScore(p).score; return s >= 45 ? 'high' : s >= 28 ? 'medium' : 'low'; };
  // 1. αρχηγός: αν όποιος έχει το περιβραχιόνιο έπαιξε ή δεν θα παίξει, και υπάρχει βασικός που δεν έχει παίξει με μεγαλύτερη εκτίμηση
  const cap = P.get(lu.captain), capR = R.get(lu.captain);
  const capCands = lu.start.filter(c => c !== lu.captain && notYet(c) && !OUT(P.get(c).status)).sort((a, b) => P.get(b).pp - P.get(a).pp);
  if (cap && capCands.length) {
    const alt = P.get(capCands[0]);
    const capValue = played(lu.captain) ? capR.pir : capR.state === 'injured' ? 0 : capR.state === 'playing' ? null : cap.pp;
    if (capValue != null && (alt.pp || 0) > capValue + 0.5) out.push({ k: 'captain', out: cap.c, in: alt.c, impact: r1(((alt.pp || 0) - capValue) * wbExp(alt)), risk: risk(alt), confidence: conf(alt), why: played(lu.captain) ? 'captain_low' : capR.state === 'injured' ? 'captain_out' : 'captain_better' });
  }
  // 2. αλλαγές field ↔ bench: ενεργός που έπαιξε (χαμηλά) ή που θα λείψει ↔ παίκτης πάγκου που δεν έχει παίξει
  const actives = [...lu.start.map(c => [c, 'start']), [lu.sixth, 'sixth']].filter(([c]) => c !== lu.captain);
  const ups = lu.bench.filter(c => notYet(c) && !OUT(P.get(c).status)).sort((a, b) => P.get(b).pp - P.get(a).pp);
  const used = new Set();
  for (const [d, slot] of actives.sort((a, b) => (R.get(a[0]).state === 'injured' ? -1 : 0) - (R.get(b[0]).state === 'injured' ? -1 : 0))) {
    const st = R.get(d).state, a = played(d) ? R.get(d).pir : st === 'injured' ? 0 : st === 'not_started' && ((P.get(d).pm || 0) < 10 || P.get(d).status === 'doubtful') ? (P.get(d).pp || 0) : null;
    if (a == null) continue;
    for (const u of ups) {
      if (used.has(u)) continue;
      const y = P.get(u).pp || 0;
      if (a >= y) continue;
      let newForm = null;
      if (slot === 'start') { const ns = lu.start.map(c => (c === d ? u : c)); newForm = formOK(ns, P); if (!newForm) continue; }
      const curForm = formOK(lu.start, P);
      used.add(u);
      out.push({ k: st === 'injured' ? 'avoid' : played(d) ? 'swap' : 'avoid', out: d, in: u, impact: r1(0.5 * (y - a) * wbExp(P.get(u))), risk: risk(P.get(u)), confidence: conf(P.get(u)), why: st === 'injured' ? 'injured' : played(d) ? 'played_low' : P.get(d).status === 'doubtful' ? 'doubtful' : 'low_minutes', formation: newForm && newForm !== curForm ? newForm : null });
      break;
    }
  }
  // 3. η καλύτερη σύνθεση για τα υπόλοιπα turns = όλες οι παραπάνω αλλαγές μαζί
  const gain = out.reduce((s, x) => s + x.impact, 0);
  return { list: out.sort((a, b) => b.impact - a.impact), bestRemaining: r1(S.updated + gain), current: S.updated };
}

/** προσομοίωση υπολοίπων: κατανομή του τελικού συνόλου */
export function simulateRemaining(lu, players, coaches, games, box, initial, nSim = 800, seed = 11) {
  const P = new Map(players.map(p => [p.c, p])), S = liveScore(lu, players, coaches, games, box);
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const tots = [];
  for (let i = 0; i < nSim; i++) {
    let t = 0;
    for (const r of S.rows) {
      const p = P.get(r.c), m = (SLOT_M[r.slot] ?? 1) * (r.captain ? 2 : 1);
      if (r.state === 'finished' || r.state === 'dnp') { t += r.actual; continue; }
      if (r.state === 'injured' || r.state === 'no_game') continue;
      const frac = r.state === 'playing' ? Math.min(1, games[p.t]?.frac ?? 0) : 0;
      const pir = (r.state === 'playing' ? r.pir : 0) + (p.pp || 0) * (1 - frac) + sdOf(p) * Math.sqrt(1 - frac) * gauss();
      const won = rnd() < (p.pwin ?? 0.5);
      t += pir * m * (won ? 1.1 : 1);
    }
    if (S.coach) { if (S.coach.state === 'final') t += S.coach.actual; else { const c = coaches.find(x => x.t === lu.coach); t += c ? (c.exp + (c.p90 - c.p10) / (2 * Z) * gauss()) : 0; } }
    tots.push(t);
  }
  tots.sort((a, b) => a - b);
  const q = x => r1(tots[Math.min(tots.length - 1, Math.floor(x * (tots.length - 1)))]);
  // επίδραση αν λείψει ο σημαντικότερος βασικός που δεν έχει παίξει
  const key = S.rows.filter(r => r.slot !== 'bench' && r.state === 'not_started').sort((a, b) => b.projected - a.projected)[0] || null;
  return { p5: q(0.05), p50: q(0.5), p95: q(0.95), mean: r1(tots.reduce((a, b) => a + b, 0) / tots.length), pBeat: initial != null ? Math.round((100 * tots.filter(x => x > initial).length) / tots.length) / 100 : null, keyMiss: key ? { c: key.c, impact: -key.projected } : null };
}

/** alerts: κάθε κανόνας αντιστοιχεί σε ένα από τα 10 είδη της προδιαγραφής */
export function liveAlerts(lu, players, coaches, games, box, days, { initial = null, now = new Date().toISOString() } = {}) {
  const P = new Map(players.map(p => [p.c, p])), S = liveScore(lu, players, coaches, games, box), R = new Map(S.rows.map(r => [r.c, r]));
  const A = [], add = (k, sev, c, impact, action) => A.push({ k, severity: sev, c, impact: impact == null ? null : r1(impact), action, ts: now });
  for (const r of S.rows) {
    const p = P.get(r.c);
    if (r.captain && (r.state === 'dnp' || r.state === 'injured')) add('captain_out', 'critical', r.c, -r.projected, 'move_captain');
    else if (r.slot === 'start' && (r.state === 'dnp' || r.state === 'injured')) add('starter_out', 'warning', r.c, -r.projected, 'bench_swap');
    if (r.state === 'injured' && r.slot === 'bench') add('injury', 'info', r.c, 0, 'keep_bench');
    if (r.state === 'dnp' && r.slot === 'bench') add('dnp', 'info', r.c, 0, 'none');
    if (r.slot === 'bench' && (r.state === 'playing' || r.state === 'finished') && r.pir > (p.pp || 0) + 5) add('bench_hot', 'info', r.c, 0.5 * (r.pir - (p.pp || 0)), 'consider_up');
    if (r.state === 'playing' && r.slot !== 'bench' && games[p.t]?.frac > 0.5 && r.min < 3) add('low_minutes', 'warning', r.c, -r.projected / 2, 'watch');
  }
  const seen = new Set();
  for (const r of S.rows) { const g = games[P.get(r.c).t]; if (g && g.state === 'final' && !seen.has(g.id)) { seen.add(g.id); A.push({ k: 'game_final', severity: 'info', c: null, game: g.id, impact: null, action: 'none', ts: now }); } }
  const rec = recommendations(lu, players, coaches, games, box, days);
  for (const x of rec.list) {
    if (x.k === 'captain') add(x.why === 'captain_better' ? 'better_captain' : 'captain_opportunity', x.why === 'captain_out' ? 'critical' : 'warning', x.in, x.impact, 'move_captain');
    else add('better_swap', x.k === 'avoid' ? 'warning' : 'info', x.out, x.impact, 'bench_swap');
  }
  if (initial != null && S.updated < initial * 0.85) add('projection_drop', 'warning', null, S.updated - initial, 'review');
  const rank = { critical: 0, warning: 1, info: 2 };
  return A.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** review μετά το τέλος του γύρου (finals = { code: {min, pir} }, games με τελικά) */
export function roundReview(lu, players, coaches, games, box, { initial = null, enumerate = null, solveBest = null } = {}) {
  const P = new Map(players.map(p => [p.c, p])), S = liveScore(lu, players, coaches, games, box);
  const perf = S.rows.map(r => ({ ...r, over: r1(r.actual - r.projected) }));
  const best = [...perf].sort((a, b) => b.over - a.over)[0], worst = [...perf].sort((a, b) => a.over - b.over)[0];
  const starters = perf.filter(r => r.slot === 'start');
  const capR = perf.find(r => r.captain), idealCap = [...starters].sort((a, b) => b.pir - a.pir)[0];
  const capMissed = capR && idealCap ? r1(liveFP(idealCap.pir, { slot: 'start', finished: true, won: (games[P.get(idealCap.c).t]?.margin ?? 0) > 0 }) - liveFP(capR.pir, { slot: 'start', finished: true, won: (games[P.get(capR.c).t]?.margin ?? 0) > 0 })) : 0;
  const benchPts = r1(perf.filter(r => r.slot === 'bench').reduce((s, r) => s + r.actual, 0));
  // καλύτερη τοποθέτηση της ίδιας 10άδας με γνώση των αποτελεσμάτων (αν δοθεί enumerate από τον planner)
  let bestArrangement = null;
  if (enumerate) {
    const won = c => (games[P.get(c).t]?.margin ?? 0) > 0;
    const pts = l => l.start.reduce((s, c) => s + liveFP(box[c]?.pir || 0, { slot: 'start', captain: c === l.captain, finished: true, won: won(c) }), 0) + liveFP(box[l.sixth]?.pir || 0, { slot: 'sixth', finished: true, won: won(l.sixth) }) + l.bench.reduce((s, c) => s + liveFP(box[c]?.pir || 0, { slot: 'bench', finished: true, won: won(c) }), 0);
    let b = null; for (const l of enumerate([...lu.start, lu.sixth, ...lu.bench])) { const v = pts(l); if (!b || v > b.v) b = { v, l }; }
    if (b) bestArrangement = { lineup: b.l, points: r1(b.v + (S.coach?.actual || 0)), missed: r1(b.v + (S.coach?.actual || 0) - S.actual) };
  }
  const bestRoster = solveBest ? solveBest() : null;
  const lessons = [];
  if (capMissed > 5) lessons.push({ k: 'captain', v: capMissed, c: idealCap.c });
  if (bestArrangement && bestArrangement.missed > 5) lessons.push({ k: 'arrangement', v: bestArrangement.missed });
  const outs = perf.filter(r => r.slot !== 'bench' && (r.state === 'dnp' || r.state === 'injured'));
  if (outs.length) lessons.push({ k: 'dnp', v: outs.length, c: outs[0].c });
  if (S.coach && S.coach.actual < 0) lessons.push({ k: 'coach', v: S.coach.actual, c: S.coach.t });
  if (initial != null && S.actual < initial - 15) lessons.push({ k: 'under', v: r1(S.actual - initial) });
  return { final: S.actual, initial, diff: initial != null ? r1(S.actual - initial) : null, best, worst, captain: { c: capR?.c, points: capR?.actual, ideal: idealCap?.c, missed: capMissed }, bench: { points: benchPts }, coach: S.coach, bestArrangement, bestRoster, lessons, rows: perf };
}
