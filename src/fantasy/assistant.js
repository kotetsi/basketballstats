// AI Fantasy Assistant (browser): Ανέβασε → Επιβεβαίωσε → Δες προτάσεις.
// Η εικόνα διαβάζεται στη συσκευή σου (Tesseract.js, OCR ανοιχτού κώδικα) και δεν αποθηκεύεται πουθενά.
// Αν έχει ρυθμιστεί endpoint μοντέλου όρασης (X.vision), ο χρήστης μπορεί να το επιλέξει· η εικόνα στέλνεται μόνο τότε.
// Η αντιστοίχιση, οι κανόνες, το budget και τα σενάρια γίνονται από τον κώδικα του assistant.mjs, όχι από μοντέλο.
import { parseScan, parseVision, parseCards, parseHeader, findAnchors, cardRegions, oppFrom, validateTeam, readiness, assist, norm } from './assistant.mjs';
import { CLASSIC_RULES, tradesAllowed } from './rules.mjs';

const X = JSON.parse(document.getElementById('asctx').textContent), L = X.L;
const app = document.getElementById('asApp');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = v => (v == null || Number.isNaN(+v) ? '–' : (+v).toFixed(1));
const sg = v => (v == null ? '–' : `<b class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v > 0 ? '+' : ''}${(+v).toFixed(1)}</b>`);
const MAX_FILES = 4, MAX_MB = 10, TYPES = ['image/png', 'image/jpeg', 'image/webp'];
let D = null, P = new Map(), COACHES = [], READY = null;
const S = { step: 1, images: [], busy: false, msg: null, rows: [], coach: null, coachSt: null, bank: null, bankSrc: null, total: null, totalSrc: null, trades: null, unlimited: false, useVision: false, result: null, inPrice: {}, unresolved: [], view: 0, repl: null, applied: [] };

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
/** προεπεξεργασία για OCR (μεγέθυνση μικρών εικόνων, ασπρόμαυρο). mode:
 *  'otsu' = κατώφλι Otsu με αυτόματη αντιστροφή σε σκούρο φόντο · 'otsu-inv' = το ίδιο με την ανάποδη αντιστροφή
 *  (λευκά γράμματα σε χρωματιστές κάρτες) · 'gray' = μόνο ασπρόμαυρο με τεντωμένη αντίθεση */
