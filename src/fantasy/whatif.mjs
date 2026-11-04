// What-If Simulator: εφαρμόζει αλλαγές σε μια σύνθεση και ξαναϋπολογίζει όλα τα μεγέθη.
// Floor/median/ceiling του συνόλου: άθροισμα κανονικών κατανομών (σ από P10–P90 κάθε παίκτη), όχι απλό άθροισμα P10 (που θα ήταν υπερβολικά απαισιόδοξο).
import { FORMATIONS, ROSTER } from './optimizer.mjs';
import { riskScore, wb } from './captain.mjs';

export const CAP = 100, MAX_SCEN = 5;
const Z = 1.2816;

const SM = { playing: 1, doubtful: 0.4, injured: 0, rest: 0 };
// εκτίμηση «αν παίξει κανονικά»: pp0 από το μοντέλο (πριν από τον συντελεστή κατάστασης)
export function fitProjection(p) {
  const fit = p.pp0 ?? p.pp ?? 0;
  if ((p.pp || 0) > 0.05) { const k = fit / p.pp; return { pp: fit, p10: (p.p10 || 0) * k, p50: (p.p50 || 0) * k, p90: (p.p90 || 0) * k }; }
  // ο παίκτης ήταν εκτός (όλα 0): τυπικές αναλογίες P10/P50/P90 του μοντέλου ως προς την εκτίμηση
  return { pp: fit, p10: 0.4 * fit, p50: 0.95 * fit, p90: 1.65 * fit };
}
/** ov = { status?: playing|doubtful|injured|rest, min?: αναμενόμενα λεπτά }
 *  τελικό = εκτίμηση «αν παίξει» × συντελεστής κατάστασης × (λεπτά / λεπτά του μοντέλου) — το PIR κλιμακώνεται αναλογικά με τα λεπτά */
export function applyOverride(p, ov) {
  const hasMin = ov && ov.min != null && ov.min !== '';
  if (!ov || (ov.status == null && !hasMin)) return p;
  const st = ov.status ?? p.status, m = SM[st] ?? 1, f = fitProjection(p);
  const baseMin = p.pm0 ?? p.pm ?? 0;
  const k = hasMin && baseMin > 0 ? Math.max(0, +ov.min) / baseMin : 1;
  return { ...p, status: st, pm: hasMin ? +ov.min : (baseMin * m), pp: f.pp * m * k, p10: f.p10 * m * k, p50: f.p50 * m * k, p90: f.p90 * m * k, overridden: true };
}

