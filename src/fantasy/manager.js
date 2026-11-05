// Fantasy Manager Tools (browser): Η ομάδα μου · Trade Simulator · Round Planner · Alerts · News
// Όλα μένουν στον browser (localStorage). Δεν συνδεόμαστε με τον λογαριασμό του EuroLeague Fantasy.
import { validateRoster, rosterCost, tradeEval, multiTrade, planRound, captainEligible, lineupOf, buildAlerts, parseRoster, toRosterCSV, expectedPoints, CAP, ROSTER, FORMATIONS } from './manager.mjs';
import { optimize } from './optimizer.mjs';
import { adviseCaptain, captainRow } from './captain.mjs';
import { simulate, saveScenario, compareScenarios, delta, MAX_SCEN, AXES } from './whatif.mjs';

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
  return `<nav class="fmtabs" role="tablist">${Object.entries(L.tabs).map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${esc(l)}</button>`).join('')}<a href="${X.vb}">Value Board ↗</a><a href="${X.tm}">Transfer Market ↗</a></nav>`;
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
  const msg = a => a.kind === 'press' ? esc((L.al.press || '{title}').replace('{p}', P.get(a.c)?.dn || a.c).replace('{title}', a.title || '')) + (a.link ? ` <a href="${esc(a.link)}" rel="nofollow noopener" target="_blank">↗</a>` : '') : esc((L.al[a.kind] || a.kind).replace('{p}', P.get(a.c)?.dn || a.c).replace('{b}', f1(a.before)).replace('{a}', f1(a.after)));
  return `<section class="fmsec"><h2>${esc(L.tabs.alerts)} <small>${al.length}</small></h2><ul class="fmalerts">${al.map(a => `<li class="sev-${a.severity}"><span class="sev">${esc(L.sev[a.severity])}</span><div><b>${pLink(a.c)}</b> <small>${tm(a.team)} · ${a.slots.map(s => esc(L.slot[s] || s)).join(', ')}</small><p>${msg(a)}</p><p class="sub">${esc(L.act[a.action] || '')} · ${esc(L.src[a.source] || a.source)} · ${new Date(a.ts).toLocaleString(X.loc, { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></div></li>`).join('') || `<li>${esc(L.noAlerts)}</li>`}</ul>
<p class="sub">${esc(L.alertNote)}</p></section>`;
}

// ---------- News
function viewNews() {
  const mine = new Set(team().roster);
  return `<section class="fmsec"><h2>${esc(L.tabs.news)}</h2><ul class="fmnews">${NEWS.slice(0, 120).map(n => { const p = P.get(n.c); return `<li class="${mine.has(n.c) ? 'mine' : ''}"><span class="nk nk-${n.kind}">${esc(L.nk[n.kind] || n.kind)}</span> <b>${p ? pLink(n.c) : esc(n.n)}</b> <small><a href="${X.teamBase[n.t] || '#'}">${tm(n.t)}</a></small>
<p>${n.kind === 'press' ? `<a href="${esc(n.link)}" rel="nofollow noopener" target="_blank">${esc(n.title)}</a>` : esc((L.nm[n.kind] || '').replace('{b}', f1(n.before)).replace('{a}', f1(n.after)).replace('{m3}', n.detail?.m3 ?? '').replace('{m10}', n.detail?.m10 ?? '').replace('{from}', X.teams[n.detail?.from] || n.detail?.from || '').replace('{to}', X.teams[n.detail?.to] || n.detail?.to || ''))}${p ? ` · ${esc(L.proj)} ${f1(p.pp)}` : ''}</p>
<p class="sub">${mine.has(n.c) ? '⭐ ' + esc(L.inTeam) + ' · ' : ''}${esc(L.na[n.kind] || '')} · ${esc(L.src[n.source] || n.source)} · ${new Date(n.ts).toLocaleString(X.loc, { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></li>`; }).join('') || `<li>${esc(L.noNews)}</li>`}</ul></section>`;
}

// ---------- Captain Advisor
const riskB = r => `<b class="risk ${r >= 45 ? 'high' : r >= 28 ? 'medium' : 'low'}">${r}</b>`;
function capCard(kind, r) {
  if (!r) return '';
  const p = P.get(r.c);
  return `<div class="capcard ${kind}"><span class="sub">${esc(L.capK[kind])}</span><h3>${pLink(r.c)}</h3><p class="sub">${tm(p.t)} · ${esc(L.pos[p.pos])} · ${f1(p.price)} cr · ${dayL(p.day)}</p>
