// Backtest: όταν λείπει ένας βασικός συμπαίκτης, αλλάζει ο ρυθμός ανά λεπτό ενός παίκτη; (on/off από το play-by-play)
// Για κάθε αγώνα της αγωνιστικής R χρησιμοποιούνται ΜΟΝΟ δεδομένα από αγωνιστικές < R (box scores και splits).
// Απόντες = συμπαίκτες με ≥ MINAVG λεπτά μέσο όρο στους προηγούμενους αγώνες που δεν έπαιξαν στον αγώνα-στόχο
// (στην πράξη γνωστό πριν το τζάμπολ από τις λίστες τραυματιών· εδώ προσέγγιση από το box score).
//   A: με τα πραγματικά λεπτά του παίκτη → μετρά καθαρά τον ρυθμό ανά λεπτό
//   B: με τα λεπτά του μοντέλου (teamMinutes, ίδια ανακατανομή με το site)
// node scripts/props-onoff-backtest.mjs [--season E2026]
import fs from 'node:fs';
import path from 'node:path';
import { STATS, PARAMS, project, pmf, teamMinutes, onoffFactor } from '../src/odds/props.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const SEASON = (process.argv.find(a => a.startsWith('--season=')) || '--season=E2026').split('=')[1];
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cache.json')));
const players = (C.players || []).filter(p => !String(p.t).includes(';'));
const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/fantasy/latest.json')));
const POS = Object.fromEntries(F.players.map(p => [p.c, p.pos]));
const stats = Object.keys(STATS);
const MINAVG = 15;

// ---- splits ανά αγώνα: G[round][code] = { tot:[8], w:{x:[8]} }
const games = [];
for (const f of fs.readdirSync(path.join(ROOT, 'data/pbp', SEASON))) {
  const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pbp', SEASON, f))); if (!G.ps) continue;
  const code = i => String(G.ids[i] || '').replace(/^P/, '');
  const rec = {};
  for (const arr of Object.values(G.ps)) for (const [pi, q, w] of arr) {
    const tot = new Array(8).fill(0); q.forEach(row => row.forEach((v, j) => (tot[j] += v)));
    rec[code(pi)] = { tot, w: Object.fromEntries(w.map(([xi, ...v]) => [code(xi), v])) };
  }
  games.push({ r: +G.r, rec });
}
const rounds = [...new Set(games.map(g => g.r))].sort((a, b) => a - b);
// σωρευτικά splits πριν από κάθε αγωνιστική
const spBefore = new Map(); { const acc = {};
  for (const R of rounds) {
    spBefore.set(R, JSON.parse(JSON.stringify(acc)));
    for (const g of games.filter(x => x.r === R)) for (const [c, o] of Object.entries(g.rec)) {
      const a = (acc[c] ||= { tot: new Array(8).fill(0), w: {} }); o.tot.forEach((v, j) => (a.tot[j] += v));
      for (const [x, v] of Object.entries(o.w)) { const z = (a.w[x] ||= new Array(8).fill(0)); v.forEach((y, j) => (z[j] += y)); }
    }
  } }

// priors λίγκας πριν από κάθε αγωνιστική
const priorBy = new Map(); { const cum = Object.fromEntries(stats.map(s => [s, 0])); let cm = 0;
  const allR = [...new Set(players.flatMap(p => p.g.filter(r => r[7] > 0).map(r => +r[0])))].sort((a, b) => a - b);
  for (const R of allR) {
    priorBy.set(R, Object.fromEntries(stats.map(s => [s, cm ? cum[s] / cm : 0])));
    for (const p of players) for (const r of p.g) if (+r[0] === R && r[7] > 0) { for (const s of stats) cum[s] += STATS[s](r); cm += r[7] / 60; }
  } }

