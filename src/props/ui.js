// Prop Analyzer (browser): διαλέγεις παίκτη/στατιστικό/γραμμή → hit rates, γράφημα με τη γραμμή, φίλτρα, μοντέλο, αποδόσεις,
// ματσάρισμα. Από κάτω πίνακας όλων των props της αγωνιστικής. Δεδομένα: assets/props/data.json + γραμμές της σελίδας (#pactx).
import { VAL, MODEL_STATS, ALL_STATS, hits, filterGames, roundsWithout, median, summary, modelLine, mainLine, evaluate, board } from './calc.mjs';

const CTX = JSON.parse(document.getElementById('pactx').textContent);
const X = CTX.X, LG = CTX.lg;
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const pc = x => (x == null ? '–' : Math.round(100 * x) + '%');
const f1 = x => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(1));
const evs = x => (x == null ? '–' : (x >= 0 ? '+' : '−') + (100 * Math.abs(x)).toFixed(1) + '%');
const tn = c => CTX.teams[c] || c;
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nm = p => (LG === 'el' && p.gr) || p.n;
const when = t => { try { return new Date(t).toLocaleString(CTX.locale, { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { return ''; } };

const root = $('#pa'), boardEl = $('#paBoard');
let D, BY = {}, BYS = {}, ROWS = [];
const S = { c: null, s: 'pts', line: null, src: 'model', side: 'over', range: 10, venue: 'all', role: 'all', mate: '' };

function linesOf(c, s) { return CTX.lines[`${c}|${s}`] || []; }
function defaultLine(p, s) {
  const m = MODEL_STATS.includes(s) ? mainLine(linesOf(p.c, s)) : null;
  if (m) return { line: m.l, src: 'book', book: m.o?.[1] || m.u?.[1] };
  const pj = p.pj?.[s]; if (pj) return { line: modelLine(pj[0]), src: 'model' };
  const v = p.g.map(VAL[s]); const a = v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0.5;
  return { line: modelLine(a), src: 'avg' };
}
function setPlayer(c, s = S.s, line = null) {
  const p = BY[c]; if (!p) return;
  S.c = c; S.s = s; S.mate = '';
  if (line == null) { const d = defaultLine(p, s); S.line = d.line; S.src = d.src; S.srcBook = d.book; }
  else { S.line = line; const m = linesOf(c, s).find(x => x.l === line); S.src = m ? 'book' : 'user'; S.srcBook = m ? m.o?.[1] || m.u?.[1] : null; }
  render(); hash();
}
function hash() {
  const p = BY[S.c]; if (!p) return;
  history.replaceState(null, '', `#p=${encodeURIComponent(p.s)}&s=${S.s}&l=${S.line}`);
}

// ---------- επάνω μέρος: επιλογές
function controls() {
  const p = BY[S.c];
  return `<div class="pactl">
<div class="pasearch"><input type="search" id="paQ" placeholder="${esc(X.search)}" aria-label="${esc(X.search)}" autocomplete="off" value="${esc(p ? nm(p) : '')}"><div class="sugg" id="paSugg" hidden></div></div>
<div class="seg pastat" role="group" aria-label="${esc(X.stat)}">${ALL_STATS.map(s => `<button type="button" data-s="${s}" class="${s === S.s ? 'on' : ''}">${esc(X.stats[s])}</button>`).join('')}</div>
<div class="paline"><span>${esc(X.line)}</span><button type="button" data-d="-1" aria-label="−1">−</button><input type="number" id="paL" step="0.5" min="0" inputmode="decimal" value="${S.line}" aria-label="${esc(X.line)}"><button type="button" data-d="1" aria-label="+1">+</button>
<div class="seg paside"><button type="button" data-side="over" class="${S.side === 'over' ? 'on' : ''}">Over</button><button type="button" data-side="under" class="${S.side === 'under' ? 'on' : ''}">Under</button></div>
<small class="pasrc">${esc(S.src === 'book' ? fill(X.srcBook, { b: S.srcBook || 'bookmaker' }) : S.src === 'user' ? X.srcUser : S.src === 'avg' ? X.srcAvg : X.srcModel)}</small>
<button type="button" class="pashare" id="paShare">🔗 ${esc(X.share)}</button></div></div>`;
}

function head(p) {
  const nx = D.next[p.t];
  const st = p.out ? `<span class="pabadge out">${esc(X.out)}</span>` : p.st === 'doubtful' ? `<span class="pabadge doubt">${esc(X.doubtful)}</span>` : '';
  return `<div class="pahead"><div><h2><a href="${CTX.plBase}${esc(p.s)}/">${esc(nm(p))}</a></h2><p class="sub">${esc(tn(p.t))} · ${esc(X.pos[p.pos] || p.pos)}${p.no !== '' ? ' · #' + esc(p.no) : ''} · ${p.g.length} ${esc(X.games.toLowerCase())}</p></div>
<div class="panext"><span>${esc(X.next)}</span>${nx ? `<b>${nx.home ? 'vs' : '@'} ${esc(tn(nx.opp))}</b><small>${esc(when(nx.t))} · ${esc(X.round)} ${nx.r}</small>` : `<b>${esc(X.noNext)}</b>`}${st}</div></div>`;
}

function card(label, h, extra = '') {
  const r = h.rate;
  const cls = r == null ? '' : r >= 0.6 ? 'pos' : r <= 0.4 ? 'neg' : '';
  return `<div class="am"><span>${esc(label)}</span><b class="${cls}">${pc(r)}</b><small>${h.n ? esc(fill(X.of, { w: h.win, n: h.n - h.push })) + (h.push ? ` · push ${h.push}` : '') : esc(X.noGames)}${extra}</small><i style="width:${r == null ? 0 : Math.round(100 * r)}%"></i></div>`;
}
function cards(p) {
  const nx = D.next[p.t], Sm = summary(p, S.s, S.line, { side: S.side, next: nx });
  return `<div class="anmetrics pahits">${card('L5', Sm.L5)}${card('L10', Sm.L10)}${card('L20', Sm.L20)}${card(X.season, Sm.all)}${nx ? card(nx.home ? X.home : X.away, Sm.venue) + card(fill(X.h2h, { o: tn(nx.opp) }), Sm.h2h) : ''}
<div class="am"><span>${esc(X.avg)} · ${esc(X.med)}</span><b>${f1(Sm.avg)}</b><small>${esc(X.med)} ${f1(Sm.med)} · ${esc(X.last5)} ${f1(Sm.l5avg)}</small></div>
<div class="am"><span>${esc(X.mins)}</span><b>${f1(Sm.min)}</b><small>${esc(X.last5)} ${f1(Sm.l5min)}</small></div></div>`;
}

// ---------- γράφημα αγώνα προς αγώνα
function chartBox(p) {
  const mates = D.players.filter(q => q.t === p.t && q.c !== p.c && q.g.length >= 3).sort((a, b) => b.g.reduce((s, r) => s + r[6], 0) - a.g.reduce((s, r) => s + r[6], 0));
  const seg = (k, opts) => `<div class="seg" data-f="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(S[k]) === String(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  const mate = S.mate ? BY[S.mate] : null;
  const g = filterGames(p.g, { range: S.range, venue: S.venue, role: S.role, without: mate ? roundsWithout(p, mate) : null });
  const vals = g.map(VAL[S.s]), H = hits(vals, S.line, S.side);
  return `<section class="pachart"><h3>${esc(X.chart)}</h3><div class="pafil">${seg('range', [[5, 'L5'], [10, 'L10'], [20, 'L20'], [0, X.season]])}${seg('venue', [['all', X.all], ['home', X.home], ['away', X.away]])}${seg('role', [['all', X.all], ['start', X.start], ['bench', X.bench]])}
<select id="paMate" aria-label="${esc(X.without)}"><option value="">${esc(X.without)}</option>${mates.map(q => `<option value="${q.c}"${q.c === S.mate ? ' selected' : ''}>${esc(fill(X.withoutN, { n: nm(q) }))}</option>`).join('')}</select></div>
${g.length ? `<p class="sub"><b class="${H.rate >= 0.6 ? 'pos' : H.rate <= 0.4 ? 'neg' : ''}">${S.side === 'over' ? 'Over' : 'Under'} ${S.line}: ${pc(H.rate)}</b> (${esc(fill(X.of, { w: H.win, n: H.n - H.push }))}) · ${esc(X.avg)} ${f1(vals.reduce((a, b) => a + b, 0) / vals.length)} · ${esc(X.med)} ${f1(median(vals))}</p>${svg(g, vals)}` : `<p class="sub">${esc(X.noFilter)}</p>`}</section>`;
}
function svg(g, vals) {
  const W = 720, Ht = 250, top = 22, bot = 40, left = 8, n = g.length, bw = (W - left * 2) / Math.max(n, 5);
  const mx = Math.max(S.line * 1.25, ...vals, 1) * 1.1, y = v => top + (Ht - top - bot) * (1 - v / mx), yl = y(S.line);
  const bars = g.map((r, i) => {
    const v = vals[i], cls = v > S.line ? 'ov' : v < S.line ? 'un' : 'pu', x = left + i * bw + bw * 0.15, w = bw * 0.7, yy = y(v), h = Math.max(1.5, Ht - bot - yy);
    const tip = `${esc(X.round)} ${r[0]} · ${r[1]} · ${r[3] ? 'vs' : '@'} ${esc(tn(r[2]))} ${r[15]}-${r[16]} · ${f1(r[6])}′ · ${v}`;
    return `<g><rect class="${cls}" x="${x.toFixed(1)}" y="${(Ht - bot - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${tip}</title></rect><text class="v" x="${(x + w / 2).toFixed(1)}" y="${(Ht - bot - h - 5).toFixed(1)}" text-anchor="middle">${v}</text><text x="${(x + w / 2).toFixed(1)}" y="${Ht - bot + 15}" text-anchor="middle">${r[3] ? '' : '@'}${esc(r[2])}</text><text class="r" x="${(x + w / 2).toFixed(1)}" y="${Ht - bot + 29}" text-anchor="middle">${esc(X.round)}${r[0]}</text></g>`;
  }).join('');
  return `<svg class="pasvg" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${esc(X.chart)}">${bars}<line class="ln" x1="0" x2="${W}" y1="${yl.toFixed(1)}" y2="${yl.toFixed(1)}"/><text class="lt" x="${W - 4}" y="${(yl - 5).toFixed(1)}" text-anchor="end">${S.line}</text></svg>`;
}

// ---------- μοντέλο, αποδόσεις, ματσάρισμα
function side(p) {
  const nx = D.next[p.t], pj = p.pj?.[S.s], hasModel = MODEL_STATS.includes(S.s), L = hasModel ? linesOf(p.c, S.s).slice().sort((a, b) => a.l - b.l) : [];
  const cur = L.find(x => x.l === S.line), E = evaluate(pj, S.line, cur, D.blend);
  let m = `<section class="pacard"><h3>${esc(X.model)}</h3>`;
  if (!hasModel) m += `<p class="sub">${esc(X.noModel)}</p>`;
  else if (!pj) m += `<p class="sub">${esc(X.noProj)}</p>`;
  else {
    const fo = q => (q > 0 ? (1 / q).toFixed(2) : '–');
    m += `<div class="parows"><div><span>${esc(X.proj)}</span><b>${pj[0].toFixed(1)}</b> <small>± ${Math.sqrt(pj[1]).toFixed(1)}</small></div>
<div><span>${esc(X.expMin)}</span><b>${f1(p.min)}′</b>${p.base != null && Math.abs(p.min - p.base) >= 1 ? `<small>${esc(fill(X.minAdj, { a: p.base.toFixed(0), b: p.min.toFixed(0) }))}</small>` : ''}</div>
<div><span>${esc(X.pOver)} ${S.line}</span><b>${pc(E.pm)}</b> <small>${esc(X.fair)} ${fo(E.pm)}</small></div>
<div><span>${esc(X.pUnder)} ${S.line}</span><b>${pc(1 - E.pm)}</b> <small>${esc(X.fair)} ${fo(1 - E.pm)}</small></div></div>`;
  }
  m += '</section>';
  let o = '';
  if (hasModel) {
    o = `<section class="pacard"><h3>${esc(X.book)} · ${esc(X.stats[S.s])}</h3>`;
    if (!L.length) o += `<p class="sub">${esc(X.noBook)}</p>`;
    else {
      if (cur && E.pb != null) o += `<div class="parows"><div><span>${esc(X.mkt)}</span><b>${pc(E.mk)}</b> <small>Over</small></div><div><span>${esc(X.blendP)}</span><b>${pc(S.side === 'over' ? E.pb : 1 - E.pb)}</b> <small>${S.side === 'over' ? 'Over' : 'Under'}</small></div></div>`;
      o += `<div class="tbl"><table class="antbl palines"><thead><tr><th>${esc(X.line)}</th><th>Over</th><th>Under</th><th>${esc(X.model)}</th><th>EV</th><th></th></tr></thead><tbody>${L.map(x => {
        const e = evaluate(pj, x.l, x, D.blend), best = e.evO != null && (e.evU == null || e.evO >= e.evU) ? ['O', e.evO] : ['U', e.evU];
        const bk = a => (a ? `<b>${a[0].toFixed(2)}</b><br><small>${esc(a[1])}</small>` : '–');
        return `<tr class="${x.l === S.line ? 'cur' : ''}"><td><b>${x.l}</b></td><td title="${esc((x.o?.[2] || []).map(([t, q]) => `${t} ${q.toFixed(2)}`).join(' · '))}">${bk(x.o)}</td><td title="${esc((x.u?.[2] || []).map(([t, q]) => `${t} ${q.toFixed(2)}`).join(' · '))}">${bk(x.u)}</td><td>${pc(e.pm)}</td><td class="${best[1] >= 0.08 ? 'pos' : best[1] < 0 ? 'neg' : ''}">${best[1] == null ? '–' : `${best[0] === 'O' ? 'O' : 'U'} ${evs(best[1])}`}</td><td><button type="button" class="pause" data-l="${x.l}">${esc(X.useLine)}</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
    }
    o += '</section>';
  }
  let mu = '';
  const df = nx && D.def.teams[nx.opp]?.[p.pos]?.[S.s];
  if (df) {
    const n = D.def.n, cls = df[1] <= 5 ? 'pos' : df[1] > n - 5 ? 'neg' : '', lab = df[1] <= 5 ? X.easy : df[1] > n - 5 ? X.hard : X.neutral;
    mu = `<section class="pacard"><h3>${esc(X.matchup)} · <span class="${cls}">${esc(lab)}</span></h3><p>${esc(fill(X.defTxt, { o: tn(nx.opp), x: df[0].toFixed(1), s: X.stats[S.s].toLowerCase(), p: X.pos[p.pos] || p.pos, r: df[1], n, a: D.def.avg[p.pos][S.s].toFixed(1) }))}</p></section>`;
  }
  return `<div class="paside2">${m}${o}${mu}</div>`;
}

function render() {
  const p = BY[S.c];
  root.innerHTML = controls() + (p ? head(p) + cards(p) + `<div class="pagrid">${chartBox(p)}${side(p)}</div>` : '');
  bind();
}

// ---------- συμβάντα
function bind() {
  const q = $('#paQ'), sg = $('#paSugg');
  const show = () => {
    const t = fold(q.value.trim()); if (t.length < 2) { sg.hidden = true; return; }
    const L = D.players.filter(p => fold(p.n).includes(t) || fold(p.gr).includes(t) || fold(tn(p.t)).includes(t)).slice(0, 12);
    sg.innerHTML = L.map(p => `<button type="button" data-c="${p.c}"><span>${esc(nm(p))}</span><small>${esc(tn(p.t))}</small></button>`).join('');
    sg.hidden = !L.length;
  };
  q.addEventListener('input', show);
  q.addEventListener('focus', () => q.select());
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = sg.querySelector('button'); if (b) { e.preventDefault(); setPlayer(b.dataset.c); } } if (e.key === 'Escape') sg.hidden = true; });
  sg.addEventListener('click', e => { const b = e.target.closest('button[data-c]'); if (b) setPlayer(b.dataset.c); });
  root.querySelector('.pastat').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (b) setPlayer(S.c, b.dataset.s); });
  const L = $('#paL');
  const setLine = v => { if (!Number.isFinite(v) || v < 0) return; S.line = Math.round(v * 2) / 2; const m = linesOf(S.c, S.s).find(x => x.l === S.line); S.src = m ? 'book' : 'user'; S.srcBook = m ? m.o?.[1] || m.u?.[1] : null; render(); hash(); };
  L.addEventListener('change', () => setLine(parseFloat(String(L.value).replace(',', '.'))));
  root.querySelectorAll('.paline button[data-d]').forEach(b => b.addEventListener('click', () => setLine(S.line + +b.dataset.d)));
  root.querySelectorAll('.paside button').forEach(b => b.addEventListener('click', () => { S.side = b.dataset.side; render(); }));
  root.querySelectorAll('.pafil .seg').forEach(sgm => sgm.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const k = sgm.dataset.f; S[k] = k === 'range' ? +b.dataset.v : b.dataset.v; render(); }));
  const M = $('#paMate'); if (M) M.addEventListener('change', () => { S.mate = M.value; render(); });
  root.querySelectorAll('.pause').forEach(b => b.addEventListener('click', () => setLine(+b.dataset.l)));
  const sh = $('#paShare'); if (sh) sh.addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); sh.textContent = '✓ ' + X.copied; } catch { } });
}
document.addEventListener('click', e => { const sg = $('#paSugg'); if (sg && !e.target.closest('.pasearch')) sg.hidden = true; });

