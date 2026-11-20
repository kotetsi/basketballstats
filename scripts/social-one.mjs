// Μία ανάρτηση (εικόνα + κείμενο) σε Σελίδα Facebook και Instagram — για δοκιμές και για το «Στατιστικό της ημέρας».
//   IMAGE   διαδρομή εικόνας μέσα στο repo (π.χ. social/test/stat-vezenkov.png) — το Instagram τη διαβάζει από το δημόσιο raw URL του GitHub
//   CAPTION κείμενο ανάρτησης       NETS  fb,ig (προεπιλογή και τα δύο)       SOCIAL_DRY=1  μόνο εμφάνιση
//   META_PAGE_TOKEN, FB_PAGE_ID, IG_USER_ID  όπως στο scripts/social.mjs
const G = 'https://graph.facebook.com/v21.0', REPO = 'https://raw.githubusercontent.com/kotetsi/basketballstats/main/';
const TOKEN = (String(process.env.META_PAGE_TOKEN || '').replace(/\s+/g, '').match(/EAA[A-Za-z0-9]+/) || [''])[0];
const PAGE = String(process.env.FB_PAGE_ID || '').trim(), IG = String(process.env.IG_USER_ID || '').trim();
const IMAGE = String(process.env.IMAGE || '').replace(/^\/+/, ''), CAPTION = String(process.env.CAPTION || '').replace(/\\n/g, '\n');
const NETS = String(process.env.NETS || 'fb,ig').split(',').map(s => s.trim());
const DRY = process.env.SOCIAL_DRY === '1';
if (!IMAGE || !CAPTION) { console.error('Χρειάζονται IMAGE και CAPTION.'); process.exit(1); }
const img = REPO + IMAGE.split('/').map(encodeURIComponent).join('/');
if (DRY) { console.log(`[δοκιμή] ${NETS.join('+')}\n${img}\n\n${CAPTION}`); process.exit(0); }
if (!TOKEN) { console.error('Λείπει το META_PAGE_TOKEN.'); process.exit(1); }
if (!(await fetch(img, { method: 'HEAD' }).then(r => r.ok).catch(() => false))) { console.error('Η εικόνα δεν είναι δημόσια:', img); process.exit(1); }

async function graph(p, params) {
  const r = await fetch(`${G}/${p}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: TOKEN }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${p}: ${j.error?.message || r.status}`);
  return j;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
if (NETS.includes('fb') && PAGE) {
  try { const j = await graph(`${PAGE}/photos`, { url: img, caption: CAPTION }); console.log('Facebook: αναρτήθηκε', j.post_id || j.id); }
  catch (e) { console.error('Facebook:', e.message); failed++; }
}
if (NETS.includes('ig') && IG) {
  try {
    const c = await graph(`${IG}/media`, { image_url: img, caption: CAPTION });
    let ok = null;
    for (let i = 0; i < 10 && !ok; i++) { try { ok = await graph(`${IG}/media_publish`, { creation_id: c.id }); } catch (e) { if (i === 9) throw e; await wait(3000); } }
    console.log('Instagram: αναρτήθηκε', ok.id);
  } catch (e) { console.error('Instagram:', e.message); failed++; }
}
if (failed) process.exit(1);
