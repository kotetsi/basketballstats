// Chronological probability calibration experiment for EuroLeague player props.
// The calibration fit sees only earlier validation rounds; final rounds remain untouched.
import fs from 'node:fs';
import { STATS, PARAMS, project, pOver } from '../src/odds/props.mjs';
import { fitLogisticCalibration, fitIsotonicCalibration, applyCalibration, scoreProbabilities } from '../src/odds/calibration.mjs';

const cache = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const players = (cache.players || []).filter(p => !String(p.t).includes(';'));
const stats = Object.keys(STATS);
const rounds = [...new Set(players.flatMap(p => (p.g || []).filter(r => r[7] > 0).map(r => +r[0])))].sort((a,b)=>a-b);
if (rounds.length < 10) throw new Error('Calibration requires at least 10 observed rounds.');
const baseSplit = Math.max(5, Math.floor(rounds.length * 0.7));
const validationRounds = rounds.slice(baseSplit);
if (validationRounds.length < 4) throw new Error('Not enough chronological validation rounds.');
const fitCount = Math.max(2, Math.floor(validationRounds.length / 2));
const fitRounds = new Set(validationRounds.slice(0, fitCount));
const testRounds = new Set(validationRounds.slice(fitCount));
if (!testRounds.size) throw new Error('No untouched calibration test rounds.');

const totals = new Map(rounds.map(r => [r, Object.fromEntries(stats.map(s => [s, 0]))]));
const minutes = new Map(rounds.map(r => [r, 0]));
for (const p of players) for (const row of p.g || []) {
  const r = +row[0]; if (!totals.has(r) || !(row[7] > 0)) continue;
  for (const stat of stats) totals.get(r)[stat] += STATS[stat](row);
  minutes.set(r, minutes.get(r) + row[7] / 60);
}
const priors = new Map(), cumulative = Object.fromEntries(stats.map(s => [s, 0]));
let cumulativeMinutes = 0;
for (const r of rounds) {
  priors.set(r, Object.fromEntries(stats.map(s => [s, cumulativeMinutes ? cumulative[s] / cumulativeMinutes : 0])));
  for (const s of stats) cumulative[s] += totals.get(r)[s];
  cumulativeMinutes += minutes.get(r);
}

const offsets = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
const samples = Object.fromEntries(stats.map(s => [s, { fit: [], test: [] }]));
let eligibleGames = 0;
for (const player of players) {
  const history = (player.g || []).filter(r => r[7] > 0).sort((a,b)=>+a[0]-+b[0]);
  for (let i = 3; i < history.length; i++) {
    const target = history[i], round = +target[0];
    if (!fitRounds.has(round) && !testRounds.has(round)) continue;
    const prior = priors.get(round); if (!prior) continue;
    const earlier = history.slice(0, i).filter(r => +r[0] < round);
    if (earlier.length < 3) continue;
    eligibleGames++;
    for (const stat of stats) {
      const pred = project(earlier, stat, { prior: prior[stat], P: PARAMS });
      if (!pred || pred.min < 10) continue;
      const actual = STATS[stat](target);
      const bucket = fitRounds.has(round) ? samples[stat].fit : samples[stat].test;
      for (const z of offsets) {
        const line = Math.max(0.5, Math.floor(pred.mu + z * Math.sqrt(pred.var)) + 0.5);
        bucket.push({ p: pOver(pred.mu, pred.var, line), y: actual > line ? 1 : 0, round });
      }
    }
  }
}
const report = {};
for (const stat of stats) {
  const { fit, test } = samples[stat];
  const logistic = fitLogisticCalibration(fit);
  const isotonic = fitIsotonicCalibration(fit);
  const methods = {
    raw: test,
    logistic: logistic ? test.map(s => ({ ...s, p: applyCalibration(s.p, logistic) })) : [],
    isotonic: isotonic ? test.map(s => ({ ...s, p: applyCalibration(s.p, isotonic) })) : [],
  };
  const reliability = list => Array.from({length:10},(_,i)=>{
    const bin=list.filter(s=>Math.min(9,Math.floor(s.p*10))===i);
    return { range: [i/10,(i+1)/10], n:bin.length,
      predicted:bin.length?+(bin.reduce((a,s)=>a+s.p,0)/bin.length).toFixed(4):null,
      observed:bin.length?+(bin.reduce((a,s)=>a+s.y,0)/bin.length).toFixed(4):null };
  }).filter(b=>b.n>0);
  report[stat] = {
    fitObservations: fit.length, testObservations: test.length,
    raw: scoreProbabilities(methods.raw),
    logistic: logistic ? { parameters: logistic, scores: scoreProbabilities(methods.logistic), reliability: reliability(methods.logistic) } : { skipped: 'insufficient fit sample' },
    isotonic: isotonic ? { knots: isotonic.knots, scores: scoreProbabilities(methods.isotonic), reliability: reliability(methods.isotonic) } : { skipped: 'insufficient fit sample' },
  };
}
console.log(JSON.stringify({
  validation: 'chronological-probability-calibration',
  split: { allRounds: rounds.length, initialModelHistoryRounds: rounds.slice(0,baseSplit), calibrationFitRounds: [...fitRounds], untouchedCalibrationTestRounds: [...testRounds] },
  eligibleGames, offsets, lines: 'synthetic model-centred half-point lines; not bookmaker lines',
  methods: 'Logistic calibration uses ridge-regularized Platt scaling on logit probabilities. Isotonic uses pool-adjacent-violators with sparse-block pooling. Both are fitted only on earlier calibration rounds and evaluated on later untouched rounds.',
  limitations: 'Repeated lines from the same player-game are correlated. Results are calibration diagnostics, not independent observations and not evidence of betting ROI. Production parameters and predictions are unchanged.',
  stats: report,
}, null, 2));
