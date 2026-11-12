// Αναρτήσεις νέων picks σε Σελίδα Facebook και Instagram (Meta Graph API). Τρέχει ΜΕΤΑ το deploy του site,
// ώστε η κάρτα (basketballstats.eu/og/picks/…png) να είναι ήδη δημόσια — το Instagram τη διαβάζει από URL.
//   META_PAGE_TOKEN  token Σελίδας (secret)    FB_PAGE_ID  id Σελίδας    IG_USER_ID  id λογαριασμού Instagram (επαγγελματικός)
//   SOCIAL_DRY=1     μόνο εμφάνιση, χωρίς ανάρτηση      SOCIAL_DATA=dist/assets/data.json  τοπικά δεδομένα (δοκιμή)
// Κάθε pick αναρτάται μία φορά ανά δίκτυο (data/social.json), και μόνο αν ο αγώνας δεν έχει αρχίσει.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upcomingPicks, cardName, when, DISC } from './pick-cards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://basketballstats.eu', G = 'https://graph.facebook.com/v21.0';
const TOKEN = String(process.env.META_PAGE_TOKEN || '').replace(/\s+/g, ''), PAGE = String(process.env.FB_PAGE_ID || '').trim(), IG = String(process.env.IG_USER_ID || '').trim();
const DRY = process.env.SOCIAL_DRY === '1';
const TIPSTERS = String(process.env.SOCIAL_TIPSTERS || 'high-fidelity').split(',').map(s => s.trim());
if (!DRY && (!TOKEN || (!PAGE && !IG))) { console.log('Social: δεν έχουν οριστεί META_PAGE_TOKEN και FB_PAGE_ID/IG_USER_ID, παράλειψη.'); process.exit(0); }

const STATE = path.join(ROOT, 'data', 'social.json');
const state = JSON.parse(await fs.readFile(STATE, 'utf8').catch(() => '{"posted":[]}'));
// τα picks από το site που μόλις ανέβηκε (ίδια δεδομένα με αυτά που βλέπει ο κόσμος)
const data = process.env.SOCIAL_DATA ? JSON.parse(await fs.readFile(process.env.SOCIAL_DATA, 'utf8')) : await (await fetch(`${SITE}/assets/data.json?t=${Date.now()}`)).json();
const tn = c => (data.teams[c] ? data.teams[c][0] : c);

async function graph(p, params) {
  const r = await fetch(`${G}/${p}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: TOKEN }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${p}: ${j.error?.message || r.status}`);   // το μήνυμα της Meta δεν περιέχει το token
  return j;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

for (const t of upcomingPicks(data, TIPSTERS)) {
  const key = `${t.s}-${t.r}-${t.g}-${t.l}`.toLowerCase().replace(/\s+/g, '_').slice(0, 120);
  const img = `${SITE}/og/picks/${cardName(t)}`, link = SITE + t.u;
  const ok = DRY || await fetch(img, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
  if (!ok && !DRY) { console.log('Social: η κάρτα δεν είναι ακόμη δημόσια, την επόμενη φορά:', img); continue; }
  const caption = `🎯 Νέο pick · ${t.n}\n\n🏀 ${tn(t.h)} – ${tn(t.a)}\n🕗 ${when(t.start)}\n\n👉 ${t.l}${t.o ? ` @${Number(t.o).toFixed(2)}` : ''}\n\n📝 Η ανάλυση: ${link}\n\n${DISC}\n\n#EuroLeague #μπάσκετ #basketball`;
  const igCaption = caption.replace(`📝 Η ανάλυση: ${link}`, '📝 Η ανάλυση στο basketballstats.eu (link στο προφίλ)');
  for (const [net, run] of [['fb', PAGE && (() => graph(`${PAGE}/photos`, { url: img, caption }))], ['ig', IG && (async () => {
    const c = await graph(`${IG}/media`, { image_url: img, caption: igCaption });
    for (let i = 0; i < 10; i++) { try { return await graph(`${IG}/media_publish`, { creation_id: c.id }); } catch (e) { if (i === 9) throw e; await wait(3000); } }
  })]]) {
    const k = `${net}:${key}`;
    if (state.posted.includes(k)) continue;
    if (DRY) { console.log(`--- ${net} (δοκιμή)\n${net === 'ig' ? igCaption : caption}\n[εικόνα] ${img}`); continue; }
    if (!run) continue;
    try { await run(); state.posted.push(k); console.log('Social: αναρτήθηκε', k); }
    catch (e) { console.error('Social:', net, e.message); }
  }
}
state.posted = state.posted.slice(-400);
if (!DRY) await fs.writeFile(STATE, JSON.stringify(state, null, 1));
