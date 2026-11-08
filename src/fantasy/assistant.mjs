// AI Fantasy Assistant (Classic Mode): καθαρές, ελεγχόμενες συναρτήσεις.
//  - parseScan: κείμενο από OCR ή δομημένα πεδία από μοντέλο όρασης → εγγραφές με αντιστοίχιση σε πραγματικούς κωδικούς παικτών
//  - validateTeam / readiness: κανόνες, ελλιπή ή παλιά δεδομένα, προθεσμία
//  - assist: έως τρία έγκυρα σενάρια αλλαγών (ή «κράτησε την ομάδα σου»), με κόστος, budget, Δ πόντων, εξηγήσεις και αβεβαιότητες
// Τίποτα εδώ δεν «μαντεύει»: ό,τι δεν αναγνωρίζεται με σιγουριά επιστρέφεται ως αμφίβολο για επιβεβαίωση από τον χρήστη.
import { CLASSIC_RULES, POS, OUT } from './rules.mjs';
import { multiTrade, lineupOf, minutesRisk, horizon } from './manager.mjs';
import { bestLineup } from './optimizer.mjs';
import { capPoints } from './captain.mjs';

// ---------------------------------------------------------------- αντιστοίχιση ονομάτων
export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').replace(/[łŁ]/g, 'l').replace(/ß/g, 'ss')
  .toLowerCase().replace(/[^a-z0-9Ͱ-Ͽ ]/g, ' ').replace(/\s+/g, ' ').trim();
export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
export const sim = (a, b) => (a && b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 0);
const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

/** παραλλαγές ονόματος για κάθε παίκτη: «επώνυμο», «όνομα επώνυμο», «επώνυμο όνομα», «ο επώνυμο» (αρχικό) */
export function nameIndex(players, greek = {}) {
  return players.map(p => {
    const [L0 = '', F0 = ''] = String(p.n || '').split(',').map(x => norm(x));
    const L = L0.split(' ').filter(x => !SUFFIX.has(x)).join(' '), F = F0;
    const full = new Set([`${F} ${L}`, `${L} ${F}`, `${F[0] || ''} ${L}`, norm(p.dn)].filter(x => x.trim().length > 2));
    if (greek[p.n]) full.add(norm(greek[p.n]));
    const last = new Set([L, L.split(' ').pop()].filter(x => x.length >= 3));
    if (greek[p.n]) last.add(norm(greek[p.n]).split(' ').pop());
    return { p, full: [...full], last: [...last] };
  });
}

const STOP = new Set(['guard', 'forward', 'center', 'centre', 'coach', 'head', 'captain', 'bench', 'sixth', 'man', 'credits', 'credit', 'budget', 'team', 'round', 'turn', 'points', 'pts', 'pir',
  'my', 'lineup', 'transfers', 'trades', 'save', 'cancel', 'confirm', 'total', 'value', 'euroleague', 'fantasy', 'challenge', 'starting', 'five', 'field', 'home', 'away', 'vs', 'next', 'game', 'games']);

