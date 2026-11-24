import { teamName, teamColor } from '../../video-factory/src/data/model.mjs';
import { r1 } from './editorial.mjs';

// Shared, tested statistical building blocks. Every function works on the real data context.

export const minGames = ctx => Math.max(3, Math.ceil(ctx.lastRound * 0.5));
export const qualified = (ctx, mg = minGames(ctx)) => ctx.model.players.filter(p => p.season && p.season.games >= mg);
export const pub = p => ({ code: p.code, name: p.name, slug: p.slug, team: p.team, teamName: p.teamName, color: p.color, pos: p.pos });

export function percentile(values, v) {
  const s = values.filter(Number.isFinite);
  return s.length ? Math.round((100 * s.filter(x => x < v).length + 50 * s.filter(x => x === v).length) / s.length) : 0;
}
export const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) || 1; };

export function seasonTotals(p) {
  const s = k => p.games.reduce((a, g) => a + g[k], 0);
  return { fga: s('fga'), fgm: s('fgm'), fg3a: s('fg3a'), fg3m: s('fg3m'), fta: s('fta'), ftm: s('ftm'), pts: s('pts'), min: s('min'), pir: s('pir') };
}
export function perGame(p) {
  const t = seasonTotals(p), g = p.games.length || 1;
  return { ...p.season, fga: r1(t.fga / g), fg3a: r1(t.fg3a / g), fta: r1(t.fta / g), fg3Rate: t.fga ? r1(100 * t.fg3a / t.fga) : 0, pirPerMin: t.min ? Math.round((t.pir / t.min) * 1000) / 1000 : 0 };
}

/** Cosine similarity of z-scored per-game profiles. */
export const PROFILE = ['pts', 'reb', 'ast', 'stl', 'blk', 'fg3Rate', 'ts', 'min'];
export function profiles(players) {
  const rows = players.map(p => ({ p, v: perGame(p) }));
  const stats = Object.fromEntries(PROFILE.map(k => { const a = rows.map(r => r.v[k] ?? 0); return [k, { m: mean(a), s: sd(a) }]; }));
  return rows.map(r => ({ ...r, z: PROFILE.map(k => ((r.v[k] ?? 0) - stats[k].m) / stats[k].s) }));
}
export function cosine(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; } return na && nb ? d / Math.sqrt(na * nb) : 0; }

/** Team per-game profiles aggregated from player box scores; opponent points from results. */
export function teamProfiles(ctx) {
  const T = {};
  for (const p of ctx.model.players) for (const g of p.games) {
    const k = `${p.team}|${g.round}`;
    const t = (T[k] ||= { team: p.team, round: g.round, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fga: 0, fgm: 0, fg3a: 0, fta: 0 });
    for (const s of ['pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fga', 'fgm', 'fg3a', 'fta']) t[s] += g[s];
  }
  const by = {};
  for (const t of Object.values(T)) (by[t.team] ||= []).push(t);
  const against = {};
  for (const g of ctx.played) { (against[g[2]] ||= []).push(g[5]); (against[g[3]] ||= []).push(g[4]); }
  const out = {};
  for (const [team, gs] of Object.entries(by)) {
    const s = k => gs.reduce((a, g) => a + g[k], 0), n = gs.length;
    out[team] = {
      team, name: teamName(team), color: teamColor(team), games: n,
      pts: r1(s('pts') / n), reb: r1(s('reb') / n), ast: r1(s('ast') / n), tov: r1(s('tov') / n), stocks: r1((s('stl') + s('blk')) / n),
      fg3Rate: r1(100 * s('fg3a') / (s('fga') || 1)), astRate: r1(100 * s('ast') / (s('fgm') || 1)), ftRate: r1(100 * s('fta') / (s('fga') || 1)),
      ptsAllowed: against[team]?.length ? r1(mean(against[team])) : null,
    };
  }
  return out;
}

export const ZONE_LABEL = { rim: 'At the rim', paint: 'Paint', mid: 'Mid-range', c3l: 'Left corner 3', c3r: 'Right corner 3', w3l: 'Left wing 3', w3r: 'Right wing 3', top3: 'Top of the key 3' };
/** Shots by player code: [{zone, made, three, clutch, home}] */
export function shotsByPlayer(ctx) {
  const by = new Map();
  for (const g of ctx.shots()) {
    for (const s of g.s || []) {
      const code = g.ids[s[0]];
      if (!code) continue;
      (by.get(code) || by.set(code, []).get(code)).push({ made: !!s[4], three: !!s[5], zone: s[8], clutch: !!s[11] });
    }
  }
  return by;
}
export function zoneProfile(shots) {
  const n = shots.length || 1, z = {};
  for (const k of Object.keys(ZONE_LABEL)) {
    const a = shots.filter(s => s.zone === k);
    if (a.length) z[k] = { att: a.length, made: a.filter(s => s.made).length, share: r1(100 * a.length / n), fg: r1(100 * a.filter(s => s.made).length / a.length) };
  }
  return z;
}

/** Starter flags from play-by-play: Map(`${round}|${code}`) → true/false */
export function starters(ctx) {
  const m = new Map();
  for (const g of ctx.pbp()) for (const [pid, v] of Object.entries(g.pl || {})) m.set(`${g.r}|${pid.replace(/^P/, '')}`, v[3] === 1);
  return m;
}

/** Model predictions vs results: [{round, home, away, p (home win), homeWon, correct, upset}] */
export function predictionsVsResults(ctx) {
  const res = new Map(ctx.played.map(g => [`E-${g[0]}-${g[2]}-${g[3]}`, g]));
  const out = [];
  for (const [k, v] of Object.entries(ctx.predLog())) {
    const g = res.get(k); const p = v?.last?.p ?? v?.first?.p;
    if (!g || p == null) continue;
    const homeWon = g[4] > g[5];
    out.push({ key: k, round: g[0], home: g[2], away: g[3], hs: g[4], as: g[5], p, homeWon, correct: (p >= 0.5) === homeWon, favProb: Math.max(p, 1 - p) });
  }
  return out.sort((a, b) => a.round - b.round);
}

export const fixturesNext = ctx => ctx.fixtures().filter(x => x.comp === 'E' && new Date(x.t) >= new Date(ctx.today.getTime() - 3 * 3600e3)).sort((a, b) => a.t.localeCompare(b.t));
export const ageOf = (ctx, code) => ctx.rawPlayer().get(code)?.age ?? null;
