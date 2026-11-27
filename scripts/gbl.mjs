// Stoiximan GBL: συλλογή αγώνων και box scores από το esake.gr → data/gbl/<σεζόν>/
//   games.json           όλοι οι αγώνες της σεζόν (πρόγραμμα + αποτελέσματα)
//   box/<idgame>.json    box score κάθε αγώνα που έχει τελειώσει (κατεβαίνει μία φορά)
//   node scripts/gbl.mjs [--seasons G2026,G2025] [--max 120]
// Ευγενικά προς τον server: μία κλήση κάθε ~1,2 δευτ. και έως --max box scores ανά εκτέλεση (το backfill γίνεται σε λίγες νύχτες).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEASONS, PHASES, resultsUrl, parseSeries, boxUrl, parseResults, parseBox, checkBox } from '../src/gbl/esake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const want = (arg('--seasons', Object.keys(SEASONS).join(','))).split(',').filter(s => SEASONS[s]);
const MAX = +arg('--max', 120);
const UA = 'Mozilla/5.0 (compatible; basketballstats.eu; +https://basketballstats.eu)';
let last = 0;
async function get(url) {
  const w = 1200 - (Date.now() - last); if (w > 0) await new Promise(r => setTimeout(r, w));
  last = Date.now();
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'el' }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.text();
      if (r.status < 500) throw new Error(`HTTP ${r.status}`);
    } catch (e) { if (i === 2) throw e; }
    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
  }
}
const readJSON = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };

let fetched = 0, bad = 0;
for (const S of want) {
  const dir = path.join(ROOT, 'data', 'gbl', S), bdir = path.join(dir, 'box');
  await fs.mkdir(bdir, { recursive: true });
  // Χωρίς series η σελίδα δείχνει μόνο την τρέχουσα αγωνιστική, άρα περνάμε κάθε αγωνιστική κάθε φάσης.
  // Μια σεζόν που έχει ήδη κατέβει ολόκληρη και τελειωμένη δεν ξανακατεβαίνει.
  const prev = await readJSON(path.join(dir, 'games.json'), null);
  let games;
  if (prev?.complete) games = prev.games;
  else {
    try {
      const byId = new Map();
      for (const [phase, code] of Object.entries(PHASES)) {
        const first = await get(resultsUrl(SEASONS[S], code));
        const series = parseSeries(first);
        for (const g of parseResults(first, S)) byId.set(g.id, { ...g, phase });
        for (const { value } of series) for (const g of parseResults(await get(resultsUrl(SEASONS[S], code, value)), S)) byId.set(g.id, { ...g, phase });
      }
      games = [...byId.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id));
    } catch (e) { console.log(`GBL ${S}: σφάλμα προγράμματος — ${e.message}`); continue; }
  }
  if (!games.length) { console.log(`GBL ${S}: κανένας αγώνας (άλλαξε η σελίδα;)`); continue; }
  const have = new Set((await fs.readdir(bdir)).map(f => f.replace(/\.json$/, '')));
  for (const g of games.filter(g => g.played && !have.has(g.id))) {
    if (fetched >= MAX) break;
    let box;
    try { box = parseBox(await get(boxUrl(g.id))); } catch (e) { console.log(`GBL ${S} ${g.id}: ${e.message}`); continue; }
    fetched++;
    const errs = checkBox(box, g);
    if (errs.length) { bad++; console.log(`GBL ${S} ${g.id}: δεν αποθηκεύτηκε (${errs.join('; ')})`); continue; }
    await fs.writeFile(path.join(bdir, `${g.id}.json`), JSON.stringify({ id: g.id, season: S, phase: g.phase, round: g.round, stage: g.stage, date: g.date, home: g.home, away: g.away, hs: g.hs, as: g.as, ...box }));
    have.add(g.id);
  }
  // τελειωμένη = υπάρχουν playoffs, όλοι οι αγώνες έχουν παιχτεί και έχουν box score
  const complete = games.some(g => g.phase === 'playoffs') && games.every(g => g.played && have.has(g.id));
  await fs.writeFile(path.join(dir, 'games.json'), JSON.stringify({ season: S, championship: SEASONS[S], updated: prev?.complete ? prev.updated : new Date().toISOString(), complete, games: games.map(g => ({ ...g, box: have.has(g.id) })) }));
  const played = games.filter(g => g.played).length;
  console.log(`GBL ${S}: ${games.length} αγώνες, ${played} τελειωμένοι, ${games.filter(g => have.has(g.id)).length} με box score`);
}
console.log(`GBL: ${fetched} νέα box scores${bad ? `, ${bad} απορρίφθηκαν στον έλεγχο` : ''}`);
