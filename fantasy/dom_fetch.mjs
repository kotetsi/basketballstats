// Εθνικά πρωταθλήματα → σήμα για τραυματισμό/ξεκούραση πριν από τον αγώνα της EuroLeague.
// Πηγή: ABA League (aba-liga.com, δημόσιο HTML, robots.txt χωρίς απαγορεύσεις) για Partizan, Crvena zvezda, Dubai.
// Δεν κρατάμε τίποτα πέρα από τα λεπτά συμμετοχής των παικτών της EuroLeague. Χαμηλή συχνότητα (1 αίτημα ανά αγώνα, μία φορά).
// Άλλα πρωταθλήματα: ACB και Basket League (ΕΣΑΚΕ) οι όροι τους ζητούν άδεια· δεν χρησιμοποιούνται.
//   node fantasy/dom_fetch.mjs → data/fantasy/dom/minutes.json + ειδοποιήσεις στο data/fantasy/dom/news.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'fantasy', 'dom');
const UA = { 'user-agent': 'basketballstats.eu (minutes of EuroLeague players; low frequency)' };
export const ABA_CLUBS = { partizan: 'PAR', 'crvena zvezda': 'RED', dubai: 'DUB' };
const SEASON_ID = '26';   // 2026-27 στο aba-liga.com
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** αγώνες από το ημερολόγιο: id, ομάδες, αν έχει παιχτεί (υπάρχει σκορ) */
export function parseCalendar(html) {
  const out = [];
  for (const m of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const row = m[1];
    const id = row.match(/\/match\/(\d+)\/\d+\/\d+\/Overview\/[^"]*\/home\/([^"/]+)\//);
    if (!id) continue;
    const names = row.match(/<p class="hidden-xs">\s*<a[^>]*>([\s\S]*?)<span>:<\/span>([\s\S]*?)<\/a>/);
    const score = row.match(/class="scoretable">([\s\S]*?)<\/td>/);
    const sc = score ? strip(score[1]).match(/(\d{2,3})\s*:\s*(\d{2,3})/) : null;
    out.push({ id: +id[1], home: names ? strip(names[1]) : '', away: names ? strip(names[2]) : '', played: !!sc, hs: sc ? +sc[1] : null, as: sc ? +sc[2] : null });
  }
  return out;
}
const clubOf = name => { const n = norm(name); for (const [k, v] of Object.entries(ABA_CLUBS)) if (n.includes(k)) return v; return null; };

