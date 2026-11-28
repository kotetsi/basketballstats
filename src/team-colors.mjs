// Χρώματα των ελληνικών ομάδων για τα σήματα (crest). [φόντο, γράμματα, περίγραμμα;]
// Από τα επίσημα χρώματα κάθε συλλόγου (Wikipedia «Team colors»). Ο Vikos δεν έχει δημοσιευμένα χρώματα: ουδέτερο.
export const GR_COLORS = {
  olympiacos: ['#c8102e', '#fff'],            // κόκκινο-λευκό
  panathinaikos: ['#00843d', '#fff'],         // πράσινο-λευκό
  paok: ['#111', '#fff'],                     // ασπρόμαυρο
  aris: ['#ffd200', '#111'],                  // κίτρινο-μαύρο
  aek: ['#111', '#ffd200'],                   // κίτρινο-μαύρο
  maroussi: ['#ffe600', '#111'],              // κίτρινο-μαύρο
  iraklis: ['#0050b5', '#fff'],               // μπλε-λευκό
  peristeri: ['#003da5', '#ffd200'],          // μπλε-κίτρινο
  kolossos: ['#00a9d6', '#fff'],              // λευκό-γαλάζιο
  promitheas: ['#f36f01', '#111'],            // μαύρο-λευκό-πορτοκαλί
  karditsa: ['#fff', '#1b3a6b', '#1b3a6b'],   // λευκό-μπλε
  doxa: ['#1f4e9c', '#fff'],                  // μπλε-λευκό
  mykonos: ['#fff', '#2b7fc4', '#2b7fc4'],    // μπλε-λευκό
  vikos: ['#4a5568', '#fff'],
};
const KEYS = [
  [/ΟΛΥΜΠΙΑΚ|OLYMPIA/i, 'olympiacos'], [/ΠΑΝΑΘΗΝΑ|PANATHINA/i, 'panathinaikos'], [/ΠΑΟΚ|PAOK/i, 'paok'], [/ΑΡΗΣ|ΆΡΗΣ|^ARIS|ARIS /i, 'aris'],
  [/^ΑΕΚ|^AEK/i, 'aek'], [/ΜΑΡΟΥΣΙ|MAROUS/i, 'maroussi'], [/ΗΡΑΚΛΗ|IRAKLIS/i, 'iraklis'], [/ΠΕΡΙΣΤΕΡ|PERISTERI/i, 'peristeri'],
  [/ΚΟΛΟΣΣ|KOLOSS/i, 'kolossos'], [/ΠΡΟΜΗΘ|PROMITHE/i, 'promitheas'], [/ΚΑΡΔΙΤΣ|KARDITS/i, 'karditsa'], [/ΔΟΞΑ|LEFKAD/i, 'doxa'],
  [/ΜΥΚΟΝ|MYKON/i, 'mykonos'], [/VIKOS|ΒΙΚΟΣ/i, 'vikos'],
];
/** χρώματα ελληνικής ομάδας από το όνομά της, αλλιώς null */
export function greekColors(name) {
  const n = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  for (const [re, k] of KEYS) if (re.test(n)) return GR_COLORS[k];
  return null;
}
/** style="" για σήμα: ελληνική ομάδα με τα χρώματά της, αλλιώς το χρώμα της παλέτας */
export function crestStyle(name, fallback) {
  const c = greekColors(name);
  if (!c) return `background:${fallback}`;
  return `background:${c[0]};color:${c[1]}` + (c[2] ? `;box-shadow:inset 0 0 0 2px ${c[2]}` : '');
}
