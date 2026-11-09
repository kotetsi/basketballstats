// BasketballStats PRO από άκρη σε άκρη στον browser (κινητό): /pro → /checkout → «Stripe» → /welcome-pro → /my-account.
// Ο πραγματικός Worker τρέχει τοπικά (D1 πάνω σε SQLite)· Stripe/Telegram/Brevo είναι ψεύτικοι (κανένα δίκτυο, καμία χρέωση).
//   PRO_LOCK=1 PRO_API=http://localhost:8787 node build.mjs --offline && node test/e2e/pro.e2e.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import worker from '../../workers/pro/src/index.js';
import { makeD1 } from '../pro/d1-shim.mjs';

const SITE = 'http://localhost:8200', API = 'http://localhost:8787';
const env = { DB: makeD1(new URL('../../workers/pro/schema.sql', import.meta.url).pathname), SITE_ORIGIN: SITE, STRIPE_SECRET_KEY: 'sk_test_e2e', STRIPE_WEBHOOK_SECRET: 'whsec_e2e', BREVO_API_KEY: 'brevo_e2e', TELEGRAM_BOT_TOKEN: '1:x', TELEGRAM_PRO_CHAT_ID: '-1001', ADMIN_EMAILS: 'owner@example.com', SEASON_END: '2027-06-01T00:00:00Z' };
const S = { sessions: {}, mails: [], n: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(typeof url === 'string' ? url : url.url);
  if (u.host === 'api.stripe.com') {
    const p = u.pathname.replace('/v1/', '');
    if (p === 'checkout/sessions' && init.method === 'POST') {
      const f = Object.fromEntries(new URLSearchParams(init.body)), id = 'cs_test_e2e' + (++S.n);
      // ό,τι θα έκανε ο πελάτης στη σελίδα της Stripe: πληρώνει και επιστρέφει στο success_url
      S.sessions[id] = { id, status: 'complete', mode: f.mode, payment_status: 'paid', amount_total: +f['line_items[0][price_data][unit_amount]'], currency: 'eur', customer: 'cus_e2e', customer_details: { email: 'e2e@example.com', name: 'E2E', address: { country: 'GR' } }, metadata: { plan: f['metadata[plan]'] } };
      return Response.json({ id, url: f.success_url.replace('{CHECKOUT_SESSION_ID}', id) });
    }
    if (p.startsWith('checkout/sessions/')) return Response.json(S.sessions[p.split('/')[2]]);
  }
  if (u.host === 'api.telegram.org') return Response.json({ ok: true, result: { invite_link: 'https://t.me/+e2einvite' } });
  if (u.host === 'api.brevo.com') { S.mails.push(JSON.parse(init.body)); return new Response('{}', { status: 201 }); }
  return realFetch(url, init);
};
const now = new Date().toISOString();
await env.DB.prepare("INSERT INTO picks (game_id, round, match_label, starts_at, player, market, odds, stake, analysis, published_at, created_at, updated_at) VALUES ('E-11-PAR-BAS', 11, 'Παρτιζάν - Μπασκόνια', '2026-11-11T19:45:00Z', 'Nikola Tanaskovic', 'Over 13.5 Πόντοι + Ριμπάουντ', 1.75, 1, 'ΚΡΥΦΗ_ΑΝΑΛΥΣΗ με **έντονα**', ?, ?, ?)").bind(now, now, now).run();
await env.DB.prepare("INSERT INTO analyses (game_id, body, published_at, created_at, updated_at) VALUES ('E-11-PAN-BAR', 'ΚΡΥΦΟ_ΜΑΤΣ η Μπαρτσελόνα χωρίς Πάντερ', ?, ?, ?)").bind(now, now, now).run();
const SECRETS = ['Tanaskovic', 'ΚΡΥΦΗ_ΑΝΑΛΥΣΗ', 'Over 13.5 Πόντοι', 'ΚΡΥΦΟ_ΜΑΤΣ', 'Πάντερ'];
const findPage = gid => { const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); const f = walk('dist/agonas').find(f => f.endsWith('index.html') && fs.readFileSync(f, 'utf8').includes(`data-gid="${gid}"`)); return '/' + path.relative('dist', path.dirname(f)) + '/'; };
const apiSrv = http.createServer(async (q, r) => {
  const chunks = []; for await (const c of q) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const res = await worker.fetch(new Request(API + q.url, { method: q.method, headers: q.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(q.method) ? undefined : body }), env);
  r.writeHead(res.status, Object.fromEntries(res.headers)); r.end(Buffer.from(await res.arrayBuffer()));
}).listen(8787);
const siteSrv = http.createServer((q, r) => { let p = path.join('dist', decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p += '/index.html'; if (!fs.existsSync(p)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', /\.m?js$/.test(p) ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.json') ? 'application/json' : 'text/html'); r.end(fs.readFileSync(p)); }).listen(8200);

