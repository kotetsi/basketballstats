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
