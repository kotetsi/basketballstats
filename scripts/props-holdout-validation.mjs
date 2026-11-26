// Chronological holdout validation for EuroLeague player props.
// No parameter tuning is performed here. The final 25% of observed rounds are held out;
// each prediction uses only player games and league rates from earlier rounds.
// Compares the current player-specific model with a league-rate-only baseline.
// Run: node scripts/props-holdout-validation.mjs
import fs from 'node:fs';
import { STATS, PARAMS, project, pmf, pOver } from '../src/odds/props.mjs';

const C = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const allPlayers = C.players || [];
const players = allPlayers.filter(p => !String(p.t).includes(';'));
const rounds = [...new Set(players.flatMap(p =>
  (p.g || []).filter(r => r[7] > 0).map(r => Number(r[0]))
))].filter(Number.isFinite).sort((a, b) => a - b);

if (rounds.length < 8) throw new Error(`Need at least 8 observed rounds; found ${rounds.length}`);

const holdoutStart = rounds[Math.floor(rounds.length * 0.75)];
const stats = Object.keys(STATS);
const cumulative = Object.fromEntries(stats.map(s => [s, 0]));
let cumulativeMinutes = 0;
const priorAtRound = new Map();

for (const round of rounds) {
  priorAtRound.set(round, Object.fromEntries(stats.map(s => [
    s, cumulativeMinutes > 0 ? cumulative[s] / cumulativeMinutes : 0,
  ])));
  // League prior includes transferred players too; only individual player projections
  // exclude multi-team season rows, matching the existing backtest convention.
  for (const p of allPlayers) {
    for (const row of p.g || []) {
      if (Number(row[0]) !== round || !(row[7] > 0)) continue;
      for (const stat of stats) cumulative[stat] += STATS[stat](row);
      cumulativeMinutes += row[7] / 60;
    }
  }
}

const makeMetrics = () => ({ n: 0, abs: 0, sq: 0, logLoss: 0, brier: 0, brierN: 0 });
const results = Object.fromEntries(stats.map(s => [s, {
  model: makeMetrics(), league: makeMetrics(),
}]));
const zLevels = [-0.67448975, 0, 0.67448975];

function record(m, y, mu, variance) {
  m.n++;
  m.abs += Math.abs(y - mu);
  m.sq += (y - mu) ** 2;
  m.logLoss -= Math.log(Math.max(1e-12, pmf(y, mu, variance)));
  const sd = Math.sqrt(Math.max(1e-9, variance));
  for (const z of zLevels) {
    const line = Math.max(0.5, Math.floor(mu + z * sd) + 0.5);
    const probability = pOver(mu, variance, line);
    const actual = y > line ? 1 : 0;
    m.brier += (probability - actual) ** 2;
    m.brierN++;
  }
}

for (const p of players) {
  const played = (p.g || []).filter(r => r[7] > 0).sort((a, b) => Number(a[0]) - Number(b[0]));
  for (let i = 3; i < played.length; i++) {
    const target = played[i];
    const round = Number(target[0]);
    if (round < holdoutStart) continue;

    const history = played.slice(0, i);
    const prior = priorAtRound.get(round);
    if (!prior) continue;

    for (const stat of stats) {
      const projection = project(history, stat, { prior: prior[stat], P: PARAMS });
      if (!projection || projection.min < 10) continue;

      const y = STATS[stat](target);
      record(results[stat].model, y, projection.mu, projection.var);

      const leagueMu = Math.max(0.05, prior[stat] * projection.min);
      const leagueVariance = (PARAMS.disp[stat] || 1.5) * leagueMu
        + (prior[stat] * PARAMS.minSd) ** 2;
      record(results[stat].league, y, leagueMu, leagueVariance);
    }
  }
}

const summary = {};
for (const [stat, pair] of Object.entries(results)) {
  const format = m => m.n ? {
    n: m.n,
    mae: +(m.abs / m.n).toFixed(3),
    rmse: +Math.sqrt(m.sq / m.n).toFixed(3),
    logLoss: +(m.logLoss / m.n).toFixed(4),
    brier: +(m.brier / Math.max(1, m.brierN)).toFixed(4),
  } : { n: 0 };
  summary[stat] = { playerModel: format(pair.model), leagueBaseline: format(pair.league) };
}

console.log(JSON.stringify({
  validation: 'chronological-holdout',
  season: C.season || null,
  rounds: { first: rounds[0], last: rounds.at(-1), count: rounds.length, holdoutStart, holdoutCount: rounds.filter(r => r >= holdoutStart).length },
  parameters: { minHalf: PARAMS.minHalf, rateHalf: PARAMS.rateHalf, prior: PARAMS.prior, minSd: PARAMS.minSd, calShift: PARAMS.calShift, xLam: PARAMS.xLam },
  note: 'No tuning on holdout. League baseline uses only the league per-minute rate available before each target round.',
  stats: summary,
}, null, 2));
