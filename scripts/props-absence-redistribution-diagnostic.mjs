// Conditional diagnostic of teammate minutes when exactly one recent rotation player
// did not appear in a target game. This is NOT a pregame injury prediction backtest:
// historical injury/status reports are not archived. Target-game participation is used
// only to define the evaluation scenario and outcome sample, never as a forecast input.
// Run: node scripts/props-absence-redistribution-diagnostic.mjs
import fs from 'node:fs';
import { redistribute } from '../src/odds/props.mjs';

const C = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const players = (C.players || []).filter(p => !String(p.t).includes(';'));
const teamRounds = {};
for (const g of C.league.games || []) {
  if (!g[6]) continue;
  for (const team of [g[2], g[3]]) (teamRounds[team] ||= []).push(+g[0]);
}
for (const team of Object.keys(teamRounds)) teamRounds[team] = [...new Set(teamRounds[team])].sort((a,b)=>a-b);
const ew = (xs, half) => {
  let sum=0, weight=0;
  xs.forEach((x,i)=>{const w=Math.pow(0.5,(xs.length-1-i)/half);sum+=x*w;weight+=w;});
  return weight ? sum/weight : 0;
};
const shares = [0.15,0.25,0.35,0.45,0.55,0.65,0.75,1];
const metrics = Object.fromEntries(shares.map(share=>[share,{n:0,baseAbs:0,adjustedAbs:0,baseSq:0,adjustedSq:0}]));
let scenarios=0;
const examples=[];

for (const [team, rounds] of Object.entries(teamRounds)) {
  const rosterPlayers=players.filter(p=>p.t===team);
  for (const round of rounds.filter(r=>r>=8&&r<=11)) {
    const previousTeamRound=Math.max(0,...rounds.filter(r=>r<round));
    if (!previousTeamRound) continue;
    const roster=rosterPlayers.map(p=>{
      const history=(p.g||[]).filter(r=>r[7]>0&&+r[0]<round).sort((a,b)=>+a[0]-+b[0]);
      const target=(p.g||[]).find(r=>+r[0]===round);
      const appeared=!!target&&target[7]>0;
      return {p,history,target,appeared,freshAbsence:!appeared&&history.length>0&&+history[history.length-1][0]===previousTeamRound};
    }).filter(x=>x.history.length);
    // Keep only isolated single fresh non-appearance scenarios to reduce confounding.
    const fresh=roster.filter(x=>x.freshAbsence);
    if (fresh.length!==1) continue;
    const absent=fresh[0];
    const out=roster.filter(x=>!x.appeared).map(x=>x.p.c);
    const active=roster.filter(x=>x.appeared&&x.target&&x.target[7]>0);
    if (active.length<5) continue;
    const baseTeam=roster.map(x=>({
      c:x.p.c,
      pos:x.p.pos||'Forward',
      min:ew(x.history.map(r=>r[7]/60),3)
    }));
    const base=Object.fromEntries(baseTeam.map(x=>[x.c,x.min]));
    scenarios++;
    for (const share of shares) {
      // Mirror teamMinutes(): only the absent player's projected contribution is scaled
      // by share before redistribute(); the remainder is deliberately not reassigned.
      const adjusted=redistribute(
        baseTeam.map(x=>({...x,min:x.c===absent.p.c?x.min*share:x.min})),
        out,36,[absent.p.c]
      );
      const m=metrics[share];
      for (const teammate of active) {
        const actual=teammate.target[7]/60;
        const e0=actual-base[teammate.p.c], e1=actual-adjusted[teammate.p.c];
        m.n++;m.baseAbs+=Math.abs(e0);m.adjustedAbs+=Math.abs(e1);
        m.baseSq+=e0*e0;m.adjustedSq+=e1*e1;
      }
    }
    if (examples.length<12) examples.push({
      team,round,nonappearedPlayer:absent.p.n,
      priorMinutes:+ew(absent.history.map(r=>r[7]/60),3).toFixed(1),
      evaluatedTeammates:active.length
    });
  }
}
const output={
  validationRounds:[8,9,10,11],
  scenarios,
  note:'Conditional non-appearance diagnostic only. It does not prove the player was injured or that the absence was known pregame. Historical injury/status snapshots are not available, so do not interpret this as live injury prediction performance.',
  shares:Object.fromEntries(shares.map(share=>{
    const x=metrics[share];
    return [share,{n:x.n,baseMAE:+(x.baseAbs/x.n).toFixed(3),adjustedMAE:+(x.adjustedAbs/x.n).toFixed(3),improvementPct:+((x.baseAbs-x.adjustedAbs)/x.baseAbs*100).toFixed(2)}];
  })),
  examples
};
console.log(JSON.stringify(output,null,2));
