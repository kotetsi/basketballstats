// Backfill ιστορικών σεζόν για το backtesting: box score ανά παίκτη και αγώνα από το επίσημο feed της EuroLeague,
// στην ίδια μορφή με το data/cache.json (players[].g, league.games), ώστε το fantasy/features.py να δουλεύει χωρίς αλλαγές.
//   node fantasy/hist_fetch.mjs                 # E2023, E2024, E2025 (όσες λείπουν)
//   node fantasy/hist_fetch.mjs E2025 --force   # ξανά
// Κρατάμε μόνο την κανονική περίοδο (όπως το Fantasy Challenge).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FEED = 'https://feeds.incrowdsports.com/provider/euroleague-feeds';
const OUT = path.join(ROOT, 'data', 'fantasy', 'hist');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: { accept: 'application/json' } }); if (r.ok) return await r.json(); if (r.status === 404) return null; } catch { /* ξανά */ }
    await sleep(1500 * (i + 1));
  }
  throw new Error('Αποτυχία λήψης: ' + url);
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); await sleep(60); } }));
  return out;
}
const enc = d => d.slice(5, 7) + d.slice(8, 10) + d.slice(11, 13) + d.slice(14, 16) + d.slice(3, 4);

export async function fetchSeason(S) {
  const q = `seasonMode=Single&seasonCode=${S}&limit=500`;
  const [trad, gamesRes] = await Promise.all([
    get(`${FEED}/v3/competitions/E/statistics/players/traditional?${q}&statisticMode=PerGame`),
    get(`${FEED}/v2/competitions/E/seasons/${S}/games?limit=500`),
  ]);
  const all = (gamesRes?.data || []).filter(x => x.status === 'result');
  // κανονική περίοδος: phaseType RS αν υπάρχει, αλλιώς αγωνιστικές με πλήρες πρόγραμμα (≥ 8 αγώνες)
  const perRound = {}; for (const x of all) perRound[x.round.round] = (perRound[x.round.round] || 0) + 1;
  const isRS = x => (x.phaseType?.code ? x.phaseType.code === 'RS' : perRound[x.round.round] >= 8);
  const rsRounds = new Set(all.filter(isRS).map(x => x.round.round));
  const games = all.filter(x => rsRounds.has(x.round.round)).map(x => [x.round.round, enc(x.date), x.home.code, x.away.code, x.home.score, x.away.score, 1])
    .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  const list = trad?.players || [];
  console.log(`[hist] ${S}: ${games.length} αγώνες κανονικής περιόδου, ${list.length} παίκτες`);
  const players = (await pool(list, 6, async p => {
    const c = p.player.code, tc = p.player.team.code;
    const [bio, st] = await Promise.all([get(`${FEED}/v2/competitions/E/seasons/${S}/people/${c}`).catch(() => null), get(`${FEED}/v2/competitions/E/seasons/${S}/people/${c}/stats`).catch(() => null)]);
    if (!st) return null;
    const b = bio?.data?.find(x => x.type === 'J') || bio?.data?.[0];
    const teams = new Set();
    const g = (st.games || []).filter(x => x.game.played && rsRounds.has(x.game.round)).map(x => {
      const G = x.game, s = x.stats;
      // η ομάδα του παίκτη σε εκείνον τον αγώνα (για όσους άλλαξαν ομάδα μέσα στη σεζόν)
      const me0 = G.local.club.code === tc ? G.local : G.road.club.code === tc ? G.road : null;
      const myCode = me0 ? me0.club.code : (s.teamCode || x.team?.code || G.local.club.code);
      const home = G.local.club.code === myCode; const me = home ? G.local : G.road, op = home ? G.road : G.local;
      teams.add(me.club.code);
      return [G.round, G.utcDate.slice(0, 10), op.club.code, home ? 1 : 0, me.score, op.score, s.startFive ? 1 : 0, Math.round(s.timePlayed || 0),
        s.points, s.fieldGoalsMade2, s.fieldGoalsAttempted2, s.fieldGoalsMade3, s.fieldGoalsAttempted3, s.freeThrowsMade, s.freeThrowsAttempted,
        s.offensiveRebounds, s.defensiveRebounds, s.assistances, s.steals, s.turnovers, s.blocksFavour, s.blocksAgainst,
        s.foulsCommited, s.foulsReceived, s.plusMinus, s.valuation].map(v => (v == null ? 0 : v));
    }).sort((a, b) => a[0] - b[0]);
    if (!g.length) return null;
    const t = [...teams].filter(x => x !== tc).concat(tc).filter((x, i, a) => a.indexOf(x) === i).join(';');
    return { c, n: p.player.name, t, pos: b?.positionName || '', g };
  })).filter(Boolean);
  return { season: S, fetchedAt: new Date().toISOString(), source: 'feeds.incrowdsports.com (official EuroLeague feed)', players, league: { games } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2), force = args.includes('--force');
  const seasons = args.filter(a => /^E\d{4}$/.test(a));
  await fs.mkdir(OUT, { recursive: true });
  for (const S of seasons.length ? seasons : ['E2023', 'E2024', 'E2025']) {
    const f = path.join(OUT, `${S}.json`);
    if (!force) { try { await fs.access(f); console.log(`[hist] ${S}: υπάρχει ήδη`); continue; } catch { /* λείπει */ } }
    try {
      const d = await fetchSeason(S);
      if (d.players.length < 100 || d.league.games.length < 100) { console.log(`[hist] ${S}: λίγα δεδομένα (${d.players.length} παίκτες), δεν αποθηκεύεται`); continue; }
      await fs.writeFile(f, JSON.stringify(d));
      console.log(`[hist] ${S}: αποθηκεύτηκε (${d.players.length} παίκτες)`);
    } catch (e) { console.log(`[hist] ${S}: σφάλμα ${e.message}`); }
  }
}
