// Worker λογαριασμών (workers/account/worker.js) με D1 σε node:sqlite και ψεύτικους Google/Telegram (χωρίς δίκτυο)
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { makeD1 } from './d1-shim.mjs';
import W, { verifyGoogle } from '../workers/account/worker.js';

const ORIGIN = 'https://basketballstats.eu', CID = 'test-client.apps.googleusercontent.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const b64u = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function gtoken(over = {}) {
  const h = b64u({ alg: 'RS256', kid: 'k1', typ: 'JWT' }), p = b64u({ iss: 'https://accounts.google.com', aud: CID, sub: 'g-123', name: 'Νίκος Τ', email: 'n@example.com', email_verified: true, exp: Math.floor(Date.now() / 1000) + 600, ...over });
  return `${h}.${p}.${crypto.sign('sha256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`;
}
const tgSent = [];
globalThis.fetch = async (u, init = {}) => {
  u = String(u);
  if (u.startsWith('https://www.googleapis.com/oauth2/v3/certs')) return new Response(JSON.stringify({ keys: [JWK] }));
  if (u.includes('api.telegram.org')) { if (u.endsWith('/sendMessage')) tgSent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true, result: true })); }
  throw new Error('δίκτυο: ' + u);
};
const env = { DB: makeD1(new URL('../workers/account/schema.sql', import.meta.url)), GOOGLE_CLIENT_ID: CID, FB_APP_ID: '1', ALLOWED_ORIGINS: ORIGIN, TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_BOT: 'eubasketball_bot' };
const waits = [];
const ctx = { waitUntil: p => waits.push(p) };
const call = (path, { method = 'GET', body, token, origin = ORIGIN, headers = {} } = {}) => W.fetch(new Request('https://bs-account.x.workers.dev' + path, { method, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers } }), env, ctx);

test('Google: υπογραφή, αποδέκτης, λήξη', async () => {
  assert.equal((await verifyGoogle(gtoken(), CID, [JWK])).sub, 'g-123');
  await assert.rejects(verifyGoogle(gtoken({ aud: 'άλλος' }), CID, [JWK]), /audience/);
  await assert.rejects(verifyGoogle(gtoken({ exp: 10 }), CID, [JWK]), /expired/);
  const t = gtoken().split('.'); t[1] = b64u({ iss: 'accounts.google.com', aud: CID, sub: 'hacker', exp: 9e9 });
  await assert.rejects(verifyGoogle(t.join('.'), CID, [JWK]), /signature/);
});

test('ροή: σύνδεση → ομάδα → ρυθμίσεις → Telegram → push → διαγραφή', async () => {
  assert.equal((await call('/me', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/me')).status, 401);
  const cfg = await (await call('/config')).json();
  assert.equal(cfg.google, CID); assert.equal(cfg.facebook, null); assert.ok(cfg.vapid.length > 60);
  const { token } = await (await call('/auth/google', { method: 'POST', body: { credential: gtoken() } })).json();
  assert.ok(token);
  const row = env.DB.raw.prepare('SELECT hash FROM sessions').get(); assert.notEqual(row.hash, token, 'στη βάση μόνο το hash');
  const me = await (await call('/me', { token })).json();
  assert.equal(me.name, 'Νίκος Τ'); assert.equal(me.telegram, false); assert.equal(me.prefs.kinds.injury, true);
  // ίδιος χρήστης ξανά → ίδιος λογαριασμός
  await call('/auth/google', { method: 'POST', body: { credential: gtoken() } });
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
  // ομάδα
  const data = { teams: [{ name: 'Η ομάδα μου', roster: ['1', '2'] }], active: 0 };
  assert.equal((await call('/state', { method: 'PUT', token, body: { data, updated: Date.now() } })).status, 200);
  assert.deepEqual((await (await call('/state', { token })).json()).data, data);
  assert.equal((await call('/state', { method: 'PUT', token, body: { data: { x: 1 } } })).status, 400);
  assert.equal((await call('/state', { method: 'PUT', token, body: JSON.stringify({ data: { teams: [], pad: 'x'.repeat(70000) } }) })).status, 413);
  // ρυθμίσεις: μόνο γνωστά πεδία
  const pr = await (await call('/prefs', { method: 'PUT', token, body: { lang: 'tr', kinds: { lock: false }, evil: 1 } })).json();
  assert.deepEqual(pr.prefs, { lang: 'tr', kinds: { injury: true, captain: true, swap: true, lock: false }, email: false });
  // Telegram: κωδικός → /start από τον χρήστη → συνδεδεμένο
  const { url } = await (await call('/tg/link', { method: 'POST', token })).json();
  const code = url.split('start=')[1];
  assert.match(url, /^https:\/\/t\.me\/eubasketball_bot\?start=/);
  assert.equal((await call('/tg/hook', { method: 'POST', body: { message: { chat: { id: 42, type: 'private' }, text: '/start ' + code } } })).status, 403, 'χωρίς secret του Telegram');
  const sec = await (async () => { const h = crypto.createHash('sha256').update('tg-webhook:123:abc').digest('base64url'); return h.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64); })();
  await call('/tg/hook', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': sec }, body: { message: { chat: { id: 42, type: 'private' }, from: { language_code: 'el' }, text: '/start ' + code } } });
  assert.equal((await (await call('/me', { token })).json()).telegram, true);
  assert.match(tgSent.at(-1).text, /Συνδέθηκες/);
  await call('/tg/hook', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': sec }, body: { message: { chat: { id: 42, type: 'private' }, text: '/start ' + code } } });
  assert.match(tgSent.at(-1).text, /έληξε|expired/, 'ο κωδικός δεν ξαναχρησιμοποιείται');
  // push: εγγραφή και παραλαβή κειμένου από το service worker
  await call('/push/sub', { method: 'POST', token, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' } });
  const sid = env.DB.raw.prepare('SELECT id FROM push_subs').get().id;
  env.DB.raw.prepare('INSERT INTO push_queue (sub_id, text, url, created) VALUES (?, ?, ?, 0)').run(sid, '🚑 test', 'https://basketballstats.eu/fantasy/manager/');
  const pend = await (await call('/push/pending?ep=' + encodeURIComponent('https://fcm.googleapis.com/fcm/send/abc'), { origin: '' })).json();
  assert.equal(pend.items[0].text, '🚑 test');
  assert.equal((await (await call('/push/pending?ep=' + encodeURIComponent('https://fcm.googleapis.com/fcm/send/abc'))).json()).items.length, 0, 'μία φορά');
  // διαγραφή: τίποτα δεν μένει
  assert.equal((await call('/me', { method: 'DELETE', token })).status, 200);
  for (const t of ['users', 'sessions', 'state', 'telegram', 'push_subs', 'push_queue', 'tg_codes', 'sent']) assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, 0, t);
  assert.equal((await call('/me', { token })).status, 401);
  await Promise.allSettled(waits);
});

test('VAPID: κλειδί του worker → υπογραφή ES256 στο Actions (node:crypto) που επαληθεύεται', async () => {
  const { vapidKeys } = await import('../workers/account/worker.js');
  const v = await vapidKeys(env.DB);
  assert.deepEqual(await vapidKeys(env.DB), v, 'ίδιο κλειδί κάθε φορά');
  const key = crypto.createPrivateKey({ key: v.jwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from('a.b'), { key, dsaEncoding: 'ieee-p1363' });
  const raw = Buffer.from(v.pub, 'base64url');
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from('a.b'), { key: pub, dsaEncoding: 'ieee-p1363' }, sig));
  assert.equal(raw.length, 65);
});
