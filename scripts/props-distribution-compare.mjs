// Compare predictive distributions against a simple player-history baseline.
import fs from 'node:fs';
import { STATS, PARAMS, project, pmf, pOver } from '../src/odds/props.mjs';

const C=JSON.parse(fs.readFileSync(new URL('../data/cache.json',import.meta.url)));
const players=(C.players||[]).filter(p=>!String(p.t).includes(';'));
const rounds=[...new Set(players.flatMap(p=>(p.g||[]).filter(r=>r[7]>0).map(r=>+r[0])))].sort((a,b)=>a-b);
if(rounds.length<5) throw new Error('Χρειάζονται τουλάχιστον 5 αγωνιστικές.');
const splitAt=Math.max(4,Math.floor(rounds.length*.7)),validation=new Set(rounds.slice(splitAt)),stats=Object.keys(STATS);
const offsets=[-2,-1.5,-1,-.5,0,.5,1,1.5,2];
const makeMetric=()=>({n:0,logLoss:0,rps:0,brier:0,lineN:0,bins:Array.from({length:10},()=>({p:0,y:0,n:0}))});
const metrics=Object.fromEntries(stats.map(s=>[s,{model:makeMetric(),seasonBaseline:makeMetric()}]));
const byRound=new Map([...validation].map(r=>[r,Object.fromEntries(stats.map(s=>[s,{model:makeMetric(),seasonBaseline:makeMetric()}]))]));
const totals=new Map(rounds.map(r=>[r,Object.fromEntries(stats.map(s=>[s,0]))])),minutes=new Map(rounds.map(r=>[r,0]));
for(const p of players) for(const row of p.g||[]) {
  if(!(row[7]>0)) continue;
  const r=+row[0]; if(!totals.has(r)) continue;
  for(const s of stats) totals.get(r)[s]+=STATS[s](row);
  minutes.set(r,minutes.get(r)+row[7]/60);
}
const priorAt=new Map(),cumulative=Object.fromEntries(stats.map(s=>[s,0]));let cumulativeMinutes=0;
for(const r of rounds) {
  priorAt.set(r,Object.fromEntries(stats.map(s=>[s,cumulativeMinutes?cumulative[s]/cumulativeMinutes:0])));
  for(const s of stats) cumulative[s]+=totals.get(r)[s];
  cumulativeMinutes+=minutes.get(r);
}
function addScore(metric,actual,mu,variance,lines) {
  metric.n++;
  metric.logLoss-=Math.log(Math.max(1e-12,pmf(actual,mu,variance)));
  let cumulative=0;
  for(let k=0;k<=100;k++) {
    cumulative+=pmf(k,mu,variance);
    metric.rps+=(cumulative-(actual<=k?1:0))**2;
  }
  for(const line of lines) {
    const probability=pOver(mu,variance,line),observed=actual>line?1:0;
    metric.brier+=(probability-observed)**2;
    metric.lineN++;
    const bin=metric.bins[Math.min(9,Math.floor(probability*10))];
    bin.p+=probability;bin.y+=observed;bin.n++;
  }
}
for(const p of players) {
  const rows=(p.g||[]).filter(r=>r[7]>0).sort((a,b)=>+a[0]-+b[0]);
  for(let i=3;i<rows.length;i++) {
    const target=rows[i],round=+target[0];if(!validation.has(round)) continue;
    const history=rows.slice(0,i).filter(r=>+r[0]<round);if(history.length<3) continue;
    for(const stat of stats) {
      const actual=STATS[stat](target),model=project(history,stat,{prior:priorAt.get(round)[stat],P:PARAMS});
      if(!model||model.min<10) continue;
      const values=history.map(r=>STATS[stat](r)),mean=values.reduce((a,b)=>a+b,0)/values.length;
      const sampleVariance=values.reduce((a,x)=>a+(x-mean)**2,0)/Math.max(1,values.length-1);
      const baselineMu=Math.max(.05,mean),baselineVar=Math.max(mean+1e-6,sampleVariance);
      const lines=[...new Set(offsets.map(z=>Math.max(.5,Math.floor(model.mu+z*Math.sqrt(model.var))+.5)))];
      addScore(metrics[stat].model,actual,model.mu,model.var,lines);
      addScore(metrics[stat].seasonBaseline,actual,baselineMu,baselineVar,lines);
      addScore(byRound.get(round)[stat].model,actual,model.mu,model.var,lines);
      addScore(byRound.get(round)[stat].seasonBaseline,actual,baselineMu,baselineVar,lines);
    }
  }
}
const summarize=m=>({
  n:m.n,meanLogLoss:m.n?+(m.logLoss/m.n).toFixed(4):null,meanRPS:m.n?+(m.rps/m.n).toFixed(4):null,
  brierPerLine:m.lineN?+(m.brier/m.lineN).toFixed(4):null,lineObservations:m.lineN,
  calibration:m.bins.map((b,i)=>({range:(i/10).toFixed(1)+'-'+((i+1)/10).toFixed(1),predicted:b.n?+(b.p/b.n).toFixed(3):null,observed:b.n?+(b.y/b.n).toFixed(3):null,n:b.n,absGap:b.n?+Math.abs(b.p/b.n-b.y/b.n).toFixed(3):null})).filter(b=>b.n>=20)
});
const output={
  split:{trainRounds:rounds.slice(0,splitAt),validationRounds:rounds.slice(splitAt)},
  calibrationMethod:'For each held-out player-game, evaluate up to nine distinct half-point lines at model mean plus offsets [-2,-1.5,-1,-0.5,0,0.5,1,1.5,2] model standard deviations. Both distributions are evaluated on the same lines. Bins use predicted over probability deciles.',
  note:'All features and league priors use games strictly before the target round. The validation lines are synthetic model-centred lines, not historical bookmaker lines. This evaluates probability calibration and forecast distributions, not betting ROI. Bins are descriptive and observations within a player-game are correlated.',
  stats:{},
  byRound:Object.fromEntries([...byRound].sort((a,b)=>a[0]-b[0]).map(([round,perStat])=>[round,Object.fromEntries(stats.map(stat=>{const m=perStat[stat].model,b=perStat[stat].seasonBaseline;return [stat,{model:summarize(m),seasonBaseline:summarize(b),improvementPct:{logLoss:m.n===b.n&&m.n?+((b.logLoss-m.logLoss)/b.logLoss*100).toFixed(2):null,rps:m.n===b.n&&m.n?+((b.rps-m.rps)/b.rps*100).toFixed(2):null,brier:m.lineN===b.lineN&&m.lineN?+((b.brier-m.brier)/b.brier*100).toFixed(2):null}}]}))]))
};
for(const stat of stats) {
  const m=metrics[stat].model,b=metrics[stat].seasonBaseline;
  output.stats[stat]={model:summarize(m),seasonBaseline:summarize(b),improvementPct:{
    logLoss:m.n===b.n&&m.n?+((b.logLoss-m.logLoss)/b.logLoss*100).toFixed(2):null,
    rps:m.n===b.n&&m.n?+((b.rps-m.rps)/b.rps*100).toFixed(2):null,
    brier:m.n===b.n&&m.n?+((b.brier-m.brier)/b.brier*100).toFixed(2):null
  }};
}
console.log(JSON.stringify(output,null,2));
