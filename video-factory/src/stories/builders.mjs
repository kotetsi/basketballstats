import { r1, findPlayer, teamName, teamColor } from '../data/model.mjs';

// Story builders turn a small parameter set into a fully resolved, data-backed story.
// Every number a video shows or says comes from story.data, which comes from the site's data.
// When a Data Studio exists, it only needs to produce the same { type, params } (see docs/DATA_STUDIO.md).

export const METRICS = {
  pir: { label: 'PIR', long: 'PIR (performance index rating)', spoken: 'PIR' },
  pts: { label: 'Points', long: 'points per game', spoken: 'points' },
  reb: { label: 'Rebounds', long: 'rebounds per game', spoken: 'rebounds' },
  ast: { label: 'Assists', long: 'assists per game', spoken: 'assists' },
};

const pub = p => ({ code: p.code, name: p.name, slug: p.slug, team: p.team, teamName: p.teamName, color: p.color, pos: p.pos });

function leaderboard(model, { metric = 'pir', scope = 'season', round, limit = 5, minGames } = {}) {
  if (!METRICS[metric]) throw new Error(`unknown metric ${metric}`);
  limit = Math.max(3, Math.min(10, +limit || 5));
  let items;
  if (scope === 'round') {
    round = +round || model.lastRound;
    items = model.players.map(p => ({ p, g: p.games.find(g => g.round === round) })).filter(x => x.g)
      .map(x => ({ ...pub(x.p), value: x.g[metric], opp: x.g.opp, oppName: teamName(x.g.opp), home: x.g.home }));
  } else {
    minGames = +minGames || Math.max(3, Math.ceil(model.lastRound * 0.5));
    items = model.players.filter(p => p.season && p.season.games >= minGames).map(p => ({ ...pub(p), value: p.season[metric], games: p.season.games }));
  }
  items.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  items = items.slice(0, limit).map((x, i) => ({ rank: i + 1, ...x }));
  if (!items.length) throw new Error('no players for this leaderboard');
  const what = scope === 'round' ? `Round ${round}` : `Season ${model.season ? model.season.replace(/^E/, '') + '-' + String(+model.season.slice(1) + 1).slice(2) : ''}`.trim();
  return {
    title: `${what}: top ${items.length} in ${METRICS[metric].label}`,
    data: { gapTop2: items.length > 1 ? r1(items[0].value - items[1].value) : null, metric, metricLabel: METRICS[metric].label, metricSpoken: METRICS[metric].spoken, scope, round: scope === 'round' ? round : null, lastRound: model.lastRound, minGames: scope === 'season' ? minGames : null, items },
  };
}

function percentile(values, v) { const s = values.filter(Number.isFinite); return s.length ? Math.round((100 * s.filter(x => x <= v).length) / s.length) : 0; }

function comparison(model, { a, b } = {}) {
  const A = findPlayer(model, a), B = findPlayer(model, b);
  if (!A || !B) throw new Error(`player not found: ${!A ? a : b}`);
  if (A.code === B.code) throw new Error('pick two different players');
  if (!A.season || !B.season) throw new Error('both players need games this season');
  const qual = model.players.filter(p => p.season && p.season.games >= Math.max(3, Math.ceil(model.lastRound * 0.4)));
  const RADAR = ['pts', 'reb', 'ast', 'stl', 'blk', 'ts'];
  const side = P => {
    const last5 = P.games.slice(-5);
    return {
      ...pub(P), games: P.season.games, pir: P.season.pir, pts: P.season.pts, reb: P.season.reb, ast: P.season.ast, min: P.season.min, ts: P.season.ts,
      last5Pir: r1(last5.reduce((s, g) => s + g.pir, 0) / (last5.length || 1)), last5Count: last5.length,
      price: P.price, projection: P.projection,
      radar: Object.fromEntries(RADAR.map(k => [k, percentile(qual.map(q => q.season[k]), P.season[k])])),
    };
  };
  const pa = side(A), pb = side(B);
  const rows = [
    { key: 'pir', label: 'PIR', a: pa.pir, b: pb.pir },
    { key: 'pts', label: 'Points', a: pa.pts, b: pb.pts },
    { key: 'reb', label: 'Rebounds', a: pa.reb, b: pb.reb },
    { key: 'ast', label: 'Assists', a: pa.ast, b: pb.ast },
    { key: 'ts', label: 'True shooting %', a: pa.ts, b: pb.ts },
  ].filter(r => r.a != null && r.b != null);
  return {
    title: `${A.name} vs ${B.name}`,
    data: { players: [pa, pb], rows, radarKeys: RADAR, radarLabels: { pts: 'Scoring', reb: 'Rebounding', ast: 'Playmaking', stl: 'Steals', blk: 'Blocks', ts: 'Efficiency' }, qualifiedCount: qual.length, lastRound: model.lastRound },
  };
}

function spotlight(model, { player, n = 8 } = {}) {
  const P = findPlayer(model, player);
  if (!P) throw new Error(`player not found: ${player}`);
  if (!P.games.length) throw new Error('player has no games');
  n = Math.max(3, Math.min(12, +n || 8));
  const games = P.games.slice(-n).map(g => ({ round: g.round, opp: g.opp, oppName: teamName(g.opp), oppColor: teamColor(g.opp), home: g.home, pir: g.pir, pts: g.pts, reb: g.reb, ast: g.ast, min: g.min }));
  const best = [...P.games].sort((x, y) => y.pir - x.pir || y.round - x.round)[0];
  const last = P.games[P.games.length - 1];
  const avgN = r1(games.reduce((s, g) => s + g.pir, 0) / games.length);
  return {
    title: `${P.name}: last ${games.length} games`,
    data: {
      player: { ...pub(P), price: P.price, projection: P.projection },
      season: P.season, games, avgLastN: avgN, n: games.length,
      best: { round: best.round, opp: best.opp, oppName: teamName(best.opp), pir: best.pir, pts: best.pts },
      last: { round: last.round, opp: last.opp, oppName: teamName(last.opp), pir: last.pir, pts: last.pts, reb: last.reb, ast: last.ast },
      aboveAvg: games.filter(g => g.pir > P.season.pir).length,
    },
  };
}

export const BUILDERS = { leaderboard, comparison, spotlight };
export const STORY_TYPES = Object.keys(BUILDERS);

export function buildStory(model, { type, params = {}, title, id, source = 'builder' }) {
  const fn = BUILDERS[type];
  if (!fn) throw new Error(`unknown story type ${type}`);
  const built = fn(model, params);
  const day = new Date().toISOString().slice(0, 10);
  return {
    id: id || `${type}-${Object.values(params).filter(v => v != null && v !== '').join('-').toLowerCase().replace(/[^a-z0-9-]+/g, '-')}-${day}`.replace(/-+/g, '-'),
    type, params, title: title || built.title, source, lang: 'en',
    status: 'draft', createdAt: new Date().toISOString(),
    dataAsOf: model.dataAsOf, lastRound: model.lastRound,
    data: built.data,
  };
}
