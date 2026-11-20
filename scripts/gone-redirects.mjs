// Σελίδες που υπήρξαν κάποτε και δεν παράγονται πια (π.χ. προεπισκοπήσεις παλιών αγωνιστικών,
// συγκρίσεις παικτών που έφυγαν από τη λίστα, παίκτες που αποχώρησαν) δίνουν 404 στη Google.
// Το GitHub Pages δεν κάνει 301, οπότε γράφουμε στη θέση τους μια μικρή σελίδα με άμεσο
// meta refresh + canonical προς την πιο σχετική ζωντανή σελίδα (η Google το χειρίζεται ως μόνιμη ανακατεύθυνση).
// Κρατάμε στο data/published-urls.json όλα τα URLs που δημοσιεύτηκαν ποτέ.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const MAN = path.join(ROOT, 'data', 'published-urls.json');
const SITE = 'https://basketballstats.eu';
const LANGS = ['en', 'es', 'sr', 'tr'];
const PLAYER_DIR = { el: 'paiktis', en: 'player', es: 'jugador', sr: 'igrac', tr: 'oyuncu' };
const GAME_DIR = { el: 'agonas', en: 'game', es: 'partido', sr: 'utakmica', tr: 'mac' };

// Όλα τα ζωντανά URLs (φάκελοι με index.html), ως '/a/b/'
function walk(dir, rel, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const r = rel + e.name + '/';
    const d = path.join(dir, e.name);
    if (fs.existsSync(path.join(d, 'index.html')) && !isStub(path.join(d, 'index.html'))) out.add(r);
    walk(d, r, out);
  }
}
function isStub(f) { try { return fs.readFileSync(f, 'utf8', { length: 300 }).includes('data-gone-redirect'); } catch { return false; } }

const langOf = u => { const s = u.split('/')[1]; return LANGS.includes(s) ? s : 'el'; };
const pre = l => (l === 'el' ? '/' : `/${l}/`);

export function targetFor(u, liveSet) {
  const lg = langOf(u);
  const segs = u.split('/').filter(Boolean);
  const last = segs[segs.length - 1] || '';
  const has = p => liveSet.has(p);
  // 1. Προεπισκόπηση/ανάλυση αγώνα → η σελίδα του αγώνα
  const m = last.match(/^(?:preview|analysi|analiza|analisis|analiz|onizleme|on-izleme|previa)-(.+-\d+)$/);
  if (m) { const g = `${pre(lg)}${GAME_DIR[lg]}/${m[1]}/`; if (has(g)) return g; }
  // 2. Σύγκριση «Χ-vs-Υ» → η σελίδα του πρώτου παίκτη
  const c = last.match(/^(.+)-vs-(.+)$/);
  if (c) for (const p of [c[1], c[2]]) { const g = `${pre(lg)}${PLAYER_DIR[lg]}/${p}/`; if (has(g)) return g; }
  // 3. Παίκτης Fantasy που δεν υπάρχει πια → η σελίδα του παίκτη αν υπάρχει
  if (segs.includes('fantasy') && segs.length >= 2) { const g = `${pre(lg)}${PLAYER_DIR[lg]}/${last}/`; if (has(g)) return g; }
  // 4. Ο πλησιέστερος «γονέας» που υπάρχει
  for (let i = segs.length - 1; i >= 1; i--) { const g = '/' + segs.slice(0, i).join('/') + '/'; if (has(g)) return g; }
  return pre(lg);
}

function stub(u, to, lg) {
  const abs = SITE + to;
  return `<!doctype html>
<html lang="${lg === 'sr' ? 'sr-Latn' : lg}" data-gone-redirect>
<head>
<meta charset="utf-8">
<title>BasketballStats</title>
<link rel="canonical" href="${abs}">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)} + location.hash)</script>
</head>
<body><p><a href="${to}">${abs}</a></p></body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const live = new Set(['/']);
  walk(DIST, '/', live);
  let man = [];
  try { man = JSON.parse(fs.readFileSync(MAN, 'utf8')); } catch { }
  const all = new Set(man);
  let n = 0;
  for (const u of all) {
    if (live.has(u)) continue;
    const to = targetFor(u, live);
    if (!to || to === u) continue;
    const d = path.join(DIST, ...u.split('/').filter(Boolean));
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), stub(u, to, langOf(u)));
    n++;
  }
  for (const u of live) all.add(u);
  fs.writeFileSync(MAN, JSON.stringify([...all].sort(), null, 0).replace(/","/g, '",\n"') + '\n');
  console.log(`gone-redirects: ${live.size} ζωντανά URLs, ${all.size} στο ιστορικό, ${n} ανακατευθύνσεις`);
}
