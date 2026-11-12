// «Ρώτα το BasketballStats»: απαντήσεις σε ερωτήσεις Fantasy χωρίς AI, μόνο από τα δεδομένα του site.
// Καθαρές συναρτήσεις (χωρίς DOM) ώστε να ελέγχονται με node --test.
//  - pkey: φωνητικό κλειδί που ενώνει ελληνική και λατινική γραφή (Ιφή ≈ Hifi, Βεζένκοφ ≈ Vezenkov)
//  - findPlayers: ποιοι παίκτες αναφέρονται στην ερώτηση (αντέχει ορθογραφικά λάθη)
//  - intent: τι ρωτάει (βάζω; αρχηγός; Χ ή Ψ; τραυματίας; πότε παίζει; καλύτεροι της μέρας)
//  - answer: η απάντηση σε HTML, με αριθμούς από τις εκτιμήσεις και links στις σελίδες του site

const GR = [['μπ', 'b'], ['ντ', 'd'], ['γκ', 'g'], ['γγ', 'g'], ['τζ', 'dz'], ['τσ', 'ts'], ['ου', 'u'], ['αι', 'e'], ['ει', 'i'], ['οι', 'i'], ['υι', 'i'], ['αυ', 'av'], ['ευ', 'ev']];
const G1 = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 't', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'ks', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'i', φ: 'f', χ: '', ψ: 'ps', ω: 'o' };
const LAT = [['sch', 's'], ['ch', 's'], ['sh', 's'], ['ph', 'f'], ['th', 't'], ['ck', 'k'], ['ou', 'u'], ['oo', 'u'], ['ee', 'i'], ['ae', 'e'], ['ai', 'e'], ['ei', 'i'], ['aye', 'ei'], ['ay', 'ei'], ['ey', 'ei'], ['oe', 'e'], ['ci', 'si'], ['ce', 'se'], ['ć', 'c'], ['č', 'ts'], ['š', 's'], ['ž', 'z'], ['đ', 'dz'], ['dj', 'dz']];
const L1 = { c: 'k', q: 'k', x: 'ks', w: 'v', y: 'i', j: 'dz', h: '' };

export const strip = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** φωνητικό κλειδί: ίδιο για «Ιφή», «Ιφί», «Hifi», «ifi» */
export function pkey(s) {
  // «έι», «άι», «όι» με τόνο στο πρώτο φωνήεν είναι δύο φθόγγοι (Χέις = he-is), όχι δίφθογγος
  let t = String(s ?? '').toLowerCase().replace(/έι/g, 'e\u0001').replace(/άι/g, 'a\u0001').replace(/όι/g, 'o\u0001');
  t = strip(t).replace(/[^a-zα-ωςćčšžđ\u0001 ]/g, ' ');
  for (const [a, b] of GR) t = t.split(a).join(b);
  t = t.replace(/[α-ως]/g, ch => G1[ch] ?? ch);
  for (const [a, b] of LAT) t = t.split(a).join(b);
  t = t.replace(/[a-z]/g, ch => (ch in L1 ? L1[ch] : ch));
  t = t.replace(/\u0001/g, 'i');
  t = t.replace(/v/g, 'f');   // Βεζένκοφ = Vezenkov
  return t.replace(/(.)\1+/g, '$1').replace(/\s+/g, ' ').trim();
}
export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, j) => j), c = new Array(n + 1);
  for (let i = 1; i <= m; i++) { c[0] = i; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [p, c] = [c, p]; }
  return p[n];
}
export const sim = (a, b) => (a && b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 0);

// λέξεις που δεν είναι ονόματα (σε κλειδί pkey)
const STOP = new Set(['na', 'ton', 'tin', 'to', 'ta', 'tus', 'o', 'i', 'me', 'se', 'ke', 'ali', 'ala', 'ama', 'apo', 'ja', 'pos', 'pio', 'pios', 'pion', 'pia', 'pote', 'simera', 'avrio', 'metavrio', 'valo', 'vazo', 'valume', 'parume', 'paro', 'perno', 'arxigo', 'arigo', 'kapitan', 'aksizi', 'pezi', 'peksi', 'tha', 'ine', 'stin', 'ston', 'sto', 'enantion', 'kata', 'fantasi', 'fantasy', 'fantazi', 'should', 'start', 'sit', 'the', 'and', 'for', 'tonight', 'today', 'tomorow', 'who', 'what', 'when', 'does', 'play', 'plais', 'plai', 'or', 'vs', 'versus', 'kaptan', 'kim', 'bugun', 'iarin', 'yarin', 'mi', 'oinar', 'oinuyor', 'da', 'li', 'koga', 'kada', 'igra', 'danas', 'sutra', 'ili', 'que', 'quien', 'hoy', 'manana', 'juega', 'pongo', 'kapiten', 'kapitena', 'arxigos', 'traumatias', 'travmatias', 'injured', 'injury', 'out', 'paiktis', 'player', 'team', 'omada', 'kalitero', 'kaliteri', 'kaliteros', 'kaliteri', 'agonistiki', 'round', 'diladi', 'pedia', 'leti', 'proplepete', 'provlepete', 'jini', 'ji', 'jinete', 'pai', 'peksis', 'pezis']);

// λέξεις ερωτήσεων στατιστικών (πόσες βολές έχει σουτάρει…): περνάνε από pkey για να ταιριάζουν με τα tokens
for (const w of ['ρώτησα', 'ρωτάω', 'πόσες', 'πόσους', 'πόσα', 'πόσο', 'πόση', 'έχει', 'είχε', 'έκανε', 'σουτάρει', 'σούταρε', 'σουτ', 'μέσο', 'όρο', 'σεζόν', 'φέτος', 'τελευταίο', 'τελευταία', 'ματς', 'αγώνα', 'αγώνες', 'αγώνας', 'σύνολο', 'συνολικά', 'χθες', 'ανά', 'many', 'much', 'average', 'season', 'last', 'game', 'games', 'cuantos', 'cuantas', 'partido', 'koliko', 'utakmica', 'kac', 'mac', 'ortalama', 'son'])
  STOP.add(pkey(w));

