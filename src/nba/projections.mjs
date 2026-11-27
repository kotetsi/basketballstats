// NBA: προβολές παικτών για τον επόμενο αγώνα (λεπτά, πόντοι, ριμπάουντ, ασίστ, τρίποντα, PRA).
// Ίδια μηχανή με EuroLeague/GBL (projectOne του src/gbl/projections.mjs: engine-stats-x2). Πιθανότητα να παίξει:
// από τις πεντάδες του Rotowire όταν ο παίκτης αναφέρεται εκεί (Out 0, Doubt 25, Ques 50, Prob 75), αλλιώς από
// το πόσους από τους 5 τελευταίους αγώνες της ομάδας έπαιξε. Ακρίβεια: scripts/nba-proj-eval.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectOne, val } from '../gbl/projections.mjs';
import { nameKey } from './rotowire.mjs';

export const NBA_PROJ_VERSION = 'nba-proj-1';
export const NKEYS = ['pts', 'reb', 'ast', 'fg3', 'pra'];
const readJSON = async f => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return null; } };
const posG = p => { const q = String(p || '').toUpperCase(); return q.startsWith('G') || q.endsWith('G') ? 'G' : q.startsWith('C') ? 'C' : 'F'; };

/** όλα τα δεδομένα NBA: { seasons: { N2025: games }, box: { N2025: { id: box } }, cur } */
export async function loadNba(root) {
  const base = path.join(root, 'data', 'nba'), seasons = {}, box = {};
  for (const S of (await fs.readdir(base).catch(() => [])).filter(d => /^N\d{4}$/.test(d)).sort()) {
    const j = await readJSON(path.join(base, S, 'games.json')); if (!j?.games) continue;
    seasons[S] = j.games; box[S] = {};
    for (const g of j.games) if (g.box) { const b = await readJSON(path.join(base, S, 'box', `${g.id}.json`)); if (b) box[S][g.id] = b; }
  }
  return { seasons, box, cur: Object.keys(seasons).sort().at(-1) };
}

/** εμφανίσεις με τη σειρά των αγώνων: [{ i, gid, date, season, team, opp, pid, name, pos, secs, pts, reb, ast, f3m }] */
export function nbaAppearances(N) {
  const out = []; let i = 0;
  for (const S of Object.keys(N.seasons).sort()) {
    for (const g of N.seasons[S].filter(g => g.played && N.box[S][g.id]).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
      i++;
      N.box[S][g.id].teams.forEach((t, k) => { const opp = N.box[S][g.id].teams[1 - k].abbr;
        for (const p of t.players) if (!p.dnp && p.min > 0) out.push({ i, gid: g.id, date: g.date, season: S, team: t.abbr, opp, pid: p.id, name: p.name, pos: posG(p.pos), secs: p.min * 60, pts: p.pts, reb: p.reb, ast: p.ast, f3m: p.f3m, pir: 0 }); });
    }
  }
  return out;
}

/** ρυθμός λίγκας ανά λεπτό (σύνολο και ανά θέση), αθροιστικά: add(x) και get() */
export function leagueAcc() {
  const T = { m: 0 }, B = {};
  return {
    add(x) { const m = x.secs / 60, q = (B[x.pos] ||= { m: 0 }); T.m += m; q.m += m; for (const k of NKEYS) { T[k] = (T[k] || 0) + val[k](x); q[k] = (q[k] || 0) + val[k](x); } },
    get() { const per = o => Object.fromEntries(NKEYS.map(k => [k, o.m ? (o[k] || 0) / o.m : 0])); return { all: per(T), byPos: Object.fromEntries(Object.entries(B).map(([g, q]) => [g, per(q)])) }; },
  };
}

/** προβολές για τον επόμενο αγώνα κάθε ομάδας (μέσα σε 36 ώρες), με τις απουσίες του Rotowire */
export function nbaProjections(N, lineups = null, now = new Date()) {
  const A = nbaAppearances(N), S = N.cur, prevS = Object.keys(N.seasons).sort().filter(s => s < S).at(-1);
  const L = leagueAcc(); for (const x of A) if (x.season === S) L.add(x);
  const league = L.get();
  const byP = new Map(), prevBy = new Map(), teamGames = new Map();
  for (const x of A) {
    if (x.season === S) { (byP.get(x.pid) || byP.set(x.pid, []).get(x.pid)).push(x); const l = teamGames.get(x.team) || []; if (l.at(-1) !== x.gid) l.push(x.gid); teamGames.set(x.team, l); }
    else if (x.season === prevS) (prevBy.get(x.pid) || prevBy.set(x.pid, []).get(x.pid)).push(x);
  }
  const up = N.seasons[S].filter(g => !g.played && Date.parse(g.date) > +now - 3 * 3600e3 && Date.parse(g.date) < +now + 36 * 3600e3);
  const nextOf = new Map(); for (const g of up.sort((a, b) => a.date.localeCompare(b.date))) for (const t of [g.home.abbr, g.away.abbr]) if (!nextOf.has(t)) nextOf.set(t, g);
  // Rotowire: όνομα → { pct, status } ανά ομάδα
  const RW = {};
  for (const x of lineups?.games || []) for (const [abbr, T] of Object.entries(x.teams)) for (const p of [...T.starters, ...T.mayNotPlay]) {
    const k = nameKey(p.name), o = (RW[abbr] ||= {});
    o[k] = { pct: Math.min(o[k]?.pct ?? 100, p.pct), status: p.status || o[k]?.status || null, starter: !!o[k]?.starter || !p.mnp };
  }
  const games = new Map();
  for (const [pid, hist] of byP) {
    const team = hist.at(-1).team, g = nextOf.get(team); if (!g) continue;
    const rw = RW[team]?.[nameKey(hist.at(-1).name)];
    if (rw && rw.pct === 0) continue;                                  // Out
    const pr = projectOne({ hist, prev: prevBy.get(pid) || [], teamGames: teamGames.get(team) || [], league, pos: hist.at(-1).pos, keys: NKEYS });
    if (!pr) continue;
    if (rw) pr.p_play = +(rw.pct / 100).toFixed(2);
    if (!games.has(g.id)) games.set(g.id, { gid: g.id, date: g.date, home: g.home.abbr, away: g.away.abbr, players: [] });
    games.get(g.id).players.push({ pid, name: hist.at(-1).name, team, status: rw?.status || null, starter: rw?.starter ?? null, ...pr });
  }
  for (const x of games.values()) x.players.sort((a, b) => b.pra * b.p_play - a.pra * a.p_play);
  return { version: NBA_PROJ_VERSION, generated_at: now.toISOString(), lineups_at: lineups?.at || null, games: [...games.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}
