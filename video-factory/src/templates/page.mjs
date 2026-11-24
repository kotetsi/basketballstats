import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VF_ROOT } from '../config.mjs';

// Builds one self-contained HTML page per production. window.setT(t) draws the frame at time t
// (seconds), deterministically, so the renderer can capture frame by frame. All sizes are in
// units of --u (1% of the shorter side), so the same page works at 9:16, 16:9, 1:1 and preview size.
// All graphics are drawn here (HTML/CSS/SVG). No photos, logos or third-party artwork.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fontUrl = f => pathToFileURL(path.join(VF_ROOT, 'assets', 'fonts', f)).href;
export const TEMPLATE_IDS = { leaderboard: 'leaderboard-v1', comparison: 'comparison-v1', spotlight: 'spotlight-v1' };
const KICKER = { leaderboard: 'LEADERBOARD', comparison: 'HEAD TO HEAD', spotlight: 'PLAYER SPOTLIGHT' };

const CSS = () => `
@font-face{font-family:Inter;font-weight:400;src:url('${fontUrl('Inter-Regular.woff2')}') format('woff2')}
@font-face{font-family:Inter;font-weight:500;src:url('${fontUrl('Inter-Medium.woff2')}') format('woff2')}
@font-face{font-family:Inter;font-weight:700;src:url('${fontUrl('Inter-Bold.woff2')}') format('woff2')}
@font-face{font-family:Inter;font-weight:800;src:url('${fontUrl('Inter-ExtraBold.woff2')}') format('woff2')}
:root{--bg:#10141d;--bg2:#171d2a;--ink:#fff;--mut:#9aa6bd;--acc:#e4572e;--acc2:#ffb347;--line:rgba(255,255,255,.08)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--ink);font-family:Inter,'DejaVu Sans',sans-serif;font-feature-settings:'tnum' 1}
body{font-size:calc(var(--u)*3.2)}
#bg{position:absolute;inset:0;background:radial-gradient(120% 80% at 80% 0%,#23304a 0%,var(--bg) 60%)}
#court{position:absolute;inset:0;width:100%;height:100%;opacity:.5}
.brand{position:absolute;left:calc(var(--u)*6);top:calc(var(--u)*6);font-weight:800;letter-spacing:.04em;font-size:calc(var(--u)*3.6);z-index:5}
.brand i{font-style:normal;color:var(--acc)}
.h .brand{top:calc(var(--u)*5)}
#prog{position:absolute;left:0;top:0;height:calc(var(--u)*.8);background:var(--acc);z-index:6}
.scene{position:absolute;inset:0;opacity:0;display:flex;flex-direction:column;justify-content:center;padding:calc(var(--u)*16) calc(var(--u)*7) calc(var(--u)*30)}
.h .scene{padding:calc(var(--u)*14) calc(var(--u)*12) calc(var(--u)*18)}
.s .scene{padding:calc(var(--u)*14) calc(var(--u)*7) calc(var(--u)*20)}
.kicker{display:inline-block;background:var(--acc);color:#fff;font-weight:800;letter-spacing:.12em;font-size:calc(var(--u)*3);padding:calc(var(--u)*1.2) calc(var(--u)*2.6);border-radius:calc(var(--u)*5)}
.title{font-weight:800;line-height:1.02;font-size:calc(var(--u)*10);margin-top:calc(var(--u)*5);letter-spacing:-.02em}
.h .title{font-size:calc(var(--u)*11)}
.title span{display:inline-block}
.sub{color:var(--mut);font-size:calc(var(--u)*4);margin-top:calc(var(--u)*4);font-weight:500}
.head{font-weight:800;font-size:calc(var(--u)*5.2);margin-bottom:calc(var(--u)*4);letter-spacing:-.01em}
.head small{display:block;color:var(--mut);font-weight:500;font-size:calc(var(--u)*3);margin-top:calc(var(--u)*1)}
/* leaderboard */
.rows{display:flex;flex-direction:column;gap:calc(var(--u)*2.2)}
.row{display:grid;grid-template-columns:calc(var(--u)*9) 1fr calc(var(--u)*16);align-items:center;gap:calc(var(--u)*2.4);background:var(--bg2);border-radius:calc(var(--u)*2.2);padding:calc(var(--u)*2.2) calc(var(--u)*3);position:relative;overflow:hidden;border:calc(var(--u)*.25) solid transparent}
.row.on{border-color:var(--acc);background:#1e2637}
.rk{font-weight:800;font-size:calc(var(--u)*6.5);color:var(--mut);text-align:center}
.row.on .rk{color:var(--acc)}
.nm{font-weight:800;font-size:calc(var(--u)*4.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm{color:var(--mut);font-weight:500;font-size:calc(var(--u)*2.8);margin-top:calc(var(--u)*.4)}
.bar{height:calc(var(--u)*1.4);border-radius:calc(var(--u)*1);margin-top:calc(var(--u)*1.4);background:rgba(255,255,255,.07);overflow:hidden}
.bar i{display:block;height:100%;width:0;border-radius:inherit}
.val{font-weight:800;font-size:calc(var(--u)*7);text-align:right}
.val small{display:block;font-size:calc(var(--u)*2.4);color:var(--mut);font-weight:500}
.chip{width:calc(var(--u)*1.6);position:absolute;left:0;top:0;bottom:0}
/* compare */
.vs{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:calc(var(--u)*3);margin-bottom:calc(var(--u)*5)}
.vs .p{font-weight:800;font-size:calc(var(--u)*5.6);line-height:1.05}
.vs .p small{display:block;font-weight:500;color:var(--mut);font-size:calc(var(--u)*2.8);margin-top:calc(var(--u)*1)}
.vs .p.r{text-align:right}
.vs .x{font-weight:800;color:var(--acc);font-size:calc(var(--u)*5)}
.cr{display:grid;grid-template-columns:calc(var(--u)*12) 1fr calc(var(--u)*20) 1fr calc(var(--u)*12);align-items:center;gap:calc(var(--u)*1.6);margin:calc(var(--u)*1.6) 0;padding:calc(var(--u)*1.6) 0;border-radius:calc(var(--u)*2)}
.cr.on{background:rgba(228,87,46,.12)}
.cr .lb{text-align:center;color:var(--mut);font-weight:700;font-size:calc(var(--u)*2.8);text-transform:uppercase;letter-spacing:.06em}
.cr .va{font-weight:800;font-size:calc(var(--u)*5)}
.cr .va.r{text-align:right}
.cr .va.win{color:var(--acc2)}
.half{height:calc(var(--u)*2.4);background:rgba(255,255,255,.06);border-radius:calc(var(--u)*1.2);overflow:hidden;display:flex}
.half.l{justify-content:flex-end}
.half i{display:block;height:100%;width:0}
/* radar */
.radar{display:flex;flex-direction:column;align-items:center}
.radar svg{width:calc(var(--u)*80);height:calc(var(--u)*80)}
.h .radar svg{width:calc(var(--u)*62);height:calc(var(--u)*62)}
.legend{display:flex;gap:calc(var(--u)*5);font-weight:700;font-size:calc(var(--u)*3.2);margin-top:calc(var(--u)*2)}
.legend b{display:inline-block;width:calc(var(--u)*3);height:calc(var(--u)*3);border-radius:50%;margin-right:calc(var(--u)*1.2);vertical-align:-10%}
/* spotlight */
.big{font-weight:800;font-size:calc(var(--u)*34);line-height:.9;letter-spacing:-.04em;color:var(--acc)}
.h .big{font-size:calc(var(--u)*30)}
.bigl{font-weight:700;font-size:calc(var(--u)*4.6);margin-top:calc(var(--u)*2)}
.cmpc{display:inline-flex;gap:calc(var(--u)*2);align-items:center;margin-top:calc(var(--u)*4);background:var(--bg2);border-radius:calc(var(--u)*5);padding:calc(var(--u)*1.6) calc(var(--u)*3.2);font-weight:700;font-size:calc(var(--u)*3.4)}
.cmpc em{font-style:normal;color:var(--acc2)}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:calc(var(--u)*2);margin-top:calc(var(--u)*5)}
.card{background:var(--bg2);border-radius:calc(var(--u)*2);padding:calc(var(--u)*2.4);text-align:center;opacity:0}
.card b{display:block;font-size:calc(var(--u)*6.4);font-weight:800}
.card span{color:var(--mut);font-size:calc(var(--u)*2.6);font-weight:600;text-transform:uppercase}
.chart{position:relative;height:calc(var(--u)*62);display:flex;align-items:flex-end;gap:calc(var(--u)*1.6);border-bottom:calc(var(--u)*.3) solid var(--line);margin-top:calc(var(--u)*4)}
.h .chart{height:calc(var(--u)*44)}
.col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative}
.col i{display:block;width:100%;border-radius:calc(var(--u)*1.2) calc(var(--u)*1.2) 0 0;background:#3a4560;height:0}
.col.on i{background:var(--acc)}
.col em{font-style:normal;font-weight:800;font-size:calc(var(--u)*3.4);margin-bottom:calc(var(--u)*1);opacity:0}
.col small{position:absolute;bottom:calc(var(--u)*-7);font-weight:700;color:var(--mut);font-size:calc(var(--u)*2.4);text-align:center;line-height:1.15}
.avgline{position:absolute;left:0;right:0;border-top:calc(var(--u)*.4) dashed var(--acc2);opacity:0}
.avgline span{position:absolute;right:0;top:calc(var(--u)*-4.6);color:var(--acc2);font-weight:700;font-size:calc(var(--u)*2.6)}
/* outro */
.outro{align-items:center;text-align:center}
.logo{font-weight:800;font-size:calc(var(--u)*9);letter-spacing:.02em}
.logo i{font-style:normal;color:var(--acc)}
.url{margin-top:calc(var(--u)*4);font-weight:800;font-size:calc(var(--u)*5.4);background:var(--acc);padding:calc(var(--u)*1.8) calc(var(--u)*4);border-radius:calc(var(--u)*6)}
.src{margin-top:calc(var(--u)*4);color:var(--mut);font-size:calc(var(--u)*3)}
/* horizontal (16:9): title column + content column */
.h .scene[data-scene=board],.h .scene[data-scene=radar]{display:grid;grid-template-columns:34% 1fr;column-gap:calc(var(--u)*8);align-items:center;padding-top:calc(var(--u)*12);padding-bottom:calc(var(--u)*16)}
.h .head{font-size:calc(var(--u)*6.4)}.h .head small{font-size:calc(var(--u)*3.2)}
.h .rows{gap:calc(var(--u)*1.4)}
.h .row{padding:calc(var(--u)*1.1) calc(var(--u)*2.6);grid-template-columns:calc(var(--u)*7) 1fr calc(var(--u)*14)}
.h .rk{font-size:calc(var(--u)*5)}.h .nm{font-size:calc(var(--u)*3.6)}.h .tm{font-size:calc(var(--u)*2.4)}.h .val{font-size:calc(var(--u)*5.2)}
.h .bar{margin-top:calc(var(--u)*.8);height:calc(var(--u)*1.1)}
.h .scene[data-scene=compare]{padding-top:calc(var(--u)*13);padding-bottom:calc(var(--u)*15)}
.h .vs{margin-bottom:calc(var(--u)*1.5)}.h .vs .p{font-size:calc(var(--u)*5)}
.h .cr{margin:calc(var(--u)*.4) 0;padding:calc(var(--u)*1) 0;grid-template-columns:calc(var(--u)*11) 1fr calc(var(--u)*22) 1fr calc(var(--u)*11)}
.h .cr .va{font-size:calc(var(--u)*4.4)}
.h .scene[data-scene=big],.h .scene[data-scene=timeline]{padding-top:calc(var(--u)*13);padding-bottom:calc(var(--u)*16)}
.h .scene[data-scene=big]{display:grid;grid-template-columns:1fr 1fr;column-gap:calc(var(--u)*8);align-content:center}
.h .scene[data-scene=big] .cards{grid-column:2;grid-row:1/span 4;grid-template-columns:1fr 1fr;align-self:center;margin:0}
.h .big{font-size:calc(var(--u)*24)}.h .card{padding:calc(var(--u)*3)}.h .card b{font-size:calc(var(--u)*7)}
/* square (1:1) */
.s .scene{padding-top:calc(var(--u)*13);padding-bottom:calc(var(--u)*21);justify-content:flex-start}
.s .scene[data-scene=intro],.s .scene[data-scene=outro]{justify-content:center}
.s .head{font-size:calc(var(--u)*4.4);margin-bottom:calc(var(--u)*2)}.s .head small{font-size:calc(var(--u)*2.6)}
.s .bar{margin-top:calc(var(--u)*.5)}.s .tm{font-size:calc(var(--u)*2.4)}
.s .vs .p{font-size:calc(var(--u)*4.2)}.s .vs .p small{font-size:calc(var(--u)*2.4)}.s .legend{font-size:calc(var(--u)*2.6);margin-top:0}
.s .big{font-size:calc(var(--u)*22)}.s .cards{margin-top:calc(var(--u)*3)}.s .card{padding:calc(var(--u)*1.6)}.s .card b{font-size:calc(var(--u)*5)}
.s .chart{height:calc(var(--u)*40)}.s .title{font-size:calc(var(--u)*9)}
.s .rows{gap:calc(var(--u)*1)}.s .row{padding:calc(var(--u)*.6) calc(var(--u)*2.6)}.s .rk{font-size:calc(var(--u)*5)}.s .nm{font-size:calc(var(--u)*3.8)}.s .val{font-size:calc(var(--u)*5.4)}
.s .radar svg{width:calc(var(--u)*52);height:calc(var(--u)*52)}
.s .cr{margin:calc(var(--u)*.5) 0;padding:calc(var(--u)*1) 0}.s .vs{margin-bottom:calc(var(--u)*2)}
.h .chart{height:calc(var(--u)*40);margin-top:calc(var(--u)*2)}
/* captions */
#cap{position:absolute;left:calc(var(--u)*7);right:calc(var(--u)*7);bottom:calc(var(--u)*17);display:flex;justify-content:center;z-index:7}
.h #cap{bottom:calc(var(--u)*5);left:calc(var(--u)*20);right:calc(var(--u)*20)}
.s #cap{bottom:calc(var(--u)*5)}
#cap div{background:rgba(5,8,14,.82);border-radius:calc(var(--u)*2);padding:calc(var(--u)*1.6) calc(var(--u)*3);font-weight:800;font-size:calc(var(--u)*4.1);line-height:1.22;text-align:center;white-space:pre-line;max-width:100%}
.h #cap div{font-size:calc(var(--u)*4.2)}
#cap div:empty{display:none}
`;

