import { CSS, court, esc } from './page.mjs';

// Generic scene kit. A production request may carry `plan`: an ordered list of scenes, each
// { id, kind, ...payload }. Script segments point at scenes by id and can set `focus` to the key
// of a row/option/clue to reveal or highlight it while that line is spoken. New video formats
// compose these kinds; they never need changes here unless they need a brand-new kind.
//
// kinds: title · board · compare · radar · big · bars · statement · question · clues · court · split · outro

export const THEMES = { classic: { acc: '#e4572e', acc2: '#ffb347', label: 'Classic (orange)' }, ocean: { acc: '#2f80ed', acc2: '#56ccf2', label: 'Ocean (blue)' }, gold: { acc: '#d4a017', acc2: '#ffe08a', label: 'Gold' } };
const DARK = new Set(['#1a1a1a', '#222222', '#2a2a2a', '#2b2b2b', '#3b3b3b']);
const col = c => (!c || DARK.has(c) ? '#e4572e' : c);
const fmt = (v, unit = '') => (v == null ? '–' : (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : esc(v)) + unit);
const num = v => (typeof v === 'number' ? v : null);

const KIT_CSS = `
.stmt{font-weight:800;font-size:calc(var(--u)*8);line-height:1.08;letter-spacing:-.02em}
.h .stmt{font-size:calc(var(--u)*8.5)}
.stmt em{font-style:normal;color:var(--acc)}
.chips{display:flex;flex-wrap:wrap;gap:calc(var(--u)*2);margin-top:calc(var(--u)*5)}
.chips div{background:var(--bg2);border-radius:calc(var(--u)*2);padding:calc(var(--u)*2) calc(var(--u)*3);opacity:0}
.chips b{display:block;font-size:calc(var(--u)*6);font-weight:800;color:var(--acc2)}
.chips span{color:var(--mut);font-weight:600;font-size:calc(var(--u)*2.6);text-transform:uppercase;letter-spacing:.04em}
.q{font-weight:800;font-size:calc(var(--u)*6.4);line-height:1.12;margin-bottom:calc(var(--u)*4)}
.opts{display:grid;gap:calc(var(--u)*2)}
.h .opts{grid-template-columns:1fr 1fr}
.opt{display:flex;align-items:center;gap:calc(var(--u)*2.4);background:var(--bg2);border-radius:calc(var(--u)*2);padding:calc(var(--u)*2.2) calc(var(--u)*3);border:calc(var(--u)*.3) solid transparent;opacity:0}
.opt .k{width:calc(var(--u)*6);height:calc(var(--u)*6);border-radius:50%;background:var(--chip,#2a3347);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:calc(var(--u)*3.2);flex:none}
.opt .l{font-weight:800;font-size:calc(var(--u)*4.2)}.opt .l small{display:block;color:var(--mut);font-weight:500;font-size:calc(var(--u)*2.6)}
.opt .rv{margin-left:auto;font-weight:800;font-size:calc(var(--u)*4.4);color:var(--acc2);opacity:0}
.opt.ok{border-color:#2fae66;background:#173326}.opt.ok .k{background:#2fae66}.opt.dim{opacity:.45!important}
.timer{margin-top:calc(var(--u)*4);height:calc(var(--u)*1.2);background:rgba(255,255,255,.08);border-radius:calc(var(--u)*1);overflow:hidden}
.timer i{display:block;height:100%;background:var(--acc2);width:100%}
.clue{display:flex;gap:calc(var(--u)*2.4);align-items:center;background:var(--bg2);border-radius:calc(var(--u)*2);padding:calc(var(--u)*2) calc(var(--u)*3);margin-bottom:calc(var(--u)*1.8);opacity:0;font-weight:700;font-size:calc(var(--u)*4)}
.clue b{color:var(--acc);font-size:calc(var(--u)*3.2)}
.ans{margin-top:calc(var(--u)*3);font-weight:800;font-size:calc(var(--u)*8);color:var(--acc);opacity:0;line-height:1}
.ans small{display:block;color:var(--mut);font-size:calc(var(--u)*3.2);font-weight:600;margin-top:calc(var(--u)*1.4)}
.mystery{font-weight:800;font-size:calc(var(--u)*16);color:#2a3347;line-height:1}
.courtwrap{display:flex;flex-direction:column;align-items:center}
.courtwrap svg{width:calc(var(--u)*86);height:calc(var(--u)*80)}
.h .courtwrap svg{width:calc(var(--u)*76);height:calc(var(--u)*60)}
.split .sr{margin:calc(var(--u)*2.4) 0;opacity:0}
.split .sl{display:flex;justify-content:space-between;font-weight:800;font-size:calc(var(--u)*3.6);margin-bottom:calc(var(--u)*1)}
.split .sl span{color:var(--mut);font-weight:600}
.split .st{display:flex;height:calc(var(--u)*5);border-radius:calc(var(--u)*1.4);overflow:hidden;background:rgba(255,255,255,.06)}
.split .st i{display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:calc(var(--u)*2.6);width:0;white-space:nowrap;overflow:hidden}
.legend2{display:flex;gap:calc(var(--u)*4);color:var(--mut);font-weight:600;font-size:calc(var(--u)*2.8)}
.legend2 b{display:inline-block;width:calc(var(--u)*2.4);height:calc(var(--u)*2.4);border-radius:calc(var(--u)*.6);margin-right:calc(var(--u)*1);vertical-align:-8%}
.oq{margin-top:calc(var(--u)*5);font-weight:700;font-size:calc(var(--u)*4);max-width:90%;line-height:1.25}
.oq b{color:var(--acc2)}
.h .scene[data-kind=board],.h .scene[data-kind=radar],.h .scene[data-kind=court],.h .scene[data-kind=split]{display:grid;grid-template-columns:34% 1fr;column-gap:calc(var(--u)*8);align-items:center;padding-top:calc(var(--u)*12);padding-bottom:calc(var(--u)*16)}
.h .scene[data-kind=compare],.h .scene[data-kind=big],.h .scene[data-kind=bars],.h .scene[data-kind=question],.h .scene[data-kind=clues],.h .scene[data-kind=statement]{padding-top:calc(var(--u)*13);padding-bottom:calc(var(--u)*16)}
.h .scene[data-kind=big]{display:grid;grid-template-columns:1fr 1fr;column-gap:calc(var(--u)*8);align-content:center}
.h .scene[data-kind=big] .cards{grid-column:2;grid-row:1/span 4;grid-template-columns:1fr 1fr;align-self:center;margin:0}
.s .scene{padding-top:calc(var(--u)*13);padding-bottom:calc(var(--u)*21);justify-content:flex-start}
.s .scene[data-kind=title],.s .scene[data-kind=outro],.s .scene[data-kind=statement]{justify-content:center}
.s .q{font-size:calc(var(--u)*5.2)}.s .opt{padding:calc(var(--u)*1.4) calc(var(--u)*2.6)}.s .clue{padding:calc(var(--u)*1.4) calc(var(--u)*2.6);font-size:calc(var(--u)*3.4)}
.s .courtwrap svg{width:calc(var(--u)*64);height:calc(var(--u)*58)}
`;

