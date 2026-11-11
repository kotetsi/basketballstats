// Pure selectors for the Advanced Player Finder.
// Game log indices follow the existing assets/data.json player schema.
export const FIELDS = Object.freeze({ round:0, date:1, opponent:2, home:3, seconds:7, points:8, reboundsOff:15, reboundsDef:16, assists:17, pir:25 });
export function playedGames(player) {
  return (player.g || []).filter(r => Number(r[FIELDS.seconds]) > 0)
    .sort((a,b) => String(a[FIELDS.date]).localeCompare(String(b[FIELDS.date])) || Number(a[FIELDS.round])-Number(b[FIELDS.round]));
}
export function playerWindow(player, period=5, venue='all') {
  // Last N appearances first; venue then restricts that fixed window.
  const games=playedGames(player);
  const recent=period==='all' ? games : games.slice(-Math.max(1,Number(period)||5));
  return recent.filter(r=>venue==='home'?Number(r[FIELDS.home])===1:venue==='away'?Number(r[FIELDS.home])===0:true);
}
export function playerFinderStats(player,{period=5,venue='all'}={}) {
  const games=playerWindow(player,period,venue), n=games.length;
  if(!n) return null;
  const sum=i=>games.reduce((v,r)=>v+(Number(r[i])||0),0);
  return {games:n, minutes:sum(FIELDS.seconds)/60/n, pir:sum(FIELDS.pir)/n,
    points:sum(FIELDS.points)/n, rebounds:(sum(FIELDS.reboundsOff)+sum(FIELDS.reboundsDef))/n,
    assists:sum(FIELDS.assists)/n};
}
export function findPlayers(players,{period=5,metric='pir',minMinutes=15,minGames=3,venue='all',team='',position='',search=''}={}) {
  const key=String(search).toLocaleLowerCase();
  return players.flatMap(p=>{
    if(team && !String(p.t||'').split(';').includes(team)) return [];
    if(position && p.pos!==position) return [];
    if(key && !String(p.n||'').toLocaleLowerCase().includes(key)) return [];
    const stats=playerFinderStats(p,{period,venue});
    if(!stats || stats.games<minGames || stats.minutes<minMinutes) return [];
    return [{player:p,...stats}];
  }).sort((a,b)=>(b[metric]??-Infinity)-(a[metric]??-Infinity) || (b.pir-a.pir) || String(a.player.n).localeCompare(String(b.player.n)));
}
