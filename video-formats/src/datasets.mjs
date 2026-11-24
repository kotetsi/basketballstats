import fs from 'node:fs';
import path from 'node:path';
import { loadModel } from '../../video-factory/src/data/model.mjs';

// Dataset catalog: every dataset a format may require, with availability and coverage measured
// from the real files. Formats declare requirements against these ids; nothing is assumed.

const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const tryJson = f => { try { return readJson(f); } catch { return null; } };
const listJson = d => { try { return fs.readdirSync(d).filter(f => f.endsWith('.json')); } catch { return []; } };

export function loadContext(dataDir, { season } = {}) {
  const cfg = tryJson(path.join(dataDir, '..', 'site.config.json')) || {};
  season ||= cfg.season || 'E2026';
  const cache = readJson(path.join(dataDir, 'cache.json'));
  const model = loadModel(dataDir, { season });
  const lazy = {};
  const once = (k, fn) => () => (k in lazy ? lazy[k] : (lazy[k] = fn()));

  const shotFiles = listJson(path.join(dataDir, 'shots', season));
  const pbpFiles = listJson(path.join(dataDir, 'pbp', season));
  const games = cache.league?.games || [];
  const played = games.filter(g => g[6]);
  const fixtures = tryJson(path.join(dataDir, 'matchups', 'fixtures.json'));
  const predLog = tryJson(path.join(dataDir, 'matchups', 'pred_log.json'));
  const priceHist = tryJson(path.join(dataDir, 'fantasy', 'price_hist.json'));
  const hist = cache.hist || {};
  const histSeasons = Object.keys(hist).filter(k => hist[k]?.stand?.length);
  const playersWithBio = model.players.filter((p, i) => cache.players[i]?.age && cache.players[i]?.h);

  const ds = {
    boxscores: { label: 'Player box scores (this season)', available: played.length > 0, coverage: { rounds: model.lastRound, games: played.length, players: model.players.filter(p => p.games.length).length } },
    bio: { label: 'Player bio (age, height, country, position)', available: playersWithBio.length > 50, coverage: { players: playersWithBio.length } },
    standings: { label: 'Standings with home/away records', available: (cache.league?.stand || []).length >= 10, coverage: { teams: (cache.league?.stand || []).length } },
    results: { label: 'Game results this season', available: played.length > 0, coverage: { games: played.length } },
    schedule: { label: 'Upcoming fixtures with dates', available: !!fixtures?.fixtures?.length, coverage: { fixtures: fixtures?.fixtures?.length || 0 } },
    fantasyPrices: { label: 'EuroLeague Fantasy prices', available: model.players.some(p => p.price != null), coverage: { players: model.players.filter(p => p.price != null).length } },
    priceHistory: { label: 'Fantasy price history by round', available: !!priceHist && Object.keys(priceHist).length > 50, coverage: { players: priceHist ? Object.keys(priceHist).length : 0 } },
    projections: { label: 'PIR projections for the next round', available: model.players.some(p => p.projection), coverage: { round: model.nextRound } },
    matchPredictions: { label: 'Model win probabilities per game (logged before tip-off)', available: !!predLog && Object.keys(predLog).some(k => k.startsWith('E-')), coverage: { games: predLog ? Object.keys(predLog).filter(k => k.startsWith('E-')).length : 0 } },
    shots: { label: 'Shot locations with zones and clutch flags', available: shotFiles.length >= 20, coverage: { games: shotFiles.length, ofPlayed: played.length } },
    starters: { label: 'Starting lineups (play-by-play)', available: pbpFiles.length >= 20, coverage: { games: pbpFiles.length } },
    lineups: { label: 'Lineup stints / rotations (play-by-play)', available: pbpFiles.length >= 20, coverage: { games: pbpFiles.length }, note: 'present in data/pbp (st, mu) but not yet modelled' },
    history: { label: 'Past seasons (standings, finals, player averages)', available: histSeasons.length >= 3, coverage: { seasons: histSeasons } },
    multiCompetition: { label: 'Comparable data across competitions/leagues worldwide', available: false, coverage: {}, note: 'only EuroLeague (and partial EuroCup) data exists' },
    imageLibrary: { label: 'Licensed player images', available: false, coverage: {}, note: 'Basketballstats Image Library not built yet' },
    editorialClaims: { label: 'Editor-approved claims to fact-check', available: false, coverage: {}, note: 'no claims input yet: add an editorial claims queue (dashboard) to enable' },
    careerLinks: { label: 'Player careers across seasons and leagues', available: false, coverage: {}, note: 'history has EuroLeague-only season rows; careers outside EuroLeague are not in the data' },
    fantasyRules: { label: 'Complete EuroLeague Fantasy roster rules (squad size, positions)', available: false, coverage: {}, note: 'budget (100) and per-team limit (6) are known; squad size and position slots are not in the data' },
    language_el: { label: 'Greek scripts and voice', available: false, coverage: {}, note: 'Video Factory narrates English only for now' },
  };

  return {
    dataDir, season, model, cache, datasets: ds,
    games, played, nextRound: model.nextRound, lastRound: model.lastRound,
    fixtures: () => fixtures?.fixtures || [],
    predLog: () => predLog || {},
    priceHist: () => priceHist || {},
    hist: () => hist,
    rawPlayer: once('rawPlayer', () => new Map(cache.players.map(p => [p.c, p]))),
    shots: once('shots', () => shotFiles.map(f => readJson(path.join(dataDir, 'shots', season, f)))),
    pbp: once('pbp', () => pbpFiles.map(f => readJson(path.join(dataDir, 'pbp', season, f)))),
    today: new Date(),
  };
}

/** Check a format's dataset requirements. Returns { ok, missing:[{dataset, why, detail}] } */
export function checkRequirements(ctx, requires = []) {
  const missing = [];
  for (const r of requires) {
    const d = ctx.datasets[r.dataset];
    if (!d) { missing.push({ dataset: r.dataset, why: r.why, detail: 'unknown dataset' }); continue; }
    if (!d.available) { missing.push({ dataset: r.dataset, why: r.why, detail: d.note || `${d.label} not available` }); continue; }
    for (const [k, min] of Object.entries(r.min || {})) {
      const have = Array.isArray(d.coverage[k]) ? d.coverage[k].length : d.coverage[k];
      if (!(have >= min)) missing.push({ dataset: r.dataset, why: r.why, detail: `${d.label}: ${k} ${have ?? 0} < required ${min}` });
    }
  }
  return { ok: missing.length === 0, missing };
}
