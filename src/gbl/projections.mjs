// Stoiximan GBL: προβολές παικτών για τον επόμενο αγώνα (λεπτά, πόντοι, ριμπάουντ, ασίστ, τρίποντα, PIR).
// Ίδια μέθοδος με την EuroLeague (engine-stats-x2, src/engine/projections.mjs): ρυθμός ανά λεπτό με μισή ζωή 16 αγώνες,
// shrinkage προς τον ρυθμό της προηγούμενης σεζόν του παίκτη και της θέσης του, λεπτά από τον εκθετικό μέσο όρο.
// Διαφορά: στη GBL δεν έχουμε μοντέλο λεπτών (hurdle) ούτε λίστα τραυματιών, άρα η πιθανότητα να παίξει βγαίνει από
// το πόσους από τους τελευταίους αγώνες της ομάδας έπαιξε. Η ακρίβεια μετριέται στο scripts/gbl-proj-eval.mjs.
import { project } from '../odds/props.mjs';
import { STATS_MODEL, posGroup } from '../engine/projections.mjs';

export const GBL_PROJ_VERSION = 'gbl-proj-1';
export const KEYS = ['pts', 'reb', 'ast', 'fg3', 'pir'];
const P = STATS_MODEL.P, PREV_W = STATS_MODEL.prevWeight;

// γραμμή στη μορφή που περιμένει το project() του props.mjs: r[7] δευτερόλεπτα, r[8] πόντοι, r[11] τρίποντα, r[15]+r[16] ριμπ., r[17] ασίστ
const row = (i, x) => { const r = new Array(18).fill(0); r[0] = i; r[7] = x.secs; r[8] = x.pts; r[11] = x.f3m; r[15] = x.reb; r[17] = x.ast; return r; };
const val = { pts: x => x.pts, reb: x => x.reb, ast: x => x.ast, fg3: x => x.f3m, pir: x => x.pir };

/** όλες οι εμφανίσεις παικτών (με τη σειρά των αγώνων): [{ i, gid, date, season, team, pid, secs, pts, reb, ast, f3m, pir }] */
export function appearances(G) {
  const out = []; let i = 0;
  for (const S of Object.keys(G.seasons).sort()) {
    const games = G.seasons[S].filter(g => g.played).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id));
    for (const g of games) {
      const b = (G.boxAll?.[S] || (S === G.cur ? G.box : {}))[g.id]; if (!b) continue;
      i++;
      b.teams.forEach((t, k) => { const team = k === 0 ? g.home.logo : g.away.logo; for (const p of t.players) out.push({ i, gid: g.id, date: g.date, season: S, team, opp: k === 0 ? g.away.logo : g.home.logo, pid: p.pid, secs: p.secs || 0, pts: p.pts, reb: p.reb, ast: p.ast, f3m: p.f3m, pir: p.pir }); });
    }
  }
  return out;
}

/** ρυθμός ανά λεπτό της λίγκας (σύνολο και ανά θέση) από εμφανίσεις */
export function rates(list, posOf) {
  const T = { m: 0 }, B = {};
  for (const x of list) {
    if (!(x.secs > 0)) continue;
    const m = x.secs / 60, g = posOf(x.pid), q = (B[g] ||= { m: 0 });
    T.m += m; q.m += m;
    for (const k of KEYS) { T[k] = (T[k] || 0) + val[k](x); q[k] = (q[k] || 0) + val[k](x); }
  }
  const per = o => Object.fromEntries(KEYS.map(k => [k, o.m ? (o[k] || 0) / o.m : 0]));
  return { all: per(T), byPos: Object.fromEntries(Object.entries(B).map(([g, q]) => [g, per(q)])) };
}

/**
 * Προβολή ενός παίκτη με ό,τι έγινε ΠΡΙΝ από τον αγώνα-στόχο.
 * hist: οι εμφανίσεις του παίκτη στη σεζόν (μόνο πριν), prev: της προηγούμενης σεζόν, teamGames: οι πρόσφατοι αγώνες της ομάδας (gid)
 */
