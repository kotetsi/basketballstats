// End-to-end με πραγματικό Tesseract.js πάνω σε πραγματικό screenshot της επίσημης εφαρμογής (test/fixtures/assistant-real-app.png),
// σε δύο αναλύσεις (1080 πλάτος και 1179 όπως iPhone). Τρέχει στο GitHub Actions. Δεν δημοσιεύει τίποτα.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const srv = http.createServer((q, r) => { let p = path.join('dist', decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p += '/index.html'; if (!fs.existsSync(p)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', /\.m?js$/.test(p) ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.json') ? 'application/json' : p.endsWith('.png') ? 'image/png' : 'text/html'); r.end(fs.readFileSync(p)); }).listen(8198);
const b = await chromium.launch();
const truth0 = ['Diarra', 'Vezenkov', 'Brizuela', 'Madar', 'Feliz', 'Tubelis', 'Mitoglou', 'Hayes', 'Strazel', 'Ndiaye'];
// 11η αγωνιστική: πράσινο «Trades Open» στην κεφαλίδα, Powell και Llull εκτός βάσης (δεν έχουν παίξει φέτος), προπονητής Παρτιζάν 6.2
const truth11 = ['Diarra', 'Vezenkov', 'Brizuela', 'Madar', 'Feliz', 'Tubelis', 'Malcolm', 'Powell', 'ul', 'Ndiaye'];
let fail = false;
for (const [width, tall, file] of [[1080, 0], [1179, 0], [1290, 0], [1179, 2556], [1290, 2796], [1600, 900, 'assistant-real-desktop.png'], [1600, 900, 'assistant-real-desktop-r11.png']]) {
  // κλιμάκωση της εικόνας στον browser (όπως screenshot άλλου κινητού)
  const tool = await b.newPage();
  const src = 'data:image/png;base64,' + fs.readFileSync('test/fixtures/' + (file || 'assistant-real-app.png')).toString('base64');
  const out = await tool.evaluate(async ({ src, width, tall }) => { const im = new Image(); im.src = src; await im.decode(); const k = width / im.width, c = document.createElement('canvas'), ih = Math.round(im.height * k); c.width = width; c.height = tall || ih; const g = c.getContext('2d'); g.fillStyle = '#f0a040'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, Math.round((c.height - ih) / 2), width, ih); return c.toDataURL('image/png'); }, { src, width, tall });
  fs.writeFileSync(`/tmp/real-${width}-${tall}.png`, Buffer.from(out.split(',')[1], 'base64'));
  await tool.close();
  const pg = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__asDebug = []; });
  await pg.goto('http://localhost:8198/fantasy/assistant/');
  await pg.waitForSelector('input[data-act="files"]', { state: 'attached' });
  await pg.setInputFiles('input[data-act="files"]', `/tmp/real-${width}-${tall}.png`);
  const t0 = Date.now();
  await pg.click('[data-act="process"]');
  await pg.waitForSelector('.astbl', { timeout: 240000 });
  const rows = await pg.$$eval('.astbl tbody tr', trs => trs.map(tr => ({ name: tr.querySelector('input.asname')?.value || tr.textContent.slice(0, 60), price: tr.querySelector('[data-act="price"]')?.value, slot: tr.querySelector('[data-act="slot"]')?.value })));
  const coach = await pg.$eval('[data-act="coach"]', e => e.value);
  const total = await pg.$eval('[data-act="total"]', e => e.value).catch(() => '');
  const dbg = await pg.evaluate(() => window.__asDebug);
  const truth = file && file.includes('r11') ? truth11 : truth0;
  const hit = truth.filter(t => rows.some(r => r.name.includes(t))).length;
  console.log(`[e2e ${width}x${tall || 'auto'}] ${Math.round((Date.now() - t0) / 1000)}s · σωστοί ${hit}/10 · προπονητής ${coach} · σύνολο ${total} · σφάλματα ${errs.length}`);
  for (const r of rows) console.log('   ', r.name, '|', r.price, '|', r.slot);
  console.log('   debug', JSON.stringify(dbg).slice(0, 4000));
  if (hit < 10 || (!file && coach !== 'ASV') || (file && file.includes('r11') && coach !== 'PAR') || total !== '106.2' || errs.length) fail = true;
  await pg.close();
}
await b.close(); srv.close();
if (fail) { console.error('[e2e] αποτυχία'); process.exit(1); }
