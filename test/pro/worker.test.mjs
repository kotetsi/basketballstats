// BasketballStats PRO (Φάση 1, Βήμα 1): ρόλοι, σύνδεση με email, Stripe Checkout, webhooks, email καλωσορίσματος.
// Ο Worker τρέχει μέσα στο Node με D1 πάνω σε SQLite· Stripe/Telegram/Brevo είναι ψεύτικοι servers (κανένα δίκτυο).
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { fulfillCheckout } from '../../workers/pro/src/index.js';
import { roleOf, vatSplit, invoiceDescription, verifyStripeSignature, signStripe, normEmail, plans, planAvailable } from '../../workers/pro/src/lib.js';
import { makeD1 } from './d1-shim.mjs';

const SCHEMA = new URL('../../workers/pro/schema.sql', import.meta.url).pathname;
const ORIGIN = 'https://basketballstats.eu', WHSEC = 'whsec_test_123';
const DAY = 864e5;

function harness(extra = {}) {
  const env = { DB: makeD1(SCHEMA), SITE_ORIGIN: ORIGIN, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: WHSEC, BREVO_API_KEY: 'brevo_test', TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_PRO_CHAT_ID: '-100777', ADMIN_EMAILS: 'owner@example.com', SEASON_END: new Date(Date.now() + 200 * DAY).toISOString(), ...extra };
  const S = { sessions: {}, subs: {}, created: [], mails: [], invites: 0, portal: 0 };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), body = init.body;
    if (u.host === 'api.stripe.com') {
      assert.equal(init.headers.authorization, 'Bearer sk_test_x');
      const p = u.pathname.replace('/v1/', '');
      if (p === 'checkout/sessions' && init.method === 'POST') { const f = Object.fromEntries(new URLSearchParams(body)); S.created.push(f); return Response.json({ id: 'cs_test_new', url: 'https://checkout.stripe.com/c/pay/cs_test_new' }); }
      if (p.startsWith('checkout/sessions/')) { const cs = S.sessions[p.split('/')[2]]; return cs ? Response.json(cs) : Response.json({ error: { message: 'no' } }, { status: 404 }); }
      if (p.startsWith('subscriptions/')) return Response.json(S.subs[p.split('/')[1]]);
      if (p === 'billing_portal/sessions') { S.portal++; return Response.json({ url: 'https://billing.stripe.com/p/session/x' }); }
    }
    if (u.host === 'api.telegram.org') { S.invites++; const j = JSON.parse(body); assert.equal(j.member_limit, 1); assert.ok(j.expire_date - Date.now() / 1000 <= 24 * 3600 + 5); return Response.json({ ok: true, result: { invite_link: `https://t.me/+inv${S.invites}` } }); }
    if (u.host === 'api.brevo.com') { S.mails.push(JSON.parse(body)); return new Response('{}', { status: 201 }); }
    throw new Error('unexpected fetch ' + url);
  };
  const call = (method, path, { body, token, origin = ORIGIN, headers = {} } = {}) => worker.fetch(new Request('https://pro.example.workers.dev' + path, { method, headers: { origin, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env);
  const hook = async ev => { const b = JSON.stringify(ev); return worker.fetch(new Request('https://pro.example.workers.dev/v1/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': await signStripe(b, WHSEC) }, body: b }), env); };
  const restore = () => { globalThis.fetch = realFetch; };
  return { env, S, call, hook, restore };
}
const lastLink = S => /#login=([A-Za-z0-9_-]+)/.exec(S.mails.at(-1).htmlContent)[1];
async function login(H, email) {
  await H.call('POST', '/v1/auth/request', { body: { email } });
  const r = await H.call('POST', '/v1/auth/verify', { body: { token: lastLink(H.S) } });
  return (await r.json()).session;
}
const seasonSession = (id, email, plan = 'season_eb', cents = 4900) => ({ id, object: 'checkout.session', status: 'complete', mode: 'payment', payment_status: 'paid', amount_total: cents, currency: 'eur', customer: 'cus_' + id, customer_details: { email, name: 'Test User', address: { country: 'GR' }, tax_ids: [] }, metadata: { plan } });

