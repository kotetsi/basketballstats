// Optimizer v2 (browser): ακριβής βελτιστοποίηση, multi-turn plan, εξηγήσεις, σύγκριση με την ομάδα σου.
import { solve, validate, objectiveOf } from './solver.mjs';
import { planTurns } from './turns.mjs';
import { explain } from './explain.mjs';
import { simulate } from './whatif.mjs';
import { riskScore } from './captain.mjs';
import { FORMATIONS } from './rules.mjs';

const X = JSON.parse(document.getElementById('optctx').textContent), L = X.L;
const app = document.getElementById('optApp'), out = document.getElementById('optOut');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = v => (v == null || isNaN(v) ? '–' : (+v).toFixed(1));
const sg = v => (v == null ? '–' : `<span class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v > 0 ? '+' : ''}${(+v).toFixed(1)}</span>`);
let D, P, state = { lock: [], exclude: [], sold: [] }, last = null;
const tm = t => esc(X.teams[t] || t), nm = c => esc(P.get(c)?.dn || c);
const pl = c => { const p = P.get(c); return p ? `<a href="${X.base}${p.s}/">${esc(p.dn)}</a>` : esc(c); };
const myTeam = () => { try { const S = JSON.parse(localStorage.getItem('fmt-v1')); return S?.teams?.[S.active] || null; } catch { return null; } };
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };

async function init() {
  D = await fetch(X.api, { cache: 'no-cache' }).then(r => r.json());
  P = new Map(D.players.map(p => [p.c, p]));
  Object.assign(state, store.get('opt-v2') || {});
  renderControls();
  const pre = X.pre?.[form().mode];
  if (pre && !state.lock.length && !state.exclude.length && !state.sold.length && +form().budget === 100 && +form().maxPerTeam === 6 && form().formation === 'auto') { last = pre; show(); } else run();
}
const form = () => Object.fromEntries(new FormData(app.querySelector('#optForm')));

function chips(list, kind) { return list.map(c => `<span class="witr">${nm(c)} <button type="button" data-rm="${kind}" data-c="${c}">✕</button></span>`).join(''); }
function renderControls() {
  const f = app.querySelector('#optForm');
  const dl = `<datalist id="optPl">${D.players.filter(p => p.opp).map(p => `<option value="${esc(p.dn)} · ${esc(X.teams[p.t] || p.t)} · ${p.price}">`).join('')}</datalist>`;
  app.querySelector('#optLists').innerHTML = `${dl}
<label>🔒 ${esc(L.lock)} <input type="search" list="optPl" data-add="lock" placeholder="${esc(L.search)}"></label><span>${chips(state.lock, 'lock')}</span>
<label>🚫 ${esc(L.exclude)} <input type="search" list="optPl" data-add="exclude" placeholder="${esc(L.search)}"></label><span>${chips(state.exclude, 'exclude')}</span>
<label>↩ ${esc(L.sold)} <input type="search" list="optPl" data-add="sold" placeholder="${esc(L.search)}"></label><span>${chips(state.sold, 'sold')}</span>`;
  if (f && state.f) for (const [k, v] of Object.entries(state.f)) if (f.elements[k] && f.elements[k].type !== 'checkbox') f.elements[k].value = v;
}

function run() {
  const fv = form();
  state.f = fv; store.set('opt-v2', state);
  const btn = app.querySelector('[data-act="run"]'); btn.disabled = true; btn.textContent = L.running;
  setTimeout(() => {
    const t0 = Date.now();
    const o = { budget: +fv.budget || 100, maxPerTeam: +fv.maxPerTeam || 6, mode: fv.mode, formation: fv.formation, lock: state.lock, exclude: state.exclude, sold: state.sold, coach: fv.coach || null, timeLimitMs: 3000 };
    const pool = D.players.filter(p => p.opp || o.lock.includes(p.c));
    const sol = solve(pool, D.coaches.filter(c => c.opp), o);
    let plan = null, ex = null;
    if (sol.start) { plan = planTurns(sol.roster, sol.coach, pool, D.coaches, D.days, { mode: o.mode, formation: o.formation, nSim: 400, topK: 100 }); ex = explain(sol, pool, D.coaches, o); }
    last = { sol, plan, explain: ex, opts: o, ms: Date.now() - t0 };
    btn.disabled = false; btn.textContent = L.run;
    show();
  }, 20);
}