<p class="capbig"><b>${f1(kind === 'safest' ? r.floor : kind === 'ceiling' ? r.ceiling : r.median)}</b> <small>${esc(kind === 'safest' ? 'floor' : kind === 'ceiling' ? 'ceiling (P90)' : 'median')}</small></p>
<p class="sub">floor ${f1(r.floor)} · median ${f1(r.median)} · upside ${f1(r.upside)} · ceiling ${f1(r.ceiling)} · risk ${riskB(r.risk)} · captain value ${f1(r.value)}</p>
<button type="button" data-copycap="${r.c}" data-kind="${kind}">${esc(L.copy)}</button></div>`;
}
function viewCaptain() {
  const t = team(), lu = lineupFor(t);
  if (!lu) return `<section class="fmsec"><h2>Captain Advisor</h2><p>${esc(L.needTen)}</p></section>`;
  const cur = S.turn ?? todayTurn();
  const A = adviseCaptain(lu, D.players, cur);
  const all = [...lu.start, lu.sixth, ...lu.bench].filter(Boolean);
  const warn = A.warnings.map(w => `<p class="fmwarn">⚠ ${esc((L.capW[w.k] || w.k).replace('{p}', P.get(w.c)?.dn || ''))}</p>`).join('');
  const cmp = A.compare && A.current ? `<p>${esc(L.vsCurrent.replace('{p}', P.get(A.current.c)?.dn || ''))}: upside ${sg(A.compare.vsBest)} · floor ${sg(A.compare.vsSafe)} · ceiling ${sg(A.compare.vsCeiling)}</p>` : '';
  const swap = A.swap ? `<p class="fmswap">🔁 ${esc(L.capSwitch.replace('{a}', P.get(A.swap.from)?.dn || '').replace('{x}', A.swap.thresholdPIR).replace('{b}', P.get(A.swap.to)?.dn || ''))}</p>` : '';
  const row = c => { const p = P.get(c), r = captainRow(p, { played: p.day != null && p.day < cur }), st = lu.start.includes(c);
    return `<tr class="${st ? '' : 'nostart'}"><td class="l">${c === lu.captain ? '© ' : ''}${pLink(c)}<small class="tmsub">${tm(p.t)} · ${esc(L.pos[p.pos])} · ${f1(p.price)} cr${st ? '' : ' · ' + esc(L.notStarter)}${r.played ? ' · ' + esc(L.playedShort) : ''}${p.small ? ' · ⚠ ' + esc(L.small) : ''}</small></td><td>${f1(p.pp)}</td><td><b>${f1(r.exp)}</b></td><td>${f1(r.floor)}</td><td>${f1(r.median)}</td><td>${f1(r.ceiling)}</td><td>${riskB(r.risk)}</td><td>${f1(r.value)}</td><td>${esc(L.st[p.status] || p.status)}</td><td>${f1(p.pm)}</td><td>${p.start == null ? '–' : Math.round(100 * p.start) + '%'}</td><td>${p.odrtg == null ? '–' : f1(p.odrtg)} <small>${p.opp ? (p.home ? 'vs ' : '@') + esc(p.opp) : ''}</small></td><td>${p.gpace == null ? '–' : f1(p.gpace)}</td><td>${p.home ? esc(L.home) : esc(L.away)}</td><td>${p.rest ?? '–'}</td><td>${p.b2b ? 'B2B' : '–'}</td><td>${f1(p.l3)} / ${f1(p.l5)} / ${f1(p.l10)}</td><td>${f1(p.hcap)} <small>${p.hhit == null ? '' : Math.round(100 * p.hhit) + '% ≥20'}</small></td><td>${r.diff}</td></tr>`; };
  const H = L.capCols.map((h, i) => `<th${i === 0 ? ' class="l"' : ''} title="${esc(L.capTips[i] || '')}">${esc(h)}</th>`).join('');
  return `<section class="fmsec"><h2>Captain Advisor · ${esc(L.round)} ${D.round}</h2>
