// Ρεκόρ ενός tipster ανά είδος επιλογής και ανά ζώνη απόδοσης (σελίδα του tipster). Μετρούν μόνο τα κριμένα W/L·
// μονάδες με 1 μονάδα ανά επιλογή και μόνο όπου δηλώθηκε απόδοση (όπως το συνολικό ρεκόρ της σελίδας).
//   pick: { kind: 'tot'|'hc'|'ml'|'h2'|'prop', ov: true/false (over/under), odds, res: 'W'|'L'|'P'|'pending' }
export const TYPES = ['tot-o', 'tot-u', 'hc', 'ml', 'h2', 'prop-o', 'prop-u'];
export const BANDS = [[0, 1.75], [1.75, 1.85], [1.85, 1.95], [1.95, Infinity]];
export const typeOf = p => (p.kind === 'tot' || p.kind === 'prop') ? `${p.kind}-${p.ov ? 'o' : 'u'}` : p.kind;

function agg(L) {
  const W = L.filter(p => p.res === 'W').length, n = L.length;
  const units = L.filter(p => p.odds).reduce((s, p) => s + (p.res === 'W' ? p.odds - 1 : -1), 0);
  return { n, W, L: n - W, pct: n ? W / n : null, units: Math.round(units * 100) / 100 };
}
/** { types: [{ key, ...agg }], bands: [{ lo, hi, all, team, prop }] } — μόνο γραμμές με τουλάχιστον 1 κριμένη επιλογή */
export function pickSplits(picks) {
  const S = picks.filter(p => p.res === 'W' || p.res === 'L');
  const types = TYPES.map(key => ({ key, ...agg(S.filter(p => typeOf(p) === key)) })).filter(r => r.n);
  const bands = BANDS.map(([lo, hi]) => { const B = S.filter(p => p.odds && p.odds >= lo && p.odds < hi);
    return { lo, hi, all: agg(B), team: agg(B.filter(p => p.kind !== 'prop')), prop: agg(B.filter(p => p.kind === 'prop')) }; }).filter(r => r.all.n);
  return { n: S.length, types, bands };
}
