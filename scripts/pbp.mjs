// ETL: κατεβάζει play-by-play και box score για κάθε αγώνα που έχει παιχτεί (EuroLeague + EuroCup),
// τα μετατρέπει σε stints (src/analytics/pbp-core.mjs) και τα αποθηκεύει μία φορά ανά αγώνα στο data/pbp/<σεζόν>/<αγώνας>.json.
//
//   node scripts/pbp.mjs                 τρέχουσα σεζόν (νέοι αγώνες μόνο)
//   node scripts/pbp.mjs --season E2025  backfill μιας παλιότερης σεζόν
//   node scripts/pbp.mjs --max 150       όριο νέων αγώνων ανά εκτέλεση (για backfill σε δόσεις)
//   node scripts/pbp.mjs --force         ξαναϋπολογισμός ακόμη κι αν υπάρχει το αρχείο
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStints } from '../src/analytics/pbp-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONF = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8').catch(() => '{}'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const FORCE = process.argv.includes('--force');
const MAX = +arg('--max', 400);
const cur = process.env.SEASON || CONF.season || 'E2026';
const SEASONS = arg('--season') ? [arg('--season')] : [cur, 'U' + cur.slice(1)];
const FEED = 'https://feeds.incrowdsports.com/provider/euroleague-feeds';
const LIVE = 'https://live.euroleague.net/api';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.ok) { const t = await r.text(); return t ? JSON.parse(t) : null; }
      if (r.status === 404) return null;
    } catch { /* ξανά */ }
    await sleep(1200 * (i + 1));
  }
  return null;
}
const mmss = s => { const m = /^(\d+):(\d+)$/.exec(String(s || '').trim()); return m ? +m[1] * 60 + +m[2] : 0; };
const T = s => String(s ?? '').trim();

// Άθροισμα box score ομάδας από τους παίκτες (+ ομαδικά ριμπάουντ, όπου δίνονται)
function teamBox(st) {
  const z = { pts: 0, fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, tov: 0, ast: 0, stl: 0, blk: 0, pf: 0 };
  for (const p of st.PlayersStats || []) {
    z.pts += p.Points || 0; z.fgm2 += p.FieldGoalsMade2 || 0; z.fga2 += p.FieldGoalsAttempted2 || 0;
    z.fgm3 += p.FieldGoalsMade3 || 0; z.fga3 += p.FieldGoalsAttempted3 || 0; z.ftm += p.FreeThrowsMade || 0; z.fta += p.FreeThrowsAttempted || 0;
    z.oreb += p.OffensiveRebounds || 0; z.dreb += p.DefensiveRebounds || 0; z.tov += p.Turnovers || 0; z.ast += p.Assistances || 0;
    z.stl += p.Steals || 0; z.blk += p.BlocksFavour || 0; z.pf += p.FoulsCommited || 0;
  }
  const tm = st.tmr || {};
  z.oreb += tm.OffensiveRebounds || 0; z.dreb += tm.DefensiveRebounds || 0; z.tov += tm.Turnovers || 0;
  return Object.values(z);
}

async function season(code) {
  const comp = code[0];
  const dir = path.join(ROOT, 'data', 'pbp', code);
  await fs.mkdir(dir, { recursive: true });
  const have = new Set((await fs.readdir(dir)).map(f => f.replace('.json', '')));
  const res = await get(`${FEED}/v2/competitions/${comp}/seasons/${code}/games?limit=500`);
  const games = (res?.data || []).filter(g => g.status === 'result' || g.played);
  if (!games.length) { console.log(`${code}: κανένας αγώνας`); return; }
  if (process.argv.includes('--keys')) console.log(Object.keys(games[0]), JSON.stringify(games[0]).slice(0, 600));
  let done = 0, bad = 0;
  for (const g of games) {
    const gc = String(g.gameCode ?? g.code ?? String(g.identifier || '').split('_').pop());
    if (!gc || (!FORCE && have.has(gc))) continue;
    if (done >= MAX) break;
    const [pbp, box] = await Promise.all([get(`${LIVE}/PlayByPlay?gamecode=${gc}&seasoncode=${code}`), get(`${LIVE}/Boxscore?gamecode=${gc}&seasoncode=${code}`)]);
    await sleep(250);
    if (!pbp || !box?.Stats?.length) { console.log(`${code} #${gc}: χωρίς δεδομένα`); continue; }
    const A = T(pbp.CodeTeamA), B = T(pbp.CodeTeamB);
    const byTeam = Object.fromEntries(box.Stats.map(s => [T(s.PlayersStats?.[0]?.Team), s]));
    const starters = {}, pl = {};
    for (const tm of [A, B]) {
      starters[tm] = [];
      for (const p of byTeam[tm]?.PlayersStats || []) {
        const id = T(p.Player_ID); if (!id) continue;
        if (p.IsStarter) starters[tm].push(id);
        pl[id] = [T(p.Player), tm, mmss(p.Minutes), p.IsStarter ? 1 : 0, p.Plusminus ?? 0];
      }
    }
    const r = buildStints(pbp, starters);
    const ids = Object.keys(pl), ix = Object.fromEntries(ids.map((id, i) => [id, i]));
    const pack = tm => r.stints[tm].map(x => [x.p.map(id => ix[id] ?? -1), x.s, x.c, x.own, x.opp]);
    const hs = g.home?.score ?? g.local?.score, as = g.away?.score ?? g.road?.score;
    const ok = r.checks.scoreA === hs && r.checks.scoreB === as && r.checks.lostSecs <= 60;
    if (!ok) bad++;
    const out = {
      gc: +gc, r: g.round?.round ?? g.round, d: String(g.date || g.utcDate || '').slice(0, 10),
      ph: g.phaseType?.code || g.round?.phaseType?.code || g.phase || 'RS',
      h: A, a: B, hs, as, secs: r.secs,
      coach: { [A]: T(byTeam[A]?.Coach), [B]: T(byTeam[B]?.Coach) },
      box: { [A]: teamBox(byTeam[A] || {}), [B]: teamBox(byTeam[B] || {}) },
      ids, pl, st: { [A]: pack(A), [B]: pack(B) }, chk: { ...r.checks, ok },
    };
    await fs.writeFile(path.join(dir, gc + '.json'), JSON.stringify(out));
    done++;
  }
  console.log(`${code}: ${done} νέοι αγώνες${bad ? `, ${bad} με ασυμφωνία σκορ/χρόνου (σημειώνονται στο chk)` : ''}`);
}

for (const s of SEASONS) await season(s).catch(e => console.log(s, 'σφάλμα:', e.message));
