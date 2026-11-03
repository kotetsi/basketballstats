// HTML for the optimizer result and the round plan. Used by build.mjs (static pages) and by fx.js (browser).
// ctx: { U: texts, name(c), team(t), purl(c), pos(p), day(i) }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : '–');
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));

export function renderLineup(res, ctx) {
  const U = ctx.U;
  if (!res) return `<p class="sub">${esc(U.noRes)}</p>`;
  const row = (p, slot) => `<tr><td class="l"><span class="fxslot fx-${slot}">${esc(U.slot[slot])}</span></td><td class="l"><a href="${ctx.purl(p.c)}">${esc(ctx.name(p.c))}</a>${p === res.captain ? ` <b class="fxcap">C</b>` : ''}</td><td class="l">${esc(ctx.team(p.t))}</td><td class="l">${esc(ctx.pos(p.pos))}</td><td>${f1(p.price)}</td><td><b>${f1(p.pp)}</b></td><td>${f1(p.p10)}–${f1(p.p90)}</td><td class="l"><small>${esc(ctx.day(p.day))}</small></td></tr>`;
  const t = res.totals;
  return `<div class="fxsum"><div><b>${f1(t.expected)}</b><span>${esc(U.tExp)}</span></div><div><b>${f1(t.floor)}</b><span>${esc(U.tFloor)}</span></div><div><b>${f1(t.median)}</b><span>${esc(U.tMed)}</span></div><div><b>${f1(t.ceiling)}</b><span>${esc(U.tCeil)}</span></div><div><b>${f1(res.cost)}/${res.budget}</b><span>${esc(U.credits)}</span></div><div><b>${esc(res.formation)}</b><span>${esc(U.formation)}</span></div></div>
<div class="tbl"><table class="fxlu"><thead><tr><th class="l">${esc(U.slotH)}</th><th class="l">${esc(U.player)}</th><th class="l">${esc(U.teamH)}</th><th class="l">${esc(U.posH)}</th><th>${esc(U.price)}</th><th>${esc(U.proj)}</th><th>P10–P90</th><th class="l">${esc(U.dayH)}</th></tr></thead><tbody>
${res.start.map(p => row(p, 'start')).join('')}${res.sixth ? row(res.sixth, 'sixth') : ''}${res.bench.map(p => row(p, 'bench')).join('')}
${res.coach ? `<tr><td class="l"><span class="fxslot fx-coach">${esc(U.slot.coach)}</span></td><td class="l">${esc(U.coachOf)} ${esc(ctx.team(res.coach.t))}</td><td class="l">${esc(ctx.team(res.coach.t))}</td><td class="l">–</td><td>${f1(res.coach.price)}</td><td><b>${f1(res.coach.exp)}</b></td><td>${res.coach.p10}–${res.coach.p90}</td><td class="l"><small>${esc(ctx.day(res.coach.day))}</small></td></tr>` : ''}
</tbody></table></div>`;
}

export function renderPlan(plan, res, ctx) {
  const U = ctx.U;
  if (!plan) return `<p class="sub">${esc(U.noRes)}</p>`;
  const nm = c => `<a href="${ctx.purl(c)}">${esc(ctx.name(c))}</a>`;
  const turns = plan.turns.map(t => `<div class="fxturn"><h3>${esc(ctx.day(t.day))}</h3>${t.players.length ? `<ul>${t.players.map(p => `<li><span class="fxslot fx-${p.slot}">${esc(U.slot[p.slot])}</span> ${nm(p.c)}${res.captain && p.c === (plan.steps.find(s => s.type === 'captain') || {}).c ? ` <b class="fxcap">C</b>` : ''} <small>${f1(p.pp)}</small></li>`).join('')}</ul>` : `<p class="sub">${esc(U.noneDay)}</p>`}</div>`).join('');
  const st = plan.steps.map(s => {
    if (s.type === 'captain') return `<li>${fill(esc(U.stCaptain), { p: nm(s.c), d: esc(ctx.day(s.day)) })}</li>`;
    if (s.type === 'captain_switch') return `<li>${fill(esc(U.stSwitch), { p: nm(s.from), q: nm(s.to), x: f1(s.threshold), d: esc(ctx.day(s.day)) })}</li>`;
    if (s.type === 'backup') return `<li>${fill(esc(U.stBackup), { p: nm(s.c), q: nm(s.with), d: esc(ctx.day(s.day)) })}</li>`;
    if (s.type === 'doubtful') return `<li>${fill(esc(U.stDoubt), { p: nm(s.c), q: nm(s.with) })}</li>`;
    return '';
  }).join('');
  return `<div class="fxturns">${turns}</div><h2>${esc(U.steps)}</h2><ol class="fxsteps">${st}<li>${esc(U.stLocked)}</li></ol>`;
}
