// Optimizer v2: ακριβής λύση του προβλήματος σύνθεσης του EuroLeague Fantasy Challenge.
//
// Μεταβλητές: για κάθε παίκτη i ένα slot ∈ {όχι, πεντάδα, αρχηγός (⊂ πεντάδα), 6ος, πάγκος}, ένας προπονητής.
// Objective:  max Σ v_i·(start_i + sixth_i + 0,5·bench_i + captain_i) + coach_value − concentration penalty
// Περιορισμοί: Σ τιμών ≤ budget · 4G/4F/2C · πεντάδα 5 σε σχηματισμό {2-2-1,1-2-2,2-1-2,1-3-1,3-1-1} · 1 έκτος · 4 πάγκος
//              · 1 αρχηγός από την πεντάδα · 1 προπονητής · ≤ maxPerTeam ανά ομάδα · locks/excludes · εκτός ⇒ όχι ενεργό slot
//              · όποιος έχει παίξει στον γύρο κρατά το slot του (fixed)
// Μέθοδος: δυναμικός προγραμματισμός ανά θέση (budget σε βήματα 0,1 credit, όλα τα (αρχηγός, πεντάδα, 6ος, πάγκος)),
// συνδυασμός θέσεων + προπονητή για κάθε σχηματισμό (max-plus), και branch-and-bound για το όριο ανά ομάδα:
// αν η λύση έχει > maxPerTeam από μία ομάδα, κάθε έγκυρη λύση αποκλείει κάποιον από αυτούς → διακλάδωση «χωρίς τον i».
// Αποτέλεσμα: πραγματικό βέλτιστο (status 'optimal'), ή η καλύτερη έγκυρη λύση αν τελειώσει ο χρόνος ('feasible_timeout').
import { FORMATIONS, POS, ROSTER, OUT } from './rules.mjs';

export const SOLVER = 'dp-bnb-v1';
const Z = 2.5631;   // P90 − P10 = 2·1,2816·σ
const MODE = {
  safe: { lam: 0.6, pen: 1.5 },       // μεγιστοποίησε P50, τιμώρησε το downside
  balanced: { lam: 0.25, pen: 1 },    // αναμενόμενο με λογικό risk penalty
  ceiling: { lam: 0, pen: 0.5 },      // μεγιστοποίησε P90 / upside
  expected: { lam: 0, pen: 0 },       // καθαρή αναμενόμενη τιμή (για σύγκριση και tests)
};
export const sdOf = p => Math.max(0, ((p.p90 || 0) - (p.p10 || 0)) / Z);
export const winMult = p => 1 + 0.1 * (p.pwin ?? 0.5);

/** penalties ρίσκου (σε πόντους), με τους λόγους τους για τις εξηγήσεις */
export function penalties(p) {
  const out = {};
  if (p.status === 'doubtful') out.doubtful = 3;
  if (p.start != null && p.start < 0.4) out.lowStart = 1.5;
  if ((p.gp ?? 9) < 3) out.small = 2;
  const sd = sdOf(p);
  if (p.p50 > 0 && sd / Math.max(p.p50, 5) > 0.7) out.uncertain = 1;
  return out;
}
/** αξία ενός παίκτη σε ενεργό slot ανάλογα με το mode (ο πάγκος παίρνει το 0,5 της, ο αρχηγός +1 φορά) */
export function playerValue(p, mode = 'balanced') {
  if (OUT(p.status)) return 0;
  const M = MODE[mode] || MODE.balanced, w = winMult(p), sd = sdOf(p);
  const pen = Object.values(penalties(p)).reduce((s, x) => s + x, 0) * M.pen;
  const base = mode === 'safe' ? (p.p50 || 0) : mode === 'ceiling' ? (p.p90 || 0) : (p.pp || 0);
  return (base - M.lam * sd) * w - pen;
}
export function coachValue(c, mode = 'balanced') {
  if (!c) return 0;
  return mode === 'safe' ? 0.5 * c.p50 + 0.5 * c.exp : mode === 'ceiling' ? 0.5 * c.p90 + 0.5 * c.exp : c.exp;
}

