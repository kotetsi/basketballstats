// Σελίδα EuroLeague Odds & Value Bets (μετά το build): φίλτρα, «Μη διαθέσιμη απόδοση», μόνο ελληνικά .gr, κινητό χωρίς κύλιση.
//   node build.mjs && node test/e2e/odds-value.e2e.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const srv = http.createServer((q, r) => { let p = path.join('dist', decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p += '/index.html'; if (!fs.existsSync(p)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', /\.m?js$/.test(p) ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.json') ? 'application/json' : 'text/html'); r.end(fs.readFileSync(p)); }).listen(8199);
const b = await chromium.launch(), errs = []; let ok = 0; const step = n => { ok++; console.log('  ✓', n); };
const open = async (vw = 1280) => { const pg = await b.newPage({ viewport: { width: vw, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); await pg.route(/google|incrowd/, r => r.abort()); await pg.goto('http://localhost:8199/apodoseis/value/'); return pg; };
const vis = (pg, sel) => pg.$$eval(sel, xs => xs.filter(x => x.offsetParent !== null).length);
{
  const pg = await open();
  assert.match(await pg.textContent('h1'), /Odds & Value Bets/); step('σελίδα');
  assert.match(await pg.textContent('.oddspage'), /δεν είναι live|Δεν υπάρχουν ακόμη αποδόσεις/); step('όχι live');
  assert.ok(await pg.$('.rgbox .age21')); step('21+ / υπεύθυνο παιχνίδι');
  const hrefs = await pg.$$eval('.vbt a[href]', as => as.map(a => a.href));
  assert.ok(hrefs.every(h => /^https:\/\/www\.[a-z0-9]+\.gr\/$/.test(h))); step('σύνδεσμοι μόνο σε επίσημα .gr (' + new Set(hrefs).size + ')');
  assert.ok(!(await pg.$$eval('.vbt a', as => as.map(a => a.rel))).some(r => /sponsored/.test(r))); step('χωρίς affiliate');
  const games = await vis(pg, '.vbgame');
  if (await pg.$('.vbgame')) {
    step(`${games} αγώνες`);
    const brand = await pg.$eval('[data-vf="b"] option:nth-child(2)', o => o.value);
    await pg.selectOption('[data-vf="b"]', brand);
    assert.equal(await pg.$$eval(`.vbt tr[data-b]:not([data-b="${brand}"])`, rs => rs.filter(r => r.offsetParent !== null).length), 0); step('φίλτρο εταιρείας');
    await pg.selectOption('[data-vf="b"]', '');
    await pg.selectOption('[data-vf="m"]', 'spread');
    assert.equal(await pg.$$eval('.vbm:not([data-m="spread"])', ms => ms.filter(m => m.offsetParent !== null).length), 0); step('φίλτρο αγοράς');
    await pg.selectOption('[data-vf="m"]', '');
    const g = await pg.$eval('[data-vf="g"] option:nth-child(2)', o => o.value);
    await pg.selectOption('[data-vf="g"]', g);
    assert.equal(await vis(pg, '.vbgame'), 1); step('φίλτρο αγώνα');
    await pg.selectOption('[data-vf="g"]', '');
    await pg.fill('[data-vf="ev"]', '1000');
    assert.equal(await vis(pg, '.vbgame'), 0); assert.equal(await pg.$eval('.vbnone', e => e.hidden), false); step('φίλτρο EV + μήνυμα «κανένας αγώνας»');
    await pg.fill('[data-vf="ev"]', '');
    assert.equal(await vis(pg, '.vbgame'), games); step('επαναφορά');
  }
  await pg.close();
}
{
  const pg = await open(390);
  assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); step('κινητό χωρίς οριζόντια κύλιση');
  assert.equal(await pg.evaluate(() => [...document.querySelectorAll('.vbt')].some(t => t.scrollWidth > t.clientWidth + 1)), false); step('πίνακες χωράνε στο κινητό');
  await pg.close();
}
await b.close(); srv.close();
assert.deepEqual(errs, []); step('χωρίς σφάλματα JavaScript');
console.log(`[odds-value] ${ok} έλεγχοι οκ`);
