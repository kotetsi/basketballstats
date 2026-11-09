// Μόνιμα URLs σύγκρισης: κανονική σειρά (αλφαβητικά τα slugs), ώστε «Α vs Β» και «Β vs Α» να είναι μία σελίδα.
// Ίδιος κώδικας στο build (παραγωγή σελίδων, canonical) και στον browser (σύνδεσμος κοινοποίησης).

export const SEP = '-vs-';

/** κανονική σειρά: αλφαβητικά, χωρίς διπλά και κενά */
export function canonicalOrder(slugs) {
  return [...new Set(slugs.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, 'en'));
}
/** «olympiakos-vs-panathinaikos» για 2 έως 4 επιλογές (μόνιμες σελίδες υπάρχουν μόνο για ζευγάρια) */
export function pairSlug(slugs) {
  const s = canonicalOrder(slugs);
  return s.length >= 2 && s.length <= 4 ? s.join(SEP) : null;
}
/** ανάλυση slug ζευγαριού· δέχεται μόνο γνωστά slugs (allowed: Set) και την κανονική σειρά */
export function parsePairSlug(slug, allowed) {
  const parts = String(slug || '').split(SEP);
  if (parts.length < 2 || parts.length > 4) return null;
  if (parts.some(p => !allowed.has(p))) return null;
  if (new Set(parts).size !== parts.length) return null;
  const canon = canonicalOrder(parts);
  return { parts, canonical: canon.join(SEP), isCanonical: canon.join(SEP) === parts.join(SEP) };
}
/** επιλογές από query (ids=A,B,…): μόνο γνωστά, χωρίς διπλά, έως max */
export function sanitizeIds(raw, known, max = 4) {
  const out = [];
  for (const x of String(raw || '').split(',').map(s => s.trim()).filter(Boolean)) {
    if (!known(x) || out.includes(x)) continue;
    out.push(x); if (out.length >= max) break;
  }
  return out;
}
