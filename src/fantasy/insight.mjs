// «Why this lineup?», εναλλακτικές συνθέσεις, σύγκριση και sensitivity για τον optimizer.
// Όλα βγαίνουν από τα ίδια projections/constraints/solver· οι εξηγήσεις παράγονται από πραγματικά features (όχι έτοιμο κείμενο).
import { solve } from './solver.mjs';
import { simulate } from './whatif.mjs';
import { riskScore } from './captain.mjs';
import { OUT } from './rules.mjs';
import { planTurns } from './turns.mjs';

const Z = 1.2816;
const wb = p => 1 + 0.1 * (p.pwin ?? 0.5);
const sdOf = p => Math.max(0, ((p.p90 || 0) - (p.p10 || 0)) / (2 * Z));
const pctIn = (arr, v) => (arr.length > 1 ? arr.filter(x => x < v).length / (arr.length - 1) : 0.5);
const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;

/** lineup = { start:[5], sixth, bench:[4], captain, coach } */
export function contributions(lu, players, coaches) {
  const P = new Map(players.map(p => [p.c, p])), coach = coaches.find(c => c.t === lu.coach) || null;
  const rows = [];
  const slots = [...lu.start.map(c => [c, 'start']), [lu.sixth, 'sixth'], ...lu.bench.map(c => [c, 'bench'])].filter(([c]) => c && P.has(c));
  for (const [c, slot] of slots) {
    const p = P.get(c), m = slot === 'bench' ? 0.5 : 1, cap = c === lu.captain;
    const base = (p.pp || 0) * wb(p) * m, extra = cap ? base : 0, sd = sdOf(p) * wb(p) * m * (cap ? 2 : 1);
    rows.push({ c, slot, captain: cap, points: base + extra, base, captainExtra: extra, sd, price: p.price });
  }
  const cSd = coach ? Math.max(0, (coach.p90 - coach.p10) / (2 * Z)) : 0;
  const total = rows.reduce((s, x) => s + x.points, 0) + (coach ? coach.exp : 0);
  const varT = rows.reduce((s, x) => s + x.sd * x.sd, 0) + cSd * cSd, sdT = Math.sqrt(varT) || 1;
  // κατανομή Euler: floor_i = μ_i − Z·σ_i²/σ, ceiling_i = μ_i + Z·σ_i²/σ → τα αθροίσματα δίνουν ακριβώς floor/ceiling του συνόλου
  for (const x of rows) Object.assign(x, { share: x.points / total, floor: x.points - Z * (x.sd * x.sd) / sdT, ceiling: x.points + Z * (x.sd * x.sd) / sdT, riskShare: (x.sd * x.sd) / varT, perCredit: x.price ? x.points / x.price : 0 });
  const coachRow = coach ? { t: coach.t, points: coach.exp, share: coach.exp / total, floor: coach.exp - Z * cSd * cSd / sdT, ceiling: coach.exp + Z * cSd * cSd / sdT, riskShare: (cSd * cSd) / varT, price: coach.price } : null;
  const captainTotal = rows.find(x => x.captain)?.captainExtra || 0;
  return { rows, coach: coachRow, total: r1(total), floor: r1(total - Z * sdT), ceiling: r1(total + Z * sdT), sd: r1(sdT), captainExtra: r1(captainTotal), benchPoints: r1(rows.filter(x => x.slot === 'bench').reduce((s, x) => s + x.points, 0)) };
}

/** features ενός παίκτη και σύγκριση με τη θέση του (εκατοστημόρια μέσα στο pool) */
export function featuresOf(p, pool) {
  const same = pool.filter(x => x.pos === p.pos && !OUT(x.status));
  const f = {
    pp: p.pp, min: p.pm, pirpm: p.pirpm, ppc: p.price ? (p.pp || 0) / p.price : 0, start: p.start, status: p.status, odrtg: p.odrtg, pace: p.gpace, home: !!p.home, rest: p.rest, b2b: !!p.b2b,
    form: { l3: p.l3, l5: p.l5, l10: p.l10 }, gp: p.gp, day: p.day, diff: p.nx?.[0]?.[4] ?? null, risk: riskScore(p).score,
  };
  f.pct = { pp: pctIn(same.map(x => x.pp || 0), p.pp || 0), pirpm: pctIn(same.map(x => x.pirpm || 0), p.pirpm || 0), ppc: pctIn(same.map(x => (x.pp || 0) / x.price), f.ppc) };
  const odr = pool.map(x => x.odrtg).filter(x => x != null), pc = pool.map(x => x.gpace).filter(x => x != null);
  f.pct.odrtg = p.odrtg != null ? pctIn(odr, p.odrtg) : null;   // υψηλό = αδύναμη άμυνα αντιπάλου (καλό για τον παίκτη)
  f.pct.pace = p.gpace != null ? pctIn(pc, p.gpace) : null;
  return f;
}

