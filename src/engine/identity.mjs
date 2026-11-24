// Intelligence Engine — αντιστοίχιση ονομάτων από χειροκίνητες/εξωτερικές πηγές με τον κωδικό EuroLeague (player_id).
// Ίδιος κανόνας με το loadInjuries() του build.mjs (τρέχουσα ομάδα + το κανονικοποιημένο όνομα περιέχει το κλειδί),
// αλλά εδώ κάθε αποτυχία καταγράφεται με αιτία αντί για ένα warning στο log, και οι πολλαπλές αντιστοιχίσεις δεν
// επιλύονται σιωπηλά με την πρώτη. Δεν αλλάζει τη συμπεριφορά του site.

export const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toUpperCase();
const curTeam = p => String(p.t || '').split(';').pop();

/** γραμμές του traumaties.md: «ημερομηνία | παίκτης | ομάδα | επιστροφή | …» (οι υπόλοιπες γραμμές αγνοούνται) */
export function parseInjuryLines(text) {
  const out = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    if (!/^\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line)) return;
    const [date, who, team, ret] = line.split('|').map(s => s.trim());
    out.push({ line: i + 1, date, who, team: String(team || '').toUpperCase(), ret: ret || '' });
  });
  return out;
}

/** αντιστοίχιση ονόματος (+ ομάδας) με παίκτη. Επιστρέφει { player_id } ή { reason, candidates } */
export function resolve(who, team, players) {
  const key = normName(who).trim();
  if (!key) return { reason: 'empty_name', candidates: [] };
  const byName = players.filter(p => normName(p.n).includes(key));
  const hit = byName.filter(p => curTeam(p) === team);
  if (hit.length === 1) return { player_id: hit[0].c };
  if (hit.length > 1) return { reason: 'ambiguous', candidates: hit.map(p => p.c) };
  if (byName.length) return { reason: 'team_mismatch', candidates: byName.map(p => `${p.c}:${p.t}`) };
  // ο παίκτης δεν υπάρχει στα στατιστικά της σεζόν: το feed δίνει μόνο όσους έχουν αγωνιστεί (χρειάζεται πηγή ρόστερ)
  return { reason: 'no_appearance_this_season', candidates: [] };
}

/** αναφορά για όλες τις εγγραφές τραυματιών */
export function injuryReport(text, players) {
  const matched = [], unmatched = [];
  for (const e of parseInjuryLines(text)) {
    const r = resolve(e.who, e.team, players);
    (r.player_id ? matched : unmatched).push({ ...e, ...r });
  }
  return { n: matched.length + unmatched.length, matched: matched.length, unmatched };
}