<label class="fmturnsel">${esc(L.curTurn)} <select data-act="turn">${D.days.map((d, i) => `<option value="${i}"${i === cur ? ' selected' : ''}>Turn ${i + 1} · ${dayL(i)}</option>`).join('')}</select></label>
${warn}<div class="capcards">${capCard('safest', A.safest)}${capCard('best', A.best)}${capCard('ceiling', A.ceiling)}</div>${cmp}${swap}
<div class="tbl"><table class="antbl captbl"><thead><tr>${H}</tr></thead><tbody>${all.map(row).join('')}</tbody></table></div>
<p class="sub">${esc(L.capHelp)}</p></section>`;
}

// ---------- What-If
const slotsOf = lu => Object.fromEntries([...lu.start.map(c => [c, 'start']), ...(lu.sixth ? [[lu.sixth, 'sixth']] : []), ...lu.bench.map(c => [c, 'bench'])]);
function stateFrom(lu, t) { return { slots: slotsOf(lu), captain: lu.captain, coach: t.coach, formation: lu.formation, trades: [], overrides: {}, bank: t.bank }; }
function toSim(w, base) {
  const ent = Object.entries(w.slots);
  const start = ent.filter(e => e[1] === 'start').map(e => e[0]), six = ent.filter(e => e[1] === 'sixth').map(e => e[0]), bench = ent.filter(e => e[1] === 'bench').map(e => e[0]);
  const cur = S.turn ?? todayTurn();
  const moved = base ? Object.keys(w.slots).filter(c => w.slots[c] !== 'bench' && base.slots[c] === 'bench' && (P.get(c)?.day ?? 99) < cur) : [];
  return { start, sixth: six[0] || null, bench: [...bench, ...six.slice(1)], captain: w.captain, coach: w.coach, formation: w.formation, trades: w.trades, overrides: w.overrides, bank: w.bank, moved, captainChanged: base && w.captain !== base.captain };
}
function viewWhatIf() {
  const t = team(), lu = lineupFor(t);
  if (!lu) return `<section class="fmsec"><h2>What-If Simulator</h2><p>${esc(L.needTen)}</p></section>`;
  const base = stateFrom(lu, t);
  const key = t.id + ':' + D.round;
  if (!S.wi || S.wi.key !== key) S.wi = { key, w: JSON.parse(JSON.stringify(base)) };
  const w = S.wi.w, cur = S.turn ?? todayTurn();
  const r0 = simulate(toSim(base), D.players, D.coaches, { curTurn: cur }), r = simulate(toSim(w, base), D.players, D.coaches, { curTurn: cur }), d = delta(r0, r);
  const k = (lbl, v, dv, fmt = f1, tip = '') => `<div class="wik" title="${esc(tip)}"><span>${esc(lbl)}</span><b>${fmt(v)}</b>${dv ? `<small>${sg(dv)}</small>` : ''}</div>`;
  const trIn = new Map((w.trades || []).map(x => [x.out, x.in]));
  const rows = Object.keys(w.slots).map(c => { const cc = trIn.get(c) || c, p = P.get(cc), ov = w.overrides[cc] || {};
    return `<tr><td class="l">${cc === w.captain || (c === w.captain && trIn.has(c)) ? '© ' : ''}${pLink(cc)}${trIn.has(c) ? ` <small>(↔ ${pName(c)})</small>` : ''}<small class="tmsub">${tm(p.t)} · ${esc(L.pos[p.pos])} · ${dayL(p.day)}${(p.day ?? 99) < cur ? ' · ' + esc(L.playedShort) : ''}</small></td>
<td><select data-wslot="${c}">${['start', 'sixth', 'bench'].map(s => `<option value="${s}"${w.slots[c] === s ? ' selected' : ''}>${esc(L.slot[s])}</option>`).join('')}</select></td>
<td><select data-wst="${cc}"><option value="">${esc(L.st[p.status] || p.status)} (${esc(L.model)})</option>${['playing', 'doubtful', 'injured'].map(s => `<option value="${s}"${ov.status === s ? ' selected' : ''}>${esc(L.st[s])}</option>`).join('')}</select></td>
<td><input type="number" min="0" max="40" step="1" data-wmin="${cc}" value="${ov.min ?? ''}" placeholder="${f1(p.pm0 ?? p.pm)}"></td><td>${f1(r.per.find(x => x.c === cc)?.exp)}</td></tr>`; }).join('');
  const roster = Object.keys(w.slots).map(c => trIn.get(c) || c);
  const startNow = toSim(w).start.map(c => trIn.get(c) || c);
  const tOut = S.wiT?.out && w.slots[S.wiT.out] ? S.wiT.out : Object.keys(w.slots)[0];
  const tP = P.get(tOut);
  const tCands = D.players.filter(p => p.pos === tP.pos && !roster.includes(p.c) && !(p.c in w.slots)).sort((a, b) => (b.p3 || 0) - (a.p3 || 0)).slice(0, 80);
  const W = r.warnings.map(x => `<li>${esc((L.wiW[x.k] || x.k).replace('{p}', P.get(x.c)?.dn || '').replace('{pos}', L.pos[x.pos] || '').replace('{n}', x.n ?? '').replace('{need}', x.need ?? '').replace('{f}', x.f || '').replace('{have}', x.have || '').replace('{t}', X.teams[x.t] || x.t || '').replace('{b}', f1(x.budget)))}</li>`).join('');
  return `<section class="fmsec"><h2>What-If Simulator</h2><p class="sub">${esc(L.wiHelp)}</p>
