// Nested chronological probability calibration for EuroLeague player props.
// Per-market method selection uses expanding inner folds; the final rounds are never used for selection.
// Offline/read-only: this script does not change production predictions or parameters.
import fs from 'node:fs';
import { STATS, PARAMS, project, pOver } from '../src/odds/props.mjs';
import { fitLogisticCalibration, fitIsotonicCalibration, applyCalibration, scoreProbabilities } from '../src/odds/calibration.mjs';

const cache = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const players = (cache.players || []).filter(p => !String(p.t).includes(';'));
const stats = Object.keys(STATS);
const rounds = [...new Set(players.flatMap(p => (p.g || []).filter(r => r[7] > 0).map(r => +r[0])))].sort((a, b) => a - b);
if (rounds.length < 12) throw new Error('Nested calibration requires at least 12 observed rounds.');

const baseSplit = Math.max(5, Math.floor(rounds.length * 0.6));
const validationRounds = rounds.slice(baseSplit);
// Reserve two rounds as the final untouched holdout. Earlier validation rounds are used
// for expanding inner-fold method selection and the final calibration fit.
const finalHoldoutRounds = validationRounds.slice(-2);
const developmentRounds = validationRounds.slice(0, -2);
const MIN_FIT_ROUNDS = 2;
const selectionRounds = developmentRounds.slice(MIN_FIT_ROUNDS);
if (selectionRounds.length < 2 || finalHoldoutRounds.length !== 2) {
  throw new Error('Need at least two inner selection folds and two untouched final holdout rounds.');
}

const totals = new Map(rounds.map(r => [r, Object.fromEntries(stats.map(s => [s, 0]))]));
const minutes = new Map(rounds.map(r => [r, 0]));
for (const p of players) for (const row of p.g || []) {
  const r = +row[0];
  if (!totals.has(r) || !(row[7] > 0)) continue;
  for (const stat of stats) totals.get(r)[stat] += STATS[stat](row);
  minutes.set(r, minutes.get(r) + row[7] / 60);
}
const priors = new Map();
const cumulative = Object.fromEntries(stats.map(s => [s, 0]));
let cumulativeMinutes = 0;
for (const r of rounds) {
  priors.set(r, Object.fromEntries(stats.map(s => [s, cumulativeMinutes ? cumulative[s] / cumulativeMinutes : 0])));
  for (const stat of stats) cumulative[stat] += totals.get(r)[stat];
  cumulativeMinutes += minutes.get(r);
}

const offsets = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
const samples = Object.fromEntries(stats.map(stat => [stat, new Map(validationRounds.map(r => [r, []]))]));
let eligibleGames = 0;
for (const player of players) {
  const history = (player.g || []).filter(r => r[7] > 0).sort((a, b) => +a[0] - +b[0]);
  for (let i = 3; i < history.length; i++) {
    const target = history[i], round = +target[0];
    if (!samples[stats[0]].has(round)) continue;
    const prior = priors.get(round);
    if (!prior) continue;
    const earlier = history.slice(0, i).filter(r => +r[0] < round);
    if (earlier.length < 3) continue;
    eligibleGames++;
    for (const stat of stats) {
      const pred = project(earlier, stat, { prior: prior[stat], P: PARAMS });
      if (!pred || pred.min < 10) continue;
      const actual = STATS[stat](target);
      for (const z of offsets) {
        const line = Math.max(0.5, Math.floor(pred.mu + z * Math.sqrt(pred.var)) + 0.5);
        samples[stat].get(round).push({ p: pOver(pred.mu, pred.var, line), y: actual > line ? 1 : 0, round });
      }
    }
  }
}

const METHODS = ['raw', 'logistic', 'isotonic'];
function fitMethod(method, training) {
  if (method === 'raw') return { method: 'raw' };
  if (method === 'logistic') return fitLogisticCalibration(training);
  return fitIsotonicCalibration(training);
}
function applyMethod(sampleList, model) {
  if (model.method === 'raw') return sampleList;
  return sampleList.map(s => ({ ...s, p: applyCalibration(s.p, model) }));
}
function reliability(list) {
  return Array.from({ length: 10 }, (_, i) => {
    const bin = list.filter(s => Math.min(9, Math.floor(s.p * 10)) === i);
    return {
      range: [i / 10, (i + 1) / 10], n: bin.length,
      predicted: bin.length ? +(bin.reduce((a, s) => a + s.p, 0) / bin.length).toFixed(4) : null,
      observed: bin.length ? +(bin.reduce((a, s) => a + s.y, 0) / bin.length).toFixed(4) : null,
    };
  }).filter(b => b.n > 0);
}
function aggregateRoundScores(rows) {
  const out = {};
  for (const method of METHODS) {
    const valid = rows.map(x => x[method]).filter(Boolean);
    out[method] = {
      folds: valid.length,
      meanLogLoss: valid.length ? +(valid.reduce((a, x) => a + x.logLoss, 0) / valid.length).toFixed(6) : null,
      meanBrier: valid.length ? +(valid.reduce((a, x) => a + x.brier, 0) / valid.length).toFixed(6) : null,
    };
  }
  return out;
}

