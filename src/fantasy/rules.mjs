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

// ---- Classic Mode: κεντρική, παραμετροποιήσιμη περιγραφή των κανόνων (ελέγχθηκε στο επίσημο rulebook στις 8/11/2026)
// https://fantaking.gitbook.io/euroleague-fantasy-challenge-rules  (Initial team · Managing your team · Players/Coach scoring)
export const CLASSIC_RULES = {
  verified: '2026-11-08',
  source: 'https://fantaking.gitbook.io/euroleague-fantasy-challenge-rules',
  players: 10,                         // + 1 προπονητής = 11 «αγορές» με 100 credits
  roster: ROSTER,                      // 4 γκαρντ, 4 φόργουορντ, 2 σέντερ
  coach: 1,
  budget: 100,                         // + 0,3 credits για κάθε αγωνιστική πριν από την εγγραφή
  lateJoinPerRound: 0.3,
  maxPerClub: 6,                       // και στα playoffs
  formations: FORMATIONS,              // πεντάδα γκαρντ-φόργουορντ-σέντερ
  slots: { start: 1, sixth: 1, bench: 0.5, coach: 1 },
  captain: { multiplier: 2, from: 'start' },
  winBonus: 0.10,                      // +10% του fantasy σκορ του παίκτη όταν κερδίζει η ομάδα του
  scoring: 'PIR (πόντοι, ριμπάουντ, ασίστ, κλεψίματα, τάπες, κερδισμένα φάουλ − άστοχα σουτ/βολές, λάθη, τάπες που δέχτηκε, φάουλ), κανονικός χρόνος + παρατάσεις',
  coachScoring: [[1, 10, 10], [11, 20, 20], [21, Infinity, 25]],   // νίκη· ήττα: −5 / −10 / −20, η παράταση μετράει ως 1-10
  tradesPerRound: 4,                   // ο προπονητής μετράει στις 4
  unlimitedTradesAfterRounds: [6, 13, 18, 23, 28, 34],   // και σε play-in, playoffs, Final Four
  deadline: 'first_tipoff_of_round',   // οι αλλαγές πρέπει να γίνουν πριν από το πρώτο τζάμπολ της αγωνιστικής
  turns: 'Ανάμεσα στα turns: αλλαγές πεντάδας-πάγκου, αρχηγού και σχηματισμού μόνο με παίκτες που δεν έχουν παίξει',
  sellValue: 'current',                // πουλάς στην τρέχουσα αξία του παίκτη (η αξία αλλάζει μετά από κάθε αγωνιστική)
};
/** πόσες μεταγραφές επιτρέπονται πριν από την αγωνιστική round (Infinity στα «ανοιχτά» παράθυρα) */
export function tradesAllowed(round, rules = CLASSIC_RULES) {
  return rules.unlimitedTradesAfterRounds.includes(round - 1) ? Infinity : rules.tradesPerRound;
}
