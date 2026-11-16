// Diagnose player minutes and per-minute production separately, walk-forward.
// No target-game participation, injury status or future information is used as an input.
// Run: node scripts/props-role-minutes-diagnostic.mjs
import fs from 'node:fs';
import { STATS } from '../src/odds/props.mjs';

const C = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const players = (C.players || []).filter(p => !String(p.t).includes(';'));
const rounds = [...new Set(players.flatMap(p => (p.g || []).filter(r => r[7] > 0).map(r => +r[0])))].sort((a,b)=>a-b);
if (rounds.length < 5) throw new Error('Χρειάζονται τουλάχιστον 5 αγωνιστικές.');
const splitAt = Math.max(4, Math.floor(rounds.length * 0.7));
const validation = new Set(rounds.slice(splitAt));
const stats = Object.keys(STATS);
const methods = ['ewMinutes3', 'seasonMinutes', 'last5Minutes', 'last3Minutes'];
const minute = Object.fromEntries(methods.map(m => [m, {n:0,abs:0,sq:0}]));
const roleGroups = Object.fromEntries(['stable','increase5','decrease5'].map(k=>[k,{ewMinutes3:{n:0,abs:0,sq:0},seasonMinutes:{n:0,abs:0,sq:0}}]));
const rate = Object.fromEntries(stats.map(s => [{
  season:{n:0,abs:0,sq:0}, last5:{n:0,abs:0,sq:0}, ew8:{n:0,abs:0,sq:0}
}]));
const ew = (xs, half) => {
  let sum=0, weight=0;
  xs.forEach((x,i)=>{const w=Math.pow(0.5,(xs.length-1-i)/half);sum+=w*x;weight+=w;});
  return weight ? sum/weight : 0;
};
const add = (x, actual, predicted) => {const e=actual-predicted;x.n++;x.abs+=Math.abs(e);x.sq+=e*e;};

for (const p of players) {
  const rows=(p.g||[]).filter(r=>r[7]>0).sort((a,b)=>+a[0]-+b[0]);
  for(let i=3;i<rows.length;i++){
    const target=rows[i], round=+target[0];
    if(!validation.has(round)) continue;
    const h=rows.slice(0,i).filter(r=>+r[0]<round);
    if(h.length<3) continue;
    const mins=h.map(r=>r[7]/60), actualMin=target[7]/60;
    const minutePred={
      ewMinutes3:ew(mins,3),
      seasonMinutes:mins.reduce((a,b)=>a+b,0)/mins.length,
      last5Minutes:mins.slice(-5).reduce((a,b)=>a+b,0)/Math.min(5,mins.length),
      last3Minutes:mins.slice(-3).reduce((a,b)=>a+b,0)/Math.min(3,mins.length)
    };
    for(const m of methods)add(minute[m],actualMin,minutePred[m]);
    // Ex-post diagnostic only: target minutes define the subgroup, never a prediction input.
    const delta = actualMin - minutePred.seasonMinutes;
    const group = delta >= 5 ? 'increase5' : delta <= -5 ? 'decrease5' : 'stable';
    for (const m of ['ewMinutes3','seasonMinutes']) add(roleGroups[group][m], actualMin, minutePred[m]);

    for(const s of stats){
      const vals=h.map(r=>STATS[s](r)/(r[7]/60));
      const actualRate=STATS[s](target)/actualMin;
      const predictions={
        season:vals.reduce((a,b)=>a+b,0)/vals.length,
        last5:vals.slice(-5).reduce((a,b)=>a+b,0)/Math.min(5,vals.length),
        ew8:ew(vals,8)
      };
      for(const m of Object.keys(predictions))add(rate[s][m],actualRate,predictions[m]);
    }
  }
}
const fmt=x=>({n:x.n,mae:+(x.abs/x.n).toFixed(3),rmse:+Math.sqrt(x.sq/x.n).toFixed(3)});
const output={
  split:{trainRounds:rounds.slice(0,splitAt),validationRounds:rounds.slice(splitAt)},
  note:'Minute MAE/RMSE are in minutes. Rate MAE/RMSE are stat units per minute. Only players who appeared in the target game are evaluated; this measures conditional minutes/rates, not pregame availability classification.',
  minutes:Object.fromEntries(methods.map(m=>[m,fmt(minute[m])])),
  roleChangeSlices:Object.fromEntries(Object.entries(roleGroups).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).map(([m,x])=>[m,fmt(x)]))])),
  perMinute:Object.fromEntries(stats.map(s=>[s,Object.fromEntries(Object.entries(rate[s]).map(([m,x])=>[m,fmt(x)]))]))
};
console.log(JSON.stringify(output,null,2));