// ---------- DP ανά θέση
// choice codes: 0 όχι, 1 πάγκος, 2 έκτος, 3 πεντάδα, 4 αρχηγός
const SLOT_W = [0, 0.5, 1, 1, 2];
function dpPosition(items, n, B, mode) {
  // state: cap 0..1, st 0..n, six 0..1, bn 0..n, cost 0..B
  const N1 = n + 1, S = 2 * N1 * 2 * N1, C = B + 1;
  const idx = (cap, st, six, bn) => ((cap * N1 + st) * 2 + six) * N1 + bn;
  let cur = new Float64Array(S * C).fill(-Infinity);
  cur[idx(0, 0, 0, 0) * C + 0] = 0;
  const choice = new Int8Array(items.length * S * C);   // επιλογή στο item k που οδήγησε στο (state, cost)
  for (let k = 0; k < items.length; k++) {
    const it = items[k], nxt = new Float64Array(S * C).fill(-Infinity), pc = it.cost, base = k * S * C;
    const allowed = it.allowed;   // πίνακας 5 booleans
    for (let cap = 0; cap < 2; cap++) for (let st = 0; st <= n; st++) for (let six = 0; six < 2; six++) for (let bn = 0; bn <= n; bn++) {
      const tot = cap + st + six + bn; if (tot > n) continue;
      const s = idx(cap, st, six, bn), off = s * C;
      for (let c = 0; c < C; c++) {
        const v = cur[off + c]; if (v === -Infinity) continue;
        if (allowed[0]) { const o = off + c; if (v > nxt[o]) { nxt[o] = v; choice[base + o] = 0; } }
        if (tot === n || c + pc > B) continue;
        const nc = c + pc;
        if (allowed[1]) { const o = idx(cap, st, six, bn + 1) * C + nc, nv = v + it.v * 0.5; if (nv > nxt[o]) { nxt[o] = nv; choice[base + o] = 1; } }
        if (allowed[2] && !six) { const o = idx(cap, st, 1, bn) * C + nc, nv = v + it.v; if (nv > nxt[o]) { nxt[o] = nv; choice[base + o] = 2; } }
        if (allowed[3]) { const o = idx(cap, st + 1, six, bn) * C + nc, nv = v + it.v; if (cap + st + 1 + six + bn <= n && nv > nxt[o]) { nxt[o] = nv; choice[base + o] = 3; } }
        if (allowed[4] && !cap) { const o = idx(1, st, six, bn) * C + nc, nv = v + it.v * 2; if (nv > nxt[o]) { nxt[o] = nv; choice[base + o] = 4; } }
      }
    }
    cur = nxt;
  }
  // backtrack για ένα (state, cost)
  const back = (cap, st, six, bn, cost) => {
    const pick = [];
    let s = idx(cap, st, six, bn), c = cost;
    for (let k = items.length - 1; k >= 0; k--) {
      const ch = choice[k * S * C + s * C + c];
      if (ch) {
        pick.push({ c: items[k].c, slot: ['', 'bench', 'sixth', 'start', 'captain'][ch] });
        c -= items[k].cost;
        if (ch === 1) bn--; else if (ch === 2) six = 0; else if (ch === 3) st--; else cap = 0;
        s = idx(cap, st, six, bn);
      }
    }
    return pick;
  };
  // πίνακας «καλύτερο με κόστος ≤ k» για κάθε config (cap, st, six, bn) που γεμίζει ακριβώς n
  const prefix = (cap, st, six, bn) => {
    if (cap + st + six + bn !== n || st < 0 || bn < 0) return null;
    const off = idx(cap, st, six, bn) * C, val = new Float64Array(C), arg = new Int32Array(C);
    let bv = -Infinity, ba = -1;
    const bp = [];   // σημεία Pareto (κόστος όπου η καλύτερη τιμή ανεβαίνει)
    for (let c = 0; c < C; c++) { if (cur[off + c] > bv) { bv = cur[off + c]; ba = c; bp.push(c); } val[c] = bv; arg[c] = ba; }
    return { val, arg, bp };
  };
  return { prefix, back };
}

