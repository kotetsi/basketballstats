// EuroLeague Fantasy scoring, lineup optimizer and round planner.
// Pure functions: used by build.mjs (to pre-compute the /api files) and by the browser pages.

import { FORMATIONS, POS, ROSTER, DEFAULTS, coachPoints, playerPoints } from './rules.mjs';
import { solve } from './solver.mjs';
export { FORMATIONS, POS, ROSTER, DEFAULTS, coachPoints };
// fantasy points of a player in a slot (κρατιέται για συμβατότητα): ίδιο με rules.playerPoints
export const fantasyPoints = (pir, o = {}) => playerPoints(pir, o);

// expected value of a player for the optimizer: the +10% bonus is weighted by his team's win probability
export function playerValue(p, risk) {
  const wb = 1 + 0.1 * (p.pwin ?? 0.5);
  if (risk === 'safe') return (p.p50 - 0.15 * Math.max(0, p.p90 - p.p10)) * wb;
  return p.pp * wb;
}
const coachValue = (c, risk) => (risk === 'safe' ? c.p50 * 0.5 + c.exp * 0.5 : c.exp);

// best way to use a roster of 10: starting five by formation, sixth man, bench, captain
export function bestLineup(roster, risk, formation = 'auto') {
  const forms = formation === 'auto' ? Object.keys(FORMATIONS) : [formation];
  let best = null;
  for (const f of forms) {
    const need = FORMATIONS[f], byPos = POS.map(ps => roster.filter(p => p.pos === ps).sort((a, b) => playerValue(b, risk) - playerValue(a, risk)));
    if (byPos.some((l, i) => l.length < need[i])) continue;
    const start = byPos.flatMap((l, i) => l.slice(0, need[i]));
    const rest = roster.filter(p => !start.includes(p)).sort((a, b) => playerValue(b, risk) - playerValue(a, risk));
    const sixth = rest[0], bench = rest.slice(1);
    const cap = start.slice().sort((a, b) => playerValue(b, risk) - playerValue(a, risk))[0];
    const v = p => playerValue(p, risk);
    const score = start.reduce((s, p) => s + v(p), 0) + v(cap) + (sixth ? v(sixth) : 0) + bench.reduce((s, p) => s + 0.5 * v(p), 0);
    if (!best || score > best.score) best = { formation: f, start, sixth, bench, captain: cap, score };
  }
  return best;
}

function totals(lu, coach) {
  const wb = p => 1 + 0.1 * (p.pwin ?? 0.5);
  const sum = k => lu.start.reduce((s, p) => s + p[k] * wb(p), 0) + lu.captain[k] * wb(lu.captain) + (lu.sixth ? lu.sixth[k] * wb(lu.sixth) : 0) + lu.bench.reduce((s, p) => s + 0.5 * p[k] * wb(p), 0) + (coach ? coach[k === 'pp' ? 'exp' : k] : 0);
  return { expected: sum('pp'), floor: sum('p10'), median: sum('p50'), ceiling: sum('p90') };
}

// Optimizer: ακριβής λύση με τον solver (DP + branch-and-bound) αντί για greedy αναζήτηση.
// Κρατά το ίδιο σχήμα αποτελέσματος για τις υπάρχουσες σελίδες. risk: 'safe' | 'balanced' | 'ceiling' (το παλιό 'ceiling' = αναμενόμενο → 'balanced')
export function optimize(players, coaches, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const mode = o.mode || (o.risk === 'safe' ? 'safe' : o.risk === 'p90' ? 'ceiling' : o.risk === 'expected' ? 'expected' : 'balanced');
  const pool = players.filter(p => p.opp);
  const r = solve(pool, coaches.filter(c => c.opp), { budget: o.budget, maxPerTeam: o.maxPerTeam, mode, formation: o.formation, lock: o.include || [], exclude: o.exclude || [] });
  if (!r || !r.start) return null;
  const P = new Map(pool.map(p => [p.c, p])), coach = coaches.find(c => c.t === r.coach);
  const lu = { formation: r.formation, start: r.start.map(c => P.get(c)), sixth: P.get(r.sixth), bench: r.bench.map(c => P.get(c)), captain: P.get(r.captain), score: r.objective };
  return { ...lu, roster: [...lu.start, lu.sixth, ...lu.bench], coach, cost: r.cost, budget: o.budget, risk: o.risk, mode, status: r.status, totals: totals(lu, coach) };
}

// turn-by-turn plan for rounds spread over several game days
export function roundPlan(res, days) {
  if (!res) return null;
  const all = [...res.start, res.sixth, ...res.bench].filter(Boolean);
  const v = p => p.pp;
  const slotOf = p => (res.start.includes(p) ? 'start' : p === res.sixth ? 'sixth' : 'bench');
  const turns = days.map((d, i) => ({ day: i, date: d, players: all.filter(p => p.day === i).map(p => ({ c: p.c, slot: slotOf(p), pp: p.pp })) }));
  // captain: among starters within 15% of the best, take the one who plays first, so that the captaincy can still
  // be moved to a starter who plays later if he has a bad game (only unplayed starters can become captain)
  const top = Math.max(...res.start.map(v));
  const cands = res.start.filter(p => v(p) >= 0.85 * top).sort((a, b) => a.day - b.day || v(b) - v(a));
  const cap = cands[0] || res.captain;
  const later = res.start.filter(p => p.day > cap.day && p !== cap).sort((a, b) => v(b) - v(a));
  const steps = [];
  steps.push({ type: 'captain', day: cap.day, c: cap.c });
  if (later.length) steps.push({ type: 'captain_switch', day: cap.day, from: cap.c, to: later[0].c, threshold: Math.round(v(later[0]) * 10) / 10 });
  const usedBk = new Set();
  // backups for active players who play on a later day: if they are ruled out, swap in the best unplayed bench player
  for (const p of [...res.start, res.sixth].filter(Boolean)) {
    if (p.day === 0) continue;
    const b = res.bench.filter(x => x.day >= p.day && !usedBk.has(x.c) && (slotOf(p) === 'sixth' || x.pos === p.pos)).sort((a, b) => v(b) - v(a))[0];
    if (b) { usedBk.add(b.c); steps.push({ type: 'backup', day: p.day, c: p.c, with: b.c }); }
  }
  // a bench player who plays before an active player of the same position is a "reserve": if the active one is doubtful, start him
  for (const b of res.bench) {
    const a = [...res.start, res.sixth].filter(Boolean).find(x => x.status === 'doubtful' && (x.pos === b.pos || x === res.sixth) && b.day <= x.day);
    if (a) steps.push({ type: 'doubtful', day: b.day, c: a.c, with: b.c });
  }
  return { turns, steps };
}

export function toCSV(res, name = c => c, team = t => t) {
  const rows = [['slot', 'player', 'team', 'position', 'price', 'projected_pir', 'p10', 'p50', 'p90']];
  const add = (slot, p) => rows.push([slot, name(p.c), team(p.t), p.pos, p.price, p.pp, p.p10, p.p50, p.p90]);
  res.start.forEach(p => add(p === res.captain ? 'captain' : 'start', p)); if (res.sixth) add('sixth', res.sixth); res.bench.forEach(p => add('bench', p));
  if (res.coach) rows.push(['coach', '', team(res.coach.t), '', res.coach.price, res.coach.exp, res.coach.p10, res.coach.p50, res.coach.p90]);
  return rows.map(r => r.map(x => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x)).join(',')).join('\n');
}