function court() {
  // simple original court-line pattern, drawn in SVG
  return `<svg id="court" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="rgba(255,255,255,.05)" stroke-width=".3">
<circle cx="50" cy="50" r="12"/><line x1="0" y1="50" x2="100" y2="50"/><path d="M20 0 v18 a30 30 0 0 0 60 0 V0"/><path d="M20 100 v-18 a30 30 0 0 1 60 0 V100"/><rect x="38" y="0" width="24" height="19"/><rect x="38" y="81" width="24" height="19"/></g></svg>`;
}

const fmt = x => (x == null ? '–' : Number.isInteger(x) ? String(x) : x.toFixed(1));

function introScene(story) {
  const words = story.title.split(' ').map(w => `<span>${esc(w)}&nbsp;</span>`).join('');
  const sub = story.type === 'leaderboard' ? (story.data.scope === 'round' ? `Round ${story.data.round}` : `Through round ${story.data.lastRound}`)
    : story.type === 'comparison' ? `Season averages through round ${story.data.lastRound}` : `${story.data.player.teamName} · last ${story.data.n} games`;
  return `<section class="scene" data-scene="intro"><div><span class="kicker">${KICKER[story.type]}</span></div><h1 class="title">${words}</h1><p class="sub">${esc(sub)}</p></section>`;
}

