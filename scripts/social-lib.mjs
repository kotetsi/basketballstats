// Κοινές συναρτήσεις ανάρτησης για τα social του BasketballStats. Κάθε δίκτυο λειτουργεί μόνο αν υπάρχουν τα secrets του·
// αλλιώς παραλείπεται χωρίς σφάλμα. Κανένα μήνυμα σφάλματος δεν περιέχει token.
//   Meta (Facebook Σελίδα + Instagram): META_PAGE_TOKEN, FB_PAGE_ID, IG_USER_ID
//   Threads: THREADS_TOKEN (long-lived token χρήστη Threads, δικαιώματα threads_basic + threads_content_publish)
//   Telegram: TELEGRAM_TOKEN, TELEGRAM_CHAT
//   Bluesky: BSKY_HANDLE, BSKY_APP_PASSWORD (App Password από Ρυθμίσεις → Privacy and security → App passwords)
//   X: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET (OAuth 1.0a, δικαίωμα Read and write)
//   Viber κανάλι: VIBER_CHANNEL_TOKEN (Channel → Settings → Developer tools)
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const E = process.env, clean = v => String(v || '').trim();
const TG = () => clean(E.TELEGRAM_TOKEN).replace(/\s+/g, '');   // όπως στο scripts/telegram.mjs: το secret μπορεί να έχει κενά/αλλαγές γραμμής
const V = 'v21.0', G = `https://graph.facebook.com/${V}`;
const META = (clean(E.META_PAGE_TOKEN).replace(/\s+/g, '').match(/EAA[A-Za-z0-9]+/) || [''])[0];
const PAGE = clean(E.FB_PAGE_ID), IG = clean(E.IG_USER_ID);
const wait = ms => new Promise(r => setTimeout(r, ms));
const jfetch = async (url, opt, label) => {
  let r; try { r = await fetch(url, opt); } catch (e) { throw new Error(`${label}: ${e.message}${e.cause ? ' (' + (e.cause.code || e.cause.message) + ')' : ''}`); }
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; }
  if (!r.ok || j.error || j.errors) throw new Error(`${label}: ${j.error?.message || j.errors?.[0]?.message || j.detail || j.message || j.raw || r.status}`);
  return j;
};

// ---------- Meta: Facebook + Instagram ----------
const mpost = (p, params) => jfetch(`${G}/${p}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: META }) }, p);
const mget = (p, params) => jfetch(`${G}/${p}?${new URLSearchParams({ ...params, access_token: META })}`, {}, p);
async function rupload(url, buf) {
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `OAuth ${META}`, offset: '0', file_size: String(buf.length) }, body: buf });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error || j.success === false) throw new Error(`upload: ${j.error?.message || j.debug_info?.message || r.status}`);
}
async function igPublish(id) {
  for (let i = 0; i < 40; i++) {
    const s = await mget(id, { fields: 'status_code,status' });
    if (s.status_code === 'FINISHED') return mpost(`${IG}/media_publish`, { creation_id: id });
    if (s.status_code === 'ERROR') throw new Error(`Instagram: ${s.status}`);
    await wait(5000);
  }
  throw new Error('Instagram: το βίντεο δεν ετοιμάστηκε');
}
const igVideo = async (type, vid, caption) => {
  const c = await mpost(`${IG}/media`, { media_type: type, upload_type: 'resumable', ...(type === 'REELS' ? { caption, share_to_feed: 'true' } : {}) });
  await rupload(c.uri || `https://rupload.facebook.com/ig-api-upload/${V}/${c.id}`, vid); return igPublish(c.id);
};
const fbVideo = async (edge, vid, finish) => {
  const s = await mpost(`${PAGE}/${edge}`, { upload_phase: 'start' });
  await rupload(s.upload_url || `https://rupload.facebook.com/video-upload/${V}/${s.video_id}`, vid);
  return mpost(`${PAGE}/${edge}`, { upload_phase: 'finish', video_id: s.video_id, ...finish });
};

// ---------- X: OAuth 1.0a ----------
const pct = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function xAuth(method, url) {
  const o = { oauth_consumer_key: clean(E.X_API_KEY), oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: clean(E.X_ACCESS_TOKEN), oauth_version: '1.0' };
  const base = [method, pct(url), pct(Object.keys(o).sort().map(k => `${pct(k)}=${pct(o[k])}`).join('&'))].join('&');
  o.oauth_signature = crypto.createHmac('sha1', `${pct(clean(E.X_API_SECRET))}&${pct(clean(E.X_ACCESS_SECRET))}`).update(base).digest('base64');
  return 'OAuth ' + Object.keys(o).sort().map(k => `${pct(k)}="${pct(o[k])}"`).join(', ');
}

