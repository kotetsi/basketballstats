// Κάρτα «Στατιστικό της ημέρας» για Instagram/Facebook (1080×1350, 4:5), στο ίδιο στιλ με τις κάρτες των picks.
// Χωρίς σημείο και αποδόσεις: είναι περιεχόμενο μόνο με στατιστικά (κατάλληλο και για TikTok).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * s = { team: [όνομα, χρώμα], player, big, bigLabel, line, bars: [[ετικέτα, τιμή]], foot }
 */
export function statCardHtml(s) {
  const col = s.team?.[1] || '#e4572e';
  const max = Math.max(...(s.bars || []).map(b => b[1]), 1);
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;background:#1d2331;color:#fff;font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;overflow:hidden;display:flex;flex-direction:column;padding:80px 80px 60px;position:relative}
.bar{position:absolute;left:0;right:0;top:0;height:18px;background:${col}}
.top{display:flex;justify-content:space-between;align-items:center}.brand{font-size:46px;font-weight:800;letter-spacing:1px}.brand i{font-style:normal;color:#e4572e}
.tag{background:#e4572e;border-radius:40px;padding:12px 26px;font-size:28px;font-weight:700}
.who{margin-top:80px;font-size:36px;color:#aeb6c8}.player{margin-top:14px;font-size:78px;font-weight:800;line-height:1.05}
.big{margin-top:46px;display:flex;align-items:baseline;gap:28px}.big b{font-size:220px;line-height:.9;color:${col};font-weight:800;text-shadow:0 0 1px #fff}.big span{font-size:48px;font-weight:700;line-height:1.15}
.line{margin-top:40px;font-size:38px;color:#cfd5e2;line-height:1.35}
.bars{margin-top:50px;display:flex;gap:22px;align-items:flex-end;height:230px}
.bars div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.bars i{display:block;width:100%;background:#e4572e;border-radius:14px 14px 0 0}.bars em{font-style:normal;font-size:40px;font-weight:800;margin-bottom:10px}.bars small{margin-top:12px;font-size:26px;color:#aeb6c8}
.foot{margin-top:auto}.site{font-size:38px;font-weight:700}.note{margin-top:14px;font-size:28px;color:#aeb6c8;line-height:1.35}
</style></head><body><div class="bar"></div>
<div class="top"><div class="brand">BASKETBALL<i>STATS</i></div><div class="tag">ΣΤΑΤΙΣΤΙΚΟ ΤΗΣ ΗΜΕΡΑΣ</div></div>
<div class="who">${esc(s.who)}</div><div class="player">${esc(s.player)}</div>
<div class="big"><b>${esc(s.big)}</b><span>${s.bigLabel}</span></div>
<div class="line">${s.line}</div>
${s.bars?.length ? `<div class="bars">${s.bars.map(([l, v]) => `<div><em>${esc(v)}</em><i style="height:${Math.round(150 * v / max)}px"></i><small>${esc(l)}</small></div>`).join('')}</div>` : ''}
<div class="foot"><div class="site">basketballstats.eu</div><div class="note">${esc(s.foot || 'Επίσημα στατιστικά EuroLeague')}</div></div></body></html>`;
}

/**
 * Κάθετη έκδοση 1080×1920 (Reel / Story) με κίνηση. Το window.setT(t) (t σε δευτερόλεπτα) ζωγραφίζει το καρέ τη στιγμή t,
 * ώστε να βγαίνουν καρέ ένα-ένα με screenshot και μετά MP4 με ffmpeg. Διάρκεια: STAT_VIDEO_SECS.
 */
export const STAT_VIDEO_SECS = 9;
export function statStoryHtml(s) {
  const col = s.team?.[1] || '#e4572e';
  const bars = s.bars || [], max = Math.max(...bars.map(b => b[1]), 1);
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1920px;background:#1d2331;color:#fff;font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;overflow:hidden;position:relative}
.wrap{position:absolute;inset:0;padding:190px 80px 260px;display:flex;flex-direction:column}
.bar{position:absolute;left:0;top:0;height:22px;background:${col}}
.brand{font-size:52px;font-weight:800;letter-spacing:1px}.brand i{font-style:normal;color:#e4572e}
.tag{display:inline-block;margin-top:30px;background:#e4572e;border-radius:44px;padding:14px 30px;font-size:34px;font-weight:700}
.who{margin-top:80px;font-size:40px;color:#aeb6c8}.player{margin-top:16px;font-size:96px;font-weight:800;line-height:1.05}
.big{margin-top:40px;display:flex;align-items:baseline;gap:30px}.big b{font-size:300px;line-height:.85;color:${col};font-weight:800}.big span{font-size:58px;font-weight:700;line-height:1.15}
.line{margin-top:44px;font-size:46px;color:#cfd5e2;line-height:1.35}
.bars{margin-top:50px;display:flex;gap:24px;align-items:flex-end;height:330px}
.bars div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.bars i{display:block;width:100%;background:#e4572e;border-radius:16px 16px 0 0}.bars em{font-style:normal;font-size:50px;font-weight:800;margin-bottom:12px}.bars small{margin-top:14px;font-size:30px;color:#aeb6c8;text-align:center}
.foot{margin-top:auto;padding-top:60px}.site{font-size:50px;font-weight:700}.note{margin-top:14px;font-size:32px;color:#aeb6c8}
.f{opacity:0}
</style></head><body><div class="bar" id="bar"></div><div class="wrap">
<div class="f" id="hd"><div class="brand">BASKETBALL<i>STATS</i></div><div class="tag">📊 ΣΤΑΤΙΣΤΙΚΟ ΤΗΣ ΗΜΕΡΑΣ</div></div>
<div class="f" id="pl"><div class="who">${esc(s.who)}</div><div class="player">${esc(s.player)}</div></div>
<div class="big f" id="bg"><b id="num">0</b><span>${s.bigLabel}</span></div>
<div class="line f" id="ln">${s.line}</div>
${bars.length ? `<div class="bars">${bars.map(([l, v], k) => `<div><em class="f" id="e${k}">${esc(v)}</em><i id="b${k}" style="height:0"></i><small class="f" id="s${k}">${esc(l)}</small></div>`).join('')}</div>` : ''}
<div class="foot f" id="ft"><div class="site">basketballstats.eu</div><div class="note">${esc(s.foot || 'Επίσημα στατιστικά EuroLeague')}</div></div>
</div><script>
const BIG=${JSON.stringify(Number(s.big) || 0)}, BIGS=${JSON.stringify(String(s.big))}, V=${JSON.stringify(bars.map(b => b[1]))}, MAX=${max};
const $=id=>document.getElementById(id), cl=x=>Math.max(0,Math.min(1,x)), ez=x=>1-Math.pow(1-cl(x),3);
const fade=(id,t0,t,d=.5)=>{const e=$(id); if(!e) return; const p=ez((t-t0)/d); e.style.opacity=p; e.style.transform='translateY('+(30*(1-p))+'px)';};
window.setT=t=>{
  $('bar').style.width=(100*ez(t/.8))+'%';
  fade('hd',.1,t); fade('pl',.6,t); fade('bg',1.2,t);
  $('num').textContent=BIG?Math.round(BIG*ez((t-1.2)/1.2)):BIGS;
  fade('ln',2.4,t,.7);
  V.forEach((v,k)=>{const t0=3.4+k*.45,p=ez((t-t0)/.6); $('b'+k).style.height=Math.round(220*v/MAX*p)+'px'; fade('e'+k,t0+.3,t,.4); fade('s'+k,t0,t,.4);});
  fade('ft',3.4+V.length*.45+.4,t,.6);
};
setT(0);
</script></body></html>`;
}
