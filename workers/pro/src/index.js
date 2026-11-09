// BasketballStats PRO API (Cloudflare Worker + D1).
// Το PRO περιεχόμενο ΔΕΝ υπάρχει στο στατικό site ούτε στο δημόσιο repo: το δίνει μόνο αυτό το API, μόνο σε ενεργό PRO.
//   POST /v1/auth/request   {email}            → email με link σύνδεσης (πάντα {ok:true}: δεν αποκαλύπτει αν υπάρχει λογαριασμός)
//   POST /v1/auth/verify    {token}            → {session}
//   POST /v1/auth/logout
//   GET  /v1/me                                → ρόλος, συνδρομή, PRO Telegram link (μόνο PRO), πληρωμές
//   GET  /v1/plans                             → πακέτα και τιμές (με ΦΠΑ)
//   POST /v1/checkout       {plan, accept_terms, waive_withdrawal} → {url} Stripe Checkout
//   POST /v1/checkout/claim {session_id}       → σύνδεση μετά την πληρωμή (μία φορά ανά checkout)
//   POST /v1/portal                            → {url} Stripe Customer Portal (ακύρωση με 1 κλικ, κάρτα, αποδείξεις)
//   POST /v1/stripe/webhook                    → υπογεγραμμένα events της Stripe
import { plans, planAvailable, roleOf, normEmail, randomToken, sha256, verifyStripeSignature, stripeForm, vatSplit, invoiceDescription, monthLabel } from './lib.js';
import { sendEmail } from './emails.js';

const iso = (t = Date.now()) => new Date(t).toISOString();
const DAY = 864e5;

function corsHeaders(env, origin) {
  const ok = String(env.SITE_ORIGIN || 'https://basketballstats.eu').split(',').map(s => s.trim()).includes(origin);
  return { 'access-control-allow-origin': ok ? origin : 'null', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '600', vary: 'origin' };
}
const json = (obj, status = 200, h = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...h } });
const site = env => String(env.SITE_ORIGIN || 'https://basketballstats.eu').split(',')[0].trim();
const SEASON_END = env => env.SEASON_END || '2027-06-01T00:00:00Z';
const audit = (db, actor, action, detail) => db.prepare('INSERT INTO audit_log (at, actor, action, detail) VALUES (?,?,?,?)').bind(iso(), actor, action, detail ? JSON.stringify(detail).slice(0, 2000) : null).run();