<div class="wigrid">${k(L.wiExp, r.expected, d.expected, f1, L.wiTip.exp)}${k('Floor (P10)', r.floor, d.floor, f1, L.wiTip.floor)}${k('Median', r.median, d.expected)}${k('Ceiling (P90)', r.ceiling, d.ceiling, f1, L.wiTip.floor)}${k(L.wiWin, r.winBonus, d.winBonus, f1, L.wiTip.win)}${k(L.wiCap, r.captainImpact, d.captainImpact)}${k(L.wiBench, r.benchImpact, d.benchImpact)}${k(L.bank, r.budget, d.budget)}${k('Risk', r.risk, d.risk, v => v + ' · ' + L.risk[r.riskLabel])}${k('FP/credit', r.vpc, d.vpc, v => (+v).toFixed(2))}</div>
<p class="sub">${esc(L.wiExpo)}: ${Object.entries(r.exposure).sort((a, b) => b[1] - a[1]).map(([tt, n]) => `${tm(tt)} ${n}`).join(' · ')}${r.coach ? ` · ${esc(L.coach)} ${tm(r.coach.t)} ${f1(r.coach.exp)}` : ''}</p>
${W ? `<ul class="fmerr">${W}</ul>` : ''}
<div class="fxfilters"><label>${esc(L.captain)} <select data-wcap>${startNow.map(c => `<option value="${c}"${c === (trIn.get(w.captain) || w.captain) ? ' selected' : ''}>${pName(c)}</option>`).join('')}</select></label>
<label>${esc(L.coach)} <select data-wcoach><option value="">–</option>${D.coaches.slice().sort((a, b) => String(X.teams[a.t]).localeCompare(String(X.teams[b.t]))).map(c => `<option value="${c.t}"${c.t === w.coach ? ' selected' : ''}>${tm(c.t)} · ${f1(c.price)} · ${f1(c.exp)}</option>`).join('')}</select></label>
<label>${esc(L.formation)} <select data-wform>${['auto', ...Object.keys(FORMATIONS)].map(f => `<option value="${f}"${(w.formation || 'auto') === f ? ' selected' : ''}>${f === 'auto' ? esc(L.best) : f}</option>`).join('')}</select></label></div>
<div class="tbl"><table class="antbl"><thead><tr><th class="l">${esc(L.player)}</th><th>${esc(L.slotH)}</th><th>${esc(L.status)}</th><th title="${esc(L.wiTip.min)}">${esc(L.expMin)}</th><th>${esc(L.fp)}</th></tr></thead><tbody>${rows}</tbody></table></div>
<h3>${esc(L.hypoTrade)}</h3><div class="fxfilters"><label>${esc(L.sell)} <select data-wtout>${Object.keys(w.slots).map(c => `<option value="${c}"${c === tOut ? ' selected' : ''}>${pName(c)}</option>`).join('')}</select></label><label>${esc(L.buy)} <select data-wtin>${tCands.map(p => `<option value="${p.c}">${esc(p.dn)} · ${tm(p.t)} · ${p.price} · ${f1(p.p3)}</option>`).join('')}</select></label><button type="button" data-act="wtadd">+ ${esc(L.addTrade)}</button>
${(w.trades || []).map((x, i) => `<span class="witr">${pName(x.out)} → ${pName(x.in)} <button type="button" data-wtrm="${i}">✕</button></span>`).join('')}</div>
<p class="fmbtns"><button type="button" data-act="wreset">${esc(L.reset)}</button> <button type="button" data-act="wsave">${esc(L.saveScen)}</button> <button type="button" data-tab="scen">${esc(L.compareScen)}</button> <button type="button" data-act="wcsv">CSV</button> <button type="button" data-act="wcopy">${esc(L.copy)}</button></p></section>`;
}

// ---------- Scenarios
function radarSVG(cmp) {
  const n = cmp.axes.length, R = 110, cx = 150, cy = 140, cols = ['#e4572e', '#3b6fd8', '#2e9d5b', '#8e44ad', '#e8b730'];
  const pt = (i, v) => [cx + R * v * Math.sin((2 * Math.PI * i) / n), cy - R * v * Math.cos((2 * Math.PI * i) / n)];
  const grid = [0.25, 0.5, 0.75, 1].map(g => `<polygon points="${cmp.axes.map((_, i) => pt(i, g).join(',')).join(' ')}" class="rgrid"/>`).join('');
  const lab = cmp.axes.map((a, i) => { const [x, y] = pt(i, 1.18); return `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" text-anchor="middle" class="rlab">${esc(L.axes[a])}</text>`; }).join('');
  const polys = cmp.norm.map((nv, j) => `<polygon points="${cmp.axes.map((a, i) => pt(i, 0.08 + 0.92 * nv[a]).join(',')).join(' ')}" fill="${cols[j % 5]}" fill-opacity=".15" stroke="${cols[j % 5]}" stroke-width="2"/>`).join('');
  const leg = cmp.rows.map((r, j) => `<span><i style="background:${cols[j % 5]}"></i>${esc(r.name)}</span>`).join('');
  return `<div class="radarw"><svg viewBox="0 0 300 290" class="radar" role="img" aria-label="radar">${grid}${polys}${lab}</svg><p class="rleg">${leg}</p><p class="sub">${esc(L.radarNote)}</p></div>`;
}
function viewScen() {
  const list = (S.scen || []).filter(s => s.round === D.round && s.team === team().id);
  if (!list.length) return `<section class="fmsec"><h2>Scenarios</h2><p>${esc(L.noScen)}</p></section>`;
  const cmp = compareScenarios(list);
  const nm = c => pName(c);
  const row = (k, f) => `<tr><td class="l">${esc(k)}</td>${list.map((s, i) => `<td>${f(s, i)}</td>`).join('')}</tr>`;
  const b = (a, i, v) => (cmp.best[a] === i ? `<b class="best">${v}</b>` : v);
  return `<section class="fmsec"><h2>Scenarios · ${esc(L.round)} ${D.round} <small>${list.length}/${MAX_SCEN}</small></h2>
<div class="tbl"><table class="antbl scentbl"><thead><tr><th class="l"></th>${list.map((s, i) => `<th>${esc(s.name)} <button type="button" data-sload="${i}" title="${esc(L.load)}">↺</button> <button type="button" data-srm="${i}" title="${esc(L.del)}">✕</button></th>`).join('')}</tr></thead><tbody>
${row(L.captain, s => nm(s.result.lineup.captain))}${row(L.slot.start, s => s.result.lineup.start.map(nm).join(', '))}${row(L.slot.sixth, s => (s.result.lineup.sixth ? nm(s.result.lineup.sixth) : '–'))}${row(L.slot.bench, s => s.result.lineup.bench.map(nm).join(', '))}${row(L.coach, s => tm(s.result.lineup.coach))}
${row(L.wiExp, (s, i) => b('expected', i, f1(s.result.expected)))}${row('Floor', (s, i) => b('floor', i, f1(s.result.floor)))}${row('Median', s => f1(s.result.median))}${row('Ceiling', (s, i) => b('ceiling', i, f1(s.result.ceiling)))}${row('Risk', (s, i) => b('safety', i, s.result.risk))}${row(L.wiExpo, s => Object.entries(s.result.exposure).sort((a, c) => c[1] - a[1]).slice(0, 3).map(([tt, n]) => `${tm(tt)} ${n}`).join(', '))}${row(L.bank, (s, i) => b('budget', i, f1(s.result.budget)))}
</tbody></table></div>${radarSVG(cmp)}</section>`;
}

