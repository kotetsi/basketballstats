// Diagnostic for a single fresh-absence scenario.
// IMPORTANT: retrospective only. A non-appearance is not proof that an absence
// was known pregame. Do not use this as an operational pregame injury feed.
import fs from 'node:fs';
import { PARAMS, redistribute } from '../src/odds/props.mjs';

const C = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
const F = JSON.parse(fs.readFileSync(new URL('../data/fantasy/latest.json', import.meta.url)));
const players = (C.players || []).filter(p => !String(p.t).includes(';'));
const pos = Object.fromEntries((F.players || []).map(p => [p.c, p.pos]));
const teamRounds = {};
for (const g of C.league.games || []) if (g[6]) for (const t of [g[2], g[3]]) (teamRounds[t] ||= []).push(+g[0]);
for (const t of Object.keys(teamRounds)) teamRounds[t] = [...new Set(teamRounds[t])].sort((a,b)=>a-b);
const ew = (xs, half) => { let s=0,w=0; xs.forEach((x,i)=>{const q=Math.pow(0.5,(xs.length-1-i)/half);s+=x*q;w+=q;}); return w?s/w:0; };
const shares = [0.15,0.25,0.35,0.45,0.55,0.65,0.75,1];
const result = Object.fromEntries(shares.map(share=>[share,{n:0,baseAbs:0,adjustedAbs:0,baseSq:0,adjustedSq:0}]));
let scenarios=0;
for (const [team, rounds] of Object.entries(teamRounds)) {
  const rosterPlayers = players.filter(p=>p.t===team);
  for (const round of rounds.filter(r=>r>=8&&r<=11)) {
    const previousRound = Math.max(0,...rounds.filter(r=>r<round));
    if (!previousRound) continue;
    const roster = rosterPlayers.map(p=>{
      const history=(p.g||[]).filter(r=>r[7]>0&&+r[0]<round).sort((a,b)=>+a[0]-+b[0]);
      const target=(p.g||[]).find(r=>+r[0]===round);
      const played=!!target&&target[7]>0;
      return {p,history,target,played,fresh:!played&&history.length>0&&+history.at(-1)[0]===previousRound};
    }).filter(x=>x.history.length>0);
    const fresh=roster.filter(x=>x.fresh);
    // Restrict to one inferred fresh non-appearance, so this is a clean isolated diagnostic.
    if (fresh.length!==1) continue;
    const absent=fresh[0], out=roster.filter(x=>!x.played).map(x=>x.p.c);
    const active=roster.filter(x=>x.played&&x.target&&x.target[7]>0);
    if (active.length<5) continue;
    const base=roster.map(x=>({c:x.p.c,pos:pos[x.p.c]||'Forward',min:ew(x.history.map(r=>r[7]/60),PARAMS.minHalf)}));
    const baseByCode=Object.fromEntries(base.map(x=>[x.c,x.min]));
    scenarios++;
    for (const share of shares) {
      const adjusted=redistribute(base.map(x=>({...x,min:x.c===absent.p.c?x.min*share:x.min})),out,36,[absent.p.c]);
      const m=result[share];
      for (const x of active) {
        const actual=x.target[7]/60, e0=actual-baseByCode[x.p.c], e1=actual-adjusted[x.p.c];
        m.n++;m.baseAbs+=Math.abs(e0);m.adjustedAbs+=Math.abs(e1);m.baseSq+=e0*e0;m.adjustedSq+=e1*e1;
      }
    }
  }
}
const metrics=x=>({n:x.n,baseMAE:+(x.baseAbs/x.n).toFixed(3),adjustedMAE:+(x.adjustedAbs/x.n).toFixed(3),baseRMSE:+Math.sqrt(x.baseSq/x.n).toFixed(3),adjustedRMSE:+Math.sqrt(x.adjustedSq/x.n).toFixed(3)});
console.log(JSON.stringify({type:'retrospective absence scenario diagnostic',validationRounds:[8,9,10,11],scenarios,shareGrid:Object.fromEntries(shares.map(s=>[s,metrics(result[s])])),warning:'Absence is inferred from a player not appearing in the target game. This is outcome-derived and cannot establish that the player was ruled out pregame. Treat as exploratory sensitivity analysis only.'},null,2));
