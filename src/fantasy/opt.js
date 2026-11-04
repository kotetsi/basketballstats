// Optimizer v2 (browser): ακριβής βελτιστοποίηση, multi-turn plan, εξηγήσεις, σύγκριση με την ομάδα σου.
import { solve, validate, objectiveOf } from './solver.mjs';
import { planTurns } from './turns.mjs';
import { explain } from './explain.mjs';
import { simulate } from './whatif.mjs';
import { riskScore } from './captain.mjs';
import { FORMATIONS } from './rules.mjs';
import { contributions, reasonsFor, sentence, keyFactors, alternatives, compare, sensitivity, lineupCSV } from './insight.mjs';
import { saveScenario, MAX_SCEN } from './whatif.mjs';

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
  last.view = { lu, coachT, m };
  const optimalHTML = `<p class="optst ${sol.status}">${esc(st)} · ${esc(L.mode[last.opts.mode])} · ${sol.nodes} ${esc(L.nodes)} · ${last.ms ?? sol.runtimeMs} ms</p>
${errs.length ? `<ul class="fmerr">${errs.map(e => `<li>${esc((L.err[e.k] || e.k).replace('{c}', P.get(e.c)?.dn || ''))}</li>`).join('')}</ul>` : `<p class="optok">✓ ${esc(L.valid)}</p>`}
<div class="wigrid"><div class="wik"><span>${esc(L.expected)}${plan?.multiTurn ? ' (' + esc(L.withTurns) + ')' : ''}</span><b>${f1(plan ? plan.expected : m.expected)}</b></div><div class="wik"><span>Floor (P10)</span><b>${f1(plan ? plan.floor : m.floor)}</b></div><div class="wik"><span>Median</span><b>${f1(plan ? plan.median : m.median)}</b></div><div class="wik"><span>Ceiling (P90)</span><b>${f1(plan ? plan.ceiling : m.ceiling)}</b></div><div class="wik"><span>Risk</span><b>${m.risk}</b></div><div class="wik"><span>${esc(L.capRisk)}</span><b>${capRisk}</b></div><div class="wik"><span>${esc(L.benchRisk)}</span><b>${benchRisk}</b></div><div class="wik"><span>${esc(L.budget)}</span><b>${f1(m.cost)}</b><small>${esc(L.left)} ${f1(m.budget)}</small></div></div>
<div class="expow"><span class="sub">${esc(L.exposure)}</span>${expo}</div>
<div class="fxfilters"><label>${esc(L.captain)} <select data-cap>${lu.start.map(c => `<option value="${c}"${c === lu.captain ? ' selected' : ''}>${nm(c)}</option>`).join('')}</select></label><label>${esc(L.coach)} <select data-coach>${D.coaches.filter(c => c.opp).map(c => `<option value="${c.t}"${c.t === coachT ? ' selected' : ''}>${tm(c.t)} · ${f1(c.price)} · ${f1(c.exp)}</option>`).join('')}</select></label><span class="sub">${esc(L.coachWhy)}: ${(ex?.coach?.reasons || []).map(k => esc(L.why[k] || k)).join(', ')}</span></div>
<div class="tbl"><table class="antbl"><thead><tr><th class="l">${esc(L.player)} (${esc(lu.formation)})</th><th>${esc(L.slotH)}</th><th title="${esc(L.rangeTip)}">P10 / ${esc(L.proj)} / P90</th><th>${esc(L.fp)}</th><th class="l">${esc(L.whyH)}</th></tr></thead><tbody>${lu.start.map(c => row(c, 'start')).join('')}${row(lu.sixth, 'sixth')}${lu.bench.map(c => row(c, 'bench')).join('')}</tbody></table></div>
${held}${cmp}
${plan ? `<h3>${esc(L.turnPlan)}</h3><div class="fmtimeline">${turns}</div>` : ''}
<h3>${esc(L.notSelH)}</h3><ul class="optns">${notSel}</ul>
<p class="fmbtns"><button type="button" data-otab="alts">${esc(L.alts)} →</button> <button type="button" data-act="save">${esc(L.saveMine)}</button> <button type="button" data-act="csv">CSV</button> <button type="button" data-act="copy">${esc(L.copy)}</button></p><div data-alts></div>`;
  const tab = last.tab || 'opt';
  const tabs = `<nav class="fmtabs otabs">${[['opt', L.I.tabs.opt], ['why', L.I.tabs.why], ['alts', L.I.tabs.alts], ['sens', L.I.tabs.sens]].map(([k, l]) => `<button type="button" data-otab="${k}" aria-selected="${k === tab}">${esc(l)}</button>`).join('')}</nav>`;
  const body = tab === 'why' ? whyHTML() : tab === 'alts' ? altsHTML() : tab === 'sens' ? sensHTML() : optimalHTML;
  out.innerHTML = tabs + body + `<p class="note">${esc(L.I.disc)}</p>`;
}

