// Κοινά για τα «data posts» (EuroLeague: data-posts.mjs, GBL: data-posts-gbl.mjs): η κάρτα 1080×1350 και μορφοποίηση αριθμών.
export const f1 = v => v.toFixed(1).replace('.', ','), pc = v => (100 * v).toFixed(1).replace('.', ',') + '%', sg = v => (v > 0 ? '+' : v < 0 ? '−' : '') + f1(Math.abs(v));
export const vis = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return '#e4572e'; const n = parseInt(m[1], 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]; return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 70 ? '#' + m[1] : '#e4572e'; };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** k = { col, tag, kicker, title, sub, body (html), note } */
export function card(k) {
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;background:#1d2331;color:#fff;font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;overflow:hidden;display:flex;flex-direction:column;padding:76px 72px 56px;position:relative}
.bar{position:absolute;left:0;right:0;top:0;height:18px;background:${k.col || '#e4572e'}}
.top{display:flex;justify-content:space-between;align-items:center}.brand{font-size:40px;font-weight:800;letter-spacing:1px}.brand i{font-style:normal;color:#e4572e}
.tag{background:#e4572e;border-radius:40px;padding:10px 24px;font-size:24px;font-weight:700;letter-spacing:.5px}
.kick{margin-top:58px;font-size:28px;font-weight:700;color:#e4572e;letter-spacing:2px;text-transform:uppercase}
h1{margin-top:14px;font-size:70px;line-height:1.05;font-weight:800}.sub{margin-top:16px;font-size:32px;color:#aeb6c8;line-height:1.3}
.body{margin-top:44px;flex:1;display:flex;flex-direction:column}
.foot{display:flex;justify-content:space-between;align-items:flex-end;gap:30px;margin-top:24px}.site{font-size:34px;font-weight:700;white-space:nowrap}.note{font-size:22px;color:#8f98ad;line-height:1.35;text-align:right}
table{width:100%;border-collapse:collapse}td{padding:15px 10px;font-size:32px;border-bottom:1px solid #2e3648}td.n{text-align:right;font-weight:800;white-space:nowrap}
.rk{display:inline-block;min-width:76px;text-align:center;border-radius:10px;padding:4px 10px;font-size:26px;font-weight:800}
.trk{height:16px;background:#2e3648;border-radius:8px;overflow:hidden;width:220px}.trk i{display:block;height:100%;border-radius:8px}
.muted{color:#aeb6c8}.or{color:#e4572e}.gr{color:#3ecf8e}.rd{color:#ff6b6b}
</style></head><body><div class="bar"></div>
<div class="top"><div class="brand">BASKETBALL<i>STATS</i></div><div class="tag">${esc(k.tag)}</div></div>
<div class="kick">${esc(k.kicker)}</div><h1>${k.title}</h1>${k.sub ? `<div class="sub">${k.sub}</div>` : ''}
<div class="body">${k.body}</div>
<div class="foot"><div class="site">basketballstats.eu</div><div class="note">${k.note || 'Επίσημα στατιστικά EuroLeague'}</div></div></body></html>`;
}
