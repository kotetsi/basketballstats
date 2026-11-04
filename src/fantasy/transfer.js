// Fantasy Manager Tools · Transfer Market Analyzer: φίλτρα, ταξινόμηση και λεπτομέρειες παίκτη (sparklines)
const root = document.getElementById('tmApp');
if (root) init(root);

function spark(vals, { w = 220, h = 46, col = 'currentColor', lbl = '' } = {}) {
  const v = vals.filter(x => x != null);
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), rg = hi - lo || 1;
  const pts = vals.map((x, i) => `${(4 + (i * (w - 8)) / (vals.length - 1)).toFixed(1)},${(h - 6 - ((x - lo) / rg) * (h - 14)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="tmsp" role="img" aria-label="${lbl}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/><text x="4" y="10">${hi.toFixed(1)}</text><text x="4" y="${h - 1}">${lo.toFixed(1)}</text></svg>`;
}

function init(root) {
  const C = JSON.parse(document.getElementById('tmctx').textContent);
  const tb = root.querySelector('tbody'), rows = [...tb.querySelectorAll('tr.tmr')];
  const F = root.querySelector('#tmFilters');
  let sortK = 'vpc', dir = -1;
  const apply = () => {
    const f = Object.fromEntries(new FormData(F));
    const q = (f.q || '').trim().toLowerCase();
    let n = 0;
    for (const r of rows) {
      const d = r.dataset;
      const ok = (!f.pos || d.pos === f.pos) && (!f.team || d.team === f.team) && (!f.sig || d.sig === f.sig)
        && (!f.pmax || +d.price <= +f.pmax) && (!f.pmin || +d.price >= +f.pmin) && (!q || d.n.toLowerCase().includes(q))
        && (!f.avail || d.status === 'playing')
        && (!f.ppmin || +d.pp >= +f.ppmin) && (!f.vmin || +d.vpc >= +f.vmin) && (!f.status || d.status === f.status)
        && (!f.stmin || (d.start !== '' && 100 * +d.start >= +f.stmin)) && (!f.mmin || +d.m10 >= +f.mmin) && (!f.gmin || +d.gp >= +f.gmin)
        && (!f.sched || (f.sched === 'easy' ? +d.dif <= 2.5 : f.sched === 'hard' ? +d.dif >= 3.5 : +d.dif > 2.5 && +d.dif < 3.5));
      r.hidden = !ok; const det = r.nextElementSibling; if (det?.classList.contains('tmd') && !ok) det.hidden = true;
      if (ok) n++;
    }
    root.querySelector('#tmCount').textContent = n;
  };
  const sort = () => {
    const key = r => { const v = r.dataset[sortK]; return isNaN(+v) || v === '' ? v : +v; };
    rows.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    for (const r of rows) { tb.append(r); const det = tb.querySelector(`tr.tmd[data-for="${r.dataset.c}"]`); if (det) tb.append(det); }
    root.querySelectorAll('th[data-k]').forEach(th => th.setAttribute('aria-sort', th.dataset.k === sortK ? (dir > 0 ? 'ascending' : 'descending') : 'none'));
  };
  root.querySelectorAll('th[data-k]').forEach(th => th.addEventListener('click', () => { const k = th.dataset.k; dir = k === sortK ? -dir : (k === 'n' ? 1 : -1); sortK = k; sort(); }));
  F.addEventListener('input', apply);
  // λεπτομέρειες
  tb.addEventListener('click', e => {
    const b = e.target.closest('.tmx'); if (!b) return;
    const r = b.closest('tr'), c = r.dataset.c;
    let det = tb.querySelector(`tr.tmd[data-for="${c}"]`);
    if (det) { det.hidden = !det.hidden; b.setAttribute('aria-expanded', String(!det.hidden)); return; }
    const p = C.players[c]; if (!p) return;
    det = document.createElement('tr'); det.className = 'tmd'; det.dataset.for = c;
    const L = C.L;
    const h = p.h || [], ph = p.ph || [];
    det.innerHTML = `<td colspan="${r.children.length}"><div class="tmdet">
      <div><b>${L.pirH}</b>${spark(h.map(x => x[2]), { lbl: L.pirH, col: 'var(--accent,#e4572e)' })}<small>${h.map(x => x[2]).join(' · ')}</small></div>
      <div><b>${L.minH}</b>${spark(h.map(x => x[1]), { lbl: L.minH })}<small>${h.map(x => Math.round(x[1])).join(' · ')}</small></div>
      <div><b>${L.priceH}</b>${spark(ph.map(x => x[1]), { lbl: L.priceH, col: '#3b6fd8' })}<small>${ph.map(x => x[1]).join(' · ')}</small></div>
      <div><b>${L.nextH}</b><ul>${(p.nx || []).map(x => `<li>${L.rd} ${x[0]}: ${x[2] ? 'vs' : '@'} ${C.teams[x[1]] || x[1]} · <b>${x[3]}</b> PIR · ${L.diff} ${x[4]}/5${x[5] ? ' · B2B' : ''}</li>`).join('')}</ul>${p.why?.length ? `<p class="sub">${p.why.map(w => L.why[w] || w).join(' · ')}</p>` : ''}</div>
    </div></td>`;
    r.after(det); b.setAttribute('aria-expanded', 'true');
  });
  sort(); apply();
}