// ---- Stripe (REST, χωρίς SDK)
async function stripe(env, method, path, params) {
  const base = env.STRIPE_API_BASE || 'https://api.stripe.com';
  const q = method === 'GET' && params ? '?' + stripeForm(params) : '';
  const r = await fetch(`${base}/v1/${path}${q}`, { method, headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': env.STRIPE_API_VERSION || '2024-06-20' }, body: method === 'GET' ? undefined : stripeForm(params || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`stripe ${r.status}: ${j?.error?.message || ''}`), { status: r.status });
  return j;
}
// τέλος περιόδου συνδρομής (παλιό και νέο σχήμα του API της Stripe)
const subPeriodEnd = s => s.current_period_end || s.items?.data?.[0]?.current_period_end || null;

// ---- χρήστες / sessions
async function userByEmail(db, email) { return db.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first(); }
async function upsertUser(db, email, customer = null) {
  let u = await userByEmail(db, email);
  if (!u) { await db.prepare('INSERT INTO users (email, stripe_customer, created_at) VALUES (?,?,?) ON CONFLICT(email) DO NOTHING').bind(email, customer, iso()).run(); u = await userByEmail(db, email); }
  if (customer && !u.stripe_customer) { await db.prepare('UPDATE users SET stripe_customer = ? WHERE id = ?').bind(customer, u.id).run(); u.stripe_customer = customer; }
  return u;
}
async function newSession(db, userId, days = 30) {
  const tok = randomToken();
  await db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)').bind(await sha256(tok), userId, iso(), iso(Date.now() + days * DAY)).run();
  return tok;
}
async function loginLink(env, db, userId, minutes = 20) {
  const tok = randomToken();
  await db.prepare('INSERT INTO login_tokens (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)').bind(await sha256(tok), userId, iso(), iso(Date.now() + minutes * 60e3)).run();
  return `${site(env)}/my-account/#login=${tok}`;           // fragment: δεν φτάνει σε server logs/προφόρτωση συνδέσμων
}
async function authUser(req, db) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.deleted_at IS NULL').bind(await sha256(m[1]), iso()).first();
}
const subsOf = async (db, userId) => (await db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id').bind(userId).all()).results || [];
export async function accessOf(env, db, user) { return roleOf(user, user ? await subsOf(db, user.id) : [], { admins: env.ADMIN_EMAILS || '' }); }

// ---- Telegram: προσωπικό link 24 ωρών, για ένα άτομο (Bot API createChatInviteLink)
async function telegramInvite(env, db, userId) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_PRO_CHAT_ID) return null;
  const cur = await db.prepare('SELECT * FROM telegram_invites WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY id DESC').bind(userId, iso(Date.now() + 3600e3)).first();
  if (cur) return { link: cur.invite_link, expires_at: cur.expires_at };
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const r = await fetch(`${env.TELEGRAM_API_BASE || 'https://api.telegram.org'}/bot${env.TELEGRAM_BOT_TOKEN}/createChatInviteLink`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_PRO_CHAT_ID, name: `pro-${userId}`, expire_date: exp, member_limit: 1 }) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) { await audit(db, 'system', 'telegram_invite_failed', { userId, error: j.description || r.status }); return null; }
  await db.prepare('INSERT INTO telegram_invites (user_id, invite_link, expires_at, created_at) VALUES (?,?,?,?)').bind(userId, j.result.invite_link, iso(exp * 1000), iso()).run();
  return { link: j.result.invite_link, expires_at: iso(exp * 1000) };
}

async function welcomeOnce(env, db, sub, user) {
  if (sub.welcomed_at) return;
  const done = await db.prepare('UPDATE subscriptions SET welcomed_at = ? WHERE id = ? AND welcomed_at IS NULL').bind(iso(), sub.id).run();
  if (!done.meta?.changes) return;                               // άλλο αίτημα το έστειλε ήδη
  const P = plans(env)[sub.plan];
  const tg = await telegramInvite(env, db, user.id);
  const until = sub.plan === 'monthly' ? null : new Date(sub.current_period_end).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens' });
  await sendEmail(env, db, user.email, 'welcome_pro', { telegram: tg?.link || null, account: await loginLink(env, db, user.id, 24 * 60), plan: P?.name || sub.plan, until });
}

