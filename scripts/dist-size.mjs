// Έλεγχος μεγέθους του dist/ πριν από το deploy. Το GitHub Pages δεν δημοσιεύει site μεγαλύτερο από 1 GB
// (το όριο δεν αυξάνεται με πληρωμή). Μόνο ανάγνωση.
//   node scripts/dist-size.mjs      προειδοποίηση από DIST_WARN_MB (800), αποτυχία (exit 1) από DIST_MAX_MB (950)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, process.env.DIST_DIR || 'dist');
const WARN = +(process.env.DIST_WARN_MB || 800), MAX = +(process.env.DIST_MAX_MB || 950);
const LANG_DIRS = ['en', 'es', 'sr', 'tr'];

let total = 0, files = 0, html = 0;
const top = {};
async function walk(dir, rel) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { await walk(p, r); continue; }
    const { size } = await fs.stat(p);
    total += size; files++; if (e.name.endsWith('.html')) html++;
    // ομαδοποίηση: γλώσσα/πρώτος φάκελος (π.χ. «en/player», «paiktis», «api»)
    const parts = r.split('/'), k = LANG_DIRS.includes(parts[0]) && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts.length > 1 ? parts[0] : '(ρίζα)';
    top[k] = (top[k] || 0) + size;
  }
}
try { await walk(DIST, ''); } catch { console.error(`dist-size: δεν υπάρχει ${DIST} (τρέξε πρώτα το build)`); process.exit(1); }

const mb = b => Math.round(b / 1048576 * 10) / 10;
const rep = { mb: mb(total), files, html, warn_mb: WARN, max_mb: MAX, largest: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, mb(v)]) };
// όλες οι γλώσσες πρέπει να έχουν αρχική σελίδα
rep.languages = Object.fromEntries([['el', 'index.html'], ...LANG_DIRS.map(l => [l, `${l}/index.html`])].map(([l, f]) => [l, true]));
for (const l of Object.keys(rep.languages)) { try { await fs.access(path.join(DIST, l === 'el' ? 'index.html' : `${l}/index.html`)); } catch { rep.languages[l] = false; } }
console.log(JSON.stringify(rep, null, 1));
const missing = Object.entries(rep.languages).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error(`dist-size: λείπει η αρχική σελίδα για: ${missing.join(', ')}`); process.exit(1); }
if (rep.mb >= MAX) { console.error(`dist-size: ${rep.mb} MB ≥ ${MAX} MB — πολύ κοντά στο όριο 1 GB του GitHub Pages`); process.exit(1); }
if (rep.mb >= WARN) console.warn(`dist-size: προειδοποίηση, ${rep.mb} MB ≥ ${WARN} MB`);
else console.log(`dist-size: ${rep.mb} MB (όριο ${MAX} MB)`);
