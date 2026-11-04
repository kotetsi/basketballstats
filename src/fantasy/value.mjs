// Value Board και buy-low / sell-high / hold / avoid engine.
// value_per_credit = projected_PIR / price · fantasy_value_per_credit = projected_fantasy_points / price
// Οι παίκτες κατατάσσονται μέσα στη θέση τους (εκατοστημόριο) για να μη συγκρίνονται σέντερ με γκαρντ χωρίς προσαρμογή.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const fpNext = p => (p.pp || 0) * (1 + 0.1 * (p.pwin ?? 0.5));
export const fp3 = p => (p.nx || []).reduce((s, x, i) => s + x[3] * (1 + 0.1 * (i === 0 ? (p.pwin ?? 0.5) : 0.5)), 0);
export const valuePerCredit = (pir, price) => (price > 0 ? (pir || 0) / price : 0);

export function percentileRanks(items, key) {
  // εκατοστημόριο 0–100 (υψηλό = καλύτερο), ισοβαθμίες με μέσο rank
  const v = items.map(key), n = v.length;
  return v.map(x => { if (n < 2) return 100; const below = v.filter(y => y < x).length, eq = v.filter(y => y === x).length; return Math.round((100 * (below + (eq - 1) / 2)) / (n - 1)); });
}
export function gradeOf(pct) { return pct >= 95 ? 'A+' : pct >= 85 ? 'A' : pct >= 70 ? 'B+' : pct >= 50 ? 'B' : pct >= 30 ? 'C+' : pct >= 15 ? 'C' : 'D'; }
const avgDiff = p => (p.nx && p.nx.length ? p.nx.reduce((s, x) => s + x[4], 0) / p.nx.length : 3);
const dPrice = (p, k) => (p.ph && p.ph.length > k ? p.ph[p.ph.length - 1][1] - p.ph[p.ph.length - 1 - k][1] : 0);

/** σήμα με score −100…+100, factors (με πρόσημο) και confidence */
export function signalOf(p, posPct) {
  const f = {};
  f.value = Math.round(clamp((posPct - 50) * 0.8, -40, 40));
  const l10 = p.l10 || 0, l3 = p.l3 ?? l10;
  if (l10 >= 5 && (p.pp || 0) >= 0.9 * l10) f.dip = Math.round(clamp((40 * (l10 - l3)) / Math.max(l10, 5), -20, 20));   // πρόσφατη πτώση με σταθερή προβολή = ευκαιρία
  f.price = Math.round(clamp(-4 * dPrice(p, 3), -15, 15));
  if (p.m10) f.minutes = Math.round(clamp(1.5 * ((p.m3 ?? p.m10) - p.m10), -15, 15));
  f.schedule = Math.round(clamp(6 * (3 - avgDiff(p)), -12, 12));
  if (p.status === 'injured' || p.status === 'rest') f.injury = -60;
  else if (p.status === 'doubtful') f.injury = -25;
  const score = clamp(Object.values(f).reduce((s, x) => s + x, 0), -100, 100);
  let sig;
  if (p.status === 'injured' || p.status === 'rest') sig = p.price >= 10 ? 'sell_high' : 'avoid';
  else if (score >= 25) sig = 'buy_low';
  else if (score <= -25 && p.price >= 12) sig = 'sell_high';
  else if (score <= -25 || (posPct < 20 && (p.pp || 0) < 6)) sig = 'avoid';
  else sig = 'hold';
  const factors = Object.entries(f).filter(([, v]) => v).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([k, v]) => ({ k, v }));
  const confidence = (p.gp ?? 0) < 3 || (p.conf ?? 0) < 40 ? 'low' : (p.gp ?? 0) >= 6 && (p.conf ?? 0) >= 60 ? 'high' : 'medium';
  return { sig, score, factors, confidence };
}

/** όλο το Value Board: positional percentile, ranks ανά θέση και συνολικά, grade, σήμα */
export function valueBoard(players) {
  const rows = players.map(p => ({ p, vpc: valuePerCredit(p.pp, p.price), fvpc: valuePerCredit(fpNext(p), p.price), vpc3: valuePerCredit(p.p3, p.price), fvpc3: valuePerCredit(fp3(p), p.price) }));
  const byPos = {};
  rows.forEach((r, i) => (byPos[r.p.pos] ||= []).push(i));
  for (const idx of Object.values(byPos)) {
    const pct = percentileRanks(idx.map(i => rows[i]), r => r.fvpc3);
    idx.forEach((i, j) => { rows[i].posPct = pct[j]; });
    [...idx].sort((a, b) => rows[b].fvpc3 - rows[a].fvpc3).forEach((i, k) => { rows[i].posRank = k + 1; });
  }
  // συνολικό rank: από το εκατοστημόριο θέσης (positional adjustment), ισοβαθμίες με fvpc3
  [...rows.keys()].sort((a, b) => rows[b].posPct - rows[a].posPct || rows[b].fvpc3 - rows[a].fvpc3).forEach((i, k) => { rows[i].rank = k + 1; });
  for (const r of rows) { r.grade = (r.p.gp ?? 0) >= 3 ? gradeOf(r.posPct) : null; Object.assign(r, signalOf(r.p, r.posPct)); }
  return rows;
}
