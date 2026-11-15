// Προσωπικές ειδοποιήσεις Fantasy για συνδεδεμένους χρήστες (τρέχει στον worker workers/account, κάθε 30 λεπτά).
// Ίδια λογική με τον Fantasy Manager του site (buildAlerts, adviseCaptain), πάνω στην ομάδα που έχει αποθηκεύσει ο χρήστης.
// Δεν αγγίζει τον λογαριασμό του στο EuroLeague Fantasy: μόνο προτείνει· την αλλαγή την κάνει ο ίδιος στο επίσημο παιχνίδι.
import { validateRoster, lineupOf, buildAlerts } from '../fantasy/manager.mjs';
import { adviseCaptain } from '../fantasy/captain.mjs';

export const KINDS = ['injury', 'captain', 'swap', 'lock', 'fav'];          // ό,τι μπορεί να κλείσει ο χρήστης στις ρυθμίσεις
export const LANGS = ['el', 'en', 'es', 'sr', 'tr'];
const MGR = { el: '/fantasy/manager/', en: '/en/fantasy/manager/', es: '/es/fantasy/manager/', sr: '/sr/fantasy/manager/', tr: '/tr/fantasy/manager/' };
const PAU = { el: '/apodoseis/prop-analyzer/', en: '/en/odds/prop-analyzer/', es: '/es/cuotas/prop-analyzer/', sr: '/sr/kvote/prop-analyzer/', tr: '/tr/oranlar/prop-analyzer/' };
const CAPU = { el: '/fantasy/captain-advisor/', en: '/en/fantasy/captain-advisor/', es: '/es/fantasy/captain-advisor/', sr: '/sr/fantasy/captain-advisor/', tr: '/tr/fantasy/captain-advisor/' };

