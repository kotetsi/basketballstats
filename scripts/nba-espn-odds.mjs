// Κατεβάζει τις ιστορικές γραμμές (ESPN BET) για τους αγώνες NBA που έχουν παιχτεί → data/nba/espn-odds/<σεζόν>.json
//   { "<id>": [mlH, mlA, mlOpenH, mlOpenA, spreadHome, total] | null }   · node scripts/nba-espn-odds.mjs [--max 400]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { oddsUrl, parseOdds } from '../src/nba/espn-odds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.indexOf('--max'), MAX = a > 0 ? +process.argv[a + 1] : 400;
const base = path.join(ROOT, 'data', 'nba'), outDir = path.join(base, 'espn-odds');
await fs.mkdir(outDir, { recursive: true });
let fetched = 0, found = 0, failed = 0;
for (const sd of (await fs.readdir(base)).filter(d => /^N\d{4}$/.test(d)).sort()) {
  let G; try { G = JSON.parse(await fs.readFile(path.join(base, sd, 'games.json'), 'utf8')).games; } catch { continue; }
  const f = path.join(outDir, `${sd}.json`); let O = {}; try { O = JSON.parse(await fs.readFile(f, 'utf8')); } catch { }
  for (const g of G.filter(g => g.played && !(String(g.id) in O))) {
    if (fetched >= MAX) break;
    fetched++;
    try { const r = await fetch(oddsUrl(g.id), { headers: { 'user-agent': 'basketballstats.eu' } });
      if (!r.ok) { if (r.status === 404) O[g.id] = null; else failed++; continue; }
      const v = parseOdds(await r.json()); O[g.id] = v; if (v) found++; }
    catch { failed++; }
    await new Promise(r => setTimeout(r, 150));
  }
  await fs.writeFile(f, JSON.stringify(O));
}
console.log(`ESPN γραμμές NBA: ${fetched} αγώνες ελέγχθηκαν, ${found} με γραμμή, ${failed} αποτυχίες`);
