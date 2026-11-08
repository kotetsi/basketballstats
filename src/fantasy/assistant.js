// AI Fantasy Assistant (browser): Ανέβασε → Επιβεβαίωσε → Δες προτάσεις.
// Η εικόνα διαβάζεται στη συσκευή σου (Tesseract.js, OCR ανοιχτού κώδικα) και δεν αποθηκεύεται πουθενά.
// Αν έχει ρυθμιστεί endpoint μοντέλου όρασης (X.vision), ο χρήστης μπορεί να το επιλέξει· η εικόνα στέλνεται μόνο τότε.
// Η αντιστοίχιση, οι κανόνες, το budget και τα σενάρια γίνονται από τον κώδικα του assistant.mjs, όχι από μοντέλο.
import { parseScan, parseVision, validateTeam, readiness, assist, norm } from './assistant.mjs';
import { CLASSIC_RULES, tradesAllowed } from './rules.mjs';

const X = JSON.parse(document.getElementById('asctx').textContent), L = X.L;
const app = document.getElementById('asApp');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = v => (v == null || Number.isNaN(+v) ? '–' : (+v).toFixed(1));
const sg = v => (v == null ? '–' : `<b class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v > 0 ? '+' : ''}${(+v).toFixed(1)}</b>`);
const MAX_FILES = 4, MAX_MB = 10, TYPES = ['image/png', 'image/jpeg', 'image/webp'];
let D = null, P = new Map(), COACHES = [], READY = null;
const S = { step: 1, images: [], busy: false, msg: null, rows: [], coach: null, coachSt: null, bank: null, bankSrc: null, trades: null, unlimited: false, useVision: false, result: null, inPrice: {}, unresolved: [] };

const nm = c => P.get(c)?.dn || c, tm = t => esc(X.teams[t] || t);
const posL = p => esc(L.pos[p] || p);

