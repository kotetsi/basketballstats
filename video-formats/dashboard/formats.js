const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let D, TAB = 'lib';
async function api(p, o = {}) { const r = await fetch(p, { ...o, headers: { 'Content-Type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j; }
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 4000); }
const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message); } };
const dlg = html => { $('#dlgBody').innerHTML = html; $('#dlg').showModal(); };
$('#dlgClose').onclick = () => $('#dlg').close();

async function load() {
  D = await api('/api/formats');
  const c = s => D.formats.filter(f => f.availability.status === s).length;
  $('#meta').innerHTML = `<span>Formats <b>${D.formats.length}</b></span><span>Available <b>${c('available')}</b></span><span>Planned <b>${c('planned')}</b></span><span>Missing data <b>${c('missing-data') + c('insufficient')}</b></span><span>Disabled <b>${c('disabled')}</b></span>`;
  render();
}

function render() { ({ lib, cal, perf, data })[TAB](); }

function lib() {
  const byFam = Object.keys(D.families).map(k => [k, D.formats.filter(f => f.family === k)]);
  $('#view').innerHTML = byFam.map(([k, list]) => `<div class="fam">${esc(D.families[k])} · ${list.length}</div><div class="grid">${list.map(card).join('')}</div>`).join('');
  $$('[data-gen]').forEach(b => b.onclick = () => gen(b.dataset.gen));
  $$('[data-set]').forEach(b => b.onclick = () => settings(b.dataset.set));
  $$('[data-en]').forEach(b => b.onchange = () => act(async () => { await api(`/api/formats/${b.dataset.en}/settings`, { method: 'PUT', body: { enabled: b.checked } }); await load(); }, b.checked ? 'Enabled' : 'Disabled'));
  $$('[data-info]').forEach(b => b.onclick = () => info(b.dataset.info));
}
function card(f) {
  const a = f.availability;
  return `<div class="fcard"><div><span class="num">${f.number}</span><span class="st ${a.status}">${a.status}</span></div><h4>${esc(f.name)}</h4>
  <div class="small">${esc(f.description)}</div>
  <div class="small">${esc(f.durations.recommended)} · ${f.aspects.join(' ')} · ${esc(f.frequency)} · voice: ${esc(f.narration.style)}</div>
  ${a.missing?.length ? `<div class="miss">Missing: ${a.missing.map(m => esc(m.detail)).join('; ')}</div>` : a.status === 'planned' ? `<div class="small">${esc(a.reason)}</div>` : ''}
  <div class="btns">${a.status === 'available' ? `<button class="sm" data-gen="${f.id}">Generate</button>` : ''}<button class="ghost sm" data-info="${f.id}">Spec</button>${f.functional ? `<button class="ghost sm" data-set="${f.id}">Settings</button>` : ''}
  <label class="small" style="display:flex;gap:6px;align-items:center;margin-left:auto"><input type="checkbox" data-en="${f.id}" ${a.enabled ? 'checked' : ''} style="width:auto;margin:0">enabled</label></div></div>`;
}
function info(id) {
  const f = D.formats.find(x => x.id === id);
  const rows = [['Concept', f.concept], ['Audience', f.audience], ['Durations', `${f.durations.recommended} (supports ${f.durations.supported.join(', ')})`], ['Aspect ratios', f.aspects.join(', ')], ['Required data', f.requires.map(r => `${r.dataset} — ${r.why}`).join('<br>')], ['Validation rules', f.validation.map(esc).join('<br>')], ['Script structure', f.scriptStructure.map(esc).join(' → ')], ['Visual template', f.visual], ['Narration', `${f.narration.style}: ${f.narration.notes}`], ['Frequency', f.frequency], ['Example', f.example]];
  dlg(`<h3>${f.number}. ${esc(f.name)}</h3><table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${k === 'Required data' || k === 'Validation rules' ? v : esc(v)}</td></tr>`).join('')}</table>`);
}
function settings(id) {
  const f = D.formats.find(x => x.id === id), s = f.settings || {};
  const opt = (o, sel) => Object.entries(o).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v.label || k)}</option>`).join('');
  dlg(`<h3>Settings · ${esc(f.name)}</h3><form id="sf"><div class="row"><label>Duration<select name="preset"><option value="">format default (${f.durations.recommended})</option>${opt(D.durations, s.preset)}</select></label>
  <label>Narration style<select name="style"><option value="">format default (${f.narration.style})</option>${opt(D.styles, s.style)}</select></label><label>Visual theme<select name="theme">${opt(D.themes, s.theme || 'classic')}</select></label></div>
  <div class="row"><label>Language<select name="lang"><option value="en">English</option><option value="el" ${s.lang === 'el' ? 'selected' : ''}>Greek (not available yet)</option></select></label><label>Players / teams (count)<input name="count" type="number" min="2" max="10" value="${s.count ?? ''}"></label><label>Round (Daily Show)<input name="round" type="number" min="1" value="${s.round ?? ''}"></label></div>
  <div class="row"><label>Max age (Future Stars)<input name="maxAge" type="number" value="${s.maxAge ?? ''}"></label><label>Min clutch attempts<input name="minAttempts" type="number" value="${s.minAttempts ?? ''}"></label><label>Min FGA (Efficiency)<input name="minFga" type="number" value="${s.minFga ?? ''}"></label></div>
  <p class="small">Competition: EuroLeague · season: current (history formats use past seasons). Other competitions appear here when their data exists.</p><div class="btns"><button>Save</button></div></form>`);
  $('#sf').onsubmit = e => { e.preventDefault(); act(async () => { await api(`/api/formats/${id}/settings`, { method: 'PUT', body: { defaults: Object.fromEntries(new FormData(e.target)) } }); $('#dlg').close(); await load(); }, 'Settings saved'); };
}
async function gen(id) {
  const f = D.formats.find(x => x.id === id);
  const r = await act(() => api(`/api/formats/${id}/generate`, { method: 'POST', body: { options: f.settings || {} } }));
  if (!r) return;
  dlg(`<h3>${esc(f.name)}: production requests</h3><div class="small">Status: ${esc(r.availability.status)} · ${esc(r.availability.reason)} · scores are estimates, not guaranteed performance</div>
  ${r.items.map(q => `<div class="req"><div style="display:flex;gap:14px;align-items:center"><div class="score">${q.score.score}</div><div><b>${esc(q.title)}</b><div class="comp">${Object.entries(q.score.components).map(([k, v]) => `${k} ${Math.round(v * 100)}`).join(' · ')}</div><div class="comp">est. ${Object.entries(q.estSecs).map(([k, v]) => `${k} ${v}s`).join(' · ')}</div></div></div>
  <details><summary class="small">Script (${f.durations.recommended})</summary>${q.script.map(s => `<div class="seg"><b>${esc(s.role)}</b>${esc(s.text)}</div>`).join('')}</details>
  <div class="btns"><button class="ok sm" data-acc="${esc(q.id)}">Approve production request</button><button class="ghost sm" data-smp="${esc(q.id)}">Preview sample video</button></div></div>`).join('') || '<p class="small">No valid request right now.</p>'}
  ${r.rejected.length ? `<details><summary class="small">${r.rejected.length} candidate(s) rejected by validation</summary>${r.rejected.map(x => `<div class="miss">${esc(x.key)}: ${esc(x.problems.join(' | '))}</div>`).join('')}</details>` : ''}`);
  $$('[data-acc]').forEach(b => b.onclick = () => act(async () => { const x = await api(`/api/formats/requests/${encodeURIComponent(b.dataset.acc)}/accept`, { method: 'POST', body: {} }); b.disabled = true; b.textContent = 'Approved → open in Video Factory'; b.onclick = () => (location.href = '/'); return x; }, 'Approved: the story is ready in the Video Factory'));
  $$('[data-smp]').forEach(b => b.onclick = () => act(async () => { const x = await api(`/api/formats/requests/${encodeURIComponent(b.dataset.smp)}/sample`, { method: 'POST', body: {} }); b.disabled = true; b.textContent = 'Rendering preview… (see Video Factory)'; return x; }, 'Preview render started in the Video Factory'));
}

