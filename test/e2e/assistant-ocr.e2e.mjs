// End-to-end: πραγματικό Tesseract.js στον browser πάνω σε συνθετικό screenshot σύνθεσης.
// Τρέχει στο GitHub Actions (χρειάζεται internet για το Tesseract.js). Δεν δημοσιεύει τίποτα.
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium && node build.mjs --offline && node test/e2e/assistant-ocr.e2e.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const d = JSON.parse(fs.readFileSync('data/fantasy/latest.json', 'utf8'));
const P = d.players.filter(p => p.opp);
const pick = (pos, n, s) => P.filter(p => p.pos === pos).sort((a, b) => b.pp - a.pp).slice(s, s + n);
const ro = [...pick('Guard', 4, 3), ...pick('Forward', 4, 5), ...pick('Center', 2, 2)];
const short = p => { const [L, F] = p.n.split(',').map(x => x.trim()); return (F ? F[0] + '. ' : '') + L.charAt(0) + L.slice(1).toLowerCase(); };
const card = p => `<div class="card"><div class="j">${p.t}</div><div class="nm">${short(p)}</div><div class="pr">${p.price.toFixed(1)} cr</div></div>`;
const html = `<html><body style="margin:0;background:linear-gradient(#1b5e20,#2e7d32);font-family:Arial;color:#fff;width:390px"><style>.row{display:flex;justify-content:space-around;margin:14px 0}.card{width:110px;text-align:center}.j{background:#ff9800;border-radius:8px;height:40px;line-height:40px;font-weight:bold;color:#000}.nm{font-size:13px;margin-top:4px;background:#000a;padding:2px}.pr{font-size:12px;color:#ffeb3b}</style>
<div style="padding:10px;background:#0b2a6f">My Team · Credits 3.4</div><div class="row">${ro.slice(0, 2).map(card).join('')}</div><div class="row">${ro.slice(4, 6).map(card).join('')}</div><div class="row">${card(ro[8])}</div>
<div style="padding:6px">BENCH</div><div class="row">${[ro[2], ro[6], ro[9]].map(card).join('')}</div><div class="row">${[ro[3], ro[7]].map(card).join('')}</div><div style="padding:8px">Head Coach · Panathinaikos</div></body></html>`;

const srv = http.createServer((q, r) => { let p = path.join('dist', decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p += '/index.html'; if (!fs.existsSync(p)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', /\.m?js$/.test(p) ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.json') ? 'application/json' : 'text/html'); r.end(fs.readFileSync(p)); }).listen(8199);
const b = await chromium.launch();
const shot = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await shot.setContent(html); await shot.screenshot({ path: '/tmp/team.png', fullPage: true });
const pg = await b.newPage({ viewport: { width: 390, height: 900 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('http://localhost:8199/fantasy/assistant/');
await pg.waitForSelector('input[data-act="files"]', { state: 'attached' });
await pg.setInputFiles('input[data-act="files"]', '/tmp/team.png');
const t0 = Date.now();
await pg.click('[data-act="process"]');
await pg.waitForSelector('.astbl', { timeout: 180000 });
const names = await pg.$$eval('input.asname', els => els.map(e => e.value.split(' · ')[0]));
const truth = ro.map(p => p.dn);
const hit = names.filter(n => truth.includes(n)).length, wrong = names.filter(n => n && !truth.includes(n));
const amb = await pg.$$eval('tr.amb', x => x.length);
console.log(`[e2e] OCR σε ${Math.round((Date.now() - t0) / 1000)}s · σωστοί ${hit}/10 · αμφίβολοι ${amb} · λάθος ${wrong.length} ${wrong.join(', ')} · bank ${await pg.$eval('[data-act="bank"]', e => e.value)} · σφάλματα ${errs.length}`);
await b.close(); srv.close();
if (wrong.length || hit + amb < 9 || errs.length) { console.error('[e2e] αποτυχία', errs); process.exit(1); }
