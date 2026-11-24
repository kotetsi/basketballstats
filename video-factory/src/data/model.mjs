import fs from 'node:fs';
import path from 'node:path';

// Reads the site's own data files (data/cache.json, data/fantasy/latest.json,
// data/projections/latest.json) and builds a compact model for stories. Read-only.

export const COL = { round: 0, date: 1, opp: 2, home: 3, seconds: 7, pts: 8, fg2m: 9, fg2a: 10, fg3m: 11, fg3a: 12, ftm: 13, fta: 14, oreb: 15, dreb: 16, ast: 17, stl: 18, tov: 19, blk: 20, pir: 25 };

// code → English name, colour (same colours as the site's TEAMS table in build.mjs)
export const TEAMS = {
  OLY: ['Olympiacos', '#c8102e'], PAN: ['Panathinaikos', '#007a3d'], MAD: ['Real Madrid', '#5b4a9b'], ULK: ['Fenerbahce', '#1d3c8f'],
  PAR: ['Partizan', '#3b3b3b'], RED: ['Crvena Zvezda', '#b3122e'], BAR: ['Barcelona', '#a50044'], ASV: ['ASVEL', '#1a1a1a'],
  ZAL: ['Zalgiris', '#00703c'], HTA: ['Hapoel Tel Aviv', '#d71920'], VIR: ['Virtus Bologna', '#222222'], BES: ['Besiktas', '#2a2a2a'],
  BAS: ['Baskonia', '#1b3a6b'], MIL: ['Olimpia Milano', '#c8102e'], DUB: ['Dubai Basketball', '#0a6e8a'], PAM: ['Valencia Basket', '#e46b11'],
  TEL: ['Maccabi Tel Aviv', '#d9a400'], IST: ['Anadolu Efes', '#003b7a'], PRS: ['Paris Basketball', '#2b2b2b'], MUN: ['Bayern Munich', '#c8102e'],
};
export const teamName = c => TEAMS[c]?.[0] || c;
export const teamColor = c => TEAMS[c]?.[1] || '#e4572e';

export const niceName = n => {
  const [a, b] = String(n).split(',').map(s => s.trim());
  const cap = s => s.toLowerCase().replace(/(^|[\s\-'.])(\p{L})/gu, (m, p, c) => p + c.toUpperCase()).replace(/\b(Ii|Iii|Iv|Tj|Cj|Dj|Aj|Jj)\b/g, m => m.toUpperCase());
  return b ? `${cap(b)} ${cap(a)}` : cap(a);
};
export const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const r1 = x => Math.round(x * 10) / 10;
const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const tryJson = f => { try { return readJson(f); } catch { return null; } };

export function loadModel(dataDir, { season } = {}) {
  const cache = readJson(path.join(dataDir, 'cache.json'));
  const fantasy = tryJson(path.join(dataDir, 'fantasy', 'latest.json'));
  const projections = tryJson(path.join(dataDir, 'projections', 'latest.json'));
  season ||= tryJson(path.join(dataDir, '..', 'site.config.json'))?.season || null;
  return buildModel(cache, fantasy, projections, { season });
}

export function buildModel(cache, fantasy, projections, { season = null } = {}) {
  const fx = new Map((fantasy?.players || []).map(p => [p.c, p]));
  const pj = new Map((projections?.players || []).map(p => [p.player_id, p]));
  const used = new Set();
  const players = [];
  for (const p of cache.players || []) {
    let slug = slugify(niceName(p.n)) || p.c;
    if (used.has(slug)) slug += '-' + p.c;
    used.add(slug);
    const games = (p.g || []).filter(r => r[COL.seconds] > 0).sort((a, b) => a[COL.round] - b[COL.round]).map(r => ({
      round: r[COL.round], date: r[COL.date], opp: r[COL.opp], home: r[COL.home] === 1,
      min: r1(r[COL.seconds] / 60), pts: r[COL.pts], reb: r[COL.oreb] + r[COL.dreb], ast: r[COL.ast], stl: r[COL.stl], blk: r[COL.blk], tov: r[COL.tov], pir: r[COL.pir],
      fgm: r[COL.fg2m] + r[COL.fg3m], fga: r[COL.fg2a] + r[COL.fg3a], fg3m: r[COL.fg3m], fg3a: r[COL.fg3a], ftm: r[COL.ftm], fta: r[COL.fta],
    }));
    const team = String(p.t).split(';').pop();
    const sum = k => games.reduce((s, g) => s + g[k], 0);
    const tsa = sum('fga') + 0.44 * sum('fta');
    const f = fx.get(p.c), j = pj.get(p.c);
    players.push({
      code: p.c, rawName: p.n, name: niceName(p.n), slug, team, teamName: teamName(team), color: teamColor(team),
      pos: f?.pos || p.pos || '', games,
      season: games.length ? {
        games: games.length, min: r1(avg(games.map(g => g.min))), pts: r1(avg(games.map(g => g.pts))), reb: r1(avg(games.map(g => g.reb))),
        ast: r1(avg(games.map(g => g.ast))), stl: r1(avg(games.map(g => g.stl))), blk: r1(avg(games.map(g => g.blk))), pir: r1(avg(games.map(g => g.pir))),
        ts: tsa ? r1((100 * sum('pts')) / (2 * tsa)) : null,
      } : null,
      price: f && Number.isFinite(f.price) ? f.price : null,
      projection: j?.pir?.mean_exp != null ? { round: projections.round, pir: r1(j.pir.mean_exp), opp: j.opp_id, home: j.home === 1, quality: j.quality } : null,
    });
  }
  const lastRound = cache.lastRound ?? Math.max(0, ...players.flatMap(p => p.games.map(g => g.round)));
  return {
    season: season || cache.season || null,
    lastRound,
    nextRound: projections?.round ?? fantasy?.round ?? null,
    dataAsOf: cache.fetchedAt || null,
    players,
    byCode: new Map(players.map(p => [p.code, p])),
    bySlug: new Map(players.map(p => [p.slug, p])),
  };
}

export function findPlayer(model, ref) {
  if (!ref) return null;
  const s = String(ref).trim();
  return model.byCode.get(s) || model.bySlug.get(s) || model.bySlug.get(slugify(s)) ||
    model.players.find(p => slugify(p.rawName.split(',')[0]) === slugify(s)) || null;
}
