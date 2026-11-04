// Διαδραστικά lineups, on/off και WOWY (στον browser). Διαβάζει το static API /api/lineups/<ομάδα>.json.
import { rate, sum, rated, onOff, wowy, groupLineups, zero, add } from './metrics.mjs';

const ctxEl = document.getElementById('anctx');
const CTX = ctxEl ? JSON.parse(ctxEl.textContent) : {};
const LG = CTX.lg || 'el';
const L = {
  el: { size: 'Μέγεθος', minp: 'Ελάχ. κατοχές', phase: 'Φάση', all: 'Όλες', rs: 'Κανονική περίοδος', po: 'Playoffs', venue: 'Έδρα', home: 'Εντός', away: 'Εκτός', opp: 'Αντίπαλος', from: 'Από', to: 'Έως', clutch: 'Μόνο clutch', metric: 'Κατάταξη με', best: 'Οι 5 καλύτερες', worst: 'Οι 5 χειρότερες', lineup: 'Σχήμα', g: 'Αγ.', min: 'Λεπτά', poss: 'Κατοχές', none: 'Δεν υπάρχουν σχήματα με αρκετές κατοχές για αυτά τα φίλτρα.', small: 'μικρό δείγμα', player: 'Παίκτης', on: 'Στο παρκέ', off: 'Εκτός', diff: 'Διαφορά', wowy: 'Με ή χωρίς (WOWY)', pick: 'Διάλεξε έως 4 συμπαίκτες', together: 'Μαζί', without: 'χωρίς', games: 'Αγώνας προς αγώνα', oppb: 'Ανά αντίπαλο', bestg: 'Καλύτερος αγώνας', worstg: 'Χειρότερος αγώνας', team: 'Μέσος όρος ομάδας', profile: 'Προφίλ επίθεσης και άμυνας', clutchT: 'Στα clutch (τελευταία 5΄, διαφορά ≤5)', trend: 'Τελευταίοι 10 αγώνες: Net Rating ομάδας με τον παίκτη στο παρκέ', close: 'Κλείσιμο', res: 'Αποτέλεσμα', vs: 'με' },
  en: { size: 'Size', minp: 'Min. possessions', phase: 'Phase', all: 'All', rs: 'Regular season', po: 'Playoffs', venue: 'Venue', home: 'Home', away: 'Away', opp: 'Opponent', from: 'From', to: 'To', clutch: 'Clutch only', metric: 'Rank by', best: 'Best 5', worst: 'Worst 5', lineup: 'Lineup', g: 'G', min: 'Min', poss: 'Poss', none: 'No lineups with enough possessions for these filters.', small: 'small sample', player: 'Player', on: 'On court', off: 'Off court', diff: 'Diff', wowy: 'With or without you (WOWY)', pick: 'Pick up to 4 teammates', together: 'Together', without: 'without', games: 'Game by game', oppb: 'By opponent', bestg: 'Best game', worstg: 'Worst game', team: 'Team average', profile: 'Offensive and defensive profile', clutchT: 'Clutch (last 5 min, margin ≤5)', trend: 'Last 10 games: team Net Rating with the player on court', close: 'Close', res: 'Result', vs: 'vs' },
  es: { size: 'Tamaño', minp: 'Posesiones mín.', phase: 'Fase', all: 'Todas', rs: 'Fase regular', po: 'Playoffs', venue: 'Campo', home: 'Local', away: 'Visitante', opp: 'Rival', from: 'Desde', to: 'Hasta', clutch: 'Solo clutch', metric: 'Ordenar por', best: 'Los 5 mejores', worst: 'Los 5 peores', lineup: 'Quinteto', g: 'PJ', min: 'Min', poss: 'Pos', none: 'No hay quintetos con suficientes posesiones con estos filtros.', small: 'muestra pequeña', player: 'Jugador', on: 'En pista', off: 'Fuera', diff: 'Dif.', wowy: 'Con o sin (WOWY)', pick: 'Elige hasta 4 compañeros', together: 'Juntos', without: 'sin', games: 'Partido a partido', oppb: 'Por rival', bestg: 'Mejor partido', worstg: 'Peor partido', team: 'Media del equipo', profile: 'Perfil ofensivo y defensivo', clutchT: 'Clutch (últimos 5 min, diferencia ≤5)', trend: 'Últimos 10 partidos: Net Rating con el jugador en pista', close: 'Cerrar', res: 'Resultado', vs: 'con' },
  sr: { size: 'Veličina', minp: 'Min. poseda', phase: 'Faza', all: 'Sve', rs: 'Regularni deo', po: 'Plej-of', venue: 'Teren', home: 'Kod kuće', away: 'U gostima', opp: 'Protivnik', from: 'Od', to: 'Do', clutch: 'Samo clutch', metric: 'Rangiraj po', best: '5 najboljih', worst: '5 najslabijih', lineup: 'Postava', g: 'Ut.', min: 'Min', poss: 'Pos.', none: 'Nema postava sa dovoljno poseda za ove filtere.', small: 'mali uzorak', player: 'Igrač', on: 'Na terenu', off: 'Van terena', diff: 'Razlika', wowy: 'Sa ili bez (WOWY)', pick: 'Izaberi do 4 saigrača', together: 'Zajedno', without: 'bez', games: 'Utakmica po utakmica', oppb: 'Po protivniku', bestg: 'Najbolja utakmica', worstg: 'Najslabija utakmica', team: 'Prosek tima', profile: 'Profil napada i odbrane', clutchT: 'Clutch (poslednjih 5 min, razlika ≤5)', trend: 'Poslednjih 10 utakmica: Net Rating sa igračem na terenu', close: 'Zatvori', res: 'Rezultat', vs: 'sa' },
}[LG];
const TIP = CTX.tips || {};
const COLS = [['ortg', 'ORtg', 1], ['drtg', 'DRtg', 0], ['net', 'Net', 1], ['pace', 'Pace', 1], ['efg', 'eFG%', 1], ['ts', 'TS%', 1], ['ast', 'AST%', 1], ['tov', 'TOV%', 0], ['oreb', 'OREB%', 1], ['dreb', 'DREB%', 1]];
const PCT = new Set(['efg', 'ts', 'ast', 'tov', 'oreb', 'dreb', 'oefg', 'reb', 'ftr']);
const fmt = (k, v) => (v == null ? '–' : PCT.has(k) ? (100 * v).toFixed(1) : k === 'net' ? (v > 0 ? '+' : '') + v.toFixed(1) : v.toFixed(1));
const netCls = v => (v == null ? '' : v > 2 ? 'pos' : v < -2 ? 'neg' : 'neu');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SMALL_MIN = 150, SMALL_POSS = 200;
const short = n => { const s = String(n || ''); const i = s.indexOf(','); return i > 0 ? s.slice(0, i).replace(/\b(\p{L})(\p{L}*)/gu, (m, a, b) => a + b.toLowerCase()) : s.split(' ').pop(); };

