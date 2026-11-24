// Intelligence Engine — κοινό επίπεδο δεδομένων (Φάση 2).
// Κανονικοποιημένη, ΠΑΡΑΓΟΜΕΝΗ όψη πάνω στα υπάρχοντα αρχεία (data/cache.json, data/fantasy/hist/E20xx.json).
// Δεν αλλάζει κανένα αρχείο και δεν αντικαθιστά το σχήμα που χρησιμοποιούν οι σελίδες: το build.mjs συνεχίζει
// να διαβάζει το cache.json όπως πριν. Καθαρές, ντετερμινιστικές συναρτήσεις: ίδια είσοδος → ίδια έξοδος.
//
// Ταυτότητες (τεκμηρίωση: docs/INTELLIGENCE_ENGINE_AUDIT.md §B):
//   player_id = κωδικός EuroLeague (π.χ. "003469"): ΔΕΝ δημιουργείται νέα ταυτότητα
//   team_id   = κωδικός ομάδας EuroLeague (π.χ. "OLY")
//   game_id   = "{season}-{round}-{home}-{away}" (π.χ. "E2026-13-TEL-DUB")· legacy_gid = "E-13-TEL-DUB" όπως στο ledger/odds

export const DATA_VERSION = 'engine-data-1';
export const DEFAULT_SOURCE = 'feeds.incrowdsports.com (official EuroLeague feed)';

/** θέσεις της γραμμής αγώνα παίκτη (players[].g[]) — ίδιες στο cache.json και στα data/fantasy/hist */
export const ROW = Object.freeze({
  round: 0, date: 1, opp: 2, home: 3, team_pts: 4, opp_pts: 5, started: 6, secs: 7, points: 8,
  fg2m: 9, fg2a: 10, fg3m: 11, fg3a: 12, ftm: 13, fta: 14, oreb: 15, dreb: 16, assists: 17, steals: 18,
  turnovers: 19, blocks: 20, blocks_against: 21, fouls: 22, fouls_drawn: 23, plus_minus: 24, pir: 25,
});
export const ROW_LEN = 26;

export const gameId = (season, round, home, away) => `${season}-${round}-${home}-${away}`;
export const legacyGid = (comp, round, home, away) => `${comp}-${round}-${home}-${away}`;

/** ημερομηνία αγώνα του league.games: είτε ISO είτε η συμπτυγμένη μορφή του build ("MMDDHHmm" + τελευταίο ψηφίο έτους).
 *  Το έτος βγαίνει από τη σεζόν (E2026 → 2026 ή 2027), όπως στο build.mjs. Επιστρέφει ISO UTC ή null. */
export function decodeGameDate(enc, season) {
  if (enc == null) return null;
  const s = String(enc);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s); return Number.isNaN(+d) ? null : d.toISOString(); }
  if (!/^\d{9}$/.test(s)) return null;
  const yr = +String(season).slice(1), dg = +s[8];
  if (!Number.isFinite(yr)) return null;
  const y = Math.floor(yr / 10) * 10 + dg + (dg < yr % 10 ? 10 : 0);
  const iso = `${y}-${s.slice(0, 2)}-${s.slice(2, 4)}T${s.slice(4, 6)}:${s.slice(6, 8)}:00.000Z`;
  return Number.isNaN(+new Date(iso)) ? null : iso;
}

/** κατάσταση διαθεσιμότητας από τον χάρτη τραυματιών του build ({ m, k }). Δεν «εφευρίσκει» κατάσταση:
 *  χωρίς γνωστή απουσία επιστρέφει 'no_known_absence', όχι 'available'. */
export function availabilityOf(entry) {
  if (!entry) return 'no_known_absence';
  return { inj: 'injured', out: 'out', dbt: 'doubtful', miss: 'missed_recent_games' }[entry.k] || (entry.m === 1 ? 'injured' : entry.m === 2 ? 'doubtful' : 'missed_recent_games');
}

/**
 * Κανονικοποίηση μίας σεζόν.
 * @param raw  { players, league: { games, stand? }, fetchedAt?, source? } — cache.json ή data/fantasy/hist/E20xx.json
 * @param opts { season, comp = 'E', source, teamNames = {code: name}, availability = {code: {m,k}} }
 * @returns { meta, players, teams, games, player_games, issues } — issues: αντιστοιχίσεις που απέτυχαν (όχι σφάλματα validation)
 */