/** ευρετήριο ονομάτων από τα δεδομένα του site */
export function buildIndex(D) {
  const P = D.players.map(p => {
    const names = [p.n, ...(p.alt || [])].filter(Boolean);
    const keys = new Set(), sur = new Set();
    for (const nm of names) {
      const k = pkey(nm.replace(/\(.*?\)/g, ' ')); if (!k) continue; keys.add(k);
      const w = k.split(' ').filter(x => x.length >= 2); if (w.length) { sur.add(w[w.length - 1]); if (w.length > 2) sur.add(w.slice(1).join(' ')); }
      for (const x of w) if (x.length >= 4) keys.add(x);
    }
    return { p, keys: [...keys], sur: [...sur] };
  });
  const T = Object.entries(D.teams).map(([c, t]) => ({ c, keys: [...new Set([t.n, ...(t.alt || [])].map(pkey).flatMap(k => [k, ...k.split(' ').filter(x => x.length >= 4)]))] }));
  return { P, T };
}

/** παίκτες που αναφέρονται στην ερώτηση, με τη σειρά που εμφανίζονται */
export function findPlayers(q, idx) {
  // λέξη προς λέξη· κρατάμε και σύντομα κλειδιά (π.χ. «Χέις» → «is») όταν η λέξη έχει ≥4 γράμματα
  const toks = String(q ?? '').toLowerCase().replace(/['’`]/g, ' ').split(/[\s,.;:!?;()«»"\-‐–]+/).map(w => ({ w, k: pkey(w) }))
    .filter(x => x.k && !x.k.includes(' ') && !STOP.has(x.k) && !statWord(x.w) && (x.k.length >= 3 || x.w.replace(/[^\p{L}]/gu, '').length >= 4)).map(x => x.k);
  // καταλήξεις κλίσης (σερβικά/τουρκικά/ελληνικά): «Hifija» → «ifi», «Vezenkova» → «vezenkov»
  const vars = w => [w, ...['dza', 'dzu', 'dze', 'om', 'em', 'a', 'u', 'e', 'i'].filter(x => w.length - x.length >= 3 && w.endsWith(x)).map(x => w.slice(0, -x.length))];
  const teamTok = new Set(toks.filter(w => idx.T.some(t => t.keys.some(k => sim(w, k) >= 0.8))));
  const hits = [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i], w2 = i + 1 < toks.length ? w + ' ' + toks[i + 1] : null;
    let best = null;
    for (const e of idx.P) {
      let s = 0;
      for (const v of vars(w)) {
        const pen = v === w ? 1 : 0.97;
        for (const k of e.sur) s = Math.max(s, sim(v, k) * pen);
        for (const k of e.keys) s = Math.max(s, k.length >= 4 ? sim(v, k) * 0.96 * pen : 0);
      }
      if (w2) for (const k of [...e.sur, ...e.keys]) s = Math.max(s, sim(w2, k));
      const need = w.length <= 4 ? 0.95 : w.length <= 6 ? 0.8 : 0.74;
      if (s >= need && (!best || s > best.s || (s === best.s && (e.p.pp ?? -1) > (best.e.p.pp ?? -1)))) best = { e, s };
    }
    if (best && !(teamTok.has(w) && best.s < 0.95) && !hits.some(h => h.p === best.e.p)) hits.push({ p: best.e.p, s: best.s, i });
  }
  return hits;
}

const RX = {
  cap: /αρχηγ|captain|capit|kapit|kaptan/,
  inj: /τραυμ|travm|traum|τραυματ|διαθεσιμ|θα παιξει|παιζει(?![α-ω])|παιζουν(?![α-ω])|ειναι εκτος|injur|is .* playing|will .* play|lesion|povre|povred|igra li|sakat|oynayacak/,
  when: /ποτε|when|cuando|kada|ne zaman/,
  cmp: /\sή\s|\sη\s(?=\S)|\bor\b|\bvs\.?\b|\bo\b|\bili\b|\bveya\b|\bmi yoksa\b|ποιον απο|ποιος απο|ποιον να βαλω/,
  best: /ποιους|ποιον|ποιοι|ποιος|καλυτερ|who|best|top|quien|mejor|koga|najbolj|kim|en iyi/,
  today: /σημερα|today|tonight|hoy|danas|bugun/, tomorrow: /αυριο|tomorrow|manana|sutra|yarin/, after: /μεθαυριο|παρασκευη|friday|viernes|petak|cuma/,
};
// ---------------------------------------------------------------- ερωτήσεις στατιστικών
// θέσεις στο p.s (μετά τους αγώνες) και στο p.g (μετά από αγωνιστική, αντίπαλο): ίδια σειρά με ASK_SK στο build.mjs
export const SK = { min: 0, pts: 1, reb: 2, ast: 3, stl: 4, blk: 5, tov: 6, m2: 7, a2: 8, m3: 9, a3: 10, ftm: 11, fta: 12, pf: 13, pir: 14 };
const STATS = [
  ['ft', /βολ|free ?throw|\bft\b|tiros? libre|slobodn|bacanj|serbest/],
  ['p3', /τριποντ|τριπ|3π|3 ?pt|three|triple|trojk|tricas|ucluk/],
  ['p2', /διποντ|2π|2 ?pt|two point|dobles|dvojk|ikilik/],
  ['pts', /(^|[^ι])ποντ|point|punto|poen|sayi/],
  ['reb', /ριμπ|rebound|rebote|skok|ribaund/],
  ['ast', /ασιστ|πασες|assist|asisten|asist/],
  ['stl', /κλεψ|κλεμ|steal|robo|ukraden|top cal/],
  ['blk', /κοψ|ταπ(α|ε)|block|tapon|blokad|blok/],
  ['tov', /λαθ|turnover|perdida|izgubljen|top kayb/],
  ['pf', /φαουλ|foul|falta|faul/],
  ['min', /λεπτ|minut|dakika/],
  ['pir', /\bpir\b|valoracion|ranking/],
];
const SHOTS = /σουτ|shoot|shot|\btiro|sut\b|sutira|sutev|isabet/;
const COUNTQ = /ποσ(ες|ους|α|ο|η|οι)\b|how many|how much|cuant|koliko|kac\b|μεσο ορο|average|promedio|prosek|ortalama/;
const statWord = w => { const t = strip(w); return t.length >= 2 && (STATS.some(([, rx]) => rx.test(t)) || SHOTS.test(t)); };
/** ποια στατιστικά ζητάει η ερώτηση (κενό αν δεν είναι ερώτηση στατιστικών) */
export function statsWanted(q) {
  const t = strip(q), out = STATS.filter(([, rx]) => rx.test(t)).map(([k]) => k);
  if (!out.length && SHOTS.test(t)) out.push('p2', 'p3', 'ft');
  // «πόσους πόντους PIR θα φέρει;» / «τι PIR θα κάνει» είναι ερώτηση Fantasy (εκτίμηση), όχι ιστορικό
  if (out.length === 1 && out[0] === 'pir' && !COUNTQ.test(t)) return [];
  return out;
}

/** τι ρωτάει: stat | start | captain | compare | injury | when | best | unknown */
export function intent(q, hits) {
  const t = strip(q);
  if (hits.length && statsWanted(q).length) return 'stat';
  if (hits.length >= 2) return 'compare';
  if (hits.length === 1) {
    if (RX.cap.test(t)) return 'captain';
    if (RX.when.test(t)) return 'when';
    if (RX.inj.test(t) && !/να (τον )?βαλω|start/.test(t)) return 'injury';
    return 'start';
  }
  if (RX.cap.test(t) || RX.best.test(t) || RX.today.test(t) || RX.tomorrow.test(t)) return RX.cap.test(t) ? 'bestcap' : 'best';
  return 'unknown';
}
export function dayWanted(q, D, today) {
  const t = strip(q), di = D.days.indexOf(today);
  if (RX.today.test(t)) return di >= 0 ? di : null;
  if (RX.after.test(t) && di >= 0 && di + 2 < D.days.length) return di + 2;
  if (RX.tomorrow.test(t)) { const i = D.days.indexOf(addDay(today, 1)); return i >= 0 ? i : null; }
  return null;
}
const addDay = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// ---------------------------------------------------------------- κείμενα
const TX = {
  el: { yes1: 'Ναι, είναι από τις κορυφαίες επιλογές της αγωνιστικής.', yes: 'Ναι, είναι καλή επιλογή.', meh: 'Οριακή επιλογή: μπορεί να σταθεί, αλλά υπάρχουν καλύτερες.', no: 'Μάλλον όχι: υπάρχουν αρκετά καλύτερες επιλογές.', out: 'Όχι: είναι εκτός ({t}).', doubt: 'Προσοχή: είναι αμφίβολος. Κράτα έτοιμη αλλαγή.', noproj: 'Δεν έχουμε εκτίμηση γι’ αυτόν στην αγωνιστική (μάλλον δεν είναι στη rotation).', proj: 'Εκτίμηση: <b>{pp} PIR</b> (εύρος {lo}–{hi}), {rk}η καλύτερη από {n} παίκτες.', vs: 'Παίζει {day}{time}, αντίπαλος: {opp} ({ha}).', home: 'εντός έδρας', away: 'εκτός έδρας', def1: 'Ο αντίπαλος ({opp}) έχει την {r}η καλύτερη άμυνα της διοργάνωσης ({pa} πόντοι παθητικό), γι’ αυτό η εκτίμηση είναι συγκρατημένη.', def2: 'Ο αντίπαλος ({opp}) έχει μία από τις πιο αδύναμες άμυνες ({pa} πόντοι παθητικό), που βοηθάει.', form: 'Στα 3 τελευταία ματς: {l3} PIR (μέσος όρος σεζόν {avg}).', cap1: 'Ναι, είναι η κορυφαία επιλογή αρχηγού της αγωνιστικής ({cp} πόντοι ως αρχηγός).', capY: 'Καλή επιλογή αρχηγού: {rk}ος στην εκτίμηση ({cp} πόντοι ως αρχηγός).', capN: 'Δεν θα τον έβαζα αρχηγό: είναι {rk}ος στην εκτίμηση.', capBest: 'Πρώτη επιλογή για αρχηγό: {p} ({pp} PIR).', capDay: 'Την ίδια μέρα, η πρώτη επιλογή είναι ο {p} ({pp} PIR).', cmpW: '<b>{a}</b> αντί για {b}: {pa} έναντι {pb} εκτιμώμενου PIR.', cmpEq: 'Πρακτικά ισοπαλία: {pa} έναντι {pb} εκτιμώμενου PIR. Διάλεξε με βάση την ομάδα σου.', cmpOut: 'Ο {b} είναι εκτός, άρα ο {a}.', injOk: 'Δεν έχουμε ένδειξη τραυματισμού: είναι διαθέσιμος.', injOut: 'Είναι εκτός: {t}.', injDoubt: 'Είναι αμφίβολος.', injMiss: 'Δεν έχει αγωνιστεί στους τελευταίους αγώνες της ομάδας του.', noGame: 'Η ομάδα του δεν έχει αγώνα σε αυτή την αγωνιστική.', best: 'Οι καλύτερες επιλογές {day}:', bestCap: 'Οι καλύτερες επιλογές αρχηγού {day}:', noDay: 'Δεν υπάρχουν αγώνες εκείνη τη μέρα.', unk: 'Δεν κατάλαβα ποιον παίκτη εννοείς. Δοκίμασε π.χ. «να βάλω τον Βεζένκοφ;», «Ιφί ή Τζόουνς;», «ποιον αρχηγό σήμερα;».', ph: 'Ρώτα για το Fantasy… π.χ. «να βάλω τον Ιφί σήμερα;»', go: 'Ρώτα', mic: 'Πες την ερώτηση', listen: 'Σε ακούω…', more: 'Σελίδα παίκτη', fx: 'Fantasy προφίλ', caps: 'Αρχηγοί της αγωνιστικής', today: 'σήμερα', tomorrow: 'αύριο', disc: 'Απαντήσεις από το μοντέλο του site, όχι εγγύηση απόδοσης.', vxW: 'Χωρίς {a}: {games} έπαιξε {avg}{m}′, γι’ αυτό η εκτίμηση {dir} κατά {dp} PIR.', vxV: 'Με {a} εκτός, παίρνει περίπου {dm}′ περισσότερα, άρα +{dp} PIR στην εκτίμηση.', up: 'ανεβαίνει', down: 'πέφτει', and: ' και ', price: 'Η απάντηση δεν υπολογίζει την τιμή του: αν είναι φθηνός, μπορεί να αξίζει για να μείνουν credits σε άλλες θέσεις.', yesterday: 'χθες', played: 'Έπαιξε ήδη σε αυτή την αγωνιστική ({day}, με {opp}){res}.', pres: ' και έκανε <b>{pir} PIR</b> ({pts} πόντους)', pdnp: ', αλλά δεν αγωνίστηκε', pnext: 'Για αυτή την αγωνιστική δεν μετράει άλλο· δες το Fantasy προφίλ του για τις επόμενες.', cmpPlayed: 'Ο {b} έχει ήδη παίξει σε αυτή την αγωνιστική, άρα ο {a}.', cmpBoth: 'Και οι δύο έχουν ήδη παίξει σε αυτή την αγωνιστική.', title: 'Ρώτα το BasketballStats', st: { ft: 'Βολές', p3: 'Τρίποντα', p2: 'Δίποντα', pts: 'Πόντοι', reb: 'Ριμπάουντ', ast: 'Ασίστ', stl: 'Κλεψίματα', blk: 'Κοψίματα', tov: 'Λάθη', pf: 'Φάουλ', min: 'Λεπτά', pir: 'PIR' }, season: 'Σεζόν ({g} αγώνες)', perG: '{v} ανά αγώνα', lastG: 'Τελευταίοι αγώνες', rnd: '{r}η', noStats: 'Δεν έχει αγωνιστεί ακόμη φέτος.', made: 'μπήκαν / σουτ' },
  en: { yes1: 'Yes, he is one of the top picks of the round.', yes: 'Yes, he is a good pick.', meh: 'Borderline: he can work, but there are better options.', no: 'Probably not: there are clearly better options.', out: 'No: he is out ({t}).', doubt: 'Careful: he is doubtful. Keep a replacement ready.', noproj: 'We have no projection for him this round (probably out of the rotation).', proj: 'Projection: <b>{pp} PIR</b> (range {lo}–{hi}), {rk} best of {n} players.', vs: 'Plays {day} {ha} {opp}{time}.', home: 'vs', away: 'at', def1: '{opp} have the {r} best defense in the league ({pa} points allowed), so the projection is conservative.', def2: '{opp} have one of the weakest defenses ({pa} points allowed), which helps.', form: 'Last 3 games: {l3} PIR (season average {avg}).', cap1: 'Yes, he is the top captain pick of the round ({cp} points as captain).', capY: 'Good captain pick: {rk} in the projections ({cp} points as captain).', capN: 'I would not captain him: he is {rk} in the projections.', capBest: 'Top captain pick: {p} ({pp} PIR).', capDay: 'On the same day, the top pick is {p} ({pp} PIR).', cmpW: '<b>{a}</b> over {b}: {pa} vs {pb} projected PIR.', cmpEq: 'Practically a tie: {pa} vs {pb} projected PIR. Pick based on your team.', cmpOut: '{b} is out, so {a}.', injOk: 'No sign of injury: he is available.', injOut: 'He is out: {t}.', injDoubt: 'He is doubtful.', injMiss: 'He has missed his team’s last games.', noGame: 'His team has no game this round.', best: 'Best picks {day}:', bestCap: 'Best captain picks {day}:', noDay: 'No games on that day.', unk: 'I could not tell which player you mean. Try e.g. “should I start Vezenkov?”, “Hifi or Jones?”, “who to captain today?”.', ph: 'Ask about Fantasy… e.g. “should I start Hifi today?”', go: 'Ask', mic: 'Speak your question', listen: 'Listening…', more: 'Player page', fx: 'Fantasy profile', caps: 'Captains of the round', today: 'today', tomorrow: 'tomorrow', disc: 'Answers from the site’s model, not a guarantee of performance.', vxW: 'Without {a}: in the games he missed ({n}) he averaged {m}′, so the projection goes {dir} by {dp} PIR.', vxV: 'With {a} out, he gets about {dm}′ more, so +{dp} PIR in the projection.', up: 'up', down: 'down', and: ' and ', price: 'This does not factor in his price: if he is cheap, he can still be worth it to free up credits elsewhere.', yesterday: 'yesterday', played: 'Already played this round ({day}, vs {opp}){res}.', pres: ': <b>{pir} PIR</b> ({pts} points)', pdnp: ', but did not play', pnext: 'This round is done for him; see his Fantasy profile for the next rounds.', cmpPlayed: '{b} has already played this round, so {a}.', cmpBoth: 'Both have already played this round.', title: 'Ask BasketballStats', st: { ft: 'Free throws', p3: 'Three-pointers', p2: 'Two-pointers', pts: 'Points', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks', tov: 'Turnovers', pf: 'Fouls', min: 'Minutes', pir: 'PIR' }, season: 'Season ({g} games)', perG: '{v} per game', lastG: 'Last games', rnd: 'R{r}', noStats: 'He has not played this season yet.', made: 'made / attempted' },
};
TX.es = { ...TX.en, yes1: 'Sí, es de las mejores opciones de la jornada.', yes: 'Sí, es buena opción.', meh: 'Opción dudosa: puede servir, pero hay mejores.', no: 'Mejor no: hay opciones claramente mejores.', out: 'No: está de baja ({t}).', doubt: 'Cuidado: es duda. Ten un cambio preparado.', noproj: 'No tenemos estimación para él esta jornada.', proj: 'Estimación: <b>{pp} de PIR</b> (rango {lo}–{hi}), el {rk}º mejor de {n}.', vs: 'Juega {day} {ha} {opp}{time}.', home: 'contra', away: 'en casa de', def1: '{opp} tiene la {r}ª mejor defensa ({pa} puntos recibidos), por eso la estimación es prudente.', def2: '{opp} tiene una de las defensas más débiles ({pa} puntos recibidos), lo que ayuda.', form: 'Últimos 3 partidos: {l3} de PIR (media {avg}).', cap1: 'Sí, es el mejor capitán de la jornada ({cp} puntos como capitán).', capY: 'Buen capitán: {rk}º en la estimación ({cp} puntos como capitán).', capN: 'No lo haría capitán: es {rk}º en la estimación.', capBest: 'Mejor capitán: {p} ({pp} de PIR).', capDay: 'Ese mismo día, la mejor opción es {p} ({pp} de PIR).', cmpW: '<b>{a}</b> antes que {b}: {pa} frente a {pb} de PIR estimado.', cmpEq: 'Prácticamente empate: {pa} frente a {pb}. Decide según tu equipo.', cmpOut: '{b} está de baja, así que {a}.', injOk: 'Sin indicios de lesión: está disponible.', injOut: 'Está de baja: {t}.', injDoubt: 'Es duda.', injMiss: 'Se ha perdido los últimos partidos de su equipo.', noGame: 'Su equipo no juega esta jornada.', best: 'Mejores opciones {day}:', bestCap: 'Mejores capitanes {day}:', noDay: 'No hay partidos ese día.', unk: 'No sé a qué jugador te refieres. Prueba «¿pongo a Vezenkov?», «¿Hifi o Jones?», «¿qué capitán hoy?».', ph: 'Pregunta sobre el Fantasy… p. ej. «¿pongo a Hifi hoy?»', go: 'Preguntar', mic: 'Di tu pregunta', listen: 'Te escucho…', more: 'Ficha', fx: 'Perfil Fantasy', caps: 'Capitanes de la jornada', today: 'hoy', tomorrow: 'mañana', disc: 'Respuestas del modelo del sitio, sin garantía de rendimiento.', vxW: 'Sin {a}: en los partidos que faltó ({n}) promedió {m}′, por eso la estimación {dir} {dp} de PIR.', vxV: 'Con {a} de baja, juega unos {dm}′ más: +{dp} de PIR en la estimación.', up: 'sube', down: 'baja', and: ' y ', price: 'No tiene en cuenta su precio: si es barato, puede compensar para liberar créditos.', yesterday: 'ayer', played: 'Ya jugó esta jornada ({day}, contra {opp}){res}.', pres: ': <b>{pir} de PIR</b> ({pts} puntos)', pdnp: ', pero no jugó', pnext: 'Esta jornada ya no cuenta; mira su perfil Fantasy para las próximas.', cmpPlayed: '{b} ya jugó esta jornada, así que {a}.', cmpBoth: 'Los dos ya jugaron esta jornada.', title: 'Pregunta a BasketballStats', st: { ft: 'Tiros libres', p3: 'Triples', p2: 'Tiros de 2', pts: 'Puntos', reb: 'Rebotes', ast: 'Asistencias', stl: 'Robos', blk: 'Tapones', tov: 'Pérdidas', pf: 'Faltas', min: 'Minutos', pir: 'PIR' }, season: 'Temporada ({g} partidos)', perG: '{v} por partido', lastG: 'Últimos partidos', rnd: 'J{r}', noStats: 'Todavía no ha jugado esta temporada.', made: 'anotados / intentados' };
TX.sr = { ...TX.en, yes1: 'Da, jedan je od najboljih izbora kola.', yes: 'Da, dobar je izbor.', meh: 'Granično: može, ali ima boljih.', no: 'Verovatno ne: ima znatno boljih izbora.', out: 'Ne: van terena je ({t}).', doubt: 'Oprez: neizvestan je. Drži zamenu spremnom.', noproj: 'Nemamo procenu za njega u ovom kolu.', proj: 'Procena: <b>{pp} PIR</b> (raspon {lo}–{hi}), {rk}. od {n} igrača.', vs: 'Igra {day} {ha} {opp}{time}.', home: 'protiv', away: 'u gostima kod', def1: '{opp} ima {r}. najbolju odbranu ({pa} primljenih poena), pa je procena oprezna.', def2: '{opp} ima jednu od najslabijih odbrana ({pa} primljenih poena), što pomaže.', form: 'Poslednje 3 utakmice: {l3} PIR (prosek {avg}).', cap1: 'Da, najbolji je izbor za kapitena ({cp} poena kao kapiten).', capY: 'Dobar kapiten: {rk}. po proceni ({cp} poena kao kapiten).', capN: 'Ne bih ga stavio za kapitena: {rk}. je po proceni.', capBest: 'Najbolji kapiten: {p} ({pp} PIR).', capDay: 'Istog dana najbolji je {p} ({pp} PIR).', cmpW: '<b>{a}</b> pre nego {b}: {pa} prema {pb} procenjenog PIR-a.', cmpEq: 'Praktično nerešeno: {pa} prema {pb}. Odluči prema svom timu.', cmpOut: '{b} je van terena, dakle {a}.', injOk: 'Nema znakova povrede: dostupan je.', injOut: 'Van terena: {t}.', injDoubt: 'Neizvestan je.', injMiss: 'Propustio je poslednje utakmice svog tima.', noGame: 'Njegov tim ne igra u ovom kolu.', best: 'Najbolji izbori {day}:', bestCap: 'Najbolji kapiteni {day}:', noDay: 'Tog dana nema utakmica.', unk: 'Nisam prepoznao igrača. Probaj „da li da stavim Vezenkova?“, „Hifi ili Džons?“, „koga za kapitena danas?“.', ph: 'Pitaj o Fantasy-ju… npr. „da li da stavim Hifija danas?“', go: 'Pitaj', mic: 'Izgovori pitanje', listen: 'Slušam…', more: 'Profil', fx: 'Fantasy profil', caps: 'Kapiteni kola', today: 'danas', tomorrow: 'sutra', disc: 'Odgovori po modelu sajta, bez garancije učinka.', vxW: 'Bez {a}: u utakmicama koje je propustio ({n}) igrao je prosečno {m}′, pa procena {dir} za {dp} PIR.', vxV: 'Pošto je {a} van terena, igra oko {dm}′ više: +{dp} PIR u proceni.', up: 'raste', down: 'pada', and: ' i ', price: 'Ovo ne uzima u obzir njegovu cenu: ako je jeftin, može se isplatiti zbog kredita za druge pozicije.', yesterday: 'juče', played: 'Već je igrao u ovom kolu ({day}, protiv {opp}){res}.', pres: ': <b>{pir} PIR</b> ({pts} poena)', pdnp: ', ali nije ulazio u igru', pnext: 'Ovo kolo je za njega završeno; pogledaj Fantasy profil za sledeća kola.', cmpPlayed: '{b} je već igrao u ovom kolu, dakle {a}.', cmpBoth: 'Obojica su već igrala u ovom kolu.', title: 'Pitaj BasketballStats', st: { ft: 'Slobodna bacanja', p3: 'Trojke', p2: 'Dvojke', pts: 'Poeni', reb: 'Skokovi', ast: 'Asistencije', stl: 'Ukradene lopte', blk: 'Blokade', tov: 'Izgubljene lopte', pf: 'Faulovi', min: 'Minuti', pir: 'PIR' }, season: 'Sezona ({g} utakmica)', perG: '{v} po utakmici', lastG: 'Poslednje utakmice', rnd: '{r}. kolo', noStats: 'Još nije igrao ove sezone.', made: 'pogođeno / pokušaja' };
TX.tr = { ...TX.en, yes1: 'Evet, haftanın en iyi seçeneklerinden biri.', yes: 'Evet, iyi bir seçim.', meh: 'Sınırda: olabilir ama daha iyileri var.', no: 'Muhtemelen hayır: belirgin şekilde daha iyi seçenekler var.', out: 'Hayır: oynamıyor ({t}).', doubt: 'Dikkat: şüpheli. Yedeğini hazır tut.', noproj: 'Bu hafta için tahminimiz yok.', proj: 'Tahmin: <b>{pp} PIR</b> (aralık {lo}–{hi}), {n} oyuncu içinde {rk}.', vs: '{day} {opp} {ha}{time} oynuyor.', home: 'karşısında', away: 'deplasmanında', def1: '{opp} ligin {r}. en iyi savunmasına sahip ({pa} sayı yiyor), bu yüzden tahmin temkinli.', def2: '{opp} en zayıf savunmalardan birine sahip ({pa} sayı yiyor), bu da yardımcı oluyor.', form: 'Son 3 maç: {l3} PIR (sezon ortalaması {avg}).', cap1: 'Evet, haftanın en iyi kaptan seçeneği (kaptan olarak {cp} puan).', capY: 'İyi bir kaptan: tahminde {rk}. (kaptan olarak {cp} puan).', capN: 'Kaptan yapmazdım: tahminde {rk}.', capBest: 'En iyi kaptan: {p} ({pp} PIR).', capDay: 'Aynı gün en iyi seçenek {p} ({pp} PIR).', cmpW: '{b} yerine <b>{a}</b>: {pa}’e karşı {pb} tahmini PIR.', cmpEq: 'Neredeyse eşit: {pa}’e karşı {pb}. Takımına göre seç.', cmpOut: '{b} oynamıyor, yani {a}.', injOk: 'Sakatlık belirtisi yok: oynayabilir.', injOut: 'Oynamıyor: {t}.', injDoubt: 'Şüpheli.', injMiss: 'Takımının son maçlarında oynamadı.', noGame: 'Takımının bu hafta maçı yok.', best: '{day} en iyi seçenekler:', bestCap: '{day} en iyi kaptanlar:', noDay: 'O gün maç yok.', unk: 'Hangi oyuncuyu kastettiğini anlayamadım. Örn. “Vezenkov’u koyayım mı?”, “Hifi mi Jones mu?”, “bugün kim kaptan?”.', ph: 'Fantasy hakkında sor… örn. “Hifi’yi bugün koyayım mı?”', go: 'Sor', mic: 'Sorunu söyle', listen: 'Dinliyorum…', more: 'Oyuncu sayfası', fx: 'Fantasy profili', caps: 'Haftanın kaptanları', today: 'bugün', tomorrow: 'yarın', disc: 'Sitenin modeline göre yanıtlar, performans garantisi değildir.', vxW: '{a} yokken: kaçırdığı maçlarda ({n}) ortalama {m}′ oynadı, bu yüzden tahmin {dp} PIR {dir}.', vxV: '{a} oynamadığı için yaklaşık {dm}′ fazla süre alıyor: tahminde +{dp} PIR.', up: 'artıyor', down: 'düşüyor', and: ' ve ', price: 'Fiyatı hesaba katılmıyor: ucuzsa, diğer pozisyonlara kredi bırakmak için yine de değebilir.', yesterday: 'dün', played: 'Bu hafta zaten oynadı ({day}, {opp} karşısında){res}.', pres: ': <b>{pir} PIR</b> ({pts} sayı)', pdnp: ', ama süre almadı', pnext: 'Bu hafta onun için bitti; sonraki haftalar için Fantasy profiline bak.', cmpPlayed: '{b} bu hafta zaten oynadı, yani {a}.', cmpBoth: 'İkisi de bu hafta zaten oynadı.', title: 'BasketballStats’a sor', st: { ft: 'Serbest atış', p3: 'Üçlük', p2: 'İkilik', pts: 'Sayı', reb: 'Ribaund', ast: 'Asist', stl: 'Top çalma', blk: 'Blok', tov: 'Top kaybı', pf: 'Faul', min: 'Dakika', pir: 'PIR' }, season: 'Sezon ({g} maç)', perG: 'maç başına {v}', lastG: 'Son maçlar', rnd: '{r}. hafta', noStats: 'Bu sezon henüz oynamadı.', made: 'isabet / deneme' };
export const texts = lg => TX[lg] || TX.en;

const f1 = (x, lg) => (x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1).replace('.', lg === 'en' ? '.' : ','));
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const OUTST = new Set(['injured', 'out', 'rest']);
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');

/** κύρια συνάρτηση: ερώτηση → { kind, html } */
export function answer(q, D, idx, today, lg = 'el', now = null) {
  const X = texts(lg), hits = findPlayers(q, idx), kind = intent(q, hits);
  const pool = D.players.filter(p => p.pp != null && !OUTST.has(p.st)).sort((a, b) => b.pp - a.pp);
  const rank = p => pool.indexOf(p) + 1;
  const pA = p => `<a href="${esc(p.u)}">${esc(p.n)}</a>`;
  const dayTxt = i => {
    if (i == null || !D.days[i]) return '';
    const d = D.days[i];
    if (d === today) return X.today; if (d === addDay(today, 1)) return X.tomorrow; if (d === addDay(today, -1)) return X.yesterday;
    return new Date(d + 'T12:00:00Z').toLocaleDateString(D.loc || 'el-GR', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' });
  };
  // ο αγώνας της ομάδας του στην αγωνιστική έχει ήδη γίνει; (με ώρα αν τη δίνει ο browser, αλλιώς με βάση τη μέρα)
  const played = p => { const g = D.games[p.t]; if (!g) return false; if (now != null && g.at) return Date.parse(g.at) + 2 * 3600e3 < now; const d = D.days[g.day]; return !!d && d < today; };
  const playedLine = p => {
    const g = D.games[p.t], r = (p.g || []).find(x => x[0] === D.round);
    const res = r ? fill(X.pres, { pir: r[2 + SK.pir], pts: r[2 + SK.pts] }) : X.pdnp;
    return fill(X.played, { day: dayTxt(g.day), opp: esc(D.teams[g.opp]?.n || g.opp), res });
  };
  const gameLine = p => {
    const g = D.games[p.t]; if (!g) return X.noGame;
    if (played(p)) return playedLine(p);
    const tm = g.at ? new Date(g.at).toLocaleTimeString(D.loc || 'el-GR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Athens' }) : '';
    return fill(X.vs, { day: dayTxt(p.day ?? g.day), ha: g.home ? X.home : X.away, opp: esc(D.teams[g.opp]?.n || g.opp), time: tm ? ` (${tm})` : '' });
  };
  const defLine = p => {
    const g = D.games[p.t]; const o = g && D.teams[g.opp]; if (!o?.dr) return '';
    if (o.dr <= 5) return fill(X.def1, { opp: esc(o.n), r: lg === 'en' ? ord(o.dr) : o.dr, pa: f1(o.pa, lg) });
    if (o.dr >= 16) return fill(X.def2, { opp: esc(o.n), pa: f1(o.pa, lg) });
    return '';
  };
  const formLine = p => (p.l3?.length ? fill(X.form, { l3: p.l3.join(' / '), avg: f1(p.avg, lg) }) : '');
  const links = p => `<p class="askl"><a href="${esc(p.u)}">${X.more} →</a>${p.fu ? ` <a href="${esc(p.fu)}">${X.fx} →</a>` : ''}</p>`;
  const P = (...xs) => xs.filter(Boolean).map(x => `<p>${x}</p>`).join('');
  const vxLine = p => {
    const v = p.vx; if (!v || Math.abs(v.dp) < 0.5) return '';
    const multi = v.a.length > 1;
    const a = esc((lg === 'el' ? (multi ? 'τους ' : 'τον ') : '') + v.a.join(X.and));
    const games = lg === 'el' ? (v.n === 1 ? `στο ματς που ${multi ? 'έλειπαν' : 'έλειπε'}` : `στα ${v.n} ματς που ${multi ? 'έλειπαν' : 'έλειπε'}`) : '';
    return v.k === 'ww' ? fill(X.vxW, { a, n: v.n, games, avg: v.n > 1 ? 'κατά μέσο όρο ' : '', m: f1(v.m, lg), dir: v.dp > 0 ? X.up : X.down, dp: f1(Math.abs(v.dp), lg) }) : fill(X.vxV, { a, dm: f1(v.dm, lg), dp: f1(v.dp, lg) });
  };
  const status = p => (OUTST.has(p.st) ? fill(X.out, { t: esc(p.why || p.st) }) : p.st === 'doubtful' ? X.doubt : '');

  if (kind === 'unknown') return { kind, html: P(X.unk) };

  if (kind === 'stat') {
    const want = statsWanted(q), XS = X.st || TX.en.st;
    const pct = (m, a) => (a ? ` (${f1(100 * m / a, lg)}%)` : '');
    const PAIR = { ft: ['ftm', 'fta'], p3: ['m3', 'a3'], p2: ['m2', 'a2'] };
    const one = p => {
      const s = p.s; if (!s || !s[0]) return P(`${pA(p)}: ${X.noStats}`);
      const gp = s[0], v = k => s[1 + SK[k]];
      const rows = want.map(k => {
        let tot, avg;
        if (PAIR[k]) { const [m, a] = PAIR[k]; tot = `${v(m)}/${v(a)}${pct(v(m), v(a))}`; avg = `${f1(v(m) / gp, lg)}/${f1(v(a) / gp, lg)}`; }
        else { tot = k === 'min' ? f1(v(k), lg) : String(Math.round(v(k) * 10) / 10).replace('.', lg === 'en' ? '.' : ','); avg = f1(v(k) / gp, lg); }
        const last = (p.g || []).slice().reverse().map(g => {
          const gv = x => g[2 + SK[x]], val = PAIR[k] ? `${gv(PAIR[k][0])}/${gv(PAIR[k][1])}` : k === 'min' ? f1(gv(k), lg) : gv(k);
          return `${fill(X.rnd, { r: g[0] })} ${esc(D.teams[g[1]]?.n || g[1])}: <b>${val}</b>`;
        }).join(' · ');
        return `<b>${XS[k]}</b>${PAIR[k] ? ` <small>(${X.made})</small>` : ''}: ${fill(X.season, { g: gp })} <b>${tot}</b>, ${fill(X.perG, { v: avg })}.${last ? `<br><small>${X.lastG}: ${last}</small>` : ''}`;
      });
      return P(pA(p), ...rows);
    };
    return { kind, html: hits.slice(0, 3).map(h => one(h.p)).join('') + (hits.length === 1 ? links(hits[0].p) : '') };
  }

  if (kind === 'best' || kind === 'bestcap') {
    let di = dayWanted(q, D, today);
    if (di == null) { const i = D.days.findIndex(d => d >= today); di = i >= 0 ? i : null; }
    const L = (di == null ? pool : pool.filter(p => p.day === di)).slice(0, 5);
    if (!L.length) return { kind, html: P(X.noDay) };
    const head = fill(kind === 'bestcap' ? X.bestCap : X.best, { day: di == null ? '' : dayTxt(di) });
    return { kind, html: `<p><b>${head}</b></p><ol>${L.map(p => `<li>${pA(p)} <small>${esc(D.teams[p.t]?.n || p.t)}</small> · ${f1(p.pp, lg)} PIR${kind === 'bestcap' ? ` (${f1(2 * p.pp, lg)})` : ''}</li>`).join('')}</ol>${D.caps ? `<p class="askl"><a href="${esc(D.caps)}">${X.caps} →</a></p>` : ''}` };
  }

  const p = hits[0].p;
  if (kind === 'compare') {
    const b = hits[1].p, ao = OUTST.has(p.st) || p.pp == null, bo = OUTST.has(b.st) || b.pp == null;
    let line;
    const pa = played(p) && !OUTST.has(p.st), pb = played(b) && !OUTST.has(b.st);
    if (pa && pb) line = X.cmpBoth;
    else if (pa && !bo) line = fill(X.cmpPlayed, { a: pA(b), b: esc(p.n) });
    else if (pb && !ao) line = fill(X.cmpPlayed, { a: pA(p), b: esc(b.n) });
    else if (ao && !bo) line = fill(X.cmpOut, { a: pA(b), b: esc(p.n) });
    else if (bo && !ao) line = fill(X.cmpOut, { a: pA(p), b: esc(b.n) });
    else if (Math.abs((p.pp ?? 0) - (b.pp ?? 0)) < 1) line = fill(X.cmpEq, { pa: f1(p.pp, lg), pb: f1(b.pp, lg) });
    else { const [w, l] = p.pp > b.pp ? [p, b] : [b, p]; line = fill(X.cmpW, { a: pA(w), b: esc(l.n), pa: f1(w.pp, lg), pb: f1(l.pp, lg) }); }
    const one = x => OUTST.has(x.st) ? `${pA(x)}: ${fill(X.injOut, { t: esc(x.why || x.st) })}` : `${pA(x)}: ${gameLine(x)} ${x.l3?.length ? fill(X.form, { l3: x.l3.join(' / '), avg: f1(x.avg, lg) }) : ''}`;
    return { kind, html: P(line, one(p), one(b)) };
  }
  if (kind === 'injury') {
    const line = OUTST.has(p.st) ? fill(X.injOut, { t: esc(p.why || p.st) }) : p.st === 'doubtful' ? X.injDoubt : p.miss ? X.injMiss : X.injOk;
    return { kind, html: P(`${pA(p)}: ${line}`, OUTST.has(p.st) ? '' : gameLine(p)) + links(p) };
  }
  if (kind === 'when') return { kind, html: P(`${pA(p)}: ${gameLine(p)}`, status(p)) + links(p) };

  // start / captain
  if (OUTST.has(p.st)) return { kind, html: P(`${pA(p)}: ${fill(X.out, { t: esc(p.why || p.st) })}`) + links(p) };
  if (played(p)) return { kind, html: P(`${pA(p)}: ${playedLine(p)}`, X.pnext, formLine(p)) + links(p) };
  if (p.pp == null) return { kind, html: P(`${pA(p)}: ${D.games[p.t] ? X.noproj : X.noGame}`, formLine(p)) + links(p) };
  const rk0 = rank(p), n = pool.length, rk = lg === 'en' ? ord(rk0) : rk0;
  const projLine = fill(X.proj, { pp: f1(p.pp, lg), lo: f1(p.p10, lg), hi: f1(p.p90, lg), rk, n });
  if (kind === 'captain') {
    const top = pool[0], dayTop = pool.find(x => x.day === p.day);
    const v = rk0 === 1 ? fill(X.cap1, { cp: f1(2 * p.pp, lg) }) : rk0 <= 5 ? fill(X.capY, { rk, cp: f1(2 * p.pp, lg) }) : fill(X.capN, { rk });
    const alt = rk0 === 1 ? '' : dayTop && dayTop !== p && p.day != null && dayTop.pp > p.pp ? fill(X.capDay, { p: pA(dayTop), pp: f1(dayTop.pp, lg) }) : fill(X.capBest, { p: pA(top), pp: f1(top.pp, lg) });
    return { kind, html: P(`${pA(p)}: ${v}`, p.st === 'doubtful' ? X.doubt : '', vxLine(p), gameLine(p), alt) + (D.caps ? `<p class="askl"><a href="${esc(D.caps)}">${X.caps} →</a></p>` : '') };
  }
  const v = rk0 <= 10 ? X.yes1 : rk0 <= 30 ? X.yes : rk0 <= 60 ? X.meh : X.no;
  return { kind, html: P(`${pA(p)}: ${v}`, p.st === 'doubtful' ? X.doubt : '', projLine, vxLine(p), gameLine(p), defLine(p), formLine(p), rk0 > 30 ? X.price : '') + links(p) };
}