const TX = {
  el: { out: '🚑 Ο {p} είναι εκτός για την {r}η αγωνιστική.', dbt: '⚠️ Ο {p} είναι αμφίβολος για την {r}η αγωνιστική.', inStart: 'Είναι στη βασική σου πεντάδα.', inSix: 'Είναι ο 6ος σου.', isCap: 'Είναι ο αρχηγός σου.', repl: 'Πρόταση αντικατάστασης: {q} ({t}, {pp} PIR εκτίμηση, {pr} credits).', cap: '👑 Άλλαξε αρχηγό: ο {q} έχει εκτίμηση {a} πόντους ως αρχηγός, {d} περισσότερους από τον {p}.', capOut: '👑 Ο αρχηγός σου ({p}) μπορεί να μην παίξει. Πρόταση: {q}.', swap: '🔁 Πρόταση αλλαγής: βγάλε τον {p}, βάλε τον {q} (+{d} PIR εκτίμηση αυτή την αγωνιστική).', lock: '⏰ Η {r}η αγωνιστική κλείνει σε {h} ώρες. Έλεγξε την ομάδα σου.', go: 'Δες την ομάδα σου', note: 'Οι εκτιμήσεις είναι στατιστικές και δεν εγγυώνται απόδοση.', fOut: '⭐ Αποθηκευμένο prop: ο {p} είναι εκτός για την {r}η αγωνιστική ({s} {side} {l}).', fDbt: '⭐ Αποθηκευμένο prop: ο {p} είναι αμφίβολος για την {r}η αγωνιστική ({s} {side} {l}).', fModel: '📊 Αποθηκευμένο prop: {p} · {s}. Το μοντέλο εκτιμά {m} έναντι της γραμμής σου {l} ({side}) για τον αγώνα με {o}.', goP: 'Άνοιξε στο Prop Analyzer', st: { pts: 'Πόντοι', reb: 'Ριμπάουντ', ast: 'Ασίστ', fg3: 'Τρίποντα', pr: 'Π+Ρ', pa: 'Π+Α', pra: 'Π+Ρ+Α', ar: 'Ρ+Α', stl: 'Κλεψίματα', blk: 'Κοψίματα', pir: 'PIR' } },
  en: { out: '🚑 {p} is out for round {r}.', dbt: '⚠️ {p} is doubtful for round {r}.', inStart: 'He is in your starting five.', inSix: 'He is your 6th man.', isCap: 'He is your captain.', repl: 'Suggested replacement: {q} ({t}, {pp} projected PIR, {pr} credits).', cap: '👑 Change captain: {q} projects {a} points as captain, {d} more than {p}.', capOut: '👑 Your captain ({p}) may not play. Suggestion: {q}.', swap: '🔁 Suggested transfer: out {p}, in {q} (+{d} projected PIR this round).', lock: '⏰ Round {r} locks in {h} hours. Check your team.', go: 'Open your team', note: 'Projections are statistical estimates and do not guarantee performance.', fOut: '⭐ Saved prop: {p} is out for round {r} ({s} {side} {l}).', fDbt: '⭐ Saved prop: {p} is doubtful for round {r} ({s} {side} {l}).', fModel: '📊 Saved prop: {p} · {s}. The model projects {m} against your line {l} ({side}) vs {o}.', goP: 'Open in Prop Analyzer', st: { pts: 'Points', reb: 'Rebounds', ast: 'Assists', fg3: '3-pointers', pr: 'Pts+Reb', pa: 'Pts+Ast', pra: 'Pts+Reb+Ast', ar: 'Reb+Ast', stl: 'Steals', blk: 'Blocks', pir: 'PIR' } },
  es: { out: '🚑 {p} no jugará la jornada {r}.', dbt: '⚠️ {p} es duda para la jornada {r}.', inStart: 'Está en tu quinteto titular.', inSix: 'Es tu sexto hombre.', isCap: 'Es tu capitán.', repl: 'Sustituto sugerido: {q} ({t}, {pp} PIR estimado, {pr} créditos).', cap: '👑 Cambia de capitán: {q} proyecta {a} puntos como capitán, {d} más que {p}.', capOut: '👑 Tu capitán ({p}) podría no jugar. Sugerencia: {q}.', swap: '🔁 Cambio sugerido: sale {p}, entra {q} (+{d} PIR estimado esta jornada).', lock: '⏰ La jornada {r} se cierra en {h} horas. Revisa tu equipo.', go: 'Ver tu equipo', note: 'Las proyecciones son estimaciones estadísticas y no garantizan rendimiento.', fOut: '⭐ Prop guardado: {p} no jugará la jornada {r} ({s} {side} {l}).', fDbt: '⭐ Prop guardado: {p} es duda para la jornada {r} ({s} {side} {l}).', fModel: '📊 Prop guardado: {p} · {s}. El modelo estima {m} frente a tu línea {l} ({side}) contra {o}.', goP: 'Abrir en Prop Analyzer', st: { pts: 'Puntos', reb: 'Rebotes', ast: 'Asistencias', fg3: 'Triples', pr: 'Pts+Reb', pa: 'Pts+Ast', pra: 'Pts+Reb+Ast', ar: 'Reb+Ast', stl: 'Robos', blk: 'Tapones', pir: 'PIR' } },
  sr: { out: '🚑 {p} neće igrati u {r}. kolu.', dbt: '⚠️ {p} je upitan za {r}. kolo.', inStart: 'U tvojoj je startnoj petorci.', inSix: 'On je tvoj šesti igrač.', isCap: 'On je tvoj kapiten.', repl: 'Predlog zamene: {q} ({t}, {pp} PIR projekcija, {pr} kredita).', cap: '👑 Promeni kapitena: {q} ima projekciju {a} poena kao kapiten, {d} više od {p}.', capOut: '👑 Tvoj kapiten ({p}) možda neće igrati. Predlog: {q}.', swap: '🔁 Predlog izmene: izlazi {p}, ulazi {q} (+{d} PIR projekcija u ovom kolu).', lock: '⏰ {r}. kolo se zaključava za {h} sati. Proveri svoj tim.', go: 'Otvori svoj tim', note: 'Projekcije su statističke procene i ne garantuju učinak.', fOut: '⭐ Sačuvan prop: {p} neće igrati u {r}. kolu ({s} {side} {l}).', fDbt: '⭐ Sačuvan prop: {p} je upitan za {r}. kolo ({s} {side} {l}).', fModel: '📊 Sačuvan prop: {p} · {s}. Model procenjuje {m} naspram tvoje linije {l} ({side}) protiv {o}.', goP: 'Otvori u Prop Analyzer-u', st: { pts: 'Poeni', reb: 'Skokovi', ast: 'Asistencije', fg3: 'Trojke', pr: 'P+S', pa: 'P+A', pra: 'P+S+A', ar: 'S+A', stl: 'Ukradene', blk: 'Blokade', pir: 'PIR' } },
  tr: { out: '🚑 {p}, {r}. haftada oynamayacak.', dbt: '⚠️ {p}, {r}. hafta için şüpheli.', inStart: 'İlk beşinde.', inSix: 'Altıncı oyuncun.', isCap: 'Kaptanın.', repl: 'Önerilen yedek: {q} ({t}, {pp} tahmini PIR, {pr} kredi).', cap: '👑 Kaptanı değiştir: {q} kaptan olarak {a} puan tahmin ediliyor, {p}’den {d} fazla.', capOut: '👑 Kaptanın ({p}) oynamayabilir. Öneri: {q}.', swap: '🔁 Önerilen transfer: {p} çıksın, {q} girsin (bu hafta +{d} tahmini PIR).', lock: '⏰ {r}. hafta {h} saat içinde kapanıyor. Takımını kontrol et.', go: 'Takımını aç', note: 'Tahminler istatistiksel tahminlerdir ve performansı garanti etmez.', fOut: '⭐ Kayıtlı prop: {p}, {r}. haftada oynamayacak ({s} {side} {l}).', fDbt: '⭐ Kayıtlı prop: {p}, {r}. hafta için şüpheli ({s} {side} {l}).', fModel: '📊 Kayıtlı prop: {p} · {s}. Model, {o} maçı için senin {l} çizgine ({side}) karşı {m} tahmin ediyor.', goP: 'Prop Analyzer’da aç', st: { pts: 'Sayı', reb: 'Ribaund', ast: 'Asist', fg3: 'Üçlük', pr: 'Sayı+Rib', pa: 'Sayı+Ast', pra: 'Sayı+Rib+Ast', ar: 'Rib+Ast', stl: 'Top çalma', blk: 'Blok', pir: 'PIR' } },
};
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const r1 = v => (Math.round(v * 10) / 10).toFixed(1);

