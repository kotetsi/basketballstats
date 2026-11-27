// NBA: αποδόσεις κύριων αγορών (νικητής, χάντικαπ, σύνολο) από το The Odds API → data/nba/odds/
//   <YYYY-MM-DD>.json   στιγμιότυπο της μέρας (ανά αγώνα ESPN και bookmaker), δεν σβήνεται: είναι το αρχείο για τη σύγκριση με την αγορά
//   latest.json         το τελευταίο στιγμιότυπο
// Χρειάζεται ODDS_API_KEY (το secret THEODDSAPI_KEY). Κόστος: 3 credits ανά κλήση (3 αγορές × 1 περιοχή).
//   node scripts/nba-odds.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = (process.env.ODDS_API_KEY || '').trim();
if (!KEY) { console.log('NBA αποδόσεις: λείπει το ODDS_API_KEY'); process.exit(0); }
const readJSON = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };

// ονόματα του The Odds API → ομάδες του ESPN (ίδια ονόματα, εκτός από λίγες εξαιρέσεις)
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/^la /, 'los angeles ');
const games = [];
for (const d of await fs.readdir(path.join(ROOT, 'data', 'nba')).catch(() => [])) { const j = await readJSON(path.join(ROOT, 'data', 'nba', d, 'games.json'), null); if (j?.games) games.push(...j.games); }
const match = ev => games.find(g => norm(g.home.name) === norm(ev.home_team) && norm(g.away.name) === norm(ev.away_team) && Math.abs(Date.parse(g.date) - Date.parse(ev.commence_time)) < 6 * 3600e3);

const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${encodeURIComponent(KEY)}&regions=${process.env.ODDS_REGIONS || 'eu'}&markets=h2h,spreads,totals&oddsFormat=decimal&dateFormat=iso`;
const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
if (!r.ok) { console.log(`NBA αποδόσεις: The Odds API ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(0); }
const quota = { remaining: r.headers.get('x-requests-remaining'), used: r.headers.get('x-requests-used') };
const data = await r.json(), at = new Date().toISOString();
const out = { at, quota, games: {} }; let unmatched = 0;
for (const ev of data) {
  const g = match(ev); if (!g) { unmatched++; continue; }
  const books = {};
  for (const b of ev.bookmakers || []) {
    const m = {};
    for (const mk of b.markets || []) {
      const o = n => mk.outcomes.find(x => x.name === n);
      if (mk.key === 'h2h') { const h = o(ev.home_team)?.price, a = o(ev.away_team)?.price; if (h && a) m.ml = [h, a]; }
      if (mk.key === 'spreads') { const h = o(ev.home_team), a = o(ev.away_team); if (h && a) m.spread = { line: h.point, h: h.price, a: a.price }; }
      if (mk.key === 'totals') { const ov = mk.outcomes.find(x => /over/i.test(x.name)), un = mk.outcomes.find(x => /under/i.test(x.name)); if (ov && un) m.total = { line: ov.point, over: ov.price, under: un.price }; }
    }
    if (Object.keys(m).length) books[b.key] = { upd: b.last_update, ...m };
  }
  out.games[g.id] = { tip: g.date, home: g.home.abbr, away: g.away.abbr, books };
}
const dir = path.join(ROOT, 'data', 'nba', 'odds');
await fs.mkdir(dir, { recursive: true });
const day = at.slice(0, 10), F = path.join(dir, `${day}.json`);
// ίδια μέρα δεύτερη κλήση: κρατάμε και τις δύο (μόνο οι αγώνες που δεν είχαν αρχίσει)
const prev = await readJSON(F, { snapshots: [] });
prev.snapshots.push({ at, games: Object.fromEntries(Object.entries(out.games).filter(([, x]) => Date.parse(x.tip) > Date.parse(at))) });
await fs.writeFile(F, JSON.stringify(prev));
await fs.writeFile(path.join(dir, 'latest.json'), JSON.stringify(out));
console.log(`NBA αποδόσεις: ${Object.keys(out.games).length} αγώνες${unmatched ? `, ${unmatched} χωρίς αντιστοίχιση` : ''} · quota: έμειναν ${quota.remaining}, χρησιμοποιήθηκαν ${quota.used}`);
