// Ειδήσεις τραυματισμών από RSS (μόνο τίτλος + link + ημερομηνία· ποτέ κείμενο άρθρου).
// Κρατάμε μόνο τίτλους που αναφέρουν παίκτη της τρέχουσας σεζόν ΚΑΙ λέξη για τραυματισμό/απουσία/επιστροφή.
// Δεν αλλάζουν την εκτίμηση: γίνονται ειδοποίηση «έλεγξε αυτόν τον παίκτη» στο Fantasy Manager και στις ειδήσεις.
//   node fantasy/press_fetch.mjs     → data/fantasy/press.json (τελευταίες 21 μέρες)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FEEDS = [
  { id: 'eurohoops', lang: 'en', url: 'https://www.eurohoops.net/feed/' },
  { id: 'eurohoops_gr', lang: 'el', url: 'https://www.eurohoops.net/gr/feed/' },
  { id: 'sportando', lang: 'en', url: 'https://sportando.basketball/feed/' },
];
const KEEP_DAYS = 21;

export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
// σειρά: πρώτα επιστροφή (π.χ. «returns from injury»), μετά αμφίβολος, μετά τραυματισμός/εκτός
const KW = [
  ['return', /(?:^| )(returns?|return to|back in|back from|cleared|comeback|επιστρεφ|επιστροφ|επανερχ|ξαναβρισκ|διαθεσιμος)/],
  ['doubtful', /(?:^| )(doubtful|questionable|game time decision|day to day|uncertain|αμφιβολ|αβεβαι|ερωτηματικ)/],
  ['injury', /(?:^| )(injur|sidelined|ruled out|will miss|to miss|misses|out for|surgery|fracture|sprain|strain|torn|tear|knee|ankle|hamstring|calf|groin|concussion|τραυματ|εκτος αγωνα|εκτος δρασης|χανει|χασει|απουσια|απουσιαζ|χειρουργ|ενοχλησ|θλαση|διαστρεμμα|ρηξη|καταγμα)/],
];
export function classify(title) {
  const t = norm(title);
  for (const [k, re] of KW) if (re.test(t)) return k;
  return null;
}

/** ευρετήριο ονομάτων: «Όνομα Επώνυμο» και επώνυμο (μόνο αν είναι μοναδικό και ≥ 4 γράμματα) σε λατινικά και ελληνικά */
export function nameIndex(players, greek = {}) {
  const full = [], last = new Map();
  for (const p of players) {
    const [L, F] = String(p.n).split(',').map(x => (x || '').trim());
    const variants = [`${F} ${L}`, `${L} ${F}`].map(norm).filter(x => x.split(' ').length >= 2);
    const gr = greek[p.n];
    if (gr) variants.push(norm(gr.replace(/\(.*?\)/g, '')));
    for (const v of variants) full.push([v, p]);
    const lasts = [norm(L).split(' ').pop()];
    if (gr) lasts.push(norm(gr).split(' ').pop());
    for (const l of lasts) if (l && l.length >= 4) last.set(l, last.has(l) && last.get(l)?.c !== p.c ? null : p);
  }
  return { full, last };
}
export function matchPlayers(title, idx) {
  const t = ` ${norm(title)} `, found = new Map();
  for (const [v, p] of idx.full) if (t.includes(` ${v} `)) found.set(p.c, p);
  if (!found.size) for (const [l, p] of idx.last) if (p && t.includes(` ${l} `)) found.set(p.c, p);
  return [...found.values()];
}
export function parseRSS(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
    const get = tag => { const x = m[0].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return x ? x[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8211;/g, '–').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/<[^>]+>/g, '').trim() : ''; };
    const title = get('title'), link = get('link'), date = get('pubDate');
    if (title && /^https?:\/\//.test(link)) items.push({ title, link, ts: date ? new Date(date).toISOString() : null });
  }
  return items;
}

async function main() {
  const cache = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'cache.json'), 'utf8'));
  let greek = {}; try { greek = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'greek-names.json'), 'utf8')); } catch { }
  const idx = nameIndex(cache.players, greek);
  const f = path.join(ROOT, 'data', 'fantasy', 'press.json');
  let old = { items: [] }; try { old = JSON.parse(await fs.readFile(f, 'utf8')); } catch { }
  const seen = new Set(old.items.map(x => x.link + '|' + x.c));
  const status = {};
  const add = [];
  for (const F of FEEDS) {
    try {
      const r = await fetch(F.url, { headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': 'basketballstats.eu news bot (headlines + links only)' } });
      if (!r.ok) { status[F.id] = `HTTP ${r.status}`; continue; }
      const items = parseRSS(await r.text());
      status[F.id] = `ok (${items.length})`;
      for (const it of items) {
        const kind = classify(it.title); if (!kind) continue;
        for (const p of matchPlayers(it.title, idx)) {
          const k = it.link + '|' + p.c; if (seen.has(k)) continue; seen.add(k);
          add.push({ ts: it.ts || new Date().toISOString(), c: p.c, n: p.n, t: p.t.split(';').pop(), kind: 'press', tag: kind, title: it.title.slice(0, 200), link: it.link, source: 'press_' + F.id, lang: F.lang });
        }
      }
    } catch (e) { status[F.id] = 'σφάλμα: ' + e.message; }
  }
  const lim = Date.now() - KEEP_DAYS * 864e5;
  const items = [...add, ...old.items].filter(x => Date.parse(x.ts) >= lim).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 400);
  await fs.writeFile(f, JSON.stringify({ updated: new Date().toISOString(), feeds: status, items }, null, 0));
  console.log(`[press] ${JSON.stringify(status)} · νέα ${add.length} · σύνολο ${items.length}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
