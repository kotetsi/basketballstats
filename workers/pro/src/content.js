// PRO περιεχόμενο: picks και Ανάλυση Αγώνα. Ο έλεγχος πρόσβασης γίνεται ΕΔΩ (server), όχι στον browser:
// ένας FREE χρήστης δεν λαμβάνει ποτέ παίκτη, αγορά, απόδοση, μονάδες ή ανάλυση pick που δεν έχει κριθεί.

/** κέρδος σε μονάδες */
export const profit = p => (p.result === 'won' ? +(p.stake * (p.odds - 1)).toFixed(2) : p.result === 'lost' ? -p.stake : 0);

// πεδία που βλέπουν όλοι (για το κλειδωμένο κουτί)
const PUBLIC = ['id', 'game_id', 'round', 'match_label', 'starts_at', 'published_at', 'result', 'settled_at'];
// μετά την κρίση το pick γίνεται δημόσιο στο Track Record (χωρίς την ανάλυση)
const SETTLED_PUBLIC = [...PUBLIC, 'player', 'market', 'odds', 'stake'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));

/** τι στέλνεται για ένα pick ανάλογα με την πρόσβαση */
export function viewPick(p, pro) {
  if (pro) return { ...pick(p, [...SETTLED_PUBLIC, 'analysis']), profit: profit(p), locked: false };
  if (p.result === 'pending') return { ...pick(p, PUBLIC), locked: true };
  return { ...pick(p, SETTLED_PUBLIC), profit: profit(p), locked: true };       // ανάλυση μόνο για PRO
}

/** σύνοψη Track Record: όλα τα κριμένα picks, με τις ήττες */
export function trackSummary(picks) {
  const s = picks.filter(p => p.result !== 'pending');
  const decided = s.filter(p => p.result !== 'void'), won = decided.filter(p => p.result === 'won').length;
  const staked = decided.reduce((a, p) => a + p.stake, 0), net = +s.reduce((a, p) => a + profit(p), 0).toFixed(2);
  return { total: s.length, won, lost: decided.length - won, void: s.length - decided.length, win_pct: decided.length ? won / decided.length : null, net_units: net, roi: staked ? net / staked : null };
}

const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n) : null);
/** επικύρωση φόρμας admin (χωρίς HTML: η ανάλυση αποθηκεύεται ως κείμενο και αποδίδεται με escaping) */
export function validatePick(b, partial = false) {
  const o = {}, err = [];
  const set = (k, v, ok) => { if (b[k] === undefined && partial) return; if (!ok(v)) err.push(k); else o[k] = v; };
  set('game_id', str(b.game_id, 20), v => /^[EU]-\d{1,2}-[A-Z]{3}-[A-Z]{3}$/.test(v || ''));
  set('round', +b.round, v => Number.isInteger(v) && v >= 1 && v <= 60);
  set('match_label', str(b.match_label, 80), v => !!v);
  set('starts_at', b.starts_at == null ? null : str(b.starts_at, 30), v => v == null || !isNaN(Date.parse(v)));
  set('player', b.player == null ? null : str(b.player, 60), () => true);
  set('market', str(b.market, 120), v => !!v);
  set('odds', +b.odds, v => v >= 1.01 && v <= 100);
  set('stake', b.stake == null && !partial ? 1 : +b.stake, v => v > 0 && v <= 10);
  set('analysis', str(b.analysis ?? '', 4000), v => v != null);
  set('published_at', b.published_at == null && !partial ? new Date().toISOString() : str(b.published_at, 30), v => !isNaN(Date.parse(v)));
  return { ok: !err.length, value: o, errors: err };
}
