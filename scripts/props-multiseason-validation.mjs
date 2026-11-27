// Multi-season chronological robustness test for EuroLeague player props.
// Rebuilds player-game rows from the archived PBP individual splits (data/pbp/E*/).
// E2023 is warm-up history; E2024-E2026 are reported as validation seasons.
// Every target uses only player appearances and league rates from strictly earlier dates.
// Current production parameters are frozen. Because some parameters were selected on E2026,
// E2024/E2025 are retrospective stress tests, not fully independent historical OOS tests.
// Run: node scripts/props-multiseason-validation.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATS, PARAMS, project, pmf, pOver } from '../src/odds/props.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PBP_ROOT = path.join(ROOT, 'data', 'pbp');
const VALIDATION_SEASONS = new Set(['E2024', 'E2025', 'E2026']);
const SEASONS = ['E2023', 'E2024', 'E2025', 'E2026'];
const stats = Object.keys(STATS);
const zLevels = [-0.67448975, 0, 0.67448975];
const gameRows = [];
const quality = {};

function sumPeriodStats(periods) {
  const total = new Array(8).fill(0);
  for (const q of periods || []) {
    if (!Array.isArray(q)) continue;
    for (let i = 0; i < 8; i++) total[i] += Number(q[i] || 0);
  }
  return total;
}

for (const season of SEASONS) {
  const dir = path.join(PBP_ROOT, season);
  if (!fs.existsSync(dir)) throw new Error(`Missing PBP season directory: ${season}`);
  const files = fs.readdirSync(dir).filter(f => /^\d+\.json$/.test(f));
  const q = quality[season] = { files: files.length, regularSeasonGames: 0, usableGames: 0, missingSplits: 0, failedChecks: 0, playerRows: 0 };
  for (const file of files) {
    let game;
    try { game = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); }
    catch { continue; }
    if (game.ph !== 'RS') continue;
    q.regularSeasonGames++;
    if (!game.ps || !Array.isArray(game.ids) || !game.pl) { q.missingSplits++; continue; }
    if (game.chk?.ok === false) q.failedChecks++;
    const date = String(game.d || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    let usable = 0;
    for (const team of [game.h, game.a]) {
      for (const entry of game.ps[team] || []) {
        const [playerIndex, periods] = entry;
        const code = game.ids[playerIndex];
        const meta = code ? game.pl[code] : null;
        if (!code || !meta || meta[1] !== team) continue;
        const s = sumPeriodStats(periods);
        const secs = s[0], pts = s[1], reb = s[2], ast = s[3], fg3 = s[4];
        if (!(secs > 0)) continue;
        const opponent = team === game.h ? game.a : game.h;
        const teamPoints = team === game.h ? Number(game.hs || 0) : Number(game.as || 0);
        // Match the data/cache.json row contract consumed by src/odds/props.mjs.
        // PBP stores total rebounds, so put them in the first rebound slot; the sum remains exact.
        const row = [
          0, date, opponent, team === game.h ? 1 : 0, teamPoints,
          0, 0, secs, pts, 0, 0, fg3, 0, 0, 0, reb, 0, ast, 0, 0, 0,
        ];
        gameRows.push({ season, date, code, row });
        usable++;
      }
    }
    if (usable > 0) q.usableGames++;
    q.playerRows += usable;
  }
}

if (!gameRows.length) throw new Error('No usable player-game rows found in archived PBP splits.');

// Use strict date ordering. Games on the same calendar date are treated as simultaneous:
// neither their player history nor their league rates can leak into one another.
const dates = [...new Set(gameRows.map(x => x.date))].sort();
const dateIndex = new Map(dates.map((d, i) => [d, i + 1]));
const byPlayer = new Map();
const byDate = new Map();
for (const x of gameRows) {
  x.row[0] = dateIndex.get(x.date);
  const hist = byPlayer.get(x.code) || [];
  hist.push(x);
  byPlayer.set(x.code, hist);
  const sameDate = byDate.get(x.date) || [];
  sameDate.push(x);
  byDate.set(x.date, sameDate);
}
for (const hist of byPlayer.values()) hist.sort((a, b) => a.date.localeCompare(b.date));