/**
 * Λόγοι (με τιμές) που εξηγούν την απόφαση. Κάθε λόγος προκύπτει από κανόνα πάνω στα features:
 * high_pp (εκτίμηση στο top 25% της θέσης), high_start (≥ 75%), good_matchup (δυσκολία ≤ 2 ή αδύναμη άμυνα: DRtg στο top 30%),
 * fast_pace (top 30% ρυθμού), value (PIR/credit στο top 25%), form_up (L3 > L10 + 2), low_start (< 40%), injury (αμφίβολος/εκτός),
 * plays_later (παίζει σε επόμενη μέρα από τους βασικούς), cheap (≤ 5,5 credits), best_median_starter (αρχηγός), small_sample (< 3 αγώνες)
 */
export function reasonsFor(c, decision, lu, players, pool) {
  const P = new Map(players.map(p => [p.c, p])), p = P.get(c), f = featuresOf(p, pool), R = [];
  const add = (k, v) => R.push({ k, v });
  if (f.pct.pp >= 0.75) add('high_pp', f.pp);
  if ((f.start ?? 0) >= 0.75) add('high_start', f.start);
  // matchup: η δυσκολία (PIR που δίνει ο αντίπαλος στη θέση + άμυνα) υπερισχύει· αλλιώς η άμυνα του αντιπάλου μόνη της
  if (f.diff != null && f.diff >= 4) add('hard_matchup', f.odrtg);
  else if ((f.diff != null && f.diff <= 2) || (f.diff !== 3 && f.pct.odrtg != null && f.pct.odrtg >= 0.7)) add('good_matchup', f.odrtg);
  if (f.pct.pace != null && f.pct.pace >= 0.7) add('fast_pace', f.pace);
  if (f.pct.ppc >= 0.75) add('value', f.ppc);
  if ((f.form.l3 ?? 0) > (f.form.l10 ?? 0) + 2) add('form_up', f.form.l3);
  if ((f.start ?? 1) < 0.4) add('low_start', f.start);
  if (p.status === 'doubtful') add('injury', p.status);
  if ((f.gp ?? 9) < 3) add('small_sample', f.gp);
  if (decision === 'captain') {
    const meds = lu.start.map(x => P.get(x)).filter(x => !OUT(x.status)).sort((a, b) => (b.p50 || 0) * wb(b) - (a.p50 || 0) * wb(a));
    if (meds[0]?.c === c) add('best_median_starter', r1(2 * (p.p50 || 0) * wb(p)));
    else add('captain_tradeoff', r1(2 * (p.p50 || 0) * wb(p)));
  }
  if (decision === 'bench') {
    const minStartDay = Math.min(...lu.start.map(x => P.get(x).day ?? 9));
    if ((p.day ?? -1) > minStartDay) add('plays_later', p.day);
    if (p.price <= 5.5) add('cheap', p.price);
    const worstStarter = lu.start.map(x => P.get(x)).filter(x => x.pos === p.pos).sort((a, b) => a.pp - b.pp)[0];
    if (worstStarter && (p.pp || 0) < worstStarter.pp) add('below_starters', worstStarter.pp);
  }
  return { features: f, reasons: R };
}