test('πακέτα, ΦΠΑ και περιγραφή παραστατικού', () => {
  const P = plans({});
  assert.deepEqual([P.monthly.cents, P.season_eb.cents, P.season.cents], [1490, 4900, 5900]);
  assert.deepEqual(vatSplit(1490), { gross: 1490, net: 1202, vat: 288 });
  assert.deepEqual(vatSplit(5900), { gross: 5900, net: 4758, vat: 1142 });
  assert.equal(invoiceDescription('Σεζόν 2026-27'), 'Συνδρομή πρόσβασης σε ψηφιακό περιεχόμενο - BasketballStats PRO - Σεζόν 2026-27');
  assert.equal(planAvailable({ until: '2026-01-01T00:00:00Z' }, Date.parse('2026-11-09')), false);
  assert.equal(planAvailable(P.season_eb), true);
});

test('ρόλοι: FREE, PRO, λήξη → PRO_EXPIRED, ADMIN, past_due μέχρι το τέλος περιόδου', () => {
  const now = Date.parse('2026-11-09T12:00:00Z'), u = { id: 1, email: 'a@b.gr' };
  const s = (status, days) => ({ status, current_period_end: new Date(now + days * DAY).toISOString(), plan: 'monthly' });
  assert.equal(roleOf(null).role, 'FREE');
  assert.equal(roleOf(u, [], { now }).role, 'FREE');
  assert.equal(roleOf(u, [s('active', 10)], { now }).role, 'PRO');
  assert.equal(roleOf(u, [s('active', -1)], { now }).role, 'PRO_EXPIRED');
  assert.equal(roleOf(u, [s('canceled', 10)], { now }).role, 'PRO_EXPIRED');
  assert.equal(roleOf(u, [s('past_due', 2)], { now }).pro, true);
  assert.equal(roleOf({ ...u, email: 'Owner@Example.com' }, [], { admins: 'owner@example.com', now }).role, 'ADMIN');
});

test('υπογραφή webhook Stripe: σωστή, λάθος secret, αλλοιωμένο σώμα, παλιό timestamp', async () => {
  const b = '{"id":"evt_1"}', h = await signStripe(b, WHSEC);
  assert.equal(await verifyStripeSignature(b, h, WHSEC), true);
  assert.equal(await verifyStripeSignature(b, h, 'whsec_other'), false);
  assert.equal(await verifyStripeSignature(b + ' ', h, WHSEC), false);
  assert.equal(await verifyStripeSignature(b, await signStripe(b, WHSEC, Math.floor(Date.now() / 1000) - 3600), WHSEC), false);
  assert.equal(await verifyStripeSignature(b, null, WHSEC), false);
  assert.equal(normEmail(' A@B.GR '), 'a@b.gr'); assert.equal(normEmail('x@y'), null); assert.equal(normEmail('<a>@b.gr'), null);
});

test('API μόνο από το site (CORS) και /me μόνο με σύνδεση', async () => {
  const H = harness();
  try {
    assert.equal((await H.call('GET', '/v1/plans', { origin: 'https://evil.example' })).status, 403);
    assert.equal((await H.call('GET', '/v1/me')).status, 401);
    assert.equal((await H.call('GET', '/v1/me', { token: 'x'.repeat(43) })).status, 401);
    const r = await H.call('OPTIONS', '/v1/me'); assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  } finally { H.restore(); }
});

