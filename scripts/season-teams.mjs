// «Η καλύτερη ομάδα της σεζόν» για βίντεο: για κάθε σεζόν EuroLeague (E2000 και μετά) βρίσκει
// τους 2 C, 4 F, 4 G με τον υψηλότερο μέσο PIR (>= MIN_GAMES αγώνες), με θέση και νούμερο φανέλας
// από το feed της σεζόν, και τον προπονητή του πρωταθλητή (data/quiz-champions.json).
// Χρήση: node scripts/season-teams.mjs [E2000 E2001 ...]   (κενό = E2000..E2025)
// Έξοδος: data/season-teams/<SEASON>.json + data/season-teams/index.json
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FEED = 'https://feeds.incrowdsports.com/provider/euroleague-feeds';
const OUT = path.join(ROOT, 'data', 'season-teams');
const MIN_GAMES = 15;
const NEED = { C: 2, F: 4, G: 4 };
const POS = { Guard: 'G', Forward: 'F', Center: 'C' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.status === 404) return null;
      if (r.ok) return await r.json();
    } catch {}
    await sleep(1500 * (i + 1));
  }
  throw new Error('fetch failed: ' + url);
}
const surname = n => (n || '').split(',')[0].trim().toLowerCase().replace(/(^|[\s\-'])\S/g, s => s.toUpperCase());

const champs = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'quiz-champions.json'), 'utf8'));
const champOf = code => champs.find(c => c.year === Number(code.slice(1)) + 1) || null;

async function season(code) {
  const st = await get(`${FEED}/v3/competitions/E/statistics/players/traditional?seasonMode=Single&seasonCode=${code}&statisticMode=PerGame&limit=600&sortDirection=descending&statisticSortMode=perGame`);
  if (!st) return { season: code, error: 'season not found' };
  const rows = st.players
    .map((p, i) => ({ i, code: p.player.code, name: p.player.name, team: p.player.team.code, gp: p.gamesPlayed, pir: p.pir }))
    .filter(p => p.gp >= MIN_GAMES)
    .sort((a, b) => b.pir - a.pir || a.i - b.i);
  const got = { C: [], F: [], G: [] }, checked = [];
  for (const r of rows) {
    if (got.C.length >= NEED.C && got.F.length >= NEED.F && got.G.length >= NEED.G) break;
    const per = await get(`${FEED}/v2/competitions/E/seasons/${code}/people/${r.code}`);
    await sleep(150);
    const d = per?.data?.find(x => x.club?.code === r.team) || per?.data?.[0];
    const pos = POS[d?.positionName];
    checked.push({ name: r.name, team: r.team, pir: r.pir, gp: r.gp, pos: pos || null });
    if (!pos || got[pos].length >= NEED[pos]) continue;
    got[pos].push({ name: surname(r.name), full: r.name, pos, team: r.team, num: Number(d.dorsal) || 0, pir: r.pir, gp: r.gp, code: r.code });
  }
  const players = [...got.C, ...got.F, ...got.G];
  const ch = champOf(code);
  let coach = null;
  if (ch) {
    const ppl = await get(`${FEED}/v2/competitions/E/seasons/${code}/clubs/${ch.team}/people`);
    const cs = (ppl || []).filter(x => x.type === 'E');
    const c = cs.find(x => x.active) || cs[cs.length - 1];
    if (c) coach = { name: surname(c.person.name), full: c.person.name, team: ch.team };
  }
  const excluded = st.players.filter(p => p.gamesPlayed < MIN_GAMES && p.pir > (players.at(-1)?.pir ?? 0))
    .map(p => ({ name: p.player.name, team: p.player.team.code, gp: p.gamesPlayed, pir: p.pir }));
  return {
    season: code, label: `${code.slice(1)}-${String(Number(code.slice(1)) + 1).slice(2)}`,
    rules: { minGames: MIN_GAMES, need: NEED, sort: 'PIR per game desc' },
    complete: players.length === 10, champion: ch ? { team: ch.team, name: ch.teamName, date: ch.date } : null,
    coach, players, checked, excludedFewGames: excluded,
    source: `${FEED}/v3/competitions/E/statistics/players/traditional?seasonCode=${code}`,
  };
}

await fs.mkdir(OUT, { recursive: true });
const list = process.argv.slice(2).length ? process.argv.slice(2) : Array.from({ length: 26 }, (_, i) => `E${2000 + i}`);
const index = [];
for (const s of list) {
  try {
    const r = await season(s);
    await fs.writeFile(path.join(OUT, `${s}.json`), JSON.stringify(r, null, 1));
    index.push({ season: s, label: r.label, complete: r.complete, champion: r.champion?.team || null, coach: r.coach?.name || null });
    console.log(s, r.complete ? 'OK' : 'INCOMPLETE', r.players?.map(p => `${p.pos}:${p.name}`).join(' '));
  } catch (e) {
    console.log(s, 'ERROR', e.message); index.push({ season: s, error: e.message });
  }
}
await fs.writeFile(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
