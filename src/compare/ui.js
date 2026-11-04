// Player & Team Comparison Tool (browser). Διαβάζει /api/compare/*.json, όλα τα υπόλοιπα γίνονται εδώ.
import { playerMetrics, percentilesFor, radarScores, similarPlayers, splitRows, compareSentence, posGroup, LOWER_BETTER, R, percentileRank } from './metrics.mjs';

const root = document.getElementById('cmpApp');
if (root) (root.dataset.kind === 'teams' ? initTeams : initPlayers)(root).catch(e => { root.innerHTML = `<p class="sub">${String(e.message)}</p>`; });

const lg = (document.documentElement.lang || 'el').slice(0, 2);
const TX = {
  el: { add: 'Πρόσθεσε παίκτη…', addT: 'Διάλεξε ομάδα…', table: 'Πίνακας', radar: 'Radar', bars: 'Bars', scatter: 'Scatter', season: 'Σεζόν', base: 'Σύγκριση με', all: 'Όλους', G: 'Γκαρντ', F: 'Φόργουορντ', C: 'Σέντερ', per: 'Μονάδα', pg: 'Ανά αγώνα', p36: 'Ανά 36′', p100: 'Ανά 100 κατοχές', metrics: 'Metrics', copy: 'Αντιγραφή link', copied: 'Αντιγράφηκε!', png: 'PNG', csv: 'CSV', embed: 'Embed', avg: 'Μ.ό. λίγκας', pavg: 'Μ.ό. θέσης', pct: 'percentile', small: 'μικρό δείγμα', splits: 'Splits', similar: 'Παρόμοιοι παίκτες', cmp: 'Σύγκρινε', x: 'Άξονας X', y: 'Άξονας Y', pos: 'Θέση', team: 'Ομάδα', minM: 'Ελάχ. λεπτά/αγ.', minG: 'Ελάχ. αγώνες', age: 'Ηλικία έως', none: 'Πρόσθεσε έως 4 παίκτες για σύγκριση.', noneT: 'Διάλεξε 2 ομάδες.', remove: 'Αφαίρεση', embedT: 'Κώδικας για ενσωμάτωση σε blog ή site:', h2h: 'Μεταξύ τους', proj: 'Πρόβλεψη επόμενου αγώνα', lineups: 'Καλύτερες πεντάδες', key: 'Βασικοί παίκτες', bench: 'Πόντοι πάγκου/αγ.', form: 'Φόρμα', home: 'Εντός', away: 'Εκτός', wins: 'Νίκες', losses: 'Ήττες', l5: 'Τελ. 5', l10: 'Τελ. 10', l20: 'Τελ. 20', top4: 'vs top-4', bottom4: 'vs bottom-4', b2b: 'Back-to-back', rs: 'Κανονική περ.', po: 'Playoffs', split: 'Split', G_: 'Αγ.', nat: 'Εθνικότητα', exp: 'Εμπειρία', h: 'Ύψος', seasons: 'σεζόν', _and: ' και ', _both: 'Ο {a} έχει καλύτερο {x}, ενώ ο {b} έχει υψηλότερο {y}.', _one: 'Ο {a} υπερέχει σε {x}.', _even: 'Οι {a} και {b} είναι πολύ κοντά στα βασικά metrics.' },
  en: { add: 'Add a player…', addT: 'Pick a team…', table: 'Table', radar: 'Radar', bars: 'Bars', scatter: 'Scatter', season: 'Season', base: 'Baseline', all: 'All players', G: 'Guards', F: 'Forwards', C: 'Centers', per: 'Unit', pg: 'Per game', p36: 'Per 36′', p100: 'Per 100 possessions', metrics: 'Metrics', copy: 'Copy link', copied: 'Copied!', png: 'PNG', csv: 'CSV', embed: 'Embed', avg: 'League avg', pavg: 'Position avg', pct: 'percentile', small: 'small sample', splits: 'Splits', similar: 'Similar players', cmp: 'Compare', x: 'X axis', y: 'Y axis', pos: 'Position', team: 'Team', minM: 'Min. minutes/g', minG: 'Min. games', age: 'Age up to', none: 'Add up to 4 players to compare.', noneT: 'Pick 2 teams.', remove: 'Remove', embedT: 'Embed code for your blog or site:', h2h: 'Head-to-head', proj: 'Next meeting forecast', lineups: 'Best lineups', key: 'Key players', bench: 'Bench points/g', form: 'Form', home: 'Home', away: 'Away', wins: 'Wins', losses: 'Losses', l5: 'Last 5', l10: 'Last 10', l20: 'Last 20', top4: 'vs top 4', bottom4: 'vs bottom 4', b2b: 'Back-to-back', rs: 'Regular season', po: 'Playoffs', split: 'Split', G_: 'G', nat: 'Nationality', exp: 'Experience', h: 'Height', seasons: 'seasons', _and: ' and ', _both: '{a} has the better {x}, while {b} has the higher {y}.', _one: '{a} is ahead in {x}.', _even: '{a} and {b} are very close on the key metrics.' },
  es: { add: 'Añade un jugador…', addT: 'Elige un equipo…', table: 'Tabla', radar: 'Radar', bars: 'Barras', scatter: 'Dispersión', season: 'Temporada', base: 'Comparar con', all: 'Todos', G: 'Bases/escoltas', F: 'Aleros', C: 'Pívots', per: 'Unidad', pg: 'Por partido', p36: 'Por 36′', p100: 'Por 100 posesiones', metrics: 'Métricas', copy: 'Copiar enlace', copied: '¡Copiado!', png: 'PNG', csv: 'CSV', embed: 'Insertar', avg: 'Media liga', pavg: 'Media posición', pct: 'percentil', small: 'muestra pequeña', splits: 'Splits', similar: 'Jugadores similares', cmp: 'Comparar', x: 'Eje X', y: 'Eje Y', pos: 'Posición', team: 'Equipo', minM: 'Mín. minutos/p', minG: 'Mín. partidos', age: 'Edad hasta', none: 'Añade hasta 4 jugadores para comparar.', noneT: 'Elige 2 equipos.', remove: 'Quitar', embedT: 'Código para insertar en tu blog o web:', h2h: 'Enfrentamientos', proj: 'Pronóstico del próximo partido', lineups: 'Mejores quintetos', key: 'Jugadores clave', bench: 'Puntos del banquillo/p', form: 'Forma', home: 'Local', away: 'Visitante', wins: 'Victorias', losses: 'Derrotas', l5: 'Últ. 5', l10: 'Últ. 10', l20: 'Últ. 20', top4: 'vs top 4', bottom4: 'vs últimos 4', b2b: 'Back-to-back', rs: 'Fase regular', po: 'Playoffs', split: 'Split', G_: 'PJ', nat: 'Nacionalidad', exp: 'Experiencia', h: 'Altura', seasons: 'temporadas', _and: ' y ', _both: '{a} tiene mejor {x}, mientras que {b} tiene más {y}.', _one: '{a} es superior en {x}.', _even: '{a} y {b} están muy igualados en las métricas clave.' },
  sr: { add: 'Dodaj igrača…', addT: 'Izaberi tim…', table: 'Tabela', radar: 'Radar', bars: 'Stubići', scatter: 'Raspršenost', season: 'Sezona', base: 'Poređenje sa', all: 'Svim igračima', G: 'Bekovi', F: 'Krila', C: 'Centri', per: 'Jedinica', pg: 'Po utakmici', p36: 'Na 36′', p100: 'Na 100 poseda', metrics: 'Metrike', copy: 'Kopiraj link', copied: 'Kopirano!', png: 'PNG', csv: 'CSV', embed: 'Embed', avg: 'Prosek lige', pavg: 'Prosek pozicije', pct: 'percentil', small: 'mali uzorak', splits: 'Splitovi', similar: 'Slični igrači', cmp: 'Uporedi', x: 'Osa X', y: 'Osa Y', pos: 'Pozicija', team: 'Tim', minM: 'Min. minuta/ut.', minG: 'Min. utakmica', age: 'Starost do', none: 'Dodaj do 4 igrača za poređenje.', noneT: 'Izaberi 2 tima.', remove: 'Ukloni', embedT: 'Kod za ugradnju na blog ili sajt:', h2h: 'Međusobno', proj: 'Prognoza sledeće utakmice', lineups: 'Najbolje petorke', key: 'Ključni igrači', bench: 'Poeni klupe/ut.', form: 'Forma', home: 'Kod kuće', away: 'U gostima', wins: 'Pobede', losses: 'Porazi', l5: 'Posl. 5', l10: 'Posl. 10', l20: 'Posl. 20', top4: 'vs top 4', bottom4: 'vs poslednja 4', b2b: 'Back-to-back', rs: 'Regularni deo', po: 'Plej-of', split: 'Split', G_: 'Ut.', nat: 'Nacionalnost', exp: 'Iskustvo', h: 'Visina', seasons: 'sezona', _and: ' i ', _both: '{a} ima bolji {x}, dok {b} ima veći {y}.', _one: '{a} je bolji u {x}.', _even: '{a} i {b} su veoma blizu u ključnim metrikama.' },
}[lg];
const COLORS = ['#c4501f', '#1f6fb2', '#2e8b57', '#8e44ad'];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PCT = new Set(['fg', 'p3', 'ft', 'p2', 'ts', 'efg', 'usg', 'astp', 'tovp', 'rebp', 'orebp', 'drebp', 'stlp', 'blkp', 'avail', 'a3rate', 'ftr', 'starts', 'oefg', 'otov', 'oreb', 'dreb', 'reb_t', 'ftr_t']);
const fmt = (k, v) => (v == null || !Number.isFinite(v) ? '–' : PCT.has(k) ? (100 * v).toFixed(1) + '%' : k === 'pirmin' ? v.toFixed(2) : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));

