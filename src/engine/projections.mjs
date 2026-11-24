// Intelligence Engine — κοινές προβλέψεις παικτών (Φάση 3). Καθαρές, ντετερμινιστικές συναρτήσεις.
// Ένα σύνολο προβλέψεων για Fantasy ΚΑΙ props: ίδια λεπτά, ίδια διαθεσιμότητα, ίδιες κατανομές.
// Επικύρωση: docs/MODEL_EVALUATION.md §3.1 (λεπτά), §4 (στατιστικά, PIR).
import { STATS, PARAMS, project, pOver, pmf } from '../odds/props.mjs';
import { decodeGameDate } from './data.mjs';

export const ENGINE_VERSION = 'engine-proj-1';
export const STATS_MODEL = Object.freeze({
  version: 'engine-stats-x1',
  // επιλεγμένες σε walk-forward 7 σεζόν (scripts/engine-stats-compare.mjs): ρυθμός με μισή ζωή 16 αγώνες, shrinkage 80 λεπτών
  // προς prior = ρυθμός της προηγούμενης σεζόν του παίκτη (βάρος 100 λεπτά) σμικρυμένος προς τη λίγκα, λεπτά από το hurdle
  P: { ...PARAMS, rateHalf: 16, prior: 80, minSd: 6, disp: { ...PARAMS.disp, pts: 2.5 } },
  prevWeight: 100,
});
export const STAT_KEYS = ['pts', 'reb', 'ast', 'fg3'];
/** σκάλα ορίων (ρυθμιζόμενη από site.config.json → engine.ladder) */
export const DEFAULT_LADDER = Object.freeze({ pts: [5.5, 10.5, 15.5, 20.5], reb: [2.5, 4.5, 6.5, 8.5], ast: [1.5, 3.5, 5.5], fg3: [0.5, 1.5, 2.5] });
/** πολλαπλασιαστής διαθεσιμότητας, ίδιος με το fantasy/run.py */
export const STATUS_MULT = Object.freeze({ playing: 1, doubtful: 0.4, injured: 0, rest: 0 });
export const MIN_GAMES = 3;           // όπως το project() των props
export const EXPERIMENTAL_BELOW = 6;  // λίγοι αγώνες φέτος και χωρίς προηγούμενη σεζόν ⇒ «πειραματικό»

/** ρυθμός λίγκας ανά λεπτό από τους αγώνες ΠΡΙΝ από την αγωνιστική-στόχο */
export function leagueRates(players, beforeRound) {
  const out = {}; let m = 0; const x = Object.fromEntries(STAT_KEYS.map(s => [s, 0]));
  for (const p of players) for (const r of p.g || []) if (r[7] > 0 && r[0] < beforeRound) { m += r[7] / 60; for (const s of STAT_KEYS) x[s] += STATS[s](r); }
  for (const s of STAT_KEYS) out[s] = m ? x[s] / m : 0;
  return out;
}

/** ρυθμός κάθε παίκτη στην προηγούμενη σεζόν (ολόκληρη: είναι παρελθόν) → Map(c → { m, x: {stat: σύνολο} }) */
export function prevSeasonRates(prevPlayers = []) {
  const out = new Map();
  for (const p of prevPlayers) {
    let m = 0; const x = Object.fromEntries(STAT_KEYS.map(s => [s, 0]));
    for (const r of p.g || []) if (r[7] > 0) { m += r[7] / 60; for (const s of STAT_KEYS) x[s] += STATS[s](r); }
    if (m > 0) out.set(p.c, { m, x });
  }
  return out;
}

export const nbMedian = (mu, v) => { let c = 0; for (let k = 0; k < 200; k++) { c += pmf(k, mu, v); if (c >= 0.5) return k; } return Math.round(mu); };

/**
 * Πρόβλεψη ενός παίκτη για την αγωνιστική-στόχο.
 * @param p        παίκτης του cache.json ({ c, n, t, pos, g })
 * @param ctx      { round, minutes: { p_play, min_if_plays, min_exp, opp, home }, league, prev (prevSeasonRates entry),
 *                   status ('playing'|'doubtful'|'injured'|'rest'), statusSrc, ppm (PIR/λεπτό του Fantasy), ladder }
 * Τα στατιστικά και οι πιθανότητες της σκάλας είναι «αν παίξει» (όπως τα props: void αν δεν παίξει).
 * Τα *_exp περιλαμβάνουν την πιθανότητα να μην παίξει (για το Fantasy).
 */
