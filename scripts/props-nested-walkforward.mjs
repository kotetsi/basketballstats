// Nested, season-aware walk-forward validation for EuroLeague player props.
// Hyperparameters are selected only on seasons strictly earlier than each outer test season.
// E2026 is the primary untouched final holdout. Offline/read-only; never changes production params.
// Run: node scripts/props-nested-walkforward.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATS, PARAMS, project, pmf, pOver } from '../src/odds/props.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PBP_ROOT = path.join(ROOT, 'data', 'pbp');
const SEASONS = ['E2023', 'E2024', 'E2025', 'E2026'];
const OUTER_SEASONS = ['E2025', 'E2026'];
const PRIMARY_HOLDOUT = 'E2026';
const STAT_KEYS = Object.keys(STATS);
const Z_LEVELS = [-0.67448975, 0, 0.67448975];
const GRID = [];
for (const minHalf of [2, 3, 5]) {
  for (const rateHalf of [4, 8, 12]) {
    for (const prior of [20, 40, 80]) {
      for (const minSd of [6, 8]) GRID.push({ minHalf, rateHalf, prior, minSd });
    }
  }
}

function sumPeriodStats(periods) {
  const total = new Array(8).fill(0);
  for (const q of periods || []) {
    if (!Array.isArray(q)) continue;
    for (let i = 0; i < 8; i++) total[i] += Number(q[i] || 0);
  }
  return total;
}

const rows = [];
const quality = {};
for (const season of SEASONS) {
  const dir = path.join(PBP_ROOT, season);
  if (!fs.existsSync(dir)) throw new Error(`Missing PBP season directory: ${season}`);
  const files = fs.readdirSync(dir).filter(f => /^\d+\.json$/.test(f));
  const q = quality[season] = { files: files.length, regularSeasonGames: 0, usableGames: 0, missingSplits: 0, failedIntegrity: 0, playerRows: 0 };
  for (const file of files) {
    let game;
    try { game = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch { continue; }
    if (game.ph !== 'RS') continue;
    q.regularSeasonGames++;
    if (!game.ps || !Array.isArray(game.ids) || !game.pl) { q.missingSplits++; continue; }
    if (game.chk?.ok === false) { q.failedIntegrity++; continue; }
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
        const secs = s[0];
        if (!(secs > 0)) continue;
        const opponent = team === game.h ? game.a : game.h;
        const teamPoints = team === game.h ? Number(game.hs || 0) : Number(game.as || 0);
        const row = [0, date, opponent, team === game.h ? 1 : 0, teamPoints,
          0, 0, secs, s[1], 0, 0, s[4], 0, 0, 0, s[2], 0, s[3], 0, 0, 0];
        rows.push({ season, date, code, row });
        usable++;
      }
    }
    if (usable) q.usableGames++;
    q.playerRows += usable;
  }
}
if (!rows.length) throw new Error('No usable player-game rows found in archived PBP splits.');

const dates = [...new Set(rows.map(x => x.date))].sort();
const dateIndex = new Map(dates.map((d, i) => [d, i + 1]));
const byPlayer = new Map();
const byDate = new Map();
const bySeason = new Map();
for (const x of rows) {
  x.row[0] = dateIndex.get(x.date);
  const ph = byPlayer.get(x.code) || [];
  ph.push(x);
  byPlayer.set(x.code, ph);
  const dh = byDate.get(x.date) || [];
  dh.push(x);
  byDate.set(x.date, dh);
  const sh = bySeason.get(x.season) || [];
  sh.push(x);
  bySeason.set(x.season, sh);
}
for (const history of byPlayer.values()) history.sort((a, b) => a.date.localeCompare(b.date));

const leaguePriorAtDate = new Map();
const cumulative = Object.fromEntries(STAT_KEYS.map(s => [s, 0]));
let cumulativeMinutes = 0;
for (const date of dates) {
  leaguePriorAtDate.set(date, Object.fromEntries(STAT_KEYS.map(s => [
    s, cumulativeMinutes ? cumulative[s] / cumulativeMinutes : 0,
  ])));
  // Same-date games are simultaneous: none can influence another game's prior.
  for (const x of byDate.get(date)) {
    if (!(x.row[7] > 0)) continue;
    for (const stat of STAT_KEYS) cumulative[stat] += STATS[stat](x.row);
    cumulativeMinutes += x.row[7] / 60;
  }
}

function metricBucket() {
  return { n: 0, abs: 0, sq: 0, logLoss: 0, brier: 0, brierN: 0 };
}
function record(m, y, mu, variance) {
  m.n++;
  m.abs += Math.abs(y - mu);
  m.sq += (y - mu) ** 2;
  m.logLoss -= Math.log(Math.max(1e-12, pmf(y, mu, variance)));
  const sd = Math.sqrt(Math.max(1e-9, variance));
  for (const z of Z_LEVELS) {
    const line = Math.max(0.5, Math.floor(mu + z * sd) + 0.5);
    const probability = pOver(mu, variance, line);
    m.brier += (probability - (y > line ? 1 : 0)) ** 2;
    m.brierN++;
  }
}
function summarize(m) {
  return m.n ? {
    n: m.n, mae: +(m.abs / m.n).toFixed(4),
    rmse: +Math.sqrt(m.sq / m.n).toFixed(4),
    logLoss: +(m.logLoss / m.n).toFixed(5),
    brier: +(m.brier / Math.max(1, m.brierN)).toFixed(5),
  } : { n: 0 };
}
function evaluate(targetRows, P) {
  const metrics = Object.fromEntries(STAT_KEYS.map(s => [s, { model: metricBucket(), baseline: metricBucket() }]));
  let eligiblePlayerGames = 0;
  for (const target of targetRows) {
    const history = (byPlayer.get(target.code) || [])
      .filter(x => x.date < target.date).map(x => x.row);
    if (history.length < 3) continue;
    const prior = leaguePriorAtDate.get(target.date);
    if (!prior) continue;
    eligiblePlayerGames++;
    for (const stat of STAT_KEYS) {
      const pred = project(history, stat, { prior: prior[stat], P });
      if (!pred || pred.min < 10) continue;
      const actual = STATS[stat](target.row);
      const leagueMu = Math.max(0.05, prior[stat] * pred.min);
      const leagueVariance = (P.disp[stat] || 1.5) * leagueMu + (prior[stat] * P.minSd) ** 2;
      record(metrics[stat].model, actual, pred.mu, pred.var);
      record(metrics[stat].baseline, actual, leagueMu, leagueVariance);
    }
  }
  return {
    eligiblePlayerGames,
    stats: Object.fromEntries(STAT_KEYS.map(s => [s, {
      playerModel: summarize(metrics[s].model),
      leagueBaseline: summarize(metrics[s].baseline),
    }])),
  };
}

