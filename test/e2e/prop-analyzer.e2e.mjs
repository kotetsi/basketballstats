// Prop Analyzer (μετά το build): φορτώνει, αλλάζει παίκτη/στατιστικό/γραμμή, φίλτρα, πίνακας, γραμμές bookmaker, κινητό.
//   node build.mjs && node test/e2e/prop-analyzer.e2e.mjs [φάκελος για screenshots]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const SHOTS = process.argv[2] || null;
// δοκιμαστικές γραμμές bookmaker (μόνο για το test): μπαίνουν στο #pactx της σελίδας
let fake = null;
const srv = http.createServer((q, r) => {
  let p = path.join('dist', decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p += '/index.html';
  if (!fs.existsSync(p)) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', /\.m?js$/.test(p) ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.json') ? 'application/json' : 'text/html');
  let body = fs.readFileSync(p);
  if (fake && p.endsWith('index.html')) body = String(body).replace(/(<script type="application\/json" id="pactx">)([\s\S]*?)(<\/script>)/, (m, a, j, c) => { const o = JSON.parse(j); o.lines = fake; return a + JSON.stringify(o) + c; });
  r.end(body);
}).listen(8198);
const b = await chromium.launch(), errs = []; let ok = 0; const step = n => { ok++; console.log('  ✓', n); };
const open = async (url, vw = 1280) => { const pg = await b.newPage({ viewport: { width: vw, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); await pg.route(/google|incrowd/, r => r.abort()); await pg.goto('http://localhost:8198' + url); await pg.waitForSelector('.pahead'); return pg; };
const D = JSON.parse(fs.readFileSync('dist/assets/props/data.json', 'utf8'));
try {
  const pg = await open('/apodoseis/prop-analyzer/');
  assert.match(await pg.textContent('h1'), /Prop Analyzer/); step('σελίδα');
  assert.ok(await pg.$('.rgbox .age21')); step('21+');
  assert.equal(await pg.$$eval('.pahits .am', x => x.length) >= 6, true); step('κάρτες hit rate');
  assert.ok(await pg.$('.pasvg rect')); step('γράφημα');
  const n0 = await pg.$$eval('.paboardt tbody tr', x => x.length); assert.ok(n0 > 0); step(`πίνακας (${n0} γραμμές)`);
  if (SHOTS) await pg.screenshot({ path: SHOTS + '/desktop.png', fullPage: true });
  // αναζήτηση
  const P = D.players.find(p => p.gr && Object.keys(p.pj).length);
  await pg.fill('#paQ', P.gr.slice(0, 5)); await pg.waitForSelector('#paSugg button');
  await pg.click(`#paSugg button[data-c="${P.c}"]`);
  assert.match(await pg.textContent('.pahead h2'), new RegExp(P.gr)); step('αναζήτηση με ελληνικό όνομα');
  assert.match(await pg.evaluate(() => location.hash), new RegExp(`p=${P.s}`)); step('σύνδεσμος (hash)');
  // στατιστικό και γραμμή
  await pg.click('.pastat button[data-s="reb"]'); assert.match(await pg.textContent('.pastat .on'), /Ριμπάουντ/); step('στατιστικό');
  const l0 = +(await pg.inputValue('#paL')); await pg.click('.paline button[data-d="1"]'); assert.equal(+(await pg.inputValue('#paL')), l0 + 1); step('γραμμή +1');
  assert.match(await pg.textContent('.pasrc'), /δική σου/); step('πηγή: δική σου γραμμή');
  // φίλτρα
  await pg.click('.pafil .seg[data-f="range"] button[data-v="5"]'); assert.ok(await pg.$$eval('.pasvg rect', x => x.length) <= 5); step('L5');
  await pg.click('.pafil .seg[data-f="venue"] button[data-v="home"]'); step('έδρα');
  const mate = await pg.$eval('#paMate option:nth-child(2)', o => o.value); await pg.selectOption('#paMate', mate); step('χωρίς συμπαίκτη');
  // στατιστικό χωρίς μοντέλο
  await pg.click('.pastat button[data-s="pir"]'); assert.match(await pg.textContent('.pacard'), /Χωρίς μοντέλο/); step('PIR χωρίς μοντέλο');
  // πίνακας: φίλτρο και κλικ
  await pg.selectOption('[data-b="stat"]', 'ast'); assert.equal(await pg.$$eval('.paboardt tbody tr', rs => rs.every(r => r.dataset.s === 'ast')), true); step('φίλτρο πίνακα');
  await pg.click('.paboardt th[data-k="L10"]'); step('ταξινόμηση');
  const tr = await pg.$eval('.paboardt tbody tr', r => ({ c: r.dataset.c, s: r.dataset.s, l: r.dataset.l }));
  await pg.click('.paboardt tbody tr'); assert.equal(await pg.inputValue('#paL'), tr.l); assert.match(await pg.textContent('.pastat .on'), /Ασίστ/); step('κλικ στον πίνακα → analyzer');
  await pg.close();
  // απευθείας σύνδεσμος, αγγλικά
  const Q = D.players.find(p => p.pj.pts);
  const pe = await open(`/en/odds/prop-analyzer/#p=${Q.s}&s=pts&l=9.5`);
  assert.match(await pe.textContent('.pahead h2'), new RegExp(Q.n)); assert.equal(await pe.inputValue('#paL'), '9.5'); assert.match(await pe.textContent('.pacard'), /Projection/); step('EN + σύνδεσμος');
  await pe.close();
  // γραμμές bookmaker (δοκιμαστικές)
  fake = { [`${Q.c}|pts`]: [{ l: 11.5, gid: D.next[Q.t].gid, o: [1.9, 'Stoiximan', [['Stoiximan', 1.9], ['Novibet', 1.85]]], u: [1.95, 'Novibet', [['Novibet', 1.95]]] }, { l: 13.5, gid: D.next[Q.t].gid, o: [2.4, 'Novibet', [['Novibet', 2.4]]], u: [1.55, 'Stoiximan', [['Stoiximan', 1.55]]] }] };
  const pb = await open(`/apodoseis/prop-analyzer/#p=${Q.s}&s=pts`);
  assert.equal(await pb.inputValue('#paL'), '11.5'); assert.match(await pb.textContent('.pasrc'), /Stoiximan/); step('κύρια γραμμή bookmaker');
  assert.equal(await pb.$$eval('.palines tbody tr', x => x.length), 2); step('πίνακας γραμμών');
  await pb.click('.palines .pause[data-l="13.5"]'); assert.equal(await pb.inputValue('#paL'), '13.5'); step('χρήση άλλης γραμμής');
  await pb.selectOption('[data-b="src"]', 'book'); assert.equal(await pb.$$eval('.paboardt tbody tr', x => x.length), 1); step('πίνακας: μόνο bookmakers');
  if (SHOTS) await pb.screenshot({ path: SHOTS + '/book.png', fullPage: true });
  await pb.close(); fake = null;
  // κινητό: χωρίς οριζόντια κύλιση της σελίδας
  const pm = await open('/apodoseis/prop-analyzer/', 390);
  const ov = await pm.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(ov <= 1, 'overflow ' + ov); step('κινητό χωρίς κύλιση');
  if (SHOTS) await pm.screenshot({ path: SHOTS + '/mobile.png', fullPage: true });
  await pm.close();
  assert.deepEqual(errs, []); step('χωρίς σφάλματα JS');
} finally { await b.close(); srv.close(); }
console.log(`OK ${ok} έλεγχοι`);