const b = await chromium.launch(), errs = []; let ok = 0; const step = n => { ok++; console.log('  ✓', n); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); await pg.route(/google|incrowd/, r => r.abort());
const noScroll = async () => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
try {
  // FREE: κλειδωμένα κουτιά, και καμία απάντηση δικτύου δεν περιέχει το pick ή την ανάλυση
  const seen = []; const rec = async r => { try { seen.push(await r.text()); } catch { } };
  pg.on('response', rec);
  await pg.goto(SITE + '/tipsters/'); await pg.waitForSelector('.prolocked');
  assert.match(await pg.textContent('.prolock'), /Παρτιζάν - Μπασκόνια[\s\S]*Δες το με PRO/);
  const gpage = findPage('E-11-PAN-BAR');
  await pg.goto(SITE + gpage); await pg.waitForSelector('.prolock .prolocked');
  assert.match(await pg.textContent('.prolock'), /Ανάλυση Αγώνα/);
  seen.push(await pg.content());
  pg.off('response', rec);
  for (const x of SECRETS) assert.ok(!seen.some(t => t.includes(x)), `FREE είδε «${x}»`);
  step(`FREE: κλειδωμένο pick και Ανάλυση Αγώνα· τίποτα σε HTML/δίκτυο (${seen.length} απαντήσεις ελέγχθηκαν)`);

  await pg.goto(SITE + '/pro/');
  assert.match(await pg.textContent('h1'), /Σταμάτα να μαντεύεις\. Δες τι λένε οι αριθμοί\./);
  assert.equal(await pg.$$eval('.procard', x => x.filter(e => !e.hidden).length), 3);
  assert.match(await pg.textContent('.procards'), /14,90 €[\s\S]*49,00 €[\s\S]*59,00 €/);
  assert.match(await pg.textContent('.procards'), /ΦΠΑ 24%/);
  assert.match(await pg.textContent('.propage'), /Κανένα σημείο δεν είναι σίγουρο/);
  assert.match(await pg.textContent('footer'), /21\+\. Το περιεχόμενο είναι στατιστική ανάλυση/);
  await noScroll(); step('/pro: τίτλος, 3 πακέτα με ΦΠΑ, FAQ, 21+ (σελίδα + footer), κινητό');

  await pg.click('[data-plan="season_eb"] .probtn');
  await pg.waitForURL(/\/checkout\/\?plan=season_eb/);
  assert.equal(await pg.$eval('input[value="season_eb"]', i => i.checked), true);
  await pg.click('form.procheckout button'); await pg.waitForTimeout(300);
  assert.match(pg.url(), /\/checkout\//); assert.equal(await pg.$eval('input[name="terms"]', i => i.matches(':invalid')), true);
  assert.equal(S.n, 0, 'καμία συνεδρία πληρωμής'); step('/checkout: χωρίς αποδοχή όρων δεν προχωρά');
  await pg.check('input[name="terms"]'); await pg.check('input[name="waive"]');
  await noScroll();
  await Promise.all([pg.waitForURL(/\/welcome-pro\//), pg.click('form.procheckout button')]);
  step('/checkout → πληρωμή (Stripe) → επιστροφή');

  await pg.waitForSelector('.probox.ok', { timeout: 15000 });
  assert.match(await pg.textContent('.probox.ok'), /Είσαι PRO/);
  assert.equal(await pg.$eval('.probox.ok a.probtn', a => a.href), 'https://t.me/+e2einvite');
  assert.doesNotMatch(pg.url(), /cs=/, 'το id πληρωμής φεύγει από τη διεύθυνση');
  await noScroll(); step('/welcome-pro: PRO αμέσως + PRO Telegram link');
  assert.equal(S.mails.filter(m => m.subject === 'Καλώς ήρθες στο BasketballStats PRO').length, 1); step('email καλωσορίσματος (μία φορά)');

  await pg.goto(SITE + '/my-account/');
  await pg.waitForSelector('.probox h2');
  assert.match(await pg.textContent('.probox h2'), /PRO ενεργό/);
  assert.match(await pg.textContent('.proout .probox'), /Συνδρομή πρόσβασης σε ψηφιακό περιεχόμενο - BasketballStats PRO - Σεζόν 2026-27/);
  assert.match(await pg.textContent('.proout .probox'), /49,00 €/);
  assert.ok(await pg.$('.proout .probox a[href="https://t.me/+e2einvite"]'));
  await noScroll(); step('/my-account: κατάσταση, λήξη, Telegram, ιστορικό πληρωμών');

  await pg.click('[data-act="logout"]');
  await pg.waitForSelector('form.prologin');
  await pg.fill('form.prologin input', 'e2e@example.com'); await pg.click('form.prologin button');
  await pg.waitForSelector('.promsg');
  const link = /href="([^"]*#login=[^"]+)"/.exec(S.mails.at(-1).htmlContent)[1];
  await pg.goto(link);
  await pg.waitForSelector('.probox h2');
  assert.match(await pg.textContent('.probox h2'), /PRO ενεργό/);
  assert.doesNotMatch(pg.url(), /login=/); step('αποσύνδεση → σύνδεση με link στο email');
  await pg.goto(SITE + '/tipsters/'); await pg.waitForSelector('.propick');
  assert.match(await pg.textContent('.propick'), /Nikola Tanaskovic[\s\S]*Over 13\.5 Πόντοι \+ Ριμπάουντ[\s\S]*@1\.75[\s\S]*1 μονάδα[\s\S]*ΚΡΥΦΗ_ΑΝΑΛΥΣΗ/);
  assert.equal(await pg.$eval('.propicka b', b => b.textContent), 'έντονα');
  assert.match(await pg.textContent('.propick'), /21\+\. Το περιεχόμενο είναι στατιστική ανάλυση/);
  await pg.goto(SITE + findPage('E-11-PAN-BAR')); await pg.waitForSelector('.proanalysis');
  assert.match(await pg.textContent('.proanalysis'), /ΚΡΥΦΟ_ΜΑΤΣ/);
  await noScroll(); step('PRO: πλήρες pick (παίκτης, αγορά, απόδοση, stake, ανάλυση, 21+) και Ανάλυση Αγώνα');
  await pg.evaluate(() => localStorage.clear()); await pg.goto('about:blank'); await pg.goto(link);
  await pg.waitForSelector('.promsg.err');
  assert.match(await pg.textContent('.proout'), /έληξε ή χρησιμοποιήθηκε/); step('το link σύνδεσης δεν ξαναχρησιμοποιείται');
} finally {
  await b.close(); apiSrv.close(); siteSrv.close(); globalThis.fetch = realFetch;
}
assert.deepEqual(errs, []); step('χωρίς σφάλματα JavaScript');
console.log(`[pro] ${ok} έλεγχοι οκ`);
