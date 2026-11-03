// EuroLeague Fantasy scoring, lineup optimizer and round planner.
// Pure functions: used by build.mjs (to pre-compute the /api files) and by the browser pages.

export const FORMATIONS = { '2-2-1': [2, 2, 1], '1-2-2': [1, 2, 2], '2-1-2': [2, 1, 2], '1-3-1': [1, 3, 1], '3-1-1': [3, 1, 1] };
export const POS = ['Guard', 'Forward', 'Center'];
export const ROSTER = { Guard: 4, Forward: 4, Center: 2 };
export const DEFAULTS = { budget: 100, maxPerTeam: 6, risk: 'ceiling', formation: 'auto' };

// coach points from the final margin (positive = his team won); overtime counts as a 1-10 game
export function coachPoints(margin, ot = false) {
  if (margin > 0) return ot || margin <= 10 ? 10 : margin <= 20 ? 20 : 25;
  const m = -margin;
  return ot || m <= 10 ? -5 : m <= 20 ? -10 : -20;
}

// fantasy points of a player in a slot: PIR x win bonus x slot multiplier x captain multiplier
export function fantasyPoints(pir, { won = false, slot = 'start', captain = false } = {}) {
  const slotM = slot === 'bench' ? 0.5 : 1, capM = captain && slot === 'start' ? 2 : 1;
  return pir * (won ? 1.1 : 1) * slotM * capM;
}

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

// roster search: several feasible starts + best-improvement swaps (same position) until nothing improves
export function optimize(players, coaches, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const pool = players.filter(p => p.status !== 'injured' && p.status !== 'rest' && p.opp && (!o.exclude || !o.exclude.includes(p.c)));
  const must = (o.include || []).map(c => pool.find(p => p.c === c)).filter(Boolean);
  const cpool = coaches.filter(c => c.opp);
  const feasible = (ro, co) => { const cost = ro.reduce((s, p) => s + p.price, 0) + (co ? co.price : 0); if (cost > o.budget + 1e-9) return false; const cnt = {}; for (const p of ro) { cnt[p.t] = (cnt[p.t] || 0) + 1; if (cnt[p.t] > o.maxPerTeam) return false; } return must.every(m => ro.includes(m)); };
  const score = (ro, co) => { const lu = bestLineup(ro, o.risk, o.formation); return lu ? lu.score + (co ? coachValue(co, o.risk) : 0) : -1e9; };
  const starts = [];
  const cheapest = () => { const ro = [...must]; for (const ps of POS) { const have = ro.filter(p => p.pos === ps).length; ro.push(...pool.filter(p => p.pos === ps && !ro.includes(p)).sort((a, b) => a.price - b.price).slice(0, ROSTER[ps] - have)); } return ro; };
  starts.push(cheapest());
  for (const k of [0.6, 1, 1.4]) { // greedy by value per credit with different weights
    const ro = [...must]; let spend = must.reduce((s, p) => s + p.price, 0); const cnt = {}; must.forEach(p => { cnt[p.t] = (cnt[p.t] || 0) + 1; });
    const left = () => POS.reduce((s, ps) => s + Math.max(0, ROSTER[ps] - ro.filter(p => p.pos === ps).length), 0);
    const cand = pool.filter(p => !ro.includes(p)).sort((a, b) => playerValue(b, o.risk) / Math.pow(b.price, k) - playerValue(a, o.risk) / Math.pow(a.price, k));
    for (const p of cand) { if (ro.filter(x => x.pos === p.pos).length >= ROSTER[p.pos] || (cnt[p.t] || 0) >= o.maxPerTeam) continue; if (spend + p.price + 4 * (left() - 1) + 4 > o.budget) continue; ro.push(p); spend += p.price; cnt[p.t] = (cnt[p.t] || 0) + 1; if (!left()) break; }
    if (!left()) starts.push(ro);
  }
  let best = null;
  for (const st of starts) {
    let ro = st, co = cpool.slice().sort((a, b) => a.price - b.price)[0];
    if (!feasible(ro, co)) continue;
    let cur = score(ro, co), improved = true, it = 0;
    while (improved && it++ < 60) {
      improved = false; let bestMove = null;
      for (let i = 0; i < ro.length; i++) {
        if (must.includes(ro[i])) continue;
        for (const q of pool) {
          if (q.pos !== ro[i].pos || ro.includes(q)) continue;
          const nr = ro.slice(); nr[i] = q;
          if (!feasible(nr, co)) continue;
          const s = score(nr, co); if (s > cur + 1e-6 && (!bestMove || s > bestMove.s)) bestMove = { s, ro: nr, co };
        }
      }
      for (const c of cpool) { if (c === co || !feasible(ro, c)) continue; const s = score(ro, c); if (s > cur + 1e-6 && (!bestMove || s > bestMove.s)) bestMove = { s, ro, co: c }; }
      if (bestMove) { ro = bestMove.ro; co = bestMove.co; cur = bestMove.s; improved = true; }
    }
    if (!best || cur > best.s) best = { s: cur, ro, co };
  }
  if (!best) return null;
  const lu = bestLineup(best.ro, o.risk, o.formation);
  const cost = best.ro.reduce((s, p) => s + p.price, 0) + (best.co ? best.co.price : 0);
  return { ...lu, roster: best.ro, coach: best.co, cost: Math.round(cost * 10) / 10, budget: o.budget, risk: o.risk, totals: totals(lu, best.co) };
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
