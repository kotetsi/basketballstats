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
  else {
    // τα «διαθέσιμα credits» είναι ό,τι ΔΕΝ έχεις ξοδέψει (συνήθως 0-5), όχι το σύνολο των 100: αξία 10άδας + credits δεν μπορεί να ξεπερνά πολύ το budget
    const pr = c => (team.prices && team.prices[c] != null ? +team.prices[c] : +(P.get(c)?.price || 0));
    const value = team.roster.reduce((a, c) => a + pr(c), 0);
    if (team.roster.length === rules.players && value + +team.bank > rules.budget * 1.2) errors.push({ k: 'bank_high', b: +team.bank, v: Math.round(value * 10) / 10, max: Math.max(0, Math.round((rules.budget * 1.2 - value) * 10) / 10) });
  }
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

// ---------------------------------------------------------------- διάταξη καρτών της επίσημης εφαρμογής (Classic Mode)
// Κάθε κάρτα: «G Brizuela» (θέση + επώνυμο, λευκά γράμματα σε σκούρα λωρίδα) · από κάτω «6.3  T3» · «CR  @ PAO».
// Ο προπονητής: «HC Parker». Ο αρχηγός: κίτρινο-πράσινο σήμα «C» πάνω δεξιά στην κάρτα.
// Οι κωδικοί ομάδων της εφαρμογής διαφέρουν από τους δικούς μας σε μερικές ομάδες.
export const APP_CODES = { PAO: 'PAN', RMB: 'MAD', RMA: 'MAD', MTA: 'TEL', MAC: 'TEL', EFS: 'IST', EFE: 'IST', CZV: 'RED', KBA: 'BAS', BKN: 'BAS', BJK: 'BES', FBB: 'ULK', FEN: 'ULK', BAY: 'MUN', FCB: 'MUN',
  VBC: 'PAM', VAL: 'PAM', ASM: 'MCO', MON: 'MCO', PBB: 'PRS', PAB: 'PRS', HTA: 'HTA', HAP: 'HTA', DUB: 'DUB', OLY: 'OLY', BAR: 'BAR', ZAL: 'ZAL', PAR: 'PAR', ASV: 'ASV', MIL: 'MIL', VIR: 'VIR' };
const PRICE_TOKEN = /^(\d{1,3})(?:[.,](\d))?$/;
/** «6.3» → 6.3 · «10,5» → 10.5 · «93» → 9.3 (το OCR χάνει την τελεία) · εκτός ορίων → null */
export function fixPrice(t) {
  const m = String(t).trim().match(PRICE_TOKEN); if (!m) return null;
  let v = m[2] != null ? +`${m[1]}.${m[2]}` : +m[1];
  if (m[2] == null && v > 35 && m[1].length >= 2) v = +`${m[1].slice(0, -1)}.${m[1].slice(-1)}`;
  return v >= 2 && v <= 35 ? v : null;
}
const isCR = t => /^c[rn]\.?$/i.test(String(t).trim());
const isTier = t => /^[T7][1-3]$/i.test(String(t).trim());
/** άγκυρες καρτών: αριθμός-αξία με «CR» ακριβώς από κάτω ή/και «T1-3» στην ίδια γραμμή δεξιά.
 * Ακέραιος (π.χ. «10») γίνεται δεκτός μόνο με «T» δίπλα: αλλιώς είναι συνήθως νούμερο φανέλας.
 * words = [{text,x0,y0,x1,y1}] (μπορεί από πολλά περάσματα) */