const byTeam = {}; for (const p of players) (byTeam[p.t] ||= []).push(p);
const KS = [0, 60, 120, 240, 480, Infinity];   // ψεύτικα λεπτά shrinkage (∞ = χωρίς προσαρμογή)
const res = Object.fromEntries(['A', 'B'].map(m => [m, Object.fromEntries(stats.map(s => [s, Object.fromEntries(KS.map(k => [k, { ll: 0, ae: 0, n: 0 }]))]))]));
let cases = 0;
for (const [t, team] of Object.entries(byTeam)) {
  const teamRounds = [...new Set(team.flatMap(p => p.g.filter(r => r[7] > 0).map(r => +r[0])))].sort((a, b) => a - b);
  for (const R of teamRounds) {
    if (!spBefore.has(R)) continue;
    const SPB = spBefore.get(R);
    const hist = p => p.g.filter(r => r[7] > 0 && +r[0] < R).sort((a, b) => a[0] - b[0]);
    const plays = p => p.g.some(r => +r[0] === R && r[7] > 0);
    const regular = team.filter(p => { const h = hist(p); return h.length >= 3 && h.reduce((s, r) => s + r[7], 0) / h.length / 60 >= MINAVG; });
    const FRESH = process.argv.includes("--fresh"), prevT = Math.max(0, ...teamRounds.filter(r => r < R));
    const absent = regular.filter(p => !plays(p) && (!FRESH || hist(p).some(r => +r[0] === prevT))).map(p => p.c);
    if (!absent.length) continue;
    // λεπτά μοντέλου (B)
    const prevR = Math.max(0, ...teamRounds.filter(r => r < R));
    const tm = team.map(p => ({ c: p.c, pos: POS[p.c] || 'Forward', pl: hist(p) }));
    const out = new Set(team.filter(p => !plays(p)).map(p => p.c)), fresh = new Set(tm.filter(p => out.has(p.c) && p.pl.length && +p.pl[p.pl.length - 1][0] === prevR).map(p => p.c));
    const M = teamMinutes(tm, out, fresh).M;
    for (const p of team) {
      const row = p.g.find(r => +r[0] === R && r[7] > 0); if (!row) continue;
      const h = hist(p); if (h.length < 3) continue;
      cases++;
      for (const s of stats) {
        for (const [mode, minutes] of [['A', row[7] / 60], ['B', M[p.c]]]) {
          if (!(minutes > 5)) continue;
          const pr = project(h, s, { prior: priorBy.get(R)[s], minutes }); if (!pr) continue;
          const y = STATS[s](row);
          for (const K of KS) {
            const f = K === Infinity ? 1 : onoffFactor(SPB[p.c], absent, s, K);
            const mu = pr.mu * f, v = (PARAMS.disp[s] || 1.5) * mu + (pr.rate * f * PARAMS.minSd) ** 2;
            const o = res[mode][s][K]; o.ll += Math.log(Math.max(1e-12, pmf(y, mu, v))); o.ae += Math.abs(y - mu); o.n++;
          }
        }
      }
    }
  }
}
console.log(`${SEASON}: ${cases} εμφανίσεις παικτών σε αγώνες με απόντα βασικό συμπαίκτη (≥${MINAVG}' μ.ό.)`);
for (const mode of ['A', 'B']) {
  console.log(`\n${mode === 'A' ? 'A: πραγματικά λεπτά (μόνο ρυθμός)' : 'B: λεπτά μοντέλου'} — Δlog-lik ανά παρατήρηση ×1000 (θετικό = καλύτερο) / MAE`);
  console.log('stat  ' + KS.map(k => String(k === Infinity ? 'off' : 'K=' + k).padStart(14)).join(''));
  for (const s of stats) {
    const base = res[mode][s][Infinity];
    console.log(s.padEnd(6) + KS.map(k => { const o = res[mode][s][k]; return `${((o.ll - base.ll) / o.n * 1000).toFixed(2).padStart(7)}/${(o.ae / o.n).toFixed(3)}`.padStart(14); }).join('') + `  n=${base.n}`);
  }
}
