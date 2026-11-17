import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { makeD1 } from './d1-shim.mjs';
import { createCheckout, createPortal, paddleWebhook, premiumStatus, verifyPaddleSignature } from '../workers/account/billing.mjs';

const SECRET = 'test-webhook-secret';
const PRICE = 'pri_test_premium';
const db = makeD1(new URL('../workers/account/schema.sql', import.meta.url));
const env = { DB: db, PADDLE_API_KEY: 'pdl_test_key', PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_PRICE_ID: PRICE, PADDLE_ENV: 'sandbox' };

function signed(raw, ts = Math.floor(Date.now() / 1000)) {
  const h1 = crypto.createHmac('sha256', SECRET).update(ts + ':' + raw).digest('hex');
  return `ts=${ts};h1=${h1}`;
}
function event({ id = 'evt_1', type = 'subscription.created', at = '2026-11-17T12:00:00Z', user = 'user-1', status = 'active', subscription = 'sub_1', customer = 'ctm_1', price = PRICE } = {}) {
  return JSON.stringify({
    event_id: id, event_type: type, occurred_at: at,
    data: {
      id: subscription, customer_id: customer, status,
      custom_data: { basketballstats_user_id: user },
      items: [{ price: { id: price } }],
      current_billing_period: { ends_at: '2026-12-17T12:00:00Z' },
    },
  });
}
async function sendWebhook(raw, signature = signed(raw)) {
  return paddleWebhook(new Request('https://worker.example/billing/webhook', { method: 'POST', headers: { 'paddle-signature': signature }, body: raw }), env);
}
function addUser(id) {
  db.raw.prepare('INSERT OR IGNORE INTO users (id, provider, sub, name, email, created, prefs) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'google', id, 'Test', null, 1, '{}');
}

test('Paddle signatures validate raw body, age, and secret', async () => {
  const raw = '{"ok":true}', sig = signed(raw);
  assert.equal(await verifyPaddleSignature(raw, sig, SECRET), true);
  assert.equal(await verifyPaddleSignature(raw, sig + ';h1=wrong', SECRET), true, 'accepts valid signature during key rotation');
  assert.equal(await verifyPaddleSignature(raw + ' ', sig, SECRET), false);
  assert.equal(await verifyPaddleSignature(raw, sig, 'wrong'), false);
  assert.equal(await verifyPaddleSignature(raw, signed(raw, 1), SECRET), false);
});

test('checkout creates a fixed-price transaction and returns hosted checkout', async () => {
  const previous = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://sandbox-api.paddle.com/transactions');
    assert.equal(init.headers.authorization, 'Bearer pdl_test_key');
    sent = JSON.parse(init.body);
    return Response.json({ data: { checkout: { url: 'https://pay.paddle.com/checkout/test' } } });
  };
  try {
    const url = await createCheckout(env, { id: 'user-1' }, 'https://basketballstats.eu');
    assert.equal(url, 'https://pay.paddle.com/checkout/test');
    assert.deepEqual(sent.items, [{ price_id: PRICE, quantity: 1 }]);
    assert.deepEqual(sent.custom_data, { basketballstats_user_id: 'user-1' });
  } finally { globalThis.fetch = previous; }
});

test('portal session is created only for the signed-in user customer', async () => {
  addUser('user-portal');
  db.raw.prepare('INSERT OR REPLACE INTO premium_subscriptions (user_id, customer_id, subscription_id, price_id, status, current_period_end, last_event_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('user-portal', 'ctm_portal', 'sub_portal', PRICE, 'canceled', null, '2026-11-17T00:00:00Z');
  const previous = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url, init) => {
    requested = { url, body: JSON.parse(init.body) };
    return Response.json({ data: { urls: { general: { overview: 'https://customer-portal.paddle.com/session' } } } });
  };
  try {
    assert.equal(await createPortal(env, db, 'other-user'), null);
    assert.equal(await createPortal(env, db, 'user-portal'), 'https://customer-portal.paddle.com/session');
    assert.equal(requested.url, 'https://sandbox-api.paddle.com/customers/ctm_portal/portal-sessions');
  } finally { globalThis.fetch = previous; }
});

test('verified, matching subscription webhooks grant and revoke Premium idempotently', async () => {
  addUser('user-1');
  assert.equal((await sendWebhook(event({ id: 'evt_bad' }), 'ts=1;h1=bad')).status, 401);
  assert.equal((await sendWebhook(event({ id: 'evt_wrong_price', price: 'pri_other' }))).status, 200);
  assert.deepEqual(await premiumStatus(db, 'user-1'), { premium: false, status: 'free', currentPeriodEnd: null });

  const active = event({ id: 'evt_active' });
  assert.equal((await sendWebhook(active)).status, 200);
  assert.equal((await sendWebhook(active)).status, 200);
  assert.deepEqual(await premiumStatus(db, 'user-1'), { premium: true, status: 'active', currentPeriodEnd: '2026-12-17T12:00:00Z' });
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM premium_billing_events WHERE event_id = ?').get('evt_active').n, 1);

  const stale = event({ id: 'evt_stale', type: 'subscription.updated', at: '2026-11-16T12:00:00Z', status: 'canceled' });
  await sendWebhook(stale);
  assert.equal((await premiumStatus(db, 'user-1')).premium, true);

  const canceled = event({ id: 'evt_canceled', type: 'subscription.updated', at: '2026-11-18T12:00:00Z', status: 'canceled' });
  await sendWebhook(canceled);
  assert.deepEqual(await premiumStatus(db, 'user-1'), { premium: false, status: 'canceled', currentPeriodEnd: '2026-12-17T12:00:00Z' });
});

test('unknown account and non-matching product cannot create an entitlement', async () => {
  await sendWebhook(event({ id: 'evt_unknown', user: 'missing-user' }));
  await sendWebhook(event({ id: 'evt_other_product', user: 'user-2', price: 'pri_other' }));
  assert.deepEqual(await premiumStatus(db, 'missing-user'), { premium: false, status: 'free', currentPeriodEnd: null });
  assert.deepEqual(await premiumStatus(db, 'user-2'), { premium: false, status: 'free', currentPeriodEnd: null });
});
