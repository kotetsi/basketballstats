// Leakage-safe walk-forward evaluation of the xPTS adjustment in EuroLeague player props.
// The final 25% of observed rounds are held out. Player history, player shot history,
// league per-minute priors, and league shot-zone priors are all restricted to games
// completed before each target round. No parameter tuning is performed.
// Run: node scripts/props-xpts-walkforward-validation.mjs
import fs from 'node:fs';
import path from 'node:path';
import { STATS, PARAMS, project, pmf, pOver } from '../src/odds/props.mjs';
import { loadShotIndex, xptsRows } from '../src/odds/xpts.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cache.json'), 'utf8'));
const SEASON = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8')).season;
const SHOTS = path.join(ROOT, 'data/shots');
const allPlayers = C.players || [];
const players = allPlayers.filter(p => !String(p.t).includes(';'));
const stats = Object.keys(STATS);
const rounds = [...new Set(players.flatMap(p => (p.g || [])
  .filter(r => r[7] > 0).map(r => Number(r[0]))))]
  .filter(Number.isFinite).sort((a, b) => a - b);
if (rounds.length < 8) throw new Error('Need at least 8 observed rounds for xPTS holdout validation.');

const holdoutStart = rounds[Math.floor(rounds.length * 0.75)];
const IDX = loadShotIndex(path.join(SHOTS, SEASON), C.league.games || []);
const roundOfGame = new Map((C.league.games || []).map(g => [`${g[2]}|${g[3]}`, Number(g[0])]));

const emptyCounts = () => ({});
function addShots(counts, game) {
  for (const shot of game.s || []) {
    const made = shot[4] ? 1 : 0;
    const three = !!shot[5];
    const zone = shot[8] || null;
    const add = key => {
      const a = counts[key] || (counts[key] = [0, 0]);
      a[0] += made;
      a[1] += 1;
    };
    add(three ? 'three' : 'two');
    if (zone) add(zone);
  }
}
function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    const a = target[key] || (target[key] = [0, 0]);
    a[0] += value[0];
    a[1] += value[1];
  }
}
function rates(counts) {
  return Object.fromEntries(Object.entries(counts)
    .filter(([, a]) => a[1] > 0)
    .map(([key, a]) => [key, a[0] / a[1]]));
}

// Historical seasons are a fixed pre-season prior. Current-season shot data is
// added one round at a time, only after that round has been evaluated.
const historicalCounts = emptyCounts();
for (const dir of fs.existsSync(SHOTS) ? fs.readdirSync(SHOTS).filter(d =>
  d.startsWith('E') && d < SEASON && fs.statSync(path.join(SHOTS, d)).isDirectory()) : []) {
  const base = path.join(SHOTS, dir);
  for (const file of fs.readdirSync(base).filter(f => f.endsWith('.json'))) {
    try { addShots(historicalCounts, JSON.parse(fs.readFileSync(path.join(base, file), 'utf8'))); }
    catch { /* skip malformed historical shot file */ }
  }
}
const currentCountsByRound = new Map();
const currentDir = path.join(SHOTS, SEASON);
for (const file of fs.existsSync(currentDir) ? fs.readdirSync(currentDir).filter(f => f.endsWith('.json')) : []) {
  try {
    const game = JSON.parse(fs.readFileSync(path.join(currentDir, file), 'utf8'));
    const round = roundOfGame.get(`${game.h}|${game.a}`);
    if (!Number.isFinite(round)) continue;
    const bucket = currentCountsByRound.get(round) || emptyCounts();
    addShots(bucket, game);
    currentCountsByRound.set(round, bucket);
  } catch { /* skip malformed current-season shot file */ }
}
const leagueZonePriorAtRound = new Map();
const cumulativeZones = structuredClone(historicalCounts);
for (const round of rounds) {
  leagueZonePriorAtRound.set(round, rates(cumulativeZones));
  mergeCounts(cumulativeZones, currentCountsByRound.get(round) || {});
}

// League per-minute priors also use completed rounds strictly before the target.
const cumulative = Object.fromEntries(stats.map(s => [s, 0]));
let cumulativeMinutes = 0;
const priorAtRound = new Map();
for (const round of rounds) {
  priorAtRound.set(round, Object.fromEntries(stats.map(s => [
    s, cumulativeMinutes > 0 ? cumulative[s] / cumulativeMinutes : 0,
  ])));
  for (const p of allPlayers) for (const row of p.g || []) {
    if (Number(row[0]) !== round || !(row[7] > 0)) continue;
    for (const stat of stats) cumulative[stat] += STATS[stat](row);
    cumulativeMinutes += row[7] / 60;
  }
}