/** κείμενο από τους λόγους (Λ = λεξικό της γλώσσας με templates {v}) */
export function sentence(decision, reasons, L, fmt = x => (typeof x === 'number' ? (x < 1.01 && x > 0 && !Number.isInteger(x) ? Math.round(100 * x) + '%' : (Math.round(x * 10) / 10).toString()) : x)) {
  const parts = reasons.filter(r => L.r[r.k]).map(r => L.r[r.k].replace('{v}', fmt(r.v)));
  const head = L.d[decision] || '';
  if (!parts.length) return head + (L.none || '');
  const and = L.and || ', ';
  return head + ' ' + (parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + and + parts[parts.length - 1]) + '.';
}

/** key factors με score 0–100 και παραμέτρους για την εξήγηση */
export function keyFactors(lu, players, coaches, { budget = 100, maxPerTeam = 6 } = {}) {
  const P = new Map(players.map(p => [p.c, p])), all = [...lu.start, lu.sixth, ...lu.bench].map(c => P.get(c));
  const coach = coaches.find(c => c.t === lu.coach);
  const cost = all.reduce((s, p) => s + p.price, 0) + (coach?.price || 0);
  const C = contributions(lu, players, coaches);
  const expo = {}; for (const p of all) expo[p.t] = (expo[p.t] || 0) + 1;
  const maxE = Math.max(...Object.values(expo)), hhi = Object.values(expo).reduce((s, n) => s + (n / 10) ** 2, 0);
  const posPts = { Guard: 0, Forward: 0, Center: 0 }; for (const x of C.rows) posPts[P.get(x.c).pos] += x.points;
  const capRow = C.rows.find(x => x.captain), starters = C.rows.filter(x => x.slot === 'start').sort((a, b) => b.base - a.base);
  const second = starters.find(x => !x.captain);
  const minStartDay = Math.min(...lu.start.map(c => P.get(c).day ?? 9));
  const benchLater = lu.bench.filter(c => (P.get(c).day ?? -1) > minStartDay).length;
  const risks = all.map(p => riskScore(p).score), doubt = all.filter(p => p.status === 'doubtful').length;
  const diffs = all.map(p => p.nx?.[0]?.[4]).filter(x => x != null), avgDiff = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 3;
  const paces = players.map(p => p.gpace).filter(x => x != null).sort((a, b) => a - b), myPace = all.map(p => p.gpace).filter(x => x != null);
  const avgPace = myPace.length ? myPace.reduce((a, b) => a + b, 0) / myPace.length : null;
  const clamp = x => Math.max(0, Math.min(100, Math.round(x)));
  return [
    { k: 'budget', score: clamp((100 * cost) / budget), p: { cost: r1(cost), budget, left: r1(budget - cost) } },
    { k: 'concentration', score: clamp(100 - (100 * (hhi - 0.1)) / 0.26), p: { maxTeam: Object.entries(expo).sort((a, b) => b[1] - a[1])[0][0], max: maxE, teams: Object.keys(expo).length, cap: maxPerTeam } },
    { k: 'positions', score: clamp(100 - 100 * Math.abs(posPts.Guard / C.total - 0.4) - 100 * Math.abs(posPts.Forward / C.total - 0.4)), p: { g: r3(posPts.Guard / C.total), f: r3(posPts.Forward / C.total), cc: r3(posPts.Center / C.total), formation: lu.formation } },
    { k: 'captain', score: clamp(100 - riskScore(P.get(lu.captain)).score), p: { cap: lu.captain, extra: r1(capRow?.captainExtra || 0), share: r3((capRow?.points || 0) / C.total), gap: r1((capRow?.base || 0) - (second?.base || 0)) } },
    { k: 'bench', score: clamp(25 * benchLater), p: { points: C.benchPoints, later: benchLater } },
    { k: 'injury', score: clamp(100 - risks.reduce((a, b) => a + b, 0) / risks.length - 10 * doubt), p: { avgRisk: Math.round(risks.reduce((a, b) => a + b, 0) / risks.length), doubtful: doubt } },
    { k: 'fixtures', score: clamp(125 - 25 * avgDiff), p: { avg: r1(avgDiff) } },
    { k: 'pace', score: avgPace == null ? null : clamp(100 * pctIn(paces, avgPace)), p: { avg: avgPace == null ? null : r1(avgPace) } },
    { k: 'ownership', score: null, available: false, p: {} },
  ];
}

