const PADDLE_API = 'https://api.paddle.com';
const PADDLE_SANDBOX_API = 'https://sandbox-api.paddle.com';
const encoder = new TextEncoder();

function equalHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPaddleSignature(rawBody, header, secret, nowMs = Date.now()) {
  if (!secret || !header) return false;
  let ts = NaN;
  const signatures = [];
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim(), value = part.slice(i + 1).trim();
    if (key === 'ts') ts = Number(value);
    if (key === 'h1') signatures.push(value);
  }
  if (!Number.isFinite(ts) || !signatures.length || Math.abs(Math.floor(nowMs / 1000) - ts) > 300) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(ts + ':' + rawBody)));
  const expected = [...digest].map(x => x.toString(16).padStart(2, '0')).join('');
  return signatures.some(sig => equalHex(sig, expected));
}

function apiBase(env) {
  if (env.PADDLE_ENV === 'sandbox') return PADDLE_SANDBOX_API;
  if (env.PADDLE_ENV === 'production') return PADDLE_API;
  throw new Error('billing_unavailable');
}

async function paddleFetch(env, path, body) {
  if (!env.PADDLE_API_KEY) throw new Error('billing_unavailable');
  const res = await fetch(apiBase(env) + path, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.PADDLE_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('paddle_api_' + res.status);
  return json.data;
}

export async function createCheckout(env, user, site) {
  if (!env.PADDLE_PRICE_ID || !env.PADDLE_API_KEY) throw new Error('billing_unavailable');
  const data = await paddleFetch(env, '/transactions', {
    items: [{ price_id: env.PADDLE_PRICE_ID, quantity: 1 }],
    custom_data: { basketballstats_user_id: user.id },
  });
  if (!data?.checkout?.url || !data.checkout.url.startsWith('https://')) throw new Error('checkout_unavailable');
  return data.checkout.url;
}

export async function createPortal(env, db, userId) {
  const row = await db.prepare('SELECT customer_id FROM premium_subscriptions WHERE user_id = ? AND customer_id IS NOT NULL').bind(userId).first();
  if (!row?.customer_id) return null;
  const data = await paddleFetch(env, '/customers/' + encodeURIComponent(row.customer_id) + '/portal-sessions', {});
  const link = data?.urls?.general?.overview;
  return typeof link === 'string' && link.startsWith('https://') ? link : null;
}

export async function paddleWebhook(req, env) {
  const raw = await req.text();
  if (raw.length > 256 * 1024) return new Response('too large', { status: 413 });
  if (!await verifyPaddleSignature(raw, req.headers.get('paddle-signature'), env.PADDLE_WEBHOOK_SECRET)) return new Response('invalid signature', { status: 401 });
  let event;
  try { event = JSON.parse(raw); } catch { return new Response('invalid payload', { status: 400 }); }
  if (!event?.event_id || !event?.event_type || !event?.occurred_at || !event?.data?.id) return new Response('invalid event', { status: 400 });

  const db = env.DB, data = event.data;
  const statements = [db.prepare('INSERT OR IGNORE INTO premium_billing_events (event_id, processed_at) VALUES (?, ?)').bind(event.event_id, Math.floor(Date.now() / 1000))];
  if (event.event_type === 'subscription.created' || event.event_type === 'subscription.updated') {
    const userId = data.custom_data?.basketballstats_user_id;
    const priceId = env.PADDLE_PRICE_ID;
    const itemPriceIds = (Array.isArray(data.items) ? data.items : []).map(x => x.price?.id || x.price_id);
    const status = ['active', 'trialing', 'past_due', 'paused', 'canceled'].includes(data.status) ? data.status : 'inactive';
      const owner = typeof userId === 'string' && userId ? userId : (await db.prepare('SELECT user_id FROM premium_subscriptions WHERE subscription_id = ? OR customer_id = ?').bind(data.id, data.customer_id || '').first())?.user_id;
    if (typeof owner === 'string' && owner && priceId && itemPriceIds.includes(priceId)) {
      const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(owner).first();
      if (user) statements.push(db.prepare(`INSERT INTO premium_subscriptions (user_id, customer_id, subscription_id, price_id, status, current_period_end, last_event_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET customer_id = excluded.customer_id, subscription_id = excluded.subscription_id, price_id = excluded.price_id, status = excluded.status, current_period_end = excluded.current_period_end, last_event_at = excluded.last_event_at
        WHERE excluded.last_event_at >= premium_subscriptions.last_event_at`).bind(
          owner, data.customer_id || null, data.id, priceId, status,
          data.current_billing_period?.ends_at || null, event.occurred_at,
        ));
    }
  }
  await db.batch(statements);
  return new Response('ok', { status: 200 });
}

export async function premiumStatus(db, userId) {
  const row = await db.prepare('SELECT status, current_period_end FROM premium_subscriptions WHERE user_id = ?').bind(userId).first();
  return { premium: row?.status === 'active', status: row?.status || 'free', currentPeriodEnd: row?.current_period_end || null };
}
