// Intelligence Engine — validation του κανονικοποιημένου επιπέδου δεδομένων (src/engine/data.mjs).
// Κάθε εύρημα: { code, severity: 'error' | 'warn', ref, detail? }.
//   error = τα δεδομένα είναι αδύνατα ή ασυνεπή (π.χ. εύστοχα > προσπάθειες, διπλή ταυτότητα) → τα μοντέλα δεν πρέπει να τα εμπιστευτούν
//   warn  = ύποπτο αλλά πιθανό από το feed (π.χ. PIR που δεν ταιριάζει με τον τύπο, άθροισμα πόντων ≠ σκορ)

const NUM = ['seconds', 'points', 'oreb', 'dreb', 'assists', 'steals', 'blocks', 'blocks_against', 'turnovers', 'fouls', 'fouls_drawn',
  'three_pointers_made', 'three_pointers_attempted', 'two_pointers_made', 'two_pointers_attempted', 'free_throws_made', 'free_throws_attempted'];
const PAIRS = [['two_pointers_made', 'two_pointers_attempted'], ['three_pointers_made', 'three_pointers_attempted'], ['free_throws_made', 'free_throws_attempted']];
export const MAX_GAME_SECONDS = (40 + 5 * 5) * 60; // κανονικός αγώνας + έως 5 παρατάσεις

/** PIR (valuation) EuroLeague: (πόντοι + ριμπάουντ + ασίστ + κλεψίματα + κοψίματα + φάουλ που δέχτηκε)
 *  − (άστοχα σουτ + άστοχες βολές + λάθη + κοψίματα που δέχτηκε + φάουλ που έκανε) */
export function pirOf(r) {
  const miss = (r.two_pointers_attempted - r.two_pointers_made) + (r.three_pointers_attempted - r.three_pointers_made) + (r.free_throws_attempted - r.free_throws_made);
  return r.points + r.oreb + r.dreb + r.assists + r.steals + r.blocks + r.fouls_drawn - miss - r.turnovers - r.blocks_against - r.fouls;
}

/** έλεγχοι γραμμής παίκτη/αγώνα */
export function validateRow(r) {
  const out = [], ref = `${r.player_id}|${r.game_id}`;
  for (const k of NUM) if (!Number.isFinite(r[k]) || r[k] < 0) out.push({ code: 'invalid_number', severity: 'error', ref, detail: k });
  if (out.length) return out;
  for (const [m, a] of PAIRS) if (r[m] > r[a]) out.push({ code: 'made_gt_attempted', severity: 'error', ref, detail: m });
  if (r.seconds > MAX_GAME_SECONDS) out.push({ code: 'minutes_out_of_range', severity: 'error', ref, detail: r.seconds });
  const pts = 2 * r.two_pointers_made + 3 * r.three_pointers_made + r.free_throws_made;
  if (pts !== r.points) out.push({ code: 'points_mismatch', severity: 'error', ref, detail: `${r.points} ≠ ${pts}` });
  if (Number.isFinite(r.pir) && r.seconds > 0 && pirOf(r) !== r.pir) out.push({ code: 'pir_mismatch', severity: 'warn', ref, detail: `${r.pir} ≠ ${pirOf(r)}` });
  if (r.seconds === 0 && (r.points || r.oreb || r.dreb || r.assists)) out.push({ code: 'stats_without_minutes', severity: 'warn', ref });
  return out;
}

/** πλήρες validation μιας κανονικοποιημένης σεζόν */
export function validateSeason(N) {
  const out = (N.issues || []).map(i => ({ severity: 'error', ...i }));
  // ταυτότητες
  const pid = new Map();
  for (const p of N.players) {
    // κωδικοί EuroLeague: αριθμητικοί (003469) ή παλιότεροι αλφαριθμητικοί (TGB)
    if (!/^[A-Z0-9]{3,8}$/.test(String(p.player_id || ''))) out.push({ code: 'invalid_player_id', severity: 'error', ref: String(p.player_id) });
    if (pid.has(p.player_id)) out.push({ code: 'duplicate_player_id', severity: 'error', ref: p.player_id });
    pid.set(p.player_id, p);
  }
  const G = new Map(N.games.map(g => [g.game_id, g]));
  for (const g of N.games) {
    if (!g.date) out.push({ code: 'game_without_date', severity: 'error', ref: g.game_id });
    if (g.home_team === g.away_team) out.push({ code: 'same_team_both_sides', severity: 'error', ref: g.game_id });
    if (g.game_status === 'final' && !(Number.isFinite(g.home_score) && Number.isFinite(g.away_score))) out.push({ code: 'final_without_score', severity: 'error', ref: g.game_id });
  }
  // γραμμές
  const seen = new Set(), teamPts = new Map();
  for (const r of N.player_games) {
    const k = `${r.player_id}|${r.game_id}`;
    if (seen.has(k)) out.push({ code: 'duplicate_player_game', severity: 'error', ref: k });
    seen.add(k);
    if (!pid.has(r.player_id)) out.push({ code: 'row_unknown_player', severity: 'error', ref: k });
    const g = G.get(r.game_id);
    if (!g) { out.push({ code: 'row_unknown_game', severity: 'error', ref: k }); continue; }
    if (g.game_status !== 'final') out.push({ code: 'stats_for_unplayed_game', severity: 'error', ref: k });
    out.push(...validateRow(r));
    // το σκορ που γράφει η γραμμή του παίκτη πρέπει να είναι το σκορ του αγώνα
    const [own, opp] = r.team_id === g.home_team ? [g.home_score, g.away_score] : [g.away_score, g.home_score];
    if (g.game_status === 'final' && (r.team_pts !== own || r.opp_pts !== opp)) out.push({ code: 'row_score_mismatch', severity: 'error', ref: k, detail: `${r.team_pts}-${r.opp_pts} ≠ ${own}-${opp}` });
    const tk = `${r.game_id}|${r.team_id}`; teamPts.set(tk, (teamPts.get(tk) || 0) + r.points);
  }
  // άθροισμα πόντων παικτών = πόντοι ομάδας (warn: το feed μπορεί να λείπει παίκτης με 0 λεπτά/πόντους, όχι όμως πόντοι)
  for (const g of N.games.filter(x => x.game_status === 'final')) for (const [t, s] of [[g.home_team, g.home_score], [g.away_team, g.away_score]]) {
    const sum = teamPts.get(`${g.game_id}|${t}`);
    if (sum == null) out.push({ code: 'final_game_without_player_rows', severity: 'warn', ref: `${g.game_id}|${t}` });
    else if (sum !== s) out.push({ code: 'team_points_mismatch', severity: 'warn', ref: `${g.game_id}|${t}`, detail: `${sum} ≠ ${s}` });
  }
  return out;
}

/** σύνοψη: πλήθος ανά κωδικό και σοβαρότητα, και ένα δείγμα αναφορών */
export function summarize(findings, sample = 5) {
  const by = {};
  for (const f of findings) { const x = (by[f.code] ||= { severity: f.severity, n: 0, refs: [] }); x.n++; if (x.refs.length < sample) x.refs.push(f.detail ? `${f.ref} (${f.detail})` : f.ref); }
  return { errors: findings.filter(f => f.severity === 'error').length, warnings: findings.filter(f => f.severity === 'warn').length, by };
}