/** η σύνθεση της ενεργής ομάδας του χρήστη (ίδιος κανόνας με τον Manager) */
export function lineupFor(team, P) {
  const ro = (team?.roster || []).map(c => P.get(c)).filter(Boolean);
  if (ro.length !== 10 || validateRoster(ro).some(e => e.k.startsWith('pos'))) return null;
  const lu = lineupOf(ro, team.risk === 'safe' ? 'safe' : 'ceiling', team.formation || 'auto');
  if (!lu) return null;
  if (team.captain && lu.start.includes(team.captain)) lu.captain = team.captain;
  return lu;
}

/** καλύτερος διαθέσιμος παίκτης ίδιας θέσης που χωράει στα credits */
export function replacement(p, roster, players, bank = 0) {
  const mine = new Set(roster);
  const cap = (p.price || 0) + Math.max(0, bank || 0);
  return players.filter(x => x.pos === p.pos && !mine.has(x.c) && x.status === 'playing' && x.price != null && x.price <= cap + 1e-9 && x.pp != null)
    .sort((a, b) => b.pp - a.pp)[0] || null;
}

/**
 * Ειδοποιήσεις για έναν χρήστη.
 * state: η κατάσταση του Fantasy Manager (fmt-v1: { teams, active }), D: api/fantasy/projections/latest.json, news: api/fantasy/news.json items
 * prefs: { lang, kinds: { injury, captain, swap, lock } }, base: https://basketballstats.eu
 * Επιστρέφει [{ key, kind, text, url }] — το key εξασφαλίζει ότι τίποτα δεν στέλνεται δύο φορές.
 */