export function projectPlayer(p, ctx) {
  const { round, minutes, league, prev = null, status = 'playing', statusSrc = 'none', ppm = null, ladder = DEFAULT_LADDER } = ctx;
  const hist = (p.g || []).filter(r => r[0] < round && r[7] > 0).sort((a, b) => a[0] - b[0]);   // μόνο το παρελθόν
  const mult = STATUS_MULT[status] ?? 1;
  const base = { player_id: p.c, player_name: p.n, team_id: String(p.t || '').split(';').pop(), opp_id: minutes?.opp ?? null, home: minutes?.home ?? null,
    status, status_src: statusSrc, n_games: hist.length, has_prev_season: !!prev };
  const flags = [];
  if (!minutes) flags.push('no_minutes_model');
  if (hist.length < MIN_GAMES) flags.push('few_games');
  if (status === 'doubtful') flags.push('doubtful');
  if (mult === 0) flags.push('not_expected_to_play');
  if (!minutes || hist.length < MIN_GAMES) return { ...base, quality: 'insufficient', flags, minutes: null, stats: null, pir: null };

  const p_play = +(minutes.p_play * mult).toFixed(4);
  const mIf = minutes.min_if_plays;
  const stats = {};
  for (const s of STAT_KEYS) {
    const pv = prev ? (prev.x[s] + STATS_MODEL.prevWeight * league[s]) / (prev.m + STATS_MODEL.prevWeight) : league[s];
    const pr = project(hist, s, { prior: pv, minutes: mIf, P: STATS_MODEL.P });
    stats[s] = { mean: +pr.mu.toFixed(2), median: nbMedian(pr.mu, pr.var), sd: +Math.sqrt(pr.var).toFixed(2), mean_exp: +(pr.mu * p_play).toFixed(2),
      rate_pm: +pr.rate.toFixed(4), over: Object.fromEntries((ladder[s] || []).map(L => [String(L), +pOver(pr.mu, pr.var, L).toFixed(4)])) };
  }
  const pir = ppm != null ? { per_min: ppm, mean: +(ppm * mIf).toFixed(1), mean_exp: +(ppm * mIf * p_play).toFixed(1) } : null;
  if (!pir) flags.push('no_pir_model');
  const quality = flags.includes('not_expected_to_play') ? 'out' : (hist.length < EXPERIMENTAL_BELOW && !prev) ? 'experimental' : flags.includes('doubtful') ? 'uncertain' : 'ok';
  return { ...base, quality, flags, minutes: { p_play, if_plays: mIf, expected: +(mIf * p_play).toFixed(2) }, stats, pir };
}

/** όλοι οι παίκτες της αγωνιστικής-στόχου */
export function buildProjections({ cache, prevPlayers = [], minutesFile, fantasy = null, ladder = DEFAULT_LADDER, now = new Date() }) {
  const round = minutesFile.round;
  const league = leagueRates(cache.players, round), PREV = prevSeasonRates(prevPlayers);
  const FX = new Map((fantasy?.round === round ? fantasy.players : []).map(x => [x.c, x]));
  const P = new Map(cache.players.map(p => [p.c, p]));
  const tips = cache.league.games.filter(g => g[0] === round).map(g => decodeGameDate(g[1], minutesFile.season)).filter(Boolean).sort();
  const firstTip = tips[0] ?? null;
  const players = [];
  for (const [c, m] of Object.entries(minutesFile.players)) {
    const p = P.get(c); if (!p) continue;
    const fx = FX.get(c);
    players.push(projectPlayer(p, { round, minutes: m, league, prev: PREV.get(c) || null, status: fx?.status || 'playing', statusSrc: fx?.status_src || (fx ? 'fantasy' : 'none'), ppm: fx?.ppm ?? null, ladder }));
  }
  players.sort((a, b) => (b.pir?.mean_exp ?? -1) - (a.pir?.mean_exp ?? -1));
  const q = {}; for (const x of players) q[x.quality] = (q[x.quality] || 0) + 1;
  return {
    version: ENGINE_VERSION, generated_at: now.toISOString(), season: minutesFile.season, round, first_tip: firstTip,
    // pregame: δημιουργήθηκε πριν από το πρώτο τζάμπολ της αγωνιστικής (αλλιώς δεν μετράει ως pregame πρόβλεψη στο αρχείο της Φάσης 4)
    pregame: firstTip ? now.toISOString() < firstTip : null,
    models: { minutes: { version: minutesFile.model, generated_at: minutesFile.generated_at, n_train: minutesFile.n_train }, stats: STATS_MODEL.version,
      pir: fantasy?.round === round ? `${fantasy.model}: PIR/λεπτό × λεπτά hurdle` : null },
    notes: 'stats.* και over.* = αν παίξει (void αν δεν παίξει)· *_exp και minutes.expected περιλαμβάνουν την πιθανότητα να μην παίξει.',
    ladder, quality_counts: q, players,
  };
}
