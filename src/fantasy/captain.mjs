// Captain Advisor: προβολή πόντων ως αρχηγός, risk score, captain value, 3 προτάσεις, swap advisor μεταξύ turns.
// Ο αρχηγός παίρνει ×2, μόνο από την πεντάδα· +10% PIR σε νίκη, σταθμισμένο με την πιθανότητα νίκης του Game Predictor.
export const wb = p => 1 + 0.1 * (p.pwin ?? 0.5);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// κανόνας «upside» για τον προτεινόμενο αρχηγό: αναμενόμενο + 1 τυπική απόκλιση. Στο backtest 2023-26 (Model Performance)
// έδωσε περισσότερους πόντους αρχηγού από την επιλογή με το απλό αναμενόμενο: ο αρχηγός διπλασιάζεται, άρα μετράει το ταβάνι.
export const CAP_SD = 1.0;
export function capPoints(p) {
  const k = 2 * wb(p), sd = Math.max(0, ((p.p90 || 0) - (p.p10 || 0)) / 2.5631);
  return { exp: +(k * (p.pp || 0)).toFixed(1), floor: +(k * (p.p10 || 0)).toFixed(1), median: +(k * (p.p50 || 0)).toFixed(1), ceiling: +(k * (p.p90 || 0)).toFixed(1), upside: +(k * ((p.pp || 0) + CAP_SD * sd)).toFixed(1) };
}

/**
 * Captain risk score 0 (ασφαλής) – 100 (δεν πρέπει να είναι αρχηγός). Συνιστώσες:
 * κατάσταση (τραυματίας 100, αμφίβολος +40) · εύρος P10–P90 ως προς τη διάμεσο (έως 30) · αστάθεια λεπτών (έως 15)
 * · λίγα λεπτά (<18: +10) · ποσοστό κακών αγώνων PIR ≤ 5 (έως 15) · back-to-back +5 · μικρό δείγμα (<3 αγώνες) +15 · σπάνια βασικός (<50%) +5
 */
export function riskScore(p) {
  if (p.status === 'injured' || p.status === 'rest') return { score: 100, parts: { status: 100 } };
  const parts = {};
  if (p.status === 'doubtful') parts.status = 40;
  parts.spread = Math.round(clamp(20 * ((p.p90 || 0) - (p.p10 || 0)) / Math.max(p.p50 || 0, 5), 0, 30));
  if (p.mcv != null) parts.minutes = Math.round(clamp(50 * p.mcv, 0, 15));
  if ((p.m10 ?? 0) < 18) parts.lowmin = 10;
  if (p.hneg != null) parts.bad = Math.round(clamp(30 * p.hneg, 0, 15));
  if (p.b2b) parts.b2b = 5;
  if ((p.gp ?? 9) < 3) parts.small = 15;
  if (p.start != null && p.start < 0.5) parts.bench = 5;
  const score = clamp(Object.values(parts).reduce((s, x) => s + x, 0), 0, 100);
  return { score, parts };
}
// captain value = projected captain points / captain risk (ο κίνδυνος ως συντελεστής 1 + risk/50)
export const captainValue = (exp, risk) => +(exp / (1 + risk / 50)).toFixed(2);
// differential: δεν υπάρχει ownership, οπότε μετράμε το «ανέβασμα» πάνω από τη διάμεσο (P90 − P50) / P50, 0–100
export const differentialScore = p => Math.round(clamp(100 * ((p.p90 || 0) - (p.p50 || 0)) / Math.max(p.p50 || 0, 5), 0, 100));

export function captainRow(p, { played = false } = {}) {
  const cp = capPoints(p), r = riskScore(p);
  return { c: p.c, ...cp, risk: r.score, riskParts: r.parts, value: captainValue(cp.exp, r.score), diff: differentialScore(p), played,
    warn: p.status === 'injured' || p.status === 'rest' ? 'out' : p.status === 'doubtful' ? 'doubtful' : played ? 'played' : null };
}

/**
 * Προτάσεις για τη σύνθεση: lineup = { start:[κωδικοί], captain }, curTurn: όσοι παίζουν σε προηγούμενη μέρα έχουν παίξει.
 */
export function adviseCaptain(lineup, players, curTurn = 0) {
  const P = new Map(players.map(p => [p.c, p]));
  const rows = lineup.start.map(c => P.get(c)).filter(Boolean).map(p => ({ ...captainRow(p, { played: p.day != null && p.day < curTurn }), day: p.day }));
  const ok = rows.filter(r => !r.warn || r.warn === 'doubtful');
  const pick = f => (ok.length ? ok.reduce((a, b) => (f(b) > f(a) ? b : a)) : null);
  const safest = pick(r => r.floor * (1 - r.risk / 100));
  const best = pick(r => r.upside);
  const ceiling = pick(r => r.ceiling);
  const cur = rows.find(r => r.c === lineup.captain) || null;
  const compare = cur && best ? { vsBest: +(best.upside - cur.upside).toFixed(1), vsCeiling: +(ceiling.ceiling - cur.ceiling).toFixed(1), vsSafe: +(safest.floor - cur.floor).toFixed(1) } : null;
  // swap advisor: αν ο αρχηγός παίζει νωρίτερα από άλλον βασικό, άλλαξε αν φέρει λιγότερο από την εκτίμηση εκείνου
  const capP = P.get(lineup.captain);
  let swap = null;
  if (capP) {
    const later = ok.filter(r => r.c !== capP.c && r.day != null && capP.day != null && r.day > capP.day).sort((a, b) => b.exp - a.exp)[0];
    if (later) swap = { from: capP.c, to: later.c, day: capP.day, thresholdPIR: +(later.exp / 2 / wb(P.get(later.c))).toFixed(1) };
  }
  const warnings = [];
  if (cur?.warn) warnings.push({ k: cur.warn, c: cur.c });
  if (!lineup.start.includes(lineup.captain)) warnings.push({ k: 'not_starter', c: lineup.captain });
  return { rows: rows.sort((a, b) => b.median - a.median), safest, best, ceiling, current: cur, compare, swap, warnings };
}
