// Backtest του μοντέλου player props στους αγώνες της σεζόν (EuroLeague): για κάθε αγώνα μόνο με τα προηγούμενα
// δεδομένα του παίκτη. Μετρά log-likelihood και βαθμονόμηση της P(Over) σε γραμμή ≈ πρόβλεψη. node scripts/props-backtest.mjs [--grid]
import fs from 'node:fs';
import { STATS, PARAMS, project, pmf, pOver, teamMinutes } from '../src/odds/props.mjs';
const C = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const players = (C.players || []).filter(p => !String(p.t).includes(';'));
const F = JSON.parse(fs.readFileSync(new URL('../data/fantasy/latest.json', import.meta.url)));
const POS = Object.fromEntries(F.players.map(p => [p.c, p.pos]));
const teamRounds = {}; for (const g of C.league.games.filter(g => g[6])) { (teamRounds[g[2]] ||= []).push(g[0]); (teamRounds[g[3]] ||= []).push(g[0]); }
const TEAM = process.argv.includes('--team');
// λεπτά με γνώση των απουσιών του αγώνα (όπως θα ήταν γνωστές πριν από το τζάμπολ)
const minCache = new Map();
function minutesAt(p, R, P) {
  const k = p.t + '|' + R + '|' + P.share; if (minCache.has(k)) return minCache.get(k)[p.c];
  const prevR = Math.max(0, ...(teamRounds[p.t] || []).filter(r => r < R));
  const team = players.filter(q => q.t === p.t).map(q => ({ c: q.c, pos: POS[q.c] || 'Forward', pl: q.g.filter(r => r[7] > 0 && r[0] < R).sort((a, b) => a[0] - b[0]), now: q.g.some(r => r[7] > 0 && r[0] === R) })).filter(q => q.pl.length);
  const out = new Set(team.filter(q => !q.now).map(q => q.c)), fresh = new Set(team.filter(q => !q.now && q.pl[q.pl.length - 1][0] === prevR).map(q => q.c));
  const M = teamMinutes(team, out, fresh, P).M; minCache.set(k, M); return M[p.c];
}
const prior = {}; for (const s of Object.keys(STATS)) { let x = 0, m = 0; for (const p of players) for (const r of p.g) if (r[7] > 0) { x += STATS[s](r); m += r[7] / 60; } prior[s] = x / m; }
function run(P, stats = Object.keys(STATS)) {
  const res = {};
  for (const s of stats) {
    let ll = 0, n = 0; const bins = Array.from({ length: 10 }, () => [0, 0, 0]);
    for (const p of players) {
      const pl = p.g.filter(r => r[7] > 0).sort((a, b) => a[0] - b[0]);
      for (let i = 3; i < pl.length; i++) {
        const pr = project(pl.slice(0, i), s, { prior: prior[s], P, minutes: TEAM ? minutesAt(p, pl[i][0], P) : null }); if (!pr || pr.min < 10) continue;
        const y = STATS[s](pl[i]); ll += Math.log(Math.max(1e-12, pmf(y, pr.mu, pr.var))); n++;
        // γραμμές γύρω από την πρόβλεψη, όπως θα τις έβαζε ένας bookmaker
        for (const d of [-2, 0, 2]) { const line = Math.max(0.5, Math.floor(pr.mu) + 0.5 + d * Math.sqrt(pr.var) / 2); const q = pOver(pr.mu, pr.var, line); const b = bins[Math.min(9, Math.floor(q * 10))]; b[0] += q; b[1] += y > line ? 1 : 0; b[2]++; }
      }
    }
    res[s] = { n, ll: ll / n, cal: bins.filter(b => b[2] >= 20).map(b => [+(b[0] / b[2]).toFixed(2), +(b[1] / b[2]).toFixed(2), b[2]]) };
  }
  return res;
}
if (process.argv.includes('--grid')) {
  let best = null;
  for (const minHalf of [1.5, 3, 5]) for (const rateHalf of [4, 8, 20]) for (const pri of [10, 40, 80]) for (const minSd of [6, 7, 8, 9]) {
    const P = { ...PARAMS, minHalf, rateHalf, prior: pri, minSd }; const r = run(P, ['pts', 'reb', 'ast', 'pra']);
    const sc = Object.values(r).reduce((s, x) => s + x.ll, 0); if (!best || sc > best.sc) best = { sc, minHalf, rateHalf, pri, minSd };
  }
  console.log('best', best);
  for (const s of Object.keys(STATS)) { let b = null; for (const d of [1, 1.15, 1.3, 1.5, 2, 2.5, 3, 3.5, 4, 5]) { const r = run({ ...PARAMS, disp: { ...PARAMS.disp, [s]: d } }, [s])[s]; if (!b || r.ll > b.ll) b = { d, ll: r.ll }; } console.log('disp', s, b); }
} else {
  const r = run(PARAMS); for (const [s, x] of Object.entries(r)) console.log(s, 'n=' + x.n, 'll=' + x.ll.toFixed(3), JSON.stringify(x.cal));
}
