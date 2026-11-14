// Λογαριασμοί χρηστών του basketballstats.eu: σύνδεση με Google/Facebook, αποθήκευση της ομάδας Fantasy,
// σύνδεση Telegram και ειδοποιήσεις στον browser. Οι ίδιες οι ειδοποιήσεις υπολογίζονται στο GitHub Actions
// (scripts/account-alerts.mjs), ώστε ο worker να μένει μικρός και μέσα στα όρια του δωρεάν πλάνου.
//
// Δεν κρατάμε κωδικούς. Από Google/Facebook παίρνουμε μόνο: αναγνωριστικό, όνομα, email (αν το δώσει ο πάροχος).
// Συνεδρία: τυχαίο token στον browser (localStorage)· στη βάση μόνο το SHA-256 του.
//
// env: DB (D1) · GOOGLE_CLIENT_ID · FB_APP_ID · FB_APP_SECRET (secret) · TELEGRAM_BOT_TOKEN (secret) · ALLOWED_ORIGINS · SITE

const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ub64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const rand = n => b64u(crypto.getRandomValues(new Uint8Array(n)));
const sha = async s => b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const now = () => Math.floor(Date.now() / 1000);
const MAX_STATE = 64 * 1024, SESSION_DAYS = 180;
const LANGS = ['el', 'en', 'es', 'sr', 'tr'];

function cors(req, env) {
  const o = req.headers.get('origin') || '', ok = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return ok.includes(o) ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'access-control-max-age': '86400', vary: 'origin' } : null;
}

// ---------- Google: έλεγχος ID token (RS256) με τα δημόσια κλειδιά της Google
let GKEYS = null, GKEYS_AT = 0;
async function googleKeys() {
  if (GKEYS && Date.now() - GKEYS_AT < 3600e3) return GKEYS;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs'); GKEYS = (await r.json()).keys; GKEYS_AT = Date.now(); return GKEYS;
}
export async function verifyGoogle(token, clientId, keys) {
  const [h, p, s] = String(token || '').split('.');
  if (!s) throw new Error('bad token');
  const head = JSON.parse(new TextDecoder().decode(ub64(h))), pay = JSON.parse(new TextDecoder().decode(ub64(p)));
  const jwk = (keys || await googleKeys()).find(k => k.kid === head.kid);
  if (!jwk || head.alg !== 'RS256') throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, ub64(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('bad signature');
  if (pay.aud !== clientId) throw new Error('wrong audience');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(pay.iss)) throw new Error('wrong issuer');
  if (!(pay.exp > now())) throw new Error('expired');
  return { sub: pay.sub, name: pay.name || pay.given_name || '', email: pay.email_verified ? pay.email : null };
}

// ---------- Facebook: έλεγχος access token μέσω debug_token (πρέπει να έχει εκδοθεί για τη δική μας εφαρμογή)
async function verifyFacebook(token, env) {
  const d = await (await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(env.FB_APP_ID + '|' + env.FB_APP_SECRET)}`)).json();
  if (!d?.data?.is_valid || String(d.data.app_id) !== String(env.FB_APP_ID)) throw new Error('invalid facebook token');
  const me = await (await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,email&access_token=${encodeURIComponent(token)}`)).json();
  if (!me?.id || me.id !== String(d.data.user_id)) throw new Error('facebook user mismatch');
  return { sub: me.id, name: me.name || '', email: me.email || null };
}