/** box score: πίνακες με γραμμή κεφαλίδας που έχει «Min» και γραμμές με link παίκτη */
export function parseBox(html) {
  const tables = [];
  for (const t of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    const rows = [...t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(r => r[1]);
    const head = rows.map(r => [...r.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => strip(c[1]))).find(cells => cells.some(c => /^min\.?$/i.test(c)));
    if (!head) continue;
    const mi = head.findIndex(c => /^min\.?$/i.test(c));
    const players = [];
    for (const r of rows) {
      const link = r.match(/\/player\/(\d+)\/[^"]*">([\s\S]*?)<\/a>/); if (!link) continue;
      const cells = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => strip(c[1]));
      const raw = cells[mi] ?? '';
      const mm = raw.match(/(\d{1,2}):(\d{2})/);
      const min = mm ? +mm[1] + +mm[2] / 60 : /^\d+$/.test(raw) ? +raw : /dnp|^-$|^$/i.test(raw) ? 0 : null;
      players.push({ aba: +link[1], name: strip(link[2]), min });
    }
    if (players.length >= 5) tables.push(players);
  }
  return tables;
}
export function gameDate(html) { const m = html.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; }

/** ABA «Επώνυμο Όνομα» → κωδικός EuroLeague (ίδια ομάδα, ίδια σύνολα λέξεων ή ίδιο επώνυμο+αρχικό) */
export function matchEL(name, team, players) {
  const toks = new Set(norm(name).split(' '));
  const cand = players.filter(p => p.t.split(';').includes(team));
  const score = p => { const [L, F] = p.n.split(',').map(x => norm(x)); const all = new Set([...L.split(' '), ...(F || '').split(' ')].filter(Boolean)); let k = 0; for (const t of toks) if (all.has(t)) k++; return k / Math.max(all.size, toks.size); };
  const best = cand.map(p => [score(p), p]).sort((a, b) => b[0] - a[0])[0];
  return best && best[0] >= 0.5 ? best[1] : null;
}

async function get(url) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`HTTP ${r.status}`); await sleep(800); return r.text(); }

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const cache = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'cache.json'), 'utf8'));
  const f = path.join(OUT, 'minutes.json');
  let db = { source: 'aba-liga.com', games: [], unmatched: [] }; try { db = JSON.parse(await fs.readFile(f, 'utf8')); } catch { }
  const have = new Set(db.games.map(g => g.id));
  const cal = parseCalendar(await get(`https://www.aba-liga.com/calendar/${SEASON_ID}/1/`));
  const todo = cal.filter(g => g.played && !have.has(g.id) && (clubOf(g.home) || clubOf(g.away))).slice(0, 12);
  const unmatched = new Set(db.unmatched || []);
  let parsed = 0;
  for (const g of todo) {
    try {
      const html = await get(`https://www.aba-liga.com/match/${g.id}/${SEASON_ID}/1/Boxscore/`);
      const tables = parseBox(html);
      if (tables.length < 2) { console.log(`[dom] ABA ${g.id}: δεν βρέθηκε box score (${tables.length} πίνακες)`); if (!parsed) await fs.writeFile(path.join(OUT, 'probe', 'played_box.html'), html.slice(0, 400000)).catch(() => {}); continue; }
      const date = gameDate(html);
      const sides = [[clubOf(g.home), tables[0]], [clubOf(g.away), tables[1]]];
      for (const [team, pl] of sides) {
        if (!team) continue;
        const players = {};
        for (const x of pl) { const p = matchEL(x.name, team, cache.players); if (p) players[p.c] = x.min == null ? null : +x.min.toFixed(1); else unmatched.add(`${team}: ${x.name}`); }
        db.games.push({ league: 'ABA', id: g.id, date, team, home: g.home, away: g.away, players });
      }
      parsed++;
    } catch (e) { console.log(`[dom] ABA ${g.id}: ${e.message}`); }
  }
  db.updated = new Date().toISOString(); db.unmatched = [...unmatched].slice(0, 200);
  db.games.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  await fs.writeFile(f, JSON.stringify(db));
  // ειδοποιήσεις: παίκτης της EuroLeague που στον πιο πρόσφατο εγχώριο αγώνα (τελευταίες 6 μέρες) δεν έπαιξε ή έπαιξε πολύ λιγότερο
  const now = Date.now(), items = [];
  const byC = new Map(cache.players.map(p => [p.c, p]));
  const recent = db.games.filter(x => x.date && now - Date.parse(x.date + 'T12:00:00Z') <= 6 * 864e5);
  for (const gm of recent) {
    for (const p of cache.players.filter(q => q.t.split(';').pop() === gm.team)) {
      const pl = p.g.filter(r => r[7] > 0).slice(-10); if (pl.length < 3) continue;
      const m10 = pl.reduce((s, r) => s + r[7], 0) / 60 / pl.length; if (m10 < 12) continue;
      const m = gm.players[p.c];
      const kind = m == null && !(p.c in gm.players) ? 'dom_absent' : m === 0 ? 'dom_dnp' : m != null && m < 0.4 * m10 ? 'dom_low' : null;
      if (kind) items.push({ ts: gm.date + 'T21:00:00Z', c: p.c, n: p.n, t: gm.team, kind: 'domestic', tag: kind, before: +m10.toFixed(1), after: m ?? 0, source: 'domestic_aba', detail: { league: 'ABA', date: gm.date, home: gm.home, away: gm.away, link: `https://www.aba-liga.com/match/${gm.id}/${SEASON_ID}/1/Boxscore/` } });
    }
  }
  await fs.writeFile(path.join(OUT, 'news.json'), JSON.stringify({ updated: db.updated, items }));
  console.log(`[dom] ABA: ${todo.length} νέοι αγώνες, ${parsed} με box score, σύνολο ${db.games.length} · ειδοποιήσεις ${items.length} · χωρίς αντιστοίχιση ${unmatched.size}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