export function userAlerts(state, D, news = [], { prefs = {}, now = Date.now(), base = '', props = null, teams = {} } = {}) {
  const lang = LANGS.includes(prefs.lang) ? prefs.lang : 'el', L = TX[lang];
  const on = k => prefs.kinds?.[k] !== false;
  if (!D?.players?.length) return [];
  const P = new Map(D.players.map(p => [p.c, p]));
  const R = D.round, dl = D.deadline ? Date.parse(D.deadline) : null, hLeft = dl ? (dl - now) / 36e5 : null;
  if (hLeft != null && hLeft <= 0) return [];                                   // ο γύρος έκλεισε: τίποτα μέχρι την επόμενη αγωνιστική
  const nm = c => P.get(c)?.dn || c, url = base + MGR[lang];
  const out = [];
  // 0. αποθηκευμένα props (Prop Analyzer): αμφίβολος/εκτός, και μία φορά ανά αγωνιστική η εκτίμηση του μοντέλου (τελευταίες 30 ώρες)
  if (on('fav') && Array.isArray(state?.fav)) {
    const PP = new Map((props?.players || []).map(p => [p.c, p]));
    for (const f of state.fav.slice(0, 40)) {
      const p = P.get(f.c), q = PP.get(f.c); if (!p && !q) continue;
      const name = q?.n || p?.dn || f.c, sl = L.st[f.s] || f.s, side = f.side === 'under' ? 'Under' : 'Over', pu = `${base}${PAU[lang]}#p=${encodeURIComponent(q?.s || '')}&s=${f.s}&l=${f.l}`;
      const nx = q ? props.next?.[q.t] : null;
      if (nx && nx.r !== R) continue;                                            // ο παίκτης δεν παίζει σε αυτή την αγωνιστική
      const status = q?.out || p?.status === 'injured' ? 'out' : (q?.st === 'doubtful' || p?.status === 'doubtful') ? 'doubtful' : null;
      if (status) out.push({ key: `${R}|fav|${status}|${f.c}`, kind: 'fav', text: fill(status === 'out' ? L.fOut : L.fDbt, { p: name, r: R, s: sl, side, l: f.l }), url: pu, go: L.goP });
      const pj = q?.pj?.[f.s];
      if (!status && pj && nx && (hLeft == null || hLeft <= 30)) out.push({ key: `${R}|favm|${f.c}|${f.s}`, kind: 'fav', text: fill(L.fModel, { p: name, s: sl, m: r1(pj[0]), l: f.l, side, o: (lang === 'el' && teams[nx.opp]) || nx.opp }), url: pu, go: L.goP });
    }
  }
  const team = state?.teams?.[state.active ?? 0];
  const lu = team ? lineupFor(team, P) : null;
  if (!lu) return out.map(a => ({ go: L.go, ...a, note: L.note }));
  const roster = team.roster;
  const bank = team.bank != null ? +team.bank : Math.max(0, 100 - roster.reduce((s, c) => s + (P.get(c)?.price || 0), 0) - (team.coach ? (D.coaches || []).find(x => x.t === team.coach)?.price || 0 : 0));

  // 1. τραυματίας / αμφίβολος στη βασική πεντάδα, στον 6ο ή αρχηγός
  if (on('injury')) {
    for (const a of buildAlerts(lu, D.players, news, { curTurn: 0, now: new Date(now).toISOString() })) {
      if (!['ruled_out', 'doubtful'].includes(a.kind) || a.slots.every(s => s === 'bench')) continue;
      const p = P.get(a.c), rp = replacement(p, roster, D.players, bank);
      const role = a.slots.includes('captain') ? L.isCap : a.slots.includes('start') ? L.inStart : L.inSix;
      const text = [fill(a.kind === 'ruled_out' ? L.out : L.dbt, { p: nm(a.c), r: R }), role, rp ? fill(L.repl, { q: rp.dn, t: rp.t, pp: r1(rp.pp), pr: r1(rp.price) }) : ''].filter(Boolean).join(' ');
      out.push({ key: `${R}|${a.kind}|${a.c}`, kind: 'injury', text, url });
    }
  }
  // 2. αρχηγός: τις τελευταίες 30 ώρες πριν κλείσει ο γύρος (ή αμέσως, αν ο αρχηγός δεν θα παίξει)
  if (on('captain')) {
    const A = adviseCaptain(lu, D.players, 0), best = A.best;
    const capBad = A.warnings.some(w => ['injured', 'out', 'rest', 'doubtful', 'not_starter'].includes(w.k)) || ['injured', 'rest', 'doubtful'].includes(P.get(lu.captain)?.status);
    const alt = A.rows.filter(r => r.c !== lu.captain && !r.warn).sort((a, b) => b.upside - a.upside)[0];
    if (capBad && alt) out.push({ key: `${R}|capout|${lu.captain}`, kind: 'captain', text: fill(L.capOut, { p: nm(lu.captain), q: nm(alt.c) }), url: base + CAPU[lang] });
    else if (best && best.c !== lu.captain) {
      if (A.compare && A.compare.vsBest >= 3 && (hLeft == null || hLeft <= 30)) out.push({ key: `${R}|cap|${best.c}`, kind: 'captain', text: fill(L.cap, { q: nm(best.c), a: r1(best.upside), d: r1(A.compare.vsBest), p: nm(lu.captain) }), url: base + CAPU[lang] });
    }
  }
  // 3. μία πρόταση αλλαγής την εβδομάδα: 48 ώρες πριν κλείσει ο γύρος, μόνο αν κερδίζει ≥ 4 PIR
  if (on('swap') && hLeft != null && hLeft <= 48) {
    let bestSw = null;
    for (const c of roster) {
      const p = P.get(c); if (!p || p.pp == null) continue;
      const q = replacement(p, roster, D.players, bank);
      if (q && q.pp - p.pp >= 4 && (!bestSw || q.pp - p.pp > bestSw.d)) bestSw = { p, q, d: q.pp - p.pp };
    }
    if (bestSw) out.push({ key: `${R}|swap`, kind: 'swap', text: fill(L.swap, { p: bestSw.p.dn, q: bestSw.q.dn, d: r1(bestSw.d) }), url });
  }
  // 4. υπενθύμιση: 3 ώρες πριν κλείσει ο γύρος
  if (on('lock') && hLeft != null && hLeft <= 3) out.push({ key: `${R}|lock`, kind: 'lock', text: fill(L.lock, { r: R, h: Math.max(1, Math.round(hLeft)) }), url });
  return out.map(a => ({ go: L.go, ...a, note: L.note }));
}