function scoreWindow(w, e) {
  let s = 0, how = '';
  if (w.includes(' ')) { for (const f of e.full) { const v = sim(w, f); if (v > s) { s = v; how = 'full'; } } }
  else if (w.length >= 4) { for (const l of e.last) { const v = sim(w, l) * 0.97; if (v > s) { s = v; how = 'surname'; } } }   // μόνο επώνυμο: λίγο λιγότερη σιγουριά
  return [s, how];
}
function topFor(w, idx, limit = 3) {
  const out = [];
  for (const e of idx) { const [s, how] = scoreWindow(w, e); if (s >= 0.6) out.push({ c: e.p.c, score: +s.toFixed(3), how }); }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
/**
 * Μια γραμμή OCR μπορεί να έχει πολλούς παίκτες («N. Hifi   C. Jones»): βρίσκουμε μη επικαλυπτόμενα κομμάτια 1-3 λέξεων
 * με την καλύτερη αντιστοιχία, άπληστα από το πιο σίγουρο. Επιστρέφει [{text, cands}] με τη σειρά που εμφανίζονται.
 */
export function segmentLine(line, idx) {
  const toks = norm(line).split(' ').filter(Boolean);
  const spans = [];
  for (let k = 3; k >= 1; k--) for (let i = 0; i + k <= toks.length; i++) {
    const part = toks.slice(i, i + k);
    if (part.every(x => STOP.has(x) || /^\d/.test(x))) continue;
    if (STOP.has(part[0]) || STOP.has(part[k - 1])) continue;
    const w = part.join(' ');
    if (k === 1 && w.length < 4) continue;
    const cands = topFor(w, idx);
    if (cands.length) spans.push({ i, j: i + k, text: w, cands, best: cands[0].score + 0.01 * k });
  }
  spans.sort((a, b) => b.best - a.best);
  const used = new Array(toks.length).fill(false), out = [];
  for (const sp of spans) {
    let free = true; for (let x = sp.i; x < sp.j; x++) if (used[x]) free = false;
    if (!free) continue;
    for (let x = sp.i; x < sp.j; x++) used[x] = true;
    out.push(sp);
  }
  return out.sort((a, b) => a.i - b.i).map(({ text, cands }) => ({ text, cands }));
}
/** καλύτερες αντιστοιχίες για ένα κομμάτι κειμένου (ένας παίκτης) */
export function candidatesFor(text, idx, { limit = 3 } = {}) {
  const segs = segmentLine(text, idx);
  return segs.length ? segs.sort((a, b) => b.cands[0].score - a.cands[0].score)[0].cands.slice(0, limit) : [];
}

export const SURE = 0.85, MARGIN = 0.06;
/** απόφαση: σίγουρη αντιστοίχιση μόνο αν score ≥ 0,85 και απέχει ≥ 0,06 από τον επόμενο διαφορετικό παίκτη */
export function decide(cands) {
  if (!cands.length) return { status: 'none' };
  const [a, b] = cands;
  if (a.score >= SURE && (!b || a.score - b.score >= MARGIN)) return { status: 'sure', c: a.c, score: a.score };
  return { status: 'ambiguous', options: cands };
}

const PRICE_RE = /(?:^|[^\d])(\d{1,2}[.,]\d{1,2})(?![\d])/g;
const BANK_RE = /(credits?\s*(?:left|available|remaining)?\s*[:·-]?\s*\d|budget|bank|κρεντιτ|κρέντιτ|υπολοιπο|υπόλοιπο|διαθεσιμ)/i;
const CAPTAIN_RE = /(\(c\)|\[c\]|\bcaptain\b|αρχηγ)/i;   // το σήμα «C» της εφαρμογής συχνά διαβάζεται λάθος: ο αρχηγός ζητείται πάντα για επιβεβαίωση
const COACH_RE = /(coach|head coach|\bhc\b|προπονητ)/i;

/**
 * Κείμενο OCR (μία ή περισσότερες εικόνες) → εγγραφές για επιβεβαίωση.
 * teams: { CODE: 'Όνομα ομάδας' } για αναγνώριση προπονητή. Δεν επινοεί τίποτα: ό,τι δεν διαβάζεται καθαρά μένει κενό.
 */
export function parseScan(texts, players, { teams = {}, greek = {} } = {}) {
  const idx = nameIndex(players, greek);
  const entries = new Map(), unresolved = [];
  let bank = null, coach = null, captain = null;
  const teamIdx = Object.entries(teams).map(([t, name]) => ({ t, n: norm(name), code: t.toLowerCase() }));
  for (const text of [].concat(texts)) {
    const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    lines.forEach((line, li) => {
      // υπόλοιπο credits: μόνο αν η γραμμή λέει ρητά credits/budget και έχει έναν αριθμό
      if (BANK_RE.test(line)) { const m = [...line.matchAll(PRICE_RE)].map(x => +x[1].replace(',', '.')); if (m.length === 1 && m[0] >= 0 && m[0] < 100) bank = { value: m[0], raw: line }; return; }
      // προπονητής: γραμμή με «coach» + όνομα ομάδας (ή η αμέσως επόμενη)
      if (COACH_RE.test(line)) {
        const scope = norm(line + ' ' + (lines[li + 1] || ''));
        const hit = teamIdx.filter(x => x.n && (scope.includes(x.n) || scope.split(' ').includes(x.code)));
        coach = hit.length === 1 ? { t: hit[0].t, raw: line, status: 'sure' } : { t: null, raw: line, status: hit.length ? 'ambiguous' : 'none', options: hit.map(x => x.t) };
        return;
      }
      const segs = segmentLine(line, idx);
      if (!segs.length) { if (/[a-zα-ω]{4,}/i.test(line) && line.length <= 40 && !/\d{2}:\d{2}/.test(line)) unresolved.push(line); return; }
      // τιμές: στην ίδια γραμμή (μία ανά παίκτη) ή στην αμέσως επόμενη γραμμή, ίδιος αριθμός και ίδια σειρά (κάρτες σε στήλες)
      const pricesHere = [...line.matchAll(PRICE_RE)].map(x => +x[1].replace(',', '.')).filter(v => v >= 2 && v <= 35);
      const nextL = lines[li + 1] || '', nextHasNames = segmentLine(nextL, idx).some(x => x.cands[0].score >= SURE);
      const pricesNext = nextHasNames ? [] : [...nextL.matchAll(PRICE_RE)].map(x => +x[1].replace(',', '.')).filter(v => v >= 2 && v <= 35);
      const prices = pricesHere.length === segs.length ? pricesHere : pricesNext.length === segs.length ? pricesNext : [];
      const capLine = CAPTAIN_RE.test(line);
      segs.forEach((sg, k) => {
        const d = decide(sg.cands);
        const key = d.status === 'sure' ? d.c : 'amb:' + sg.cands.map(x => x.c).join('|');
        const prev = entries.get(key);
        const e = { raw: sg.text, line, ...d, price: prices[k] ?? prev?.price ?? null, captainHint: (capLine && segs.length === 1) || prev?.captainHint || false };
        if (!prev || (prev.status !== 'sure' && d.status === 'sure')) entries.set(key, e);
        else if (e.price != null && prev.price == null) prev.price = e.price;
        if (e.captainHint && d.status === 'sure') captain = d.c;
      });
    });
  }
  // ένας παίκτης που βρέθηκε σίγουρα δεν χρειάζεται να εμφανίζεται και ως επιλογή σε αμφίβολη εγγραφή
  const sure = new Set([...entries.values()].filter(e => e.status === 'sure').map(e => e.c));
  const list = [...entries.values()].map(e => (e.status === 'ambiguous' ? { ...e, options: e.options.filter(o => !sure.has(o.c)) } : e)).filter(e => e.status === 'sure' || e.options.length);
  return { entries: list, bank, coach, captain, unresolved: unresolved.slice(0, 12), sureCount: sure.size };
}

/** δομημένη απάντηση μοντέλου όρασης ({players:[{name, price, captain, slot}], coach, bank}) → ίδια μορφή με το parseScan */
export function parseVision(json, players, opts = {}) {
  const lines = [];
  for (const x of json?.players || []) lines.push([x.name, x.price != null ? String(x.price) : '', x.captain ? '(C)' : ''].join(' '));
  if (json?.coach) lines.push(`Coach ${json.coach}`);
  if (json?.bank != null) lines.push(`Credits ${json.bank}`);
  const r = parseScan(lines.join('\n'), players, opts);
  // η θέση στο γήπεδο (πεντάδα/6ος/πάγκος) από το μοντέλο ως πρόταση προς επιβεβαίωση
  const slotOf = new Map((json?.players || []).map(x => [norm(x.name), x.slot]));
  r.entries.forEach(e => { const s = slotOf.get(norm(e.raw.replace(/\(C\)|\d+[.,]\d+/g, ''))); if (s) e.slotHint = s; });
  return r;
}

// ---------------------------------------------------------------- έλεγχοι
export function validateTeam(team, P, rules = CLASSIC_RULES) {
  const errors = [], warn = [];
  const ro = team.roster.map(c => P.get(c));
  if (team.roster.length !== rules.players) errors.push({ k: 'count', n: team.roster.length, need: rules.players });
  if (ro.some(p => !p)) errors.push({ k: 'unknown', codes: team.roster.filter(c => !P.get(c)) });
  if (new Set(team.roster).size !== team.roster.length) errors.push({ k: 'dup' });
  const ok = ro.filter(Boolean);
  for (const pos of POS) { const n = ok.filter(p => p.pos === pos).length; if (team.roster.length === rules.players && n !== rules.roster[pos]) errors.push({ k: 'pos', pos, n, need: rules.roster[pos] }); }
  const clubs = {}; for (const p of ok) clubs[p.t] = (clubs[p.t] || 0) + 1;
  for (const [t, n] of Object.entries(clubs)) if (n > rules.maxPerClub) errors.push({ k: 'club', t, n, max: rules.maxPerClub });
  if (!team.coach) errors.push({ k: 'coach' });
  if (team.bank == null || Number.isNaN(+team.bank)) errors.push({ k: 'bank' });
  else if (+team.bank < 0) errors.push({ k: 'bank_neg' });
  if (team.trades == null || Number.isNaN(+team.trades) || +team.trades < 0) errors.push({ k: 'trades' });
  for (const c of team.locked || []) if (!team.roster.includes(c)) warn.push({ k: 'lock_not_in', c });
  for (const p of ok) if (!p.opp) warn.push({ k: 'no_game', c: p.c });
  return { errors, warn };
}

/** κατάσταση δεδομένων: αγωνιστική, ηλικία των εκτιμήσεων, προθεσμία */
export function readiness({ round, generated, deadline, now = new Date() }) {
  const t = +new Date(now), out = { round, generated, deadline, issues: [] };
  const ageH = generated ? (t - Date.parse(generated)) / 36e5 : Infinity;
  out.ageH = Math.round(ageH * 10) / 10;
  if (!generated) out.issues.push({ k: 'no_data', block: true });
  else if (ageH > 96) out.issues.push({ k: 'data_old', h: Math.round(ageH), block: true });
  else if (ageH > 36) out.issues.push({ k: 'data_stale', h: Math.round(ageH), block: false });
  if (deadline && t >= Date.parse(deadline)) out.issues.push({ k: 'deadline_passed', block: true });
  out.ok = !out.issues.some(i => i.block);
  return out;
}

// ---------------------------------------------------------------- σενάρια
const r1 = x => Math.round(x * 10) / 10;
// αναμενόμενοι fantasy πόντοι με τους κανόνες βαθμολογίας (PIR × μπόνους νίκης × θέση, αρχηγός ×2, πάγκος 50%) + προπονητής
function expectedFP(ro, coach, h = 1) {
  const lu = bestLineup(h === 1 ? ro : ro.map(p => horizon(p, h)), 'balanced');
  return (lu ? lu.score : 0) + (coach ? (coach.exp || 0) * (h === 1 ? 1 : h) : 0);
}
// προφίλ ρίσκου για την αναζήτηση: «upside» μετακινεί την εκτίμηση προς το P90
const upsideOf = p => { const k = p.pp > 0 ? (p.pp + 0.5 * ((p.p90 || p.pp) - p.pp)) / p.pp : 1; return { ...p, pp: p.pp * k, p3: p.p3 != null ? p.p3 * k : p.p3 }; };
/** σύντομες, συγκεκριμένες αιτίες για μια αλλαγή (μόνο από δεδομένα) */
export function tradeReasons(out, inn) {
  const why = [], risk = [];
  const d = (inn.pp || 0) - (out.pp || 0);
  if (Math.abs(d) >= 0.5) why.push({ k: 'pp', a: r1(out.pp || 0), b: r1(inn.pp || 0) });
  if (inn.p3 != null && out.p3 != null && Math.abs(inn.p3 - out.p3) >= 1) why.push({ k: 'p3', a: r1(out.p3), b: r1(inn.p3) });
  if (OUT(out.status)) why.unshift({ k: 'out_injured', s: out.status });
  else if (out.status === 'doubtful') why.push({ k: 'out_doubtful' });
  if (out.m3 != null && out.m10 != null && out.m3 - out.m10 <= -4) why.push({ k: 'out_minutes', a: r1(out.m10), b: r1(out.m3) });
  if (inn.m3 != null && inn.m10 != null && inn.m3 - inn.m10 >= 4) why.push({ k: 'in_minutes', a: r1(inn.m10), b: r1(inn.m3) });
  const diff = p => (p.nx && p.nx[0] ? p.nx[0][4] : null);
  if (diff(inn) != null && diff(out) != null && diff(out) - diff(inn) >= 2) why.push({ k: 'schedule', a: diff(out), b: diff(inn) });
  if (inn.status === 'doubtful') risk.push({ k: 'in_doubtful' });
  const mr = minutesRisk(inn); if (mr !== 'low') risk.push({ k: 'in_minutes_risk', level: mr });
  if (inn.b2b) risk.push({ k: 'b2b' });
  if ((inn.conf ?? 100) < 50) risk.push({ k: 'low_conf' });
  if (inn.price_src !== 'official') risk.push({ k: 'price_estimate' });
  return { why, risk };
}

function coachSwap(cur, coaches, budgetLeft, rules) {
  const C = new Map(coaches.map(c => [c.t, c])), now = C.get(cur);
  if (!now) return null;
  let best = null;
  for (const c of coaches) {
    if (c.t === cur || !c.opp) continue;
    if (c.price - now.price > budgetLeft + 1e-9) continue;
    const g = (c.exp || 0) - (now.exp || 0);
    if (g >= 3 && (!best || g > best.gain)) best = { out: cur, in: c.t, gain: r1(g), cost: r1(c.price - now.price), price_src: c.price_src || 'estimate' };
  }
  return best;
}

export const MODES = [
  { key: 'balanced', risk: 'ceiling' },   // multiTrade: «ceiling» = αναμενόμενο
  { key: 'safe', risk: 'safe' },
  { key: 'upside', risk: 'ceiling' },
];
export const MIN_GAIN = { next: 1.5, horizon: 3 };

/**
 * team = { roster:[10 κωδικοί], coach:'PAN', bank: διαθέσιμα credits, trades: επιτρεπόμενες αλλαγές, locked:[κωδικοί], prices:{κωδικός: αξία πώλησης} }
 * players = εκτιμήσεις του site (latest), coaches = εκτιμήσεις προπονητών
 */
export function assist(team, players, coaches, { rules = CLASSIC_RULES, horizonRounds = 3 } = {}) {
  // οι αξίες των δικών σου παικτών: ό,τι έδωσες (screenshot/χέρι) υπερισχύει της εκτίμησης του site
  const P = new Map(players.map(p => [p.c, team.prices && team.prices[p.c] != null ? { ...p, price: +team.prices[p.c], price_src: 'user' } : p]));
  const v = validateTeam(team, P, rules);
  if (v.errors.length) return { errors: v.errors, warn: v.warn };
  const ro = team.roster.map(c => P.get(c));
  const pool = [...P.values()];
  const C = new Map(coaches.map(c => [c.t, c]));
  const coach = C.get(team.coach) || null;
  const base = expectedFP(ro, coach);
  const trades = Math.min(+team.trades, 10);
  const scen = [];
  const seen = new Set();
  for (const m of MODES) {
    const srch = m.key === 'upside' ? pool.map(upsideOf) : pool, roS = m.key === 'upside' ? ro.map(upsideOf) : ro;
    const res = multiTrade(roS, srch, { bank: +team.bank, transfersLeft: trades, maxTrades: trades, risk: m.risk, horizonRounds, locked: team.locked || [], minGain: 0.5 });
    let tr = res.trades.map(t => ({ out: t.out, in: t.in, gain: t.gain }));
    let roAfter = res.roster.map(p => P.get(p.c)), bankAfter = res.bank;
    // προπονητής: μετράει στις αλλαγές· μόνο αν περισσεύει αλλαγή και βελτιώνει την εκτίμηση ≥ 3
    let cs = null;
    if (tr.length < trades && !(team.locked || []).includes('coach')) cs = coachSwap(team.coach, coaches, bankAfter, rules);
    if (cs) bankAfter = r1(bankAfter - cs.cost);
    const coachAfter = cs ? C.get(cs.in) : coach;
    const key = tr.map(t => t.out + '>' + t.in).sort().join(',') + (cs ? '|' + cs.in : '');
    if (!tr.length && !cs) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const after = expectedFP(roAfter, coachAfter);
    const dNext = r1(after - base);
    const dH = r1(expectedFP(roAfter, coachAfter, horizonRounds) - expectedFP(ro, coach, horizonRounds));
    if (dNext < MIN_GAIN.next && dH < MIN_GAIN.horizon) continue;    // δεν αξίζει: καλύτερα να κρατήσεις την ομάδα
    const lu = lineupOf(roAfter, 'ceiling');
    const capSt = lu.start.map(c => P.get(c)).sort((a, b) => capPoints(b).upside - capPoints(a).upside)[0];
    const items = tr.map(t => { const o = P.get(t.out), i = P.get(t.in), R = tradeReasons(o, i); if (!R.why.length) R.why.push({ k: 'fit', a: t.gain }); return { out: t.out, in: t.in, priceOut: o.price, priceIn: i.price, priceSrcIn: i.price_src || 'estimate', priceSrcOut: o.price_src || 'estimate', ...R }; });
    const unc = [];
    for (const c of roAfter.map(p => p.c)) { const p = P.get(c); if (p.status === 'doubtful') unc.push({ k: 'doubtful', c }); if (minutesRisk(p) === 'high') unc.push({ k: 'minutes', c }); }
    scen.push({ key: m.key, trades: items, coach: cs, cost: r1(+team.bank - bankAfter), bankAfter, nTrades: items.length + (cs ? 1 : 0),
      dNext, dHorizon: dH, before: r1(base), after: r1(after),
      lineup: { ...lu, captain: capSt.c }, uncertainty: unc,
      priceEstimate: items.some(t => t.priceSrcIn !== 'official' || t.priceSrcOut === 'estimate') || (cs && cs.price_src !== 'official') });
  }
  // πρόταση «κράτα την ομάδα»: πάντα με τη βέλτιστη διάταξη και αρχηγό της τωρινής 10άδας
  const luKeep = lineupOf(ro, 'ceiling');
  const capKeep = luKeep.start.map(c => P.get(c)).sort((a, b) => capPoints(b).upside - capPoints(a).upside)[0];
  const keep = { key: 'keep', trades: [], coach: null, cost: 0, bankAfter: +team.bank, nTrades: 0, dNext: 0, dHorizon: 0, before: r1(base), after: r1(base), lineup: { ...luKeep, captain: capKeep.c },
    uncertainty: ro.flatMap(p => [p.status === 'doubtful' ? { k: 'doubtful', c: p.c } : null, minutesRisk(p) === 'high' ? { k: 'minutes', c: p.c } : null, OUT(p.status) ? { k: 'out', c: p.c } : null].filter(Boolean)) };
  // ταξινόμηση: η ισορροπημένη πρώτη· έως 3 σενάρια
  scen.sort((a, b) => MODES.findIndex(m => m.key === a.key) - MODES.findIndex(m => m.key === b.key));
  return { scenarios: scen.slice(0, 3), keep, recommendKeep: scen.length === 0, warn: v.warn, base: r1(base) };
}
