// Compare the walk-forward prop model with simple historical baselines.
// All inputs for a target round are restricted to games from earlier rounds.
// Run: node scripts/props-baseline-compare.mjs
import fs from 'node:fs';
import { STATS, PARAMS, project } from '../src/odds/props.mjs';

const C = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const players = (C.players || []).filter(p => !String(p.t).includes(';'));
const rounds = [...new Set(players.flatMap(p => (p.g || []).filter(r => r[7] > 0).map(r => +r[0])))].sort((a,b)=>a-b);
if (rounds.length < 5) throw new Error('Χρειάζονται τουλάχιστον 5 αγωνιστικές.');
const splitAt = Math.max(4, Math.floor(rounds.length * 0.7));
const validation = new Set(rounds.slice(splitAt));
const stats = Object.keys(STATS);

// League priors are cumulative and strictly pre-target-round.
const totals = new Map(rounds.map(r => [r, Object.fromEntries(stats.map(s => [s, 0]))]));
const mins = new Map(rounds.map(r => [r, 0]));
for (const p of players) for (const row of p.g || []) {
  if (!(row[7] > 0)) continue;
  const r = +row[0], t = totals.get(r);
  if (!t) continue;
  for (const s of stats) t[s] += STATS[s](row);
  mins.set(r, mins.get(r) + row[7] / 60);
}
const priorAt = new Map(), cumulative = Object.fromEntries(stats.map(s => [s, 0]));
let cumulativeMinutes = 0;
for (const r of rounds) {
  priorAt.set(r, Object.fromEntries(stats.map(s => [s, cumulativeMinutes ? cumulative[s] / cumulativeMinutes : 0])));
  for (const s of stats) cumulative[s] += totals.get(r)[s];
  cumulativeMinutes += mins.get(r);
}

const methods = ['model', 'seasonMean', 'last5Mean'];
const metrics = Object.fromEntries(stats.map(s => [s, Object.fromEntries(methods.map(m => [m, { n: 0, abs: 0, sq: 0 }]))]));
for (const p of players) {
  const rows = (p.g || []).filter(r => r[7] > 0).sort((a,b) => +a[0] - +b[0]);
  for (let i = 3; i < rows.length; i++) {
    const target = rows[i], round = +target[0];
    if (!validation.has(round)) continue;
    const history = rows.slice(0, i).filter(r => +r[0] < round);
    if (history.length < 3) continue;
    for (const s of stats) {
      const actual = STATS[s](target);
      const model = project(history, s, { prior: priorAt.get(round)[s], P: PARAMS });
      if (!model || model.min < 10) continue;
      const predictions = {
        model: model.mu,
        seasonMean: history.reduce((sum, r) => sum + STATS[s](r), 0) / history.length,
        last5Mean: history.slice(-5).reduce((sum, r) => sum + STATS[s](r), 0) / Math.min(5, history.length),
      };
      for (const method of methods) {
        const x = metrics[s][method], error = actual - predictions[method];
        x.n++; x.abs += Math.abs(error); x.sq += error * error;
      }
    }
  }
}

const output = {
  split: { trainRounds: rounds.slice(0, splitAt), validationRounds: rounds.slice(splitAt) },
  note: 'Same player-game sample for all methods. MAE/RMSE compare point forecasts only; this is not betting ROI and does not include injury redistribution or game-context adjustments.',
  stats: {}
};
for (const s of stats) {
  output.stats[s] = {};
  for (const method of methods) {
    const x = metrics[s][method];
    output.stats[s][method] = { n: x.n, mae: x.n ? +(x.abs / x.n).toFixed(3) : null, rmse: x.n ? +Math.sqrt(x.sq / x.n).toFixed(3) : null };
  }
  const m = metrics[s].model;
  for (const baseline of ['seasonMean', 'last5Mean']) {
    const b = metrics[s][baseline];
    output.stats[s][baseline + 'ImprovementPct'] = m.n && b.n === m.n ? +((b.abs - m.abs) / b.abs * 100).toFixed(2) : null;
  }
}
console.log(JSON.stringify(output, null, 2));
