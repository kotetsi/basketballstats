// Εξηγήσεις του optimizer: γιατί μπήκε κάθε παίκτης στη θέση του και γιατί δεν μπήκαν οι καλύτεροι που λείπουν.
import { OUT } from './rules.mjs';
import { playerValue, penalties } from './solver.mjs';

const pct = (arr, v) => (arr.length ? arr.filter(x => x < v).length / arr.length : 0.5);

export function explain(sol, players, coaches, o = {}) {
  const mode = o.mode || 'balanced', maxPerTeam = o.maxPerTeam ?? 6, budget = o.budget ?? 100;
  const P = new Map(players.map(p => [p.c, p]));
  const exclude = new Set(o.exclude || []), sold = new Set(o.sold || []);
  const pool = players.filter(p => p.opp && !OUT(p.status));
  const byPos = ps => pool.filter(p => p.pos === ps);
  const out = [];
  const chosen = new Set(sol.roster);
  const minDayStart = Math.min(...sol.start.map(c => P.get(c).day ?? 9));
  const teamCnt = {}; for (const c of sol.roster) teamCnt[P.get(c).t] = (teamCnt[P.get(c).t] || 0) + 1;
  const why = (c, decision) => {
    const p = P.get(c), r = [], same = byPos(p.pos);
    if (pct(same.map(x => x.pirpm || 0), p.pirpm || 0) >= 0.75) r.push('pirpm_high');
    const d = p.nx?.[0]?.[4]; if (d != null && d <= 2) r.push('matchup_good'); else if (d != null && d >= 4) r.push('matchup_hard');
    if (pct(same.map(x => (x.pp || 0) / x.price), (p.pp || 0) / p.price) >= 0.75) r.push('value_high');
    if (decision === 'captain') r.push('captain_best');
    if (decision === 'start' || decision === 'captain' || decision === 'sixth') { if ((p.start ?? 0) >= 0.8) r.push('starter'); if ((p.pp || 0) >= 15) r.push('high_proj'); }
    if (decision === 'bench') {
      if ((p.start ?? 1) < 0.4) r.push('low_start');
      if ((p.day ?? -1) > minDayStart) r.push('plays_later');
      if (p.price <= 5.5) r.push('cheap_filler');
      if (!r.length) r.push('lower_value');
    }
    const pen = penalties(p);
    if (pen.doubtful) r.push('doubtful_risk');
    if (pen.small) r.push('small_sample');
    return r;
  };
  for (const c of sol.start) out.push({ c, decision: c === sol.captain ? 'captain' : 'start', reasons: why(c, c === sol.captain ? 'captain' : 'start') });
  if (sol.sixth) out.push({ c: sol.sixth, decision: 'sixth', reasons: why(sol.sixth, 'sixth') });
  for (const c of sol.bench) out.push({ c, decision: 'bench', reasons: why(c, 'bench') });
  const coach = coaches.find(x => x.t === sol.coach);
  const coachWhy = coach ? [coach.pwin >= 0.65 ? 'coach_favorite' : 'coach_value'] : [];
  // καλύτεροι που δεν επιλέχθηκαν
  const bank = budget - (sol.cost ?? 0);
  const others = players.filter(p => !chosen.has(p.c) && p.opp).map(p => ({ p, v: playerValue({ ...p, status: OUT(p.status) ? 'playing' : p.status, pp: OUT(p.status) ? p.pp0 ?? p.pp : p.pp, p50: OUT(p.status) ? (p.pp0 ?? p.pp) : p.p50, p90: OUT(p.status) ? 1.6 * (p.pp0 ?? p.pp) : p.p90 }, mode) }))
    .sort((a, b) => b.v - a.v).slice(0, 12).map(({ p }) => {
      const r = [];
      if (sold.has(p.c)) r.push('sold');
      else if (exclude.has(p.c)) r.push('excluded');
      else if (OUT(p.status)) r.push('injured');
      else {
        if (p.status === 'doubtful') r.push('doubtful_risk');
        const worst = sol.roster.map(c => P.get(c)).filter(x => x.pos === p.pos).sort((a, b) => a.price - b.price);
        if (worst.length && p.price - worst[0].price > bank + 1e-9) r.push('budget');
        if ((teamCnt[p.t] || 0) >= maxPerTeam) r.push('team_cap');
        if ((p.start ?? 1) < 0.4) r.push('low_start');
        if (!r.length) r.push('combo');   // αξίζει μόνος του, αλλά ο συνδυασμός χωρίς αυτόν δίνει περισσότερους πόντους με το ίδιο budget
      }
      return { c: p.c, decision: 'not_selected', reasons: r };
    });
  return { players: out, coach: coach ? { t: coach.t, reasons: coachWhy } : null, notSelected: others };
}
