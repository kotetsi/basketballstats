// Τραβάει τα προϊόντα μπάσκετ του sportarena.gr (ελληνικά και αγγλικά) στο shop/sportarena-basketball.json,
// για τη σελίδα «E-shop» του site. Μόνο ανάγνωση των δημόσιων σελίδων κατηγοριών του καταστήματος.
//   node scripts/sportarena-shop.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shop', 'sportarena-basketball.json');
const BASE = 'https://www.sportarena.gr/';
// ομάδες της σελίδας: κλειδί → [ελληνική διαδρομή, αγγλική διαδρομή] (χωρίς τον Παναθηναϊκό BC, που κλείνει)
const CATS = {
  balls: ['μπάσκετ/μπάλεσ', 'en/basketball/basketballs'],
  hoops: ['μπάσκετ/μπασκετεσ', 'en/basketball/basketball-boards'],
  nba: ['μπάσκετ/nba', 'en/basketball/nba'],
  greece: ['μπάσκετ/εθνική-ελλάδας-μπάσκετ', 'en/basketball/greece-nt'],
  olybc: ['μπάσκετ/basket-league/ολυμπιακοσ-bc', 'en/basketball/basket-league/olympiacos-bc'],
  jordan: ['μπάσκετ/jordan', 'en/basketball/jordan'],
  all: ['μπάσκετ', 'en/basketball'],
};
const un = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u) {
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (BasketballStats.eu shop sync)' } }); if (r.ok) return await r.text(); } catch { }
    await sleep(2000 * (i + 1));
  }
  throw new Error('Δεν φορτώνει: ' + u);
}
async function list(p) {
  const out = [];
  for (let page = 1; page < 20; page++) {
    const h = await get(BASE + encodeURI(p) + `?limit=100&page=${page}`);
    for (const b of h.split('class="product-layout').slice(1).map(x => x.slice(0, 6000))) {
      const m = b.match(/<div class="name"><a href="([^"?]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/);
      if (!m) continue;
      const img = b.match(/data-src="([^"]+)"/)?.[1] || null;
      const price = b.match(/price-(?:normal|new)">([^<]+)/)?.[1]?.trim() || null;
      const old = b.match(/price-old">([^<]+)/)?.[1]?.trim() || null;
      const brand = b.match(/Brand:<\/span>\s*<span><a[^>]*>([^<]+)/)?.[1]?.trim() || null;
      const id = b.match(/cart\.add\('(\d+)'/)?.[1] || null;
      out.push({ id, url: m[1], name: un(m[2].replace(/<[^>]+>/g, '')), img, price, old, brand: brand && brand !== 'Κενός' ? brand : null });
    }
    const pages = +(h.match(/\((\d+) (?:Σελ|Pages)/)?.[1] || 1);
    if (page >= pages) break;
  }
  return out;
}
const key = x => x.id || x.url;
const items = new Map(), order = [];
for (const [c, [el, en]] of Object.entries(CATS)) {
  const [E, N] = [await list(el), await list(en)];
  const enBy = new Map(N.map(x => [key(x), x]));
  for (const x of E) {
    const k = key(x);
    if (!items.has(k)) {
      const e = enBy.get(k);
      items.set(k, { id: x.id, cat: c, name: x.name, name_en: e?.name || null, url: x.url, url_en: e?.url || null, img: x.img, price: x.price, old: x.old, brand: x.brand });
      order.push(k);
    }
  }
  console.log(`${c}: ${E.length} (αγγλικά ${N.length})`);
}
const products = order.map(k => items.get(k)).filter(p => p.price && p.img);
const prev = JSON.parse(await fs.readFile(OUT, 'utf8').catch(() => 'null'));
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify({ source: 'https://www.sportarena.gr/μπάσκετ', updated: new Date().toISOString().slice(0, 10), products }, null, 1) + '\n');
console.log(`Σύνολο: ${products.length} προϊόντα (πριν: ${prev?.products?.length ?? 0}) → ${path.relative(ROOT, OUT)}`);
