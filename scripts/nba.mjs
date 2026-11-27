// NBA: πρόγραμμα, αποτελέσματα, box scores και σουτ (με θέση και ασίστ) από το ESPN → data/nba/<σεζόν>/
//   games.json          όλοι οι αγώνες της σεζόν (κανονική περίοδος, play-in, playoffs)
//   box/<id>.json       box score + σουτ κάθε αγώνα που τελείωσε (κατεβαίνει μία φορά)
//   node scripts/nba.mjs [--from 20261020] [--max 300]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreboardUrl, summaryUrl, parseScoreboard, parseSummary, checkSummary, seasonKey } from '../src/nba/espn.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FROM = arg('--from', '20261020'), MAX = +arg('--max', 300);
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
let last = 0;
async function get(url) {
  const w = 600 - (Date.now() - last); if (w > 0) await new Promise(r => setTimeout(r, w));
  last = Date.now();
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (r.ok) return await r.json(); if (r.status < 500) throw new Error(`HTTP ${r.status}`); }
    catch (e) { if (i === 2) throw e; }
    await new Promise(r => setTimeout(r, 4000 * (i + 1)));
  }
}
const readJSON = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };

// πρόγραμμα μέρα-μέρα (το ESPN δεν δέχεται διαστήματα), από την αρχή της σεζόν μέχρι 21 μέρες μπροστά.
// Οι μέρες που στο games.json έχουν μόνο τελειωμένους αγώνες (και είναι πριν από 3+ μέρες) δεν ξαναρωτιούνται.
const start = new Date(`${FROM.slice(0, 4)}-${FROM.slice(4, 6)}-${FROM.slice(6)}T12:00:00Z`), end = new Date(Date.now() + 21 * 864e5);
const prevAll = [];
for (const d of await fs.readdir(path.join(ROOT, 'data', 'nba')).catch(() => [])) { const j = await readJSON(path.join(ROOT, 'data', 'nba', d, 'games.json'), null); if (j?.games) prevAll.push(...j.games); }
// ημέρα του αγώνα στις ΗΠΑ (το ESPN ομαδοποιεί με την ώρα της Ν. Υόρκης): UTC − 5 ώρες
const usDay = iso => ymd(new Date(Date.parse(iso) - 5 * 3600e3));
const done = new Set(), byDay = new Map();
for (const g of prevAll) { const k = usDay(g.date); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(g); }
for (const [k, gs] of byDay) if (gs.every(g => g.played) && k < ymd(new Date(Date.now() - 3 * 864e5))) done.add(k);
const byId = new Map(prevAll.map(g => [g.id, g]));
let asked = 0;
for (let d = new Date(start); d < end; d = new Date(+d + 864e5)) {
  const k = ymd(d); if (done.has(k)) continue;
  try { for (const g of parseScoreboard(await get(scoreboardUrl(k)))) byId.set(g.id, g); asked++; }
  catch (e) { console.log(`NBA πρόγραμμα ${k}: ${e.message}`); }
}
console.log(`NBA: ρωτήθηκαν ${asked} μέρες`);
const games = [...byId.values()].filter(g => g.type !== 1 && g.year).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
if (!games.length) { console.log('NBA: κανένας αγώνας (άλλαξε το API;)'); process.exit(0); }
const S = seasonKey(games.at(-1).year), dir = path.join(ROOT, 'data', 'nba', S), bdir = path.join(dir, 'box');
await fs.mkdir(bdir, { recursive: true });
const have = new Set((await fs.readdir(bdir)).map(f => f.replace(/\.json$/, '')));
let n = 0, bad = 0;
for (const g of games.filter(g => g.played && !have.has(g.id))) {
  if (n >= MAX) break;
  let s; try { s = parseSummary(await get(summaryUrl(g.id))); } catch (e) { console.log(`NBA ${g.id}: ${e.message}`); continue; }
  n++;
  const errs = checkSummary(s);
  if (errs.length) { bad++; console.log(`NBA ${g.id}: δεν αποθηκεύτηκε (${errs.join('; ')})`); continue; }
  await fs.writeFile(path.join(bdir, `${g.id}.json`), JSON.stringify({ ...s, type: g.type }));
  have.add(g.id);
}
await fs.writeFile(path.join(dir, 'games.json'), JSON.stringify({ season: S, updated: new Date().toISOString(), games: games.map(g => ({ ...g, box: have.has(g.id) })) }));
const played = games.filter(g => g.played).length;
console.log(`NBA ${S}: ${games.length} αγώνες, ${played} τελειωμένοι, ${games.filter(g => have.has(g.id)).length} με box score · ${n} νέοι${bad ? `, ${bad} απορρίφθηκαν` : ''}`);
