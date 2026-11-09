// Κεντρικός κατάλογος metrics της Σύγκρισης (παίκτες και ομάδες): μονάδα, μορφή, ακρίβεια, κατεύθυνση, κατηγορία, radar.
// Τα ονόματα (labels) σε κάθε γλώσσα έρχονται από το build (ίδιο σύστημα μεταφράσεων με όλο το site).
//   format:    'pct' (0-1 → %), 'num', 'int', 'signed' (+/−), 'ratio'
//   direction: 'higher' (μεγαλύτερο = καλύτερο), 'lower' (μικρότερο = καλύτερο), 'none' (δεν κρίνεται: π.χ. ρυθμός, αγώνες)
//   radar:     true μόνο για metrics που έχουν νόημα ως percentile μέσα στο σύνολο της διοργάνωσης
const M = (format, precision, direction, category, radar = false, unit = '') => ({ format, precision, direction, category, radar, unit });

export const TEAM_METRICS = {
  gp: M('int', 0, 'none', 'record'),
  w: M('int', 0, 'none', 'record'),
  l: M('int', 0, 'none', 'record'),
  wpct: M('pct', 1, 'higher', 'record'),
  pfpg: M('num', 1, 'higher', 'scoring', false, 'pts'),
  papg: M('num', 1, 'lower', 'defense', false, 'pts'),
  diff: M('signed', 1, 'higher', 'record', false, 'pts'),
  ortg: M('num', 1, 'higher', 'efficiency', true, '/100'),
  drtg: M('num', 1, 'lower', 'efficiency', true, '/100'),
  net: M('signed', 1, 'higher', 'efficiency', false, '/100'),
  pace: M('num', 1, 'none', 'efficiency', false, 'poss'),
  rpg: M('num', 1, 'higher', 'rebounding'),
  apg: M('num', 1, 'higher', 'playmaking'),
  tovpg: M('num', 1, 'lower', 'playmaking'),
  stlpg: M('num', 1, 'higher', 'defense', true),
  blkpg: M('num', 1, 'higher', 'defense'),
  p2: M('pct', 1, 'higher', 'shooting'),
  p3: M('pct', 1, 'higher', 'shooting', true),
  ft: M('pct', 1, 'higher', 'shooting'),
  efg: M('pct', 1, 'higher', 'shooting', true),
  ts: M('pct', 1, 'higher', 'shooting'),
  astto: M('ratio', 2, 'higher', 'playmaking', true),
  pir: M('num', 1, 'higher', 'efficiency'),
  oreb: M('pct', 1, 'higher', 'rebounding', true),
  dreb: M('pct', 1, 'higher', 'rebounding', true),
  ftr: M('pct', 1, 'higher', 'shooting'),
  oefg: M('pct', 1, 'lower', 'defense'),
  otov: M('pct', 1, 'higher', 'defense'),
  bench: M('num', 1, 'higher', 'scoring'),
  form10: M('pct', 0, 'higher', 'record'),
};
// σειρά εμφάνισης στον πίνακα ομάδων
export const TEAM_KEYS = ['gp', 'w', 'l', 'wpct', 'pfpg', 'papg', 'diff', 'ortg', 'drtg', 'net', 'pace', 'rpg', 'apg', 'tovpg', 'stlpg', 'blkpg', 'p2', 'p3', 'ft', 'efg', 'ts', 'astto', 'pir', 'oreb', 'dreb', 'ftr', 'oefg', 'otov', 'bench', 'form10'];
// splits ομάδων (όλα έχουν νόημα για ομάδες: εντός/εκτός και φόρμα)
export const TEAM_SPLITS = ['all', 'home', 'away', 'l5', 'l10'];

export const PLAYER_METRICS = {
  G: M('int', 0, 'none', 'availability'), mpg: M('num', 1, 'none', 'availability'), avail: M('pct', 0, 'higher', 'availability'),
  pir: M('num', 1, 'higher', 'efficiency'), pir36: M('num', 1, 'higher', 'efficiency'), pir100: M('num', 1, 'higher', 'efficiency'), pirmin: M('num', 2, 'higher', 'efficiency'),
  pts: M('num', 1, 'higher', 'scoring'), reb: M('num', 1, 'higher', 'rebounding'), ast: M('num', 1, 'higher', 'playmaking'),
  stl: M('num', 1, 'higher', 'defense'), blk: M('num', 1, 'higher', 'defense'), tov: M('num', 1, 'lower', 'playmaking'), pf: M('num', 1, 'lower', 'defense'),
  fg: M('pct', 1, 'higher', 'shooting'), p2: M('pct', 1, 'higher', 'shooting'), p3: M('pct', 1, 'higher', 'shooting'), ft: M('pct', 1, 'higher', 'shooting'),
  ts: M('pct', 1, 'higher', 'shooting'), efg: M('pct', 1, 'higher', 'shooting'), usg: M('pct', 1, 'none', 'scoring'),
  astp: M('pct', 1, 'higher', 'playmaking'), tovp: M('pct', 1, 'lower', 'playmaking'), rebp: M('pct', 1, 'higher', 'rebounding'),
  astto: M('ratio', 2, 'higher', 'playmaking'), tsa36: M('num', 1, 'none', 'scoring'), pm: M('signed', 1, 'higher', 'impact'),
  ortg: M('num', 1, 'higher', 'impact'), drtg: M('num', 1, 'lower', 'impact'), net: M('signed', 1, 'higher', 'impact'),
};
// ανά 36′ και ανά 100 κατοχές: ίδια κατεύθυνση με το βασικό metric
for (const b of ['pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf']) PLAYER_METRICS[b + '36'] = { ...PLAYER_METRICS[b] };
for (const b of ['pts', 'reb', 'ast', 'stl', 'blk', 'tov']) PLAYER_METRICS[b + '100'] = { ...PLAYER_METRICS[b] };

export const metaOf = (k, kind = 'player') => (kind === 'team' ? TEAM_METRICS : PLAYER_METRICS)[k] || null;
export const isLowerBetter = (k, kind = 'player') => metaOf(k, kind)?.direction === 'lower';
export const LOWER_PLAYER = new Set(Object.entries(PLAYER_METRICS).filter(([, m]) => m.direction === 'lower').map(([k]) => k));
export const LOWER_TEAM = new Set(Object.entries(TEAM_METRICS).filter(([, m]) => m.direction === 'lower').map(([k]) => k));

/** μορφοποίηση τιμής με βάση τον κατάλογο ('–' για ελλιπή) */
export function formatMetric(k, v, kind = 'player') {
  if (v == null || !Number.isFinite(v)) return '–';
  const m = metaOf(k, kind) || M('num', 1, 'none', '');
  if (m.format === 'pct') return (100 * v).toFixed(m.precision) + '%';
  if (m.format === 'int') return String(Math.round(v));
  if (m.format === 'signed') return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(m.precision);
  return v.toFixed(m.precision);
}

/** η καλύτερη τιμή ανάμεσα στις επιλογές (null αν δεν κρίνεται ή αν λείπουν τιμές) */
export function bestValue(k, values, kind = 'player') {
  const m = metaOf(k, kind); if (!m || m.direction === 'none') return null;
  const vs = values.filter(v => v != null && Number.isFinite(v)); if (vs.length < 2) return null;
  const b = m.direction === 'lower' ? Math.min(...vs) : Math.max(...vs);
  return vs.filter(v => v === b).length === vs.length ? null : b;   // όλες ίσες: καμία επισήμανση
}
