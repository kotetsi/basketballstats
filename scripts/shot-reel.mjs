// Reel «Όλα τα σουτ του Χ απόψε» (1080×1920): το γήπεδο του site και τα σουτ ενός παίκτη να εμφανίζονται ένα-ένα,
// με τη σειρά που έγιναν (πράσινο = εύστοχο, κόκκινο × = άστοχο) και μετρητή ευστοχίας. Μόνο επίσημα δεδομένα σουτ.
// Το window.setT(t) ζωγραφίζει το καρέ τη στιγμή t (δευτερόλεπτα), όπως στο stat-card.mjs.
import { W, Y0, Y1, sy, courtSVG } from '../src/shots/court.mjs';

export const SHOT_REEL_SECS = 12;
const vis = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return '#e4572e'; const n = parseInt(m[1], 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]; return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 70 ? '#' + m[1] : '#e4572e'; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Σειρά σουτ μέσα στον αγώνα: περίοδος, μετά ρολόι που μένει (φθίνον). */
export const shotOrder = (a, b) => a.q - b.q || clk(b.clk) - clk(a.clk);
const clk = s => { const [m, x] = String(s || '0:0').split(':'); return (+m || 0) * 60 + (+x || 0); };

/**
 * o = { team: [όνομα, χρώμα], player, who, line, shots: [{ x, y, made, three }], foot }
 * Τα σουτ χωρίς συντεταγμένες (x/y null) δεν σχεδιάζονται αλλά μετρούν στον μετρητή.
 */
export function shotReelHtml(o) {
  const col = vis(o.team?.[1]);
  const S = o.shots.map(s => ({ x: s.x, y: s.y == null ? null : sy(s.y), m: s.made ? 1 : 0, t: s.three ? 1 : 0 }));
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1920px;background:#1d2331;color:#fff;font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;overflow:hidden;position:relative}
.wrap{position:absolute;inset:0;padding:170px 80px 230px;display:flex;flex-direction:column}
.bar{position:absolute;left:0;top:0;height:22px;background:${col}}
.brand{font-size:52px;font-weight:800;letter-spacing:1px}.brand i{font-style:normal;color:#e4572e}
.tag{display:inline-block;margin-top:26px;background:#e4572e;border-radius:44px;padding:14px 30px;font-size:34px;font-weight:700}
.who{margin-top:56px;font-size:38px;color:#aeb6c8}.player{margin-top:12px;font-size:90px;font-weight:800;line-height:1.05}
svg{display:block;margin:44px auto 0;width:920px;height:${Math.round(920 * (Y1 - Y0) / (2 * W))}px}
.court rect,.court path,.court circle,.court line{stroke:#5d6782;stroke-width:6;fill:none}.court .rimc{stroke:#e4572e;stroke-width:8}
.mk{fill:#2fbf71;stroke:#1d2331;stroke-width:5}.ms{stroke:#e5484d;stroke-width:11;stroke-linecap:round}
.cnt{margin-top:40px;display:flex;gap:26px}.cnt div{flex:1;background:#262d3f;border-radius:22px;padding:22px 10px;text-align:center}
.cnt b{display:block;font-size:66px;font-weight:800;font-variant-numeric:tabular-nums}.cnt span{font-size:28px;color:#aeb6c8}
.line{margin-top:34px;font-size:40px;color:#cfd5e2;line-height:1.35}
.foot{margin-top:auto;padding-top:40px}.site{font-size:50px;font-weight:700}.note{margin-top:12px;font-size:30px;color:#aeb6c8}
.lg{display:flex;gap:34px;margin-top:22px;font-size:30px;color:#aeb6c8;justify-content:center}.lg i{display:inline-block;width:26px;height:26px;border-radius:50%;background:#2fbf71;margin-right:10px;vertical-align:-4px}.lg i.x{background:none;border:0;color:#e5484d;font-style:normal;font-weight:800;width:auto;height:auto;font-size:34px;vertical-align:-2px}
.f{opacity:0}
</style></head><body><div class="bar" id="bar"></div><div class="wrap">
<div class="f" id="hd"><div class="brand">BASKETBALL<i>STATS</i></div><div class="tag">🎯 ΟΛΑ ΤΑ ΣΟΥΤ ΤΟΥ</div></div>
<div class="f" id="pl"><div class="who">${esc(o.who)}</div><div class="player">${esc(o.player)}</div></div>
<svg class="f" id="ct" viewBox="${-W} ${Y0} ${2 * W} ${Y1 - Y0}">${courtSVG()}<g id="dots"></g></svg>
<div class="lg f" id="lg"><span><i></i>Εύστοχο</span><span><i class="x">✕</i> Άστοχο</span></div>
<div class="cnt f" id="cn"><div><b id="fg">0/0</b><span>Σουτ εντός παιδιάς</span></div><div><b id="tp">0/0</b><span>Τρίποντα</span></div><div><b id="pt">0</b><span>Πόντοι από σουτ</span></div></div>
<div class="line f" id="ln">${o.line}</div>
<div class="foot f" id="ft"><div class="site">basketballstats.eu</div><div class="note">${esc(o.foot || 'Επίσημα δεδομένα σουτ EuroLeague')}</div></div>
</div><script>
const S=${JSON.stringify(S)}, T0=1.6, T1=${SHOT_REEL_SECS - 3.2};
const $=id=>document.getElementById(id), cl=x=>Math.max(0,Math.min(1,x)), ez=x=>1-Math.pow(1-cl(x),3);
const fade=(id,t0,t,d=.5)=>{const e=$(id); if(!e) return; const p=ez((t-t0)/d); e.style.opacity=p; e.style.transform='translateY('+(30*(1-p))+'px)';};
const step=S.length>1?(T1-T0)/(S.length-1):0;
window.setT=t=>{
  $('bar').style.width=(100*ez(t/.8))+'%';
  fade('hd',.1,t); fade('pl',.5,t); fade('ct',.9,t,.6); fade('lg',1.1,t); fade('cn',1.2,t);
  let h='',fm=0,fa=0,tm=0,ta=0,p=0;
  S.forEach((s,i)=>{const t0=T0+i*step; if(t<t0) return; const k=ez((t-t0)/.35), pop=1+.6*(1-k)*(k>0?1:0);
    fa++; if(s.t) ta++; if(s.m){fm++; if(s.t) tm++; p+=s.t?3:2;}
    if(s.y==null) return;
    if(s.m) h+='<circle cx="'+s.x+'" cy="'+s.y+'" r="'+(30*pop)+'" class="mk" opacity="'+k+'"/>';
    else {const r=22*pop; h+='<g class="ms" opacity="'+k+'"><line x1="'+(s.x-r)+'" y1="'+(s.y-r)+'" x2="'+(s.x+r)+'" y2="'+(s.y+r)+'"/><line x1="'+(s.x-r)+'" y1="'+(s.y+r)+'" x2="'+(s.x+r)+'" y2="'+(s.y-r)+'"/></g>';}
  });
  $('dots').innerHTML=h; $('fg').textContent=fm+'/'+fa; $('tp').textContent=tm+'/'+ta; $('pt').textContent=p;
  fade('ln',T1+.5,t,.7); fade('ft',T1+1.1,t,.6);
};
setT(0);
</script></body></html>`;
}
