// Δεδομένα για το Comparison Tool (build): μετρικές όλων των παικτών/ομάδων ανά σεζόν, παρόμοιοι παίκτες.
import { playerMetrics, teamTotals, teamOfRow, similarPlayers, posGroup, R } from './metrics.mjs';

export const ALL_KEYS = ['G', 'mpg', 'pir', 'pir36', 'pirmin', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fg', 'p3', 'ft', 'ts', 'efg', 'usg', 'astp', 'tovp', 'rebp', 'tsa36', 'ortg', 'drtg', 'net', 'avail', 'pts36', 'reb36', 'ast36', 'stl36', 'blk36', 'tov36'];
export const DEFAULT_KEYS = ['pir', 'pir36', 'pirmin', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'mpg', 'ts', 'efg', 'usg', 'astp', 'tovp', 'ortg', 'drtg', 'net'];
export const PER36 = { pts: 'pts36', reb: 'reb36', ast: 'ast36', stl: 'stl36', blk: 'blk36', tov: 'tov36', pir: 'pir36', pf: 'pf36' };
export const PER100 = { pts: 'pts100', reb: 'reb100', ast: 'ast100', stl: 'stl100', blk: 'blk100', tov: 'tov100', pir: 'pir100' };
const r3 = v => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
const round = m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'number' ? r3(v) : v]));

/**
 * @param players  data.players (τρέχουσα σεζόν, με game logs)
 * @param ctx      { teamName, niceName, oo (on/off ανά id|team), teamGames(team), top4, bottom4, expOf(id), rsMax }
 */
export function currentSeason(players, ctx) {
  const TT = teamTotals(players);
  const out = [];
  for (const p of players) {
    const tAt = {};
    for (const r of p.g) tAt[r[R.round]] = teamOfRow(p, r, TT);
    const tm = p.t.split(';').pop();
    const m = playerMetrics(p.g, r => TT[tAt[r[R.round]] + '|' + r[R.round]], ctx.teamGames(tm));
    const oo = ctx.oo[p.c + '|' + tm];
    if (oo && oo.on.poss >= 30) Object.assign(m, { ortg: oo.on.ortg, drtg: oo.on.drtg, net: oo.on.net, onoff: oo.diff.net });
    if (!m.G) continue;
    out.push({ id: p.c, n: ctx.niceName(p.n), t: tm, tn: ctx.teamName(tm), pos: p.pos, posL: ctx.posLabel(p.pos), nat: ctx.nat(p), age: p.age || null, h: p.h || null, exp: ctx.expOf(p.c),
      q: m.G >= 3 && (m.mpg || 0) >= 10, m: round(m), rows: p.g, tAt: p.t.includes(';') ? tAt : undefined });
  }
  const tt = Object.fromEntries(Object.entries(TT).map(([k, v]) => [k, { own: v.own, opp: v.opp }]));
  return finalize(out, { teamTot: tt, ctx: { top4: ctx.top4, bottom4: ctx.bottom4, rsMax: ctx.rsMax } });
}

// EuroCup: μόνο μέσοι όροι σεζόν από την πηγή
export function eurocupSeason(ecPlayers, ctx) {
  const out = ecPlayers.filter(p => p.gp > 0).map(p => {
    const fga = (p.a2 || 0) + (p.a3 || 0), fgm = (p.m2 || 0) + (p.m3 || 0), tsa = fga + 0.44 * (p.fta || 0);
    const m = { G: p.gp, mpg: p.min, pir: p.pir, pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov,
      pir36: p.min ? p.pir * 36 / p.min : null, pirmin: p.min ? p.pir / p.min : null, fg: fga ? fgm / fga : null, p3: p.a3 ? p.m3 / p.a3 : null, ft: p.fta ? p.ftm / p.fta : null,
      ts: tsa ? p.pts / (2 * tsa) : null, efg: fga ? (fgm + 0.5 * (p.m3 || 0)) / fga : null, tsa36: p.min ? tsa * 36 / p.min : null };
    for (const k of ['pts', 'reb', 'ast', 'stl', 'blk', 'tov']) m[k + '36'] = p.min ? p[k] * 36 / p.min : null;
    return { id: p.c, n: p.n, t: p.t, tn: ctx.teamName(p.t), pos: '', posL: '', nat: '', age: p.age || null, h: null, exp: null, q: p.gp >= 3 && p.min >= 10, m: round(m) };
  });
  return finalize(out, {});
}

// Παλαιότερες σεζόν (data.hist): βασικά στατιστικά
export function histSeason(rows, ctx) {
  const out = rows.filter(r => r[4] > 0).map(r => {
    const [id, n, t, tn, G, min, pts, reb, ast, pir] = r;
    const m = { G, mpg: min, pts, reb, ast, pir, pir36: min ? pir * 36 / min : null, pirmin: min ? pir / min : null, pts36: min ? pts * 36 / min : null, reb36: min ? reb * 36 / min : null, ast36: min ? ast * 36 / min : null };
    return { id, n: ctx.niceName(n), t, tn: ctx.teamName(t) || tn, pos: ctx.posOf(id) || '', posL: ctx.posLabel(ctx.posOf(id)), nat: '', age: null, h: null, exp: null, q: G >= 5 && min >= 10, m: round(m) };
  });
  return finalize(out, {});
}

function finalize(players, extra) {
  const Q = players.filter(p => p.q);
  const avgOf = L => { const o = {}; for (const k of ALL_KEYS.concat(Object.values(PER100))) { const v = L.map(p => p.m[k]).filter(x => x != null); o[k] = v.length ? r3(v.reduce((a, b) => a + b, 0) / v.length) : null; } return o; };
  return { players, avg: avgOf(Q), pavg: { G: avgOf(Q.filter(p => posGroup(p.pos) === 'G')), F: avgOf(Q.filter(p => posGroup(p.pos) === 'F')), C: avgOf(Q.filter(p => posGroup(p.pos) === 'C')) }, ...extra };
}

export function similarAll(season, n = 8) {
  const pool = season.players.filter(p => p.q);
  return Object.fromEntries(pool.map(p => [p.id, similarPlayers(pool, p.id, n)]));
}