async function preprocess(file, mode = 'otsu', force = 0) {
  const bmp = await createImageBitmap(file);
  const k = force || (bmp.width < 1000 ? 2 : 1), w = bmp.width * k, h = bmp.height * k;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, w, h);
  const im = g.getImageData(0, 0, w, h), d = im.data, n = w * h, gray = new Uint8ClampedArray(n);
  let sum = 0; for (let i = 0; i < n; i++) { const v = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]; gray[i] = v; sum += v; }
  const inv = (sum / n < 128) !== (mode === 'otsu-inv');
  const hist = new Array(256).fill(0); for (let i = 0; i < n; i++) { if (inv) gray[i] = 255 - gray[i]; hist[gray[i]]++; }
  if (mode === 'gray') {
    let lo = 255, hi = 0; for (let i = 0; i < n; i++) { if (gray[i] < lo) lo = gray[i]; if (gray[i] > hi) hi = gray[i]; }
    const k2 = 255 / Math.max(1, hi - lo);
    for (let i = 0; i < n; i++) { const v = (gray[i] - lo) * k2; d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v; d[4 * i + 3] = 255; }
    g.putImageData(im, 0, 0); return cv;
  }
  // Otsu
  let tot = 0; for (let i = 0; i < 256; i++) tot += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (tot - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
  for (let i = 0; i < n; i++) { const v = gray[i] > th ? 255 : 0; d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v; d[4 * i + 3] = 255; }
  g.putImageData(im, 0, 0);
  return cv;
}
let TESS = null;
const otsuTh = (gray) => {
  const hist = new Array(256).fill(0); for (const v of gray) hist[v]++;
  let tot = 0; for (let i = 0; i < 256; i++) tot += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128; const n = gray.length;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (tot - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
  return th;
};
const wordsOf = data => (data.words && data.words.length ? data.words : (data.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p => (p.lines || []).flatMap(l => l.words || []))));
/** λωρίδα ονόματος κάρτας → δύο εκδοχές για OCR μίας γραμμής (γκρι και δυαδική), με σκούρα γράμματα σε λευκό */
function bandCanvases(bmp, r) {
  const x0 = Math.max(0, Math.round(r.x0)), y0 = Math.max(0, Math.round(r.y0)), x1 = Math.min(bmp.width, Math.round(r.x1)), y1 = Math.min(bmp.height, Math.round(r.y1));
  const w = x1 - x0, h = y1 - y0; if (w < 10 || h < 6) return [];
  const K = 3, W = w * K, H = h * K;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, x0, y0, w, h, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, n = W * H, gray = new Uint8ClampedArray(n);
  let sum = 0; for (let i = 0; i < n; i++) { gray[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]; sum += gray[i]; }
  if (sum / n < 128) for (let i = 0; i < n; i++) gray[i] = 255 - gray[i];
  let lo = 255, hi = 0; for (const v of gray) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const k2 = 255 / Math.max(1, hi - lo); for (let i = 0; i < n; i++) gray[i] = (gray[i] - lo) * k2;
  // μόνο οι γραμμές της λωρίδας: η μεγαλύτερη συνεχής ζώνη με φωτεινό φόντο (διάμεσος ≥ 190)
  let bs = 0, be = 0, st = -1;
  for (let y = 0; y <= H; y++) {
    let ok = false;
    if (y < H) { const row = []; for (let x = 0; x < W; x += 2) row.push(gray[y * W + x]); row.sort((a, b) => a - b); ok = row[row.length >> 1] >= 190; }
    if (ok && st < 0) st = y;
    if (!ok && st >= 0) { if (y - st > be - bs) { bs = st; be = y; } st = -1; }
  }
  if (be - bs < 10) return [];
  const th = otsuTh(gray.subarray(bs * W, be * W)), P = 20, out = [];
  for (const bin of [false, true]) {
    const c = document.createElement('canvas'); c.width = W + 2 * P; c.height = be - bs + 2 * P;
    const cg = c.getContext('2d'); cg.fillStyle = '#fff'; cg.fillRect(0, 0, c.width, c.height);
    const im = cg.createImageData(W, be - bs);
    for (let y = bs; y < be; y++) for (let x = 0; x < W; x++) { const v = gray[y * W + x], o = 4 * ((y - bs) * W + x), q = bin ? (v > th ? 255 : 0) : v; im.data[o] = im.data[o + 1] = im.data[o + 2] = q; im.data[o + 3] = 255; }
    cg.putImageData(im, P, P); out.push(c);
  }
  return out;
}
/** κομμάτι εικόνας → ×3, κατώφλι Otsu, το κείμενο (η μειοψηφία των pixel) μαύρο σε λευκό */
function headerCanvas(bmp, r) {
  const x0 = Math.max(0, Math.round(r.x0)), y0 = Math.max(0, Math.round(r.y0)), x1 = Math.min(bmp.width, Math.round(r.x1)), y1 = Math.min(bmp.height, Math.round(r.y1));
  const w = x1 - x0, h = y1 - y0; if (w < 20 || h < 8) return null;
  const K = 3, W = w * K, H = h * K, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, x0, y0, w, h, 0, 0, W, H);
  const im = g.getImageData(0, 0, W, H), d = im.data, n = W * H, gray = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) gray[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  const th = otsuTh(gray); let hi = 0; for (const v of gray) if (v > th) hi++;
  const textHigh = hi < n / 2;
  for (let i = 0; i < n; i++) { const q = (gray[i] > th) === textHigh ? 0 : 255; d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = q; d[4 * i + 3] = 255; }
  g.putImageData(im, 0, 0); return cv;
}
/** σήμα αρχηγού: ποσοστό «λαχανί» pixel στην πάνω δεξιά γωνία της κάρτας */
function limeRatio(bmp, r) {
  const x0 = Math.max(0, Math.round(r.x0)), y0 = Math.max(0, Math.round(r.y0)), w = Math.min(bmp.width, Math.round(r.x1)) - x0, h = Math.min(bmp.height, Math.round(r.y1)) - y0;
  if (w < 2 || h < 2) return 0;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, x0, y0, w, h, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data; let k = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 200 && d[i] > 170 && d[i + 2] < 90 && d[i + 1] - d[i + 2] > 130) k++;
  return k / (w * h);
}
/** OCR μιας εικόνας. Πρώτα αραιά περάσματα με θέσεις λέξεων: αν βρεθούν κάρτες της επίσημης εφαρμογής (αξία + CR/T1-3),
 * κάθε λωρίδα ονόματος διαβάζεται χωριστά. Αλλιώς: επιπλέον περάσματα και ανάλυση του κειμένου γραμμή-γραμμή. */