function itemsFor(players, ps, o, P) {
  // εκτός (τραυματίας/ξεκούραση): δεν προτείνεται καθόλου, εκτός αν είναι κλειδωμένος ή έχει ήδη παίξει (τότε μόνο πάγκος)
  return players.filter(p => p.pos === ps && !o.exclude.has(p.c) && (!OUT(p.status) || o.lock.has(p.c) || o.fixed[p.c])).map(p => {
    const v = playerValue(p, o.mode), out = OUT(p.status), fixed = o.fixed[p.c];
    let allowed = [!o.lock.has(p.c) && !fixed, true, !out, !out, !out && !o.noCaptain.has(p.c)];
    // έχει ήδη παίξει: κρατά τη θέση του· ο αρχηγός που έπαιξε μπορεί μόνο να «χάσει» την αρχηγία (μένει στην πεντάδα)
    if (fixed) allowed = [false, fixed === 'bench', fixed === 'sixth', fixed === 'start' || fixed === 'captain', fixed === 'captain'];
    return { c: p.c, cost: Math.round(p.price * 10), v, allowed };
  }).filter(it => it.allowed.some(Boolean));
}

function solveOnce(players, coaches, o, cache) {
  const B = Math.round(o.budget * 10);
  const dps = {};
  for (const ps of POS) {
    const key = ps + '|' + [...o.exclude].filter(c => o.posOf[c] === ps).sort().join(',');
    if (!cache.has(key)) cache.set(key, dpPosition(itemsFor(players, ps, o), ROSTER[ps], B, o.mode));
    dps[ps] = cache.get(key);
  }
  const forms = o.formation && o.formation !== 'auto' ? [o.formation] : Object.keys(FORMATIONS);
  const cpool = coaches.filter(c => !o.exclude.has('COACH-' + c.t) && (!o.coachLock || c.t === o.coachLock));
  let best = null;
  for (const f of forms) {
    const need = FORMATIONS[f];
    for (let sp = 0; sp < 3; sp++) for (let cp = 0; cp < 3; cp++) {
      if (need[cp] < 1) continue;
      const pre = POS.map((ps, i) => { const cap = cp === i ? 1 : 0, six = sp === i ? 1 : 0; return dps[ps].prefix(cap, need[i] - cap, six, ROSTER[ps] - need[i] - six); });
      if (pre.some(x => !x)) continue;
      // max-plus G ⊕ F (καλύτερο με κόστος ≤ k)
      const C = B + 1, H = new Float64Array(C).fill(-Infinity);
      const [G, F, Cc] = pre;
      // max-plus μόνο πάνω στα σημεία Pareto (ίδιο αποτέλεσμα με το πλήρες O(C²), πολύ γρηγορότερα)
      for (const a of G.bp) for (const b of F.bp) { const k = a + b; if (k < C) { const v = G.val[a] + F.val[b]; if (v > H[k]) H[k] = v; } }
      for (let k = 1; k < C; k++) if (H[k - 1] > H[k]) H[k] = H[k - 1];
      for (const co of cpool) {
        const R = B - Math.round(co.price * 10); if (R < 0) continue;
        let bv = -Infinity, bk = -1;
        for (const c of Cc.bp) { if (c > R) break; const v = H[R - c] + Cc.val[c]; if (v > bv) { bv = v; bk = R - c; } }
        if (bv === -Infinity) continue;
        const tot = bv + coachValue(co, o.mode);
        if (!best || tot > best.obj) best = { obj: tot, f, sp, cp, coach: co, kGF: bk, kC: R - bk, pre };
      }
    }
  }
  if (!best) return null;
  // ανασύσταση
  const { pre, f, sp, cp } = best, need = FORMATIONS[f];
  // ξαναβρίσκουμε το split G/F που έδωσε το H[kGF]
  let aBest = 0, vB = -Infinity;
  for (const a of pre[0].bp) { if (a > best.kGF) break; const v = pre[0].val[a] + pre[1].val[best.kGF - a]; if (v > vB) { vB = v; aBest = a; } }
  const costs = [pre[0].arg[aBest], pre[1].arg[best.kGF - aBest], pre[2].arg[best.kC]];
  const picks = POS.flatMap((ps, i) => { const cap = cp === i ? 1 : 0, six = sp === i ? 1 : 0; return dps[ps].back(cap, need[i] - cap, six, ROSTER[ps] - need[i] - six, costs[i]); });
  return { obj: best.obj, formation: f, coach: best.coach.t, picks };
}

function teamViolation(picks, P, cap) {
  const by = {};
  for (const x of picks) (by[P.get(x.c).t] ||= []).push(x.c);
  const bad = Object.entries(by).filter(([, l]) => l.length > cap).sort((a, b) => b[1].length - a[1].length)[0];
  return bad ? { t: bad[0], players: bad[1] } : null;
}

