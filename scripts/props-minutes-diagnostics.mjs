// Walk-forward comparison of player-minute forecasting baselines.
// Every forecast uses only appearances strictly before the target game.
// Scope: minutes conditional on the player appearing; DNP/injury prediction is not evaluated.
import fs from 'node:fs';
import { roleMinutes } from '../src/odds/role.mjs';

const cache = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const players = (cache.players || []).filter(p => !String(p.t).includes(';'));
const rounds = [...new Set(players.flatMap(p => (p.g || []).filter(r => r[7] > 0).map(r => +r[0])))].sort((a,b) => a-b);
if (rounds.length < 5) throw new Error('Χρειάζονται τουλάχιστον 5 αγωνιστικές.');
const splitAt = Math.max(4, Math.floor(rounds.length * 0.7));
const validation = new Set(rounds.slice(splitAt));
const methods = ['current_ewma_3', 'season_mean', 'last_game', 'last3_mean', 'ewma_1_5', 'ewma_6', 'role_adjusted'];
const observations = [];

const mean = xs => xs.length ? xs.reduce((a,b) => a+b, 0) / xs.length : null;
const ew = (xs, half) => {
  let sum = 0, weight = 0;
  xs.forEach((x, i) => { const w = Math.pow(0.5, (xs.length - 1 - i) / half); sum += w*x; weight += w; });
  return weight ? sum / weight : null;
};
const volatility = xs => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x-m)**2)));
};
for (const p of players) {
  const rows = (p.g || []).filter(r => r[7] > 0).sort((a,b) => +a[0] - +b[0]);
  for (let i = 3; i < rows.length; i++) {
    const target = rows[i], round = +target[0];
    if (!validation.has(round)) continue;
    const history = rows.slice(0, i).filter(r => +r[0] < round);
    if (history.length < 3) continue;
    const mins = history.map(r => r[7] / 60);
    const role = roleMinutes(history, { threshold: 2, blend: 0.75, minGames: 4, halfLife: 3 });
    const pred = {
      current_ewma_3: ew(mins, 3),
      season_mean: mean(mins),
      last_game: mins.at(-1),
      last3_mean: mean(mins.slice(-3)),
      ewma_1_5: ew(mins, 1.5),
      ewma_6: ew(mins, 6),
      role_adjusted: role?.minutes ?? null,
    };
    observations.push({
      round, code: p.c, player: p.n, actual: target[7] / 60,
      historyGames: mins.length, historyVolatility: volatility(mins),
      currentPrediction: pred.current_ewma_3, roleState: role?.state ?? 'insufficient_history',
      predictions: pred,
    });
  }
}
const summarize = (rows, method) => {
  const scored = rows.filter(x => Number.isFinite(x.predictions[method]));
  if (!scored.length) return { n: 0, bias: null, mae: null, rmse: null };
  const errors = scored.map(x => x.actual - x.predictions[method]);
  return {
    n: scored.length,
    bias: +mean(errors).toFixed(3),
    mae: +mean(errors.map(Math.abs)).toFixed(3),
    rmse: +Math.sqrt(mean(errors.map(e => e*e))).toFixed(3),
  };
};
const byMethod = rows => Object.fromEntries(methods.map(m => [m, summarize(rows,m)]));
const currentScored = observations.filter(x => Number.isFinite(x.currentPrediction));
const buckets = {
  under_15: x => x.currentPrediction < 15,
  '15_to_20': x => x.currentPrediction >= 15 && x.currentPrediction < 20,
  '20_to_25': x => x.currentPrediction >= 20 && x.currentPrediction < 25,
  '25_plus': x => x.currentPrediction >= 25,
};
const output = {
  split: { trainRounds: rounds.slice(0,splitAt), validationRounds: rounds.slice(splitAt) },
  method: 'For each validation appearance, predict minutes from prior appearances only. All baselines are scored on the same target games where possible. Role-adjusted requires at least four prior appearances.',
  scope: 'Conditional on appearing (actual minutes > 0). This does not evaluate DNP, injury availability, or pregame lineup uncertainty.',
  note: 'Repeated player observations are correlated. Small early-season samples are diagnostic only; do not retune production parameters from this report alone.',
  overall: byMethod(currentScored),
  roleAdjustedMatchedSample: byMethod(currentScored.filter(x => Number.isFinite(x.predictions.role_adjusted))),
  byRound: Object.fromEntries([...new Set(currentScored.map(x => x.round))].sort((a,b)=>a-b).map(r => [r, byMethod(currentScored.filter(x=>x.round===r))])),
  byCurrentMinuteBucket: Object.fromEntries(Object.entries(buckets).map(([k,test]) => [k, byMethod(currentScored.filter(test))])),
  byPriorVolatility: {
    low_under_3: byMethod(currentScored.filter(x=>x.historyVolatility<3)),
    medium_3_to_6: byMethod(currentScored.filter(x=>x.historyVolatility>=3 && x.historyVolatility<6)),
    high_6_plus: byMethod(currentScored.filter(x=>x.historyVolatility>=6)),
  },
  roleStates: Object.fromEntries(['increasing','stable','decreasing','insufficient_history'].map(state => {
    const rows = currentScored.filter(x=>x.roleState===state);
    return [state,{n:rows.length, current: summarize(rows,'current_ewma_3'), roleAdjusted: summarize(rows,'role_adjusted')}];
  })),
};
console.log(JSON.stringify(output,null,2));