const report = {};
for (const stat of stats) {
  const roundSamples = samples[stat];
  const innerResults = [];
  for (const round of selectionRounds) {
    const trainingRounds = developmentRounds.filter(r => r < round);
    const training = trainingRounds.flatMap(r => roundSamples.get(r));
    const validation = roundSamples.get(round);
    const result = {};
    for (const method of METHODS) {
      const model = fitMethod(method, training);
      if (!model) { result[method] = null; continue; }
      result[method] = scoreProbabilities(applyMethod(validation, model));
    }
    innerResults.push({ validationRound: round, trainingRounds, observations: validation.length, scores: result });
  }

  const selectionScores = aggregateRoundScores(innerResults.map(x => x.scores));
  const selectable = METHODS.filter(method => selectionScores[method].folds === selectionRounds.length &&
    Number.isFinite(selectionScores[method].meanLogLoss));
  selectable.sort((a, b) =>
    selectionScores[a].meanLogLoss - selectionScores[b].meanLogLoss ||
    selectionScores[a].meanBrier - selectionScores[b].meanBrier ||
    METHODS.indexOf(a) - METHODS.indexOf(b));
  const selectedMethod = selectable[0] || 'raw';

  const finalTrainingRounds = developmentRounds;
  const finalTraining = finalTrainingRounds.flatMap(r => roundSamples.get(r));
  const finalModel = fitMethod(selectedMethod, finalTraining);
  const effectiveMethod = finalModel ? selectedMethod : 'raw';
  const holdout = finalHoldoutRounds.flatMap(r => roundSamples.get(r));
  const rawHoldout = holdout;
  const finalScores = {};
  for (const method of METHODS) {
    const model = fitMethod(method, finalTraining);
    finalScores[method] = model ? scoreProbabilities(applyMethod(holdout, model)) : null;
  }
  const selectedHoldout = applyMethod(holdout, finalModel || { method: 'raw' });

  report[stat] = {
    fitObservations: finalTraining.length,
    innerSelection: {
      rounds: selectionRounds,
      foldCount: innerResults.length,
      foldResults: innerResults,
      meanScoresByMethod: selectionScores,
      selectedMethod,
      selectionMetric: 'equal-weight mean per-round log loss; mean Brier is tie-breaker',
    },
    finalHoldout: {
      rounds: finalHoldoutRounds,
      observations: holdout.length,
      selectedMethod: effectiveMethod,
      selectedScores: scoreProbabilities(selectedHoldout),
      rawScores: scoreProbabilities(rawHoldout),
      diagnosticScoresByMethod: finalScores,
      selectedReliability: reliability(selectedHoldout),
    },
  };
}

console.log(JSON.stringify({
  validation: 'nested-chronological-probability-calibration',
  split: {
    allRounds: rounds.length,
    initialModelHistoryRounds: rounds.slice(0, baseSplit),
    calibrationDevelopmentRounds: developmentRounds,
    innerSelectionRounds: selectionRounds,
    untouchedFinalHoldoutRounds: finalHoldoutRounds,
  },
  eligibleGames,
  offsets,
  lines: 'synthetic model-centred half-point lines; not bookmaker lines',
  methodology: 'For each market, Logistic and Isotonic are fitted only on earlier development rounds and scored on each later inner fold. The method with the lowest equal-weight mean inner-fold log loss is selected (Brier breaks ties), then refitted on all development rounds and evaluated on the final two untouched rounds. Raw is always an eligible candidate.',
  limitations: 'The number of inner folds is limited by the current season sample. Repeated lines from one player-game are correlated. These are calibration diagnostics, not independent observations or evidence of betting ROI. Final-holdout diagnostic scores do not influence method selection. Production parameters and predictions are unchanged.',
  stats: report,
}, null, 2));