/**
 * opts: budget, maxPerTeam, mode, formation ('auto' ή σχηματισμός), lock[], exclude[] (και «COACH-XXX»), sold[] (πουλήθηκαν ήδη),
 *       coach (κλείδωμα προπονητή), fixed {c: slot} για όσους έχουν ήδη παίξει, timeLimitMs
 */
export function solve(players, coaches, opts = {}) {
  const t0 = Date.now();
  const o = { budget: 100, maxPerTeam: 6, mode: 'balanced', formation: 'auto', timeLimitMs: 3000, ...opts };
  const P = new Map(players.map(p => [p.c, p]));
  o.posOf = Object.fromEntries(players.map(p => [p.c, p.pos]));
  o.lock = new Set(o.lock || []);
  o.exclude = new Set([...(o.exclude || []), ...(o.sold || [])].filter(c => !o.lock.has(c)));
  o.fixed = o.fixed || {};
  o.noCaptain = new Set(o.noCaptain || []);
  o.coachLock = o.coach || null;
  // έλεγχοι πριν τη λύση (καθαρά μηνύματα)
  const pre = [];
  for (const c of o.lock) if (!P.has(c)) pre.push({ k: 'lock_unknown', c });
  const lockCnt = {}; for (const c of o.lock) { const p = P.get(c); if (p) lockCnt[p.pos] = (lockCnt[p.pos] || 0) + 1; }
  for (const ps of POS) if ((lockCnt[ps] || 0) > ROSTER[ps]) pre.push({ k: 'lock_pos', pos: ps, n: lockCnt[ps] });
  const lockCost = [...o.lock].reduce((s, c) => s + (P.get(c)?.price || 0), 0);
  const cheapCoach = Math.min(...coaches.map(c => c.price));
  if (lockCost + cheapCoach > o.budget) pre.push({ k: 'lock_budget', cost: +lockCost.toFixed(1) });
  const lockTeams = {}; for (const c of o.lock) { const p = P.get(c); if (p) lockTeams[p.t] = (lockTeams[p.t] || 0) + 1; }
  for (const [t, n] of Object.entries(lockTeams)) if (n > o.maxPerTeam) pre.push({ k: 'lock_team', t, n });
  for (const ps of POS) { const av = players.filter(p => p.pos === ps && !o.exclude.has(p.c) && (!OUT(p.status) || o.lock.has(p.c) || o.fixed[p.c])).length; if (av < ROSTER[ps]) pre.push({ k: 'pool_pos', pos: ps, n: av }); }
  if (pre.length) return { status: 'infeasible', errors: pre, runtimeMs: Date.now() - t0 };

  const cache = new Map();
  let incumbent = null, nodes = 0, timedOut = false;
  // best-first branch-and-bound: κάθε κόμβος κρατά άνω όριο (το objective του γονιού)
  const open = [{ ex: new Set(), ub: Infinity }];
  const seen = new Set();
  while (open.length) {
    if (Date.now() - t0 > o.timeLimitMs) { timedOut = true; break; }
    open.sort((a, b) => a.ub - b.ub);
    const node = open.pop();
    if (incumbent && node.ub <= incumbent.obj + 1e-9) break;   // κανένας ανοιχτός κόμβος δεν μπορεί να βελτιώσει
    const key = [...node.ex].sort().join(',');
    if (seen.has(key)) continue; seen.add(key);
    nodes++;
    const oo = { ...o, exclude: new Set([...o.exclude, ...node.ex]) };
    const sol = solveOnce(players, coaches, oo, cache);
    if (!sol) continue;
    if (incumbent && sol.obj <= incumbent.obj + 1e-9) continue;
    const bad = teamViolation(sol.picks, P, o.maxPerTeam);
    if (!bad) { incumbent = sol; continue; }
    for (const c of bad.players) if (!o.lock.has(c) && !o.fixed[c]) open.push({ ex: new Set([...node.ex, c]), ub: sol.obj });
  }
  if (!incumbent) return { status: timedOut ? 'timeout_no_solution' : 'infeasible', errors: [{ k: timedOut ? 'timeout' : 'no_feasible' }], runtimeMs: Date.now() - t0, nodes };
  const start = incumbent.picks.filter(x => x.slot === 'start' || x.slot === 'captain').map(x => x.c);
  const res = {
    status: timedOut ? 'feasible_timeout' : 'optimal', solver: SOLVER, mode: o.mode, objective: +incumbent.obj.toFixed(2),
    formation: incumbent.formation, start, sixth: incumbent.picks.find(x => x.slot === 'sixth')?.c || null,
    bench: incumbent.picks.filter(x => x.slot === 'bench').map(x => x.c), captain: incumbent.picks.find(x => x.slot === 'captain')?.c || null,
    coach: incumbent.coach, runtimeMs: Date.now() - t0, nodes,
  };
  res.roster = [...res.start, res.sixth, ...res.bench].filter(Boolean);
  res.cost = +(res.roster.reduce((s, c) => s + P.get(c).price, 0) + (coaches.find(c => c.t === res.coach)?.price || 0)).toFixed(1);
  res.errors = validate(res, players, coaches, o);
  if (res.errors.length) res.status = 'invalid';
  return res;
}