/** ολοκλήρωση αγοράς (webhook ή /checkout/claim): idempotent */
export async function fulfillCheckout(env, db, cs) {
  const email = normEmail(cs.customer_details?.email || cs.customer_email);
  const plan = plans(env)[cs.metadata?.plan];
  if (!email || !plan || cs.status !== 'complete') return null;
  const user = await upsertUser(db, email, cs.customer || null);
  const now = iso();
  if (cs.mode === 'payment') {
    if (cs.payment_status !== 'paid') return null;
    await db.prepare(`INSERT INTO subscriptions (user_id, plan, status, stripe_session, current_period_end, created_at, updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(stripe_session) DO NOTHING`)
      .bind(user.id, plan.key, 'active', cs.id, SEASON_END(env), now, now).run();
    const v = vatSplit(cs.amount_total);
    await db.prepare(`INSERT INTO orders (ext_id, user_id, plan, amount_cents, net_cents, vat_cents, currency, description, status, billing_name, billing_country, tax_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(ext_id) DO NOTHING`)
      .bind(cs.id, user.id, plan.key, v.gross, v.net, v.vat, cs.currency || 'eur', invoiceDescription(plan.label), 'paid', cs.customer_details?.name || null, cs.customer_details?.address?.country || null, cs.customer_details?.tax_ids?.[0]?.value || null, now).run();
  } else {
    const s = await stripe(env, 'GET', `subscriptions/${cs.subscription}`);
    await upsertStripeSub(db, user, s, plan.key);
  }
  const sub = await db.prepare('SELECT * FROM subscriptions WHERE stripe_session = ? OR (stripe_subscription IS NOT NULL AND stripe_subscription = ?)').bind(cs.id, cs.subscription || '').first();
  if (sub) await welcomeOnce(env, db, sub, user);
  return user;
}
async function upsertStripeSub(db, user, s, planKey) {
  const end = subPeriodEnd(s), now = iso();
  await db.prepare(`INSERT INTO subscriptions (user_id, plan, status, stripe_subscription, current_period_end, cancel_at_period_end, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(stripe_subscription) DO UPDATE SET status = excluded.status, current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at`)
    .bind(user.id, planKey || s.metadata?.plan || 'monthly', s.status, s.id, end ? iso(end * 1000) : null, s.cancel_at_period_end ? 1 : 0, now, now).run();
}

