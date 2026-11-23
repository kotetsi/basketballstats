// SEO: λιγότερες σελίδες στο Google (μετά το Core Update Νοεμβρίου 2026).
// Τρέχει μετά το build και το portal-home, πριν από το gone-redirects.
// Οι σελίδες μένουν στο site για τους επισκέπτες, αλλά παίρνουν noindex,follow,
// βγαίνουν από τα sitemap-*.xml και από τα hreflang των υπόλοιπων σελίδων.
//
// Ενότητες (μόνο οι υποσελίδες· οι κεντρικές σελίδες τους μένουν στο Google):
//   - συγκρίσεις ζευγαριών ομάδων/παικτών (όλες οι γλώσσες)
//   - EuroCup (όλες οι γλώσσες), εκτός από τις σελίδες ομάδας Άρη και ΠΑΟΚ
//   - πεντάδες (lineups) και matchup (όλες οι γλώσσες)
//   - σελίδες παικτών και αγώνων στα σερβικά και στα τουρκικά
// Εξαιρέσεις: data/seo/keep-urls.json (URL που είχαν κλικ ή ≥10 εμφανίσεις στο Search Console).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://basketballstats.eu';
const L = '(?:/(?:en|es|sr|tr))?';

export const RULES = [
  new RegExp(`^${L}/(?:sygkrisi|compare|comparar|poredjenje|karsilastir)/(?:omades|teams|equipos|timovi|takimlar|paiktes|players|jugadores|igraci|oyuncular)/.`),
  new RegExp(`^${L}/eurocup/.`),
  new RegExp(`^${L}/(?:lineups|quintetos|postave|besliler)/.`),
  new RegExp(`^${L}/matchup/.`),
  /^\/sr\/(?:igrac|utakmica)\/./,
  /^\/tr\/(?:oyuncu|mac)\/./,
];
const ALWAYS_KEEP = [new RegExp(`^${L}/eurocup/(?:aris-thessaloniki|paok-thessaloniki)/$`)];

export function shouldPrune(url, keep) {
  if (keep.has(url) || ALWAYS_KEEP.some(r => r.test(url))) return false;
  return RULES.some(r => r.test(url));
}

async function walk(dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name === 'index.html') out.push(p);
  }
  return out;
}

async function main() {
  const dist = path.join(ROOT, 'dist');
  const keep = new Set(JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'seo', 'keep-urls.json'), 'utf8')).urls);
  const files = await walk(dist);
  const urlOf = f => '/' + path.relative(dist, path.dirname(f)).split(path.sep).join('/') + '/';
  const pruned = new Set();
  let already = 0;
  const pages = [];
  for (const f of files) {
    const url = urlOf(f).replace(/^\/\/$/, '/');
    let html = await fs.readFile(f, 'utf8');
    if (/http-equiv="refresh"/.test(html)) continue;          // ανακατευθύνσεις του gone-redirects
    if (shouldPrune(url, keep)) {
      pruned.add(SITE + url);
      if (/<meta name="robots"[^>]*noindex/.test(html)) { already++; continue; }
      html = html.replace('</head>', '<meta name="robots" content="noindex,follow"></head>');
      await fs.writeFile(f, html);
    } else pages.push(f);
  }
  // hreflang: οι σελίδες που μένουν στο Google δεν δείχνουν σε σελίδες με noindex
  let hrefl = 0;
  for (const f of pages) {
    const html = await fs.readFile(f, 'utf8');
    const out = html.replace(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)">\n?/g, (m, href) => pruned.has(href) ? (hrefl++, '') : m);
    if (out !== html) await fs.writeFile(f, out);
  }
  // sitemaps
  let removed = 0;
  for (const name of (await fs.readdir(dist)).filter(n => /^sitemap-[a-z]+\.xml$/.test(n))) {
    const p = path.join(dist, name);
    const xml = await fs.readFile(p, 'utf8');
    const out = xml.replace(/\s*<url><loc>([^<]+)<\/loc>.*?<\/url>/gs, (m, loc) => pruned.has(loc) ? (removed++, '') : m);
    if (out !== xml) await fs.writeFile(p, out);
  }
  console.log(`seo-prune: ${pruned.size} σελίδες εκτός Google (${already} είχαν ήδη noindex), ${removed} αφαιρέθηκαν από τα sitemaps, ${hrefl} hreflang καθαρίστηκαν, ${keep.size} εξαιρέσεις`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
