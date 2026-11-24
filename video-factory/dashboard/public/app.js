const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let META, SEL = null;
const base = f => String(f).split('/').pop();

async function api(p, o = {}) {
  const r = await fetch(p, { ...o, headers: { 'Content-Type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 4000); }
const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message); } };

async function loadMeta() {
  META = await api('/api/meta');
  const v = Object.values(META.voices);
  $('#meta').innerHTML = `<span>Data through round <b>${META.lastRound}</b></span><span>Voices ready: <b>${v.filter(x => x.available.ok).length}/${v.length}</b></span><span>AI script: <b>${META.llm.available ? META.llm.model : 'off (no ANTHROPIC_API_KEY)'}</b></span>`;
  if ((META.plugins || []).includes('/formats')) $('#fmtLink').hidden = false;
  $('#playerList').innerHTML = META.players.map(p => `<option value="${esc(p.slug)}">${esc(p.name)} · ${esc(p.team)}</option>`).join('');
}

async function loadLists() {
  const [s, p] = await Promise.all([api('/api/stories'), api('/api/productions')]);
  $('#stories').innerHTML = s.items.map(x => `<li data-story="${esc(x.id)}"><div class="t"><span class="badge ${x.status}">${x.status}</span>${esc(x.title)}</div><div class="m">${esc(x.type)} · data round ${x.lastRound}</div></li>`).join('') || '<li class="m">No stories yet.</li>';
  $('#prods').innerHTML = p.items.map(x => `<li data-prod="${esc(x.id)}" class="${x.id === SEL ? 'sel' : ''}"><div class="t"><span class="badge ${x.status}">${x.status}</span>${esc(x.story.title)}</div><div class="m">${x.settings.formats.join(', ')} · ${x.settings.preset} · ${esc(x.settings.voiceId)}</div></li>`).join('') || '<li class="m">No productions yet.</li>';
  $$('[data-story]').forEach(li => li.onclick = () => showStory(s.items.find(x => x.id === li.dataset.story)));
  $$('[data-prod]').forEach(li => li.onclick = () => showProd(li.dataset.prod));
}

function showStory(st) {
  SEL = null;
  const voices = Object.entries(META.voices).map(([k, v]) => `<option value="${k}" ${v.available.ok ? '' : 'disabled'}>${esc(v.label)}${v.available.ok ? '' : ` (${esc(v.available.reason)})`}</option>`).join('');
  $('#detail').innerHTML = `<div class="card"><span class="badge ${st.status}">${st.status}</span><h2>${esc(st.title)}</h2><div class="muted">${esc(st.type)} · source: ${esc(st.source)} · data as of ${esc((st.dataAsOf || '').slice(0, 16).replace('T', ' '))}</div>
    <details style="margin-top:8px"><summary class="muted">Story data</summary><pre class="facts">${esc(JSON.stringify(st.data, null, 1)).slice(0, 6000)}</pre></details>
    ${st.status !== 'approved' ? '<div class="btns"><button id="apSt" class="ok">Approve story</button></div>' : ''}</div>
    ${st.status === 'approved' ? `<div class="card"><h3>New production</h3>
      <div class="checks">${Object.entries(META.formats).map(([k, f]) => `<label><input type="checkbox" name="fmt" value="${k}" ${k !== '1x1' ? 'checked' : ''}>${esc(f.label)}</label>`).join('')}</div>
      <div class="row"><label>Duration <select id="pre">${Object.entries(META.durations).map(([k, d]) => `<option value="${k}" ${k === 'medium' ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>
      <label>Voice <select id="voi">${voices}</select></label>
      <label>Style <select id="sty">${Object.entries(META.styles).map(([k, s]) => `<option value="${k}">${esc(s.label)}</option>`).join('')}</select></label></div>
      <div class="checks"><label><input type="checkbox" id="mus" checked>Background music (generated, rights-free)</label></div>
      <div class="btns"><button id="mk">Create production</button></div></div>` : ''}`;
  $('#apSt') && ($('#apSt').onclick = () => act(async () => { const s = await api(`/api/stories/${encodeURIComponent(st.id)}/approve`, { method: 'POST', body: {} }); await loadLists(); showStory(s); }, 'Story approved'));
  $('#mk') && ($('#mk').onclick = () => act(async () => {
    const p = await api('/api/productions', { method: 'POST', body: { storyId: st.id, formats: $$('[name=fmt]:checked').map(i => i.value), preset: $('#pre').value, voiceId: $('#voi').value, style: $('#sty').value, music: $('#mus').checked } });
    await loadLists(); await api(`/api/productions/${encodeURIComponent(p.id)}/script`, { method: 'POST', body: { useLlm: true } }); showProd(p.id);
  }, 'Production created, script generated'));
}

let poll;
async function showProd(id, job) {
  SEL = id; clearTimeout(poll);
  const p = await api(`/api/productions/${encodeURIComponent(id)}`);
  $$('#prods li').forEach(li => li.classList.toggle('sel', li.dataset.prod === id));
  const sc = p.script, locked = ['approved', 'published'].includes(p.status);
  const vids = (p.renders || []).map(r => `<div class="vid"><video controls preload="metadata" src="/media/${encodeURIComponent(p.id)}/${base(r.file)}" poster="/media/${encodeURIComponent(p.id)}/${base(r.thumb)}"></video>
    <div class="m">${r.mode.toUpperCase()} · ${r.format} · ${r.w}×${r.h} · ${r.fps} fps · ${r.secs.toFixed(1)} s · ${(r.bytes / 1e6).toFixed(1)} MB · rendered in ${r.renderSecs}s</div>
    <div class="btns"><a href="/media/${encodeURIComponent(p.id)}/${base(r.file)}?download"><button class="ghost sm">Download MP4</button></a>${p.captions ? `<a href="/media/${encodeURIComponent(p.id)}/captions.srt?download"><button class="ghost sm">Captions .srt</button></a>` : ''}</div></div>`).join('');
  const plat = p.platforms ? `<table><tr><th>Platform</th><th>File</th><th>Title / description</th><th></th></tr>${Object.entries(p.platforms).map(([k, x]) => `<tr><td><b>${esc(x.platform)}</b>${x.ready ? '' : `<div class="note bad">${esc(x.issues.join('; '))}</div>`}</td><td>${x.format}</td><td>${x.title ? `<b>${esc(x.title)}</b><br>` : ''}<pre>${esc(x.description)}</pre></td><td>${p.status === 'approved' || p.status === 'published' ? `<button class="ghost sm" data-pub="${k}">Mark published</button>` : ''}</td></tr>`).join('')}</table>` : '<div class="muted">Platform versions appear after the final render.</div>';
  $('#detail').innerHTML = `
  <div class="card"><span class="badge ${p.status}">${p.status}</span><h2>${esc(p.story.title)}</h2>
    <div class="muted">${p.settings.formats.join(' + ')} · ${esc(META.durations[p.settings.preset].label)} · ${esc(META.voices[p.settings.voiceId]?.label || p.settings.voiceId)} · ${p.settings.style} · template ${esc(p.template)}</div></div>
  <div class="card"><h3>Script ${sc ? `· ${esc(sc.generator)} · ~${sc.estSecs}s${sc.edited ? ' · edited' : ''}` : ''}</h3>
    ${sc ? sc.segments.map(s => `<div class="seg"><div class="sc">${esc(s.scene)}<br><span class="muted">${esc(s.id)}</span></div><textarea data-seg="${esc(s.id)}" ${locked ? 'disabled' : ''}>${esc(s.text)}</textarea></div>`).join('') : '<div class="muted">No script yet.</div>'}
    ${sc ? `<div class="note ${sc.factCheck.ok ? 'okc' : 'bad'}">${sc.factCheck.ok ? '✓ every number comes from the story data' : '⛔ numbers not in the data: ' + esc(sc.factCheck.unsupported.join(', ')) + '. Fix before approval.'}</div>` : ''}
    ${sc?.llmNote ? `<div class="note">AI script: ${esc(sc.llmNote)} (template script used)</div>` : ''}
    <div class="btns">${locked ? '' : `<button id="regen" class="ghost">Regenerate script</button>${sc ? '<button id="saveS" class="ghost">Save edits</button>' : ''}`}</div></div>
  <div class="card"><h3>Render</h3>
    <div class="btns">${locked ? '' : `<button id="prev" class="ghost" ${sc ? '' : 'disabled'}>Generate preview (fast, ${p.settings.formats[0]})</button><button id="fin" ${sc ? '' : 'disabled'}>Render final (${p.settings.formats.join(' + ')})</button>`}
      ${p.status === 'rendered' ? '<button id="appr" class="ok">Approve for publication</button>' : ''}</div>
    <div id="job"></div>
    <div class="videos" style="margin-top:12px">${vids || '<div class="muted">Nothing rendered yet.</div>'}</div></div>
  <div class="card"><h3>Platform versions</h3>${plat}<p class="note">Nothing is published automatically. Upload the MP4 yourself, then click "Mark published".</p></div>
  <div class="card"><h3>Performance</h3>${perfForm(p)}</div>
  <div class="card"><h3>Production metadata</h3><div class="facts">Narration: ${p.narration ? `${esc(p.narration.provider)} / ${esc(p.narration.voice)} · ${p.narration.billedChars} chars billed · est. $${p.narration.estCostUsd}` : '–'} · Assets: ${p.assets.map(esc).join(', ')}</div>
    <ul class="hist">${(p.history || []).map(h => `<li>${esc(h.at.slice(0, 19).replace('T', ' '))} · ${esc(h.action)}</li>`).join('')}</ul></div>`;

  const pid = encodeURIComponent(p.id);
  $('#regen') && ($('#regen').onclick = () => act(async () => { await api(`/api/productions/${pid}/script`, { method: 'POST', body: { useLlm: true } }); showProd(id); }, 'Script regenerated'));
  $('#saveS') && ($('#saveS').onclick = () => act(async () => { await api(`/api/productions/${pid}/script`, { method: 'PUT', body: { segments: $$('[data-seg]').map(t => ({ id: t.dataset.seg, text: t.value })) } }); showProd(id); }, 'Script saved'));
  const render = mode => act(async () => { const j = await api(`/api/productions/${pid}/render`, { method: 'POST', body: { mode } }); watch(id, j.id); }, mode === 'preview' ? 'Preview rendering…' : 'Final render started…');
  $('#prev') && ($('#prev').onclick = () => render('preview'));
  $('#fin') && ($('#fin').onclick = () => render('final'));
  $('#appr') && ($('#appr').onclick = () => act(async () => { await api(`/api/productions/${pid}/approve`, { method: 'POST', body: {} }); await loadLists(); showProd(id); }, 'Approved for publication'));
  $$('[data-pub]').forEach(b => b.onclick = () => { const url = prompt('URL of the published video (optional):') ?? ''; act(async () => { await api(`/api/productions/${pid}/published`, { method: 'POST', body: { platform: b.dataset.pub, url } }); await loadLists(); showProd(id); }, 'Marked as published'); });
  $('#perf') && ($('#perf').onsubmit = e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); act(async () => { await api(`/api/productions/${pid}/metrics`, { method: 'POST', body: f }); showProd(id); }, 'Metrics saved'); });
  if (job) watch(id, job);
}

function perfForm(p) {
  const rows = Object.entries(p.performance || {}).map(([k, m]) => `<tr><td>${esc(META.platforms[k]?.label || k)}</td>${['views', 'avgWatchSecs', 'completionRate', 'shares', 'clicks', 'siteSessions'].map(x => `<td>${m[x] ?? '–'}</td>`).join('')}</tr>`).join('');
  return `${rows ? `<table><tr><th>Platform</th><th>Views</th><th>Avg watch (s)</th><th>Completion</th><th>Shares</th><th>Clicks</th><th>Site sessions</th></tr>${rows}</table>` : '<div class="muted">No metrics yet.</div>'}
  <form id="perf" class="row" style="margin-top:10px"><label>Platform <select name="platform">${Object.entries(META.platforms).map(([k, x]) => `<option value="${k}">${esc(x.label)}</option>`).join('')}</select></label>
  ${['views', 'avgWatchSecs', 'completionRate', 'shares', 'clicks', 'siteSessions'].map(x => `<label>${x}<input name="${x}" type="number" step="any"></label>`).join('')}<label>&nbsp;<button>Save</button></label></form>`;
}

async function watch(id, jobId) {
  const j = await api(`/api/jobs/${jobId}`);
  const el = $('#job'); if (!el || SEL !== id) return;
  el.innerHTML = `<div class="note">${j.kind}: <b>${j.status}</b>${j.error ? ` · <span class="bad">${esc(j.error)}</span>` : ''}</div><div class="log">${j.log.slice(-8).map(esc).join('<br>')}</div>`;
  if (j.status === 'queued' || j.status === 'running') poll = setTimeout(() => watch(id, jobId), 1500);
  else { await loadLists(); if (j.status === 'done') { toast('Render finished'); showProd(id); } }
}

$('#newStory').onclick = () => $('#storyDlg').showModal();
$('[name=type]').onchange = e => $$('[data-for]').forEach(d => (d.hidden = d.dataset.for !== e.target.value));
$('#storyForm').addEventListener('submit', async e => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target)), type = f.type;
  const params = type === 'leaderboard' ? { metric: f.metric, scope: f.scope, round: f.round || undefined, limit: f.limit } : type === 'comparison' ? { a: f.a, b: f.b } : { player: f.player, n: f.n };
  await act(async () => { const s = await api('/api/stories', { method: 'POST', body: { type, params } }); $('#storyDlg').close(); await loadLists(); showStory(s); }, 'Story built: review and approve it');
});

await loadMeta(); await loadLists();