export function findAnchors(words) {
  const out = [];
  for (const w of words) {
    const price = fixPrice(w.text); if (price == null) continue;
    const h = w.y1 - w.y0; if (h <= 0) continue;
    const cr = words.find(c => isCR(c.text) && c.y0 > w.y1 - 0.2 * h && c.y0 < w.y1 + 1.6 * h && c.x0 < w.x1 + 0.3 * h && c.x1 > w.x0 - 0.3 * h);
    const tier = words.find(c => isTier(c.text) && Math.abs((c.y0 + c.y1) / 2 - (w.y0 + w.y1) / 2) < 0.5 * h && c.x0 > w.x1 + 0.8 * h && c.x0 < w.x1 + 6 * h);
    const below = words.find(c => /^(@|V[S5]|[A-Z]{3})$/.test(String(c.text).trim()) && c.y0 > w.y1 - 0.2 * h && c.y0 < w.y1 + 1.6 * h && c.x0 > w.x1 + 0.8 * h && c.x0 < w.x1 + 6 * h);
    const decimal = /[.,]/.test(w.text);
    if (!(tier || (decimal && (cr || below)))) continue;
    if (out.some(a => Math.abs(a.x0 - w.x0) < 2 * h && Math.abs(a.y0 - w.y0) < h)) continue;   // ίδια κάρτα από άλλο πέρασμα
    out.push({ price, x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, h, crY: cr ? cr.y1 : w.y1 + 1.45 * h });
  }
  return out;
}
/** περιοχές κάρτας σε σχέση με την άγκυρα (αναλογίες μετρημένες στην εφαρμογή): λωρίδα ονόματος, γραμμή αντιπάλου, σήμα αρχηγού */
export function cardRegions(a) {
  const h = a.h, left = a.x0 - 1.4 * h, right = a.x0 + 7.4 * h;
  return {
    name: { x0: left, y0: a.y0 - 2.6 * h, x1: right, y1: a.y0 - 0.45 * h },
    opp: { x0: a.x1, y0: a.y1, x1: right, y1: a.crY + 0.5 * h },
    badge: { x0: right - 2.6 * h, y0: a.y0 - 7.6 * h, x1: right + 0.6 * h, y1: a.y0 - 2.6 * h },
  };
}
/** αντίπαλος από τις λέξεις κάτω δεξιά της άγκυρας: «@ PAO» (εκτός) ή «VS DUB» (εντός) */
export function oppFrom(words, a) {
  const r = cardRegions(a).opp;
  const ws = words.filter(w => w.x0 >= r.x0 - 2 && w.x1 <= r.x1 + a.h && w.y0 >= r.y0 - 0.5 * a.h && w.y1 <= r.y1 + 0.5 * a.h).sort((x, y) => x.x0 - y.x0);
  const txt = ws.map(w => w.text).join(' ').toUpperCase().replace(/[¥]/g, 'Y');
  const m = txt.match(/(@|V[S5]|Y[S5])?\s*([A-Z]{3})\b/g);
  if (!m) return null;
  const last = m[m.length - 1].trim(), code = last.slice(-3), away = /@/.test(txt) ? true : /V[S5]|Y[S5]/.test(txt) ? false : null;
  return { code, away, our: APP_CODES[code] || code };
}
/** «G Brizuela» / «HC Parker» / «F Vezenkov» → θέση, προπονητής, όνομα.
 * Ανέχεται θόρυβο του OCR γύρω από τη λωρίδα: «| F Vezen kov |», «oF Tubelis», «GFeliz», «[ F Ndiaye J]». */