export function normalizeSeason(raw, { season, comp = 'E', source = null, teamNames = {}, availability = {} } = {}) {
  if (!raw || !Array.isArray(raw.players) || !Array.isArray(raw.league?.games)) throw new TypeError('normalizeSeason: χρειάζονται players[] και league.games[]');
  if (!/^[EU]\d{4}$/.test(String(season || ''))) throw new TypeError(`normalizeSeason: μη έγκυρη σεζόν «${season}»`);
  const src = source || raw.source || DEFAULT_SOURCE, fetchedAt = raw.fetchedAt || null;
  const issues = [];

  const games = raw.league.games.map(g => {
    const [round, enc, home, away, hs, as, played] = g;
    return {
      game_id: gameId(season, round, home, away), legacy_gid: legacyGid(comp, round, home, away), season, comp, round,
      date: decodeGameDate(enc, season), home_team: home, away_team: away,
      home_score: played ? hs : null, away_score: played ? as : null, game_status: played ? 'final' : 'scheduled',
      source: src, fetched_at: fetchedAt,
    };
  });
  const seen = new Set();
  for (const g of games) { if (seen.has(g.game_id)) issues.push({ code: 'duplicate_game_id', ref: g.game_id }); seen.add(g.game_id); }
  // ευρετήριο: (round, ομάδα) → αγώνες της αγωνιστικής (συνήθως 1· στα playoffs μπορεί περισσότεροι)
  const byRoundTeam = new Map();
  for (const g of games) for (const t of [g.home_team, g.away_team]) { const k = `${g.round}|${t}`; (byRoundTeam.get(k) || byRoundTeam.set(k, []).get(k)).push(g); }

  const teamSet = new Set(games.flatMap(g => [g.home_team, g.away_team]));
  const teams = [...teamSet].sort().map(t => ({ team_id: t, team_name: teamNames[t] || t, league: comp === 'E' ? 'EuroLeague' : 'EuroCup', season }));

  const players = [], player_games = [];
  for (const p of raw.players) {
    const teamsOf = String(p.t || '').split(';').filter(Boolean);
    players.push({
      player_id: p.c, player_name: p.n, team_id: teamsOf.at(-1) || null, teams: teamsOf, position: p.pos || null,
      nationality: p.ct || null, active_status: availabilityOf(availability[p.c]), season,
    });
    for (const r of p.g || []) {
      if (!Array.isArray(r) || r.length < ROW_LEN) { issues.push({ code: 'short_row', ref: `${p.c}|${r?.[0]}` }); continue; }
      const round = r[ROW.round], opp = r[ROW.opp], home = r[ROW.home] === 1;
      // ο αγώνας: ίδια αγωνιστική, ο αντίπαλος στη σωστή πλευρά και η «δική μας» ομάδα ανάμεσα στις ομάδες του παίκτη
      const cands = (byRoundTeam.get(`${round}|${opp}`) || []).filter(g => (home ? g.away_team === opp : g.home_team === opp)
        && (teamsOf.length === 0 || teamsOf.includes(home ? g.home_team : g.away_team)));
      const day = String(r[ROW.date] || '').slice(0, 10);
      const g = cands.length > 1 ? cands.find(x => (x.date || '').slice(0, 10) === day) || null : cands[0] || null;
      if (!g) { issues.push({ code: cands.length > 1 ? 'ambiguous_game' : 'unmatched_game', ref: `${p.c}|${round}|${opp}` }); continue; }
      const team = home ? g.home_team : g.away_team;
      player_games.push({
        game_id: g.game_id, player_id: p.c, team_id: team, opp_id: opp, season, round, date: g.date, home,
        started: r[ROW.started] === 1, seconds: r[ROW.secs], minutes: Math.round(r[ROW.secs] / 6) / 10,
        points: r[ROW.points], rebounds: r[ROW.oreb] + r[ROW.dreb], oreb: r[ROW.oreb], dreb: r[ROW.dreb],
        assists: r[ROW.assists], steals: r[ROW.steals], blocks: r[ROW.blocks], blocks_against: r[ROW.blocks_against],
        turnovers: r[ROW.turnovers], fouls: r[ROW.fouls], fouls_drawn: r[ROW.fouls_drawn],
        three_pointers_made: r[ROW.fg3m], three_pointers_attempted: r[ROW.fg3a],
        two_pointers_made: r[ROW.fg2m], two_pointers_attempted: r[ROW.fg2a],
        free_throws_made: r[ROW.ftm], free_throws_attempted: r[ROW.fta],
        plus_minus: r[ROW.plus_minus], pir: r[ROW.pir], team_pts: r[ROW.team_pts], opp_pts: r[ROW.opp_pts],
        source: src, fetched_at: fetchedAt,
      });
    }
  }
  return { meta: { version: DATA_VERSION, season, comp, source: src, fetched_at: fetchedAt }, players, teams, games, player_games, issues };
}