async function login(env, provider, who) {
  const db = env.DB;
  let u = await db.prepare('SELECT id FROM users WHERE provider = ? AND sub = ?').bind(provider, who.sub).first();
  if (!u) {
    const id = rand(12);
    await db.prepare('INSERT INTO users (id, provider, sub, name, email, created, prefs) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, provider, who.sub, who.name, who.email, now(), JSON.stringify({ lang: 'el', kinds: { injury: true, captain: true, swap: true, lock: true }, email: false })).run();
    u = { id };
  } else await db.prepare('UPDATE users SET name = ?, email = COALESCE(?, email) WHERE id = ?').bind(who.name, who.email, u.id).run();
  const tok = rand(32);
  await db.prepare('INSERT INTO sessions (hash, user_id, exp) VALUES (?, ?, ?)').bind(await sha(tok), u.id, now() + SESSION_DAYS * 86400).run();
  return tok;
}
async function auth(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') || ''); if (!m) return null;
  const s = await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.exp > ?').bind(await sha(m[1]), now()).first();
  return s || null;
}
const pub = async (env, u) => {
  const tg = await env.DB.prepare('SELECT 1 FROM telegram WHERE user_id = ?').bind(u.id).first();
  const pu = await env.DB.prepare('SELECT COUNT(*) n FROM push_subs WHERE user_id = ?').bind(u.id).first();
  return { name: u.name, provider: u.provider, email: !!u.email, prefs: JSON.parse(u.prefs || '{}'), telegram: !!tg, push: pu?.n || 0, emailAvailable: !!env.BREVO_KEY };
};
function cleanPrefs(p, old = {}) {
  const k = p?.kinds || {};
  return { lang: LANGS.includes(p?.lang) ? p.lang : old.lang || 'el', kinds: Object.fromEntries(['injury', 'captain', 'swap', 'lock'].map(x => [x, k[x] !== false])), email: !!p?.email };
}

// ---------- Web Push χωρίς περιεχόμενο: στέλνουμε μόνο «ξύπνα» (VAPID)· το service worker φέρνει το κείμενο από /push/pending
export async function vapidKeys(db) {
  const r = await db.prepare("SELECT v FROM config WHERE k = 'vapid'").first();
  if (r) return JSON.parse(r.v);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey), raw = await crypto.subtle.exportKey('raw', kp.publicKey);
  const v = { jwk, pub: b64u(raw) };
  await db.prepare("INSERT OR IGNORE INTO config (k, v) VALUES ('vapid', ?)").bind(JSON.stringify(v)).run();
  return JSON.parse((await db.prepare("SELECT v FROM config WHERE k = 'vapid'").first()).v);
}

