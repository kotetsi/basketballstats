// Τρία Reels ανά αγωνιστική (1080×1920), στο ίδιο στιλ με το stat-card.mjs / shot-reel.mjs.
// Όλα ζωγραφίζουν το καρέ τη στιγμή t με window.setT(t), ώστε να βγαίνει MP4 καρέ-καρέ (daily-social.mjs → renderVideo).
//   previewHtml  «Ποιος είναι φαβορί;»: όλοι οι αγώνες της αγωνιστικής με τις πιθανότητες νίκης του μοντέλου
//   top5Html     «Το Top 5 της αγωνιστικής»: αντίστροφη μέτρηση 5→1 με βάση το PIR
//   raceHtml     «Η κούρσα των σκόρερ»: bar race των συνολικών πόντων, αγωνιστική προς αγωνιστική
// Μόνο επίσημα δεδομένα EuroLeague και οι πιθανότητες του δικού μας μοντέλου· καμία απόδοση στοιχηματικής.

const vis = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return '#e4572e'; const n = parseInt(m[1], 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]; return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 70 ? '#' + m[1] : '#e4572e'; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const BASE_CSS = `*{box-sizing:border-box;margin:0}body{width:1080px;height:1920px;background:#1d2331;color:#fff;font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;overflow:hidden;position:relative}
.wrap{position:absolute;inset:0;padding:150px 70px 220px;display:flex;flex-direction:column}
.bar{position:absolute;left:0;top:0;height:22px;background:#e4572e}
.brand{font-size:50px;font-weight:800;letter-spacing:1px}.brand i{font-style:normal;color:#e4572e}
.tag{display:inline-block;margin-top:24px;background:#e4572e;border-radius:44px;padding:14px 30px;font-size:34px;font-weight:700}
.title{margin-top:30px;font-size:76px;font-weight:800;line-height:1.05}
.foot{margin-top:auto;padding-top:30px}.site{font-size:50px;font-weight:700}.note{margin-top:10px;font-size:29px;color:#aeb6c8;line-height:1.3}
.f{opacity:0}`;
const BASE_JS = `const $=id=>document.getElementById(id), cl=x=>Math.max(0,Math.min(1,x)), ez=x=>1-Math.pow(1-cl(x),3);
const fade=(id,t0,t,d=.5)=>{const e=typeof id==='string'?$(id):id; if(!e) return; const p=ez((t-t0)/d); e.style.opacity=p; e.style.transform='translateY('+(30*(1-p))+'px)';};`;
const head = (tag, title) => `<div class="f" id="hd"><div class="brand">BASKETBALL<i>STATS</i></div><div class="tag">${tag}</div></div><div class="title f" id="tt">${title}</div>`;
const foot = note => `<div class="foot f" id="ft"><div class="site">basketballstats.eu</div><div class="note">${esc(note)}</div></div>`;