test('σύνδεση με link: μία φορά, νέος χρήστης = FREE, χωρίς Telegram', async () => {
  const H = harness();
  try {
    await H.call('POST', '/v1/auth/request', { body: { email: 'Fan@Example.com' } });
    assert.equal(H.S.mails.at(-1).to[0].email, 'fan@example.com');
    const tok = lastLink(H.S);
    assert.match(H.S.mails.at(-1).htmlContent, /https:\/\/basketballstats\.eu\/my-account\/#login=/);
    const v = await H.call('POST', '/v1/auth/verify', { body: { token: tok } }); assert.equal(v.status, 200);
    const sess = (await v.json()).session;
    assert.equal((await H.call('POST', '/v1/auth/verify', { body: { token: tok } })).status, 400, 'το link δεν ξαναχρησιμοποιείται');
    const me = await (await H.call('GET', '/v1/me', { token: sess })).json();
    assert.equal(me.role, 'FREE'); assert.equal(me.pro, false); assert.equal(me.telegram, null);
    // ίδια απάντηση για άγνωστο/γνωστό email, όριο 3 email ανά 15′
    for (let i = 0; i < 4; i++) assert.deepEqual(await (await H.call('POST', '/v1/auth/request', { body: { email: 'fan@example.com' } })).json(), { ok: true });
    assert.equal(H.S.mails.filter(m => m.to[0].email === 'fan@example.com').length, 3);
    // αποσύνδεση
    await H.call('POST', '/v1/auth/logout', { token: sess });
    assert.equal((await H.call('GET', '/v1/me', { token: sess })).status, 401);
  } finally { H.restore(); }
});

test('checkout: όροι υποχρεωτικοί, σωστό πακέτο/τιμή/ΦΠΑ, μηνιαίο = συνδρομή, σεζόν = εφάπαξ', async () => {
  const H = harness();
  try {
    assert.equal((await H.call('POST', '/v1/checkout', { body: { plan: 'monthly' } })).status, 400);
    assert.equal((await H.call('POST', '/v1/checkout', { body: { plan: 'monthly', accept_terms: true } })).status, 400, 'χωρίς συναίνεση για άμεση πρόσβαση');
    assert.equal((await H.call('POST', '/v1/checkout', { body: { plan: 'gold', accept_terms: true, waive_withdrawal: true } })).status, 400);
    const r = await H.call('POST', '/v1/checkout', { body: { plan: 'monthly', accept_terms: true, waive_withdrawal: true } });
    assert.equal((await r.json()).url, 'https://checkout.stripe.com/c/pay/cs_test_new');
    const f = H.S.created[0];
    assert.equal(f.mode, 'subscription'); assert.equal(f['line_items[0][price_data][unit_amount]'], '1490'); assert.equal(f['line_items[0][price_data][recurring][interval]'], 'month');
    assert.equal(f['metadata[plan]'], 'monthly'); assert.equal(f['subscription_data[metadata][plan]'], 'monthly');
    assert.equal(f.success_url, 'https://basketballstats.eu/welcome-pro/?cs={CHECKOUT_SESSION_ID}');
    assert.match(f['line_items[0][price_data][product_data][description]'], /ΦΠΑ 24%/);
    await H.call('POST', '/v1/checkout', { body: { plan: 'season', accept_terms: true, waive_withdrawal: true } });
    assert.equal(H.S.created[1].mode, 'payment'); assert.equal(H.S.created[1]['line_items[0][price_data][unit_amount]'], '5900'); assert.equal(H.S.created[1]['line_items[0][price_data][recurring][interval]'], undefined);
    const H2 = harness({ EARLY_BIRD_UNTIL: '2026-01-01T00:00:00Z' });
    try { assert.equal((await H2.call('POST', '/v1/checkout', { body: { plan: 'season_eb', accept_terms: true, waive_withdrawal: true } })).status, 400, 'Early Bird έληξε'); } finally { H2.restore(); }
  } finally { H.restore(); }
});

test('webhook: χωρίς σωστή υπογραφή τίποτα δεν αλλάζει', async () => {
  const H = harness();
  try {
    const ev = { id: 'evt_bad', type: 'checkout.session.completed', data: { object: seasonSession('cs_test_1', 'x@example.com') } };
    const r = await H.call('POST', '/v1/stripe/webhook', { body: ev, headers: { 'stripe-signature': 't=1,v1=00' } });
    assert.equal(r.status, 400);
    assert.equal((await H.env.DB.prepare('SELECT COUNT(*) n FROM users').first()).n, 0);
  } finally { H.restore(); }
});

test('πληρωμή σεζόν → PRO αυτόματα + email καλωσορίσματος με PRO Telegram + εγγραφή για απόδειξη (μία φορά)', async () => {
  const H = harness();
  try {
    const cs = seasonSession('cs_test_1', 'buyer@example.com');
    const ev = { id: 'evt_1', type: 'checkout.session.completed', data: { object: cs } };
    assert.equal((await H.hook(ev)).status, 200);
    assert.deepEqual(await (await H.hook(ev)).json(), { ok: true, duplicate: true });
    const welcome = H.S.mails.filter(m => m.subject === 'Καλώς ήρθες στο BasketballStats PRO');
    assert.equal(welcome.length, 1);
    assert.equal(welcome[0].to[0].email, 'buyer@example.com');
    assert.match(welcome[0].htmlContent, /https:\/\/t\.me\/\+inv1/);
    assert.match(welcome[0].htmlContent, /21\+/);
    assert.doesNotMatch(welcome[0].htmlContent, /σίγουρο σημείο|εγγυημένο/i);
    const o = await H.env.DB.prepare('SELECT * FROM orders').first();
    assert.equal(o.description, 'Συνδρομή πρόσβασης σε ψηφιακό περιεχόμενο - BasketballStats PRO - Σεζόν 2026-27');
    assert.deepEqual([o.amount_cents, o.net_cents, o.vat_cents, o.receipt_status], [4900, 3952, 948, 'pending_manual']);
    // σύνδεση από το email καλωσορίσματος → PRO
    const tok = /#login=([A-Za-z0-9_-]+)/.exec(welcome[0].htmlContent)[1];
    const sess = (await (await H.call('POST', '/v1/auth/verify', { body: { token: tok } })).json()).session;
    const me = await (await H.call('GET', '/v1/me', { token: sess })).json();
    assert.equal(me.role, 'PRO'); assert.equal(me.subscription.plan, 'season_eb'); assert.equal(me.subscription.renews, false);
    assert.equal(me.telegram.link, 'https://t.me/+inv1', 'ίδιο link όσο ισχύει');
    assert.equal(me.orders.length, 1);
    assert.equal((await H.call('POST', '/v1/checkout', { body: { plan: 'monthly', accept_terms: true, waive_withdrawal: true }, token: sess })).status, 409, 'ήδη PRO');
  } finally { H.restore(); }
});

test('/welcome-pro: σύνδεση με το checkout μία φορά· απλήρωτο checkout δεν δίνει πρόσβαση', async () => {
  const H = harness();
  try {
    H.S.sessions.cs_test_paid = seasonSession('cs_test_paid', 'w@example.com', 'season', 5900);
    H.S.sessions.cs_test_open = { ...seasonSession('cs_test_open', 'n@example.com'), status: 'open', payment_status: 'unpaid' };
    const r = await H.call('POST', '/v1/checkout/claim', { body: { session_id: 'cs_test_paid' } });
    assert.equal(r.status, 200);
    const me = await (await H.call('GET', '/v1/me', { token: (await r.json()).session })).json();
    assert.equal(me.role, 'PRO');
    assert.equal((await H.call('POST', '/v1/checkout/claim', { body: { session_id: 'cs_test_paid' } })).status, 409);
    assert.equal((await H.call('POST', '/v1/checkout/claim', { body: { session_id: 'cs_test_open' } })).status, 402);
    assert.equal((await H.call('POST', '/v1/checkout/claim', { body: { session_id: '../x' } })).status, 400);
    // το webhook που φτάνει μετά δεν ξαναστέλνει καλωσόρισμα
    await H.hook({ id: 'evt_late', type: 'checkout.session.completed', data: { object: H.S.sessions.cs_test_paid } });
    assert.equal(H.S.mails.filter(m => m.subject.startsWith('Καλώς ήρθες')).length, 1);
  } finally { H.restore(); }
});

test('μηνιαία: συνδρομή → PRO, ανανέωση γράφει πληρωμή, ακύρωση κρατά πρόσβαση ως το τέλος, διαγραφή → PRO_EXPIRED', async () => {
  const H = harness();
  try {
    const end = Math.floor((Date.now() + 30 * DAY) / 1000);
    H.S.subs.sub_1 = { id: 'sub_1', status: 'active', items: { data: [{ current_period_end: end }] }, cancel_at_period_end: false, metadata: { plan: 'monthly' } };
    const cs = { id: 'cs_test_m', status: 'complete', mode: 'subscription', payment_status: 'paid', subscription: 'sub_1', customer: 'cus_m', customer_details: { email: 'm@example.com' }, metadata: { plan: 'monthly' }, amount_total: 1490 };
    await H.hook({ id: 'evt_m1', type: 'checkout.session.completed', data: { object: cs } });
    await H.hook({ id: 'evt_m2', type: 'invoice.paid', data: { object: { id: 'in_1', subscription: 'sub_1', customer: 'cus_m', customer_email: 'm@example.com', amount_paid: 1490, currency: 'eur', billing_reason: 'subscription_create', lines: { data: [{ period: { start: Date.parse('2026-11-09') / 1000, end } }] } } } });
    const sess = await login(H, 'm@example.com');
    let me = await (await H.call('GET', '/v1/me', { token: sess })).json();
    assert.equal(me.role, 'PRO'); assert.equal(me.subscription.renews, true); assert.equal(me.can_manage_billing, true);
    assert.match(me.orders[0].description, /^Συνδρομή πρόσβασης σε ψηφιακό περιεχόμενο - BasketballStats PRO - Νοέμβριος 2026$/);
    // ακύρωση από το portal της Stripe
    assert.equal((await (await H.call('POST', '/v1/portal', { token: sess })).json()).url, 'https://billing.stripe.com/p/session/x');
    await H.hook({ id: 'evt_m3', type: 'customer.subscription.updated', data: { object: { ...H.S.subs.sub_1, cancel_at_period_end: true } } });
    me = await (await H.call('GET', '/v1/me', { token: sess })).json();
    assert.equal(me.role, 'PRO'); assert.equal(me.subscription.renews, false); assert.equal(me.subscription.cancel_at_period_end, true);
    await H.hook({ id: 'evt_m4', type: 'customer.subscription.deleted', data: { object: { ...H.S.subs.sub_1, status: 'canceled' } } });
    me = await (await H.call('GET', '/v1/me', { token: sess })).json();
    assert.equal(me.role, 'PRO_EXPIRED'); assert.equal(me.pro, false); assert.equal(me.telegram, null);
    // αποτυχία πληρωμής → email
    await H.hook({ id: 'evt_m5', type: 'invoice.payment_failed', data: { object: { id: 'in_2', subscription: 'sub_1', customer_email: 'm@example.com' } } });
    assert.ok(H.S.mails.some(m => m.subject.startsWith('Η πληρωμή της συνδρομής σου δεν ολοκληρώθηκε')));
  } finally { H.restore(); }
});

test('λήξη πάσου σεζόν → αυτόματα FREE δικαιώματα (PRO_EXPIRED)', async () => {
  const H = harness({ SEASON_END: new Date(Date.now() - DAY).toISOString() });
  try {
    await fulfillCheckout(H.env, H.env.DB, seasonSession('cs_test_old', 'old@example.com'));
    const me = await (await H.call('GET', '/v1/me', { token: await login(H, 'old@example.com') })).json();
    assert.equal(me.role, 'PRO_EXPIRED'); assert.equal(me.telegram, null);
  } finally { H.restore(); }
});

test('ADMIN από τη λίστα ADMIN_EMAILS· χωρίς Stripe key δεν ξεκινά checkout', async () => {
  const H = harness();
  try { assert.equal((await (await H.call('GET', '/v1/me', { token: await login(H, 'owner@example.com') })).json()).role, 'ADMIN'); } finally { H.restore(); }
  const H2 = harness({ STRIPE_SECRET_KEY: '' });
  try { assert.equal((await H2.call('POST', '/v1/checkout', { body: { plan: 'monthly', accept_terms: true, waive_withdrawal: true } })).status, 503); } finally { H2.restore(); }
});

// ---------------- Βήμα 2: κλείδωμα PRO περιεχομένου (server-side)
const PICK = { game_id: 'E-11-PAR-BAS', round: 11, match_label: 'Παρτιζάν - Μπασκόνια', starts_at: '2026-11-11T19:45:00Z', player: 'Nikola Tanaskovic', market: 'Over 13.5 Πόντοι + Ριμπάουντ', odds: 1.75, stake: 1, analysis: 'ΜΥΣΤΙΚΗ_ΑΝΑΛΥΣΗ: 29 και 27 λεπτά στους δύο τελευταίους αγώνες.' };
const SECRET = ['Tanaskovic', '13.5', '1.75', 'ΜΥΣΤΙΚΗ_ΑΝΑΛΥΣΗ', 'Ριμπάουντ'];
async function adminAndPick(H) {
  const adm = await login(H, 'owner@example.com');
  const r = await H.call('POST', '/v1/admin/picks', { token: adm, body: PICK });
  assert.equal(r.status, 201);
  return { adm, id: (await r.json()).id };
}
async function proToken(H, email = 'pro@example.com') {
  await fulfillCheckout(H.env, H.env.DB, seasonSession('cs_test_' + email.length, email));
  return login(H, email);
}

test('FREE (χωρίς σύνδεση ή συνδεδεμένος FREE) δεν λαμβάνει ΤΙΠΟΤΑ από το pick: ούτε παίκτη, αγορά, απόδοση, μονάδες, ανάλυση', async () => {
  const H = harness();
  try {
    await adminAndPick(H);
    for (const token of [undefined, await login(H, 'free@example.com'), 'not-a-real-session-token-xxxxxxxx']) {
      const r = await H.call('GET', '/v1/picks', { token }), raw = await r.text();
      assert.equal(r.status, 200);
      for (const s of SECRET) assert.ok(!raw.includes(s), `διέρρευσε «${s}»`);
      const j = JSON.parse(raw);
      assert.equal(j.pro, false); assert.equal(j.picks.length, 1);
      assert.deepEqual(Object.keys(j.picks[0]).sort(), ['game_id', 'id', 'locked', 'match_label', 'published_at', 'result', 'round', 'settled_at', 'starts_at']);
      assert.equal(j.picks[0].locked, true); assert.equal(j.picks[0].match_label, 'Παρτιζάν - Μπασκόνια');
    }
  } finally { H.restore(); }
});

test('PRO βλέπει παίκτη, αγορά, απόδοση, μονάδες, ανάλυση, ώρα δημοσίευσης· η λήξη τα ξανακλειδώνει', async () => {
  const H = harness();
  try {
    await adminAndPick(H);
    const tok = await proToken(H);
    const j = await (await H.call('GET', '/v1/picks', { token: tok })).json();
    const p = j.picks[0];
    assert.equal(j.pro, true); assert.equal(p.locked, false);
    assert.equal(p.player, 'Nikola Tanaskovic'); assert.equal(p.market, 'Over 13.5 Πόντοι + Ριμπάουντ'); assert.equal(p.odds, 1.75); assert.equal(p.stake, 1);
    assert.match(p.analysis, /ΜΥΣΤΙΚΗ_ΑΝΑΛΥΣΗ/); assert.ok(p.published_at);
    // λήξη: ο ίδιος χρήστης ξαναγίνεται FREE
    await H.env.DB.prepare("UPDATE subscriptions SET current_period_end = '2020-01-01T00:00:00Z'").run();
    const raw = await (await H.call('GET', '/v1/picks', { token: tok })).text();
    for (const s of SECRET) assert.ok(!raw.includes(s), `μετά τη λήξη διέρρευσε «${s}»`);
  } finally { H.restore(); }
});

test('προγραμματισμένο pick (μελλοντική δημοσίευση) δεν φαίνεται σε κανέναν πριν την ώρα του· διαγραμμένο ποτέ', async () => {
  const H = harness();
  try {
    const adm = await login(H, 'owner@example.com');
    await H.call('POST', '/v1/admin/picks', { token: adm, body: { ...PICK, published_at: new Date(Date.now() + 3600e3).toISOString() } });
    const tok = await proToken(H);
    assert.equal((await (await H.call('GET', '/v1/picks', { token: tok })).json()).picks.length, 0);
    assert.equal((await (await H.call('GET', '/v1/admin/picks', { token: adm })).json()).picks.length, 1, 'ο admin το βλέπει');
    const { id } = await adminAndPick(H);
    await H.call('DELETE', `/v1/admin/picks/${id}`, { token: adm });
    assert.equal((await (await H.call('GET', '/v1/picks', { token: tok })).json()).picks.length, 0);
  } finally { H.restore(); }
});

test('Ανάλυση Αγώνα: FREE = μόνο «κλειδωμένο», PRO = πλήρες κείμενο', async () => {
  const H = harness();
  try {
    const adm = await login(H, 'owner@example.com');
    assert.equal((await H.call('PUT', '/v1/admin/analyses/E-11-PAN-BAR', { token: adm, body: { body: 'ΚΡΥΦΟ: η Μπαρτσελόνα χωρίς Πάντερ.' } })).status, 200);
    const free = await H.call('GET', '/v1/analyses/E-11-PAN-BAR'), raw = await free.text();
    assert.ok(!raw.includes('ΚΡΥΦΟ') && !raw.includes('Πάντερ')); assert.equal(JSON.parse(raw).locked, true);
    const pro = await (await H.call('GET', '/v1/analyses/E-11-PAN-BAR', { token: await proToken(H) })).json();
    assert.equal(pro.locked, false); assert.match(pro.body, /ΚΡΥΦΟ/);
    assert.equal((await H.call('GET', '/v1/analyses/E-11-OLY-PAN')).status, 404);
    assert.equal((await H.call('GET', '/v1/analyses/..%2Fx')).status, 404);
  } finally { H.restore(); }
});

test('admin: μόνο ο ADMIN γράφει· επικύρωση φόρμας· κρίση → δημόσιο Track Record (χωρίς ανάλυση) με ήττες', async () => {
  const H = harness();
  try {
    assert.equal((await H.call('POST', '/v1/admin/picks', { body: PICK })).status, 401);
    const pro = await proToken(H);
    assert.equal((await H.call('POST', '/v1/admin/picks', { token: pro, body: PICK })).status, 403, 'PRO δεν είναι admin');
    const { adm, id } = await adminAndPick(H);
    const bad = await H.call('POST', '/v1/admin/picks', { token: adm, body: { ...PICK, odds: 0.5, game_id: 'x; DROP TABLE picks' } });
    assert.equal(bad.status, 400); assert.deepEqual((await bad.json()).fields.sort(), ['game_id', 'odds']);
    const r2 = await (await H.call('POST', '/v1/admin/picks', { token: adm, body: { ...PICK, market: 'Under 175.5', player: null, odds: 1.73, stake: 2 } })).json();
    await H.call('POST', `/v1/admin/picks/${id}/settle`, { token: adm, body: { result: 'won' } });
    await H.call('POST', `/v1/admin/picks/${r2.id}/settle`, { token: adm, body: { result: 'lost' } });
    const tr = await (await H.call('GET', '/v1/track-record')).json();
    assert.equal(tr.summary.total, 2); assert.equal(tr.summary.won, 1); assert.equal(tr.summary.lost, 1);
    assert.equal(tr.summary.net_units, 0.75 - 2); assert.ok(Math.abs(tr.summary.roi - (-1.25 / 3)) < 1e-9);
    assert.ok(tr.picks.every(p => !('analysis' in p)), 'ανάλυση μόνο για PRO');
    assert.ok(tr.picks.some(p => p.result === 'lost' && p.profit === -2), 'οι ήττες φαίνονται');
    // διόρθωση από τον admin → η σύνοψη ξαναϋπολογίζεται
    await H.call('PATCH', `/v1/admin/picks/${r2.id}`, { token: adm, body: { odds: 2.0, nonsense: 'x' } });
    await H.call('POST', `/v1/admin/picks/${r2.id}/settle`, { token: adm, body: { result: 'void' } });
    const tr2 = await (await H.call('GET', '/v1/track-record')).json();
    assert.equal(tr2.summary.void, 1); assert.equal(tr2.summary.net_units, 0.75);
    const log = (await H.env.DB.prepare("SELECT action FROM audit_log WHERE actor = 'owner@example.com'").all()).results.map(x => x.action);
    assert.ok(log.includes('pick_create') && log.includes('pick_settle') && log.includes('pick_edit'));
  } finally { H.restore(); }
});
