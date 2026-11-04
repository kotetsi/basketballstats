// Fantasy Manager Tools (browser): Η ομάδα μου · Trade Simulator · Round Planner · Alerts · News
// Όλα μένουν στον browser (localStorage). Δεν συνδεόμαστε με τον λογαριασμό του EuroLeague Fantasy.
import { validateRoster, rosterCost, tradeEval, multiTrade, planRound, captainEligible, lineupOf, buildAlerts, parseRoster, toRosterCSV, expectedPoints, CAP, ROSTER, FORMATIONS } from './manager.mjs';
import { optimize } from './optimizer.mjs';

const X = JSON.parse(document.getElementById('fmctx').textContent);
const L = X.L;
const app = document.getElementById('fmApp');
const KEY = 'fmt-v1';
const store = { get() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { } } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = v => (v == null || isNaN(v) ? '–' : (+v).toFixed(1));
const sg = v => (v == null ? '–' : `<span class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v > 0 ? '+' : ''}${(+v).toFixed(1)}</span>`);

let D, P, NEWS = [], S, tab = X.tab || 'team';
const team = () => S.teams[S.active];
const rosterOf = t => t.roster.map(c => P.get(c)).filter(Boolean);
const save = () => store.set(S);
const todayTurn = () => { const d = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Athens' }); const i = D.days.indexOf(d); return i >= 0 ? i : D.days[0] > d ? 0 : D.days.length - 1; };
const pName = c => esc(P.get(c)?.dn || c);
const pLink = c => { const p = P.get(c); return p ? `<a href="${X.base}${p.s}/">${esc(p.dn)}</a>` : esc(c); };
const tm = t => esc(X.teams[t] || t);
const dayL = i => (i == null ? '–' : esc(X.days[i] || ''));
const stBadge = s => (s && s !== 'playing' ? ` <span class="fxst fxst-${s}">${esc(L.st[s] || s)}</span>` : '');

function newTeam(name) { return { id: Date.now().toString(36), name, roster: [], coach: null, formation: 'auto', captain: null, transfers: 2, bank: null }; }
function lineupFor(t) {
  const ro = rosterOf(t);
  if (ro.length !== 10 || validateRoster(ro).some(e => e.k.startsWith('pos'))) return null;
  const lu = lineupOf(ro, t.risk === 'safe' ? 'safe' : 'ceiling', t.formation || 'auto');
  if (!lu) return null;
  if (t.captain && lu.start.includes(t.captain)) lu.captain = t.captain;
  lu.coach = t.coach;
  return lu;
}

async function init() {
  [D, NEWS] = await Promise.all([fetch(X.api, { cache: 'no-cache' }).then(r => r.json()), fetch(X.news, { cache: 'no-cache' }).then(r => r.json()).then(j => j.items || []).catch(() => [])]);
  P = new Map(D.players.map(p => [p.c, p]));
  S = store.get() || { teams: [newTeam(L.myTeam + ' 1')], active: 0 };
  if (!S.teams.length) S.teams.push(newTeam(L.myTeam + ' 1'));
  S.active = Math.min(S.active || 0, S.teams.length - 1);
  if (location.hash.slice(1) in L.tabs) tab = location.hash.slice(1);
  render();
}

function tabsBar() {
  return `<nav class="fmtabs" role="tablist">${Object.entries(L.tabs).map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${esc(l)}</button>`).join('')}<a href="${X.tm}">Transfer Market ↗</a></nav>`;
}
function teamBar() {
  const t = team(), ro = rosterOf(t), coach = D.coaches.find(c => c.t === t.coach);
  const cost = rosterCost(ro, coach), bank = t.bank != null ? t.bank : Math.round((CAP - cost) * 10) / 10;
  return `<div class="fmbar"><label>${esc(L.team)} <select data-act="pick">${S.teams.map((x, i) => `<option value="${i}"${i === S.active ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
<button type="button" data-act="new">+ ${esc(L.newTeam)}</button><button type="button" data-act="rename">${esc(L.rename)}</button>${S.teams.length > 1 ? `<button type="button" data-act="del">${esc(L.del)}</button>` : ''}
<span class="fmbudget"><b>${f1(cost)}</b> / ${CAP} credits · ${esc(L.bank)} <b class="${bank < 0 ? 'dn' : ''}">${f1(bank)}</b> · ${ro.length}/10 · ${esc(L.transfersLeft)} <b>${t.transfers ?? '–'}</b></span></div>`;
}

// ---------- Η ομάδα μου
function viewTeam() {
  const t = team(), ro = rosterOf(t), errs = validateRoster(ro, { coach: D.coaches.find(c => c.t === t.coach), partial: ro.length < 10 });
  const cnt = ps => ro.filter(p => p.pos === ps).length;
  const lu = lineupFor(t), cur = todayTurn();
  const byPos = ['Guard', 'Forward', 'Center'].map(ps => `<div class="fmpos"><h3>${esc(L.pos[ps])} <small>${cnt(ps)}/${ROSTER[ps]}</small></h3><ul>${ro.filter(p => p.pos === ps).map(p => `<li><span>${pLink(p.c)} <small>${tm(p.t)} · ${f1(p.price)} cr · ${esc(L.proj)} ${f1(p.pp)} · ${dayL(p.day)}</small>${stBadge(p.status)}</span><button type="button" data-rm="${p.c}" aria-label="${esc(L.remove)}">✕</button></li>`).join('') || `<li class="sub">–</li>`}</ul></div>`).join('');
  const caps = lu ? lu.start.filter(c => captainEligible(lu, c, P, cur).ok) : [];
  const capWarn = lu && t.captain && !captainEligible(lu, t.captain, P, cur).ok ? `<p class="fmwarn">⚠ ${esc(L.capPlayed.replace('{p}', P.get(t.captain)?.dn || ''))}</p>` : '';
  const slotRow = (c, slot) => { const p = P.get(c); return `<tr><td class="l">${slot === 'start' ? (c === lu.captain ? '©' : '') : ''} ${pLink(c)}${stBadge(p.status)}</td><td>${esc(L.slot[slot])}</td><td>${tm(p.t)}</td><td>${dayL(p.day)}</td><td>${f1(p.pp)}</td><td><b>${f1(expectedPoints(p, slot, c === lu.captain))}</b></td></tr>`; };
  return `<section class="fmsec"><h2>${esc(L.tabs.team)}</h2>
${errs.length ? `<ul class="fmerr">${errs.map(e => `<li>${esc(L.err[e.k] ? L.err[e.k].replace('{pos}', L.pos[e.pos] || '').replace('{n}', e.n ?? '').replace('{max}', e.max ?? e.min ?? '').replace('{t}', X.teams[e.t] || e.t || '').replace('{cost}', e.cost ?? '') : e.k)}</li>`).join('')}</ul>` : ''}
<div class="fmadd"><label>${esc(L.addPlayer)} <input type="search" list="fmPl" data-act="add" placeholder="${esc(L.search)}" autocomplete="off"></label><datalist id="fmPl">${D.players.filter(p => !t.roster.includes(p.c)).map(p => `<option value="${esc(p.dn)} · ${esc(X.teams[p.t] || p.t)} · ${esc(L.pos[p.pos])} · ${p.price}">`).join('')}</datalist>
<label>${esc(L.coach)} <select data-act="coach"><option value="">–</option>${D.coaches.slice().sort((a, b) => String(X.teams[a.t]).localeCompare(String(X.teams[b.t]))).map(c => `<option value="${c.t}"${c.t === t.coach ? ' selected' : ''}>${tm(c.t)} · ${f1(c.price)} cr · ${f1(c.exp)}</option>`).join('')}</select></label>
<label>${esc(L.formation)} <select data-act="formation">${['auto', ...Object.keys(FORMATIONS)].map(f => `<option value="${f}"${(t.formation || 'auto') === f ? ' selected' : ''}>${f === 'auto' ? esc(L.best) : f}</option>`).join('')}</select></label>
<label>${esc(L.captain)} <select data-act="captain"><option value="">${esc(L.auto)}</option>${caps.map(c => `<option value="${c}"${c === t.captain ? ' selected' : ''}>${pName(c)}</option>`).join('')}</select></label>
<label>${esc(L.transfersLeft)} <input type="number" min="0" max="20" value="${t.transfers ?? 2}" data-act="transfers"></label>
<label>${esc(L.bank)} <input type="number" step="0.1" value="${t.bank ?? ''}" placeholder="${esc(L.auto)}" data-act="bank"></label></div>
${capWarn}
<div class="fmgrid">${byPos}</div>
${lu ? `<h3>${esc(L.lineupH)} (${esc(lu.formation)})</h3><div class="tbl"><table class="antbl"><thead><tr><th class="l">${esc(L.player)}</th><th>${esc(L.slotH)}</th><th>${esc(L.team)}</th><th>${esc(L.day)}</th><th>${esc(L.proj)}</th><th>${esc(L.fp)}</th></tr></thead><tbody>${lu.start.map(c => slotRow(c, 'start')).join('')}${lu.sixth ? slotRow(lu.sixth, 'sixth') : ''}${lu.bench.map(c => slotRow(c, 'bench')).join('')}</tbody></table></div>` : `<p class="sub">${esc(L.needTen)}</p>`}
<details class="fmimp"><summary>${esc(L.importH)}</summary><p class="sub">${esc(L.importHelp)}</p><textarea rows="8" data-imp placeholder="captain,Kendrick Nunn&#10;start,Sasha Vezenkov&#10;bench,…&#10;coach,PAN"></textarea>
<p><button type="button" data-act="import">${esc(L.importBtn)}</button> <label class="fmfile">CSV <input type="file" accept=".csv,text/csv,text/plain" data-act="file"></label> <button type="button" data-act="export">${esc(L.exportBtn)}</button> <button type="button" data-act="optimal">${esc(L.optimal)}</button></p><p class="sub" data-impmsg></p></details>
</section>`;
}

// ---------- Trade Simulator
const REC = r => `<span class="fmrec ${r}">${esc(L.rec[r] || r)}</span>`;
function viewTrade() {
  const t = team(), ro = rosterOf(t);
  if (ro.length !== 10) return `<section class="fmsec"><h2>${esc(L.tabs.trade)}</h2><p>${esc(L.needTen)}</p></section>`;
  const coach = D.coaches.find(c => c.t === t.coach);
  const bank = t.bank != null ? t.bank : Math.round((CAP - rosterCost(ro, coach)) * 10) / 10;
  const sel = S.trade || {};
  const outP = P.get(sel.out) && t.roster.includes(sel.out) ? P.get(sel.out) : ro[0];
  const afford = p => p.price <= bank + outP.price + 1e-9;
  const cands = D.players.filter(p => p.pos === outP.pos && !t.roster.includes(p.c)).sort((a, b) => (afford(b) - afford(a)) || (b.p3 || 0) - (a.p3 || 0));
  const inC = cands.some(p => p.c === sel.in) ? sel.in : cands[0]?.c;
  const risk = sel.risk || 'balanced';
  const r = inC ? tradeEval(ro, outP.c, inC, D.players, { bank, transfersLeft: t.transfers ?? 2, risk, coach }) : null;
  const rr = (k, a, b) => `<tr><td class="l">${esc(k)}</td><td>${a}</td><td>${b}</td></tr>`;
  const res = r && r.inn ? `<div class="fmres"><p class="fmrecw">${REC(r.rec)} <span class="sub">score ${f1(r.score)}</span></p>
${r.errors.length ? `<ul class="fmerr">${r.errors.map(e => `<li>${esc(L.err[e.k] ? L.err[e.k].replace('{t}', X.teams[e.t] || e.t || '').replace('{n}', e.n ?? '').replace('{max}', e.max ?? '').replace('{bank}', f1(e.bankAfter)) : e.k)}</li>`).join('')}</ul>` : ''}
<div class="tbl"><table class="antbl"><thead><tr><th class="l"></th><th>${esc(L.sell)}: ${pName(r.out.c)}</th><th>${esc(L.buy)}: ${pName(r.inn.c)}</th></tr></thead><tbody>
${rr(L.priceH, f1(r.out.price), f1(r.inn.price))}${rr(L.proj, f1(r.out.pp), f1(r.inn.pp))}${rr(L.next3, f1(r.out.p3), f1(r.inn.p3))}${rr('PIR/credit', (r.out.vpc ?? 0).toFixed(2), (r.inn.vpc ?? 0).toFixed(2))}${rr(L.minutes, f1(r.out.m10), f1(r.inn.m10))}${rr(L.status, esc(L.st[r.out.status] || r.out.status), esc(L.st[r.inn.status] || r.inn.status))}${rr(L.sched, (r.out.nx || []).map(x => `<span class="tmf d${x[4]}">${x[2] ? '' : '@'}${esc(x[1])}</span>`).join(''), (r.inn.nx || []).map(x => `<span class="tmf d${x[4]}">${x[2] ? '' : '@'}${esc(x[1])}</span>`).join(''))}${rr(L.signal, esc(L.sig[r.sigOut] || '–'), esc(L.sig[r.sigIn] || '–'))}
</tbody></table></div>
<ul class="fmkpi"><li>${esc(L.bankAfter)} <b class="${r.bankAfter < 0 ? 'dn' : ''}">${f1(r.bankAfter)}</b></li><li>Δ ${esc(L.proj)} ${sg(r.dNext)}</li><li>Δ ${esc(L.next3)} ${sg(r.d3)}</li><li>Δ Fantasy points (${esc(L.nextRound)}) ${sg(r.dFP)}</li><li>Δ Fantasy points (3) ${sg(r.dFP3)}</li><li>Δ PIR/credit ${sg(r.dVpc)}</li><li>${esc(L.injRisk)} <b class="risk ${r.injuryRisk}">${esc(L.risk[r.injuryRisk])}</b></li><li>${esc(L.minRisk)} <b class="risk ${r.minutesRisk}">${esc(L.risk[r.minutesRisk])}</b></li><li>${esc(L.fixChange)} ${sg(-r.dDiff)}</li></ul></div>` : '';
  const mt = S.mt;
  return `<section class="fmsec"><h2>${esc(L.tabs.trade)}</h2>
<form class="fxfilters" data-form="trade" onsubmit="return false">
<label>${esc(L.sell)} <select name="out">${ro.map(p => `<option value="${p.c}"${p.c === outP.c ? ' selected' : ''}>${esc(p.dn)} · ${esc(L.pos[p.pos])} · ${p.price}</option>`).join('')}</select></label>
<label>${esc(L.buy)} <select name="in">${cands.slice(0, 120).map(p => `<option value="${p.c}"${p.c === inC ? ' selected' : ''}>${esc(p.dn)} · ${tm(p.t)} · ${p.price} · ${f1(p.p3)}${p.status !== 'playing' ? ' · ' + esc(L.st[p.status]) : ''}${afford(p) ? '' : ' · 💰✕'}</option>`).join('')}</select></label>
<label>${esc(L.risk.h)} <select name="risk">${['safe', 'balanced', 'ceiling'].map(k => `<option value="${k}"${k === risk ? ' selected' : ''}>${esc(L.riskP[k])}</option>`).join('')}</select></label>
<span class="sub">${esc(L.bank)} ${f1(bank)} · ${esc(L.transfersLeft)} ${t.transfers ?? 2}</span></form>${res}
<h3>Multi-trade optimizer</h3><p class="sub">${esc(L.mtHelp)}</p>
<form class="fxfilters" data-form="mt" onsubmit="return false"><label>${esc(L.maxTrades)} <select name="k">${[1, 2, 3, 4].map(k => `<option${k === (mt?.k || 2) ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
<label>${esc(L.horizon)} <select name="h"><option value="3"${mt?.h !== 1 ? ' selected' : ''}>${esc(L.next3)}</option><option value="1"${mt?.h === 1 ? ' selected' : ''}>${esc(L.nextRound)}</option></select></label>
<button type="button" data-act="mt" class="fxrun">${esc(L.findTrades)}</button></form>
<div data-mtout>${mt?.res ? mtView(mt.res, mt.h) : ''}</div></section>`;
}
function mtView(r, h) {
  if (!r.trades.length) return `<p>${esc(L.noTrades)}</p>`;
  return `<ol class="fmtrades">${r.trades.map(x => `<li>${esc(L.sell)} <b>${pName(x.out)}</b> → ${esc(L.buy)} <b>${pName(x.in)}</b> <span class="sub">(${sg(x.gain)})</span></li>`).join('')}</ol>
<ul class="fmkpi"><li>Fantasy points (${h === 1 ? esc(L.nextRound) : '3'}) ${f1(r.before)} → <b>${f1(r.after)}</b> (${sg(r.after - r.before)})</li><li>${esc(L.nextRound)}: ${f1(r.nextBefore)} → <b>${f1(r.nextAfter)}</b></li><li>${esc(L.bankAfter)} <b>${f1(r.bank)}</b></li></ul>
<p class="sub">${r.byK.slice(1).map(x => `${x.k} trade${x.k > 1 ? 's' : ''}: ${f1(x.total)}`).join(' · ')}</p><button type="button" data-act="applymt">${esc(L.apply)}</button>`;
}

// ---------- Round Planner
function viewPlanner() {
  const t = team(), lu = lineupFor(t);
  if (!lu) return `<section class="fmsec"><h2>${esc(L.tabs.planner)}</h2><p>${esc(L.needTen)}</p></section>`;
  const cur = S.turn ?? todayTurn();
  const plan = planRound(lu, D.players, D.coaches, D.days, cur);
  const capW = !captainEligible(lu, lu.captain, P, cur).ok ? `<p class="fmwarn">⚠ ${esc(L.capPlayed.replace('{p}', P.get(lu.captain)?.dn || ''))}</p>` : '';
  const turnH = tr => `<div class="fmturn ${tr.state}"><h3>Turn ${tr.i + 1} · ${dayL(tr.i)} <small>${esc(L.turnState[tr.state])}</small></h3>
<ul>${tr.playing.map(x => `<li>${x.captain ? '© ' : ''}${pLink(x.c)} <small>${esc(L.slot[x.slot])} · ${f1(x.pp)}</small>${stBadge(P.get(x.c).status)}${tr.state === 'done' ? '' : ''}</li>`).join('') || `<li class="sub">${esc(L.nobody)}</li>`}${tr.coach ? `<li>🧑‍💼 ${tm(tr.coach)} <small>${esc(L.coach)}</small></li>` : ''}</ul>
<p class="sub">${esc(L.bestCap)}: <b>${tr.bestCaptain ? pName(tr.bestCaptain) : '–'}</b> · ${esc(L.diffCap)}: <b>${tr.diffCaptain ? pName(tr.diffCaptain) : '–'}</b></p>
<p class="sub">${esc(L.played)}: ${tr.alreadyPlayed.map(pName).join(', ') || '–'} · ${esc(L.later)}: ${tr.laterAvail.map(pName).join(', ') || '–'}</p>
<p><b>${f1(tr.points)}</b> ${esc(L.fpTurn)}</p></div>`;
  return `<section class="fmsec"><h2>${esc(L.tabs.planner)} · ${esc(L.round)} ${D.round}</h2>
<label class="fmturnsel">${esc(L.curTurn)} <select data-act="turn">${D.days.map((d, i) => `<option value="${i}"${i === cur ? ' selected' : ''}>Turn ${i + 1} · ${dayL(i)}</option>`).join('')}</select></label>
${capW}<div class="fmtimeline">${plan.turns.map(turnH).join('')}</div>
<h3>${esc(L.subsH)}</h3><ul class="fmsubs">${plan.capSwitch ? `<li>© ${esc(L.capSwitch.replace('{a}', P.get(plan.capSwitch.from)?.dn || '').replace('{x}', plan.capSwitch.threshold).replace('{b}', P.get(plan.capSwitch.to)?.dn || ''))}</li>` : ''}${plan.subs.map(s => `<li>${esc(L.subRule.replace('{n}', s.after + 1).replace('{a}', P.get(s.down)?.dn || '').replace('{x}', s.threshold).replace('{b}', P.get(s.up)?.dn || ''))}</li>`).join('') || `<li class="sub">–</li>`}</ul>
<p class="fmtotal">${esc(L.totalRound)}: <b>${f1(plan.total)}</b> fantasy points</p><p class="sub">${esc(L.scoring)}</p></section>`;
}

// ---------- Alerts
function viewAlerts() {
  const t = team(), lu = lineupFor(t);
  if (!lu) return `<section class="fmsec"><h2>${esc(L.tabs.alerts)}</h2><p>${esc(L.needTen)}</p></section>`;
  const al = buildAlerts(lu, D.players, NEWS, { curTurn: S.turn ?? todayTurn(), now: D.generated });
  const msg = a => esc((L.al[a.kind] || a.kind).replace('{p}', P.get(a.c)?.dn || a.c).replace('{b}', f1(a.before)).replace('{a}', f1(a.after)));
  return `<section class="fmsec"><h2>${esc(L.tabs.alerts)} <small>${al.length}</small></h2><ul class="fmalerts">${al.map(a => `<li class="sev-${a.severity}"><span class="sev">${esc(L.sev[a.severity])}</span><div><b>${pLink(a.c)}</b> <small>${tm(a.team)} · ${a.slots.map(s => esc(L.slot[s] || s)).join(', ')}</small><p>${msg(a)}</p><p class="sub">${esc(L.act[a.action] || '')} · ${esc(L.src[a.source] || a.source)} · ${new Date(a.ts).toLocaleString(X.loc, { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></div></li>`).join('') || `<li>${esc(L.noAlerts)}</li>`}</ul>
<p class="sub">${esc(L.alertNote)}</p></section>`;
}

// ---------- News
function viewNews() {
  const mine = new Set(team().roster);
  return `<section class="fmsec"><h2>${esc(L.tabs.news)}</h2><ul class="fmnews">${NEWS.slice(0, 120).map(n => { const p = P.get(n.c); return `<li class="${mine.has(n.c) ? 'mine' : ''}"><span class="nk nk-${n.kind}">${esc(L.nk[n.kind] || n.kind)}</span> <b>${p ? pLink(n.c) : esc(n.n)}</b> <small><a href="${X.teamBase[n.t] || '#'}">${tm(n.t)}</a></small>
<p>${esc((L.nm[n.kind] || '').replace('{b}', f1(n.before)).replace('{a}', f1(n.after)).replace('{m3}', n.detail?.m3 ?? '').replace('{m10}', n.detail?.m10 ?? '').replace('{from}', X.teams[n.detail?.from] || n.detail?.from || '').replace('{to}', X.teams[n.detail?.to] || n.detail?.to || ''))}${p ? ` · ${esc(L.proj)} ${f1(p.pp)}` : ''}</p>
<p class="sub">${mine.has(n.c) ? '⭐ ' + esc(L.inTeam) + ' · ' : ''}${esc(L.na[n.kind] || '')} · ${esc(L.src[n.source] || n.source)} · ${new Date(n.ts).toLocaleString(X.loc, { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></li>`; }).join('') || `<li>${esc(L.noNews)}</li>`}</ul></section>`;
}

function render() {
  const v = { team: viewTeam, trade: viewTrade, planner: viewPlanner, alerts: viewAlerts, news: viewNews }[tab] || viewTeam;
  app.innerHTML = tabsBar() + teamBar() + v();
}

// ---------- events
app.addEventListener('click', e => {
  const b = e.target.closest('[data-tab],[data-act],[data-rm]'); if (!b) return;
  const t = team();
  if (b.dataset.tab) { tab = b.dataset.tab; history.replaceState(null, '', '#' + tab); return render(); }
  if (b.dataset.rm) { t.roster = t.roster.filter(c => c !== b.dataset.rm); if (t.captain === b.dataset.rm) t.captain = null; save(); return render(); }
  const a = b.dataset.act;
  if (a === 'new') { const n = prompt(L.teamName, `${L.myTeam} ${S.teams.length + 1}`); if (n) { S.teams.push(newTeam(n)); S.active = S.teams.length - 1; save(); render(); } }
  if (a === 'rename') { const n = prompt(L.teamName, t.name); if (n) { t.name = n; save(); render(); } }
  if (a === 'del') { if (confirm(L.confirmDel.replace('{t}', t.name))) { S.teams.splice(S.active, 1); S.active = 0; save(); render(); } }
  if (a === 'import' || a === 'optimal') {
    let r;
    if (a === 'optimal') { const res = optimize(D.players, D.coaches, { risk: 'ceiling' }); if (!res) return; r = { roster: res.roster, coach: res.coach?.t, captain: res.captain.c, missing: [] }; }
    else r = parseRoster(app.querySelector('[data-imp]').value, D.players, D.coaches.map(c => c.t));
    t.roster = r.roster.slice(0, 10).map(p => p.c); if (r.coach) t.coach = r.coach; if (r.captain) t.captain = r.captain;
    save(); render();
    const m = app.querySelector('[data-impmsg]'); if (m) { m.textContent = `${L.imported.replace('{n}', t.roster.length)}${r.missing.length ? ' · ' + L.notFound + ': ' + r.missing.join(', ') : ''}`; app.querySelector('.fmimp').open = true; }
  }
  if (a === 'export') { const lu = lineupFor(t); if (!lu) return alert(L.needTen); const blob = new Blob([toRosterCSV(lu, P, t.coach)], { type: 'text/csv;charset=utf-8' }); const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `${t.name.replace(/\W+/g, '-')}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 2000); }
  if (a === 'mt') {
    const fm = app.querySelector('[data-form="mt"]'), k = +fm.elements.k.value, h = +fm.elements.h.value;
    const ro = rosterOf(t), coach = D.coaches.find(c => c.t === t.coach), bank = t.bank != null ? t.bank : Math.round((CAP - rosterCost(ro, coach)) * 10) / 10;
    b.disabled = true; b.textContent = '…';
    setTimeout(() => { S.mt = { k, h, res: multiTrade(ro, D.players, { bank, transfersLeft: t.transfers ?? 2, maxTrades: k, horizonRounds: h, risk: S.trade?.risk || 'balanced' }) }; S.mt.res.roster = S.mt.res.roster.map(p => p.c); render(); }, 20);
  }
  if (a === 'applymt' && S.mt?.res) {
    if (!confirm(L.confirmApply)) return;
    t.roster = S.mt.res.roster.slice(); t.transfers = Math.max(0, (t.transfers ?? 2) - S.mt.res.trades.length); t.bank = null; S.mt = null; save(); render();
  }
});
app.addEventListener('change', e => {
  const el = e.target, t = team();
  if (el.dataset.act === 'pick') { S.active = +el.value; S.mt = null; save(); return render(); }
  if (el.dataset.act === 'coach') { t.coach = el.value || null; save(); return render(); }
  if (el.dataset.act === 'formation') { t.formation = el.value; save(); return render(); }
  if (el.dataset.act === 'captain') { t.captain = el.value || null; save(); return render(); }
  if (el.dataset.act === 'transfers') { t.transfers = Math.max(0, +el.value || 0); save(); return render(); }
  if (el.dataset.act === 'bank') { t.bank = el.value === '' ? null : +el.value; save(); return render(); }
  if (el.dataset.act === 'turn') { S.turn = +el.value; save(); return render(); }
  if (el.dataset.act === 'file' && el.files[0]) { el.files[0].text().then(txt => { app.querySelector('[data-imp]').value = txt; }); return; }
  if (el.dataset.act === 'add') {
    const nm = el.value.split(' · ')[0].trim(), p = D.players.find(x => x.dn === nm);
    if (!p || t.roster.includes(p.c)) return;
    if (t.roster.length >= 10) return alert(L.full);
    const ro = rosterOf(t).concat(p), errs = validateRoster(ro, { partial: true });
    if (errs.some(x => x.k === 'pos_over')) return alert(L.err.pos_over.replace('{pos}', L.pos[p.pos]).replace('{n}', ro.filter(x => x.pos === p.pos).length).replace('{max}', ROSTER[p.pos]));
    if (errs.some(x => x.k === 'team_max')) return alert(L.err.team_max.replace('{t}', X.teams[p.t] || p.t).replace('{n}', 7).replace('{max}', 6));
    t.roster.push(p.c); save(); render();
    app.querySelector('[data-act="add"]')?.focus();
  }
  const form = el.closest('[data-form="trade"]');
  if (form) { S.trade = { out: form.elements.out.value, in: el.name === 'out' ? null : form.elements.in.value, risk: form.elements.risk.value }; save(); render(); }
});

init();