function metrics(lu, coach) {
  if (!lu) return null;
  return simulate({ start: lu.start, sixth: lu.sixth, bench: lu.bench, captain: lu.captain, coach, formation: 'auto' }, D.players, D.coaches);
}

function show() {
  const { sol, plan, explain: ex } = last;
  if (!sol.start) {
    out.innerHTML = `<div class="fmerr"><b>${esc(L.infeasible)}</b><ul>${(sol.errors || []).map(e => `<li>${esc((L.err[e.k] || e.k).replace('{pos}', L.pos[e.pos] || '').replace('{n}', e.n ?? '').replace('{t}', X.teams[e.t] || e.t || '').replace('{cost}', e.cost ?? '').replace('{c}', P.get(e.c)?.dn || e.c || ''))}</li>`).join('')}</ul></div>`;
    return;
  }
  // τελική σύνθεση: από τον multi-turn planner (μπορεί να κρατήσει παίκτη στον πάγκο για επόμενη μέρα), αλλιώς η στατική
  const lu = plan ? plan.lineup : { formation: sol.formation, start: sol.start, sixth: sol.sixth, bench: sol.bench, captain: sol.captain, coach: sol.coach };
  if (last.capOverride && lu.start.includes(last.capOverride)) lu.captain = last.capOverride;
  const coachT = last.coachOverride || lu.coach || sol.coach;
  const m = metrics(lu, coachT);
  const capRisk = riskScore(P.get(lu.captain)).score, benchRisk = Math.round(lu.bench.reduce((s, c) => s + riskScore(P.get(c)).score, 0) / lu.bench.length);
  const errs = validate({ ...lu, coach: coachT, formation: lu.formation }, D.players, D.coaches, last.opts);
  const why = Object.fromEntries((ex?.players || []).map(x => [x.c, x.reasons]));
  const rs = c => (why[c] || []).map(k => `<span class="why">${esc(L.why[k] || k)}</span>`).join(' ');
  const row = (c, slot) => { const p = P.get(c), cap = c === lu.captain; const pts = (p.pp || 0) * (1 + 0.1 * (p.pwin ?? 0.5)) * (slot === 'bench' ? 0.5 : 1) * (cap ? 2 : 1);
    return `<tr><td class="l">${cap ? '© ' : ''}${pl(c)}<small class="tmsub">${tm(p.t)} · ${esc(L.pos[p.pos])} · ${f1(p.price)} cr · ${esc(X.days[p.day] || '')}${p.status !== 'playing' ? ' · <b class="fxst fxst-' + p.status + '">' + esc(L.st[p.status] || p.status) + '</b>' : ''}</small></td><td>${esc(cap ? L.slot.captain : L.slot[slot])}</td><td>${f1(p.p10)} / <b>${f1(p.pp)}</b> / ${f1(p.p90)}</td><td><b>${f1(pts)}</b></td><td class="l">${rs(c)}</td></tr>`; };
  const expo = Object.entries(m.exposure).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<span class="expo"><i style="width:${(100 * n) / 6}%" class="${n >= 5 ? 'hi' : ''}"></i><b>${tm(t)}</b> ${n}/6</span>`).join('');
  // σύγκριση με την ομάδα μου
  const me = myTeam(); let cmp = '';
  if (me && me.roster?.length === 10) {
    const myRo = me.roster.filter(c => P.has(c));
    if (myRo.length === 10) {
      const myLu = (() => { const s = solve(D.players.filter(p => myRo.includes(p.c)), D.coaches, { budget: 999, mode: last.opts.mode, lock: myRo, coach: me.coach || null, maxPerTeam: 10 }); return s.start ? s : null; })();
      if (myLu) { const mm = metrics(myLu, me.coach || myLu.coach); const sell = myRo.filter(c => !m.lineup.start.concat(m.lineup.bench, [m.lineup.sixth]).includes(c)); const buy = [...lu.start, lu.sixth, ...lu.bench].filter(c => !myRo.includes(c));
        cmp = `<h3>${esc(L.vsMine)}</h3><ul class="fmkpi"><li>${esc(L.expected)} ${f1(mm.expected)} → <b>${f1(m.expected)}</b> (${sg(m.expected - mm.expected)})</li><li>Floor ${f1(mm.floor)} → ${f1(m.floor)}</li><li>Ceiling ${f1(mm.ceiling)} → ${f1(m.ceiling)}</li><li>Risk ${mm.risk} → ${m.risk}</li></ul><p class="sub">${esc(L.changes)}: ${sell.length ? sell.map(c => '−' + nm(c)).join(', ') + ' · ' + buy.map(c => '+' + nm(c)).join(', ') : esc(L.noChanges)}</p>`; }
    }
  }
  const turns = plan ? plan.turns.map(t => `<div class="fmturn ${t.state}"><h3>Turn ${t.turn + 1} · ${esc(X.days[t.turn] || '')}</h3><p class="sub">${esc(L.plays)}: ${t.playing.map(c => (lu.bench.includes(c) ? '<i>' + nm(c) + '</i>' : nm(c))).join(', ') || '–'}</p><p>© ${esc(L.captain)}: <b>${t.captain ? nm(t.captain) : '–'}</b></p>${t.subs.length ? `<ul>${t.subs.slice(0, 4).map(s => `<li>${s.k === 'captain' ? esc(L.capRule.replace('{a}', P.get(s.from)?.dn || '').replace('{x}', s.threshold).replace('{b}', P.get(s.to)?.dn || '')) : esc(L.swapRule.replace('{a}', P.get(s.down)?.dn || '').replace('{x}', s.threshold).replace('{b}', P.get(s.up)?.dn || ''))} <small>(${Math.round(100 * s.freq)}% ${esc(L.ofSims)})</small></li>`).join('')}</ul>` : ''}<p><b>${f1(t.expected)}</b> ${esc(L.ptsTurn)}</p></div>`).join('') : '';
  const held = plan?.heldBack?.length ? `<p class="fmswap">💡 ${esc(L.held.replace('{p}', plan.heldBack.map(h => P.get(h.c)?.dn).join(', ')).replace('{g}', f1(plan.gainFromTurns)))}</p>` : plan && plan.multiTurn ? `<p class="sub">${esc(L.turnGain.replace('{g}', f1(plan.gainFromTurns)))}</p>` : '';
  const notSel = (ex?.notSelected || []).slice(0, 8).map(x => `<li>${pl(x.c)} <small>${tm(P.get(x.c).t)} · ${f1(P.get(x.c).price)} cr · ${f1(P.get(x.c).pp)}</small> — ${x.reasons.map(k => esc(L.why[k] || k)).join(', ')}</li>`).join('');
  const st = { optimal: L.optimal, feasible_timeout: L.timeout }[sol.status] || sol.status;
  out.innerHTML = `<p class="optst ${sol.status}">${esc(st)} · ${esc(L.mode[last.opts.mode])} · ${sol.nodes} ${esc(L.nodes)} · ${last.ms ?? sol.runtimeMs} ms</p>
${errs.length ? `<ul class="fmerr">${errs.map(e => `<li>${esc((L.err[e.k] || e.k).replace('{c}', P.get(e.c)?.dn || ''))}</li>`).join('')}</ul>` : `<p class="optok">✓ ${esc(L.valid)}</p>`}
<div class="wigrid"><div class="wik"><span>${esc(L.expected)}${plan?.multiTurn ? ' (' + esc(L.withTurns) + ')' : ''}</span><b>${f1(plan ? plan.expected : m.expected)}</b></div><div class="wik"><span>Floor (P10)</span><b>${f1(plan ? plan.floor : m.floor)}</b></div><div class="wik"><span>Median</span><b>${f1(plan ? plan.median : m.median)}</b></div><div class="wik"><span>Ceiling (P90)</span><b>${f1(plan ? plan.ceiling : m.ceiling)}</b></div><div class="wik"><span>Risk</span><b>${m.risk}</b></div><div class="wik"><span>${esc(L.capRisk)}</span><b>${capRisk}</b></div><div class="wik"><span>${esc(L.benchRisk)}</span><b>${benchRisk}</b></div><div class="wik"><span>${esc(L.budget)}</span><b>${f1(m.cost)}</b><small>${esc(L.left)} ${f1(m.budget)}</small></div></div>
<div class="expow"><span class="sub">${esc(L.exposure)}</span>${expo}</div>
<div class="fxfilters"><label>${esc(L.captain)} <select data-cap>${lu.start.map(c => `<option value="${c}"${c === lu.captain ? ' selected' : ''}>${nm(c)}</option>`).join('')}</select></label><label>${esc(L.coach)} <select data-coach>${D.coaches.filter(c => c.opp).map(c => `<option value="${c.t}"${c.t === coachT ? ' selected' : ''}>${tm(c.t)} · ${f1(c.price)} · ${f1(c.exp)}</option>`).join('')}</select></label><span class="sub">${esc(L.coachWhy)}: ${(ex?.coach?.reasons || []).map(k => esc(L.why[k] || k)).join(', ')}</span></div>
<div class="tbl"><table class="antbl"><thead><tr><th class="l">${esc(L.player)} (${esc(lu.formation)})</th><th>${esc(L.slotH)}</th><th title="${esc(L.rangeTip)}">P10 / ${esc(L.proj)} / P90</th><th>${esc(L.fp)}</th><th class="l">${esc(L.whyH)}</th></tr></thead><tbody>${lu.start.map(c => row(c, 'start')).join('')}${row(lu.sixth, 'sixth')}${lu.bench.map(c => row(c, 'bench')).join('')}</tbody></table></div>
${held}${cmp}
${plan ? `<h3>${esc(L.turnPlan)}</h3><div class="fmtimeline">${turns}</div>` : ''}
<h3>${esc(L.notSelH)}</h3><ul class="optns">${notSel}</ul>
<p class="fmbtns"><button type="button" data-act="alts">${esc(L.alts)}</button> <button type="button" data-act="save">${esc(L.saveMine)}</button> <button type="button" data-act="csv">CSV</button> <button type="button" data-act="copy">${esc(L.copy)}</button></p><div data-alts></div>`;
  last.view = { lu, coachT, m };
}

app.addEventListener('click', e => {
  const b = e.target.closest('[data-act],[data-rm]'); if (!b) return;
  if (b.dataset.rm) { state[b.dataset.rm] = state[b.dataset.rm].filter(c => c !== b.dataset.c); store.set('opt-v2', state); return renderControls(); }
  const a = b.dataset.act;
  if (a === 'run') return run();
  if (!last?.view) return;
  const { lu, coachT, m } = last.view;
  if (a === 'alts') {
    const o = last.opts, pool = D.players.filter(p => p.opp);
    const free = c => !o.lock.includes(c);
    const capF = free(lu.captain) ? lu.captain : lu.start.filter(free).sort((x, y) => P.get(y).pp - P.get(x).pp)[0];
    const topF = [...lu.start, lu.sixth, ...lu.bench].filter(free).sort((x, y) => P.get(y).price - P.get(x).price)[0];
    const variants = [[L.altNoCap, capF ? [capF] : []], [L.altNoTop, topF ? [topF] : []], [L.altNoTeam, lu.start.concat(lu.bench, [lu.sixth]).filter(c => free(c) && P.get(c).t === Object.entries(m.exposure).sort((x, y) => y[1] - x[1])[0][0])]].filter(v => v[1].length);
    const base = last.sol.objective;
    b.parentElement.nextElementSibling.innerHTML = `<ol class="optalts">${variants.map(([lbl, ex]) => { const s = solve(pool, D.coaches.filter(c => c.opp), { ...o, exclude: [...o.exclude, ...ex], timeLimitMs: 1500 }); if (!s.start) return `<li>${esc(lbl)}: ${esc(L.infeasible)}</li>`; const add = s.roster.filter(c => !last.sol.roster.includes(c)), rem = last.sol.roster.filter(c => !s.roster.includes(c)); return `<li><b>${esc(lbl)}</b> (${sg(s.objective - base)}): ${rem.map(c => '−' + nm(c)).join(', ')} · ${add.map(c => '+' + nm(c)).join(', ')}</li>`; }).join('')}</ol>`;
  }
  if (a === 'save') {
    let S = null; try { S = JSON.parse(localStorage.getItem('fmt-v1')); } catch { }
    S = S || { teams: [{ id: Date.now().toString(36), name: 'Ομάδα 1', roster: [], coach: null, formation: 'auto', captain: null, transfers: 2, bank: null }], active: 0 };
    const t = S.teams[S.active]; t.roster = [...lu.start, lu.sixth, ...lu.bench]; t.coach = coachT; t.captain = lu.captain; t.formation = lu.formation; t.bank = null;
    try { localStorage.setItem('fmt-v1', JSON.stringify(S)); b.textContent = '✓ ' + L.saved; } catch { }
  }
  if (a === 'csv' || a === 'copy') {
    const rows = [['slot', 'player', 'team', 'position', 'price', 'p10', 'projected_pir', 'p90'], ...[...lu.start.map(c => [c === lu.captain ? 'captain' : 'start', c]), [ 'sixth', lu.sixth ], ...lu.bench.map(c => ['bench', c])].map(([s, c]) => { const p = P.get(c); return [s, p.dn, p.t, p.pos, p.price, p.p10, p.pp, p.p90]; }), ['coach', coachT, '', '', D.coaches.find(c => c.t === coachT)?.price ?? '', '', '', ''], ['total', '', '', '', m.cost, m.floor, m.expected, m.ceiling]];
    const txt = rows.map(r => r.map(x => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x)).join(',')).join('\n');
    if (a === 'csv') { const blob = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }); const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `optimizer-${D.round}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 2000); }
    else { const t2 = `${lu.formation} · ${L.captain}: ${P.get(lu.captain).dn}\n` + lu.start.map(c => 'S ' + P.get(c).dn).join('\n') + `\n6 ${P.get(lu.sixth).dn}\n` + lu.bench.map(c => 'B ' + P.get(c).dn).join('\n') + `\n${L.coach}: ${X.teams[coachT] || coachT}\n${L.expected}: ${f1(m.expected)}`; navigator.clipboard?.writeText(t2).then(() => { b.textContent = L.copied; }).catch(() => prompt(L.copy, t2)); }
  }
});
app.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.add) {
    const name = el.value.split(' · ')[0].trim(), p = D.players.find(x => x.dn === name); if (!p) return;
    const k = el.dataset.add; for (const kk of ['lock', 'exclude', 'sold']) state[kk] = state[kk].filter(c => c !== p.c);
    state[k].push(p.c); store.set('opt-v2', state); renderControls(); return;
  }
  if (el.matches('[data-cap]')) { last.capOverride = el.value; return show(); }
  if (el.matches('[data-coach]')) { last.coachOverride = el.value; return show(); }
});
app.querySelector('#optForm').addEventListener('submit', e => { e.preventDefault(); run(); });
void FORMATIONS; void objectiveOf;
init();