// ---------------------------------------------------------------- 1. Προεπισκόπηση αγωνιστικής
/** o = { round, days: [{ label, games: [{ h: [όνομα, χρώμα], a: [...], time, ph (0–1 ή null) }] }] } */
export const previewSecs = o => Math.min(16, Math.max(9, 3.2 + 0.75 * o.days.reduce((s, d) => s + d.games.length, 0) + 3));
export function previewHtml(o) {
  const n = o.days.reduce((s, d) => s + d.games.length, 0), secs = previewSecs(o);
  const rowH = n > 8 ? 104 : n > 6 ? 120 : 136, fs = n > 8 ? 34 : 38;
  let i = 0;
  const rows = o.days.map(d => `<div class="day f" data-i="${i}">${esc(d.label)}</div>` + d.games.map(g => {
    const ph = g.ph == null ? null : Math.round(g.ph * 100);
    const fav = ph == null ? '' : ph >= 50 ? 'h' : 'a', hc = fav === 'a' ? '#5d6782' : '#e4572e', ac = fav === 'a' ? '#e4572e' : '#5d6782';
    return `<div class="g f" data-i="${i++}"><div class="tm"><span class="${fav === 'h' ? 'fav' : ''}">${esc(g.h[0])}</span><em>${esc(g.time)}</em><span class="r ${fav === 'a' ? 'fav' : ''}">${esc(g.a[0])}</span></div>
<div class="pb"><b class="ph">${ph == null ? '' : ph + '%'}</b><div class="tr"><i class="hb" style="background:${hc}" data-w="${ph ?? 50}"></i><i class="ab" style="background:${ac}" data-w="${ph == null ? 50 : 100 - ph}"></i></div><b class="pa">${ph == null ? '' : 100 - ph + '%'}</b></div></div>`;
  }).join('')).join('');
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>${BASE_CSS}
.list{margin-top:34px;display:flex;flex-direction:column}
.day{font-size:30px;color:#aeb6c8;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px}
.g{height:${rowH}px;display:flex;flex-direction:column;justify-content:center;border-bottom:2px solid #2b3347}
.tm{display:flex;align-items:baseline;font-size:${fs}px;font-weight:700}.tm span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#cfd5e2}.tm span.r{text-align:right}.tm span.fav{color:#fff}
.tm em{font-style:normal;font-size:26px;color:#8d96ab;padding:0 18px}
.pb{display:flex;align-items:center;gap:16px;margin-top:10px}.pb b{width:86px;font-size:32px;font-weight:800;font-variant-numeric:tabular-nums}.pb b.pa{text-align:right}
.tr{flex:1;height:20px;border-radius:10px;background:#2b3347;display:flex;overflow:hidden;gap:4px}.tr i{display:block;height:100%;width:0}
</style></head><body><div class="bar" id="bar"></div><div class="wrap">
${head(`🔮 ${o.round}η ΑΓΩΝΙΣΤΙΚΗ`, 'Ποιος είναι φαβορί;')}
<div class="list">${rows}</div>
${foot('Πιθανότητες νίκης από το μοντέλο του BasketballStats · όχι εγγύηση αποτελέσματος')}
</div><script>${BASE_JS}
const N=${n}, T0=1.6, ST=0.75, rows=[...document.querySelectorAll('.g')], days=[...document.querySelectorAll('.day')];
window.setT=t=>{
  $('bar').style.width=(100*ez(t/.8))+'%'; fade('hd',.1,t); fade('tt',.5,t);
  days.forEach(d=>fade(d,T0+(+d.dataset.i)*ST-.2,t,.4));
  rows.forEach((r,i)=>{const t0=T0+i*ST; fade(r,t0,t,.4); const k=ez((t-t0-.25)/.8);
    r.querySelectorAll('.tr i').forEach(b=>b.style.width=(k*b.dataset.w)+'%');
    r.querySelectorAll('.pb b').forEach(b=>b.style.opacity=k);});
  fade('ft',${secs - 2.6},t,.6);
};
setT(0);</script></body></html>`;
}

// ---------------------------------------------------------------- 2. Top 5 αγωνιστικής
/** o = { round, players: [{ name, team: [όνομα, χρώμα], pir, line, opp }] } (σειρά 1→5) */
export const TOP5_SECS = 17;
export function top5Html(o) {
  const P = o.players.slice(0, 5), S0 = 1.8, D = 2.3, SUM = S0 + 5 * D;
  const cards = P.map((p, i) => ({ ...p, rank: i + 1 })).reverse().map((p, k) => `<div class="card" id="c${k}" style="--c:${vis(p.team[1])}">
<div class="rk">#${p.rank}</div><div class="nm">${esc(p.name)}</div><div class="tn">${esc(p.team[0])}${p.opp ? ` · κόντρα ${esc(p.opp)}` : ''}</div>
<div class="pir"><b data-v="${p.pir}">0</b><span>PIR</span></div><div class="ln">${esc(p.line)}</div></div>`).join('');
  const sum = P.map((p, i) => `<div class="sr f" id="s${i}" style="--c:${vis(p.team[1])}"><b>${i + 1}</b><span>${esc(p.name)}<small>${esc(p.team[0])}</small></span><em>${p.pir}</em></div>`).join('');
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>${BASE_CSS}
.stage{position:relative;flex:1;margin-top:20px}
.card{position:absolute;inset:0;opacity:0;display:flex;flex-direction:column;justify-content:center;border-left:16px solid var(--c);padding-left:44px}
.rk{font-size:150px;font-weight:800;color:var(--c);line-height:1}.nm{margin-top:20px;font-size:92px;font-weight:800;line-height:1.05}.tn{margin-top:16px;font-size:40px;color:#aeb6c8}
.pir{margin-top:50px;display:flex;align-items:baseline;gap:24px}.pir b{font-size:230px;font-weight:800;line-height:.85;font-variant-numeric:tabular-nums}.pir span{font-size:60px;font-weight:700;color:#aeb6c8}
.ln{margin-top:40px;font-size:44px;color:#cfd5e2}
.sum{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:26px}
.sr{display:flex;align-items:center;gap:30px;background:#262d3f;border-radius:24px;padding:26px 34px;border-left:12px solid var(--c)}
.sr b{font-size:64px;font-weight:800;width:60px;color:var(--c)}.sr span{flex:1;font-size:46px;font-weight:800;line-height:1.1}.sr small{display:block;font-size:30px;font-weight:400;color:#aeb6c8;margin-top:6px}.sr em{font-style:normal;font-size:64px;font-weight:800}
</style></head><body><div class="bar" id="bar"></div><div class="wrap">
${head(`🏆 ${o.round}η ΑΓΩΝΙΣΤΙΚΗ`, 'Το Top 5 της αγωνιστικής')}
<div class="stage">${cards}<div class="sum">${sum}</div></div>
${foot('Κατάταξη με βάση το PIR · επίσημα στατιστικά EuroLeague')}
</div><script>${BASE_JS}
const S0=${S0}, D=${D}, SUM=${SUM};
window.setT=t=>{
  $('bar').style.width=(100*ez(t/.8))+'%'; fade('hd',.1,t); fade('tt',.5,t);
  for(let k=0;k<5;k++){const c=$('c'+k); if(!c) continue; const a=S0+k*D, inn=ez((t-a)/.45), out=ez((t-(a+D-.35))/.35);
    c.style.opacity=inn*(1-out); c.style.transform='translateX('+(120*(1-inn)-120*out)+'px)';
    const b=c.querySelector('.pir b'); b.textContent=Math.round(b.dataset.v*ez((t-a-.2)/.9));}
  for(let i=4;i>=0;i--) fade('s'+i,SUM+(4-i)*.22,t,.45);
  fade('ft',SUM+1.2,t,.6);
};
setT(0);</script></body></html>`;
}

// ---------------------------------------------------------------- 3. Bar race σκόρερ
/** o = { round, label, frames: [{ r, v: { key: τιμή } }], who: { key: [όνομα, ομάδα, χρώμα] }, top } (frames από την 1η αγωνιστική) */
export const raceSecs = o => Math.min(24, 2.4 + o.frames.length * 1.05 + 3.4);
export function raceHtml(o) {
  const top = o.top || 10, secs = raceSecs(o);
  const who = Object.fromEntries(Object.entries(o.who).map(([k, [n, t, c]]) => [k, [n, t, vis(c)]]));
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>${BASE_CSS}
.rd{margin-top:18px;font-size:44px;color:#aeb6c8;font-weight:700;font-variant-numeric:tabular-nums}
.chart{position:relative;margin-top:34px;height:${top * 104}px;overflow:hidden}
.row{position:absolute;left:0;right:0;height:88px;display:flex;align-items:center}
.row i{display:block;height:100%;border-radius:0 16px 16px 0;min-width:8px}
.row .lb{position:absolute;left:22px;top:0;height:100%;display:flex;flex-direction:column;justify-content:center;font-size:34px;font-weight:800;text-shadow:0 2px 6px rgba(0,0,0,.6);white-space:nowrap}
.row .lb small{font-size:24px;font-weight:400;color:#e8ebf2}
.row em{font-style:normal;font-size:38px;font-weight:800;margin-left:16px;font-variant-numeric:tabular-nums}
</style></head><body><div class="bar" id="bar"></div><div class="wrap">
${head('🏁 Η ΚΟΥΡΣΑ', esc(o.label))}
<div class="rd f" id="rd"></div>
<div class="chart f" id="ch"></div>
${foot('Σύνολο πόντων στη σεζόν · επίσημα στατιστικά EuroLeague')}
</div><script>${BASE_JS}
const F=${JSON.stringify(o.frames)}, W=${JSON.stringify(who)}, TOP=${top}, T0=2.0, ST=1.05, MAXW=780;
const ch=$('ch'), els={};
const rowOf=k=>{ if(els[k]) return els[k]; const d=document.createElement('div'); d.className='row'; d.innerHTML='<i style="background:'+W[k][2]+'"></i><div class="lb">'+W[k][0]+'<small>'+W[k][1]+'</small></div><em></em>'; ch.appendChild(d); return els[k]=d; };
const at=(f,k)=>F[f].v[k]||0, KEYS=[...new Set(F.flatMap(f=>Object.keys(f.v)))];
const R=F.map((_,f)=>{const m={}; KEYS.slice().sort((a,b)=>at(f,b)-at(f,a)||a.localeCompare(b)).forEach((k,i)=>m[k]=i); return m;});
window.setT=t=>{
  $('bar').style.width=(100*ez(t/.8))+'%'; fade('hd',.1,t); fade('tt',.5,t); fade('rd',1.0,t); fade('ch',1.2,t,.6);
  const x=Math.max(0,Math.min(F.length-1,(t-T0)/ST)), f0=Math.floor(x), f1=Math.min(F.length-1,f0+1), p=ez((x-f0-.5)/.45);
  $('rd').textContent=F[p>.5?f1:f0].r+'η αγωνιστική';
  const cur=KEYS.map(k=>({k,v:at(f0,k)+(at(f1,k)-at(f0,k))*p,pos:R[f0][k]+(R[f1][k]-R[f0][k])*p}));
  const mx=Math.max(1,...cur.map(c=>c.v));
  Object.values(els).forEach(e=>e.style.display='none');
  cur.forEach(c=>{ if(c.pos>=TOP) return; const e=rowOf(c.k); e.style.display='flex'; e.style.top=(c.pos*104)+'px'; e.style.opacity=Math.max(0,Math.min(1,TOP-c.pos)); e.style.zIndex=String(100-Math.round(c.pos));
    e.querySelector('i').style.width=(MAXW*c.v/mx)+'px'; e.querySelector('em').textContent=Math.round(c.v); });
  fade('ft',${secs - 2.6},t,.6);
};
setT(0);</script></body></html>`;
}

// ---------------------------------------------------------------- 4. Η ομάδα του μοντέλου (Fantasy)
/** o = { round, target, floor, ceil, cost, budget, five: [card], sixth: card, bench: [card], coach: { team: [όνομα, χρώμα], opp, exp },
 *        card = { name, team: [όνομα, χρώμα], no, pos: 'G'|'F'|'C', price, proj, opp, home, cap } }
 *  Η πεντάδα μπαίνει στο παρκέ ένας-ένας (ο αρχηγός τελευταίος), μετά 6ος, πάγκος και προπονητής, σύνοψη και ερώτηση για σχόλια. */
export const TEAM_SECS = 26;
export function teamHtml(o) {
  const S0 = 3.2, D = 2.1, B0 = S0 + 5 * D + .3, SUMT = B0 + 3.2, CTA = SUMT + 3.6;
  const nf = x => String(x).replace('.', ',');
  const jersey = (c, no) => `<svg viewBox="0 0 100 100" class="js"><path d="M30 8 L42 8 Q50 18 58 8 L70 8 L88 22 L80 38 L72 33 L72 94 L28 94 L28 33 L20 38 L12 22 Z" fill="${c}" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/><text x="50" y="72" text-anchor="middle" font-size="34" font-weight="800" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width="1">${esc(no ?? '')}</text></svg>`;
  const card = (p, id, cls = '') => `<div class="pc f ${cls}${p.cap ? ' cap' : ''}" id="${id}" style="--c:${vis(p.team[1])}">${p.cap ? '<div class="cb">C</div>' : ''}
${jersey(vis(p.team[1]), p.no)}<div class="pn">${esc(p.name)}</div><div class="pm"><span class="pr">${nf(p.price.toFixed(1))}</span><span class="pj">≈${Math.round(p.proj)} PIR</span></div><div class="po">${p.home ? 'εντός' : 'εκτός'} · ${esc(p.opp)}</div></div>`;
  // σειρές στο παρκέ: ψηλοί πάνω, forwards στη μέση, guards κάτω (όπως στο παιχνίδι)
  const rows = ['C', 'F', 'G'].map(k => o.five.map((p, i) => ({ p, i })).filter(x => x.p.pos === k)).filter(r => r.length);
  const order = o.five.map((p, i) => i).sort((a, b) => (o.five[a].cap ? 1 : 0) - (o.five[b].cap ? 1 : 0));   // ο αρχηγός τελευταίος
  const say = o.five.map(p => `${p.name}${p.cap ? ': ο αρχηγός (×2)' : ''} · ${p.home ? 'εντός με' : 'εκτός με'} ${p.oppFull || p.opp}`);
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>${BASE_CSS}
.wrap{padding:110px 50px 120px}
.title{font-size:70px}
.hook{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:26px;background:radial-gradient(circle at 50% 45%,#2b3550,#1d2331 70%)}
.hook .k1{font-size:44px;font-weight:700;letter-spacing:6px;color:#f2b134}.hook .k2{font-size:128px;font-weight:800;line-height:1}.hook .k3{font-size:58px;font-weight:700;border:4px solid #f2b134;border-radius:22px;padding:14px 34px;color:#f2b134}
.court{position:relative;flex:none;margin-top:26px;height:960px;border-radius:30px;background:linear-gradient(#3a2a18,#24190f);border:4px solid rgba(242,177,52,.35);overflow:hidden}
.court:before{content:'';position:absolute;left:50%;top:-4px;width:380px;height:440px;transform:translateX(-50%);border:4px solid rgba(242,177,52,.35);border-top:none}
.court:after{content:'';position:absolute;left:50%;top:-560px;width:1000px;height:1100px;transform:translateX(-50%);border:4px solid rgba(242,177,52,.3);border-radius:50%}
.rw{position:absolute;left:0;right:0;display:flex;justify-content:center;gap:40px;z-index:2}
.pc{position:relative;width:290px;background:rgba(20,24,34,.88);border:3px solid var(--c);border-radius:26px;padding:16px 12px 18px;text-align:center}
.pc.cap{border-color:#f2b134;box-shadow:0 0 40px rgba(242,177,52,.55)}
.cb{position:absolute;right:-14px;top:-14px;width:64px;height:64px;border-radius:50%;background:#f2b134;color:#1d2331;font-size:40px;font-weight:800;display:flex;align-items:center;justify-content:center}
.js{width:92px;height:92px}.pn{font-size:38px;font-weight:800;line-height:1.05;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pm{margin-top:10px;display:flex;justify-content:center;gap:12px}.pm span{font-size:28px;font-weight:800;border-radius:30px;padding:5px 14px}.pr{background:#2e7d4f}.pj{background:#e4572e}
.po{margin-top:10px;font-size:26px;color:#cfd5e2}
.bn{display:flex;gap:16px;margin-top:26px}.bn .pc{width:auto;flex:1;padding:10px 6px 12px}.bn .js{width:70px;height:70px}.bn .pn{font-size:25px}.bn .pm span{font-size:20px;padding:3px 8px}.bn .po{font-size:19px}
.lb{position:absolute;left:8px;top:-18px;background:#f2b134;color:#1d2331;font-size:20px;font-weight:800;border-radius:12px;padding:2px 10px}
.co{border-style:dashed}
.say{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:3;background:rgba(29,35,49,.92);border:3px solid #f2b134;border-radius:40px;padding:14px 34px;font-size:34px;font-weight:700;color:#f2b134;white-space:nowrap}
.sm{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:24px;background:rgba(29,35,49,.94);border-radius:30px}
.sm .n{font-size:200px;font-weight:800;line-height:.9;color:#f2b134}.sm .u{font-size:46px;font-weight:700}.sm .r{font-size:36px;color:#aeb6c8}.sm .q{margin-top:30px;font-size:62px;font-weight:800;line-height:1.15}
.foot{padding-top:20px}
</style></head><body><div class="bar" id="bar"></div><div class="wrap">
${head(`EUROLEAGUE FANTASY · ${o.round}η ΑΓΩΝΙΣΤΙΚΗ`, 'Η ομάδα του μοντέλου')}
<div class="court" id="ct">
${rows.map((r, k) => `<div class="rw" style="top:${rows.length === 3 ? [24, 300, 576][k] : [110, 470][k]}px">${r.map(x => card(x.p, 'p' + x.i)).join('')}</div>`).join('')}
<div class="say" id="say"></div>
<div class="sm f" id="sm"><div class="u">Εκτίμηση μοντέλου</div><div class="n" data-v="${Math.round(o.target)}">0</div><div class="u">fantasy πόντοι</div><div class="r">εύρος ${Math.round(o.floor)}–${Math.round(o.ceil)} · κόστος ${nf(o.cost.toFixed(1))}/${o.budget} credits</div>
<div class="q">Μπορεί η δική σου<br>να τους περάσει;</div></div>
</div>
<div class="bn">${[o.sixth && card(o.sixth, 'b0').replace('<div class="pc', '<div class="pc').replace(/(<div class="pc[^>]*>)/, '$1<div class="lb">6ος</div>'), ...o.bench.map((p, i) => card(p, 'b' + (i + 1))),
  `<div class="pc f co" id="b9" style="--c:${vis(o.coach.team[1])}"><div class="lb">ΠΡΟΠ.</div>${jersey(vis(o.coach.team[1]), '')}<div class="pn">${esc(o.coach.team[0])}</div><div class="pm"><span class="pr">${nf(o.coach.price.toFixed(1))}</span></div><div class="po">${o.coach.home ? 'εντός' : 'εκτός'} · ${esc(o.coach.opp)}</div></div>`].filter(Boolean).join('')}</div>
${foot('Εκτιμήσεις του μοντέλου μας, όχι εγγύηση · όλη η ανάλυση στο basketballstats.eu/fantasy')}
</div>
<div class="hook" id="hk"><div class="k1">${o.round}η ΑΓΩΝΙΣΤΙΚΗ</div><div class="k2">Η ομάδα<br>του μοντέλου</div><div class="k3">${Math.round(o.target)} πόντοι;</div></div>
<script>${BASE_JS}
const S0=${S0}, D=${D}, B0=${B0}, SUMT=${SUMT}, CTA=${CTA}, ORD=${JSON.stringify(order)}, SAY=${JSON.stringify(say)}, CT=${JSON.stringify(`${Math.round(o.target)} πόντοι; Γράψε τη δική σου στα σχόλια`)};
window.setT=t=>{
  const h=$('hk'), ho=1-ez((t-2.3)/.6); h.style.opacity=ho; h.style.transform='scale('+(1+.08*ez(t/2.3))+')';
  $('bar').style.width=(100*ez((t-2.4)/.8))+'%'; fade('hd',2.5,t); fade('tt',2.7,t); fade('ct',2.8,t);
  let cur='';
  ORD.forEach((i,k)=>{const a=S0+k*D, e=$('p'+i), p=ez((t-a)/.45); e.style.opacity=p; e.style.transform='translateY('+(-80*(1-p))+'px) scale('+(1.25-.25*p)+')'; if(t>=a&&t<a+D) cur=SAY[i];});
  if(t>=CTA) cur=CT; const s=$('say'); s.textContent=cur; s.style.opacity=cur?1:0; s.style.fontSize=(t>=CTA?40:34)+'px';
  for(let k=0;k<6;k++) fade('b'+k,B0+k*.35,t,.4); fade('b9',B0+2.2,t,.4);
  const m=$('sm'); m.style.opacity=ez((t-SUMT)/.5)*(1-ez((t-CTA)/.5)); const n=m.querySelector('.n'); n.textContent=Math.round(n.dataset.v*ez((t-SUMT-.2)/1.2));
  fade('ft',B0+2.6,t,.6);
};
setT(0);</script></body></html>`;
}