const head = s => (s.head ? `<div class="head">${esc(s.head)}${s.sub ? `<small>${esc(s.sub)}</small>` : ''}</div>` : '');

const SCENES = {
  title: s => `<div><span class="kicker">${esc(s.kicker || 'BASKETBALLSTATS')}</span></div><h1 class="title">${String(s.title).split(' ').map(w => `<span>${esc(w)}&nbsp;</span>`).join('')}</h1><p class="sub">${esc(s.sub || '')}</p>`,
  board: s => {
    const max = Math.max(...s.rows.map(r => Math.abs(num(r.value) ?? 0)), 1);
    return `${head(s)}<div class="rows">${s.rows.map((r, i) => `<div class="row" data-key="${esc(r.key)}" data-i="${i}"><div class="chip" style="background:${col(r.color)}"></div><div class="rk">${esc(r.rank ?? i + 1)}</div>
<div><div class="nm">${esc(r.label)}</div><div class="tm">${esc(r.sub || '')}</div><div class="bar"><i style="background:${col(r.color)}" data-w="${(100 * Math.abs(num(r.value) ?? 0) / max).toFixed(1)}"></i></div></div>
<div class="val"><span ${num(r.value) != null && !r.display ? `data-v="${r.value}"` : ''}>${r.display ? esc(r.display) : fmt(r.value)}</span><small>${esc(r.unit || s.unit || '')}</small></div></div>`).join('')}</div>`;
  },
  compare: s => `<div class="vs"><div class="p">${esc(s.a.name)}<small>${esc(s.a.sub || '')}</small></div><div class="x">VS</div><div class="p r">${esc(s.b.name)}<small>${esc(s.b.sub || '')}</small></div></div><div class="crs">${s.rows.map(r => {
    const m = Math.max(Math.abs(r.a), Math.abs(r.b), 1e-9), better = r.lowerBetter ? (x, y) => x < y : (x, y) => x > y;
    return `<div class="cr" data-key="${esc(r.key)}"><div class="va ${better(r.a, r.b) ? 'win' : ''}" data-v="${r.a}">0</div><div class="half l"><i style="background:${col(s.a.color)}" data-w="${(100 * Math.abs(r.a) / m).toFixed(1)}"></i></div><div class="lb">${esc(r.label)}</div><div class="half"><i style="background:${s.b.color && !DARK.has(s.b.color) ? s.b.color : '#4cc2ff'}" data-w="${(100 * Math.abs(r.b) / m).toFixed(1)}"></i></div><div class="va r ${better(r.b, r.a) ? 'win' : ''}" data-v="${r.b}">0</div></div>`;
  }).join('')}</div>`,
  radar: s => {
    const K = s.keys, N = K.length, R = 38, pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / N; return [50 + Math.cos(a) * R * v, 50 + Math.sin(a) * R * v]; };
    const ring = v => K.map((_, i) => pt(i, v).map(x => x.toFixed(2)).join(',')).join(' ');
    const colors = ['#e4572e', '#4cc2ff'];
    return `${head(s)}<div class="radar"><svg viewBox="0 0 100 100">${[.25, .5, .75, 1].map(v => `<polygon points="${ring(v)}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width=".3"/>`).join('')}${K.map((_, i) => { const [x, y] = pt(i, 1); return `<line x1="50" y1="50" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="rgba(255,255,255,.12)" stroke-width=".3"/>`; }).join('')}
${s.series.map((se, j) => `<polygon data-pts="${K.map(k => (se.values[k] ?? 0) / 100).join(',')}" fill="${colors[j]}" fill-opacity=".28" stroke="${colors[j]}" stroke-width=".8" points="${ring(0)}"/>`).join('')}
${K.map((k, i) => { const [x, y] = pt(i, 1.2); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#9aa6bd" font-size="3.6" font-weight="700">${esc(s.labels[k] || k)}</text>`; }).join('')}</svg>
<div class="legend">${s.series.map((se, j) => `<span><b style="background:${colors[j]}"></b>${esc(se.name)}</span>`).join('')}</div></div>`;
  },
  big: s => `${head(s)}<div class="big" ${num(s.value) != null && !s.display ? `data-v="${s.value}"` : ''}>${s.display ? esc(s.display) : fmt(s.value)}</div><div class="bigl">${esc(s.label || '')}</div>${s.chip ? `<div><span class="cmpc">${esc(s.chip.label)} <em>${fmt(s.chip.value)}</em></span></div>` : '<div></div>'}
${s.cards?.length ? `<div class="cards">${s.cards.map(c => `<div class="card" data-key="${esc(c.key)}"><b>${fmt(c.value, c.unit || '')}</b><span>${esc(c.label)}</span></div>`).join('')}</div>` : ''}`,
  bars: s => {
    const vals = s.cols.map(c => c.value), max = Math.max(...vals, s.ref?.value ?? -Infinity, 1), min = Math.min(0, ...vals), span = max - min || 1;
    return `${head(s)}<div class="chart">${s.cols.map(c => `<div class="col" data-key="${esc(c.key)}"><em>${fmt(c.value)}</em><i data-h="${(100 * (c.value - min) / span).toFixed(1)}"></i><small>${esc(c.label)}${c.sub ? `<br>${esc(c.sub)}` : ''}</small></div>`).join('')}${s.ref ? `<div class="avgline" style="bottom:${(100 * (s.ref.value - min) / span).toFixed(1)}%"><span>${esc(s.ref.label)}</span></div>` : ''}</div>`;
  },
  statement: s => `${s.kicker ? `<div><span class="kicker">${esc(s.kicker)}</span></div><div style="height:calc(var(--u)*4)"></div>` : ''}<div class="stmt">${esc(s.text).replace(/\*\*(.+?)\*\*/g, '<em>$1</em>')}</div>${s.chips?.length ? `<div class="chips">${s.chips.map(c => `<div data-key="${esc(c.key || '')}"><b>${fmt(c.value, c.unit || '')}</b><span>${esc(c.label)}</span></div>`).join('')}</div>` : ''}`,
  question: s => `<div class="q">${esc(s.prompt)}</div><div class="opts">${s.options.map((o, i) => `<div class="opt" data-key="${esc(o.key)}" data-ok="${o.key === s.answer ? 1 : 0}"><div class="k">${'ABCD'[i]}</div><div class="l">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div><div class="rv">${o.reveal != null ? fmt(o.reveal, o.unit || '') : ''}</div></div>`).join('')}</div>${s.countdown ? '<div class="timer"><i></i></div>' : ''}`,
  clues: s => `${head(s)}<div>${s.clues.map((c, i) => `<div class="clue" data-key="${esc(c.key)}"><b>${i + 1}</b>${esc(c.text)}</div>`).join('')}</div><div class="mystery">?</div><div class="ans">${esc(s.answer.label)}<small>${esc(s.answer.sub || '')}</small></div>`,
  court: s => {
    const Z = s.zones || {}, share = z => Z[z]?.share ?? 0, maxS = Math.max(...Object.values(Z).map(z => z.share || 0), 1);
    const fill = z => `fill="#e4572e" fill-opacity="${(0.12 + 0.75 * share(z) / maxS).toFixed(2)}" data-z="${z}"`;
    const lab = (z, x, y) => (Z[z] ? `<text x="${x}" y="${y}" text-anchor="middle" fill="#fff" font-size="64" font-weight="800">${Math.round(share(z))}%</text><text x="${x}" y="${y + 58}" text-anchor="middle" fill="#cfd6e4" font-size="40" font-weight="700">${Z[z].fg != null ? Math.round(Z[z].fg) + '% FG' : ''}</text>` : '');
    const wedge = (a1, a2, r1, r2) => { const p = (a, r) => `${(Math.sin(a * Math.PI / 180) * r).toFixed(0)},${(-Math.cos(a * Math.PI / 180) * r).toFixed(0)}`; return `M${p(a1, r1)} A${r1},${r1} 0 0 1 ${p(a2, r1)} L${p(a2, r2)} A${r2},${r2} 0 0 0 ${p(a1, r2)} Z`; };
    return `${head(s)}<div class="courtwrap"><svg viewBox="-760 -1000 1520 1180"><defs><clipPath id="cc"><rect x="-750" y="-1000" width="1500" height="1157.5"/></clipPath></defs>
<g clip-path="url(#cc)" stroke="rgba(255,255,255,.25)" stroke-width="6">
<path d="${wedge(-90, -22.5, 675, 1600)}" ${fill('w3l')}/><path d="${wedge(22.5, 90, 675, 1600)}" ${fill('w3r')}/><path d="${wedge(-22.5, 22.5, 675, 1600)}" ${fill('top3')}/>
<rect x="-750" y="-141" width="90" height="298.5" ${fill('c3l')}/><rect x="660" y="-141" width="90" height="298.5" ${fill('c3r')}/>
<path d="M-660,157.5 L-660,-141 A675,675 0 0 1 660,-141 L660,157.5 Z" ${fill('mid')}/>
<rect x="-245" y="-422.5" width="490" height="580" ${fill('paint')}/><circle cx="0" cy="0" r="125" ${fill('rim')}/></g>
<g fill="none" stroke="rgba(255,255,255,.6)" stroke-width="8"><rect x="-750" y="-1000" width="1500" height="1157.5"/><circle cx="0" cy="0" r="22"/><line x1="-90" y1="40" x2="90" y2="40"/></g>
${lab('rim', 0, 15)}${lab('paint', 0, -280)}${lab('mid', -430, -330)}${lab('top3', 0, -800)}${lab('w3l', -520, -700)}${lab('w3r', 520, -700)}${lab('c3l', -705, -380)}${lab('c3r', 705, -380)}</svg>
${s.note ? `<div class="legend2">${esc(s.note)}</div>` : ''}</div>`;
  },
  split: s => `${head(s)}<div class="split">${s.rows.map(r => { const tot = r.parts.reduce((a, p) => a + p.value, 0) || 1; return `<div class="sr" data-key="${esc(r.key)}"><div class="sl">${esc(r.label)}<span>${esc(r.display || '')}</span></div><div class="st">${r.parts.map(p => `<i style="background:${p.color || '#e4572e'}" data-w="${(100 * p.value / tot).toFixed(1)}">${p.text ? esc(p.text) : ''}</i>`).join('')}</div></div>`; }).join('')}
${s.legend ? `<div class="legend2" style="margin-top:calc(var(--u)*3)">${s.legend.map(l => `<span><b style="background:${l.color}"></b>${esc(l.label)}</span>`).join('')}</div>` : ''}</div>`,
  outro: s => `<div class="logo">BASKETBALL<i>STATS</i></div><div class="url">basketballstats.eu</div>${s.question ? `<div class="oq">${esc(s.question)}</div>` : ''}<div class="src">${esc(s.source || 'Data: official EuroLeague statistics')}</div>`,
};

// scene renderers (browser side). seg(sceneId,key) = start time of the line that focuses `key` in this scene
const KIT_RUNTIME = `
const seg=(sid,k)=>{const s=TL.segments.find(x=>x.scene===sid&&String(x.focus)===String(k));return s?s.start:null};
const curFocus=(sid,abs)=>{const s=TL.segments.filter(x=>x.scene===sid&&x.start<=abs+.01).pop();return s&&s.focus!=null?String(s.focus):null};
// rows named by the narration appear when their line starts; the others follow after the last named one
const reveal=(el,sel,sid,t,abs,step=.45,base=.3)=>{const rows=$$(sel,el),starts=rows.map(r=>seg(sid,r.dataset.key));
  const named=starts.filter(x=>x!=null),lastF=named.length?Math.max(...named):null,sc=abs-t; let k=0;
  rows.forEach((r,i)=>{const at=starts[i]!=null?starts[i]-.1:(lastF!=null?lastF+1.2:sc+base)+(k++)*step;
    const p=ez((abs-at)/.55); r.style.opacity=p; r.style.transform='translateY('+(18*(1-p))+'%)'; r._p=p;});};
const K={};
K.title=R.intro;
K.board=(el,t,abs,sid)=>{reveal(el,'.row',sid,t,abs); const cf=curFocus(sid,abs);
  $$('.row',el).forEach(r=>{const i=$('.bar i',r);i.style.width=(r._p*+i.dataset.w)+'%';const v=$('[data-v]',r);if(v)v.textContent=fmt(+v.dataset.v,r._p);r.classList.toggle('on',cf===r.dataset.key);});
  const h=$('.head',el); if(h) h.style.opacity=cl(t/.4);};
K.compare=(el,t,abs,sid)=>{reveal(el,'.cr',sid,t,abs,.5,.6); const cf=curFocus(sid,abs); const vs=$('.vs',el); vs.style.opacity=cl(t/.4);
  $$('.cr',el).forEach(r=>{$$('i',r).forEach(i=>i.style.width=(r._p*+i.dataset.w)+'%');$$('[data-v]',r).forEach(v=>v.textContent=fmt(+v.dataset.v,r._p));r.style.transform='none';r.classList.toggle('on',cf===r.dataset.key);});};
K.radar=R.radar;
K.big=(el,t,abs,sid)=>{const b=$('.big',el); if(b.dataset.v) b.textContent=fmt(+b.dataset.v,ez((t-.2)/1.2)); b.style.transform='scale('+(.85+.15*ezb((t-.1)/.6))+')';
  const h=$('.head',el); if(h) h.style.opacity=cl(t/.4); $('.bigl',el).style.opacity=cl((t-.5)/.4); const c=$('.cmpc',el); if(c) c.style.opacity=cl((t-1)/.4);
  reveal(el,'.card',sid,t,abs,.2,1.4);};
K.bars=(el,t,abs,sid)=>{const cf=curFocus(sid,abs); $$('.col',el).forEach((c,i)=>{const p=ez((t-.2-i*.1)/.6); $('i',c).style.height=(p*+$('i',c).dataset.h)+'%'; $('em',c).style.opacity=cl((t-.5-i*.1)/.3); c.classList.toggle('on',cf===c.dataset.key);});
  const a=$('.avgline',el); if(a) a.style.opacity=cl((t-1.2)/.5); const h=$('.head',el); if(h) h.style.opacity=cl(t/.4);};
K.statement=(el,t,abs,sid)=>{const s=$('.stmt',el); s.style.opacity=cl(t/.5); s.style.transform='translateY('+(6*(1-ez(t/.6)))+'%)'; const k=$('.kicker',el); if(k) k.style.opacity=cl(t/.3);
  $$('.chips div',el).forEach((c,i)=>{const st=seg(sid,c.dataset.key); const p=st!=null?ez((abs-st)/.5):ez((t-1-i*.4)/.5); c.style.opacity=p;});};
K.question=(el,t,abs,sid)=>{$('.q',el).style.opacity=cl(t/.4); const rv=seg(sid,'reveal'); const shown=rv!=null&&abs>=rv;
  $$('.opt',el).forEach((o,i)=>{o.style.opacity=ez((t-.4-i*.3)/.4); o.classList.toggle('ok',shown&&o.dataset.ok==='1'); o.classList.toggle('dim',shown&&o.dataset.ok!=='1'&&el.querySelector('.opt[data-ok="1"]')); $('.rv',o).style.opacity=shown?1:0;});
  const tm=$('.timer i',el); if(tm){const st=(TL.scenes.find(s=>s.scene===sid)||{}).start||0; const end=rv!=null?rv:st+5; tm.style.width=(100*(1-cl((abs-st-1)/Math.max(1,end-st-1))))+'%';}};
K.clues=(el,t,abs,sid)=>{reveal(el,'.clue',sid,t,abs,1.2,.4); const rv=seg(sid,'reveal'); const p=rv!=null?ez((abs-rv)/.6):0; $('.ans',el).style.opacity=p; $('.ans',el).style.transform='scale('+(.8+.2*ezb((abs-(rv||0))/.6))+')'; $('.mystery',el).style.display=p>.01?'none':'block'; const h=$('.head',el); if(h) h.style.opacity=cl(t/.4);};
K.court=(el,t)=>{$$('[data-z]',el).forEach((z,i)=>{z.style.opacity=ez((t-.2-i*.12)/.5);}); $$('text',el).forEach(x=>x.style.opacity=cl((t-1.2)/.5)); const h=$('.head',el); if(h) h.style.opacity=cl(t/.4);};
K.split=(el,t,abs,sid)=>{reveal(el,'.sr',sid,t,abs,.6,.4); $$('.sr',el).forEach(r=>{r.style.transform='none'; $$('i',r).forEach(i=>i.style.width=(r._p*+i.dataset.w)+'%');}); const h=$('.head',el); if(h) h.style.opacity=cl(t/.4);};
K.outro=(el,t)=>{R.outro(el,t); const q=$('.oq',el); if(q) q.style.opacity=cl((t-.6)/.4);};
`;

export function buildPlanPage({ story, timeline, cues, captions = true }) {
  const scenes = story.plan.map(s => {
    if (!SCENES[s.kind]) throw new Error(`unknown scene kind "${s.kind}" in ${story.id}`);
    const cls = s.kind === 'outro' ? 'scene outro' : 'scene';
    return `<section class="${cls}" data-scene="${esc(s.id)}" data-kind="${s.kind}">${SCENES[s.kind](s)}</section>`;
  }).join('\n');
  // the base runtime dispatches by scene name; for plan pages we dispatch by kind
  const theme = THEMES[story.theme] || THEMES.classic;
  return `<!doctype html><html lang="${esc(story.lang || 'en')}"><head><meta charset="utf-8"><style>${CSS()}${KIT_CSS}:root{--acc:${theme.acc};--acc2:${theme.acc2}}</style></head><body>
<div id="bg"></div>${court()}<div id="prog"></div><div class="brand">BASKETBALL<i>STATS</i></div>
${scenes}
<div id="cap"><div></div></div>
<script>const TL=${JSON.stringify(timeline)};const CUES=${JSON.stringify(captions ? cues : [])};${PLAN_RUNTIME()}</script></body></html>`;
}

import { RUNTIME } from './page.mjs';
const PLAN_RUNTIME = () => RUNTIME
  .replace("window.setT=t=>{", () => `${KIT_RUNTIME}\nwindow.setT=t=>{`) // function form: no "$$" substitution
  .replace("if(best&&R[best.scene]) R[best.scene](el,t-(best===blocks[0]?best.start:best.start-1.5),t);",
    () => "if(best){const fn=K[el.dataset.kind]; if(fn) fn(el,t-(best===blocks[0]?best.start:best.start-1.5),t,el.dataset.scene);}");
