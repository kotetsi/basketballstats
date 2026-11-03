// Browser side of the Fantasy pages: filters, optimizer runs, round planner, CSV / clipboard.
import { optimize, bestLineup, roundPlan, toCSV, FORMATIONS } from './optimizer.mjs';
import { renderLineup, renderPlan } from './render.mjs';

const X = JSON.parse(document.getElementById('fxctx').textContent);
const U = X.U;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };
let DATA = null;
const load = async () => DATA || (DATA = await fetch(X.api, { cache: 'no-cache' }).then(r => r.json()));
const ctx = () => ({ U, name: c => (DATA.players.find(p => p.c === c) || {}).dn || c, team: t => X.teams[t] || t, purl: c => { const p = DATA.players.find(q => q.c === c); return p && p.s ? X.base + p.s + '/' : '#'; }, pos: p => X.pos[p] || p, day: i => (i == null ? '–' : X.days[i] || '') });

// ---- projections: filters and sorting on the static table
const tbl = document.getElementById('fxProj');
if (tbl) {
  const f = document.getElementById('fxFilters');
  const rows = [...tbl.tBodies[0].rows];
  const apply = () => {
    const v = n => f.elements[n].value, num = n => parseFloat(v(n));
    let shown = 0;
    for (const r of rows) {
      const d = r.dataset;
      const ok = (!v('pos') || d.pos === v('pos')) && (!v('team') || d.team === v('team')) && (!(num('pmin') > 0) || +d.price >= num('pmin')) && (!(num('pmax') > 0) || +d.price <= num('pmax'))
        && (!(num('ppmin') > 0) || +d.pp >= num('ppmin')) && (!(num('pmmin') > 0) || +d.pm >= num('pmmin')) && (!f.elements.onlyPlaying.checked || d.status === 'playing');
      r.hidden = !ok; if (ok) shown++;
    }
    document.getElementById('fxCount').textContent = shown;
  };
  f.addEventListener('input', apply); f.addEventListener('change', apply); apply();
  tbl.tHead.addEventListener('click', e => {
    const th = e.target.closest('th[data-k]'); if (!th) return;
    const k = th.dataset.k, asc = th.dataset.dir !== 'asc'; th.dataset.dir = asc ? 'asc' : 'desc';
    const val = r => (k === 'n' ? r.dataset.n : parseFloat(r.dataset[k]));
    rows.sort((a, b) => (k === 'n' ? val(a).localeCompare(val(b)) : val(a) - val(b)) * (asc ? 1 : -1)).forEach(r => tbl.tBodies[0].appendChild(r));
  });
}

// ---- optimizer
const of = document.getElementById('fxOpt');
if (of) {
  const out = document.getElementById('fxOptOut');
  let last = null;
  const run = async () => {
    await load();
    of.querySelector('button[type=submit]').disabled = true;
    const o = { budget: parseFloat(of.elements.budget.value) || 100, risk: of.elements.risk.value, formation: of.elements.formation.value, maxPerTeam: parseInt(of.elements.maxPerTeam.value, 10) || 6 };
    setTimeout(() => {
      last = optimize(DATA.players, DATA.coaches, o);
      out.innerHTML = renderLineup(last, ctx());
      of.querySelector('button[type=submit]').disabled = false;
      if (last) store.set('bsFxRes', { round: DATA.round, roster: last.roster.map(p => p.c), coach: last.coach && last.coach.t, risk: o.risk, formation: o.formation });
    }, 10);
  };
  of.addEventListener('submit', e => { e.preventDefault(); run(); });
  of.querySelectorAll('[data-form]').forEach(b => b.addEventListener('click', () => { of.elements.formation.value = b.dataset.form; of.querySelectorAll('[data-form]').forEach(x => x.classList.toggle('on', x === b)); run(); }));
  document.getElementById('fxCsv').addEventListener('click', async () => {
    await load(); const res = last || optimize(DATA.players, DATA.coaches, {});
    const c = ctx(); const blob = new Blob([toCSV(res, c.name, c.team)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `fantasy-round-${DATA.round}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  document.getElementById('fxCopy').addEventListener('click', async e => {
    await load(); const res = last || optimize(DATA.players, DATA.coaches, {}); const c = ctx();
    const txt = [`${U.round} ${DATA.round} · ${res.formation} · ${res.cost}/${res.budget}`, ...res.start.map(p => `${U.slot.start}: ${c.name(p.c)} (${c.team(p.t)})${p === res.captain ? ' [C]' : ''}`), res.sixth ? `${U.slot.sixth}: ${c.name(res.sixth.c)} (${c.team(res.sixth.t)})` : '', ...res.bench.map(p => `${U.slot.bench}: ${c.name(p.c)} (${c.team(p.t)})`), res.coach ? `${U.slot.coach}: ${c.team(res.coach.t)}` : ''].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(txt); e.target.textContent = U.copied; setTimeout(() => (e.target.textContent = U.copy), 1500); } catch (err) { prompt(U.copy, txt); }
  });
}

// ---- round planner: uses the last optimizer result of this round, if there is one
const pl = document.getElementById('fxPlan');
if (pl) {
  const saved = store.get('bsFxRes');
  (async () => {
    await load();
    if (!saved || saved.round !== DATA.round) return;
    const roster = saved.roster.map(c => DATA.players.find(p => p.c === c)).filter(Boolean);
    if (roster.length !== 10) return;
    const lu = bestLineup(roster, saved.risk, saved.formation);
    if (!lu) return;
    const res = { ...lu, roster, coach: DATA.coaches.find(c => c.t === saved.coach) };
    pl.innerHTML = renderPlan(roundPlan(res, DATA.days), res, ctx());
    const n = document.getElementById('fxPlanNote'); if (n) n.textContent = U.planMine;
  })();
}