const makeMetrics = () => ({ n: 0, abs: 0, sq: 0, logLoss: 0, brier: 0, brierN: 0 });
const results = Object.fromEntries(stats.map(s => [s, { base: makeMetrics(), xpts: makeMetrics() }]));
let eligiblePlayerGames = 0;
let withHistoricalShots = 0;
let adjustedPlayerGames = 0;
let adjustedHistoryRows = 0;
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
    m.brier += (probability - (y > line ? 1 : 0)) ** 2;
    m.brierN++;
  }
}

for (const p of players) {
  const played = (p.g || []).filter(r => r[7] > 0).sort((a, b) => Number(a[0]) - Number(b[0]));
  for (let i = 3; i < played.length; i++) {
    const target = played[i];
    const round = Number(target[0]);
    if (round < holdoutStart) continue;
    const history = played.slice(0, i).filter(r => Number(r[0]) < round);
    const prior = priorAtRound.get(round);
    const zonePrior = leagueZonePriorAtRound.get(round);
    if (!prior || !zonePrior || history.length < 3) continue;

    eligiblePlayerGames++;
    const xpHistory = xptsRows(history, p.c, IDX, zonePrior, {
      lam: PARAMS.xLam,
      k: PARAMS.xK,
    });
    const hasShots = history.some(r => IDX.has(`${p.c}|${r[0]}`));
    if (hasShots) withHistoricalShots++;
    const changedRows = xpHistory.reduce((n, row, j) =>
      n + ((row[8] !== history[j][8] || row[11] !== history[j][11]) ? 1 : 0), 0);
    if (changedRows > 0) {
      adjustedPlayerGames++;
      adjustedHistoryRows += changedRows;
    }

    for (const stat of stats) {
      const base = project(history, stat, { prior: prior[stat], P: PARAMS });
      const adjusted = project(history, stat, { prior: prior[stat], xrows: xpHistory, P: PARAMS });
      if (!base || !adjusted || base.min < 10 || adjusted.min < 10) continue;
      const y = STATS[stat](target);
      record(results[stat].base, y, base.mu, base.var);
      record(results[stat].xpts, y, adjusted.mu, adjusted.var);
    }
  }
}

const format = m => m.n ? {
  n: m.n,
  mae: +(m.abs / m.n).toFixed(3),
  rmse: +Math.sqrt(m.sq / m.n).toFixed(3),
  logLoss: +(m.logLoss / m.n).toFixed(4),
  brier: +(m.brier / Math.max(1, m.brierN)).toFixed(4),
} : { n: 0 };
const summary = {};
for (const [stat, pair] of Object.entries(results)) {
  const base = format(pair.base), xpts = format(pair.xpts);
  summary[stat] = {
    baseline: base,
    xpts: xpts,
    delta: base.n && xpts.n ? {
      maePct: +((base.mae - xpts.mae) / base.mae * 100).toFixed(2),
      rmsePct: +((base.rmse - xpts.rmse) / base.rmse * 100).toFixed(2),
      logLossPct: +((base.logLoss - xpts.logLoss) / base.logLoss * 100).toFixed(2),
      brierPct: +((base.brier - xpts.brier) / base.brier * 100).toFixed(2),
    } : null,
  };
}
console.log(JSON.stringify({
  validation: 'leakage-safe-xpts-walk-forward-holdout',
  season: SEASON,
  rounds: {
    first: rounds[0], last: rounds.at(-1), count: rounds.length,
    holdoutStart, holdoutCount: rounds.filter(r => r >= holdoutStart).length,
  },
  xpts: { lam: PARAMS.xLam, k: PARAMS.xK, shotIndexPlayerRoundPairs: IDX.size },
  coverage: {
    eligiblePlayerGames,
    withHistoricalShots,
    historicalShotCoveragePct: eligiblePlayerGames ? +(100 * withHistoricalShots / eligiblePlayerGames).toFixed(1) : 0,
    adjustedPlayerGames,
    adjustedHistoryRows,
  },
  methodology: 'Historical-season zone rates plus current-season zone rates from rounds strictly before target. Player xPTS history uses only the player appearances before target. No target-game shots or scores are used. No parameter tuning.',
  stats: summary,
}, null, 2));
