// Optimizer backtest: για κάθε ιστορική αγωνιστική τρέχει τον ΙΔΙΟ solver με το site (src/fantasy/solver.mjs) με τις
// εκτιμήσεις που υπήρχαν πριν από την αγωνιστική (data/fantasy/perf/pred_<S>.csv.gz) και συγκρίνει τα πραγματικά
// fantasy points της σύνθεσης με: τυχαίες έγκυρες συνθέσεις, την τέλεια και τη χειρότερη σύνθεση (με γνώση των
// αποτελεσμάτων) και τον ίδιο optimizer πάνω σε απλά μοντέλα (baseline).
//   node fantasy/optbt.mjs            # μόνο ό,τι λείπει από το data/fantasy/perf/optimizer.json
//   node fantasy/optbt.mjs --full
// Απλοποιήσεις (γραμμένες και στη σελίδα): ένα turn ανά αγωνιστική (χωρίς αλλαγές μέσα στον γύρο), χωρίς προπονητή,
// εκτιμώμενες τιμές από τον μέσο όρο PIR 10 αγώνων (δεν υπάρχουν ιστορικές επίσημες τιμές), budget 100.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { solve } from '../src/fantasy/solver.mjs';
import { enumerateLineups } from '../src/fantasy/turns.mjs';
import { FORMATIONS, ROSTER } from '../src/fantasy/rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERF = path.join(ROOT, 'data', 'fantasy', 'perf');
export const N_RANDOM = 2000, BUDGET = 100, MAX_TEAM = 6, MODE = 'balanced';