function outroScene() {
  return `<section class="scene outro" data-scene="outro"><div class="logo">BASKETBALL<i>STATS</i></div><div class="url">basketballstats.eu</div><div class="src">Data: official EuroLeague statistics</div></section>`;
}

function leaderboardScenes(story) {
  const d = story.data, max = Math.max(...d.items.map(i => i.value), 1);
  const head = d.scope === 'round' ? `Round ${d.round} · ${d.metricLabel}` : `${d.metricLabel} per game`;
  const small = d.scope === 'round' ? 'Single-game totals' : `Min. ${d.minGames} games · through round ${d.lastRound}`;
  const rows = d.items.map(it => `<div class="row" data-rank="${it.rank}"><div class="chip" style="background:${it.color}"></div><div class="rk">${it.rank}</div>
<div><div class="nm">${esc(it.name)}</div><div class="tm">${esc(it.teamName)}${it.oppName ? ` · ${it.home ? 'vs' : '@'} ${esc(it.oppName)}` : ''}</div><div class="bar"><i style="background:${it.color === '#1a1a1a' || it.color === '#222222' || it.color === '#2a2a2a' || it.color === '#2b2b2b' || it.color === '#3b3b3b' ? 'var(--acc)' : it.color}" data-w="${(100 * it.value / max).toFixed(1)}"></i></div></div>
<div class="val"><span data-v="${it.value}">0</span><small>${esc(d.metricLabel)}</small></div></div>`).join('');
  return `<section class="scene" data-scene="board"><div class="head">${esc(head)}<small>${esc(small)}</small></div><div class="rows">${rows}</div></section>`;
}