function render() {
  const v = { team: viewTeam, captain: viewCaptain, whatif: viewWhatIf, scen: viewScen, trade: viewTrade, planner: viewPlanner, alerts: viewAlerts, news: viewNews }[tab] || viewTeam;
  app.innerHTML = tabsBar() + teamBar() + v();
}

// ---------- events
app.addEventListener('click', e => {
  const b = e.target.closest('[data-tab],[data-act],[data-rm]'); if (!b) return;
  const t = team();
  if (b.dataset.tab) { tab = b.dataset.tab; history.replaceState(null, '', '#' + tab); return render(); }
  if (b.dataset.rm) { t.roster = t.roster.filter(c => c !== b.dataset.rm); if (t.captain === b.dataset.rm) t.captain = null; save(); return render(); }
  const a = b.dataset.act;
  if (b.dataset.copycap) { const p = P.get(b.dataset.copycap); const r = captainRow(p); const txt = `${L.capK[b.dataset.kind]} (${L.round} ${D.round}): ${p.dn} (${X.teams[p.t] || p.t}) · median ${r.median} · floor ${r.floor} · ceiling ${r.ceiling} · risk ${r.risk} — basketballstats.eu`; navigator.clipboard?.writeText(txt).then(() => { b.textContent = L.copied; }).catch(() => prompt(L.copy, txt)); return; }
  if (b.dataset.wtrm != null) { S.wi.w.trades.splice(+b.dataset.wtrm, 1); return render(); }
  if (b.dataset.sload != null) { const list = (S.scen || []).filter(s => s.round === D.round && s.team === t.id); const s = list[+b.dataset.sload]; if (s) { S.wi = { key: t.id + ':' + D.round, w: JSON.parse(JSON.stringify(s.state)) }; tab = 'whatif'; } return render(); }
  if (b.dataset.srm != null) { const list = (S.scen || []).filter(s => s.round === D.round && s.team === t.id); const s = list[+b.dataset.srm]; S.scen = (S.scen || []).filter(x => x !== s); save(); return render(); }
  if (a === 'wreset') { S.wi = null; return render(); }
  if (a === 'wtadd') { const o = app.querySelector('[data-wtout]').value, i = app.querySelector('[data-wtin]').value; if (o && i && !S.wi.w.trades.some(x => x.out === o)) S.wi.w.trades.push({ out: o, in: i }); return render(); }
  if (a === 'wsave' || a === 'wcsv' || a === 'wcopy') {
    const lu = lineupFor(t), base = stateFrom(lu, t), r = simulate(toSim(S.wi.w, base), D.players, D.coaches);
    if (a === 'wsave') { const nmS = prompt(L.scenName, `Scenario ${((S.scen || []).filter(s => s.round === D.round && s.team === t.id).length) + 1}`); if (!nmS) return; const others = (S.scen || []).filter(s => !(s.round === D.round && s.team === t.id)); const mine = (S.scen || []).filter(s => s.round === D.round && s.team === t.id); const res = saveScenario(mine, D.round, nmS, S.wi.w, r); if (!res.ok) return alert(L.maxScen.replace('{n}', MAX_SCEN)); S.scen = [...others, ...res.list.map(s => ({ ...s, team: t.id }))]; save(); b.textContent = '✓'; return; }
    const lines = ['slot,player,team,expected_fp', ...r.per.map(x => `${x.captain ? 'captain' : x.slot},${P.get(x.c)?.dn || x.c},${P.get(x.c)?.t || ''},${x.exp}`), `coach,${t.coach || ''},,${r.coach?.exp ?? ''}`, `total,,,${r.expected}`, `floor,,,${r.floor}`, `ceiling,,,${r.ceiling}`, `budget,,,${r.budget}`];
    if (a === 'wcsv') { const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }); const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `what-if-${D.round}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 2000); }
    else { const txt = r.per.map(x => `${x.captain ? '©' : x.slot === 'bench' ? 'B' : x.slot === 'sixth' ? '6' : 'S'} ${P.get(x.c)?.dn}`).join('\n') + `\n${L.wiExp}: ${r.expected} (${r.floor}–${r.ceiling})`; navigator.clipboard?.writeText(txt).then(() => { b.textContent = L.copied; }).catch(() => prompt(L.copy, txt)); }
    return;
  }
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
  if (el.dataset.wslot) { S.wi.w.slots[el.dataset.wslot] = el.value; return render(); }
  if (el.dataset.wst) { const o = S.wi.w.overrides[el.dataset.wst] ||= {}; if (el.value) o.status = el.value; else delete o.status; return render(); }
  if (el.dataset.wmin) { const o = S.wi.w.overrides[el.dataset.wmin] ||= {}; if (el.value === '') delete o.min; else o.min = +el.value; return render(); }
  if (el.matches('[data-wcap]')) { const inv = new Map((S.wi.w.trades || []).map(x => [x.in, x.out])); S.wi.w.captain = inv.get(el.value) || el.value; return render(); }
  if (el.matches('[data-wcoach]')) { S.wi.w.coach = el.value || null; return render(); }
  if (el.matches('[data-wform]')) { S.wi.w.formation = el.value; return render(); }
  if (el.matches('[data-wtout]')) { S.wiT = { out: el.value }; return render(); }
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