// ---------- Why this lineup?
const I = () => L.I;
const pctS = v => (v == null ? '–' : Math.round(100 * v) + '%');
function bars(items, max, fmt = f1) {
  return `<div class="cbars">${items.map(x => `<div class="cbar"><span class="cl">${x.label}</span><span class="ct"><i style="width:${Math.max(1, (100 * Math.abs(x.v)) / (max || 1))}%" class="${x.cls || ''}"></i></span><b>${fmt(x.v)}</b></div>`).join('')}</div>`;
}
function stacked(C) {
  const cols = { start: '#e4572e', sixth: '#f2a07b', bench: '#9aa5b1', captain: '#8a1c14', coach: '#3b6fd8' };
  const parts = [...C.rows.map(x => ({ k: x.slot, v: x.base, c: x.c })), ...C.rows.filter(x => x.captain).map(x => ({ k: 'captain', v: x.captainExtra, c: x.c })), ...(C.coach ? [{ k: 'coach', v: C.coach.points, c: C.coach.t }] : [])].filter(x => x.v > 0);
  const tot = parts.reduce((s, x) => s + x.v, 0) || 1;
  const agg = {}; for (const p of parts) agg[p.k] = (agg[p.k] || 0) + p.v;
  return `<div class="stack">${parts.map(p => `<i style="width:${(100 * p.v) / tot}%;background:${cols[p.k]}" title="${esc(p.k === 'coach' ? (X.teams[p.c] || p.c) : P.get(p.c)?.dn)} · ${f1(p.v)}"></i>`).join('')}</div><p class="rleg">${Object.entries(agg).map(([k, v]) => `<span><i style="background:${cols[k]}"></i>${esc(I().slots[k])} ${f1(v)} (${pctS(v / tot)})</span>`).join('')}</p>`;
}
function whyHTML() {
  const { lu, coachT } = last.view, luC = { ...lu, coach: coachT };
  const pool = D.players.filter(p => p.opp);
  const C = contributions(luC, D.players, D.coaches), K = keyFactors(luC, D.players, D.coaches, last.opts);
  const dec = c => (c === lu.captain ? 'captain' : lu.start.includes(c) ? 'start' : c === lu.sixth ? 'sixth' : 'bench');
  const rows = C.rows.map(x => { const p = P.get(x.c), R = reasonsFor(x.c, dec(x.c), lu, D.players, pool), F = R.features;
    return `<tr><td class="l">${x.captain ? '© ' : ''}${pl(x.c)}<small class="tmsub">${tm(p.t)} · ${esc(L.pos[p.pos])} · ${esc(I().slots[x.captain ? 'captain' : x.slot])}${(p.gp ?? 9) < 3 ? ' · ⚠ ' + esc(I().small) : ''}</small><p class="whys">${esc(sentence(dec(x.c), R.reasons, I()))}</p></td>
<td>${f1(F.pp)}</td><td>${f1(F.min)}</td><td>${F.pirpm == null ? '–' : (+F.pirpm).toFixed(2)}</td><td>${F.ppc.toFixed(2)}</td><td>${pctS(F.start)}</td><td>${esc(L.st[F.status] || F.status)}</td><td>${f1(F.odrtg)}</td><td>${f1(F.pace)}</td><td>${F.home ? esc(I().home) : esc(I().away)}</td><td>${F.rest ?? '–'}</td><td>${F.b2b ? 'B2B' : '–'}</td><td>${f1(F.form.l3)} / ${f1(F.form.l10)}</td><td><b>${f1(x.points)}</b> <small>${pctS(x.share)}</small></td></tr>`; }).join('');
  const H = I().cols.map((h, i) => `<th${i === 0 ? ' class="l"' : ''} title="${esc(I().tips[i] || '')}">${esc(h)}</th>`).join('');
  const maxP = Math.max(...C.rows.map(x => x.points));
  const cb = bars(C.rows.map(x => ({ label: (x.captain ? '© ' : '') + nm(x.c), v: x.points, cls: x.slot })).concat(C.coach ? [{ label: '🧑‍💼 ' + tm(C.coach.t), v: C.coach.points, cls: 'coach' }] : []), maxP);
  const rb = bars(C.rows.map(x => ({ label: nm(x.c), v: 100 * x.riskShare })).sort((a, b) => b.v - a.v), 100, v => Math.round(v) + '%');
  const fl = bars(C.rows.map(x => ({ label: nm(x.c), v: x.floor, cls: x.floor < 0 ? 'neg' : '' })), Math.max(...C.rows.map(x => Math.abs(x.floor))));
  const vb = bars(C.rows.map(x => ({ label: nm(x.c), v: x.perCredit })).sort((a, b) => b.v - a.v), Math.max(...C.rows.map(x => x.perCredit)), v => (+v).toFixed(2));
  const fmtP = (n, v) => (v == null ? '–' : n === 'maxTeam' ? (X.teams[v] || v) : n === 'cap' ? (P.get(v)?.dn || v) : ['g', 'f', 'cc', 'share'].includes(n) ? pctS(v) : v);
  const kf = K.map(k => `<div class="kf ${k.available === false ? 'na' : ''}" title="${esc(I().kf[k.k].tip || '')}"><span>${esc(I().kf[k.k].t)}</span><b>${k.score == null ? '–' : k.score}</b><p>${esc(I().kf[k.k].d.replace(/\{(\w+)\}/g, (_, n) => fmtP(n, k.p[n])))}</p></div>`).join('');
  return `<section class="fmsec"><h2>${esc(I().tabs.why)}</h2>
<p class="sub">${esc(I().totalLine.replace('{t}', f1(C.total)).replace('{f}', f1(C.floor)).replace('{c}', f1(C.ceiling)).replace('{cap}', f1(C.captainExtra)).replace('{coach}', f1(C.coach?.points ?? 0)))}</p>
<h3>${esc(I().compH)}</h3>${stacked(C)}
<div class="gcols"><div><h3>${esc(I().contribH)}</h3>${cb}</div><div><h3>${esc(I().riskH)}</h3>${rb}</div><div><h3>${esc(I().floorH)}</h3>${fl}</div><div><h3>${esc(I().valueH)}</h3>${vb}</div></div>
<h3>${esc(I().kfH)}</h3><div class="kfs">${kf}</div>
<h3>${esc(I().playersH)}</h3><div class="tbl"><table class="antbl whytbl"><thead><tr>${H}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

// ---------- Alternatives
function altsHTML() {
  const { lu, coachT } = last.view, main = { ...lu, coach: coachT };
  if (!last.alts || last.altsKey !== JSON.stringify(main)) {
    const o = last.opts, pool = D.players.filter(p => p.opp || (o.lock || []).includes(p.c));
    last.alts = alternatives(pool, D.coaches.filter(c => c.opp), { budget: o.budget, maxPerTeam: o.maxPerTeam, formation: o.formation, lock: o.lock, exclude: o.exclude, sold: o.sold, timeLimitMs: 2000, days: D.days, nSim: 200, topK: 40 }, main);
    last.altsKey = JSON.stringify(main);
  }
  const mm = compare(main, main, D.players, D.coaches, last.opts.budget).a;
  const cell = (v, d, better = 1) => `<td class="${d == null || Math.abs(d) < 0.05 ? 'neu' : d * better > 0 ? 'good' : 'bad'}">${f1(v)}${d != null && Math.abs(d) >= 0.05 ? ` <small>(${d > 0 ? '+' : ''}${f1(d)})</small>` : ''}</td>`;
  const cards = last.alts.map((a, i) => {
    if (!a.available) return `<div class="altc na"><h3>${esc(I().strat[a.k].t)}</h3><p class="sub">${esc(I().strat[a.k].d)}</p><p class="fmwarn">${esc(a.why === 'ownership' ? I().noOwnership : I().noFeasible)}</p></div>`;
    const d = a.diff.delta, ch = a.diff.players.filter(x => x.change !== 'same');
    return `<div class="altc"><h3>${esc(I().strat[a.k].t)}</h3><p class="sub">${esc(I().strat[a.k].d)}</p>
<table class="antbl alttbl"><tbody><tr><td class="l">${esc(L.expected)}</td>${cell(a.expected, d.expected)}</tr><tr><td class="l">Floor</td>${cell(a.floor, d.floor)}</tr><tr><td class="l">Median</td>${cell(a.median, d.median)}</tr><tr><td class="l">Ceiling</td>${cell(a.ceiling, d.ceiling)}</tr><tr><td class="l">Risk</td>${cell(a.risk, d.risk, -1)}</tr><tr><td class="l">${esc(L.left)}</td>${cell(a.budgetLeft, d.budgetLeft)}</tr></tbody></table>
<p><b>© ${nm(a.lineup.captain)}</b> · ${esc(L.coach)} ${tm(a.lineup.coach)} · ${esc(a.lineup.formation)}</p>
<p class="sub">${ch.length ? ch.map(x => `<span class="chg ${x.change}">${x.change === 'in' ? '+' : x.change === 'out' ? '−' : '↕'} ${nm(x.c)}${x.change === 'slot' ? ` <small>${esc(I().slots[x.a])}→${esc(I().slots[x.b])}</small>` : ''}</span>`).join(' ') : esc(I().same)}</p>
<p class="fmbtns"><button type="button" data-alt="${i}" data-aact="cmp">${esc(I().cmp)}</button> <button type="button" data-alt="${i}" data-aact="load">${esc(I().load)}</button> <button type="button" data-alt="${i}" data-aact="scen">${esc(I().scen)}</button> <button type="button" data-alt="${i}" data-aact="csv">CSV</button> <button type="button" data-alt="${i}" data-aact="copy">${esc(L.copy)}</button></p></div>`;
  }).join('');
  const sel = last.cmpIdx != null ? last.alts[last.cmpIdx] : null;
  let cmpH = '';
  if (sel?.available) {
    const D2 = sel.diff, slotL = s => (s ? esc(I().slots[s]) : '–');
    const pr = D2.players.sort((x, y) => ['captain', 'start', 'sixth', 'bench', null].indexOf(x.a) - ['captain', 'start', 'sixth', 'bench', null].indexOf(y.a)).map(x => `<tr class="chg-${x.change}"><td class="l">${pl(x.c)} <small>${tm(P.get(x.c).t)}</small></td><td>${slotL(x.a)}</td><td>${slotL(x.b)}</td><td>${f1(P.get(x.c).pp)}</td></tr>`).join('');
    const ex = D2.exposure.sort((x, y) => y.b + y.a - x.b - x.a).map(e => `<tr><td class="l">${tm(e.t)}</td><td>${e.a}</td><td class="${e.b > e.a ? 'bad' : e.b < e.a ? 'good' : 'neu'}">${e.b}</td></tr>`).join('');
    cmpH = `<h3>${esc(I().cmpH.replace('{s}', I().strat[sel.k].t))}</h3><div class="gcols"><div class="tbl"><table class="antbl"><thead><tr><th class="l">${esc(L.player)}</th><th>${esc(I().mainL)}</th><th>${esc(I().strat[sel.k].t)}</th><th>${esc(L.proj)}</th></tr></thead><tbody>${pr}</tbody></table></div>
<div><table class="antbl"><thead><tr><th class="l"></th><th>${esc(I().mainL)}</th><th>${esc(I().strat[sel.k].t)}</th></tr></thead><tbody>${['expected', 'floor', 'median', 'ceiling', 'risk', 'budgetLeft'].map(k => `<tr><td class="l">${esc(I().m[k])}</td><td>${f1(D2.a[k])}</td>${cell(D2.b[k], D2.delta[k], k === 'risk' ? -1 : 1)}</tr>`).join('')}<tr><td class="l">${esc(L.captain)}</td><td>${nm(D2.captain.a)}</td><td class="${D2.captain.same ? 'neu' : ''}">${nm(D2.captain.b)}</td></tr><tr><td class="l">${esc(L.coach)}</td><td>${tm(D2.coach.a)}</td><td>${tm(D2.coach.b)}</td></tr></tbody></table>
<h4>${esc(L.exposure)}</h4><table class="antbl"><tbody>${ex}</tbody></table></div></div>`;
  }
  void mm;
  return `<section class="fmsec"><h2>${esc(I().tabs.alts)}</h2><p class="sub">${esc(I().altsHelp)}</p><div class="altcards">${cards}</div>${cmpH}</section>`;
}

// ---------- Sensitivity
function sensHTML() {
  const { lu, coachT } = last.view, S = sensitivity({ ...lu, coach: coachT }, D.players, D.coaches);
  const cls = { high: 'bad', medium: 'warn', low: 'neu' };
  const cap = S.rows.find(r => r.slot === 'captain');
  const rows = S.rows.map(r => `<tr><td class="l">${r.slot === 'captain' ? '© ' : ''}${pl(r.c)} <small>${esc(I().slots[r.slot])}</small>${r.spof ? ` <b class="spof" title="${esc(I().spofTip)}">SPOF</b>` : ''}</td><td class="${cls[r.impact]}"><b>${esc(I().imp[r.impact])}</b></td><td>${sg(r.dnp)}</td><td>${r.backup ? `${sg(r.dnpWithSwap)} <small>(${nm(r.backup)})</small>` : '–'}</td><td>${r.slot === 'bench' ? '–' : sg(r.minDown)}</td><td>${r.slot === 'bench' ? sg(r.minUp) : '–'}</td></tr>`).join('');
  const groups = ['high', 'medium', 'low'].map(k => `<p><b class="${cls[k]}">${esc(I().imp[k])}:</b> ${S.rows.filter(r => r.impact === k).map(r => nm(r.c)).join(', ') || '–'}</p>`).join('');
  return `<section class="fmsec"><h2>${esc(I().tabs.sens)}</h2><p class="sub">${esc(I().sensHelp.replace('{b}', f1(S.base)))}</p>
${cap ? `<div class="fmswap"><b>${esc(I().capFail)}</b> ${esc(I().capFailTxt.replace('{p}', P.get(cap.c)?.dn || '').replace('{d}', f1(cap.dnp)))}${cap.capSwap ? ' ' + esc(I().capFailSwap.replace('{p}', P.get(cap.capSwap.to)?.dn || '').replace('{d}', f1(cap.capSwap.delta))) : ''}</div>` : ''}
${groups}
<div class="tbl"><table class="antbl"><thead><tr>${I().sensCols.map((h, i) => `<th${i === 0 ? ' class="l"' : ''} title="${esc(I().sensTips[i] || '')}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
<p class="sub">${esc(I().spofNote)}</p></section>`;
}

app.addEventListener('click', e => {
  const tb = e.target.closest('[data-otab]'); if (tb && last) { last.tab = tb.dataset.otab; return show(); }
  const ab = e.target.closest('[data-aact]');
  if (ab && last?.alts) {
    const A = last.alts[+ab.dataset.alt]; if (!A?.available) return;
    const k = ab.dataset.aact, alu = A.lineup;
    if (k === 'cmp') { last.cmpIdx = +ab.dataset.alt; return show(); }
    if (k === 'load') { last.plan = null; last.capOverride = null; last.coachOverride = null; last.sol = { ...last.sol, start: alu.start, sixth: alu.sixth, bench: alu.bench, captain: alu.captain, coach: alu.coach, formation: alu.formation, roster: [...alu.start, alu.sixth, ...alu.bench], status: last.sol.status }; last.plan = planTurns(last.sol.roster, alu.coach, D.players.filter(p => p.opp), D.coaches, D.days, { mode: last.opts.mode, nSim: 300, topK: 60 }); last.explain = explain(last.sol, D.players.filter(p => p.opp), D.coaches, last.opts); last.tab = 'opt'; last.alts = null; return show(); }
    if (k === 'scen') {
      let S = null; try { S = JSON.parse(localStorage.getItem('fmt-v1')); } catch { }
      if (!S?.teams?.length) return alert(I().needTeam);
      const team = S.teams[S.active], st = { slots: Object.fromEntries([...alu.start.map(c => [c, 'start']), [alu.sixth, 'sixth'], ...alu.bench.map(c => [c, 'bench'])]), captain: alu.captain, coach: alu.coach, formation: alu.formation, trades: [], overrides: {}, bank: null };
      const m2 = simulate({ start: alu.start, sixth: alu.sixth, bench: alu.bench, captain: alu.captain, coach: alu.coach, formation: 'auto' }, D.players, D.coaches);
      const mine = (S.scen || []).filter(s => s.round === D.round && s.team === team.id), others = (S.scen || []).filter(s => !(s.round === D.round && s.team === team.id));
      const res = saveScenario(mine, D.round, I().strat[A.k].t, st, m2);
      if (!res.ok) return alert(L.I.maxScen.replace('{n}', MAX_SCEN));
      S.scen = [...others, ...res.list.map(s => ({ ...s, team: team.id }))];
      try { localStorage.setItem('fmt-v1', JSON.stringify(S)); ab.textContent = '✓'; } catch { }
      return;
    }
    if (k === 'csv') { const blob = new Blob(['﻿' + lineupCSV(alu, D.players, D.coaches, c => P.get(c)?.dn || c)], { type: 'text/csv;charset=utf-8' }); const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `lineup-${A.k}-${D.round}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 2000); return; }
    if (k === 'copy') { const t2 = `${I().strat[A.k].t} · ${alu.formation}\n© ${P.get(alu.captain).dn}\n` + alu.start.map(c => 'S ' + P.get(c).dn).join('\n') + `\n6 ${P.get(alu.sixth).dn}\n` + alu.bench.map(c => 'B ' + P.get(c).dn).join('\n') + `\n${L.coach}: ${X.teams[alu.coach] || alu.coach}\n${L.expected}: ${f1(A.expected)} (${f1(A.floor)}–${f1(A.ceiling)})`; navigator.clipboard?.writeText(t2).then(() => { ab.textContent = L.copied; }).catch(() => prompt(L.copy, t2)); return; }
  }
  const b = e.target.closest('[data-act],[data-rm]'); if (!b) return;
  if (b.dataset.rm) { state[b.dataset.rm] = state[b.dataset.rm].filter(c => c !== b.dataset.c); store.set('opt-v2', state); return renderControls(); }
  const a = b.dataset.act;
  if (a === 'run') return run();
  if (!last?.view) return;
  const { lu, coachT, m } = last.view;
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
