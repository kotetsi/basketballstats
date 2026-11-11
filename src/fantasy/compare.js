import { K, table } from './compare.mjs';
const X = JSON.parse(document.getElementById('cmpctx').textContent);
const { L, P, teams, base } = X;
const by = new Map(P.map(p => [p[K.c], p]));
const lab = p => `${p[K.n]} · ${p[K.t]} · ${p[K.pr].toFixed(1)}`;
const byLab = new Map(P.map(p => [lab(p).toLowerCase(), p[K.c]]));
const app = document.getElementById('cmpApp'), out = document.getElementById('cmpOut');
const qs = new URLSearchParams(location.search).get('p');
let sel = (qs ? qs.split(',') : X.def).filter(c => by.has(c)).slice(0, 4);

const dl = document.createElement('datalist'); dl.id = 'cmpdl';
dl.innerHTML = P.slice().sort((a, b) => b[K.pp] - a[K.pp]).map(p => `<option value="${lab(p).replace(/"/g, '&quot;')}">`).join('');
app.appendChild(dl);

function inputs() {
  const box = app.querySelector('.cmpin');
  box.innerHTML = [0, 1, 2, 3].map(i => { const p = by.get(sel[i]); return `<label>${L.player} ${i + 1}<span><input list="cmpdl" data-i="${i}" placeholder="${L.ph}" value="${p ? lab(p).replace(/"/g, '&quot;') : ''}" autocomplete="off">${p ? `<button type="button" data-x="${i}" aria-label="${L.remove}">✕</button>` : ''}</span></label>`; }).join('');
}
function render() {
  out.innerHTML = table(L, sel.map(c => by.get(c)), teams, base);
  const u = new URL(location.href); if (sel.length) u.searchParams.set('p', sel.join(',')); else u.searchParams.delete('p');
  history.replaceState(null, '', u);
}
app.addEventListener('change', e => {
  const i = e.target.dataset?.i; if (i == null) return;
  const c = byLab.get(e.target.value.trim().toLowerCase()); if (!c) return;
  const s = sel.slice(); s[+i] = c; sel = [...new Set(s.filter(Boolean))].slice(0, 4); inputs(); render();
});
app.addEventListener('click', e => {
  const x = e.target.dataset?.x; if (x != null) { sel.splice(+x, 1); inputs(); render(); }
  if (e.target.matches('[data-share]')) { navigator.clipboard?.writeText(location.href).then(() => { e.target.textContent = L.copied; setTimeout(() => (e.target.textContent = L.share), 1500); }); }
});
inputs(); render();