/** Ποια δίκτυα είναι συνδεδεμένα (έχουν secrets). */
export const NETS = {
  fb: !!(META && PAGE), ig: !!(META && IG), threads: !!clean(E.THREADS_TOKEN), telegram: !!(TG() && clean(E.TELEGRAM_CHAT)),
  bluesky: !!(clean(E.BSKY_HANDLE) && clean(E.BSKY_APP_PASSWORD)), x: !!(clean(E.X_API_KEY) && clean(E.X_API_SECRET) && clean(E.X_ACCESS_TOKEN) && clean(E.X_ACCESS_SECRET)), viber: !!clean(E.VIBER_CHANNEL_TOKEN),
};

/**
 * Μία ανάρτηση σε ένα δίκτυο. p = { text, short, imageUrl, imageFile, videoFile, link, kinds }
 * text: πλήρες κείμενο · short: σύντομο (X/Bluesky/Viber) · kinds για fb/ig: ['post','reel','story']
 */
export async function postTo(net, p) {
  const img = p.imageFile ? await fs.readFile(p.imageFile) : null, vid = p.videoFile ? await fs.readFile(p.videoFile) : null;
  if (net === 'fb' || net === 'ig') {
    const done = [];
    for (const k of p.kinds || ['post']) {
      if (k === 'post') done.push(net === 'fb' ? await mpost(`${PAGE}/photos`, { url: p.imageUrl, caption: p.text })
        : await (async () => { const c = await mpost(`${IG}/media`, { image_url: p.imageUrl, caption: p.textIg || p.text }); for (let i = 0; ; i++) { try { return await mpost(`${IG}/media_publish`, { creation_id: c.id }); } catch (e) { if (i === 9) throw e; await wait(3000); } } })());
      if (k === 'reel' && vid) done.push(net === 'fb' ? await fbVideo('video_reels', vid, { video_state: 'PUBLISHED', description: p.text }) : await igVideo('REELS', vid, p.textIg || p.text));
      if (k === 'story' && vid) done.push(net === 'fb' ? await fbVideo('video_stories', vid, {}) : await igVideo('STORIES', vid));
    }
    return done.length;
  }
  if (net === 'threads') {
    const T = 'https://graph.threads.net/v1.0', tok = clean(E.THREADS_TOKEN);
    const c = await jfetch(`${T}/me/threads`, { method: 'POST', body: new URLSearchParams({ media_type: 'IMAGE', image_url: p.imageUrl, text: (p.textThreads || p.text).slice(0, 500), access_token: tok }) }, 'threads');
    for (let i = 0; ; i++) { try { return await jfetch(`${T}/me/threads_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: c.id, access_token: tok }) }, 'threads_publish'); } catch (e) { if (i === 9) throw e; await wait(4000); } }
  }
  if (net === 'telegram') {
    const fd = new FormData(); fd.append('chat_id', clean(E.TELEGRAM_CHAT)); fd.append('caption', p.text.slice(0, 1024)); fd.append('photo', new Blob([img], { type: 'image/png' }), 'card.png');
    return jfetch(`https://api.telegram.org/bot${TG()}/sendPhoto`, { method: 'POST', body: fd }, 'telegram');
  }
  if (net === 'bluesky') {
    const B = 'https://bsky.social/xrpc';
    const s = await jfetch(`${B}/com.atproto.server.createSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: clean(E.BSKY_HANDLE), password: clean(E.BSKY_APP_PASSWORD) }) }, 'bluesky login');
    const auth = { Authorization: `Bearer ${s.accessJwt}` };
    const b = await jfetch(`${B}/com.atproto.repo.uploadBlob`, { method: 'POST', headers: { ...auth, 'content-type': 'image/png' }, body: img }, 'bluesky upload');
    const text = (p.short || p.text).slice(0, 290), enc = new TextEncoder(), facets = [];
    for (const [needle, uri] of [[p.linkText || 'basketballstats.eu', p.link || 'https://basketballstats.eu']]) {
      const i = text.indexOf(needle); if (i < 0) continue;
      const start = enc.encode(text.slice(0, i)).length; facets.push({ index: { byteStart: start, byteEnd: start + enc.encode(needle).length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri }] });
    }
    return jfetch(`${B}/com.atproto.repo.createRecord`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record: { $type: 'app.bsky.feed.post', text, facets, createdAt: new Date().toISOString(), embed: { $type: 'app.bsky.embed.images', images: [{ alt: p.alt || text.slice(0, 200), image: b.blob }] } } }) }, 'bluesky post');
  }
  if (net === 'x') {
    const up = 'https://api.x.com/2/media/upload', fd = new FormData();
    fd.append('media', new Blob([img], { type: 'image/png' }), 'card.png'); fd.append('media_category', 'tweet_image');
    const m = await jfetch(up, { method: 'POST', headers: { Authorization: xAuth('POST', up) }, body: fd }, 'x media');
    const tw = 'https://api.x.com/2/tweets', mid = m.data?.id || m.media_id_string;
    // χωρίς link στο κείμενο: το X χρεώνει πολύ περισσότερο τις αναρτήσεις με URL
    return jfetch(tw, { method: 'POST', headers: { Authorization: xAuth('POST', tw), 'content-type': 'application/json' }, body: JSON.stringify({ text: (p.short || p.text).replace(/https?:\/\/\S+/g, '').slice(0, 270), media: { media_ids: [mid] } }) }, 'x tweet');
  }
  if (net === 'viber') {
    const H = { 'X-Viber-Auth-Token': clean(E.VIBER_CHANNEL_TOKEN), 'content-type': 'application/json' };
    const info = await jfetch('https://chatapi.viber.com/pa/get_account_info', { method: 'POST', headers: H, body: '{}' }, 'viber info');
    if (info.status && info.status !== 0) throw new Error(`viber: ${info.status_message}`);
    const from = (info.members || []).find(m => m.role === 'superadmin')?.id || info.members?.[0]?.id;
    const r = await jfetch('https://chatapi.viber.com/pa/post', { method: 'POST', headers: H, body: JSON.stringify({ from, type: 'picture', text: (p.short || p.text).slice(0, 768), media: p.imageUrl }) }, 'viber post');
    if (r.status && r.status !== 0) throw new Error(`viber: ${r.status_message}`);
    return r;
  }
  throw new Error('άγνωστο δίκτυο ' + net);
}

/** Έλεγχος σύνδεσης χωρίς ανάρτηση: επιστρέφει το όνομα του λογαριασμού/καναλιού ή πετάει σφάλμα. */
export async function checkNet(net) {
  if (net === 'viber') {
    const info = await jfetch('https://chatapi.viber.com/pa/get_account_info', { method: 'POST', headers: { 'X-Viber-Auth-Token': clean(E.VIBER_CHANNEL_TOKEN), 'content-type': 'application/json' }, body: '{}' }, 'viber info');
    if (info.status && info.status !== 0) throw new Error(`viber: ${info.status_message}`);
    return `${info.name} (${info.subscribers_count ?? 0} συνδρομητές)`;
  }
  if (net === 'threads') { const j = await jfetch(`https://graph.threads.net/v1.0/me?fields=username&access_token=${clean(E.THREADS_TOKEN)}`, {}, 'threads'); return '@' + j.username; }
  if (net === 'bluesky') { const s = await jfetch('https://bsky.social/xrpc/com.atproto.server.createSession', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: clean(E.BSKY_HANDLE), password: clean(E.BSKY_APP_PASSWORD) }) }, 'bluesky'); return '@' + s.handle; }
  if (net === 'fb') { const j = await mget(PAGE, { fields: 'name,followers_count,fan_count' }); return `${j.name} (${j.followers_count ?? j.fan_count ?? '?'} ακόλουθοι)`; }
  if (net === 'ig') { const j = await mget(IG, { fields: 'username,followers_count,media_count' }); return `@${j.username} (${j.followers_count ?? '?'} ακόλουθοι, ${j.media_count ?? '?'} αναρτήσεις)`; }
  if (net === 'telegram') { const q = `chat_id=${encodeURIComponent(clean(E.TELEGRAM_CHAT))}`, B = `https://api.telegram.org/bot${TG()}`; const j = await jfetch(`${B}/getChat?${q}`, {}, 'telegram'); const n = await jfetch(`${B}/getChatMemberCount?${q}`, {}, 'telegram').catch(() => ({})); return `${j.result?.title} (${n.result ?? '?'} συνδρομητές)`; }
  if (net === 'x') { const u = 'https://api.x.com/2/users/me'; const j = await jfetch(u, { headers: { Authorization: xAuth('GET', u) } }, 'x'); return '@' + j.data?.username; }
  return 'ok';
}
