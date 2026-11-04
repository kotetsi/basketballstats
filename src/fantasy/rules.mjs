// Κανόνες του EuroLeague Fantasy Challenge (μία πηγή για optimizer, solver, planner, tests).
export const FORMATIONS = { '2-2-1': [2, 2, 1], '1-2-2': [1, 2, 2], '2-1-2': [2, 1, 2], '1-3-1': [1, 3, 1], '3-1-1': [3, 1, 1] };
export const POS = ['Guard', 'Forward', 'Center'];
export const ROSTER = { Guard: 4, Forward: 4, Center: 2 };
export const DEFAULTS = { budget: 100, maxPerTeam: 6, risk: 'balanced', formation: 'auto' };
export const OUT = s => s === 'injured' || s === 'rest' || s === 'out';
// πόντοι προπονητή από την τελική διαφορά (θετικό = νίκη)· η παράταση μετράει ως 1-10
export function coachPoints(margin, ot = false) {
  if (margin > 0) return ot || margin <= 10 ? 10 : margin <= 20 ? 20 : 25;
  const m = -margin;
  return ot || m <= 10 ? -5 : m <= 20 ? -10 : -20;
}
// πόντοι παίκτη: (PIR + 10% αν κερδίσει) × slot (πεντάδα/6ος 1, πάγκος 0,5)· ο αρχηγός (μόνο από πεντάδα) παίρνει ΜΙΑ επιπλέον πλήρη φορά
export function playerPoints(pir, { won = false, slot = 'start', captain = false } = {}) {
  const base = pir * (won ? 1.1 : 1) * (slot === 'bench' ? 0.5 : 1);
  return base + (captain && slot === 'start' ? base : 0);
}