const cumulative = Object.fromEntries(stats.map(s => [s, 0]));
let cumulativeMinutes = 0;
const priorAtDate = new Map();
for (const date of dates) {
  priorAtDate.set(date, Object.fromEntries(stats.map(s => [
    s, cumulativeMinutes > 0 ? cumulative[s] / cumulativeMinutes : 0,
  ])));
  for (const x of byDate.get(date)) {
    const r = x.row;
    if (!(r[7] > 0)) continue;
    for (const stat of stats) cumulative[stat] += STATS[stat](r);
    cumulativeMinutes += r[7] / 60;
  }
}

const makeMetrics = () => ({ n: 0, abs: 0, sq: 0, logLoss: 0, brier: 0, brierN: 0 });
const makePair = () => ({ model: makeMetrics(), league: makeMetrics() });
const pooled = Object.fromEntries(stats.map(s => [s, makePair()]));
const perSeason = Object.fromEntries([...VALIDATION_SEASONS].map(season => [
  season, Object.fromEntries(stats.map(s => [s, makePair()])),
]));
const samples = Object.fromEntries([...VALIDATION_SEASONS].map(s => [s, { playerGames: 0, predictions: 0 }]));

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

for (const target of gameRows) {
  if (!VALIDATION_SEASONS.has(target.season)) continue;
  const history = (byPlayer.get(target.code) || []).filter(x => x.date < target.date).map(x => x.row);
  if (history.length < 3) continue;
  const prior = priorAtDate.get(target.date);
  if (!prior) continue;
  samples[target.season].playerGames++;
  for (const stat of stats) {
    const projection = project(history, stat, { prior: prior[stat], P: PARAMS });
    if (!projection || projection.min < 10) continue;
    const actual = STATS[stat](target.row);
    const leagueMu = Math.max(0.05, prior[stat] * projection.min);
    const leagueVariance = (PARAMS.disp[stat] || 1.5) * leagueMu
      + (prior[stat] * PARAMS.minSd) ** 2;
    record(pooled[stat].model, actual, projection.mu, projection.var);
    record(pooled[stat].league, actual, leagueMu, leagueVariance);
    record(perSeason[target.season][stat].model, actual, projection.mu, projection.var);
    record(perSeason[target.season][stat].league, actual, leagueMu, leagueVariance);
    samples[target.season].predictions++;
  }
}

const format = m => m.n ? {
  n: m.n,
  mae: +(m.abs / m.n).toFixed(3),
  rmse: +Math.sqrt(m.sq / m.n).toFixed(3),
  logLoss: +(m.logLoss / m.n).toFixed(4),
  brier: +(m.brier / Math.max(1, m.brierN)).toFixed(4),
} : { n: 0 };
function summarize(pair) {
  const model = format(pair.model), league = format(pair.league);
  return {
    playerModel: model,
    leagueBaseline: league,
    improvementPct: model.n && league.n ? {
      mae: +((league.mae - model.mae) / league.mae * 100).toFixed(2),
      rmse: +((league.rmse - model.rmse) / league.rmse * 100).toFixed(2),
      logLoss: +((league.logLoss - model.logLoss) / league.logLoss * 100).toFixed(2),
      brier: +((league.brier - model.brier) / league.brier * 100).toFixed(2),
    } : null,
  };
}

const output = {
  validation: 'multi-season-chronological-robustness',
  seasons: SEASONS,
  validationSeasons: [...VALIDATION_SEASONS],
  chronology: {
    firstDate: dates[0], lastDate: dates.at(-1), uniqueDates: dates.length,
    trainingSeason: 'E2023',
    rule: 'Player history and league priors include only dates strictly earlier than the target date. Same-date games are simultaneous.',
  },
  dataQuality: quality,
  samples,
  parameters: {
    minHalf: PARAMS.minHalf, rateHalf: PARAMS.rateHalf, prior: PARAMS.prior,
    minSd: PARAMS.minSd, disp: PARAMS.disp,
  },
  caveat: 'Current production parameters are frozen. Because some were selected using E2026 results, E2024/E2025 are retrospective robustness tests, not fully independent historical out-of-sample tests. This report evaluates synthetic model-centred lines, not bookmaker prices or ROI.',
  pooled: Object.fromEntries(stats.map(s => [s, summarize(pooled[s])])),
  bySeason: Object.fromEntries([...VALIDATION_SEASONS].map(season => [
    season, Object.fromEntries(stats.map(s => [s, summarize(perSeason[season][s])]))
  ])),
};
console.log(JSON.stringify(output, null, 2));