async function cal() {
  const c = await api('/api/calendar?days=21');
  $('#view').innerHTML = `<p class="small">${esc(c.note)} 🏀 = EuroLeague game day. Dashed = manual entry.</p><div class="cal">${c.days.map(d => `<div class="day ${d.gameDay ? 'game' : ''}"><h5>${d.weekday} ${d.date.slice(5)} ${d.gameDay ? '🏀' : ''}${d.show ? `<br><span class="small">${esc(d.show)}</span>` : ''}</h5>
    ${d.slots.map(s => `<div class="slot ${s.manual ? 'man' : ''}">${esc(s.name)}<small>${esc(s.reason)}</small>${s.manual ? `<button class="ghost sm" data-del="${s.planId}">remove</button>` : ''}</div>`).join('')}</div>`).join('')}</div>
    <h3 style="margin-top:20px">Plan manually</h3><form id="pf" class="row"><label>Date<input name="date" type="date" required></label><label>Format<select name="formatId">${D.formats.map(f => `<option value="${f.id}">${f.number}. ${esc(f.name)}</option>`).join('')}</select></label><label>Note<input name="note"></label><label>&nbsp;<button>Add</button></label></form>`;
  $('#pf').onsubmit = e => { e.preventDefault(); act(async () => { await api('/api/calendar', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); cal(); }, 'Added to the plan'); };
  $$('[data-del]').forEach(b => b.onclick = () => act(async () => { await api(`/api/calendar/${b.dataset.del}`, { method: 'DELETE', body: {} }); cal(); }, 'Removed'));
}

