// Μία φορά: αποθηκεύει δείγμα HTML από το aba-liga.com (ημερολόγιο + ένα box score) και το robots.txt,
// για να γραφτεί ο parser των λεπτών στην ABA (PAR, RED, DUB). Μικρά αρχεία στο data/fantasy/dom/probe/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'fantasy', 'dom', 'probe');
const UA = { 'user-agent': 'basketballstats.eu (minutes of EuroLeague players, low frequency)' };
await fs.mkdir(OUT, { recursive: true });
try { await fs.access(path.join(OUT, 'done.txt')); console.log('[dom] probe: έγινε ήδη'); process.exit(0); } catch { }
const save = async (name, url) => {
  try { const r = await fetch(url, { headers: UA }); const t = await r.text(); await fs.writeFile(path.join(OUT, name), t.slice(0, 400000)); console.log(`[dom] ${url} → ${r.status}, ${t.length} bytes`); return t; } catch (e) { console.log(`[dom] ${url} σφάλμα ${e.message}`); return ''; }
};
await save('robots.txt', 'https://www.aba-liga.com/robots.txt');
const cal = await save('calendar.html', 'https://www.aba-liga.com/calendar/26/1/');
const ids = [...new Set([...cal.matchAll(/\/match(?:-live)?\/(\d+)\/26\/1/g)].map(m => m[1]))];
console.log('[dom] match ids:', ids.slice(0, 10).join(','), '…', ids.length);
if (ids[0]) { await save('match_box.html', `https://www.aba-liga.com/match/${ids[0]}/26/1/Boxscore`); await save('match_live.html', `https://www.aba-liga.com/match-live/${ids[0]}/26/1`); }
await fs.writeFile(path.join(OUT, 'done.txt'), new Date().toISOString());