function comparisonScenes(story) {
  const d = story.data, [A, B] = d.players;
  const col = c => (['#1a1a1a', '#222222', '#2a2a2a', '#2b2b2b', '#3b3b3b'].includes(c) ? '#8a94a8' : c);
  const rows = [...d.rows, { key: 'form', label: `Last ${A.last5Count} PIR`, a: A.last5Pir, b: B.last5Pir }].map(r => {
    const m = Math.max(r.a, r.b, 1);
    return `<div class="cr" data-key="${r.key}"><div class="va ${r.a > r.b ? 'win' : ''}" data-v="${r.a}">0</div><div class="half l"><i style="background:${col(A.color)}" data-w="${(100 * r.a / m).toFixed(1)}"></i></div><div class="lb">${esc(r.label)}</div><div class="half"><i style="background:${col(B.color)}" data-w="${(100 * r.b / m).toFixed(1)}"></i></div><div class="va r ${r.b > r.a ? 'win' : ''}" data-v="${r.b}">0</div></div>`;
  }).join('');
  const vs = `<div class="vs"><div class="p">${esc(A.name)}<small>${esc(A.teamName)}</small></div><div class="x">VS</div><div class="p r">${esc(B.name)}<small>${esc(B.teamName)}</small></div></div>`;
  // radar
  const K = d.radarKeys, N = K.length, R = 38, cx = 50, cy = 50;
  const pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / N; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
  const ring = v => K.map((_, i) => pt(i, v).map(x => x.toFixed(2)).join(',')).join(' ');
  const labels = K.map((k, i) => { const [x, y] = pt(i, 1.2); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#9aa6bd" font-size="3.6" font-weight="700">${esc(d.radarLabels[k])}</text>`; }).join('');
  const poly = (P, cls, c) => `<polygon class="${cls}" data-pts="${K.map(k => P.radar[k] / 100).join(',')}" fill="${c}" fill-opacity=".28" stroke="${c}" stroke-width=".8" points="${ring(0)}"/>`;
  const radar = `<svg viewBox="0 0 100 100">${[.25, .5, .75, 1].map(v => `<polygon points="${ring(v)}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width=".3"/>`).join('')}${K.map((_, i) => { const [x, y] = pt(i, 1); return `<line x1="50" y1="50" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="rgba(255,255,255,.12)" stroke-width=".3"/>`; }).join('')}${poly(A, 'pa', '#e4572e')}${poly(B, 'pb', '#4cc2ff')}${labels}</svg>`;
  return `<section class="scene" data-scene="compare">${vs}<div class="crs">${rows}</div></section>
<section class="scene" data-scene="radar"><div class="head">League percentile profile<small>vs ${d.qualifiedCount} qualified players</small></div><div class="radar">${radar}<div class="legend"><span><b style="background:#e4572e"></b>${esc(A.name)}</span><span><b style="background:#4cc2ff"></b>${esc(B.name)}</span></div></div></section>`;
}

function spotlightScenes(story) {
  const d = story.data, P = d.player, max = Math.max(...d.games.map(g => g.pir), d.season.pir, 1), min = Math.min(0, ...d.games.map(g => g.pir));
  const span = max - min;
  const cols = d.games.map(g => `<div class="col" data-round="${g.round}"><em>${g.pir}</em><i data-h="${(100 * (g.pir - min) / span).toFixed(1)}"></i><small>${g.home ? '' : '@'}${esc(g.opp)}<br>R${g.round}</small></div>`).join('');
  const s = d.season;
  return `<section class="scene" data-scene="big"><div class="head">${esc(P.name)}<small>${esc(P.teamName)}${P.pos ? ' · ' + esc(P.pos) : ''}</small></div>
<div class="big" data-v="${d.avgLastN}">0</div><div class="bigl">PIR per game · last ${d.n}</div><div><span class="cmpc">Season <em>${fmt(s.pir)}</em></span></div>
<div class="cards">${[['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['min', 'Minutes']].map(([k, l]) => `<div class="card" data-card="${k}"><b>${fmt(s[k])}</b><span>${l}</span></div>`).join('')}</div></section>
<section class="scene" data-scene="timeline"><div class="head">PIR, game by game<small>Last ${d.n} games · dashed line = season average ${fmt(s.pir)}</small></div>
<div class="chart">${cols}<div class="avgline" style="bottom:${(100 * (s.pir - min) / span).toFixed(1)}%"><span>avg ${fmt(s.pir)}</span></div></div></section>`;
}

const RUNTIME = `
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const cl=x=>Math.max(0,Math.min(1,x)), ez=x=>1-Math.pow(1-cl(x),3), ezb=x=>{x=cl(x);const c=1.70158;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const fmt=(v,p)=>{const d=Number.isInteger(v)?0:1;return (v*p).toFixed(d)};
const W=innerWidth,H=innerHeight; document.documentElement.style.setProperty('--u',Math.min(W,H)/100+'px');
document.body.className=W>H*1.2?'h':(H>W*1.2?'v':'s');
const segStart=(f)=>{const s=TL.segments.find(x=>x.focus===f);return s?s.start:null};
const segOf=id=>TL.segments.find(x=>x.id===id);
const R={};
R.intro=(el,t)=>{ $$('.title span',el).forEach((s,i)=>{const p=ezb((t-.15-i*.09)/.5);s.style.opacity=cl((t-.15-i*.09)/.3);s.style.transform='translateY('+(40*(1-p))+'%)';});
  const k=$('.kicker',el); k.style.opacity=cl(t/.3); k.style.transform='scale('+(.8+.2*ezb(t/.4))+')'; $('.sub',el).style.opacity=cl((t-.8)/.4);};
R.board=(el,t,abs)=>{ const rows=$$('.row',el); const cur=TL.segments.filter(s=>s.scene==='board'&&s.start<=abs+.01).pop();
  rows.forEach(r=>{const k=+r.dataset.rank, st=segStart(k); const show=st!=null&&abs>=st-.15; const p=show?ez((abs-st+.15)/.6):0;
    r.style.opacity=st==null?0:p; r.style.transform='translateX('+(-12*(1-p))+'%)';
    $('.bar i',r).style.width=(p*+$('.bar i',r).dataset.w)+'%'; const v=$('[data-v]',r); v.textContent=fmt(+v.dataset.v,ez((abs-st)/.9));
    r.classList.toggle('on',!!cur&&cur.focus===k);});
  $('.head',el).style.opacity=cl(t/.4);};
R.compare=(el,t,abs)=>{ const cur=TL.segments.filter(s=>s.scene==='compare'&&s.start<=abs+.01).pop();
  $('.vs',el).style.opacity=cl(t/.4); $('.vs',el).style.transform='translateY('+(-20*(1-ez(t/.5)))+'%)';
  $$('.cr',el).forEach(r=>{const st=segStart(r.dataset.key); const p=st==null?0:ez((abs-st+.1)/.6); r.style.opacity=p;
    $$('i',r).forEach(i=>i.style.width=(p*+i.dataset.w)+'%'); $$('[data-v]',r).forEach(v=>v.textContent=fmt(+v.dataset.v,ez((abs-st)/.8)));
    r.classList.toggle('on',!!cur&&cur.focus===r.dataset.key);});};
R.radar=(el,t)=>{ const p=ezb((t-.2)/1.1); const N=6;
  $$('polygon[data-pts]',el).forEach((pg,j)=>{const v=pg.dataset.pts.split(',').map(Number); const q=ezb((t-.2-j*.35)/1.1);
    pg.setAttribute('points',v.map((x,i)=>{const a=-Math.PI/2+2*Math.PI*i/v.length;return (50+Math.cos(a)*38*x*q).toFixed(2)+','+(50+Math.sin(a)*38*x*q).toFixed(2)}).join(' '));});
  $('.head',el).style.opacity=cl(t/.4); $('.legend',el).style.opacity=cl((t-.6)/.4);};
R.big=(el,t,abs)=>{ const b=$('.big',el); b.textContent=fmt(+b.dataset.v,ez((t-.2)/1.2)); b.style.transform='scale('+(.85+.15*ezb((t-.1)/.6))+')';
  $('.head',el).style.opacity=cl(t/.4); $('.bigl',el).style.opacity=cl((t-.5)/.4); $('.cmpc',el).style.opacity=cl((t-1)/.4);
  const st=segStart('season'); $$('.card',el).forEach((c,i)=>{const p=st==null?0:ez((abs-st-i*.15)/.5); c.style.opacity=p; c.style.transform='translateY('+(30*(1-p))+'%)';});};
R.timeline=(el,t,abs)=>{ const cur=TL.segments.filter(s=>s.scene==='timeline'&&s.start<=abs+.01).pop();
  $$('.col',el).forEach((c,i)=>{const p=ez((t-.2-i*.12)/.6); $('i',c).style.height=(p*+$('i',c).dataset.h)+'%'; $('em',c).style.opacity=cl((t-.5-i*.12)/.3);
    c.classList.toggle('on',!!cur&&String(cur.focus)===c.dataset.round);});
  const a=$('.avgline',el); a.style.opacity=cl((t-1.4)/.5); if(cur&&cur.focus==='avg') a.style.opacity=1; $('.head',el).style.opacity=cl(t/.4);};
R.outro=(el,t)=>{ $('.logo',el).style.opacity=cl(t/.4); $('.logo',el).style.transform='scale('+(.9+.1*ezb(t/.5))+')'; $('.url',el).style.opacity=cl((t-.4)/.4); $('.src',el).style.opacity=cl((t-.8)/.4);};
const SC=$$('.scene'), FADE=.35;
window.setT=t=>{
  $('#prog').style.width=(100*cl(t/TL.total))+'%';
  for(const el of SC){ // a scene may appear in several blocks; use the block that is on screen now
    const blocks=TL.scenes.filter(s=>s.scene===el.dataset.scene); let best=null,op=0;
    for(const sc of blocks){const o=cl((t-sc.start)/FADE)*cl((sc.end-t)/FADE+(sc.end>=TL.total-.001?1:0)); if(o>op){op=o;best=sc;}}
    el.style.opacity=op; el.style.visibility=op>0?'visible':'hidden';
    if(best&&R[best.scene]) R[best.scene](el,t-(best===blocks[0]?best.start:best.start-1.5),t);}
  const c=CUES.find(c=>t>=c.start&&t<c.end); $('#cap div').textContent=c?c.text:'';
};
window.ready=document.fonts.ready.then(()=>{setT(0);return true});
`;

export function buildPage({ story, timeline, cues, captions = true }) {
  const scenes = story.type === 'leaderboard' ? leaderboardScenes(story) : story.type === 'comparison' ? comparisonScenes(story) : spotlightScenes(story);
  return `<!doctype html><html lang="${esc(story.lang || 'en')}"><head><meta charset="utf-8"><style>${CSS()}</style></head><body>
<div id="bg"></div>${court()}<div id="prog"></div><div class="brand">BASKETBALL<i>STATS</i></div>
${introScene(story)}${scenes}${outroScene()}
<div id="cap"><div></div></div>
<script>const TL=${JSON.stringify(timeline)};const CUES=${JSON.stringify(captions ? cues : [])};${RUNTIME}</script></body></html>`;
}