/** ανεξάρτητος έλεγχος μιας λύσης (χρησιμοποιείται και για το roster του χρήστη) */
export function validate(sol, players, coaches, opts = {}) {
  const o = { budget: 100, maxPerTeam: 6, ...opts };
  const P = new Map(players.map(p => [p.c, p])), err = [];
  const roster = [...(sol.start || []), sol.sixth, ...(sol.bench || [])].filter(Boolean);
  if (roster.length !== 10) err.push({ k: 'roster_size', n: roster.length });
  if (new Set(roster).size !== roster.length) err.push({ k: 'dup' });
  if ((sol.start || []).length !== 5) err.push({ k: 'start_count', n: (sol.start || []).length });
  if (!sol.sixth) err.push({ k: 'sixth' });
  if ((sol.bench || []).length !== 4) err.push({ k: 'bench_count', n: (sol.bench || []).length });
  const coach = coaches.find(c => c.t === sol.coach);
  if (!coach) err.push({ k: 'coach' });
  if (!sol.captain || !(sol.start || []).includes(sol.captain)) err.push({ k: 'captain_slot' });
  const cnt = { Guard: 0, Forward: 0, Center: 0 }, sc = { Guard: 0, Forward: 0, Center: 0 }, teams = {};
  for (const c of roster) { const p = P.get(c); if (!p) { err.push({ k: 'unknown', c }); continue; } cnt[p.pos]++; teams[p.t] = (teams[p.t] || 0) + 1; }
  for (const c of sol.start || []) { const p = P.get(c); if (p) sc[p.pos]++; }
  for (const ps of POS) if (cnt[ps] !== ROSTER[ps]) err.push({ k: 'pos', pos: ps, n: cnt[ps] });
  const form = `${sc.Guard}-${sc.Forward}-${sc.Center}`;
  if (!FORMATIONS[form]) err.push({ k: 'formation', f: form });
  if (sol.formation && sol.formation !== 'auto' && sol.formation !== form) err.push({ k: 'formation_mismatch', f: sol.formation, have: form });
  for (const [t, n] of Object.entries(teams)) if (n > o.maxPerTeam) err.push({ k: 'team_max', t, n });
  const cost = roster.reduce((s, c) => s + (P.get(c)?.price || 0), 0) + (coach ? coach.price : 0);
  if (cost > o.budget + 1e-9) err.push({ k: 'budget', cost: +cost.toFixed(1) });
  for (const c of [...(sol.start || []), sol.sixth].filter(Boolean)) if (OUT(P.get(c)?.status)) err.push({ k: 'out_active', c });
  for (const c of o.lock || []) if (!roster.includes(c)) err.push({ k: 'lock_missing', c });
  for (const c of [...(o.exclude || []), ...(o.sold || [])]) if (roster.includes(c) && !(o.lock || []).includes?.(c)) err.push({ k: 'excluded_in', c });
  return err;
}

/** αξία μιας δεδομένης σύνθεσης με τον ίδιο τύπο του objective (για σύγκριση «πριν/μετά») */
export function objectiveOf(sol, players, coaches, mode = 'balanced') {
  const P = new Map(players.map(p => [p.c, p]));
  const v = c => playerValue(P.get(c), mode);
  return +((sol.start || []).reduce((s, c) => s + v(c), 0) + (sol.captain ? v(sol.captain) : 0) + (sol.sixth ? v(sol.sixth) : 0) + (sol.bench || []).reduce((s, c) => s + 0.5 * v(c), 0) + coachValue(coaches.find(c => c.t === sol.coach), mode)).toFixed(2);
}