async function handleWebhook(req, env, db) {
  const body = await req.text();
  if (!(await verifyStripeSignature(body, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'signature' }, 400);
  const ev = JSON.parse(body);
  const fresh = await db.prepare('INSERT INTO webhook_events (id, type, received_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING').bind(ev.id, ev.type, iso()).run();
  if (!fresh.meta?.changes) return json({ ok: true, duplicate: true });
  const o = ev.data.object;
  try {
    if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') await fulfillCheckout(env, db, o);
    else if (ev.type === 'invoice.paid') {
      const subId = o.subscription || o.parent?.subscription_details?.subscription;
      const email = normEmail(o.customer_email);
      if (subId && email) {
        const user = await upsertUser(db, email, o.customer || null);
        const s = await stripe(env, 'GET', `subscriptions/${subId}`);
        await upsertStripeSub(db, user, s, s.metadata?.plan || 'monthly');
        const v = vatSplit(o.amount_paid), start = o.lines?.data?.[0]?.period?.start || o.period_start;
        const ins = await db.prepare(`INSERT INTO orders (ext_id, user_id, plan, amount_cents, net_cents, vat_cents, currency, description, status, receipt_url, billing_name, billing_country, tax_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(ext_id) DO NOTHING`)
          .bind(o.id, user.id, 'monthly', v.gross, v.net, v.vat, o.currency || 'eur', invoiceDescription(monthLabel(start * 1000)), 'paid', o.hosted_invoice_url || null, o.customer_name || null, o.customer_address?.country || null, o.customer_tax_ids?.[0]?.value || null, iso()).run();
        if (ins.meta?.changes && o.billing_reason === 'subscription_cycle') await sendEmail(env, db, user.email, 'payment_success', { amount: (v.gross / 100).toFixed(2).replace('.', ',') + ' €', description: invoiceDescription(monthLabel(start * 1000)), account: `${site(env)}/my-account/` });
      }
    } else if (ev.type === 'invoice.payment_failed') {
      const subId = o.subscription || o.parent?.subscription_details?.subscription;
      if (subId) await db.prepare("UPDATE subscriptions SET status = 'past_due', updated_at = ? WHERE stripe_subscription = ?").bind(iso(), subId).run();
      const email = normEmail(o.customer_email); if (email) await sendEmail(env, db, email, 'payment_failed', { account: `${site(env)}/my-account/` });
    } else if (ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted') {
      const end = subPeriodEnd(o);
      await db.prepare('UPDATE subscriptions SET status = ?, cancel_at_period_end = ?, current_period_end = COALESCE(?, current_period_end), updated_at = ? WHERE stripe_subscription = ?')
        .bind(ev.type.endsWith('deleted') ? 'canceled' : o.status, o.cancel_at_period_end ? 1 : 0, end ? iso(end * 1000) : null, iso(), o.id).run();
    }
  } catch (e) {
    // να ξαναστείλει η Stripe: αφαιρούμε την καταγραφή του event
    await db.prepare('DELETE FROM webhook_events WHERE id = ?').bind(ev.id).run();
    await audit(db, 'stripe', 'webhook_error', { id: ev.id, type: ev.type, error: String(e.message || e) });
    return json({ error: 'retry' }, 500);
  }
  await audit(db, 'stripe', ev.type, { id: ev.id });
  return json({ ok: true });
}

async function readJson(req) { try { return await req.json(); } catch { return {}; } }

async function route(req, env, H) {
  const db = env.DB, url = new URL(req.url), p = url.pathname, M = req.method;
  if (p === '/v1/stripe/webhook' && M === 'POST') return handleWebhook(req, env, db);
  // όλα τα υπόλοιπα: μόνο από το site
  if (H['access-control-allow-origin'] === 'null' && p !== '/v1/health') return json({ error: 'origin' }, 403, H);
  if (p === '/v1/health') return json({ ok: true, stripe: !!env.STRIPE_SECRET_KEY, email: !!env.BREVO_API_KEY, telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_PRO_CHAT_ID) }, 200, H);

  if (p === '/v1/plans' && M === 'GET') return json({ vat_rate: 0.24, plans: Object.values(plans(env)).map(x => ({ key: x.key, name: x.name, cents: x.cents, mode: x.mode, available: planAvailable(x) })) }, 200, H);

  if (p === '/v1/auth/request' && M === 'POST') {
    const email = normEmail((await readJson(req)).email);
    if (!email) return json({ error: 'email' }, 400, H);
    const user = await upsertUser(db, email);
    const recent = await db.prepare('SELECT COUNT(*) AS n FROM login_tokens WHERE user_id = ? AND created_at > ?').bind(user.id, iso(Date.now() - 15 * 60e3)).first();
    if ((recent?.n || 0) < 3) await sendEmail(env, db, email, 'login', { link: await loginLink(env, db, user.id) });
    return json({ ok: true }, 200, H);
  }
  if (p === '/v1/auth/verify' && M === 'POST') {
    const tok = String((await readJson(req)).token || '');
    if (!/^[A-Za-z0-9_-]{20,}$/.test(tok)) return json({ error: 'token' }, 400, H);
    const h = await sha256(tok);
    const used = await db.prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').bind(iso(), h, iso()).run();
    if (!used.meta?.changes) return json({ error: 'expired' }, 400, H);
    const row = await db.prepare('SELECT user_id FROM login_tokens WHERE token_hash = ?').bind(h).first();
    return json({ session: await newSession(db, row.user_id) }, 200, H);
  }
  if (p === '/v1/auth/logout' && M === 'POST') {
    const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') || '');
    if (m) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
    return json({ ok: true }, 200, H);
  }
  if (p === '/v1/me' && M === 'GET') {
    const user = await authUser(req, db);
    if (!user) return json({ error: 'auth' }, 401, H);
    const A = await accessOf(env, db, user);
    const orders = (await db.prepare('SELECT created_at, description, amount_cents, currency, status, receipt_status, receipt_url FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 50').bind(user.id).all()).results || [];
    return json({ email: user.email, role: A.role, pro: A.pro,
      subscription: A.sub && { plan: A.sub.plan, status: A.sub.status, until: A.sub.current_period_end, renews: A.sub.plan === 'monthly' && !A.sub.cancel_at_period_end && A.pro, cancel_at_period_end: !!A.sub.cancel_at_period_end },
      telegram: A.pro ? await telegramInvite(env, db, user.id) : null,
      can_manage_billing: !!user.stripe_customer, orders }, 200, H);
  }
  if (p === '/v1/checkout' && M === 'POST') {
    const b = await readJson(req), plan = plans(env)[b.plan];
    if (!plan || !planAvailable(plan)) return json({ error: 'plan' }, 400, H);
    if (b.accept_terms !== true) return json({ error: 'terms' }, 400, H);
    // ψηφιακό περιεχόμενο με άμεση πρόσβαση: ρητή συναίνεση και αναγνώριση απώλειας του δικαιώματος υπαναχώρησης (Οδηγία 2011/83/ΕΕ, άρθ. 16 στ. ιγ)
    if (b.waive_withdrawal !== true) return json({ error: 'withdrawal' }, 400, H);
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'unavailable' }, 503, H);
    const user = await authUser(req, db);
    if (user && (await accessOf(env, db, user)).pro) return json({ error: 'already_pro' }, 409, H);
    const params = {
      mode: plan.mode, locale: 'el', client_reference_id: user ? String(user.id) : undefined,
      success_url: `${site(env)}/welcome-pro/?cs={CHECKOUT_SESSION_ID}`, cancel_url: `${site(env)}/checkout/?canceled=1`,
      line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: plan.cents, product_data: { name: `BasketballStats ${plan.name}`, description: 'Πρόσβαση σε ψηφιακό περιεχόμενο. Η τιμή περιλαμβάνει ΦΠΑ 24%.' }, ...(plan.interval ? { recurring: { interval: plan.interval } } : {}) } } },
      metadata: { plan: plan.key, terms: 'accepted', withdrawal_waived: 'yes' }, tax_id_collection: { enabled: 'true' },
      custom_text: { submit: { message: '21+. Στατιστική ανάλυση, όχι συμβουλή στοιχήματος. Η τιμή περιλαμβάνει ΦΠΑ 24%.' } },
    };
    if (plan.mode === 'subscription') params.subscription_data = { metadata: { plan: plan.key } };
    else params.customer_creation = 'always';
    if (user?.stripe_customer) params.customer = user.stripe_customer; else if (user) params.customer_email = user.email;
    if (params.customer) params.customer_update = { name: 'auto', address: 'auto' };
    const cs = await stripe(env, 'POST', 'checkout/sessions', params);
    return json({ url: cs.url }, 200, H);
  }
  if (p === '/v1/checkout/claim' && M === 'POST') {
    const id = String((await readJson(req)).session_id || '');
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json({ error: 'session' }, 400, H);
    const cs = await stripe(env, 'GET', `checkout/sessions/${id}`);
    const user = await fulfillCheckout(env, db, cs);
    if (!user) return json({ error: 'not_paid' }, 402, H);
    const claim = await db.prepare('INSERT INTO checkout_claims (stripe_session, user_id, claimed_at) VALUES (?,?,?) ON CONFLICT(stripe_session) DO NOTHING').bind(id, user.id, iso()).run();
    if (!claim.meta?.changes) return json({ error: 'claimed', email: null }, 409, H);     // ήδη χρησιμοποιήθηκε: σύνδεση με email
    return json({ session: await newSession(db, user.id) }, 200, H);
  }
  if (p === '/v1/portal' && M === 'POST') {
    const user = await authUser(req, db);
    if (!user) return json({ error: 'auth' }, 401, H);
    if (!user.stripe_customer) return json({ error: 'no_customer' }, 400, H);
    const s = await stripe(env, 'POST', 'billing_portal/sessions', { customer: user.stripe_customer, return_url: `${site(env)}/my-account/` });
    return json({ url: s.url }, 200, H);
  }
  return json({ error: 'not_found' }, 404, H);
}

export default {
  async fetch(req, env) {
    const H = corsHeaders(env, req.headers.get('origin') || '');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    try { return await route(req, env, H); }
    catch (e) { try { await audit(env.DB, 'system', 'error', { path: new URL(req.url).pathname, error: String(e.message || e) }); } catch { } return json({ error: 'server' }, 500, H); }
  },
};