export function parseCSV(txt) {
  const lines = txt.trim().split(/\r?\n/), h = lines[0].split(',');
  return lines.slice(1).map(l => { const v = l.split(','), o = {}; h.forEach((k, i) => { const x = v[i]; o[k] = x === '' || x == null ? null : isNaN(+x) || k === 'c' ? x : +x; }); return o; });
}
// σταθερός ψευδοτυχαίος γεννήτορας (επαναλήψιμα αποτελέσματα)
export function rng(seed) { let s = seed % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

/** πραγματικοί fantasy πόντοι μιας σύνθεσης: πεντάδα + 6ος 100%, πάγκος 50%, αρχηγός ×2 (μπόνους νίκης ήδη στο actual_fp) */
export function lineupPoints(lu, act) {
  const a = c => act.get(c) ?? 0;
  return lu.start.reduce((s, c) => s + a(c), 0) + a(lu.captain) + a(lu.sixth) + 0.5 * lu.bench.reduce((s, c) => s + a(c), 0);
}
export function percentile(x, sample) { if (!sample.length) return null; let lo = 0, eq = 0; for (const y of sample) { if (y < x) lo++; else if (y === x) eq++; } return (lo + 0.5 * eq) / sample.length; }

/** τυχαία έγκυρη σύνθεση: 4G/4F/2C, budget, ≤ 6 ανά ομάδα, τυχαίος σχηματισμός, 6ος και αρχηγός.
 * Οι θέσεις του ρόστερ γεμίζουν με τυχαία σειρά και κάθε παίκτης διαλέγεται ομοιόμορφα ανάμεσα σε όσους χωράνε
 * στο υπόλοιπο budget (αφήνοντας χώρο για τους φθηνότερους στις θέσεις που μένουν), οπότε κάθε δείγμα είναι έγκυρο. */
export function randomLineup(pool, R, tries = 50) {
  const by = { Guard: [], Forward: [], Center: [] };
  for (const p of pool) by[p.pos]?.push(p);
  for (const pos in by) { if (by[pos].length < ROSTER[pos]) return null; by[pos].sort((a, b) => a.price - b.price); }
  const forms = Object.entries(FORMATIONS);
  const shuffle = a => a.map(x => [R(), x]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  for (let t = 0; t < tries; t++) {
    const slots = shuffle(Object.entries(ROSTER).flatMap(([pos, k]) => Array(k).fill(pos)));
    const ro = [], used = new Set(), team = {}; let left = BUDGET, ok = true;
    for (let i = 0; i < slots.length; i++) {
      // ελάχιστο κόστος για τις υπόλοιπες θέσεις
      const need = {}; for (const q of slots.slice(i + 1)) need[q] = (need[q] || 0) + 1;
      let reserve = 0; for (const [q, k] of Object.entries(need)) { let n = 0; for (const p of by[q]) { if (n >= k) break; if (!used.has(p.c)) { reserve += p.price; n++; } } }
      const cand = by[slots[i]].filter(p => !used.has(p.c) && p.price <= left - reserve + 1e-9 && (team[p.team ?? p.t] || 0) < MAX_TEAM);
      if (!cand.length) { ok = false; break; }
      const p = cand[Math.floor(R() * cand.length)];
      ro.push(p); used.add(p.c); left -= p.price; team[p.team ?? p.t] = (team[p.team ?? p.t] || 0) + 1;
    }
    if (!ok) continue;
    const [f, need] = forms[Math.floor(R() * forms.length)];
    const start = [];
    ['Guard', 'Forward', 'Center'].forEach((pos, i) => start.push(...shuffle(ro.filter(p => p.pos === pos)).slice(0, need[i]).map(p => p.c)));
    const rest = shuffle(ro.map(p => p.c).filter(c => !start.includes(c)));
    return { formation: f, start, sixth: rest[0], bench: rest.slice(1), captain: start[Math.floor(R() * start.length)], roster: ro.map(p => p.c), cost: BUDGET - left };
  }
  return null;
}

const asPlayer = (r, m) => ({ c: r.c, pos: r.pos, t: r.team, price: r.price, pp: r[`${m}|pir`], p10: r[`${m}|p10`], p50: r[`${m}|p50`], p90: r[`${m}|p90`], pwin: r.pwin, status: 'playing', gp: r.n_played, start: r.start_rate5, pm: r.m5 });
const actPlayer = (r, sign = 1) => ({ c: r.c, pos: r.pos, t: r.team, price: r.price, pp: sign * r.actual_fp, p10: sign * r.actual_fp, p50: sign * r.actual_fp, p90: sign * r.actual_fp, pwin: 0, status: 'playing', gp: 9 });
const dummyCoaches = rows => [...new Set(rows.map(r => r.team))].map(t => ({ t, price: 0, exp: 0, p10: 0, p50: 0, p90: 0 }));
const asLineup = s => ({ start: s.start, sixth: s.sixth, bench: s.bench, captain: s.captain, roster: s.roster, formation: s.formation });

/** μία αγωνιστική: πραγματικοί πόντοι του optimizer για κάθε μοντέλο + κατανομή τυχαίων + τέλεια/χειρότερη */
export function evalRound(rows, models, { nRandom = N_RANDOM, seed = 1 } = {}) {
  const act = new Map(rows.map(r => [r.c, r.actual_fp]));
  const co = dummyCoaches(rows);
  const best = solve(rows.map(r => actPlayer(r, 1)), co, { budget: BUDGET, maxPerTeam: MAX_TEAM, mode: 'expected', timeLimitMs: 6000 });
  const worst = solve(rows.map(r => actPlayer(r, -1)), co, { budget: BUDGET, maxPerTeam: MAX_TEAM, mode: 'expected', timeLimitMs: 6000 });
  const R = rng(seed), rand = [];
  for (let i = 0; i < nRandom; i++) { const l = randomLineup(rows, R); if (l) rand.push(lineupPoints(l, act)); }
  rand.sort((a, b) => a - b);
  const mean = rand.reduce((s, x) => s + x, 0) / (rand.length || 1);
  const P = new Map(rows.map(r => [r.c, { ...r, status: 'playing' }]));
  const out = { n_players: rows.length, best: best.start ? +lineupPoints(asLineup(best), act).toFixed(1) : null, worst: worst.start ? +lineupPoints(asLineup(worst), act).toFixed(1) : null,
    random: { n: rand.length, mean: +mean.toFixed(1), p10: +(rand[Math.floor(0.1 * rand.length)] ?? 0).toFixed(1), p50: +(rand[Math.floor(0.5 * rand.length)] ?? 0).toFixed(1), p90: +(rand[Math.floor(0.9 * rand.length)] ?? 0).toFixed(1) }, models: {} };
  for (const m of models) {
    const pool = rows.filter(r => r[`${m}|pir`] != null).map(r => asPlayer(r, m));
    const s = solve(pool, co, { budget: BUDGET, maxPerTeam: MAX_TEAM, mode: MODE, timeLimitMs: 6000 });
    if (!s.start) { out.models[m] = { status: s.status }; continue; }
    const lu = asLineup(s), pts = lineupPoints(lu, act);
    // ακρίβεια αρχηγού: ήταν ο καλύτερος βασικός της σύνθεσης;
    const capBest = Math.max(...lu.start.map(c => act.get(c) ?? 0));
    // ακρίβεια τοποθέτησης (πάγκος): οι ίδιοι 10, καλύτερη δυνατή τοποθέτηση με γνώση των αποτελεσμάτων
    let bestArr = -Infinity;
    for (const l of enumerateLineups(lu.roster, P)) { const v = lineupPoints(l, act); if (v > bestArr) bestArr = v; }
    out.models[m] = { points: +pts.toFixed(1), projected: s.objective, pct: +percentile(pts, rand).toFixed(4), rank: 1 + rand.filter(x => x > pts).length,
      above_random: +(pts - mean).toFixed(1), below_best: out.best != null ? +(out.best - pts).toFixed(1) : null,
      captain: lu.captain, captain_pts: +(act.get(lu.captain) ?? 0).toFixed(1), captain_best: (act.get(lu.captain) ?? 0) >= capBest - 1e-9 ? 1 : 0,
      arrangement: +(pts / (bestArr || 1)).toFixed(3), arrangement_opt: pts >= bestArr - 0.05 ? 1 : 0, missed_arrangement: +(bestArr - pts).toFixed(1), status: s.status };
  }
  return out;
}

export function summarize(rounds, models) {
  const out = {};
  for (const m of models) {
    const xs = rounds.map(r => r.models?.[m]).filter(x => x && x.points != null);
    const n = xs.length; if (!n) { out[m] = { n: 0 }; continue; }
    const avg = k => +(xs.reduce((s, x) => s + x[k], 0) / n).toFixed(3);
    const pcts = xs.map(x => x.pct).sort((a, b) => a - b);
    out[m] = { n, hidden: n < 30, avg_pct: avg('pct'), median_pct: +pcts[Math.floor(n / 2)].toFixed(3), top10: +(xs.filter(x => x.pct >= 0.9).length / n).toFixed(3), top25: +(xs.filter(x => x.pct >= 0.75).length / n).toFixed(3),
      avg_rank: +avg('rank').toFixed(1), above_random: +avg('above_random').toFixed(1), below_best: +avg('below_best').toFixed(1), points: +avg('points').toFixed(1),
      captain_acc: avg('captain_best'), arrangement: avg('arrangement'), arrangement_opt: avg('arrangement_opt') };
  }
  return out;
}

async function main() {
  const full = process.argv.includes('--full');
  let prev = { rounds: [] };
  if (!full) { try { prev = JSON.parse(await fs.readFile(path.join(PERF, 'optimizer.json'), 'utf8')); } catch { /* πρώτη φορά */ } }
  const files = (await fs.readdir(PERF).catch(() => [])).filter(f => /^pred_E\d{4}\.csv\.gz$/.test(f)).sort();
  const done = new Map((prev.rounds || []).map(r => [`${r.season}|${r.round}`, r]));
  const rounds = [];
  let allModels = new Set();
  for (const f of files) {
    const rows = parseCSV(zlib.gunzipSync(await fs.readFile(path.join(PERF, f))).toString('utf8'));
    const models = [...new Set(Object.keys(rows[0] || {}).filter(k => k.includes('|')).map(k => k.split('|')[0]))].sort();
    models.forEach(m => allModels.add(m));
    const S = f.slice(5, 10);
    const byR = new Map(); for (const r of rows) { if (!byR.has(r.round)) byR.set(r.round, []); byR.get(r.round).push(r); }
    for (const [rd, rr] of [...byR].sort((a, b) => a[0] - b[0])) {
      const k = `${S}|${rd}`, old = done.get(k);
      if (old && models.every(m => old.models?.[m])) { rounds.push(old); continue; }
      const t0 = Date.now();
      const ev = evalRound(rr, models, { seed: rd * 7919 + +S.slice(1) });
      rounds.push({ season: S, round: rd, ...ev });
      console.log(`[optbt] ${S} r${rd}: ${Object.entries(ev.models).map(([m, x]) => `${m} ${x.points} (p${Math.round(100 * x.pct)})`).join(' · ')} · τέλεια ${ev.best} · τυχαία ${ev.random.mean} · ${Date.now() - t0} ms`);
    }
  }
  const models = [...allModels].sort();
  const bySeason = {};
  for (const S of [...new Set(rounds.map(r => r.season))]) bySeason[S] = summarize(rounds.filter(r => r.season === S), models);
  const res = { generated: new Date().toISOString(), params: { budget: BUDGET, maxPerTeam: MAX_TEAM, mode: MODE, nRandom: N_RANDOM, turns: 1, coach: false }, summary: summarize(rounds, models), bySeason, rounds };
  await fs.mkdir(PERF, { recursive: true });
  await fs.writeFile(path.join(PERF, 'optimizer.json'), JSON.stringify(res));
  console.log(`[optbt] ${rounds.length} αγωνιστικές · ${models.map(m => `${m}: median p${Math.round(100 * (res.summary[m].median_pct || 0))}`).join(' · ')}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