async function init() {
  try { D = await fetch(X.api, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  catch { app.innerHTML = `<p class="fmwarn">${esc(L.err.data)}</p>`; return; }
  P = new Map(D.players.map(p => [p.c, p]));
  COACHES = (D.coaches || []).map(c => ({ ...c, price_src: c.price_src || 'estimate' }));
  READY = readiness({ round: D.round, generated: D.generated, deadline: X.deadline });
  const ta = tradesAllowed(D.round);
  S.trades = Number.isFinite(ta) ? ta : 4; S.unlimited = !Number.isFinite(ta);
  render();
}

// ---------------------------------------------------------------- εικόνες
function addFiles(files) {
  S.msg = null;
  for (const f of files) {
    if (S.images.length >= MAX_FILES) { S.msg = { k: 'err', t: L.err.tooMany.replace('{n}', MAX_FILES) }; break; }
    if (!TYPES.includes(f.type)) { S.msg = { k: 'err', t: L.err.type.replace('{f}', f.name) }; continue; }
    if (f.size > MAX_MB * 1048576) { S.msg = { k: 'err', t: L.err.size.replace('{f}', f.name).replace('{mb}', MAX_MB) }; continue; }
    S.images.push({ file: f, name: f.name, url: URL.createObjectURL(f), status: 'ready', pct: 0, text: null });
  }
  render();
}
/** προεπεξεργασία για OCR: ασπρόμαυρο, αντιστροφή σε σκούρο φόντο, αντίθεση, κατώφλι Otsu, μεγέθυνση μικρών εικόνων */
async function preprocess(file) {
  const bmp = await createImageBitmap(file);
  const k = bmp.width < 1000 ? 2 : 1, w = bmp.width * k, h = bmp.height * k;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, w, h);
  const im = g.getImageData(0, 0, w, h), d = im.data, n = w * h, gray = new Uint8ClampedArray(n);
  let sum = 0; for (let i = 0; i < n; i++) { const v = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]; gray[i] = v; sum += v; }
  const inv = sum / n < 128;
  const hist = new Array(256).fill(0); for (let i = 0; i < n; i++) { if (inv) gray[i] = 255 - gray[i]; hist[gray[i]]++; }
  // Otsu
  let tot = 0; for (let i = 0; i < 256; i++) tot += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (tot - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
  for (let i = 0; i < n; i++) { const v = gray[i] > th ? 255 : 0; d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v; d[4 * i + 3] = 255; }
  g.putImageData(im, 0, 0);
  return cv;
}
let TESS = null;
async function ocr(img, onPct) {
  if (!TESS) {
    const mod = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js');
    const T = mod.default || mod;
    TESS = await T.createWorker('eng', 1, { logger: m => { if (m.status === 'recognizing text') onPct(Math.round(100 * m.progress)); } });
    await TESS.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
  }
  const cv = await preprocess(img.file);
  const { data } = await TESS.recognize(cv);
  return data.text || '';
}
/** προαιρετικό: μοντέλο όρασης στον server (μόνο αν έχει ρυθμιστεί και το επιλέξει ο χρήστης) */
async function vision(img) {
  const bmp = await createImageBitmap(img.file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
  const r = await fetch(X.vision + '/extract', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob });
  if (r.status === 429) throw new Error(L.err.rate);
  if (!r.ok) throw new Error(L.err.vision);
  return r.json();
}
async function processImages() {
  if (!S.images.length) return;
  S.busy = true; S.msg = null; render();
  const texts = [], visions = [];
  try {
    for (const img of S.images) {
      img.status = 'working'; render();
      if (S.useVision && X.vision) visions.push(await vision(img));
      else texts.push(img.text ?? (img.text = await ocr(img, p => { img.pct = p; const el = app.querySelector(`[data-pct="${S.images.indexOf(img)}"]`); if (el) el.textContent = p + '%'; })));
      img.status = 'done'; render();
    }
  } catch (e) {
    S.busy = false; S.msg = { k: 'err', t: (e && e.message) || L.err.ocr }; S.images.forEach(i => { if (i.status === 'working') i.status = 'error'; }); render(); return;
  }
  const opts = { teams: X.teamsEn, greek: X.greek };
  const parts = [...texts.map(t => parseScan(t, D.players, opts)), ...visions.map(v => parseVision(v, D.players, opts))];
  // πολλά screenshots της ίδιας ομάδας: ένωση χωρίς διπλοεγγραφές
  const rows = new Map();
  let bank = null, coach = null, captain = null; const unresolved = [];
  for (const r of parts) {
    for (const e of r.entries) { const key = e.c || 'amb:' + e.options.map(o => o.c).join('|'); const prev = rows.get(key); if (!prev || (prev.price == null && e.price != null)) rows.set(key, e); }
    bank = bank || r.bank; coach = coach && coach.status === 'sure' ? coach : r.coach || coach; captain = captain || r.captain; unresolved.push(...r.unresolved);
  }
  S.rows = [...rows.values()].map(e => ({ c: e.status === 'sure' ? e.c : null, status: e.status, score: e.score, options: e.options || [], raw: e.raw, price: e.price, priceSrc: e.price != null ? 'scan' : null, slot: e.slotHint || null, captain: false, locked: false }));
  // δεν επιτρέπεται η ίδια επιλογή δύο φορές: αμφίβολες εγγραφές χωρίς επιλογές που απομένουν φεύγουν
  if (captain) { const r = S.rows.find(x => x.c === captain); if (r) { r.captain = true; r.capHint = true; } }
  S.bank = bank ? bank.value : null; S.bankSrc = bank ? 'scan' : null;
  S.coach = coach && coach.status === 'sure' ? coach.t : null; S.coachSt = coach ? coach.status : 'none';
  S.unresolved = [...new Set(unresolved)].slice(0, 10);
  S.busy = false; S.step = 2;
  // οι εικόνες δεν κρατιούνται
  for (const i of S.images) URL.revokeObjectURL(i.url);
  S.images = []; render();
}

// ---------------------------------------------------------------- ομάδα
const fromRows = () => ({
  roster: S.rows.map(r => r.c).filter(Boolean), coach: S.coach, bank: S.bank, trades: S.unlimited ? Infinity : S.trades,
  locked: S.rows.filter(r => r.c && r.locked).map(r => r.c), prices: Object.fromEntries(S.rows.filter(r => r.c && r.price != null && r.price !== '').map(r => [r.c, +r.price])),
});
function loadManager() {
  try {
    const st = JSON.parse(localStorage.getItem('fmt-v1')); const t = st?.teams?.[st.active];
    if (!t?.roster?.length) return false;
    S.rows = t.roster.map(c => ({ c, status: P.get(c) ? 'sure' : 'none', options: [], raw: nm(c), price: null, priceSrc: null, slot: null, captain: c === t.captain, locked: false }));
    S.coach = t.coach || null; S.coachSt = t.coach ? 'sure' : 'none';
    S.bank = t.bank ?? null; S.bankSrc = t.bank != null ? 'manager' : null;
    S.step = 2; return true;
  } catch { return false; }
}
function saveManager() {
  const r = S.result?.chosen; if (!r) return;
  let st; try { st = JSON.parse(localStorage.getItem('fmt-v1')) || { teams: [], active: 0 }; } catch { st = { teams: [], active: 0 }; }
  const team = fromRows();
  const ro = team.roster.map(c => (r.trades.find(t => t.out === c)?.in) || c);
  st.teams.push({ id: 'as' + Date.now(), name: L.savedName.replace('{r}', D.round), roster: ro, coach: r.coach ? r.coach.in : team.coach, formation: r.lineup.formation, captain: r.lineup.captain, transfers: 0, bank: r.bankAfter });
  st.active = st.teams.length - 1;
  try { localStorage.setItem('fmt-v1', JSON.stringify(st)); S.msg = { k: 'ok', t: L.saved }; } catch { S.msg = { k: 'err', t: L.err.save }; }
  render();
}

// ---------------------------------------------------------------- εμφάνιση
function head() {
  const iss = READY.issues.map(i => `<p class="fmwarn${i.block ? ' block' : ''}">${esc(L.issue[i.k].replace('{h}', i.h ?? ''))}</p>`).join('');
  const dl = X.deadline ? new Date(X.deadline).toLocaleString(X.loc, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' }) : '–';
  const up = new Date(D.generated).toLocaleString(X.loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' });
  const steps = [L.s1, L.s2, L.s3].map((t, i) => `<li class="${S.step === i + 1 ? 'on' : S.step > i + 1 ? 'done' : ''}"><span>${i + 1}</span>${esc(t)}</li>`).join('');
  return `<div class="asmeta"><span>${esc(L.round)} <b>${D.round}</b></span><span>${esc(L.deadline)} <b>${esc(dl)}</b></span><span>${esc(L.updated)} <b>${esc(up)}</b></span></div>${iss}<ol class="assteps">${steps}</ol>${S.msg ? `<p class="asmsg ${S.msg.k}" role="${S.msg.k === 'err' ? 'alert' : 'status'}">${esc(S.msg.t)}</p>` : ''}`;
}
function step1() {
  const imgs = S.images.map((i, k) => `<figure class="asimg"><img src="${i.url}" alt="${esc(i.name)}"><figcaption>${esc(i.name)} · ${i.status === 'working' ? `<span data-pct="${k}">${i.pct}%</span>` : esc(L.st[i.status])}${S.busy ? '' : ` <button type="button" data-act="rm-img" data-k="${k}" aria-label="${esc(L.remove)}">✕</button>`}</figcaption></figure>`).join('');
  return `<section class="assec"><h2>${esc(L.s1h)}</h2><p class="sub">${esc(L.s1help)}</p>
<label class="asdrop" tabindex="0"><input type="file" accept="image/png,image/jpeg,image/webp" multiple ${S.busy ? 'disabled' : ''} data-act="files"><span>📷 ${esc(L.pick)}</span><small>${esc(L.limits.replace('{n}', MAX_FILES).replace('{mb}', MAX_MB))}</small></label>
${imgs ? `<div class="asimgs">${imgs}</div>` : ''}
${X.vision ? `<label class="ascheck"><input type="checkbox" data-act="vision" ${S.useVision ? 'checked' : ''}> ${esc(L.useVision)}</label>` : `<p class="sub">🔒 ${esc(L.localOcr)}</p>`}
<p class="asbtns"><button type="button" class="primary" data-act="process" ${!S.images.length || S.busy ? 'disabled' : ''}>${S.busy ? '⏳ ' + esc(L.processing) : esc(L.process)}</button>
<button type="button" data-act="manual" ${S.busy ? 'disabled' : ''}>✍️ ${esc(L.manual)}</button>
<button type="button" data-act="from-manager" ${S.busy ? 'disabled' : ''}>📋 ${esc(L.fromManager)}</button></p></section>`;
}
const playerOpts = () => [...P.values()].sort((a, b) => a.dn.localeCompare(b.dn)).map(p => `<option value="${esc(p.dn)} · ${esc(p.t)} · ${esc(L.posS[p.pos])}"></option>`).join('');
function rowHtml(r, k) {
  const p = r.c ? P.get(r.c) : null;
  const pick = r.status === 'ambiguous' && !r.c
    ? `<div class="asamb"><p>${esc(L.ambiguous.replace('{raw}', r.raw))}</p>${r.options.map(o => `<label><input type="radio" name="amb${k}" data-act="amb" data-k="${k}" value="${o.c}"> ${esc(nm(o.c))} · ${tm(P.get(o.c)?.t)} · ${posL(P.get(o.c)?.pos)}${P.get(o.c)?.price != null ? ' · ~' + f1(P.get(o.c).price) : ''}</label>`).join('')}<label><input type="radio" name="amb${k}" data-act="amb" data-k="${k}" value=""> ${esc(L.noneOfThese)}</label></div>`
    : `<input list="asplayers" class="asname" data-act="name" data-k="${k}" value="${p ? esc(p.dn) + ' · ' + esc(p.t) + ' · ' + esc(L.posS[p.pos]) : ''}" placeholder="${esc(L.searchPlayer)}" aria-label="${esc(L.player)}">`;
  const conf = r.status === 'sure' && r.raw && r.score != null && r.score < 0.95 ? `<small class="asraw">${esc(L.readAs)} «${esc(r.raw)}»</small>` : '';
  const priceSrc = r.priceSrc === 'scan' ? L.fromImage : r.priceSrc === 'user' ? L.byYou : p ? L.siteEstimate : '';
  return `<tr class="${r.status === 'ambiguous' && !r.c ? 'amb' : ''}"><td class="l">${pick}${conf}${p && p.status !== 'playing' && p.status ? `<small class="asst st-${esc(p.status)}">${esc(L.status[p.status] || p.status)}</small>` : ''}</td>
<td data-l="${esc(L.position)}">${p ? posL(p.pos) : '–'}</td><td data-l="${esc(L.team)}">${p ? tm(p.t) : '–'}</td>
<td data-l="${esc(L.value)}"><input type="number" step="0.1" min="0" max="40" inputmode="decimal" class="asnum" data-act="price" data-k="${k}" value="${r.price ?? ''}" placeholder="${p?.price != null ? '~' + f1(p.price) : ''}" aria-label="${esc(L.value)}"><small>${esc(priceSrc)}</small></td>
<td data-l="${esc(L.slot)}"><select data-act="slot" data-k="${k}" aria-label="${esc(L.slot)}"><option value="">–</option>${['start', 'sixth', 'bench'].map(x => `<option value="${x}" ${r.slot === x ? 'selected' : ''}>${esc(L.slots[x])}</option>`).join('')}</select></td>
<td data-l="${esc(L.captain)}"><label class="ascheck${r.capHint ? ' asneed' : ''}" title="${esc(r.capHint ? L.capHint : L.captain)}"><input type="radio" name="ascap" data-act="cap" data-k="${k}" ${r.captain ? 'checked' : ''} ${r.c ? '' : 'disabled'}> C</label></td>
<td data-l="${esc(L.lock)}"><label class="ascheck"><input type="checkbox" data-act="lock" data-k="${k}" ${r.locked ? 'checked' : ''} ${r.c ? '' : 'disabled'}> 🔒</label></td>
<td class="asrm"><button type="button" data-act="rm-row" data-k="${k}" aria-label="${esc(L.remove)}">✕</button></td></tr>`;
}
function errText(e) {
  const t = L.verr[e.k] || e.k;
  return t.replace('{n}', e.n ?? '').replace('{need}', e.need ?? '').replace('{pos}', L.pos[e.pos] || '').replace('{t}', X.teams[e.t] || e.t || '').replace('{max}', e.max ?? '').replace('{codes}', (e.codes || []).join(', '));
}
function step2() {
  const team = fromRows();
  const v = validateTeam(team, P);
  const amb = S.rows.filter(r => r.status === 'ambiguous' && !r.c).length;
  const cnt = pos => S.rows.filter(r => r.c && P.get(r.c)?.pos === pos).length;
  const counters = ['Guard', 'Forward', 'Center'].map(pos => `<span class="${cnt(pos) === CLASSIC_RULES.roster[pos] ? 'ok' : 'bad'}">${esc(L.posS[pos])} ${cnt(pos)}/${CLASSIC_RULES.roster[pos]}</span>`).join('');
  const blocking = v.errors.length || amb || !READY.ok;
  const coachSel = `<select data-act="coach" aria-label="${esc(L.coach)}"><option value="">${esc(L.chooseCoach)}</option>${COACHES.slice().sort((a, b) => (X.teams[a.t] || a.t).localeCompare(X.teams[b.t] || b.t)).map(c => `<option value="${c.t}" ${S.coach === c.t ? 'selected' : ''}>${tm(c.t)}</option>`).join('')}</select>`;
  return `<section class="assec"><h2>${esc(L.s2h)}</h2><p class="sub">${esc(L.s2help)}</p>
${S.unresolved.length ? `<details class="asunres"><summary>${esc(L.unresolved.replace('{n}', S.unresolved.length))}</summary><p class="sub">${S.unresolved.map(esc).join(' · ')}</p></details>` : ''}
<p class="ascount">${counters} <span class="${S.rows.filter(r => r.c).length === 10 ? 'ok' : 'bad'}">${esc(L.players)} ${S.rows.filter(r => r.c).length}/10</span></p>
<div class="tbl"><table class="antbl astbl"><thead><tr><th class="l">${esc(L.player)}</th><th>${esc(L.position)}</th><th>${esc(L.team)}</th><th title="${esc(L.valueTip)}">${esc(L.value)}</th><th title="${esc(L.slotTip)}">${esc(L.slot)}</th><th title="${esc(L.capTip)}">C</th><th title="${esc(L.lockTip)}">${esc(L.lock)}</th><th></th></tr></thead><tbody>${S.rows.map(rowHtml).join('')}</tbody></table></div>
<datalist id="asplayers">${playerOpts()}</datalist>
<p><button type="button" data-act="add-row" ${S.rows.length >= 10 ? 'disabled' : ''}>＋ ${esc(L.addPlayer)}</button></p>
<div class="asgrid">
<label>${esc(L.coach)}${S.coachSt === 'ambiguous' || (S.coachSt === 'none' && S.step === 2) ? ` <small class="asneed">${esc(L.confirmCoach)}</small>` : ''} ${coachSel} <label class="ascheck"><input type="checkbox" data-act="lock-coach" ${S.lockCoach ? 'checked' : ''}> 🔒 ${esc(L.keepCoach)}</label></label>
<label>${esc(L.bank)} <input type="number" step="0.1" min="0" max="100" inputmode="decimal" class="asnum" data-act="bank" value="${S.bank ?? ''}" placeholder="${esc(L.required)}" required aria-required="true">${S.bankSrc === 'scan' ? `<small class="asneed">${esc(L.bankFromImage)}</small>` : S.bank == null ? `<small class="asneed">${esc(L.bankHelp)}</small>` : ''}</label>
<label>${esc(L.trades)} <input type="number" min="0" max="10" step="1" class="asnum" data-act="trades" value="${S.unlimited ? '' : S.trades}" ${S.unlimited ? 'disabled' : ''}><label class="ascheck"><input type="checkbox" data-act="unlimited" ${S.unlimited ? 'checked' : ''}> ${esc(L.unlimited)}</label><small>${esc(L.tradesHelp)}</small></label>
</div>
${v.errors.length || amb ? `<ul class="aserr">${amb ? `<li>${esc(L.verr.amb.replace('{n}', amb))}</li>` : ''}${v.errors.map(e => `<li>${esc(errText(e))}</li>`).join('')}</ul>` : ''}
${v.warn.filter(w => w.k === 'no_game').length ? `<p class="fmwarn">${esc(L.noGame.replace('{p}', v.warn.filter(w => w.k === 'no_game').map(w => nm(w.c)).join(', ')))}</p>` : ''}
<p class="asbtns"><button type="button" data-act="back">← ${esc(L.back)}</button><button type="button" class="primary" data-act="analyze" ${blocking ? 'disabled' : ''}>${esc(L.analyze)} →</button></p></section>`;
}
const whyText = w => (L.why[w.k] || w.k).replace('{a}', f1(w.a)).replace('{b}', f1(w.b)).replace('{s}', L.status[w.s] || w.s || '');
const riskText = w => (L.risk[w.k] || w.k).replace('{level}', L.lvl[w.level] || w.level || '');
function lineupHtml(lu) {
  return `<p class="aslu"><b>${esc(L.formation)} ${esc(lu.formation)}</b> · ${esc(L.captain)}: <b>${esc(nm(lu.captain))}</b></p><p class="sub">${esc(L.startFive)}: ${lu.start.map(c => esc(nm(c)) + (c === lu.captain ? ' (C)' : '')).join(', ')} · ${esc(L.sixth)}: ${esc(nm(lu.sixth))} · ${esc(L.bench)}: ${lu.bench.map(c => esc(nm(c))).join(', ')}</p>`;
}
function scenHtml(s, k) {
  const tr = s.trades.map(t => { const pin = S.inPrice[t.in]; return `<li><div class="astr"><span class="out">− ${esc(nm(t.out))} <small>${f1(t.priceOut)}${t.priceSrcOut === 'estimate' ? '*' : ''}</small></span> → <span class="in">+ ${esc(nm(t.in))} <small>${tm(P.get(t.in).t)} · ${f1(pin ?? t.priceIn)}${pin == null && t.priceSrcIn !== 'official' ? '*' : ''}</small></span></div>
<p class="sub">${t.why.map(whyText).map(esc).join(' · ')}</p>${t.risk.filter(r => r.k !== 'price_estimate').length ? `<p class="asrisk">⚠ ${t.risk.filter(r => r.k !== 'price_estimate').map(riskText).map(esc).join(' · ')}</p>` : ''}
<label class="asprice">${esc(L.officialPrice.replace('{p}', nm(t.in)))} <input type="number" step="0.1" min="0" max="40" inputmode="decimal" data-act="inprice" data-c="${t.in}" value="${pin ?? ''}" class="asnum"></label></li>`; }).join('');
  const coach = s.coach ? `<li><div class="astr"><span class="out">− ${esc(L.coach)} ${tm(s.coach.out)}</span> → <span class="in">+ ${tm(s.coach.in)} <small>${s.coach.cost > 0 ? '+' : ''}${f1(s.coach.cost)}*</small></span></div><p class="sub">${esc(L.why.coach.replace('{g}', f1(s.coach.gain)))}</p></li>` : '';
  const unc = s.uncertainty.length ? `<p class="asrisk">⚠ ${s.uncertainty.map(u => esc((L.unc[u.k] || u.k).replace('{p}', nm(u.c)))).join(' · ')}</p>` : '';
  return `<article class="asscen ${s.key}"><h3>${esc(L.scen[s.key])}</h3>
${s.trades.length || s.coach ? `<ul class="astrades">${tr}${coach}</ul>` : `<p>${esc(L.keepText)}</p>`}
<ul class="fmkpi"><li>${esc(L.trades)} <b>${s.nTrades}</b></li><li>${esc(L.cost)} <b>${f1(s.cost)}</b></li><li>${esc(L.bankAfter)} <b class="${s.bankAfter < 0 ? 'dn' : ''}">${f1(s.bankAfter)}</b></li>
<li title="${esc(L.dNextTip)}">${esc(L.dNext)} ${s.key === 'keep' ? `<b>${f1(s.after)}</b>` : sg(s.dNext)}</li>${s.key !== 'keep' ? `<li title="${esc(L.dHTip)}">${esc(L.dH)} ${sg(s.dHorizon)}</li>` : ''}</ul>
${lineupHtml(s.lineup)}${unc}
${s.priceEstimate ? `<p class="sub">* ${esc(L.priceNote)}</p>` : ''}
${s.key === 'keep' ? curCompare(s) : ''}${s.key !== 'keep' ? `<p><button type="button" data-act="save" data-k="${k}">💾 ${esc(L.saveTeam)}</button></p>` : ''}</article>`;
}
function curCompare(s) {
  const cap = S.rows.find(r => r.captain && r.c)?.c, bench = S.rows.filter(r => r.slot === 'bench' && r.c).map(r => r.c);
  const out = [];
  if (cap && cap !== s.lineup.captain) out.push(L.capChange.replace('{a}', nm(cap)).replace('{b}', nm(s.lineup.captain)));
  if (bench.length === 4) { const up = s.lineup.start.filter(c => bench.includes(c)); if (up.length) out.push(L.benchChange.replace('{p}', up.map(nm).join(', '))); }
  return out.length ? `<p class="asrisk">💡 ${out.map(esc).join(' ')}</p>` : '';
}
function step3() {
  const r = S.result;
  if (r.errors) return `<section class="assec"><ul class="aserr">${r.errors.map(e => `<li>${esc(errText(e))}</li>`).join('')}</ul><p><button type="button" data-act="back">← ${esc(L.back)}</button></p></section>`;
  const cards = r.scenarios.map((s, k) => scenHtml(s, k)).join('');
  return `<section class="assec"><h2>${esc(L.s3h)}</h2>
${r.recommendKeep ? `<p class="asok">✅ ${esc(L.recommendKeep)}</p>` : `<p class="sub">${esc(L.s3help.replace('{n}', r.scenarios.length))}</p>`}
<div class="asscens">${cards}${scenHtml(r.keep, -1)}</div>
<p class="note">${esc(L.method)} <a href="${X.perf}">${esc(L.perfLink)}</a></p>
<p class="asbtns"><button type="button" data-act="back">← ${esc(L.edit)}</button></p></section>`;
}
function render() {
  if (!D) return;
  const ae = document.activeElement, focusKey = ae && ae.dataset ? ae.dataset.act + ':' + (ae.dataset.k ?? ae.dataset.c ?? '') : null, sel = ae && 'selectionStart' in ae ? ae.selectionStart : null;
  app.innerHTML = head() + (S.step === 1 ? step1() : S.step === 2 ? step2() : step3()) + `<p class="note">${esc(L.disc)}</p>`;
  if (focusKey) { const el = [...app.querySelectorAll('[data-act]')].find(x => x.dataset.act + ':' + (x.dataset.k ?? x.dataset.c ?? '') === focusKey); if (el) { el.focus(); try { if (sel != null) el.setSelectionRange(sel, sel); } catch { } } }
}
function analyze() {
  const team = fromRows();
  if (S.lockCoach) team.locked = [...team.locked, 'coach'];
  // τιμές που έδωσες για όσους έρχονται: υπερισχύουν της εκτίμησης
  const players = D.players.map(p => (S.inPrice[p.c] != null ? { ...p, price: +S.inPrice[p.c], price_src: 'official' } : p));
  S.result = assist(team, players, COACHES);
  S.step = 3; render(); window.scrollTo({ top: app.offsetTop - 10, behavior: 'smooth' });
}
const parseName = v => { const dn = String(v).split(' · ')[0].trim(); return [...P.values()].find(p => p.dn === dn)?.c || null; };

app.addEventListener('change', e => {
  const el = e.target, a = el.dataset.act, k = +el.dataset.k;
  if (a === 'files') { addFiles([...el.files]); el.value = ''; return; }
  if (a === 'vision') S.useVision = el.checked;
  if (a === 'amb') { const r = S.rows[k]; if (el.value) { r.c = el.value; r.status = 'sure'; r.raw = r.raw; } else { r.c = null; r.status = 'none'; r.options = []; r.raw = ''; } }
  if (a === 'name') { const c = parseName(el.value); const r = S.rows[k]; r.c = c; r.status = c ? 'sure' : 'none'; r.raw = c ? '' : el.value; r.price = null; r.priceSrc = null; }
  if (a === 'price') { const r = S.rows[k]; r.price = el.value === '' ? null : +el.value; r.priceSrc = el.value === '' ? null : 'user'; }
  if (a === 'lock') S.rows[k].locked = el.checked;
  if (a === 'slot') S.rows[k].slot = el.value || null;
  if (a === 'cap') { S.rows.forEach((r, i) => { r.captain = i === k; r.capHint = false; }); }
  if (a === 'lock-coach') S.lockCoach = el.checked;
  if (a === 'coach') { S.coach = el.value || null; S.coachSt = el.value ? 'sure' : 'none'; }
  if (a === 'bank') { S.bank = el.value === '' ? null : +el.value; S.bankSrc = 'user'; }
  if (a === 'trades') S.trades = Math.max(0, Math.min(10, +el.value || 0));
  if (a === 'unlimited') S.unlimited = el.checked;
  if (a === 'inprice') { if (el.value === '') delete S.inPrice[el.dataset.c]; else S.inPrice[el.dataset.c] = +el.value; analyze(); return; }
  render();
});
app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
  const a = b.dataset.act, k = +b.dataset.k;
  if (a === 'rm-img') { URL.revokeObjectURL(S.images[k].url); S.images.splice(k, 1); }
  if (a === 'process') { processImages(); return; }
  if (a === 'manual') { S.rows = Array.from({ length: 10 }, () => ({ c: null, status: 'none', options: [], raw: '', price: null, priceSrc: null, locked: false })); S.step = 2; }
  if (a === 'from-manager') { if (!loadManager()) S.msg = { k: 'err', t: L.err.noManager }; }
  if (a === 'add-row') S.rows.push({ c: null, status: 'none', options: [], raw: '', price: null, priceSrc: null, locked: false });
  if (a === 'rm-row') S.rows.splice(k, 1);
  if (a === 'back') S.step = Math.max(1, S.step - 1);
  if (a === 'analyze') { analyze(); return; }
  if (a === 'save') { S.result.chosen = S.result.scenarios[k]; saveManager(); return; }
  render();
});
// σύρε-άφησε εικόνες
app.addEventListener('dragover', e => { if (S.step === 1) { e.preventDefault(); } });
app.addEventListener('drop', e => { if (S.step === 1 && e.dataTransfer?.files?.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });
// επικόλληση screenshot (Ctrl+V)
document.addEventListener('paste', e => { if (S.step !== 1) return; const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/')); if (fs.length) addFiles(fs); });
init();