// ---------- πίνακας
const B = { stat: '', gid: '', src: '', side: '', hit: 0, sort: 'p', dir: -1, lim: 50 };
function boardHtml() {
  const games = [...new Set(Object.values(D.next).map(x => x.gid))].map(gid => { const [, r, h, a] = gid.split('-'); return { gid, h, a, t: D.next[h]?.t }; }).sort((x, y) => String(x.t).localeCompare(String(y.t)));
  let R = ROWS.filter(r => (!B.stat || r.s === B.stat) && (!B.gid || r.gid === B.gid) && (!B.src || r.src === B.src) && (!B.side || r.side === B.side) && (!B.hit || (r.L10.rate ?? 0) >= B.hit / 100));
  const key = { p: r => r.p, ev: r => r.ev ?? -9, L5: r => r.L5.rate ?? -1, L10: r => r.L10.rate ?? -1, all: r => r.all.rate ?? -1, h2h: r => r.h2h?.rate ?? -1, mu: r => r.mu ?? -1, price: r => r.price ?? 0, line: r => r.line }[B.sort];
  R = R.slice().sort((a, b) => B.dir * (key(a) - key(b)) || b.p - a.p);
  const sel = (id, opts, v) => `<select data-b="${id}">${opts.map(([k, l]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const th = (k, l) => `<th data-k="${k}" class="${B.sort === k ? (B.dir < 0 ? 'desc' : 'asc') : ''}" tabindex="0">${esc(l)}</th>`;
  const hr = h => (h && h.n ? `<span class="${h.rate >= 0.7 ? 'pos' : h.rate <= 0.3 ? 'neg' : ''}">${pc(h.rate)}</span><br><small>${h.win}/${h.n - h.push}</small>` : '–');
  const rows = R.slice(0, B.lim).map(r => { const p = BY[r.c], nx = D.next[r.t];
    return `<tr data-c="${r.c}" data-s="${r.s}" data-l="${r.line}" tabindex="0"><td class="l"><b>${esc(nm(p))}</b><br><small>${esc(tn(r.t))} ${nx.home ? 'vs' : '@'} ${esc(tn(nx.opp))}</small></td><td class="l">${esc(X.stats[r.s])} <b>${r.side === 'over' ? 'Over' : 'Under'} ${r.line}</b><br><small class="src ${r.src}">${esc(r.src === 'book' ? r.book || 'bookmaker' : X.srcModel)}</small></td><td>${hr(r.L5)}</td><td>${hr(r.L10)}</td><td>${hr(r.all)}</td><td>${hr(r.h2h)}</td><td>${f1(r.mu)}</td><td><b>${pc(r.p)}</b></td><td>${r.price ? r.price.toFixed(2) : '–'}</td><td class="${r.ev >= 0.08 ? 'pos' : r.ev < 0 ? 'neg' : ''}">${evs(r.ev)}</td></tr>`; }).join('');
  return `<div class="pafil">${sel('stat', [['', X.fAllS], ...MODEL_STATS.map(s => [s, X.stats[s]])], B.stat)}${sel('gid', [['', X.fAllG], ...games.map(g => [g.gid, `${tn(g.h)} – ${tn(g.a)}`])], B.gid)}${sel('src', [['', `${X.fSrc}: ${X.all}`], ['book', X.fBook], ['model', X.fModel]], B.src)}${sel('side', [['', `${X.fSide}: ${X.all}`], ['over', 'Over'], ['under', 'Under']], B.side)}${sel('hit', [[0, `${X.fHit}: –`], ...[50, 60, 70, 80, 90].map(v => [v, `${X.fHit} ${v}%`])], B.hit)}<small>${esc(fill(X.rows, { n: R.length }))}</small></div>
${R.length ? `<div class="tbl"><table class="antbl paboardt"><thead><tr><th class="l">${esc(X.player)}</th>${th('line', X.market)}${th('L5', 'L5')}${th('L10', 'L10')}${th('all', X.season)}${th('h2h', 'H2H')}${th('mu', X.proj)}${th('p', X.prob)}${th('price', X.odds)}${th('ev', 'EV')}</tr></thead><tbody>${rows}</tbody></table></div>${R.length > B.lim ? `<p><button type="button" class="pamore">${esc(X.more)}</button></p>` : ''}` : `<p class="sub">${esc(X.empty)}</p>`}`;
}
function renderBoard() {
  boardEl.innerHTML = boardHtml();
  boardEl.querySelectorAll('select[data-b]').forEach(s => s.addEventListener('change', () => { const k = s.dataset.b; B[k] = k === 'hit' ? +s.value : s.value; B.lim = 50; renderBoard(); }));
  boardEl.querySelectorAll('th[data-k]').forEach(t => { const go = () => { const k = t.dataset.k; B.dir = B.sort === k ? -B.dir : -1; B.sort = k; renderBoard(); }; t.addEventListener('click', go); t.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); });
  const mo = boardEl.querySelector('.pamore'); if (mo) mo.addEventListener('click', () => { B.lim += 50; renderBoard(); });
  boardEl.querySelectorAll('tr[data-c]').forEach(tr => { const go = () => { const r = ROWS.find(x => x.c === tr.dataset.c && x.s === tr.dataset.s); S.side = r?.side || 'over'; setPlayer(tr.dataset.c, tr.dataset.s, +tr.dataset.l); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); });
}

// ---------- εκκίνηση
(async () => {
  try { D = await fetch(CTX.data).then(r => r.json()); } catch { root.innerHTML = '<p class="sub">–</p>'; return; }
  for (const p of D.players) { BY[p.c] = p; BYS[p.s] = p; }
  ROWS = board(D, CTX.lines);
  const h = new URLSearchParams(location.hash.slice(1)), hp = BYS[h.get('p')];
  if (hp) { const s = ALL_STATS.includes(h.get('s')) ? h.get('s') : 'pts', l = parseFloat(h.get('l')); setPlayer(hp.c, s, Number.isFinite(l) ? l : null); }
  else {
    const top = ROWS.filter(r => r.src === 'book').sort((a, b) => (b.ev ?? -9) - (a.ev ?? -9))[0] || ROWS.filter(r => r.s === 'pts').sort((a, b) => (b.mu ?? 0) - (a.mu ?? 0))[0];
    if (top) { S.side = top.side; S.c = top.c; S.s = top.s; S.line = top.line; S.src = top.src; S.srcBook = top.book; render(); }
    else if (D.players[0]) setPlayer(D.players[0].c);
  }
  renderBoard();
})();
