// Προσωπικές ειδοποιήσεις Fantasy για τους συνδεδεμένους χρήστες. Τρέχει στο GitHub Actions κάθε 30 λεπτά.
//   1. διαβάζει τις ομάδες και τις ρυθμίσεις από τη βάση των λογαριασμών (Cloudflare D1, μέσω του API της Cloudflare)
//   2. διαβάζει τα τρέχοντα δεδομένα του site (εκτιμήσεις, τραυματίες, προθεσμία)
//   3. στέλνει ό,τι δεν έχει ήδη σταλεί: Telegram (προσωπικό μήνυμα από το bot) και ειδοποίηση browser (Web Push)
//
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID   πρόσβαση στη βάση (ίδια με το deploy του worker)
//   TELEGRAM_TOKEN                                 το bot @eubasketball_bot
//   ALERTS_DRY=1                                   μόνο εμφάνιση, χωρίς αποστολή και χωρίς εγγραφή
import crypto from 'node:crypto';
import { userAlerts } from '../src/account/alerts.mjs';

const SITE = process.env.SITE || 'https://basketballstats.eu';
const clean = v => String(v || '').replace(/[\s"']/g, '');
const tok = s => { s = String(s || ''); const b = /Bearer\s+([A-Za-z0-9_-]+)/.exec(s); return b ? b[1] : (s.match(/[A-Za-z0-9_-]+/g) || []).sort((a, c) => c.length - a.length)[0] || ''; };
const CF = tok(process.env.CLOUDFLARE_API_TOKEN), ACC = clean(process.env.CLOUDFLARE_ACCOUNT_ID);
const TG = String(process.env.TELEGRAM_TOKEN || '').replace(/\s+/g, '');
const DRY = process.env.ALERTS_DRY === '1';
if (!CF || !ACC) { console.log('Ειδοποιήσεις: δεν έχει οριστεί λογαριασμός Cloudflare, παράλειψη.'); process.exit(0); }

const api = async (p, init = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}${p}`, { ...init, headers: { authorization: `Bearer ${CF}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const j = await r.json(); if (!j.success) throw new Error(`Cloudflare ${p}: ${JSON.stringify(j.errors).slice(0, 200)}`); return j.result;
};
const dbs = await api('/d1/database?name=bs-account');
const DB = dbs.find(d => d.name === 'bs-account');
if (!DB) { console.log('Ειδοποιήσεις: η βάση bs-account δεν υπάρχει ακόμα (δεν έγινε deploy), παράλειψη.'); process.exit(0); }
const q = async (sql, params = []) => (await api(`/d1/database/${DB.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql, params }) }))[0].results;

const now = Date.now(), sec = Math.floor(now / 1000);
const [D, NEWS] = await Promise.all([
  fetch(`${SITE}/api/fantasy/projections/latest.json?t=${now}`).then(r => r.json()),
  fetch(`${SITE}/api/fantasy/news.json?t=${now}`).then(r => r.json()).then(j => j.items || []).catch(() => []),
]);
const users = await q('SELECT u.id, u.prefs, s.data, t.chat_id FROM users u JOIN state s ON s.user_id = u.id LEFT JOIN telegram t ON t.user_id = u.id');
const subs = await q('SELECT id, user_id, endpoint FROM push_subs');
const sentRows = await q('SELECT user_id, key FROM sent WHERE ts > ?', [sec - 60 * 86400]);
const sent = new Set(sentRows.map(r => r.user_id + ' ' + r.key));
const subsBy = new Map(); for (const s of subs) (subsBy.get(s.user_id) || subsBy.set(s.user_id, []).get(s.user_id)).push(s);

// ---- Web Push (VAPID, χωρίς περιεχόμενο): το service worker φέρνει το κείμενο από τον worker
const vrow = (await q("SELECT v FROM config WHERE k = 'vapid'"))[0];
const V = vrow ? JSON.parse(vrow.v) : null;
const vkey = V ? crypto.createPrivateKey({ key: V.jwk, format: 'jwk' }) : null;
const b64u = b => Buffer.from(b).toString('base64url');
function vapidJWT(endpoint) {
  const aud = new URL(endpoint).origin;
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })), p = b64u(JSON.stringify({ aud, exp: sec + 12 * 3600, sub: SITE }));
  const sig = crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key: vkey, dsaEncoding: 'ieee-p1363' });
  return `${h}.${p}.${b64u(sig)}`;
}
async function push(sub, a) {
  await q('INSERT INTO push_queue (sub_id, text, url, created) VALUES (?, ?, ?, ?)', [sub.id, a.text, a.url, sec]);
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: a.kind === 'injury' || a.kind === 'lock' ? 'high' : 'normal', Authorization: `vapid t=${vapidJWT(sub.endpoint)}, k=${V.pub}`, 'Content-Length': '0' } });
  if (r.status === 404 || r.status === 410) { await q('DELETE FROM push_queue WHERE sub_id = ?', [sub.id]); await q('DELETE FROM push_subs WHERE id = ?', [sub.id]); return false; }
  if (!r.ok) throw new Error(`push ${r.status}`);
  return true;
}
async function telegram(chat, a) {
  const r = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: `${a.text}\n\n👉 ${a.go}: ${a.url}\n\n${a.note}`, disable_web_page_preview: true }) });
  const j = await r.json().catch(() => ({}));
  if (j.error_code === 403) { await q('DELETE FROM telegram WHERE chat_id = ?', [String(chat)]); return false; }   // ο χρήστης μπλόκαρε το bot
  if (!j.ok) throw new Error('Telegram: ' + (j.description || r.status));
  return true;
}

let nSent = 0, nUsers = 0, failed = 0;
for (const u of users) {
  let prefs = {}, state = null; try { prefs = JSON.parse(u.prefs || '{}'); state = JSON.parse(u.data); } catch { continue; }
  const ps = subsBy.get(u.id) || [];
  if (!u.chat_id && !ps.length) continue;                       // κανένα κανάλι: τίποτα να σταλεί (ούτε σημειώνεται)
  const A = userAlerts(state, D, NEWS, { prefs, now, base: SITE }).filter(a => !sent.has(u.id + ' ' + a.key));
  if (!A.length) continue;
  nUsers++;
  for (const a of A.slice(0, 4)) {                              // το πολύ 4 ανά εκτέλεση ανά χρήστη
    if (DRY) { console.log(`[δοκιμή] ${u.id} ${a.key}: ${a.text}`); continue; }
    let ok = false;
    try {
      if (u.chat_id && TG) ok = (await telegram(u.chat_id, a)) || ok;
      if (V) for (const s of ps) ok = (await push(s, a).catch(e => { console.error('push:', e.message); return false; })) || ok;
    } catch (e) { console.error('Ειδοποίηση:', e.message); failed++; }
    if (ok) { await q('INSERT OR IGNORE INTO sent (user_id, key, ts) VALUES (?, ?, ?)', [u.id, a.key, sec]); nSent++; }
  }
}
if (!DRY) {                                                     // καθαριότητα
  await q('DELETE FROM sent WHERE ts < ?', [sec - 60 * 86400]);
  await q('DELETE FROM sessions WHERE exp < ?', [sec]);
  await q('DELETE FROM tg_codes WHERE exp < ?', [sec]);
  await q('DELETE FROM push_queue WHERE created < ?', [sec - 3 * 86400]);
}
console.log(`Ειδοποιήσεις: ${users.length} χρήστες με ομάδα, ${nUsers} με κάτι νέο, ${nSent} αποστολές${failed ? `, ${failed} αποτυχίες` : ''} (αγωνιστική ${D.round}, προθεσμία ${D.deadline || '–'}).`);
if (failed) process.exit(1);