// ---------- γενική ταξινόμηση πινάκων
function sortable(root) {
  root.querySelectorAll('table.sortable thead th[data-k]').forEach(th => {
    th.tabIndex = 0;
    const go = () => {
      const tb = th.closest('table').tBodies[0], i = [...th.parentNode.children].indexOf(th);
      const asc = th.dataset.dir !== 'asc'; th.parentNode.querySelectorAll('th').forEach(x => delete x.dataset.dir); th.dataset.dir = asc ? 'asc' : 'desc';
      const val = tr => { const c = tr.children[i]; const v = c?.dataset.v ?? c?.textContent; const n = parseFloat(v); return isNaN(n) ? String(v) : n; };
      [...tb.rows].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * (asc ? 1 : -1); }).forEach(r => tb.appendChild(r));
    };
    th.addEventListener('click', go); th.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}
sortable(document);

// ---------- σελίδα ομάδας: lineups / on-off / WOWY
const app = document.getElementById('luApp');
if (app) init(app).catch(e => { app.innerHTML = `<p class="sub">${esc(e.message)}</p>`; });

async function init(app) {
  const D = await (await fetch(app.dataset.api)).json();
  const P = D.players.map(x => x[0]), NM = Object.fromEntries(D.players);
  const G = D.games.map(([gc, r, d, opp, home, ph, pf, pa]) => ({ gc, r, d, opp, home, ph, pf, pa }));
  const S = D.stints.map(([g, p, s, c, own, opp]) => ({ g, p: p.map(i => P[i]), s, c, own, opp }));
  const tName = c => (CTX.teams && CTX.teams[c]) || c;
  const opps = [...new Set(G.map(g => g.opp))].sort((a, b) => tName(a).localeCompare(tName(b)));
  const st = { size: 5, minp: 20, phase: '', venue: '', opp: '', from: '', to: '', clutch: false, metric: 'net', tab: location.hash.startsWith('#p=') ? 'onoff' : 'lu' };
  const pred = x => { const g = G[x.g]; return (!st.phase || (st.phase === 'PO' ? g.ph !== 'RS' : g.ph === 'RS')) && (!st.venue || (st.venue === 'h') === !!g.home) && (!st.opp || g.opp === st.opp) && (!st.from || g.d >= st.from) && (!st.to || g.d <= st.to) && (!st.clutch || x.c === 1); };
  const sel = (k, opts) => `<label>${L[k]}<select data-f="${k}">${opts.map(([v, t]) => `<option value="${esc(v)}"${String(st[k]) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const nmL = id => esc(short(NM[id] || id));

  app.innerHTML = `<div class="anfilters">
    <div class="antabs"><button data-tab="lu">Lineups</button><button data-tab="onoff">On/Off · WOWY</button></div>
    ${sel('size', [[2, '2'], [3, '3'], [4, '4'], [5, '5']])}${sel('minp', [[0, '0'], [20, '20'], [50, '50'], [100, '100']])}
    ${sel('phase', [['', L.all], ['RS', L.rs], ['PO', L.po]])}${sel('venue', [['', L.all], ['h', L.home], ['a', L.away]])}
    ${sel('opp', [['', L.all], ...opps.map(o => [o, tName(o)])])}
    <label>${L.from}<input type="date" data-f="from"></label><label>${L.to}<input type="date" data-f="to"></label>
    <label class="chk"><input type="checkbox" data-f="clutch"> ${L.clutch}</label>
    ${sel('metric', COLS.map(([k, t]) => [k, t]))}
  </div><div id="anOut"></div><div id="anDetail" class="andetail" hidden></div>`;
  app.querySelectorAll('[data-f]').forEach(el => el.addEventListener('change', () => { const k = el.dataset.f; st[k] = el.type === 'checkbox' ? el.checked : ['size', 'minp'].includes(k) ? +el.value : el.value; render(); }));
  app.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { st.tab = b.dataset.tab; render(); }));
  const out = app.querySelector('#anOut'), det = app.querySelector('#anDetail');
  const head = (first) => `<thead><tr><th class="l">${first}</th><th data-k title="${esc(TIP.min || '')}">${L.min}</th><th data-k title="${esc(TIP.poss || '')}">${L.poss}</th>${COLS.map(([k, t]) => `<th data-k title="${esc(TIP[k] || '')}">${t}</th>`).join('')}</tr></thead>`;
  const cells = r => `<td data-v="${r.min.toFixed(1)}">${Math.round(r.min)}</td><td data-v="${r.poss.toFixed(1)}">${Math.round(r.poss)}</td>${COLS.map(([k]) => `<td data-v="${r[k] ?? ''}" class="${k === 'net' ? 'net ' + netCls(r[k]) : ''}">${fmt(k, r[k])}</td>`).join('')}`;
  const smallB = r => (r.min < SMALL_MIN || r.poss < SMALL_POSS ? ` <span class="badge small">${L.small}</span>` : '');

  function render() {
    app.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === st.tab));
    app.querySelectorAll('[data-f="size"],[data-f="minp"],[data-f="metric"]').forEach(el => (el.closest('label').hidden = st.tab !== 'lu'));
    det.hidden = true;
    st.tab === 'lu' ? renderLineups() : renderOnOff();
  }

  function renderLineups() {
    const team = rated(sum(S, pred));
    const rows = groupLineups(S, st.size, pred).filter(r => r.poss >= st.minp);
    if (!rows.length) { out.innerHTML = `<p class="sub">${L.none}</p>`; return; }
    const hb = COLS.find(c => c[0] === st.metric)[2];
    const byM = rows.filter(r => r[st.metric] != null).sort((a, b) => (b[st.metric] - a[st.metric]) * (hb ? 1 : -1));
    const name = r => r.p.map(nmL).join(' · ');
    const mini = (list, t) => `<div><h3>${t}</h3><ol class="leadol">${list.map(r => `<li><a href="#" data-lu="${r.k}">${name(r)}</a><b class="${st.metric === 'net' ? netCls(r.net) : ''}">${fmt(st.metric, r[st.metric])}</b></li>`).join('')}</ol></div>`;
    const nb = Math.min(5, Math.ceil(byM.length / 2)), nw = Math.min(5, byM.length - nb);
    out.innerHTML = `<div class="leadgrid two">${mini(byM.slice(0, nb), L.best)}${nw ? mini(byM.slice(-nw).reverse(), L.worst) : ''}</div>
      <div class="tbl"><table class="sortable antbl">${head(L.lineup)}<tbody>${rows.sort((a, b) => b.poss - a.poss).map(r => `<tr><td class="l"><a href="#" data-lu="${r.k}">${name(r)}</a>${smallB(r)}</td>${cells(r)}</tr>`).join('')}
      <tr class="avg"><td class="l">${L.team}</td>${cells(team)}</tr></tbody></table></div>`;
    sortable(out);
    out.querySelectorAll('[data-lu]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); lineupDetail(a.dataset.lu.split('-'), team); }));
  }

  function profile(r, team) {
    const K = [['ortg', 'ORtg'], ['efg', 'eFG%'], ['tov', 'TOV%'], ['oreb', 'OREB%'], ['drtg', 'DRtg'], ['oefg', 'Opp eFG%'], ['dreb', 'DREB%']];
    return `<div class="bars">${K.map(([k, t]) => { const a = r[k], b = team[k]; if (a == null || b == null) return ''; const mx = Math.max(a, b) * 1.15 || 1; return `<div class="bar"><span>${t}</span><i style="width:${(100 * a / mx).toFixed(1)}%"></i><i class="avg" style="width:${(100 * b / mx).toFixed(1)}%"></i><b>${fmt(k, a)} <small>/ ${fmt(k, b)}</small></b></div>`; }).join('')}</div><p class="sub"><i class="lg"></i> ${L.lineup} · <i class="lg avg"></i> ${L.team}</p>`;
  }

  function lineupDetail(ids, team) {
    const has = x => ids.every(id => x.p.includes(id));
    const base = x => pred(x) && has(x);
    const tot = rated(sum(S, base));
    const perG = [...new Set(S.filter(base).map(x => x.g))].map(g => ({ g, r: rated(sum(S, x => base(x) && x.g === g)) })).sort((a, b) => G[a.g].d.localeCompare(G[b.g].d));
    const byOpp = {}; for (const x of perG) (byOpp[G[x.g].opp] ||= []).push(x.g);
    const cl = rated(sum(S, x => base(x) && x.c === 1));
    const gl = g => { const o = G[g]; return `${o.d.slice(5)} ${o.home ? '' : '@ '}${esc(tName(o.opp))} (${o.pf}-${o.pa})`; };
    const best = perG.filter(x => x.r.poss >= 5).sort((a, b) => b.r.net - a.r.net);
    det.innerHTML = `<button class="x" aria-label="${L.close}">×</button><h3>${ids.map(nmL).join(' · ')}</h3>
      <p>${Math.round(tot.min)}′ · ${Math.round(tot.poss)} ${L.poss.toLowerCase()} · Net <b class="${netCls(tot.net)}">${fmt('net', tot.net)}</b> (${L.team}: ${fmt('net', team.net)})${smallB(tot)}</p>
      <h4>${L.profile}</h4>${profile(tot, team)}
      ${best.length ? `<p>${L.bestg}: ${gl(best[0].g)} <b class="pos">${fmt('net', best[0].r.net)}</b> · ${L.worstg}: ${gl(best[best.length - 1].g)} <b class="neg">${fmt('net', best[best.length - 1].r.net)}</b></p>` : ''}
      <h4>${L.clutchT}</h4><p>${cl.poss ? `${Math.round(cl.min)}′ · ${Math.round(cl.poss)} ${L.poss.toLowerCase()} · Net <b class="${netCls(cl.net)}">${fmt('net', cl.net)}</b>` : '–'}</p>
      <h4>${L.games}</h4><div class="tbl"><table class="sortable antbl">${head(L.res)}<tbody>${perG.map(x => `<tr><td class="l">${gl(x.g)}</td>${cells(x.r)}</tr>`).join('')}</tbody></table></div>
      <h4>${L.oppb}</h4><div class="tbl"><table class="sortable antbl">${head(L.opp)}<tbody>${Object.entries(byOpp).map(([o, gs]) => { const r = rated(sum(S, x => base(x) && gs.includes(x.g))); return `<tr><td class="l">${esc(tName(o))}</td>${cells(r)}</tr>`; }).join('')}</tbody></table></div>`;
    det.hidden = false; sortable(det); det.scrollIntoView({ behavior: 'smooth', block: 'start' });
    det.querySelector('.x').onclick = () => (det.hidden = true);
  }

  function renderOnOff() {
    const ids = [...new Set(S.filter(pred).flatMap(x => x.p))];
    const rows = ids.map(id => ({ id, ...onOff(S, id, pred) })).filter(r => r.on.poss > 0).sort((a, b) => (b.diff.net ?? -99) - (a.diff.net ?? -99));
    const K = [['net', 'Net'], ['ortg', 'ORtg'], ['drtg', 'DRtg'], ['pace', 'Pace'], ['efg', 'eFG%'], ['oefg', 'Opp eFG%'], ['reb', 'REB%'], ['tov', 'TOV%']];
    out.innerHTML = `<div class="tbl"><table class="sortable antbl"><thead><tr><th class="l">${L.player}</th><th data-k>${L.min}</th><th data-k>${L.poss}</th>${K.map(([k, t]) => `<th data-k title="${esc(TIP[k] || '')}">${t} ${L.on}</th><th data-k>${t} ${L.off}</th><th data-k>${L.diff}</th>`).slice(0, 3 * 3).join('')}${K.slice(3).map(([k, t]) => `<th data-k title="${esc(TIP[k] || '')}">${t} Δ</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr><td class="l"><a href="#p=${r.id}" data-p="${r.id}">${esc(NM[r.id] ? niceN(NM[r.id]) : r.id)}</a>${smallB(r.on)}</td><td data-v="${r.on.min}">${Math.round(r.on.min)}</td><td data-v="${r.on.poss}">${Math.round(r.on.poss)}</td>
        ${K.slice(0, 3).map(([k]) => `<td data-v="${r.on[k] ?? ''}" class="${k === 'net' ? 'net ' + netCls(r.on[k]) : ''}">${fmt(k, r.on[k])}</td><td data-v="${r.off[k] ?? ''}" class="${k === 'net' ? 'net ' + netCls(r.off[k]) : ''}">${fmt(k, r.off[k])}</td><td data-v="${r.diff[k] ?? ''}" class="net ${netCls(k === 'drtg' ? -r.diff[k] : r.diff[k])}">${fmt('net', r.diff[k])}</td>`).join('')}
        ${K.slice(3).map(([k]) => { const v = r.diff[k]; const good = ['oefg', 'tov'].includes(k) ? -v : v; return `<td data-v="${v ?? ''}" class="net ${netCls(good * (PCT.has(k) ? 100 : 1))}">${v == null ? '–' : (v > 0 ? '+' : '') + (PCT.has(k) ? (100 * v).toFixed(1) : v.toFixed(1))}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
    sortable(out);
    out.querySelectorAll('[data-p]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); history.replaceState(null, '', '#p=' + a.dataset.p); playerDetail(a.dataset.p); }));
    const h = location.hash.match(/^#p=(\w+)/); if (h && NM[h[1]]) playerDetail(h[1]);
  }

  function playerDetail(id, mates = []) {
    const r = onOff(S, id, pred);
    // τάση: τελευταίοι 10 αγώνες που αγωνίστηκε
    const gs = [...new Set(S.filter(x => pred(x) && x.p.includes(id)).map(x => x.g))].sort((a, b) => G[a].d.localeCompare(G[b].d)).slice(-10);
    const tr = gs.map(g => ({ g, r: rated(sum(S, x => pred(x) && x.g === g && x.p.includes(id))) }));
    const mx = Math.max(10, ...tr.map(x => Math.abs(x.r.net || 0)));
    const W = 300, H = 90, bw = W / Math.max(10, tr.length);
    const svg = `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L.trend)}"><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="zero"/>${tr.map((x, i) => { const v = x.r.net || 0, h = (H / 2 - 4) * Math.abs(v) / mx; return `<rect x="${i * bw + 2}" width="${bw - 4}" y="${v >= 0 ? H / 2 - h : H / 2}" height="${h}" class="${v >= 0 ? 'pos' : 'neg'}"><title>${G[x.g].d} ${tName(G[x.g].opp)}: ${fmt('net', v)} (${Math.round(x.r.poss)} ${L.poss.toLowerCase()})</title></rect>`; }).join('')}</svg>`;
    const teammates = [...new Set(S.filter(x => x.p.includes(id)).flatMap(x => x.p))].filter(x => x !== id).sort((a, b) => short(NM[a]).localeCompare(short(NM[b])));
    const sentence = CTX.sentence ? CTX.sentence.replace('{n}', esc(niceN(NM[id] || id))).replace('{on}', fmt('net', r.on.net)).replace('{off}', fmt('net', r.off.net)).replace('{d}', fmt('net', r.diff.net)) : '';
    const wrow = (lab, x) => `<tr><td class="l">${lab}</td><td data-v="${x.min}">${Math.round(x.min)}</td><td data-v="${x.poss}">${Math.round(x.poss)}</td>${['net', 'ortg', 'drtg', 'pace', 'efg'].map(k => `<td class="${k === 'net' ? 'net ' + netCls(x[k]) : ''}">${fmt(k, x[k])}</td>`).join('')}<td>${x.min < SMALL_MIN || x.poss < SMALL_POSS ? `<span class="badge small">${L.small}</span>` : ''}</td></tr>`;
    const wt = mates.map(m => { const w = wowy(S, id, m, pred); const a = esc(short(NM[id])), b = esc(short(NM[m])); return wrow(`${a} + ${b}`, w.together) + wrow(`${a} ${L.without} ${b}`, w.aWithoutB) + wrow(`${b} ${L.without} ${a}`, w.bWithoutA); }).join('');
    det.innerHTML = `<button class="x" aria-label="${L.close}">×</button><h3>${esc(niceN(NM[id] || id))}</h3><p class="lede2">${sentence}</p>${smallB(r.on)}
      <h4>${L.trend}</h4>${svg}
      <h4>${L.wowy}</h4><p class="sub">${L.pick}</p><div class="mates">${teammates.map(m => `<label class="chk"><input type="checkbox" value="${m}"${mates.includes(m) ? ' checked' : ''}> ${esc(short(NM[m]))}</label>`).join('')}</div>
      ${mates.length ? `<div class="tbl"><table class="antbl"><thead><tr><th class="l"></th><th>${L.min}</th><th>${L.poss}</th><th>Net</th><th>ORtg</th><th>DRtg</th><th>Pace</th><th>eFG%</th><th></th></tr></thead><tbody>${wt}</tbody></table></div>` : ''}`;
    det.hidden = false;
    det.querySelector('.x').onclick = () => { det.hidden = true; history.replaceState(null, '', location.pathname); };
    det.querySelectorAll('.mates input').forEach(cb => cb.addEventListener('change', () => {
      const sel = [...det.querySelectorAll('.mates input:checked')].map(x => x.value);
      if (sel.length > 4) { cb.checked = false; return; }
      playerDetail(id, sel);
    }));
    if (!mates.length) det.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  render();
}
function niceN(n) { const s = String(n || ''); const i = s.indexOf(','); if (i < 0) return s; const t = x => x.toLowerCase().replace(/(^|[\s\-'.])(\p{L})/gu, (m, p, c) => p + c.toUpperCase()); return t(s.slice(i + 1).trim()) + ' ' + t(s.slice(0, i).trim()); }
