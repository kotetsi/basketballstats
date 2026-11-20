// Μία ανάρτηση σε Σελίδα Facebook και Instagram: post (εικόνα), reel (βίντεο) και story (βίντεο) — για το «Στατιστικό της ημέρας» και δοκιμές.
//   IMAGE   εικόνα μέσα στο repo (post) — το Instagram τη διαβάζει από το δημόσιο raw URL του GitHub
//   VIDEO   κάθετο MP4 1080×1920 μέσα στο repo (reel, story) — ανεβαίνει απευθείας ως αρχείο (rupload), δεν χρειάζεται δημόσιο URL
//   CAPTION κείμενο (\n = νέα γραμμή)     NETS fb,ig     KINDS post,reel,story     SOCIAL_DRY=1 μόνο εμφάνιση
//   META_PAGE_TOKEN, FB_PAGE_ID, IG_USER_ID  όπως στο scripts/social.mjs
import fs from 'node:fs/promises';
const V = 'v21.0', G = `https://graph.facebook.com/${V}`, REPO = 'https://raw.githubusercontent.com/kotetsi/basketballstats/main/';
const TOKEN = (String(process.env.META_PAGE_TOKEN || '').replace(/\s+/g, '').match(/EAA[A-Za-z0-9]+/) || [''])[0];
const PAGE = String(process.env.FB_PAGE_ID || '').trim(), IG = String(process.env.IG_USER_ID || '').trim();
const IMAGE = String(process.env.IMAGE || '').replace(/^\/+/, ''), VIDEO = String(process.env.VIDEO || '').replace(/^\/+/, '');
const CAPTION = String(process.env.CAPTION || '').replace(/\\n/g, '\n');
const list = (v, d) => String(v || d).split(',').map(s => s.trim()).filter(Boolean);
const NETS = list(process.env.NETS, 'fb,ig'), KINDS = list(process.env.KINDS, 'post');
const DRY = process.env.SOCIAL_DRY === '1';
const img = IMAGE && REPO + IMAGE.split('/').map(encodeURIComponent).join('/');
if (KINDS.includes('post') && !IMAGE) { console.error('Για post χρειάζεται IMAGE.'); process.exit(1); }
if ((KINDS.includes('reel') || KINDS.includes('story')) && !VIDEO) { console.error('Για reel/story χρειάζεται VIDEO.'); process.exit(1); }
if (DRY) { console.log(`[δοκιμή] ${NETS.join('+')} · ${KINDS.join('+')}\n${img || ''}\n${VIDEO}\n\n${CAPTION}`); process.exit(0); }
if (!TOKEN) { console.error('Λείπει το META_PAGE_TOKEN.'); process.exit(1); }
const vid = VIDEO ? await fs.readFile(VIDEO) : null;

async function call(method, p, params) {
  const url = `${G}/${p}`, body = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${p}: ${j.error?.message || r.status}`);   // το μήνυμα της Meta δεν περιέχει το token
  return j;
}
const post = (p, params) => call('POST', p, params);
async function upload(uploadUrl, buf) {   // ανέβασμα του MP4 ως αρχείο
  const r = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: `OAuth ${TOKEN}`, offset: '0', file_size: String(buf.length) }, body: buf });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error || j.success === false) throw new Error(`upload: ${j.error?.message || j.debug_info?.message || r.status}`);
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function igPublish(id) {   // περιμένει να επεξεργαστεί το Instagram το βίντεο και μετά δημοσιεύει
  for (let i = 0; i < 40; i++) {
    const s = await call('GET', id, { fields: 'status_code,status' });
    if (s.status_code === 'FINISHED') return post(`${IG}/media_publish`, { creation_id: id });
    if (s.status_code === 'ERROR') throw new Error(`Instagram επεξεργασία: ${s.status}`);
    await wait(5000);
  }
  throw new Error('Instagram: το βίντεο δεν ετοιμάστηκε σε 200 δευτερόλεπτα');
}
async function igVideo(type) {
  const c = await post(`${IG}/media`, { media_type: type, upload_type: 'resumable', ...(type === 'REELS' ? { caption: CAPTION, share_to_feed: 'true' } : {}) });
  await upload(c.uri || `https://rupload.facebook.com/ig-api-upload/${V}/${c.id}`, vid);
  return igPublish(c.id);
}
async function fbVideo(edge, finish) {
  const s = await post(`${PAGE}/${edge}`, { upload_phase: 'start' });
  await upload(s.upload_url || `https://rupload.facebook.com/video-upload/${V}/${s.video_id}`, vid);
  return post(`${PAGE}/${edge}`, { upload_phase: 'finish', video_id: s.video_id, ...finish });
}

const JOBS = {
  'fb:post': () => post(`${PAGE}/photos`, { url: img, caption: CAPTION }),
  'fb:reel': () => fbVideo('video_reels', { video_state: 'PUBLISHED', description: CAPTION }),
  'fb:story': () => fbVideo('video_stories', {}),
  'ig:post': async () => { const c = await post(`${IG}/media`, { image_url: img, caption: CAPTION }); for (let i = 0; ; i++) { try { return await post(`${IG}/media_publish`, { creation_id: c.id }); } catch (e) { if (i === 9) throw e; await wait(3000); } } },
  'ig:reel': () => igVideo('REELS'),
  'ig:story': () => igVideo('STORIES'),
};
const NAME = { fb: 'Facebook', ig: 'Instagram' };
let failed = 0;
for (const n of NETS) for (const k of KINDS) {
  if ((n === 'fb' && !PAGE) || (n === 'ig' && !IG) || !JOBS[`${n}:${k}`]) continue;
  try { const j = await JOBS[`${n}:${k}`](); console.log(`${NAME[n]} ${k}: αναρτήθηκε`, j.post_id || j.id || j.video_id || (j.success ? 'ok' : '')); }
  catch (e) { console.error(`${NAME[n]} ${k}:`, e.message); failed++; }
}
if (failed) { console.error(`${failed} αναρτήσεις απέτυχαν. Αν λέει «permission», το token χρειάζεται δικαιώματα pages_manage_posts / instagram_content_publish.`); process.exit(1); }