async function perf() {
  const p = await api('/api/formats/performance');
  $('#view').innerHTML = `<p class="small">${esc(p.note)} Recommendations need at least ${p.minSample} published videos per format. Enter metrics per video in the Video Factory (Performance).</p>
  ${p.formats.length ? `<table><tr><th>Format</th><th>Videos</th><th>Published</th><th>Views</th><th>Views/video</th><th>Avg watch (s)</th><th>Completion</th><th>Shares</th><th>Comments</th><th>Engagement %</th><th>Site visits</th><th>Sign-ups</th><th>Recommendation</th></tr>
  ${p.formats.map(r => `<tr><td>${esc(r.name)}</td><td>${r.productions}</td><td>${r.published}</td><td>${r.views}</td><td>${r.viewsPerVideo ?? '–'}</td><td>${r.avgWatchSecs ?? '–'}</td><td>${r.completionRate ?? '–'}</td><td>${r.shares}</td><td>${r.comments}</td><td>${r.engagementRate ?? '–'}</td><td>${r.siteSessions}</td><td>${r.registrations}</td><td>${esc(r.recommendation)}</td></tr>`).join('')}</table>` : '<p class="small">No format productions yet.</p>'}`;
}
function data() {
  $('#view').innerHTML = `<table><tr><th>Dataset</th><th>Available</th><th>Coverage</th><th>Note</th></tr>${Object.entries(D.datasets).map(([k, d]) => `<tr><td><b>${esc(k)}</b><br><span class="small">${esc(d.label)}</span></td><td>${d.available ? '✓' : '✗'}</td><td class="small">${esc(JSON.stringify(d.coverage))}</td><td class="small">${esc(d.note || '')}</td></tr>`).join('')}</table>`;
}

$$('.tabs button').forEach(b => b.onclick = () => { $$('.tabs button').forEach(x => x.classList.toggle('on', x === b)); TAB = b.dataset.t; render(); });
await load();