// ---------- κοινά: SVG charts
function radarSVG(series, cats, labels) {
  const N = cats.length, cx = 210, cy = 200, r = 150, ang = i => -Math.PI / 2 + (2 * Math.PI * i) / N;
  const pt = (i, v) => [cx + r * (v / 100) * Math.cos(ang(i)), cy + r * (v / 100) * Math.sin(ang(i))];
  const grid = [25, 50, 75, 100].map(v => `<polygon points="${cats.map((_, i) => pt(i, v).join(',')).join(' ')}" class="rg"/>`).join('');
  const axes = cats.map((c, i) => { const [x, y] = pt(i, 112); return `<line x1="${cx}" y1="${cy}" x2="${pt(i, 100)[0]}" y2="${pt(i, 100)[1]}" class="ra"/><text x="${x}" y="${y}" class="rl" text-anchor="middle" dominant-baseline="middle">${esc(labels[c] || c)}</text>`; }).join('');
  const polys = series.map((s, j) => `<polygon points="${cats.map((c, i) => pt(i, s.v[c] ?? 0).join(',')).join(' ')}" style="fill:${s.c};stroke:${s.c}" class="rp"><title>${esc(s.n)}</title></polygon>${cats.map((c, i) => `<circle cx="${pt(i, s.v[c] ?? 0)[0]}" cy="${pt(i, s.v[c] ?? 0)[1]}" r="4" fill="${s.c}"><title>${esc(s.n)} · ${esc(labels[c] || c)}: ${s.v[c] ?? '–'}</title></circle>`).join('')}`).join('');
  return `<svg class="cmpradar" viewBox="0 0 420 400" role="img" aria-label="radar">${grid}${axes}${polys}</svg>`;
}
function barsSVG(metrics, series, avg, labels) {
  const rowH = 26 * series.length + 22, W = 640, x0 = 150, w = W - x0 - 70;
  const H = metrics.length * rowH + 10;
  let out = '';
  metrics.forEach((k, mi) => {
    const vals = series.map(s => s.v[k]).concat(avg[k] != null ? [avg[k]] : []).filter(v => v != null);
    const mx = Math.max(...vals.map(Math.abs), 1e-9) * 1.1, y0 = mi * rowH + 6;
    out += `<text x="0" y="${y0 + 14}" class="bl">${esc(labels[k] || k)}</text>`;
    series.forEach((s, i) => { const v = s.v[k]; const bw = v == null ? 0 : (w * Math.abs(v)) / mx; out += `<rect x="${x0}" y="${y0 + i * 24}" width="${bw.toFixed(1)}" height="18" rx="3" fill="${s.c}"><title>${esc(s.n)}: ${fmt(k, v)}</title></rect><text x="${x0 + bw + 6}" y="${y0 + i * 24 + 14}" class="bv">${fmt(k, v)}</text>`; });
    if (avg[k] != null) { const ax = x0 + (w * Math.abs(avg[k])) / mx; out += `<line x1="${ax}" x2="${ax}" y1="${y0 - 3}" y2="${y0 + series.length * 24}" class="bavg"><title>${esc(TX.avg)}: ${fmt(k, avg[k])}</title></line>`; }
  });
  return `<svg class="cmpbars" viewBox="0 0 ${W} ${H}" role="img" aria-label="bars">${out}</svg>`;
}
function scatterSVG(pool, kx, ky, sel, labels, colorOf) {
  const W = 640, H = 420, m = 48, xs = pool.map(p => p.m[kx]).filter(v => v != null), ys = pool.map(p => p.m[ky]).filter(v => v != null);
  if (!xs.length || !ys.length) return '';
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = v => m + ((v - x0) / ((x1 - x0) || 1)) * (W - 2 * m), sy = v => H - m - ((v - y0) / ((y1 - y0) || 1)) * (H - 2 * m);
  const ax = xs.reduce((a, b) => a + b, 0) / xs.length, ay = ys.reduce((a, b) => a + b, 0) / ys.length;
  const pts = pool.filter(p => p.m[kx] != null && p.m[ky] != null).sort((a, b) => sel.includes(a.id) - sel.includes(b.id)).map(p => { const s = sel.includes(p.id); return `<circle cx="${sx(p.m[kx]).toFixed(1)}" cy="${sy(p.m[ky]).toFixed(1)}" r="${s ? 8 : 4}" class="${s ? 'sel' : 'pt'}" ${s ? `fill="${colorOf(p.id)}"` : ''} data-id="${p.id}"><title>${esc(p.n)} (${esc(p.tn)})\n${labels[kx] || kx}: ${fmt(kx, p.m[kx])}\n${labels[ky] || ky}: ${fmt(ky, p.m[ky])}</title></circle>${s ? `<text x="${sx(p.m[kx]) + 10}" y="${sy(p.m[ky]) + 4}" class="sl">${esc(p.n.split(' ').pop())}</text>` : ''}`; }).join('');
  return `<svg class="cmpscatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="scatter"><line x1="${sx(ax)}" x2="${sx(ax)}" y1="${m}" y2="${H - m}" class="bavg"/><line x1="${m}" x2="${W - m}" y1="${sy(ay)}" y2="${sy(ay)}" class="bavg"/><line x1="${m}" x2="${W - m}" y1="${H - m}" y2="${H - m}" class="ax"/><line x1="${m}" x2="${m}" y1="${m}" y2="${H - m}" class="ax"/><text x="${W / 2}" y="${H - 10}" class="bl" text-anchor="middle">${esc(labels[kx] || kx)}</text><text x="14" y="${H / 2}" class="bl" text-anchor="middle" transform="rotate(-90 14 ${H / 2})">${esc(labels[ky] || ky)}</text><text x="${m}" y="${H - m + 16}" class="bv">${fmt(kx, x0)}</text><text x="${W - m}" y="${H - m + 16}" class="bv" text-anchor="end">${fmt(kx, x1)}</text><text x="${m - 4}" y="${H - m}" class="bv" text-anchor="end">${fmt(ky, y0)}</text><text x="${m - 4}" y="${m + 4}" class="bv" text-anchor="end">${fmt(ky, y1)}</text>${pts}</svg>`;
}
function exportPNG(svg, name) {
  const cs = getComputedStyle(document.documentElement), c2 = svg.cloneNode(true), vb = svg.viewBox.baseVal;
  c2.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  c2.insertAdjacentHTML('afterbegin', `<style>text{font:13px sans-serif;fill:${cs.getPropertyValue('--ink')}}.rg,.ra,.ax{fill:none;stroke:#999}.rp{fill-opacity:.18;stroke-width:2}.bavg{stroke:#888;stroke-dasharray:4 3}.pt{fill:#999;opacity:.5}</style><rect width="100%" height="100%" fill="${cs.getPropertyValue('--surface') || '#fff'}"/>`);
  const img = new Image(), url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(c2)], { type: 'image/svg+xml' }));
  img.onload = () => { const k = 2, cv = document.createElement('canvas'); cv.width = vb.width * k; cv.height = vb.height * k; cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); cv.toBlob(b => dl(b, name + '.png')); };
  img.src = url;
}
const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const csvOf = rows => '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
const sortable = el => el.querySelectorAll('table.sortable thead th[data-k]').forEach(th => th.addEventListener('click', () => {
  const tb = th.closest('table').tBodies[0], i = [...th.parentNode.children].indexOf(th), asc = th.dataset.dir !== 'asc';
  th.parentNode.querySelectorAll('th').forEach(x => delete x.dataset.dir); th.dataset.dir = asc ? 'asc' : 'desc';
  [...tb.rows].sort((a, b) => { const x = parseFloat(a.children[i].dataset.v), y = parseFloat(b.children[i].dataset.v); return ((isNaN(x) ? -1e9 : x) - (isNaN(y) ? -1e9 : y)) * (asc ? 1 : -1); }).forEach(r => tb.appendChild(r));
}));