// ---------- Telegram: /start <κωδικός> συνδέει τον χρήστη με το chat του· /stop αποσυνδέει
const TGT = {
  el: { ok: '✅ Συνδέθηκες! Θα σου στέλνω εδώ ειδοποιήσεις για την ομάδα σου στο Fantasy (τραυματίες, αρχηγός, αλλαγές, λήξη γύρου). Για διακοπή γράψε /stop.', bad: 'Ο σύνδεσμος έληξε. Πάτα ξανά «Σύνδεση Telegram» στο basketballstats.eu.', stop: 'Σταμάτησαν οι ειδοποιήσεις. Μπορείς να τις ξαναενεργοποιήσεις από το basketballstats.eu.', hi: 'Γεια! Για προσωπικές ειδοποιήσεις Fantasy, συνδέσου στο basketballstats.eu και πάτα «Σύνδεση Telegram». Τα picks δημοσιεύονται στο κανάλι @eubasketballstats_eu.' },
  en: { ok: '✅ Connected! I will send you alerts about your Fantasy team here (injuries, captain, transfers, round lock). Send /stop to unsubscribe.', bad: 'This link has expired. Tap “Connect Telegram” again on basketballstats.eu.', stop: 'Alerts stopped. You can turn them back on at basketballstats.eu.', hi: 'Hi! For personal Fantasy alerts, sign in at basketballstats.eu and tap “Connect Telegram”.' },
};
async function tgSend(env, chat, text) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }) });
}
const tgSecret = env => sha('tg-webhook:' + env.TELEGRAM_BOT_TOKEN).then(s => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64));
async function tgEnsureWebhook(env, origin) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const want = origin + '/tg/hook', cur = await env.DB.prepare("SELECT v FROM config WHERE k = 'tg_hook'").first();
  if (cur?.v === want) return;
  const r = await (await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: want, secret_token: await tgSecret(env), allowed_updates: ['message'] }) })).json();
  if (r.ok) await env.DB.prepare("INSERT OR REPLACE INTO config (k, v) VALUES ('tg_hook', ?)").bind(want).run();
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname, h = cors(req, env);
    if (p === '/tg/hook') {                                     // από τους servers του Telegram (όχι από browser)
      if (req.method !== 'POST' || req.headers.get('x-telegram-bot-api-secret-token') !== await tgSecret(env)) return new Response('no', { status: 403 });
      const up = await req.json().catch(() => ({})), m = up.message;
      if (!m?.chat?.id || m.chat.type !== 'private') return new Response('ok');
      const lg = String(m.from?.language_code || '').startsWith('el') ? 'el' : 'en', T = TGT[lg], text = String(m.text || '').trim();
      const st = /^\/start\s+([A-Za-z0-9_-]{8,64})$/.exec(text);
      if (st) {
        const c = await env.DB.prepare('SELECT user_id FROM tg_codes WHERE code = ? AND exp > ?').bind(st[1], now()).first();
        if (!c) { await tgSend(env, m.chat.id, T.bad); return new Response('ok'); }
        await env.DB.batch([env.DB.prepare('INSERT OR REPLACE INTO telegram (user_id, chat_id, created) VALUES (?, ?, ?)').bind(c.user_id, String(m.chat.id), now()), env.DB.prepare('DELETE FROM tg_codes WHERE code = ?').bind(st[1])]);
        await tgSend(env, m.chat.id, T.ok);
      } else if (text === '/stop') { await env.DB.prepare('DELETE FROM telegram WHERE chat_id = ?').bind(String(m.chat.id)).run(); await tgSend(env, m.chat.id, T.stop); }
      else await tgSend(env, m.chat.id, T.hi);
      return new Response('ok');
    }
    if (p === '/push/pending' && req.method === 'GET') {        // από το service worker: το κείμενο της τελευταίας ειδοποίησης
      const ep = url.searchParams.get('ep') || '';
      const sub = await env.DB.prepare('SELECT id FROM push_subs WHERE endpoint = ?').bind(ep).first();
      if (!sub) return J({ items: [] });
      const rows = (await env.DB.prepare('SELECT id, text, url FROM push_queue WHERE sub_id = ? ORDER BY id DESC LIMIT 5').bind(sub.id).all()).results || [];
      if (rows.length) await env.DB.prepare('DELETE FROM push_queue WHERE sub_id = ?').bind(sub.id).run();
      return J({ items: rows.map(r => ({ text: r.text, url: r.url })) }, 200, { 'access-control-allow-origin': '*' });
    }
    if (!h) return J({ error: 'origin' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const R = (o, s = 200) => J(o, s, h);
    try {
      if (p === '/config') return R({ google: env.GOOGLE_CLIENT_ID || null, facebook: env.FB_APP_SECRET ? env.FB_APP_ID : null, telegram: !!env.TELEGRAM_BOT_TOKEN, vapid: (await vapidKeys(env.DB)).pub, bot: env.TELEGRAM_BOT || null });
      if (p === '/auth/google' && req.method === 'POST') {
        if (!env.GOOGLE_CLIENT_ID) return R({ error: 'google_off' }, 400);
        const { credential } = await req.json(); const who = await verifyGoogle(credential, env.GOOGLE_CLIENT_ID);
        return R({ token: await login(env, 'google', who) });
      }
      if (p === '/auth/facebook' && req.method === 'POST') {
        if (!env.FB_APP_SECRET) return R({ error: 'facebook_off' }, 400);
        const { accessToken } = await req.json(); const who = await verifyFacebook(accessToken, env);
        return R({ token: await login(env, 'facebook', who) });
      }
      const u = await auth(req, env);
      if (!u) return R({ error: 'auth' }, 401);
      ctx.waitUntil(tgEnsureWebhook(env, url.origin).catch(() => { }));
      if (p === '/me' && req.method === 'GET') return R(await pub(env, u));
      if (p === '/logout' && req.method === 'POST') { const m = /^Bearer (.+)$/.exec(req.headers.get('authorization')); await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha(m[1])).run(); return R({ ok: true }); }
      if (p === '/me' && req.method === 'DELETE') {                 // διαγραφή λογαριασμού: όλα τα δεδομένα, αμέσως
        const id = u.id, s = sql => env.DB.prepare(sql).bind(id);
        const subs = (await env.DB.prepare('SELECT id FROM push_subs WHERE user_id = ?').bind(id).all()).results || [];
        await env.DB.batch([...subs.map(x => env.DB.prepare('DELETE FROM push_queue WHERE sub_id = ?').bind(x.id)), s('DELETE FROM push_subs WHERE user_id = ?'), s('DELETE FROM telegram WHERE user_id = ?'), s('DELETE FROM tg_codes WHERE user_id = ?'), s('DELETE FROM sent WHERE user_id = ?'), s('DELETE FROM state WHERE user_id = ?'), s('DELETE FROM sessions WHERE user_id = ?'), s('DELETE FROM users WHERE id = ?')]);
        return R({ ok: true });
      }
      if (p === '/prefs' && req.method === 'PUT') { const np = cleanPrefs(await req.json(), JSON.parse(u.prefs || '{}')); await env.DB.prepare('UPDATE users SET prefs = ? WHERE id = ?').bind(JSON.stringify(np), u.id).run(); return R({ prefs: np }); }
      if (p === '/state' && req.method === 'GET') { const r = await env.DB.prepare('SELECT data, updated FROM state WHERE user_id = ?').bind(u.id).first(); return R(r ? { data: JSON.parse(r.data), updated: r.updated } : { data: null, updated: 0 }); }
      if (p === '/state' && req.method === 'PUT') {
        const body = await req.text(); if (body.length > MAX_STATE) return R({ error: 'too_large' }, 413);
        const o = JSON.parse(body); if (!o || typeof o.data !== 'object' || !Array.isArray(o.data?.teams)) return R({ error: 'bad_state' }, 400);
        const t = Math.min(Number(o.updated) || now() * 1000, Date.now() + 60e3);
        await env.DB.prepare('INSERT INTO state (user_id, data, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated = excluded.updated').bind(u.id, JSON.stringify(o.data), t).run();
        return R({ ok: true, updated: t });
      }
      if (p === '/tg/link' && req.method === 'POST') {
        const code = rand(16); await env.DB.prepare('INSERT INTO tg_codes (code, user_id, exp) VALUES (?, ?, ?)').bind(code, u.id, now() + 1800).run();
        return R({ url: `https://t.me/${env.TELEGRAM_BOT || 'eubasketball_bot'}?start=${code}` });
      }
      if (p === '/tg' && req.method === 'DELETE') { await env.DB.prepare('DELETE FROM telegram WHERE user_id = ?').bind(u.id).run(); return R({ ok: true }); }
      if (p === '/push/sub' && req.method === 'POST') {
        const { endpoint } = await req.json(); if (!/^https:\/\//.test(endpoint || '') || endpoint.length > 1000) return R({ error: 'bad_sub' }, 400);
        await env.DB.prepare('INSERT INTO push_subs (user_id, endpoint, created) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id').bind(u.id, endpoint, now()).run();
        return R({ ok: true });
      }
      if (p === '/push/sub' && req.method === 'DELETE') { const { endpoint } = await req.json(); await env.DB.prepare('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?').bind(u.id, endpoint).run(); return R({ ok: true }); }
      return R({ error: 'not_found' }, 404);
    } catch (e) { return R({ error: 'failed', detail: String(e.message || e).slice(0, 120) }, 400); }
  },
};
