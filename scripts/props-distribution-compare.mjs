// Compare predictive distributions against a simple player-history baseline.
// Walk-forward only: target-round outcomes are never used in the input features.
// Run: node scripts/props-distribution-compare.mjs
import fs from 'node:fs';
import { STATS, PARAMS, project, pmf, pOver } from '../src/odds/props.mjs';

const C = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const players = (C.players || []).filter(p => !String(p.t).includes(';'));
const rounds = [...new Set(players.flatMap(p => (p.g || []).filter(r => r[7] > 0).map(r => +r[0])))].sort((a,b)=>a-b);
if (rounds.length < 5) throw new Error('Χρειάζονται τουλάχιστον 5 αγωνιστικές.');
const splitAt = Math.max(4, Math.floor(rounds.length * 0.7));
const validation = new Set(rounds.slice(splitAt));
const stats = Object.keys(STATS);
const makeMetric = () => ({ n:0, logLoss:0, rps:0, brier:0, bins:Array.from({length:10},()=>({p:0,y:0,n:0})) });
const metrics = Object.fromEntries(stats.map(s=>[s,{model:makeMetric(),seasonBaseline:makeMetric()}]));

// Strictly pre-target-round league priors.
const totals = new Map(rounds.map(r=>[r,Object.fromEntries(stats.map(s=>[s,0]))]));
const minutes = new Map(rounds.map(r=>[r,0]));
for (const p of players) for (const row of p.g || []) {
  if (!(row[7] > 0)) continue;
  const r=+row[0]; if (!totals.has(r)) continue;
  for (const s of stats) totals.get(r)[s] += STATS[s](row);
  minutes.set(r,minutes.get(r)+row[7]/60);
}
const priorAt = new Map(), cumulative = Object.fromEntries(stats.map(s=>[s,0]));
let cumulativeMinutes=0;
for (const r of rounds) {
  priorAt.set(r,Object.fromEntries(stats.map(s=>[s,cumulativeMinutes?cumulative[s]/cumulativeMinutes:0])));
  for (const s of stats) cumulative[s]+=totals.get(r)[s];
  cumulativeMinutes+=minutes.get(r);
}
function addScore(metric, actual, mu, variance, commonLine) {
  metric.n++;
  metric.logLoss -= Math.log(Math.max(1e-12,pmf(actual,mu,variance)));
  let cumulative=0;
  // Ranked Probability Score for a discrete count distribution, summed over 0..100.
  for(let k=0;k<=100;k++) {
    cumulative += pmf(k,mu,variance);
    metric.rps += (cumulative-(actual<=k?1:0))**2;
  }
  const probability=pOver(mu,variance,commonLine), observed=actual>commonLine?1:0;
  metric.brier += (probability-observed)**2;
  const bin=metric.bins[Math.min(9,Math.floor(probability*10))];
  bin.p+=probability; bin.y+=observed; bin.n++;
}
for (const p of players) {
  const rows=(p.g||[]).filter(r=>r[7]>0).sort((a,b)=>+a[0]-+b[0]);
  for(let i=3;i<rows.length;i++) {
    const target=rows[i], round=+target[0];
    if(!validation.has(round)) continue;
    const history=rows.slice(0,i).filter(r=>+r[0]<round);
    if(history.length<3) continue;
    for(const stat of stats) {
      const actual=STATS[stat](target);
      const model=project(history,stat,{prior:priorAt.get(round)[stat],P:PARAMS});
      if(!model || model.min<10) continue;
      const values=history.map(r=>STATS[stat](r));
      const mean=values.reduce((a,b)=>a+b,0)/values.length;
      const sampleVariance=values.reduce((a,x)=>a+(x-mean)**2,0)/Math.max(1,values.length-1);
      const commonLine=Math.max(0.5,Math.floor(model.mu)+0.5);
      addScore(metrics[stat].model,actual,model.mu,model.var,commonLine);
      addScore(metrics[stat].seasonBaseline,actual,Math.max(0.05,mean),Math.max(mean+1e-6,sampleVariance),commonLine);
    }
  }
}
const summarize=m=>({
  n:m.n,
  meanLogLoss:m.n?+(m.logLoss/m.n).toFixed(4):null,
  meanRPS:m.n?+(m.rps/m.n).toFixed(4):null,
  brierAtCommonModelLine:m.n?+(m.brier/m.n).toFixed(4):null,
  calibration:m.bins.filter(b=>b.n>=15).map(b=>({predicted:+(b.p/b.n).toFixed(3),observed:+(b.y/b.n).toFixed(3),n:b.n}))
});
const output={
  split:{trainRounds:rounds.slice(0,splitAt),validationRounds:rounds.slice(splitAt)},
  note:'Same player-game sample for both distributions. The baseline uses the player historical mean and sample variance from games before the target. The common half-point line is centered on the model mean. These are synthetic evaluation lines, not bookmaker lines. Log-loss and RPS are proper distribution scores; this is not betting ROI.',
  stats:{}
};
for(const stat of stats) {
  const m=metrics[stat].model,b=metrics[stat].seasonBaseline;
  output.stats[stat]={
    model:summarize(m),
    seasonBaseline:summarize(b),
    improvementPct:{
      logLoss:m.n===b.n&&m.n?+((b.logLoss-m.logLoss)/b.logLoss*100).toFixed(2):null,
      rps:m.n===b.n&&m.n?+((b.rps-m.rps)/b.rps*100).toFixed(2):null,
      brier:m.n===b.n&&m.n?+((b.brier-m.brier)/b.brier*100).toFixed(2):null
    }
  };
}
console.log(JSON.stringify(output,null,2));
