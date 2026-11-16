// Walk-forward evaluation of the current EuroLeague player-prop distribution model.
// Uses only player games and league priors available before each target round.
// This evaluates forecast quality, NOT betting ROI: historical bookmaker lines are a separate dataset.
import fs from 'node:fs';
import { STATS, PARAMS, project, pmf, pOver } from '../src/odds/props.mjs';

const C = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const players = (C.players || []).filter(p => !String(p.t).includes(';'));
const allGames = players.flatMap(p => (p.g || []).filter(r => r[7] > 0).map(r => ({ round: +r[0], row: r })));
const rounds = [...new Set(allGames.map(x => x.round))].sort((a,b)=>a-b);
if (rounds.length < 5) throw new Error('Χρειάζονται τουλάχιστον 5 αγωνιστικές με δεδομένα.');
const splitAt = Math.max(4, Math.floor(rounds.length * 0.7));
const validationRounds = new Set(rounds.slice(splitAt));
const stats = Object.keys(STATS);
const binsFor = () => Array.from({length:10},()=>({p:0,y:0,n:0}));
const result = Object.fromEntries(stats.map(s=>[s,{n:0,abs:0,sq:0,ll:0,brier:0,bins:binsFor()}]));
const leaguePrior = (stat, targetRound) => {
  let total=0, minutes=0;
  for (const p of players) for (const r of p.g || []) {
    if (r[7] > 0 && +r[0] < targetRound) { total += STATS[stat](r); minutes += r[7]/60; }
  }
  return minutes ? total/minutes : 0;
};
for (const p of players) {
  const rows=(p.g||[]).filter(r=>r[7]>0).sort((a,b)=>a[0]-b[0]);
  for(let i=3;i<rows.length;i++){
    const target=rows[i], round=+target[0];
    if(!validationRounds.has(round)) continue;
    const history=rows.slice(0,i).filter(r=>+r[0]<round);
    for(const stat of stats){
      const prior=leaguePrior(stat,round);
      const pred=project(history,stat,{prior,P:PARAMS});
      if(!pred || pred.min<10) continue;
      const actual=STATS[stat](target), x=result[stat];
      x.n++; x.abs+=Math.abs(actual-pred.mu); x.sq+=(actual-pred.mu)**2;
      x.ll+=Math.log(Math.max(1e-12,pmf(actual,pred.mu,pred.var)));
      // Probability calibration around model-implied half-point lines (not bookmaker lines).
      for(const d of [-1,0,1]){
        const line=Math.max(0.5,Math.floor(pred.mu)+0.5+d*Math.sqrt(pred.var)/2);
        const q=pOver(pred.mu,pred.var,line), y=actual>line?1:0;
        x.brier+=(q-y)**2;
        const b=x.bins[Math.min(9,Math.floor(q*10))]; b.p+=q; b.y+=y; b.n++;
      }
    }
  }
}
const output={method:'walk-forward; league prior restricted to rounds before target',trainRounds:rounds.slice(0,splitAt),validationRounds:rounds.slice(splitAt),validationStart:rounds[splitAt],stats:{}};
for(const [s,x] of Object.entries(result)){
  output.stats[s]={n:x.n,mae:x.n?+(x.abs/x.n).toFixed(3):null,rmse:x.n?+Math.sqrt(x.sq/x.n).toFixed(3):null,meanLogLikelihood:x.n?+(x.ll/x.n).toFixed(4):null,brierPerLine:x.n?+(x.brier/(x.n*3)).toFixed(4):null,calibration:x.bins.filter(b=>b.n>=15).map(b=>({predicted:+(b.p/b.n).toFixed(3),observed:+(b.y/b.n).toFixed(3),n:b.n}))};
}
output.note='No historical bookmaker line/price matching is implied. ROI and CLV require archived pre-game prop snapshots.';
console.log(JSON.stringify(output,null,2));
