// Έλεγχος της σελίδας Σύγκρισης στον browser (μετά το build): επιλογή/αφαίρεση, όριο 4, χωρίς διπλά, φίλτρα, URL,
// καθαρισμός, κενή κατάσταση, σφάλμα δεδομένων, σύνδεσμος κοινοποίησης σε μόνιμη σελίδα, κινητό χωρίς οριζόντια κύλιση.
//   node build.mjs && node test/e2e/compare-ui.e2e.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const srv = http.createServer((q, r) => { let p = path.join('dist', decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p += '/index.html'; if (!fs.existsSync(p)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', /\.m?js$/.test(p) ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.json') ? 'application/json' : 'text/html'); r.end(fs.readFileSync(p)); }).listen(8197);
const U = 'http://localhost:8197';
const b = await chromium.launch();
const ctx = await b.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const errs = [];
const open = async (url, vw = 1280) => { const pg = await ctx.newPage(); await pg.setViewportSize({ width: vw, height: 900 }); pg.on('pageerror', e => errs.push(e.message)); await pg.route(/google|incrowd/, r => r.abort()); await pg.goto(U + url); await pg.waitForSelector('.cmpbar', { timeout: 15000 }); return pg; };
let ok = 0; const step = (n) => { ok++; console.log('  ✓', n); };

// ομάδες
{
  const pg = await open('/sygkrisi/omades/');
  assert.match(await pg.textContent('.cmpout'), /2 έως 4/); step('κενή κατάσταση');
  const opts = await pg.$$eval('.cmpadd option', os => os.map(o => o.value).filter(Boolean));
  for (const v of opts.slice(0, 4)) await pg.selectOption('.cmpadd', v);
  assert.equal(await pg.$$eval('.chips .chip', x => x.length), 4); step('προσθήκη 4');
  assert.equal(await pg.$eval('.cmpadd', s => s.disabled), true); step('όριο 4');
  const left = await pg.$$eval('.cmpadd option', os => os.map(o => o.value).filter(Boolean));
  assert.ok(opts.slice(0, 4).every(v => !left.includes(v))); step('χωρίς διπλά');
  assert.match(new URL(pg.url()).search, /ids=/); step('URL με επιλογές');
  await pg.click('.chips [data-rm]');
  assert.equal(await pg.$$eval('.chips .chip', x => x.length), 3); step('αφαίρεση');
  await pg.selectOption('[data-f="split"]', 'home');
  assert.match(pg.url(), /split=home/); step('φίλτρο εντός');
  assert.ok(await pg.$('.cmptbl td.best')); step('επισήμανση καλύτερου');
  await pg.click('[data-mode="radar"]'); assert.ok(await pg.$('.cmpradar') || await pg.$('.cmpempty')); step('radar ή εξήγηση');
  await pg.click('[data-x="clear"]');
  assert.equal(await pg.$$eval('.chips .chip', x => x.length), 0); step('καθαρισμός');
  await pg.close();
}
// σύνδεσμος κοινοποίησης → μόνιμη σελίδα ζευγαριού (κανονική σειρά)
{
  const pg = await open('/sygkrisi/omades/?ids=PAN,OLY');
  await pg.click('[data-x="copy"]');
  const u = await pg.evaluate(() => navigator.clipboard.readText());
  assert.match(u, /\/sygkrisi\/omades\/olympiakos-vs-panathinaikos\/$/); step('copy link: ' + u.replace(U, ''));
  const r = await fetch(u.replace(/^https?:\/\/[^/]+/, U)); assert.equal(r.status, 200); step('η μόνιμη σελίδα υπάρχει');
  const rev = await fetch(U + '/sygkrisi/omades/panathinaikos-vs-olympiakos/'); assert.equal(rev.status, 404); step('αντίστροφη σειρά δεν παράγεται');
  await pg.close();
}
// άκυρες παράμετροι
{
  const pg = await open('/sygkrisi/omades/?ids=XXX,<b>,OLY,OLY&split=foo');
  assert.equal(await pg.$$eval('.chips .chip', x => x.length), 1); step('validation ids');
  assert.equal(await pg.$eval('[data-f="split"]', s => s.value), 'all'); step('validation split');
  await pg.close();
}
// σφάλμα δεδομένων
{
  const c2 = await b.newContext(); const pg = await c2.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.route(/google|incrowd/, r => r.abort()); await pg.route(/api\/compare\/teams/, r => r.fulfill({ status: 500, body: '' }));
  await pg.goto(U + '/sygkrisi/omades/'); await pg.waitForSelector('.cmperr', { timeout: 15000 });
  assert.ok(await pg.$('.cmperr [role="alert"], .cmperr')); step('κατάσταση σφάλματος');
  await pg.close();
}
// μόνιμη σελίδα: SEO βασικά και κινητό
{
  const pg = await open('/sygkrisi/omades/olympiakos-vs-panathinaikos/', 390);
  assert.equal(await pg.$eval('link[rel=canonical]', e => e.href), 'https://basketballstats.eu/sygkrisi/omades/olympiakos-vs-panathinaikos/');
  assert.ok((await pg.$eval('meta[name=description]', e => e.content)).length > 50);
  assert.ok(await pg.$('meta[property="og:title"]'));
  assert.equal(await pg.$$eval('h1', x => x.length), 1); step('canonical, description, OG, ένα H1');
  assert.ok(await pg.$('.cmpssr td.best')); step('server-rendered πίνακας');
  assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); step('κινητό χωρίς οριζόντια κύλιση σελίδας');
  await pg.close();
}
// παίκτες
{
  const pg = await open('/sygkrisi/');
  const n0 = await pg.$$eval('.chips .chip', x => x.length);
  await pg.click('[data-x="clear"]');
  assert.equal(await pg.$$eval('.chips .chip', x => x.length), 0); step(`παίκτες: καθαρισμός (${n0} → 0)`);
  await pg.close();
}
await b.close(); srv.close();
assert.deepEqual(errs, []); step('χωρίς σφάλματα JavaScript');
console.log(`[compare-ui] ${ok} έλεγχοι οκ`);
