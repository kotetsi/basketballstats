// Intelligence Engine — προστασία από διαρροή μελλοντικής πληροφορίας (data leakage).
// Κανόνας: μια πρόβλεψη για αγώνα με τζάμπολ T επιτρέπεται να «δει» μόνο αγώνες με τζάμπολ < T
// και μόνο εγγραφές (κατάσταση παικτών, αποδόσεις) με χρονοσφραγίδα < χρόνο της πρόβλεψης.
// Τα μοντέλα παίρνουν δεδομένα ΜΟΝΟ μέσα από το asOf(), και τα tests/backtests καλούν assertNoFuture() στην είσοδό τους:
// ένα μοντέλο που εκπαιδεύτηκε ή βαθμονομήθηκε με μελλοντικούς αγώνες αποτυγχάνει (LeakageError).

export class LeakageError extends Error {
  constructor(msg, refs = []) { super(msg); this.name = 'LeakageError'; this.refs = refs; }
}

const ms = t => { const v = typeof t === 'number' ? t : Date.parse(t); if (!Number.isFinite(v)) throw new TypeError(`μη έγκυρη χρονοσφραγίδα: ${t}`); return v; };

/** η κανονικοποιημένη σεζόν όπως ήταν γνωστή ΠΡΙΝ από το cutoff: μόνο αγώνες με τζάμπολ < cutoff (και οι γραμμές τους)·
 *  οι μεταγενέστεροι αγώνες μένουν στο πρόγραμμα ως 'scheduled' χωρίς σκορ. Δεν αλλάζει την είσοδο. */
export function asOf(N, cutoff) {
  const c = ms(cutoff), known = new Set();
  const games = N.games.map(g => {
    if (g.date && ms(g.date) < c) { known.add(g.game_id); return g; }
    return { ...g, home_score: null, away_score: null, game_status: 'scheduled' };
  });
  return { ...N, meta: { ...N.meta, as_of: new Date(c).toISOString() }, games, player_games: N.player_games.filter(r => known.has(r.game_id)) };
}

/** αποτυγχάνει αν κάποια εγγραφή έχει χρόνο ≥ cutoff. timeOf: πώς διαβάζεται ο χρόνος της εγγραφής
 *  (προεπιλογή: r.date για γραμμές αγώνα, r.captured_at / r.t για snapshots κατάστασης/αποδόσεων). */
export function assertNoFuture(rows, cutoff, { timeOf = r => r.date ?? r.captured_at ?? r.t, label = 'rows' } = {}) {
  const c = ms(cutoff), bad = [];
  for (const r of rows) {
    const t = timeOf(r);
    if (t == null) { bad.push({ ref: r.game_id || r.player_id || '?', why: 'χωρίς χρονοσφραγίδα' }); continue; }
    if (ms(t) >= c) bad.push({ ref: r.game_id || r.player_id || '?', why: new Date(ms(t)).toISOString() });
  }
  if (bad.length) throw new LeakageError(`${label}: ${bad.length} εγγραφές με χρόνο ≥ ${new Date(c).toISOString()} (διαρροή μελλοντικής πληροφορίας)`, bad.slice(0, 20));
  return true;
}

/** τελευταία γνωστή κατάσταση κάθε παίκτη ΠΡΙΝ από το cutoff, από το data/fantasy/status-history.jsonl
 *  (γραμμές { captured_at, player_id, status, ... }). Χωρίς snapshot πριν από το cutoff ⇒ ο παίκτης λείπει από τον χάρτη
 *  (άγνωστη κατάσταση· ΔΕΝ συμπεραίνεται από το box score του αγώνα). */
export function statusAsOf(rows, cutoff) {
  const c = ms(cutoff), out = {};
  for (const r of rows) {
    if (!r?.player_id || !r.captured_at || ms(r.captured_at) >= c) continue;
    const prev = out[r.player_id];
    if (!prev || ms(prev.captured_at) <= ms(r.captured_at)) out[r.player_id] = r;
  }
  return out;
}

/** chronological walk-forward: για κάθε αγωνιστική-στόχο, τα δεδομένα μέχρι το πρώτο τζάμπολ της.
 *  Επιστρέφει [{ round, cutoff, train, target }] — train = asOf(N, cutoff), target = γραμμές της αγωνιστικής. */
export function walkForward(N, { fromRound = 2 } = {}) {
  const firstTip = new Map();
  for (const g of N.games) if (g.date) { const t = ms(g.date); if (!firstTip.has(g.round) || t < firstTip.get(g.round)) firstTip.set(g.round, t); }
  return [...firstTip.keys()].filter(r => r >= fromRound).sort((a, b) => a - b).map(round => {
    const cutoff = new Date(firstTip.get(round)).toISOString();
    return { round, cutoff, train: asOf(N, cutoff), target: N.player_games.filter(r => r.round === round) };
  });
}