// Inner folds: (1) a chronological split inside E2023; (2) each later prior season
// evaluated using only all strictly earlier dates. No outer test-season row is visible here.
function innerFoldsBefore(outerSeason) {
  const priorSeasons = SEASONS.filter(s => s < outerSeason);
  const folds = [];
  const warmup = bySeason.get('E2023') || [];
  const warmupDates = [...new Set(warmup.map(x => x.date))].sort();
  if (warmupDates.length >= 8) {
    const cut = warmupDates[Math.floor(warmupDates.length * 0.6)];
    folds.push({ name: 'E2023-internal', targets: warmup.filter(x => x.date >= cut) });
  }
  for (const season of priorSeasons.filter(s => s !== 'E2023')) {
    folds.push({ name: season, targets: bySeason.get(season) || [] });
  }
  return folds.filter(f => f.targets.length);
}

function tune(outerSeason) {
  const folds = innerFoldsBefore(outerSeason);
  if (!folds.length) throw new Error(`No inner validation folds available before ${outerSeason}`);
  const ranked = GRID.map(candidate => {
    const P = { ...PARAMS, ...candidate };
    const foldResults = folds.map(fold => ({ name: fold.name, result: evaluate(fold.targets, P) }));
    const byStat = Object.fromEntries(STAT_KEYS.map(stat => {
      const parts = foldResults.map(f => f.result.stats[stat].playerModel).filter(x => x.n);
      const n = parts.reduce((a, x) => a + x.n, 0);
      const logLoss = n ? parts.reduce((a, x) => a + x.logLoss * x.n, 0) / n : Infinity;
      const brierN = parts.reduce((a, x) => a + x.n * 3, 0);
      const brier = brierN ? parts.reduce((a, x) => a + x.brier * x.n * 3, 0) / brierN : Infinity;
      return [stat, { n, logLoss, brier }];
    }));
    const valid = Object.values(byStat).filter(x => Number.isFinite(x.logLoss));
    const objective = valid.length ? valid.reduce((a, x) => a + x.logLoss, 0) / valid.length : Infinity;
    const brier = valid.length ? valid.reduce((a, x) => a + x.brier, 0) / valid.length : Infinity;
    return { params: candidate, objective, brier, byStat, foldNames: folds.map(f => f.name) };
  }).sort((a, b) => a.objective - b.objective || a.brier - b.brier);
  if (!Number.isFinite(ranked[0]?.objective)) throw new Error(`All parameter candidates failed for ${outerSeason}`);
  return { selected: ranked[0], topCandidates: ranked.slice(0, 5), foldNames: folds.map(f => f.name), candidateCount: GRID.length };
}

const outer = {};
for (const season of OUTER_SEASONS) {
  const selection = tune(season);
  const selectedParams = { ...PARAMS, ...selection.selected.params };
  const result = evaluate(bySeason.get(season) || [], selectedParams);
  outer[season] = {
    tuning: {
      selectedParameters: selection.selected.params,
      innerFolds: selection.foldNames,
      candidateCount: selection.candidateCount,
      selectionObjective: 'mean per-market negative-binomial predictive log loss; Brier is tie-breaker',
      topCandidates: selection.topCandidates.map(x => ({ params: x.params, logLoss: +x.objective.toFixed(6), brier: +x.brier.toFixed(6) })),
    },
    untouchedEvaluation: result,
  };
}

console.log(JSON.stringify({
  validation: 'nested-seasonal-walk-forward',
  seasons: SEASONS,
  outerTestSeasons: OUTER_SEASONS,
  primaryUntouchedHoldout: PRIMARY_HOLDOUT,
  parameterSearch: {
    candidateCount: GRID.length,
    tuned: ['minHalf', 'rateHalf', 'prior', 'minSd'],
    frozen: ['disp', 'calShift', 'blend', 'share', 'ctxPow', 'xLam', 'xK'],
    grid: GRID,
  },
  methodology: {
    inner: 'For each outer season, candidates are ranked only on earlier seasons: an internal chronological E2023 fold plus each available later prior season. E2025/E2026 target rows are excluded from their own parameter selection.',
    outer: 'Each outer test season is evaluated once with its independently selected parameters. E2026 is the final primary holdout; no result from E2026 is used for tuning.',
    leakage: 'Player histories and league priors include games strictly earlier than the target calendar date. Same-date games are simultaneous. Target-game outcomes are never included in prediction inputs.',
    objective: 'Mean per-market predictive log loss across inner folds; mean Brier score breaks ties. MAE/RMSE are reported but are not the tuning objective.',
    production: 'Read-only research report. No production parameters, prediction paths, odds, deployment, or betting workflows are modified.',
  },
  dataQuality: quality,
  outer,
}, null, 2));