/** 5 στρατηγικές: ξανατρέχει τον solver με διαφορετικό objective (ίδιοι περιορισμοί) */
export const STRATEGIES = [
  { k: 'safest', opts: { mode: 'safe' } },
  { k: 'balanced', opts: { mode: 'balanced' } },
  { k: 'ceiling', opts: { mode: 'ceiling' } },
  { k: 'value', opts: { mode: 'balanced', costPenalty: 1.0 } },   // κάθε credit πρέπει να φέρνει ≥ 1 πόντο (≈ μέσο PIR/credit), αλλιώς μένει στο ταμείο
  { k: 'differential', unavailable: 'ownership' },
];
export function alternatives(players, coaches, base = {}, main = null) {
  const out = [];
  for (const s of STRATEGIES) {
    if (s.unavailable) { out.push({ k: s.k, available: false, why: s.unavailable }); continue; }
    const sol = solve(players, coaches, { ...base, ...s.opts, timeLimitMs: base.timeLimitMs ?? 2000 });
    if (!sol.start) { out.push({ k: s.k, available: false, why: 'infeasible', errors: sol.errors }); continue; }
    let lu = { formation: sol.formation, start: sol.start, sixth: sol.sixth, bench: sol.bench, captain: sol.captain, coach: sol.coach };
    // ίδια τοποθέτηση με την κύρια σύνθεση: ο multi-turn planner (αν δοθούν μέρες), ώστε οι διαφορές να είναι μόνο στρατηγικής
    if (base.days && base.days.length > 1) { const pt = planTurns(sol.roster, sol.coach, players, coaches, base.days, { mode: s.opts.mode, nSim: base.nSim ?? 200, topK: base.topK ?? 40 }); if (pt) lu = pt.lineup; }
    out.push({ k: s.k, available: true, status: sol.status, lineup: lu, ...metricsOf(lu, players, coaches, base.budget ?? 100), diff: main ? compare(main, lu, players, coaches, base.budget ?? 100) : null });
  }
  return out;
}

export function metricsOf(lu, players, coaches, budget = 100) {
  const r = simulate({ ...lu, formation: 'auto' }, players, coaches, { cap: budget });
  return { expected: r.expected, floor: r.floor, median: r.median, ceiling: r.ceiling, risk: r.risk, exposure: r.exposure, cost: r.cost, budgetLeft: r.budget };
}

/** σύγκριση δύο lineups: ποιοι μπαίνουν/βγαίνουν/αλλάζουν slot και διαφορές μεγεθών */
export function compare(a, b, players, coaches, budget = 100) {
  const slotOf = (lu, c) => (c === lu.captain ? 'captain' : lu.start.includes(c) ? 'start' : lu.sixth === c ? 'sixth' : lu.bench.includes(c) ? 'bench' : null);
  const ra = [...a.start, a.sixth, ...a.bench], rb = [...b.start, b.sixth, ...b.bench];
  const players_ = [...new Set([...ra, ...rb])].map(c => ({ c, a: slotOf(a, c), b: slotOf(b, c) })).map(x => ({ ...x, change: !x.a ? 'in' : !x.b ? 'out' : x.a !== x.b ? 'slot' : 'same' }));
  const ma = metricsOf(a, players, coaches, budget), mb = metricsOf(b, players, coaches, budget);
  const d = k => Math.round((mb[k] - ma[k]) * 10) / 10;
  const expo = [...new Set([...Object.keys(ma.exposure), ...Object.keys(mb.exposure)])].map(t => ({ t, a: ma.exposure[t] || 0, b: mb.exposure[t] || 0 }));
  return { players: players_, a: ma, b: mb, delta: { expected: d('expected'), floor: d('floor'), median: d('median'), ceiling: d('ceiling'), risk: d('risk'), budgetLeft: d('budgetLeft') }, captain: { a: a.captain, b: b.captain, same: a.captain === b.captain }, coach: { a: a.coach, b: b.coach }, exposure: expo, changed: players_.filter(x => x.change !== 'same').length };
}