async function ocr(img, onPct) {
  if (!TESS) {
    const mod = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js');
    const T = mod.default || mod;
    TESS = await T.createWorker('eng', 1);
    await TESS.setParameters({ preserve_interword_spaces: '1' });
  }
  const bmp = await createImageBitmap(img.file), scale = bmp.width < 1000 ? 2 : 1;
  const texts = [], words = [];
  const sparse = [['otsu', '11'], ['gray', '11']];
  for (let i = 0; i < sparse.length; i++) {
    const [mode, psm] = sparse[i];
    await TESS.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await TESS.recognize(await preprocess(img.file, mode), {}, { text: true, blocks: true });
    texts.push(data.text || '');
    for (const w of wordsOf(data)) if (w.text && w.text.trim() && w.bbox) words.push({ text: w.text.trim(), x0: w.bbox.x0 / scale, y0: w.bbox.y0 / scale, x1: w.bbox.x1 / scale, y1: w.bbox.y1 / scale });
    onPct(Math.round(40 * (i + 1) / sparse.length));
  }
  // κεφαλίδα της εφαρμογής (credits αδιάθετα/σύνολο, αλλαγές): μικρό λευκό κείμενο σε πορτοκαλί, διαβάζεται μόνο σε κομμένη μεγέθυνση
  let header = '';
  const rw = words.find(w => /^ROUND$/i.test(w.text)), tw = words.find(w => /^TURN$/i.test(w.text) && rw && Math.abs(w.y0 - rw.y0) < (rw.y1 - rw.y0) * 1.5 && w.x0 > rw.x1);
  if (rw && tw) {
    const h = Math.max(6, rw.y1 - rw.y0);
    const cv = headerCanvas(bmp, { x0: rw.x0 - 10 * h, y0: rw.y1 + 1.5 * h, x1: tw.x1 + 2 * (tw.x0 - rw.x0), y1: rw.y1 + 7.5 * h });
    if (cv) { await TESS.setParameters({ tessedit_pageseg_mode: '6' }); const { data } = await TESS.recognize(cv); header = data.text || ''; }
  }
  let anchors = findAnchors(words);
  // μικρά γράμματα (π.χ. ολόκληρη σελίδα σε υπολογιστή): ένα ακόμα πέρασμα σε ×3 μεγέθυνση
  if (anchors.length < 8 && bmp.width <= 2000) {
    await TESS.setParameters({ tessedit_pageseg_mode: '11' });
    const { data } = await TESS.recognize(await preprocess(img.file, 'gray', 3), {}, { text: true, blocks: true });
    texts.push(data.text || '');
    for (const w of wordsOf(data)) if (w.text && w.text.trim() && w.bbox) words.push({ text: w.text.trim(), x0: w.bbox.x0 / 3, y0: w.bbox.y0 / 3, x1: w.bbox.x1 / 3, y1: w.bbox.y1 / 3 });
    anchors = findAnchors(words);
  }
  if (window.__asDebug) window.__asDebug.push({ w: bmp.width, h: bmp.height, words: words.length, anchors: anchors.map(a => [a.price, Math.round(a.x0), Math.round(a.y0), Math.round(a.h)]), header });
  if (anchors.length >= 3) {
    await TESS.setParameters({ tessedit_pageseg_mode: '7' });
    const cards = [];
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i], R = cardRegions(a), cs = bandCanvases(bmp, R.name), t = [];
      for (const c of cs) { const { data } = await TESS.recognize(c); if (data.text && data.text.trim()) t.push(data.text.trim()); }
      cards.push({ texts: t, text: t[0] || '', price: a.price, opp: oppFrom(words, a), captain: limeRatio(bmp, R.badge) > 0.02, x: a.x0, y: a.y0 });
      onPct(40 + Math.round(60 * (i + 1) / anchors.length));
    }
    if (window.__asDebug) window.__asDebug.push({ cards: cards.map(c => [c.texts, c.price, c.opp && c.opp.code, c.captain]) });
    bmp.close?.();
    return { text: texts.join('\n'), cards, header };
  }
  const more = [['otsu', '3'], ['otsu-inv', '3']];
  for (let i = 0; i < more.length; i++) {
    const [mode, psm] = more[i];
    await TESS.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await TESS.recognize(await preprocess(img.file, mode));
    texts.push(data.text || '');
    onPct(40 + Math.round(60 * (i + 1) / more.length));
  }
  bmp.close?.();
  return { text: texts.join('\n'), cards: null, header };
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
      else texts.push(img.res ?? (img.res = await ocr(img, p => { img.pct = p; const el = app.querySelector(`[data-pct="${S.images.indexOf(img)}"]`); if (el) el.textContent = p + '%'; })));
      img.status = 'done'; render();
    }
  } catch (e) {
    S.busy = false; S.msg = { k: 'err', t: (e && e.message) || L.err.ocr }; S.images.forEach(i => { if (i.status === 'working') i.status = 'error'; }); render(); return;
  }
  const opts = { teams: X.teamsEn, greek: X.greek };
  // κάρτες της επίσημης εφαρμογής (θέση, ομάδα από τον αντίπαλο, αρχηγός, 6ος/πάγκος) · αλλιώς ανάλυση κειμένου
  const parts = [...texts.map(r => {
    if (r.cards) { const c = parseCards(r.cards, D.players, COACHES, opts); if (c.sureCount >= 3) return c; const t = parseScan(r.text, D.players, opts); return t.sureCount > c.sureCount ? t : c; }
    return parseScan(r.text, D.players, opts);
  }), ...visions.map(v => parseVision(v, D.players, opts))];
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
  S.coach = coach && coach.status === 'sure' ? coach.t : null; S.coachSt = coach ? coach.status : 'none'; S.coachPrice = coach && coach.status === 'sure' && coach.price != null ? coach.price : null;
  S.unresolved = [...new Set(unresolved)].slice(0, 10);
  // συνολικά credits της ομάδας: αν διαβάστηκαν όλες οι αξίες (10 παίκτες + προπονητής), το άθροισμά τους (+ αδιάθετα αν φάνηκαν)
  const tv = teamValue();
  S.total = tv.n === 10 && !tv.est ? +(tv.v + (bank ? bank.value : 0)).toFixed(1) : null; S.totalSrc = S.total != null ? 'scan' : null;
  // κεφαλίδα της εφαρμογής: «8.3/106.2 CREDITS», «1/4 TRADES»
  let H = { bank: null, total: null, tradesUsed: null, tradesMax: null };
  for (const r of texts) for (const src of [r.header, r.text]) { const h = parseHeader(src); for (const k in H) if (H[k] == null && h[k] != null) H[k] = h[k]; }
  if (H.total != null) { S.total = H.total; S.totalSrc = 'scan'; }
  if (H.tradesMax != null) { S.trades = Math.max(0, H.tradesMax - (H.tradesUsed || 0)); S.unlimited = false; S.tradesSrc = 'scan'; }
  // αξία προπονητή από τον λογαριασμό: σύνολο − αδιάθετα − παίκτες (αν έχουμε όλες τις αξίες των παικτών)
  const allPl = S.rows.filter(r => r.c).length && S.rows.filter(r => r.c).every(r => r.price != null);
  if (S.coach && S.coachPrice == null && H.total != null && H.bank != null && allPl) { const cv2 = Math.round((H.total - H.bank - teamValue().pl) * 10) / 10; if (cv2 >= 0.5 && cv2 <= 15) S.coachPrice = cv2; }
  S.headerRead = H.total != null;
  S.busy = false; S.step = 2;
  // οι εικόνες δεν κρατιούνται
  for (const i of S.images) URL.revokeObjectURL(i.url);
  S.images = []; render();
}

