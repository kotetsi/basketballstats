// Walk-forward residual diagnostics for player props.
// All projections, priors and player-level role summaries use games strictly before the target round.
import fs from 'node:fs';
import { STATS, PARAMS, project } from '../src/odds/props.mjs';

const cache = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const players = (cache.players || []).filter(p => !String(p.t).includes(';'));
const rounds = [...new Set(players.flatMap(p => (p.g || []).filter(r => r[7] > 0).map(r => +r[0])))].sort((a,b) => a-b);
if (rounds.length < 5) throw new Error('Χρειάζονται τουλάχιστον 5 αγωνιστικές.');
const splitAt = Math.max(4, Math.floor(rounds.length * 0.7));
const validation = new Set(rounds.slice(splitAt));
const stats = Object.keys(STATS);
const byStat = Object.fromEntries(stats.map(s => [s, []]));
const byPlayer = new Map();

for (const p of players) {
  const rows = (p.g || []).filter(r => r[7] > 0).sort((a,b) => +a[0] - +b[0]);
  for (let i = 3; i < rows.length; i++) {
    const target = rows[i], round = +target[0];
    if (!validation.has(round)) continue;
    const history = rows.slice(0, i).filter(r => +r[0] < round);
    if (history.length < 3) continue;
    for (const stat of stats) {
      const prediction = project(history, stat, { P: PARAMS });
      if (!prediction || prediction.min < 10) continue;
      const actual = STATS[stat](target);
      const residual = actual - prediction.mu;
      const item = {
        code: p.c, player: p.n, team: p.t, stat, round,
        actual, predicted: prediction.mu, minutes: prediction.min,
        actualMinutes: target[7] / 60, residual,
        absError: Math.abs(residual),
        minuteError: target[7] / 60 - prediction.min,
        historyGames: prediction.n,
      };
      byStat[stat].push(item);
      const key = p.c + ':' + stat;
      if (!byPlayer.has(key)) byPlayer.set(key, { code: p.c, player: p.n, team: p.t, stat, rows: [] });
      byPlayer.get(key).rows.push(item);
    }
  }
}

const summarize = rows => {
  if (!rows.length) return { n: 0, bias: null, mae: null, rmse: null, actualMean: null, predictedMean: null, minuteBias: null, minuteMae: null };
  const mean = xs => xs.reduce((a,b) => a+b, 0) / xs.length;
  return {
    n: rows.length,
    bias: +mean(rows.map(x => x.residual)).toFixed(3),
    mae: +mean(rows.map(x => x.absError)).toFixed(3),
    rmse: +Math.sqrt(mean(rows.map(x => x.residual ** 2))).toFixed(3),
    actualMean: +mean(rows.map(x => x.actual)).toFixed(3),
    predictedMean: +mean(rows.map(x => x.predicted)).toFixed(3),
    minuteBias: +mean(rows.map(x => x.minuteError)).toFixed(3),
    minuteMae: +mean(rows.map(x => Math.abs(x.minuteError))).toFixed(3),
  };
};

const playerRows = [...byPlayer.values()]
  .filter(x => x.rows.length >= 3)
  .map(x => ({ code: x.code, player: x.player, team: x.team, stat: x.stat, ...summarize(x.rows) }))
  .sort((a,b) => Math.abs(b.bias) - Math.abs(a.bias));

const output = {
  split: { trainRounds: rounds.slice(0, splitAt), validationRounds: rounds.slice(splitAt) },
  method: 'One prediction per eligible player-game-stat, using only games and league priors before the target round. Player summaries require at least 3 held-out observations.',
  note: 'Positive bias means the model underpredicted actual production; negative bias means it overpredicted. This is a small early-season diagnostic, not evidence of a betting edge. Player rows are repeated observations and may be correlated.',
  stats: Object.fromEntries(stats.map(stat => [stat, summarize(byStat[stat])])),
  playerDiagnostics: playerRows,
  biggestOverestimates: playerRows.filter(x => x.bias < 0).slice(0, 15),
  biggestUnderestimates: playerRows.filter(x => x.bias > 0).slice(0, 15),
};
console.log(JSON.stringify(output, null, 2));