// ---------- ΠΑΙΚΤΕΣ
async function initPlayers(root) {
  const cfg = JSON.parse(root.querySelector('.cmpj').textContent);
  const D = { ...(await (await fetch(cfg.api)).json()), labels: cfg.labels, tips: cfg.tips, radarLabels: cfg.radarLabels };
  const LBL = D.labels, TIP = D.tips || {};
  for (const S of Object.values(D.seasons)) for (const p of S.players) p.tn = (cfg.teams && cfg.teams[p.t]) || p.tn;
  const qs = new URLSearchParams(location.search);
  const st = { ids: (qs.get('ids') || cfg.ids || '').split(',').filter(Boolean).slice(0, 4), season: qs.get('season') || D.current, mode: qs.get('mode') || 'table', base: qs.get('base') || 'pos', per: qs.get('per') || 'pg', split: '', keys: (qs.get('m') || D.defaultKeys.join(',')).split(','), sx: qs.get('x') || 'usg', sy: qs.get('y') || 'ts', fPos: '', fTeam: '', fMin: 10, fG: 3, fAge: 99 };
  const embed = !!cfg.embed;
  const S = () => D.seasons[st.season] || D.seasons[D.current];
  const TT = () => S().teamTot || {};
  const metricsOf = p => {
    if (!p.rows || !st.split) return p.m;
    const rows = splitRows(p.rows, st.split, S().ctx);
    const m = playerMetrics(rows, r => TT()[(p.tAt?.[r[R.round]] || p.t) + '|' + r[R.round]], rows.length);
    return { ...p.m, ...m, ortg: p.m.ortg, drtg: p.m.drtg, net: p.m.net };
  };
  const pool = () => S().players;
  const byId = id => pool().find(p => p.id === id);
  const view = k => (st.per === 'p36' && D.per36[k] ? D.per36[k] : st.per === 'p100' && D.per100[k] ? D.per100[k] : k);
  const colorOf = id => COLORS[st.ids.indexOf(id)] || '#888';

  const seasonOpts = Object.keys(D.seasons).sort().reverse().map(s => `<option value="${s}"${s === st.season ? ' selected' : ''}>${esc(D.seasons[s].label)}</option>`).join('');
  root.innerHTML = `<div class="cmpbar anfilters"><div class="cmpsel"><div class="chips"></div><input type="search" list="cmpPl" placeholder="${TX.add}" class="cmpq" aria-label="${TX.add}"><datalist id="cmpPl"></datalist></div>
   <div class="antabs">${['table', 'radar', 'bars', 'scatter'].map(m => `<button data-mode="${m}">${TX[m]}</button>`).join('')}</div>
   <label>${TX.season}<select data-f="season">${seasonOpts}</select></label>
   <label>${TX.base}<select data-f="base"><option value="pos">${TX.pos}</option><option value="all">${TX.all}</option><option value="G">${TX.G}</option><option value="F">${TX.F}</option><option value="C">${TX.C}</option></select></label>
   <label>${TX.per}<select data-f="per"><option value="pg">${TX.pg}</option><option value="p36">${TX.p36}</option><option value="p100">${TX.p100}</option></select></label>
   <label>${TX.split}<select data-f="split"><option value="">${TX.all}</option>${['home', 'away', 'wins', 'losses', 'l5', 'l10', 'l20', 'top4', 'bottom4', 'b2b', 'rs', 'po'].map(k => `<option value="${k}">${TX[k]}</option>`).join('')}</select></label>
   ${embed ? '' : `<span class="shbtns"><button type="button" data-x="copy">🔗 ${TX.copy}</button><button type="button" data-x="png">⬇ ${TX.png}</button><button type="button" data-x="csv">⬇ ${TX.csv}</button><button type="button" data-x="embed">&lt;/&gt; ${TX.embed}</button></span>`}
  </div><div class="cmpout"></div><div class="cmpmetrics"></div><div class="cmpextra"></div>`;
  const out = root.querySelector('.cmpout'), q = root.querySelector('.cmpq');
  root.querySelector('[data-f="base"]').value = st.base; root.querySelector('[data-f="per"]').value = st.per;
  const fillList = () => { root.querySelector('#cmpPl').innerHTML = pool().filter(p => !st.ids.includes(p.id)).map(p => `<option value="${esc(p.n)} · ${esc(p.tn)}">`).join(''); };
  q.addEventListener('change', () => { const p = pool().find(x => `${x.n} · ${x.tn}` === q.value) || pool().find(x => x.n.toLowerCase() === q.value.toLowerCase()); if (p && st.ids.length < 4 && !st.ids.includes(p.id)) { st.ids.push(p.id); q.value = ''; render(); } });
  root.querySelectorAll('[data-f]').forEach(el => el.addEventListener('change', () => { st[el.dataset.f] = el.value; render(); }));
  root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.mode; render(); }));
  // drag-and-drop: σύρε ένα chip για να αλλάξεις σειρά
  const chips = root.querySelector('.chips');
  chips.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', e.target.dataset.id));
  chips.addEventListener('dragover', e => e.preventDefault());
  chips.addEventListener('drop', e => { e.preventDefault(); const from = e.dataTransfer.getData('text/plain'), to = e.target.closest('[data-id]')?.dataset.id; if (!from || !to || from === to) return; const a = st.ids.indexOf(from), b = st.ids.indexOf(to); st.ids.splice(a, 1); st.ids.splice(b, 0, from); render(); });
  if (!embed) {
    root.querySelector('[data-x="copy"]').onclick = async e => { try { await navigator.clipboard.writeText(location.href); e.target.textContent = TX.copied; } catch { prompt(TX.copy, location.href); } };
    root.querySelector('[data-x="png"]').onclick = () => { const svg = out.querySelector('svg'); if (svg) exportPNG(svg, 'comparison'); };
    root.querySelector('[data-x="csv"]').onclick = () => { const ps = st.ids.map(byId).filter(Boolean); dl(new Blob([csvOf([['metric', ...ps.map(p => p.n)], ...D.allKeys.map(k => [LBL[k] || k, ...ps.map(p => metricsOf(p)[k] ?? '')])])], { type: 'text/csv' }), 'comparison.csv'); };
    root.querySelector('[data-x="embed"]').onclick = () => { const u = new URL(cfg.embedUrl, location.href); u.search = location.search; root.querySelector('.cmpextra').insertAdjacentHTML('afterbegin', `<div class="andetail"><p>${TX.embedT}</p><textarea readonly rows="3" class="cmpemb">&lt;iframe src="${u.href}" width="100%" height="560" style="border:0" loading="lazy" title="BasketballStats"&gt;&lt;/iframe&gt;</textarea></div>`); };
  }

  function syncURL() {
    const p = new URLSearchParams();
    if (st.ids.length) p.set('ids', st.ids.join(','));
    if (st.season !== D.current) p.set('season', st.season);
    if (st.mode !== 'table') p.set('mode', st.mode);
    if (st.base !== 'pos') p.set('base', st.base);
    if (st.per !== 'pg') p.set('per', st.per);
    if (st.keys.join(',') !== D.defaultKeys.join(',')) p.set('m', st.keys.join(','));
    if (st.mode === 'scatter') { p.set('x', st.sx); p.set('y', st.sy); }
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }

  function pctTable(group, keys) {
    const P = pool().filter(p => p.q);
    return percentilesFor(P.concat(st.ids.map(byId).filter(p => p && !p.q)), keys, group);
  }

  function render() {
    st.ids = st.ids.filter(id => byId(id));
    syncURL(); fillList();
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    const ps = st.ids.map(byId).filter(Boolean);
    chips.innerHTML = ps.map((p, i) => `<span class="chip" draggable="true" data-id="${p.id}" style="--c:${COLORS[i]}"><i></i>${esc(p.n)} <small>${esc(p.tn)}</small><button type="button" data-rm="${p.id}" aria-label="${TX.remove}">×</button></span>`).join('');
    chips.querySelectorAll('[data-rm]').forEach(b => (b.onclick = () => { st.ids = st.ids.filter(x => x !== b.dataset.rm); render(); }));
    root.querySelector('.cmpmetrics').innerHTML = st.mode === 'table' || st.mode === 'bars' ? `<details><summary>${TX.metrics} (${st.keys.length})</summary><div class="mates">${D.allKeys.map(k => `<label class="chk"><input type="checkbox" value="${k}"${st.keys.includes(k) ? ' checked' : ''}> ${esc(LBL[k] || k)}</label>`).join('')}</div></details>` : '';
    root.querySelectorAll('.cmpmetrics input').forEach(cb => cb.addEventListener('change', () => { st.keys = [...root.querySelectorAll('.cmpmetrics input:checked')].map(x => x.value); render(); }));
    if (!ps.length && st.mode !== 'scatter') { out.innerHTML = `<p class="sub">${TX.none}</p>`; extras([]); return; }
    const M = Object.fromEntries(ps.map(p => [p.id, metricsOf(p)]));
    const grp = p => (st.base === 'pos' ? posGroup(p.pos) || 'all' : st.base);
    const pc = Object.fromEntries(['all', 'G', 'F', 'C'].map(g => [g, pctTable(g, D.allKeys)]));
    const sentence = ps.length >= 2 ? `<p class="lede2 cmps">${esc(compareSentence(M[ps[0].id], M[ps[1].id], [ps[0].n, ps[1].n], { ...LBL, ...TX }))}</p>` : '';
    const small = p => (M[p.id].G < 5 || (M[p.id].mpg || 0) < 10 ? ` <span class="badge small">${TX.small}</span>` : '');
    if (st.mode === 'table') {
      const keys = st.keys.map(view);
      const best = k => { const vs = ps.map(p => M[p.id][k]).filter(v => v != null); if (vs.length < 2) return null; return LOWER_BETTER.has(k.replace(/36|100$/, '')) || LOWER_BETTER.has(k) ? Math.min(...vs) : Math.max(...vs); };
      out.innerHTML = `${sentence}<div class="tbl"><table class="antbl cmptbl"><thead><tr><th class="l">Metric</th>${ps.map((p, i) => `<th style="color:${COLORS[i]}">${esc(p.n)}${small(p)}</th>`).join('')}<th>${TX.avg}</th><th>${TX.pavg}</th></tr></thead><tbody>
        <tr class="bio"><td class="l">${TX.team} · ${TX.pos}</td>${ps.map(p => `<td>${esc(p.tn)} · ${esc(p.posL || '')}</td>`).join('')}<td></td><td></td></tr>
        <tr class="bio"><td class="l">${TX.nat} · ${TX.h} · ${TX.exp}</td>${ps.map(p => `<td>${esc(p.nat || '–')} · ${p.age ?? '–'} · ${p.h ? p.h + ' cm' : '–'} · ${p.exp ?? 1} ${TX.seasons}</td>`).join('')}<td></td><td></td></tr>
        ${keys.map(k => { const b = best(k); const avg = S().avg[k], pavg = ps.length ? S().pavg?.[posGroup(ps[0].pos)]?.[k] : null; return `<tr><td class="l" title="${esc(TIP[k.replace(/(36|100)$/, '')] || TIP[k] || '')}">${esc(LBL[k] || k)}</td>${ps.map(p => { const v = M[p.id][k], pr = pc[grp(p)][p.id]?.[k]; return `<td class="${b != null && v === b ? 'best' : ''}">${fmt(k, v)}${pr != null ? `<span class="pcb"><i style="width:${pr}%"></i></span><small>${pr}</small>` : ''}</td>`; }).join('')}<td>${fmt(k, avg)}</td><td>${fmt(k, pavg)}</td></tr>`; }).join('')}
      </tbody></table></div><p class="sub">${TX.pct}: ${st.base === 'pos' ? TX.pos : TX[st.base] || TX.all} · ${S().qual}</p>`;
    } else if (st.mode === 'radar') {
      const series = ps.map((p, i) => ({ n: p.n, c: COLORS[i], v: radarScores(pc[grp(p)][p.id] || {}) }));
      out.innerHTML = `${sentence}${radarSVG(series, Object.keys(D.radarLabels), D.radarLabels)}<div class="cmplegend">${series.map(s => `<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join('')}</div><div class="tbl"><table class="antbl"><thead><tr><th class="l"></th>${Object.values(D.radarLabels).map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${series.map(s => `<tr><td class="l" style="color:${s.c}">${esc(s.n)}</td>${Object.keys(D.radarLabels).map(c => `<td>${s.v[c] ?? '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    } else if (st.mode === 'bars') {
      const keys = st.keys.map(view);
      out.innerHTML = `${sentence}${barsSVG(keys, ps.map((p, i) => ({ n: p.n, c: COLORS[i], v: M[p.id] })), S().avg, LBL)}<div class="cmplegend">${ps.map((p, i) => `<span><i style="background:${COLORS[i]}"></i>${esc(p.n)}</span>`).join('')}<span><i class="dash"></i>${TX.avg}</span></div>`;
    } else {
      const P = pool().filter(p => (!st.fPos || posGroup(p.pos) === st.fPos) && (!st.fTeam || p.t === st.fTeam) && (p.m.mpg || 0) >= +st.fMin && (p.m.G || 0) >= +st.fG && (p.age || 0) <= +st.fAge || st.ids.includes(p.id));
      const ko = D.allKeys.map(k => `<option value="${k}">${esc(LBL[k] || k)}</option>`).join('');
      const teams = [...new Set(pool().map(p => p.t))].sort();
      out.innerHTML = `<div class="anfilters sm"><label>${TX.x}<select data-s="sx">${ko}</select></label><label>${TX.y}<select data-s="sy">${ko}</select></label><label>${TX.pos}<select data-s="fPos"><option value="">${TX.all}</option><option value="G">${TX.G}</option><option value="F">${TX.F}</option><option value="C">${TX.C}</option></select></label><label>${TX.team}<select data-s="fTeam"><option value="">${TX.all}</option>${teams.map(t => `<option value="${t}">${esc(pool().find(p => p.t === t)?.tn || t)}</option>`).join('')}</select></label><label>${TX.minM}<input type="number" min="0" max="40" data-s="fMin" value="${st.fMin}"></label><label>${TX.minG}<input type="number" min="0" max="40" data-s="fG" value="${st.fG}"></label><label>${TX.age}<input type="number" min="16" max="99" data-s="fAge" value="${st.fAge}"></label></div>
      ${scatterSVG(P.map(p => ({ ...p, m: st.ids.includes(p.id) ? M[p.id] : p.m })), st.sx, st.sy, st.ids, LBL, colorOf)}<p class="sub">${P.length} · ${TX.cmp}: click</p>`;
      out.querySelectorAll('[data-s]').forEach(el => { el.value = st[el.dataset.s]; el.addEventListener('change', () => { st[el.dataset.s] = el.value; render(); }); });
      out.querySelectorAll('circle[data-id]').forEach(c => c.addEventListener('click', () => { const id = c.dataset.id; if (!st.ids.includes(id) && st.ids.length < 4) { st.ids.push(id); render(); } }));
    }
    extras(ps);
  }

  function extras(ps) {
    const ex = root.querySelector('.cmpextra'); if (embed) { ex.innerHTML = ''; return; }
    let h = '';
    if (ps.length && ps.some(p => p.rows)) {
      const SPL = ['home', 'away', 'wins', 'losses', 'l5', 'l10', 'top4', 'bottom4', 'b2b'];
      h += `<h2>${TX.splits}</h2><div class="tbl"><table class="antbl sortable"><thead><tr><th class="l">${TX.split}</th>${ps.map((p, i) => `<th colspan="4" style="color:${COLORS[i]}">${esc(p.n)}</th>`).join('')}</tr><tr><th></th>${ps.map(() => `<th>${TX.G_}</th><th>PIR</th><th>${esc(LBL.pts)}</th><th>TS%</th>`).join('')}</tr></thead><tbody>${SPL.map(k => `<tr><td class="l">${TX[k]}</td>${ps.map(p => { if (!p.rows) return '<td colspan="4">–</td>'; const rows = splitRows(p.rows, k, S().ctx); const m = playerMetrics(rows, r => TT()[(p.tAt?.[r[R.round]] || p.t) + '|' + r[R.round]], rows.length); const v = st.per === 'p36' ? [m.pir36, m.pts36] : st.per === 'p100' ? [m.pir100, m.pts100] : [m.pir, m.pts]; return `<td>${m.G}</td><td>${fmt('pir', v[0])}</td><td>${fmt('pts', v[1])}</td><td>${fmt('ts', m.ts)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if (ps.length) {
      const sim = D.similar?.[st.season]?.[ps[0].id] || (st.season === D.current ? similarPlayers(pool().filter(p => p.q || p.id === ps[0].id), ps[0].id, 8) : []);
      if (sim.length) h += `<h2>${TX.similar}: ${esc(ps[0].n)}</h2><ul class="cmpsim">${sim.map(s => { const p = byId(s.id); return p ? `<li><span>${esc(p.n)} <small>${esc(p.tn)} · ${Math.round(100 * s.sim)}%</small></span>${st.ids.includes(p.id) ? '' : `<button type="button" data-addc="${p.id}">${TX.cmp}</button>`}</li>` : ''; }).join('')}</ul>`;
    }
    ex.innerHTML = h; sortable(ex);
    ex.querySelectorAll('[data-addc]').forEach(b => (b.onclick = () => { if (st.ids.length >= 4) st.ids.pop(); st.ids.push(b.dataset.addc); render(); window.scrollTo({ top: root.offsetTop - 10, behavior: 'smooth' }); }));
  }
  render();
}

// ---------- ΟΜΑΔΕΣ
async function initTeams(root) {
  const cfg = JSON.parse(root.querySelector('.cmpj').textContent);
  const D = { ...(await (await fetch(cfg.api)).json()), labels: cfg.labels, tips: cfg.tips, radarLabels: cfg.radarLabels };
  const LBL = D.labels, TIP = D.tips || {};
  const qs = new URLSearchParams(location.search);
  const st = { comp: qs.get('comp') || 'E', ids: (qs.get('ids') || '').split(',').filter(Boolean).slice(0, 2), mode: qs.get('mode') || 'table' };
  const C = () => D.comps[st.comp];
  for (const [cp, c] of Object.entries(D.comps)) for (const [id, tm] of Object.entries(c.teams)) tm.n = (cfg.teams?.[cp]?.[id]) || tm.n;
  root.innerHTML = `<div class="cmpbar anfilters"><label>${TX.season}<select data-f="comp">${Object.entries(D.comps).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label>
    <label>A<select data-t="0"></select></label><label>B<select data-t="1"></select></label>
    <div class="antabs">${['table', 'radar', 'bars'].map(m => `<button data-mode="${m}">${TX[m]}</button>`).join('')}</div>
    <span class="shbtns"><button type="button" data-x="copy">🔗 ${TX.copy}</button><button type="button" data-x="png">⬇ ${TX.png}</button><button type="button" data-x="csv">⬇ ${TX.csv}</button></span></div><div class="cmpout"></div><div class="cmpextra"></div>`;
  const out = root.querySelector('.cmpout');
  root.querySelector('[data-f="comp"]').value = st.comp;
  root.querySelector('[data-f="comp"]').onchange = e => { st.comp = e.target.value; st.ids = []; render(); };
  root.querySelectorAll('[data-t]').forEach(s => s.addEventListener('change', () => { st.ids[+s.dataset.t] = s.value; st.ids = st.ids.filter(Boolean); render(); }));
  root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.mode; render(); }));
  root.querySelector('[data-x="copy"]').onclick = async e => { try { await navigator.clipboard.writeText(location.href); e.target.textContent = TX.copied; } catch { prompt(TX.copy, location.href); } };
  root.querySelector('[data-x="png"]').onclick = () => { const svg = out.querySelector('svg'); if (svg) exportPNG(svg, 'teams'); };
  root.querySelector('[data-x="csv"]').onclick = () => { const ts = st.ids.map(id => C().teams[id]).filter(Boolean); dl(new Blob([csvOf([['metric', ...ts.map(t => t.n)], ...D.keys.map(k => [LBL[k] || k, ...ts.map(t => t.m[k] ?? '')])])], { type: 'text/csv' }), 'teams.csv'); };
  function render() {
    const T = C().teams, list = Object.entries(T).sort((a, b) => a[1].n.localeCompare(b[1].n));
    root.querySelectorAll('[data-t]').forEach(s => { s.innerHTML = `<option value="">${TX.addT}</option>` + list.map(([id, t]) => `<option value="${id}">${esc(t.n)}</option>`).join(''); s.value = st.ids[+s.dataset.t] || ''; });
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    const p = new URLSearchParams(); if (st.comp !== 'E') p.set('comp', st.comp); if (st.ids.length) p.set('ids', st.ids.join(',')); if (st.mode !== 'table') p.set('mode', st.mode);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
    const ts = st.ids.map(id => ({ id, ...T[id] })).filter(t => t.n);
    if (ts.length < 2) { out.innerHTML = `<p class="sub">${TX.noneT}</p>`; root.querySelector('.cmpextra').innerHTML = ''; return; }
    const LOWT = new Set(['drtg', 'tov', 'oefg', 'ooreb', 'oftr', 'papg']);
    const pct = (k, v) => percentileRank(Object.values(T).map(t => t.m[k]), v, LOWT.has(k));
    const TPCT = new Set(['wpct', 'efg', 'ts', 'ast', 'tov', 'oreb', 'dreb', 'ftr', 'reb', 'oefg', 'otov', 'form10']);
    const fmt = (k, v) => (v == null || !Number.isFinite(v) ? '–' : TPCT.has(k) ? (100 * v).toFixed(1) + '%' : v.toFixed(1));
    if (st.mode === 'table') {
      out.innerHTML = `<div class="tbl"><table class="antbl cmptbl"><thead><tr><th class="l">Metric</th>${ts.map((t, i) => `<th style="color:${COLORS[i]}">${esc(t.n)}</th>`).join('')}<th>${TX.avg}</th></tr></thead><tbody>${D.keys.map(k => { const a = ts[0].m[k], b = ts[1].m[k], lowB = ['drtg', 'tov', 'oefg', 'ooreb', 'oftr', 'papg'].includes(k); const w = a == null || b == null ? -1 : (lowB ? a < b : a > b) ? 0 : a === b ? -1 : 1; return `<tr><td class="l" title="${esc(TIP[k] || '')}">${esc(LBL[k] || k)}</td>${ts.map((t, i) => { const pr = pct(k, t.m[k]); return `<td class="${w === i ? 'best' : ''}">${fmt(k, t.m[k])}${pr != null ? `<span class="pcb"><i style="width:${pr}%"></i></span><small>${pr}</small>` : ''}</td>`; }).join('')}<td>${fmt(k, C().avg[k])}</td></tr>`; }).join('')}</tbody></table></div>`;
    } else if (st.mode === 'radar') {
      const cats = { off: ['ortg', 'efg', 'ts'], def: ['drtg', 'oefg', 'otov'], reb: ['oreb', 'dreb'], ball: ['ast', 'tov'], pace: ['pace'], ft: ['ftr'], bench: ['bench'], form: ['form10'] };
      const series = ts.map((t, i) => ({ n: t.n, c: COLORS[i], v: Object.fromEntries(Object.entries(cats).map(([c, ks]) => { const v = ks.map(k => pct(k, t.m[k])).filter(x => x != null); return [c, v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null]; })) }));
      out.innerHTML = radarSVG(series, Object.keys(cats), D.radarLabels) + `<div class="cmplegend">${series.map(s => `<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join('')}</div>`;
    } else {
      const K = ['ortg', 'drtg', 'net', 'pace', 'efg', 'ts', 'oreb', 'dreb', 'ftr', 'bench'];
      out.innerHTML = barsSVG(K, ts.map((t, i) => ({ n: t.n, c: COLORS[i], v: t.m })), C().avg, LBL) + `<div class="cmplegend">${ts.map((t, i) => `<span><i style="background:${COLORS[i]}"></i>${esc(t.n)}</span>`).join('')}<span><i class="dash"></i>${TX.avg}</span></div>`;
    }
    const h2h = (C().h2h || []).filter(g => (g.h === ts[0].id && g.a === ts[1].id) || (g.h === ts[1].id && g.a === ts[0].id)).slice(0, 10);
    const nx = (C().next || []).find(g => (g.h === ts[0].id && g.a === ts[1].id) || (g.h === ts[1].id && g.a === ts[0].id));
    root.querySelector('.cmpextra').innerHTML = `<div class="cmp2col">${ts.map((t, i) => `<div><h3 style="color:${COLORS[i]}">${esc(t.n)}</h3><p>${TX.form}: ${esc(t.form || '')} · ${TX.home} ${t.home || '–'} · ${TX.away} ${t.away || '–'}</p><h4>${TX.key}</h4><ul>${(t.key || []).map(k => `<li>${esc(k[0])} <small>${k[1].toFixed(1)} PIR</small></li>`).join('')}</ul><h4>${TX.lineups}</h4><ul>${(t.lineups || []).map(l => `<li>${esc(l.p.join(' · '))} <small>Net ${l.net > 0 ? '+' : ''}${l.net.toFixed(1)} · ${Math.round(l.poss)} poss</small></li>`).join('') || '<li>–</li>'}</ul></div>`).join('')}</div>
      <h3>${TX.h2h}</h3><ul class="mckm">${h2h.map(g => `<li>${esc(g.d)} · ${esc(T[g.h]?.n || g.h)} – ${esc(T[g.a]?.n || g.a)} <b>${g.hs}-${g.as}</b></li>`).join('') || '<li>–</li>'}</ul>
      ${nx ? `<h3>${TX.proj}</h3><p><a href="${cfg.mcUrl}">${esc(T[nx.h]?.n)} – ${esc(T[nx.a]?.n)}</a>: <b>${Math.round(nx.p * 100)}%</b> ${esc(T[nx.h]?.n)} · ${Math.round(nx.hs)}-${Math.round(nx.as)}</p>` : ''}`;
  }
  render();
}