// ---------------------------------------------------------------- ομάδα
/** αξία ομάδας: αξίες από την εικόνα ή όσες έγραψες, αλλιώς εκτίμηση του site (est = υπάρχει έστω μία εκτίμηση) */
function teamValue() {
  let v = 0, n = 0; const estOf = [];
  for (const r of S.rows) { if (!r.c) continue; n++; if (r.price != null && r.price !== '') v += +r.price; else { v += +(P.get(r.c)?.price || 0); estOf.push(nm(r.c)); } }
  let co = 0;
  if (S.coach) { if (S.coachPrice != null) co = +S.coachPrice; else { co = +(COACHES.find(x => x.t === S.coach)?.price || 0); estOf.push(L.coach); } }
  return { v: v + co, pl: v, co, n, est: estOf.length > 0, estOf };
}
/** αδιάθετα credits = συνολικά credits ομάδας − αξία παικτών και προπονητή */
const bankOf = () => (S.total == null ? null : Math.round((S.total - teamValue().v) * 10) / 10);
const fromRows = () => ({
  roster: S.rows.map(r => r.c).filter(Boolean), coach: S.coach, coachPrice: S.coachPrice ?? null, bank: bankOf(), trades: S.unlimited ? Infinity : S.trades,
  locked: S.rows.filter(r => r.c && r.locked).map(r => r.c), prices: Object.fromEntries(S.rows.filter(r => r.c && r.price != null && r.price !== '').map(r => [r.c, +r.price])),
});
function loadManager() {
  try {
    const st = JSON.parse(localStorage.getItem('fmt-v1')); const t = st?.teams?.[st.active];
    if (!t?.roster?.length) return false;
    S.rows = t.roster.map(c => ({ c, status: P.get(c) ? 'sure' : 'none', options: [], raw: nm(c), price: null, priceSrc: null, slot: null, captain: c === t.captain, locked: false }));
    S.coach = t.coach || null; S.coachSt = t.coach ? 'sure' : 'none';
    S.total = t.bank != null ? +(teamValue().v + +t.bank).toFixed(1) : null; S.totalSrc = t.bank != null ? 'manager' : null;
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
  return t.replace('{n}', e.n ?? '').replace('{need}', e.need ?? '').replace('{pos}', L.pos[e.pos] || '').replace('{t}', X.teams[e.t] || e.t || '').replace('{max}', e.max ?? '').replace('{codes}', (e.codes || []).join(', ')).replace('{b}', f1(e.b)).replace('{v}', f1(e.v)).replace('{tot}', f1(S.total)).replace('{val}', f1(teamValue().v));
}
/** αξία προπονητή στο παιχνίδι (από την εικόνα ή γραμμένη)· αν λείπει, πρόταση από τον λογαριασμό: σύνολο − αξία παικτών */
function coachValHtml() {
  if (!S.coach) return '';
  const tv = teamValue(), allPl = S.rows.filter(r => r.c).every(r => r.price != null && r.price !== '');
  const implied = S.total != null && allPl ? Math.round((S.total - tv.pl) * 10) / 10 : null;
  const hint = S.coachPrice == null && implied != null && implied >= 0.5 && implied <= 15
    ? `<small class="asneed">${esc(L.coachImplied.replace('{v}', f1(implied)))} <button type="button" data-act="coach-implied" data-v="${implied}">${esc(L.useIt)}</button></small>` : '';
  return `<span class="ascoachval">${esc(L.coachValue)} <input type="number" step="0.1" min="0" max="30" inputmode="decimal" class="asnum" data-act="coachprice" value="${S.coachPrice ?? ''}" placeholder="${esc(L.coachValuePh)}"></span>${hint}`;
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
<label>${esc(L.coach)}${S.coachSt === 'ambiguous' || (S.coachSt === 'none' && S.step === 2) ? ` <small class="asneed">${esc(L.confirmCoach)}</small>` : ''} ${coachSel}${coachValHtml()} <label class="ascheck"><input type="checkbox" data-act="lock-coach" ${S.lockCoach ? 'checked' : ''}> 🔒 ${esc(L.keepCoach)}</label></label>
<label>${esc(L.total)} <input type="number" step="0.1" min="0" max="200" inputmode="decimal" class="asnum" data-act="total" value="${S.total ?? ''}" placeholder="${esc(L.required)}" required aria-required="true">${(() => { const tv = teamValue(), b = bankOf(); return `<small>${esc(L.totalHelp)}</small>${S.totalSrc === 'scan' ? `<small class="asneed">${esc(L.totalFromImage)}</small>` : ''}<small class="asvalue">${esc(L.valueLine.replace('{pl}', f1(tv.pl)).replace('{co}', f1(tv.co)).replace('{v}', f1(tv.v)))}${b != null ? ` → <b>${esc(L.freeLine.replace('{b}', f1(b)))}</b>` : ''}</small>${tv.est ? `<small class="asneed">${esc(L.valueEst.replace('{p}', tv.estOf.join(', ')))}</small>` : ''}`; })()}</label>
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
const surname = c => { const n = String(P.get(c)?.n || c).split(',')[0].trim().toLowerCase(); return n.replace(/(^|[\s-])\p{L}/gu, m => m.toUpperCase()); };
const POS1 = { Guard: 'G', Forward: 'F', Center: 'C' };
/** τιμή για την κάρτα: ό,τι έδωσες/διαβάστηκε > τιμή αγοράς του σεναρίου > εκτίμηση site */
function priceOf(c, s) {
  if (S.inPrice[c] != null) return { v: +S.inPrice[c], est: false };
  const r = S.rows.find(x => x.c === c); if (r && r.price != null && r.price !== '') return { v: +r.price, est: false };
  const t = s.trades.find(x => x.in === c); if (t) return { v: t.priceIn, est: t.priceSrcIn !== 'official' };
  return { v: P.get(c)?.price, est: true };
}
/** κάρτα παίκτη όπως στην εφαρμογή: θέση + επώνυμο, αξία, αντίπαλος, εκτίμηση, σήμα αρχηγού / νέου */
function pcard(c, s, isNew) {
  const p = P.get(c) || {}, pr = priceOf(c, s), cap = c === s.lineup.captain;
  const opp = p.opp ? `${p.home ? 'VS' : '@'} ${esc(p.opp)}` : '–';
  return `<div class="ascard${isNew ? ' new' : ''}">${cap ? '<span class="ascap">C</span>' : ''}${isNew ? `<span class="asnew">${esc(L.newTag)}</span>` : ''}
<span class="asteam">${esc(p.t || '')}</span>
<div class="asband"><i>${POS1[p.pos] || ''}</i> ${esc(surname(c))}</div>
<div class="asinfo"><span><b>${f1(pr.v)}${pr.est ? '*' : ''}</b><small>CR</small></span><span title="${esc(L.estTip)}"><b>${f1(cap ? 2 * (p.pp || 0) : p.pp)}</b><small>${esc(L.estPts)}</small></span><span><small>${opp}</small></span></div></div>`;
}
function ccard(t, s) {
  const co0 = COACHES.find(x => x.t === t) || {}, co = { ...co0, price: S.result?.coachPrices?.[t] ?? co0.price }, isNew = !!s.coach && s.coach.in === t;
  const opp = co.opp ? `${co.home ? 'VS' : '@'} ${esc(co.opp)}` : '–';
  return `<div class="ascard coach${isNew ? ' new' : ''}">${isNew ? `<span class="asnew">${esc(L.newTag)}</span>` : ''}<span class="asteam">${esc(t || '')}</span>
<div class="asband"><i>HC</i> ${tm(t)}</div><div class="asinfo"><span><b>${t === S.coach && S.coachPrice != null ? f1(S.coachPrice) : f1(co.price) + '*'}</b><small>CR</small></span><span><b>${f1(co.exp)}</b><small>${esc(L.estPts)}</small></span><span><small>${opp}</small></span></div></div>`;
}
/** η προτεινόμενη ομάδα στο «γήπεδο»: πεντάδα ανά θέση (C πάνω, F, G κάτω), από κάτω 6ος + προπονητής και πάγκος */
function courtHtml(s) {
  const lu = s.lineup, isNew = new Set(s.trades.map(t => t.in));
  const coachT = s.coach ? s.coach.in : S.coach;
  const row = pos => { const cs = lu.start.filter(c => P.get(c)?.pos === pos); return cs.length ? `<div class="ascrow">${cs.map(c => pcard(c, s, isNew.has(c))).join('')}</div>` : ''; };
  return `<div class="ascourt" role="group" aria-label="${esc(L.courtAria)}">
<div class="asfive"><p class="ascl">${esc(L.startFive)} · ${esc(lu.formation)}</p>${row('Center')}${row('Forward')}${row('Guard')}</div>
<div class="aslower"><div class="ascol"><p class="ascl">${esc(L.sixthPct)}</p>${lu.sixth ? pcard(lu.sixth, s, isNew.has(lu.sixth)) : ''}<p class="ascl">${esc(L.coach)}</p>${coachT ? ccard(coachT, s) : '<div class="ascard empty">–</div>'}</div>
<div class="asbenchbox"><p class="ascl">${esc(L.benchPct)}</p><div class="asbench">${lu.bench.map(c => pcard(c, s, isNew.has(c))).join('')}</div></div></div></div>
${s.trades.length || s.coach ? `<p class="asouts">${esc(L.outH)}: ${[...s.trades.map(t => esc(nm(t.out))), ...(s.coach ? [esc(L.coach) + ' ' + tm(s.coach.out)] : [])].join(', ')}</p>` : ''}`;
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
${s.trades.length ? (() => { const so = s.trades.reduce((a, t) => a + t.priceOut, 0), bi = s.trades.reduce((a, t) => a + (S.inPrice[t.in] ?? t.priceIn), 0) + (s.coach && s.coach.cost > 0 ? s.coach.cost : 0) - (s.coach && s.coach.cost < 0 ? -s.coach.cost : 0); return `<p class="asbudget">${esc(L.budgetLine.replace('{b}', f1(bankOf())).replace('{s}', f1(so)).replace('{i}', f1(bi)).replace('{a}', f1(s.bankAfter)))}</p>`; })() : ''}${unc}
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
// ---------------------------------------------------------------- «ποιον να βάλω στη θέση του;»
const rowPrice = c => { const r = S.rows.find(x => x.c === c); return r && r.price != null && r.price !== '' ? +r.price : +(P.get(c)?.price || 0); };
const inPriceOf = c => (S.inPrice[c] != null ? +S.inPrice[c] : S.result?.prices?.[c] != null ? +S.result.prices[c] : +(P.get(c)?.price || 0));
/** οι καλύτεροι της ίδιας θέσης που χωράνε στα credits (αξία αυτού που φεύγει + αδιάθετα), με όριο 6 ανά ομάδα */
function replacements(out, limit = 6) {
  const po = P.get(out); if (!po) return { budget: 0, list: [] };
  const roster = S.rows.map(r => r.c).filter(Boolean), budget = Math.round((rowPrice(out) + (bankOf() || 0)) * 10) / 10;
  const clubs = {}; for (const c of roster) if (c !== out) { const t = P.get(c)?.t; clubs[t] = (clubs[t] || 0) + 1; }
  const list = [...P.values()].filter(p => p.pos === po.pos && !roster.includes(p.c) && p.opp && p.status !== 'injured' && inPriceOf(p.c) <= budget + 1e-9 && (clubs[p.t] || 0) < CLASSIC_RULES.maxPerClub)
    .map(p => ({ p, dN: (p.pp || 0) - (po.pp || 0), d3: (p.p3 || 0) - (po.p3 || 0) }))
    .sort((a, b) => b.dN + 0.35 * b.d3 - (a.dN + 0.35 * a.d3)).slice(0, limit);
  return { budget, list };
}
function replHtml() {
  const roster = S.rows.map(r => r.c).filter(Boolean);
  // προεπιλογή: ο παίκτης που η αντικατάστασή του δίνει το μεγαλύτερο κέρδος
  const gainOf = c => { const x = replacements(c, 1).list[0]; return x ? x.dN + 0.35 * x.d3 : -Infinity; };
  if (!S.repl || !roster.includes(S.repl)) S.repl = roster.slice().sort((a, b) => gainOf(b) - gainOf(a))[0] || null;
  const chips = roster.map(c => `<button type="button" class="${c === S.repl ? 'on' : ''}" data-act="repl" data-c="${c}">${esc(POS1[P.get(c)?.pos] || '')} ${esc(surname(c))} <small>${f1(rowPrice(c))}</small></button>`).join('');
  const left = S.unlimited ? Infinity : S.trades;
  let body = '';
  if (S.repl) {
    const { budget, list } = replacements(S.repl), po = P.get(S.repl);
    body = `<p class="sub">${esc(L.replBudget.replaceAll('{p}', nm(S.repl)).replace('{v}', f1(rowPrice(S.repl))).replace('{b}', f1(bankOf() || 0)).replace('{t}', f1(budget)).replace('{e}', f1(po?.pp)))}</p>` +
      (list.length && list[0].dN + 0.35 * list[0].d3 <= 0 ? `<p class="fmwarn">${esc(L.replWorse.replace('{p}', nm(S.repl)))}</p>` : '') +
      (list.length ? `<ol class="asrepl">${list.map(({ p, dN, d3 }) => `<li><div><b>${esc(nm(p.c))}</b> <small>${tm(p.t)} · ${p.home ? 'VS' : '@'} ${esc(p.opp)}${p.status === 'doubtful' ? ` · ⚠ ${esc(L.status.doubtful || 'doubtful')}` : ''}</small></div>
<div class="asreplk"><span>${f1(inPriceOf(p.c))}${S.inPrice[p.c] == null ? '*' : ''} <small>CR</small></span><span>${f1(p.pp)} <small>${esc(L.estPts)}</small></span><span title="${esc(L.dNextTip)}">${sg(dN)} <small>${esc(L.replNext)}</small></span><span title="${esc(L.dHTip)}">${sg(d3)} <small>${esc(L.repl3)}</small></span>
<button type="button" data-act="apply-repl" data-c="${p.c}" ${left < 1 ? 'disabled' : ''}>${esc(L.replApply)}</button></div></li>`).join('')}</ol>` : `<p class="fmwarn">${esc(L.replNone)}</p>`);
  }
  return `<section class="asreplbox"><h3>${esc(L.replH)}</h3><p class="sub">${esc(L.replHelp)}</p><div class="astabs repl">${chips}</div>${body}
${left < 1 ? `<p class="fmwarn">${esc(L.replNoTrades)}</p>` : ''}<p class="sub">* ${esc(L.priceNote)}</p></section>`;
}
function applyRepl(inC) {
  const r = S.rows.find(x => x.c === S.repl); if (!r) return;
  S.applied.push({ out: S.repl, in: inC });
  Object.assign(r, { c: inC, status: 'sure', options: [], raw: '', price: S.inPrice[inC] ?? null, priceSrc: S.inPrice[inC] != null ? 'user' : null, captain: false, capHint: false, locked: true });
  if (!S.unlimited) S.trades = Math.max(0, S.trades - 1);
  S.msg = { k: 'ok', t: L.replDone.replace('{a}', nm(S.applied.at(-1).out)).replace('{b}', nm(inC)).replace('{n}', S.unlimited ? '∞' : S.trades).replace('{c}', f1(bankOf())) };
  S.repl = null; S.view = 0; analyze();
}
function step3() {
  const r = S.result;
  if (r.errors) return `<section class="assec"><ul class="aserr">${r.errors.map(e => `<li>${esc(errText(e))}</li>`).join('')}</ul><p><button type="button" data-act="back">← ${esc(L.back)}</button></p></section>`;
  const all = [...r.scenarios, r.keep], v = Math.min(S.view, all.length - 1), cur = all[v], k = v < r.scenarios.length ? v : -1;
  const tabs = all.map((s, i) => `<button type="button" class="${i === v ? 'on' : ''} ${s.key}" data-act="view" data-k="${i}" aria-pressed="${i === v}">${esc(L.scen[s.key])}${s.key !== 'keep' ? ` <small>${s.dNext > 0 ? '+' : ''}${f1(s.dNext)}</small>` : ''}</button>`).join('');
  return `<section class="assec"><h2>${esc(L.s3h)}</h2>
${r.fit ? `<p class="sub">* ${esc(L.calNote.replace('{n}', r.fit.n))}</p>` : ''}${r.recommendKeep ? `<p class="asok">✅ ${esc(L.recommendKeep)}</p>` : `<p class="sub">${esc(L.s3help.replace('{n}', r.scenarios.length))}</p>`}
<div class="astabs" role="tablist">${tabs}</div>
${courtHtml(cur)}
<div class="asscens one">${scenHtml(cur, k)}</div>
${replHtml()}
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
  if (a === 'coach') { S.coachPrice = null; S.coach = el.value || null; S.coachSt = el.value ? 'sure' : 'none'; }
  if (a === 'coachprice') { S.coachPrice = el.value === '' ? null : +el.value; }
  if (a === 'total') { S.total = el.value === '' ? null : +el.value; S.totalSrc = 'user'; }
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
  if (a === 'analyze') { S.view = 0; analyze(); return; }
  if (a === 'view') S.view = k;
  if (a === 'coach-implied') S.coachPrice = +b.dataset.v;
  if (a === 'repl') S.repl = b.dataset.c;
  if (a === 'apply-repl') { applyRepl(b.dataset.c); return; }
  if (a === 'save') { S.result.chosen = S.result.scenarios[k]; saveManager(); return; }
  render();
});
// σύρε-άφησε εικόνες
app.addEventListener('dragover', e => { if (S.step === 1) { e.preventDefault(); } });
app.addEventListener('drop', e => { if (S.step === 1 && e.dataTransfer?.files?.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });
// επικόλληση screenshot (Ctrl+V)
document.addEventListener('paste', e => { if (S.step !== 1) return; const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/')); if (fs.length) addFiles(fs); });
init();
