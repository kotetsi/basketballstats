// NBA: πεντάδες και απουσίες της μέρας από το Rotowire → data/nba/lineups/latest.json (+ αρχείο ανά μέρα).
// Κάθε παίκτης αντιστοιχίζεται με το id του ESPN από τα box scores της ομάδας του (ίδιο όνομα).
//   node scripts/nba-lineups.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINEUPS_URL, parseLineups, nameKey } from '../src/nba/rotowire.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const r = await fetch(LINEUPS_URL, { headers: { 'accept-language': 'en' }, signal: AbortSignal.timeout(30000) });
if (!r.ok) { console.log(`NBA πεντάδες: Rotowire HTTP ${r.status}`); process.exit(0); }
const games = parseLineups(await r.text());
if (!games.length) { console.log('NBA πεντάδες: κανένας αγώνας (άλλαξε η σελίδα;)'); process.exit(0); }

// ρόστερ ανά ομάδα (ESPN abbr → nameKey → id) από τα box scores της τρέχουσας σεζόν
const seasons = (await fs.readdir(path.join(ROOT, 'data', 'nba')).catch(() => [])).filter(d => /^N\d{4}$/.test(d)).sort();
const cur = seasons.at(-1), roster = {};
const bdir = path.join(ROOT, 'data', 'nba', cur, 'box');
for (const f of await fs.readdir(bdir).catch(() => [])) {
  const b = await readJSON(path.join(bdir, f), null);
  for (const t of b?.teams || []) for (const p of t.players) ((roster[t.abbr] ||= {})[nameKey(p.name)] = p.id);
}
let n = 0, miss = [];
for (const g of games) for (const [abbr, T] of Object.entries(g.teams)) for (const p of [...T.starters, ...T.mayNotPlay]) {
  n++; p.id = roster[abbr]?.[nameKey(p.name)] || null;
  if (!p.id) miss.push(`${abbr} ${p.name}`);
}
const at = new Date().toISOString(), dir = path.join(ROOT, 'data', 'nba', 'lineups');
await fs.mkdir(dir, { recursive: true });
const doc = { at, source: LINEUPS_URL, games };
await fs.writeFile(path.join(dir, 'latest.json'), JSON.stringify(doc));
const F = path.join(dir, `${at.slice(0, 10)}.json`), prev = await readJSON(F, { snapshots: [] });
prev.snapshots.push(doc); await fs.writeFile(F, JSON.stringify(prev));
const out = games.reduce((a, g) => a + Object.values(g.teams).reduce((s, T) => s + T.mayNotPlay.filter(p => p.pct <= 25).length, 0), 0);
console.log(`NBA πεντάδες: ${games.length} αγώνες, ${n} παίκτες, ${out} μάλλον εκτός (Out/Doubt)${miss.length ? ` · χωρίς id ESPN (${miss.length}): ${[...new Set(miss)].slice(0, 15).join(', ')}` : ''}`);