export function projectOne({ hist, prev = [], teamGames = [], league, pos, params = null }) {
  const PP = params ? { ...P, ...params } : P, PW = params?.prevWeight ?? PREV_W;
  const played = hist.filter(x => x.secs > 0);
  if (played.length < 3) return null;
  const last = teamGames.slice(-5), inLast = last.filter(gid => hist.some(x => x.gid === gid && x.secs > 0)).length;
  if (last.length >= 3 && !teamGames.slice(-3).some(gid => hist.some(x => x.gid === gid && x.secs > 0))) return null;   // εκτός στους 3 τελευταίους: μάλλον τραυματίας ή έφυγε
  const p_play = last.length ? Math.max(0.2, inLast / last.length) : 1;
  const lg = (pos && league.byPos[posGroup(pos)]) || league.all;
  const pm = prev.filter(x => x.secs > 0).reduce((a, x) => a + x.secs / 60, 0);
  const rows = played.map((x, j) => row(j, x));
  const out = { n: played.length, p_play: +p_play.toFixed(2) };
  for (const k of KEYS) {
    const prior = pm ? (prev.reduce((a, x) => a + (x.secs > 0 ? val[k](x) : 0), 0) + PW * lg[k]) / (pm + PW) : lg[k];
    // το project() ξέρει πόντους/ριμπάουντ/ασίστ/τρίποντα· για το PIR βάζουμε το PIR στη θέση των πόντων
    const r = k === 'pir' ? played.map((x, j) => row(j, { ...x, pts: x.pir })) : rows;
    const pr = project(r, k === 'pir' ? 'pts' : k, { prior, P: PP });
    if (!pr) return null;
    out[k] = +pr.mu.toFixed(2);
    if (k === 'pts') out.min = +pr.min.toFixed(1);
  }
  return out;
}

/** προβολές για τον επόμενο αγώνα κάθε ομάδας της τρέχουσας σεζόν → { version, games: [{ gid, date, round, home, away, players: [...] }] } */
export function gblProjections(G) {
  const A = appearances(G), S = G.cur, prevS = Object.keys(G.seasons).sort().filter(s => s < S).at(-1);
  const posOf = pid => G.players?.[pid]?.pos || '';
  const cur = A.filter(x => x.season === S), league = rates(cur, posOf);
  const byP = new Map(); for (const x of cur) { if (!byP.has(x.pid)) byP.set(x.pid, []); byP.get(x.pid).push(x); }
  const prevBy = new Map(); for (const x of A.filter(x => x.season === prevS)) { if (!prevBy.has(x.pid)) prevBy.set(x.pid, []); prevBy.get(x.pid).push(x); }
  const teamGames = new Map(); for (const x of cur) { const l = teamGames.get(x.team) || []; if (l.at(-1) !== x.gid) l.push(x.gid); teamGames.set(x.team, l); }
  const upcoming = G.seasons[S].filter(g => !g.played).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const nextOf = new Map(); for (const g of upcoming) for (const t of [g.home.logo, g.away.logo]) if (!nextOf.has(t)) nextOf.set(t, g);
  const games = new Map();
  for (const [pid, hist] of byP) {
    const team = hist.at(-1).team, g = nextOf.get(team); if (!g) continue;
    const pr = projectOne({ hist, prev: prevBy.get(pid) || [], teamGames: teamGames.get(team) || [], league, pos: posOf(pid) });
    if (!pr) continue;
    if (!games.has(g.id)) games.set(g.id, { gid: g.id, date: g.date, round: g.round, stage: g.stage, home: g.home.logo, away: g.away.logo, players: [] });
    games.get(g.id).players.push({ pid, team, ...pr });
  }
  for (const x of games.values()) x.players.sort((a, b) => b.pir * b.p_play - a.pir * a.p_play);
  return { version: GBL_PROJ_VERSION, games: [...games.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))) };
}