/** sensitivity: πόσο αλλάζει το σύνολο αν κάποιος δεν παίξει ή παίξει περισσότερα/λιγότερα λεπτά */
export function sensitivity(lu, players, coaches) {
  const P = new Map(players.map(p => [p.c, p]));
  const base = simulate({ ...lu, formation: 'auto' }, players, coaches).expected;
  const sim = (ov, cap = lu.captain) => simulate({ ...lu, captain: cap, formation: 'auto', overrides: ov }, players, coaches).expected;
  const all = [...lu.start, lu.sixth, ...lu.bench];
  const rows = all.map(c => {
    const p = P.get(c), slot = c === lu.captain ? 'captain' : lu.start.includes(c) ? 'start' : c === lu.sixth ? 'sixth' : 'bench';
    const dnp = sim({ [c]: { status: 'injured' } }) - base;
    // backup: παίκτης πάγκου (ίδια θέση για βασικό, οποιοσδήποτε για τον 6ο) που παίζει την ίδια ή επόμενη μέρα → αλλαγή αν μάθεις ότι δεν παίζει
    const backup = slot === 'bench' ? null : lu.bench.map(x => P.get(x)).filter(x => !OUT(x.status) && (slot === 'sixth' || x.pos === p.pos) && (x.day ?? 0) >= (p.day ?? 0)).sort((a, b) => b.pp - a.pp)[0] || null;
    const dnpWithSwap = backup ? dnp + (backup.pp || 0) * wb(backup) * 0.5 : dnp;
    const pmBase = p.pm0 ?? p.pm ?? 0;
    const minDown = pmBase > 0 ? sim({ [c]: { min: pmBase * 0.75 } }) - base : 0;
    const minUp = pmBase > 0 ? sim({ [c]: { min: Math.min(40, pmBase * 1.25) } }) - base : 0;
    let capSwap = null;
    if (slot === 'captain') {
      const alt = lu.start.filter(x => x !== c && (P.get(x).day ?? 0) >= (p.day ?? 0) && !OUT(P.get(x).status)).sort((a, b) => P.get(b).pp - P.get(a).pp)[0];
      capSwap = alt ? { to: alt, delta: Math.round((sim({ [c]: { status: 'injured' } }, alt) - base) * 10) / 10 } : null;
    }
    return { c, slot, dnp: Math.round(dnp * 10) / 10, dnpWithSwap: Math.round(dnpWithSwap * 10) / 10, backup: backup?.c || null, minDown: Math.round(minDown * 10) / 10, minUp: Math.round(minUp * 10) / 10, capSwap };
  });
  for (const r of rows) {
    const share = Math.abs(r.dnp) / Math.max(base, 1);
    r.impact = share >= 0.15 ? 'high' : share >= 0.07 ? 'medium' : 'low';
    r.spof = share >= 0.15 && (!r.backup || Math.abs(r.dnpWithSwap) / Math.max(base, 1) >= 0.12) && !(r.capSwap && Math.abs(r.capSwap.delta) / base < 0.12);
  }
  rows.sort((a, b) => a.dnp - b.dnp);
  return { base: Math.round(base * 10) / 10, rows };
}

/** CSV ενός lineup (με συνεισφορές) */
export function lineupCSV(lu, players, coaches, name = c => c) {
  const C = contributions(lu, players, coaches), P = new Map(players.map(p => [p.c, p]));
  const q = v => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const rows = [['slot', 'captain', 'player', 'team', 'position', 'price', 'projected_pir', 'fantasy_points', 'captain_extra', 'share', 'floor_contrib', 'ceiling_contrib', 'risk_share'],
    ...C.rows.map(x => { const p = P.get(x.c); return [x.slot, x.captain ? 1 : 0, name(x.c), p.t, p.pos, p.price, p.pp, r1(x.points), r1(x.captainExtra), r3(x.share), r1(x.floor), r1(x.ceiling), r3(x.riskShare)]; }),
    ...(C.coach ? [['coach', 0, C.coach.t, C.coach.t, '', C.coach.price, '', r1(C.coach.points), 0, r3(C.coach.share), r1(C.coach.floor), r1(C.coach.ceiling), r3(C.coach.riskShare)]] : []),
    ['total', '', '', '', '', '', '', C.total, C.captainExtra, 1, C.floor, C.ceiling, 1]];
  return rows.map(r => r.map(q).join(',')).join('\n');
}