export function parseCardText(t) {
  const s = String(t || '').replace(/[|_—–:;\[\]{}()!,.'"`*~=+<>\\/]+/g, ' ').replace(/\s+/g, ' ').trim();
  const toks = s.split(' ').filter(Boolean);
  const mk = (k, rest) => {
    const name = rest.filter((x, i) => !(i === rest.length - 1 && x.length === 1 && rest.length > 1)).join(' ').trim();   // «… J» στο τέλος = θόρυβος
    return { pos: k === 'G' || k === '6' ? 'Guard' : k === 'F' ? 'Forward' : k === 'C' ? 'Center' : null, coach: k === 'HC', name };
  };
  for (let i = 0; i < Math.min(3, toks.length - 0); i++) {
    const k = toks[i];
    // προπονητής: «HC» και οι συνηθισμένες παραναγνώσεις του («Hc», «HG», «HO», «NC», «IIC», «H C», «HCParker»)
    if (/^(H[CcGO0(]|N[Cc]|[I1l]{1,2}C)$/.test(k) && i + 1 < toks.length) return mk('HC', toks.slice(i + 1));
    if (k === 'H' && /^[CcGO]$/.test(toks[i + 1] || '') && i + 2 < toks.length) return mk('HC', toks.slice(i + 2));
    const hcg = k.match(/^H[CcG]([A-Z][a-z]{2,}.*)$/); if (hcg) return mk('HC', [hcg[1], ...toks.slice(i + 1)]);
    if (/^(HC|[GFC6])$/.test(k) && i + 1 < toks.length) return mk(k, toks.slice(i + 1));
    const glued = k.match(/^(HC|[GFC])([A-Z][a-z]{2,}.*)$/);                 // «GFeliz» → G + Feliz
    if (glued) return mk(glued[1], [glued[2], ...toks.slice(i + 1)]);
    const noisy = k.match(/^[a-z]{1,2}(HC|[GFC])$/);                         // «oF Tubelis»
    if (noisy && i + 1 < toks.length) return mk(noisy[1], toks.slice(i + 1));
    if (/^[A-Z][a-z]{2,}/.test(k)) break;                                     // ξεκίνησε το όνομα χωρίς θέση
  }
  const rest = toks.filter((x, i) => !(x.length <= 2 && /^[a-z]+$/i.test(x) && i < 2));
  return { pos: null, coach: false, name: rest.join(' ') };
}
/** ομάδα από τον αντίπαλο της αγωνιστικής: «@ PAO» = η ομάδα που παίζει εκτός με τον Παναθηναϊκό */
export function teamFromOpp(opp, players) {
  if (!opp) return null;
  const ts = [...new Set(players.filter(p => p.opp === opp.our && (opp.away == null || (opp.away ? !p.home : !!p.home))).map(p => p.t))];
  return ts.length === 1 ? ts[0] : null;
}
/**
 * κάρτες → ίδια μορφή με το parseScan. cards = [{text (λωρίδα ονόματος), price, opp, captain, y, x}]
 * Η ομάδα (από τον αντίπαλο) και η θέση (G/F/C) περιορίζουν τους υποψήφιους: έτσι λύνονται και τα ίδια επώνυμα.
 */
export function parseCards(cards, players, coaches = [], { greek = {} } = {}) {
  const idx = nameIndex(players, greek);
  const entries = [], seen = new Set();
  let coach = null, captain = null;
  // διάταξη: οι 5 πιο ψηλά κάρτες παικτών = πεντάδα· από τις υπόλοιπες, η πιο αριστερή = 6ος· οι άλλες = πάγκος
  const isCoachText = c => (c.texts && c.texts.length ? c.texts : [c.text]).some(x => parseCardText(x).coach);
  // προπονητής από τη διάταξη, αν το «HC» δεν διαβάστηκε: με 11 κάρτες, κάτω από τον 6ο, στην ίδια (αριστερή) στήλη
  let geoCoach = null;
  if (!cards.some(isCoachText) && cards.length === 11) {
    const below = cards.slice().sort((a, b) => a.y - b.y).slice(5), xs = cards.map(c => c.x), tol = 0.12 * (Math.max(...xs) - Math.min(...xs) || 1);
    const minX = Math.min(...below.map(c => c.x)), col = below.filter(c => c.x - minX <= tol).sort((a, b) => a.y - b.y);
    if (col.length === 2) geoCoach = col[1];
  }
  const pl = cards.filter(c => c !== geoCoach && !isCoachText(c));
  const byY = pl.slice().sort((a, b) => a.y - b.y), start = new Set(byY.slice(0, 5)), rest = byY.slice(5);
  const sixth = rest.length >= 2 ? rest.slice().sort((a, b) => a.x - b.x)[0] : null;
  for (const c of cards) {
    const team = teamFromOpp(c.opp, players);
    const texts = (c.texts && c.texts.length ? c.texts : [c.text]).filter(Boolean);
    // κάθε κάρτα μπορεί να έχει πολλές αναγνώσεις (γκρι / δυαδική): κρατάμε αυτή με τον καλύτερο υποψήφιο
    let t = parseCardText(texts[0]), best = -1;
    for (const x of texts) {
      const q = parseCardText(x);
      if (q.coach) { t = q; break; }
      const sc = q.name ? (topFor(norm(q.name), idx, 1)[0]?.score || 0) + (q.pos ? 0.01 : 0) : 0;
      if (sc > best) { best = sc; t = q; }
    }
    c.text = texts.join(' / ');
    if (c === geoCoach) t = { ...t, coach: true };
    if (t.coach) {
      // ομάδα προπονητή: από τον αντίπαλο (και εντός/εκτός) στη λίστα προπονητών, αλλιώς από τους παίκτες
      const byCoach = c.opp ? [...new Set(coaches.filter(x => x.opp === c.opp.our && (c.opp.away == null || x.home == null || (c.opp.away ? !x.home : !!x.home))).map(x => x.t))] : [];
      const ct = byCoach.length === 1 ? byCoach[0] : team;
      coach = ct ? { t: ct, raw: c.text, status: 'sure', price: c.price } : { t: null, raw: c.text, status: 'none', options: [] };
      continue;
    }
    if (!t.name || t.name.length < 2) continue;
    const nn = norm(t.name), longT = nn.split(' ').filter(x => x.length >= 3);
    // παραλλαγές: οι τελευταίες λέξεις, ολόκληρο, ενωμένο («vezen kov» → «vezenkov»)
    const variants = [...new Set([longT.slice(-2).join(' '), nn, nn.replace(/ /g, ''), longT.join('')].filter(x => x && x.length >= 3))];
    const merged = new Map();
    for (const v of variants) for (const x of topFor(v, idx, 6)) if (!merged.has(x.c) || merged.get(x.c).score < x.score) merged.set(x.c, x);
    const cands = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 6);
    if (!cands.length && !t.pos) continue;   // χωρίς όνομα και χωρίς θέση: όχι κάρτα (π.χ. νούμερο φανέλας)
    const P = c2 => players.find(p => p.c === c2.c);
    // περιορισμοί: ίδια ομάδα (αν βγαίνει από τον αντίπαλο), ίδια θέση (αν διαβάστηκε)
    let f = cands.filter(x => (!team || P(x)?.t === team) && (!t.pos || P(x)?.pos === t.pos));
    if (!f.length) f = cands.filter(x => !team || P(x)?.t === team);
    if (!f.length) f = cands;
    const boosted = f.map(x => ({ ...x, score: Math.min(1, +(x.score + (team && P(x)?.t === team ? 0.08 : 0) + (t.pos && P(x)?.pos === t.pos ? 0.02 : 0)).toFixed(3)) }));
    const d = decide(boosted);
    const key = d.status === 'sure' ? d.c : 'amb:' + boosted.map(x => x.c).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const slot = start.has(c) ? 'start' : c === sixth ? 'sixth' : rest.includes(c) ? 'bench' : null;
    entries.push({ raw: t.name, line: c.text, ...(d.status === 'none' ? { status: 'ambiguous', options: [] } : d), price: c.price ?? null, slotHint: slot, captainHint: !!c.captain, teamHint: team, posHint: t.pos });
    if (c.captain && d.status === 'sure') captain = d.c;
  }
  return { entries: entries.filter(e => e.status === 'sure' || e.options.length), bank: null, coach, captain, unresolved: entries.filter(e => e.status !== 'sure' && !e.options.length).map(e => e.raw), sureCount: entries.filter(e => e.status === 'sure').length };
}
