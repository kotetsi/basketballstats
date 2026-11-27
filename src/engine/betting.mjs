// Intelligence Engine, Φάση 6: στοίχημα ως ξεχωριστός «καταναλωτής» του κοινού engine.
//  * πιθανότητες player props (πόντοι, ριμπάουντ, ασίστ, τρίποντα) από το data/projections/latest.json
//  * δίκαιη απόδοση = 1 / p, EV = p · απόδοση − 1
//  * πύλη αξιοπιστίας: θετικό EV εμφανίζεται ΜΟΝΟ όταν η μέτρηση απέναντι στην αγορά (scripts/engine-market-eval.mjs, pregame τιμές)
//    δείχνει πλεονέκτημα με στατιστική βεβαιότητα. Αλλιώς δείχνουμε πιθανότητες και δίκαιες αποδόσεις, όχι «αξία».
export const BETTING_VERSION = 'engine-bet-1';
export const ENGINE_STATS = ['pts', 'reb', 'ast', 'fg3'];
export const fairOdds = p => (p > 0 ? +(1 / p).toFixed(3) : null);
export const ev = (p, price) => p * price - 1;

/** κριτήρια της πύλης (v2). Όλα πρέπει να ισχύουν. Μετρημένα σε γραμμές με τιμή που υπήρχε πριν από το τζάμπολ.
 *  v2 (27/11/2026): οι επιλογές πρέπει επιπλέον να κερδίζουν τη στρατηγική χωρίς μοντέλο «όλα τα under / όλα τα over»
 *  στις ίδιες γραμμές, ώστε η πύλη να μην ανοίξει σε μια περίοδο όπου απλώς «βγήκαν τα unders». */
export const GATE_RULES = Object.freeze({
  version: 'props-gate-2',
  minGames: 40,            // ~4 αγωνιστικές
  minLines: 3000,          // γραμμές (bookmaker × παίκτης × stat × γραμμή) με αποτέλεσμα
  probability: 'blend',    // η πιθανότητα που θα εμφανιζόταν: 50% engine + 50% αγορά χωρίς περιθώριο
  brierCiUpperBelow: 0,    // 95% διάστημα (bootstrap ανά αγώνα) της διαφοράς Brier (blend − αγορά) εξ ολοκλήρου < 0
  maxEce: 0.03,            // βαθμονόμηση της blend πιθανότητας
  minPicks: 300,           // επιλογές με EV ≥ minEv
  roiCiLowerAbove: 0,      // 95% διάστημα ROI των επιλογών εξ ολοκλήρου > 0
  edgeCiLowerAbove: 0,     // 95% διάστημα (ROI επιλογών − καλύτερο από «όλα under»/«όλα over») εξ ολοκλήρου > 0
  minEv: 0.08,
});

/** απόφαση της πύλης από την αναφορά του engine-market-eval (data/predictions/market-eval.json) */
export function propsGate(evalReport, R = GATE_RULES) {
  const A = evalReport?.all;
  if (!A || !A.n) return { open: false, version: R.version, reasons: ['no_evidence'], evidence: null };
  const pk = A.picks?.[`ev${Math.round(R.minEv * 100)}`]?.[R.probability] || {};
  const ci = A.brier_blend_minus_market_ci95 || null;
  const checks = {
    games: [A.games, A.games >= R.minGames],
    lines: [A.n, A.n >= R.minLines],
    brier_ci_upper: [ci?.[1] ?? null, ci != null && ci[1] < R.brierCiUpperBelow],
    ece: [A.ece_blend ?? null, A.ece_blend != null && A.ece_blend <= R.maxEce],
    picks: [pk.n ?? 0, (pk.n ?? 0) >= R.minPicks],
    roi_ci_lower: [pk.roi_ci95?.[0] ?? null, pk.roi_ci95 != null && pk.roi_ci95[0] > R.roiCiLowerAbove],
    beats_naive: [pk.edge_vs_naive_ci95?.[0] ?? null, pk.edge_vs_naive_ci95 != null && pk.edge_vs_naive_ci95[0] > R.edgeCiLowerAbove],
  };
  const reasons = Object.entries(checks).filter(([, [, ok]]) => !ok).map(([k]) => k);
  return { open: reasons.length === 0, version: R.version, reasons, checks: Object.fromEntries(Object.entries(checks).map(([k, [v, ok]]) => [k, { value: v, ok }])),
    evidence: { generated: evalReport.generated, games: A.games, lines: A.n, brier: { engine: A.engine?.brier, market: A.market?.brier, blend: A.blend?.brier }, roi: pk.roi ?? null, roi_ci95: pk.roi_ci95 ?? null, naive: pk.naive ?? null, edge_vs_naive: pk.edge_vs_naive ?? null } };
}

/** πιθανότητες του engine για τον επόμενο αγώνα: Map(c → { round, quality, min, stats: { stat: [mean, var] } }).
 *  Μόνο παίκτες με πρόβλεψη (όχι 'insufficient'/'out') */
export function engineIndex(projections) {
  const m = new Map();
  for (const p of projections?.players || []) {
    if (!p.stats || !p.minutes || p.quality === 'insufficient' || p.quality === 'out') continue;
    m.set(p.player_id, { round: projections.round, quality: p.quality, min: p.minutes.if_plays,
      stats: Object.fromEntries(ENGINE_STATS.map(s => [s, [p.stats[s].mean, p.stats[s].sd ** 2]])) });
  }
  return m;
}

/** κατανομή engine για ένα stat, προσαρμοσμένη για νέες απουσίες της ίδιας ομάδας: αν η ανακατανομή του props μοντέλου
 *  δίνει minAdj αντί για minBase λεπτά, η μέση τιμή και η διασπορά κλιμακώνονται με τον ίδιο λόγο (ίδιος ρυθμός ανά λεπτό).
 *  Επιστρέφει [mean, var] ή null αν το engine δεν έχει πρόβλεψη για αυτό το stat/αγωνιστική. */
export function engineDist(E, c, stat, round, { minAdj = null, minBase = null } = {}) {
  const e = E?.get(c);
  if (!e || e.round !== round || !ENGINE_STATS.includes(stat)) return null;
  const [mu, v] = e.stats[stat];
  const k = minAdj != null && minBase > 0 && Math.abs(minAdj - minBase) >= 0.5 ? Math.max(0, minAdj / minBase) : 1;
  return [Math.max(0.05, mu * k), Math.max(v * k, 1e-6)];
}