/** state = { start:[5], sixth, bench:[4], captain, coach, formation, trades:[{out,in}], overrides:{c:{status,min}}, bank? } */
export function simulate(state, players, coaches, { cap = CAP, curTurn = null } = {}) {
  const P0 = new Map(players.map(p => [p.c, p]));
  const swap = new Map((state.trades || []).filter(t => t.out && t.in).map(t => [t.out, t.in]));
  const tr = c => swap.get(c) || c;
  const start = state.start.map(tr), bench = state.bench.map(tr), sixth = state.sixth ? tr(state.sixth) : null;
  const captain = state.captain ? tr(state.captain) : null;
  const get = c => applyOverride(P0.get(c), state.overrides?.[c]);
  const slots = [...start.map(c => [c, 'start']), ...(sixth ? [[sixth, 'sixth']] : []), ...bench.map(c => [c, 'bench'])].filter(([c]) => P0.has(c));
  const coach = coaches.find(x => x.t === state.coach) || null;
  const warnings = [];
  // έλεγχοι
  const all = slots.map(([c]) => P0.get(c));
  const cnt = { Guard: 0, Forward: 0, Center: 0 };
  for (const p of all) cnt[p.pos]++;
  for (const ps of Object.keys(ROSTER)) if (cnt[ps] !== ROSTER[ps]) warnings.push({ k: 'roster_pos', pos: ps, n: cnt[ps], need: ROSTER[ps] });
  if (state.formation && state.formation !== 'auto' && FORMATIONS[state.formation]) {
    const need = FORMATIONS[state.formation], sp = ['Guard', 'Forward', 'Center'].map(ps => start.filter(c => P0.get(c)?.pos === ps).length);
    if (sp.some((n, i) => n !== need[i])) warnings.push({ k: 'formation', f: state.formation, have: sp.join('-') });
  }
  if (start.length !== 5) warnings.push({ k: 'start_count', n: start.length });
  if (captain && !start.includes(captain)) warnings.push({ k: 'captain_not_starter', c: captain });
  if (new Set(slots.map(s => s[0])).size !== slots.length) warnings.push({ k: 'dup' });
  if (curTurn != null) for (const [c, s] of slots) { const p = P0.get(c); if (s !== 'bench' && p.day != null && p.day < curTurn && (state.moved || []).includes(c)) warnings.push({ k: 'played_active', c }); }
  if (curTurn != null && captain) { const p = P0.get(captain); if (p && p.day != null && p.day < curTurn && state.captainChanged) warnings.push({ k: 'captain_played', c: captain }); }
  // υπολογισμοί
  let mean = 0, varr = 0, capImpact = 0, benchImpact = 0, winBonus = 0, riskW = 0, wsum = 0;
  const per = [];
  for (const [c, slot] of slots) {
    const p = get(c);
    const isCap = c === captain && slot === 'start';
    const m = (slot === 'bench' ? 0.5 : 1) * (isCap ? 2 : 1);
    const e = (p.pp || 0) * wb(p) * m;
    const sd = Math.max(0, ((p.p90 || 0) - (p.p10 || 0)) / (2 * Z)) * wb(p) * m;
    mean += e; varr += sd * sd;
    winBonus += (p.pp || 0) * 0.1 * (p.pwin ?? 0.5) * m;
    if (isCap) capImpact = (p.pp || 0) * wb(p);
    if (slot === 'bench') benchImpact += e;
    const r = riskScore(p).score; riskW += r * m; wsum += m;
    per.push({ c, slot, captain: isCap, exp: +e.toFixed(1), risk: r, status: p.status, pp: +(p.pp || 0).toFixed(1) });
  }
  if (coach) { mean += coach.exp; const sd = Math.max(0, (coach.p90 - coach.p10) / (2 * Z)); varr += sd * sd; }
  const sd = Math.sqrt(varr);
  const cost = all.reduce((s, p) => s + p.price, 0) + (coach ? coach.price : 0);
  const exposure = {};
  for (const p of all) exposure[p.t] = (exposure[p.t] || 0) + 1;
  for (const [t, n] of Object.entries(exposure)) if (n > 6) warnings.push({ k: 'team_max', t, n });
  const budget = +((state.bank != null && state.bank !== '' ? +state.bank - (state.trades || []).reduce((s, x) => s + ((P0.get(x.in)?.price || 0) - (P0.get(x.out)?.price || 0)), 0) : cap - cost)).toFixed(1);
  if (budget < -1e-9) warnings.push({ k: 'budget', budget });
  const risk = wsum ? Math.round(riskW / wsum) : 0;
  return {
    expected: +mean.toFixed(1), median: +mean.toFixed(1), floor: +(mean - Z * sd).toFixed(1), ceiling: +(mean + Z * sd).toFixed(1), sd: +sd.toFixed(1),
    winBonus: +winBonus.toFixed(1), coach: coach ? { t: coach.t, exp: coach.exp, pwin: coach.pwin } : null,
    exposure, maxExposure: Math.max(0, ...Object.values(exposure)), cost: +cost.toFixed(1), budget, risk, riskLabel: risk >= 45 ? 'high' : risk >= 28 ? 'medium' : 'low',
    captainImpact: +capImpact.toFixed(1), benchImpact: +benchImpact.toFixed(1), vpc: cost ? +(mean / cost).toFixed(3) : 0,
    lineup: { start, sixth, bench, captain, coach: state.coach, formation: state.formation }, per, warnings,
  };
}

// diff δύο αποτελεσμάτων (για «άμεση ενημέρωση» μετά από κάθε αλλαγή)
export function delta(a, b) {
  const k = ['expected', 'floor', 'ceiling', 'risk', 'budget', 'captainImpact', 'benchImpact', 'vpc', 'winBonus'];
  return Object.fromEntries(k.map(x => [x, +((b[x] ?? 0) - (a[x] ?? 0)).toFixed(3)]));
}

// ---------- scenarios (έως 5 ανά γύρο)
export function saveScenario(list, round, name, state, result) {
  const same = list.filter(s => s.round === round);
  const i = same.findIndex(s => s.name === name);
  const rec = { round, name, state: JSON.parse(JSON.stringify(state)), result: { expected: result.expected, floor: result.floor, median: result.median, ceiling: result.ceiling, risk: result.risk, budget: result.budget, maxExposure: result.maxExposure, exposure: result.exposure, captainImpact: result.captainImpact, benchImpact: result.benchImpact, vpc: result.vpc, lineup: result.lineup }, ts: Date.now() };
  if (i >= 0) return { ok: true, list: list.map(s => (s.round === round && s.name === name ? rec : s)) };
  if (same.length >= MAX_SCEN) return { ok: false, err: 'max', list };
  return { ok: true, list: [...list, rec] };
}

/** σύγκριση: πίνακας + κανονικοποιημένοι άξονες 0–1 για radar */
export const AXES = ['expected', 'floor', 'ceiling', 'safety', 'budget', 'spread'];
export function compareScenarios(list) {
  if (!list.length) return { rows: [], axes: AXES, norm: [], best: {} };
  const raw = list.map(s => ({ expected: s.result.expected, floor: s.result.floor, ceiling: s.result.ceiling, safety: 100 - s.result.risk, budget: s.result.budget, spread: 6 - s.result.maxExposure }));
  const norm = raw.map(r => Object.fromEntries(AXES.map(a => { const v = raw.map(x => x[a]); const lo = Math.min(...v), hi = Math.max(...v); return [a, hi > lo ? (r[a] - lo) / (hi - lo) : 1]; })));
  const best = Object.fromEntries(AXES.map(a => [a, raw.reduce((bi, r, i) => (r[a] > raw[bi][a] ? i : bi), 0)]));
  return { rows: list.map((s, i) => ({ name: s.name, ...s.result, raw: raw[i] })), axes: AXES, norm, best };
}
