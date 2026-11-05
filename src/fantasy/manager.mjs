// Fantasy Manager Tools: καθαρές συναρτήσεις για σύνθεση, trades, multi-trade optimizer, round planner και alerts.
// Χρησιμοποιούνται από τον browser (σελίδες) και από τα tests. Κανένα προσωπικό δεδομένο δεν φεύγει από τον browser.
import { bestLineup, playerValue, FORMATIONS, POS, ROSTER } from './optimizer.mjs';

export const MAX_PER_TEAM = 6;
export const CAP = 100;

// ---------- metrics
export const pirPerCredit = (pir, price) => (price > 0 && pir != null ? pir / price : 0);
export function valueGrade(v, sortedDesc) {
  if (!sortedDesc.length) return 'C';
  const r = sortedDesc.filter(e => e > v).length / sortedDesc.length;
  for (const [cut, g] of [[0.05, 'A+'], [0.15, 'A'], [0.3, 'B+'], [0.5, 'B'], [0.7, 'C+'], [0.85, 'C']]) if (r < cut) return g;
  return 'D';
}

// ---------- σύνθεση
export const rosterCost = (ro, coach) => Math.round((ro.reduce((s, p) => s + (p.price || 0), 0) + (coach ? coach.price || 0 : 0)) * 10) / 10;
export function validateRoster(ro, { coach = null, cap = CAP, maxPerTeam = MAX_PER_TEAM, partial = false } = {}) {
  const err = [];
  const cnt = { Guard: 0, Forward: 0, Center: 0 }, teams = {};
  for (const p of ro) { cnt[p.pos] = (cnt[p.pos] || 0) + 1; teams[p.t] = (teams[p.t] || 0) + 1; }
  for (const ps of POS) {
    if (cnt[ps] > ROSTER[ps]) err.push({ k: 'pos_over', pos: ps, n: cnt[ps], max: ROSTER[ps] });
    if (!partial && cnt[ps] < ROSTER[ps]) err.push({ k: 'pos_under', pos: ps, n: cnt[ps], min: ROSTER[ps] });
  }
  for (const [t, n] of Object.entries(teams)) if (n > maxPerTeam) err.push({ k: 'team_max', t, n, max: maxPerTeam });
  const cost = rosterCost(ro, coach);
  if (cost > cap + 1e-9) err.push({ k: 'budget', cost, cap });
  if (new Set(ro.map(p => p.c)).size !== ro.length) err.push({ k: 'dup' });
  return err;
}

// ---------- προβολή 3 αγωνιστικών ως «ψευδο-παίκτης» (για το optimizer με ορίζοντα 3)
export function horizon(p, h) {
  if (h !== 3 || !p.nx || !p.nx.length || !p.pp) return p;
  const k = (p.p3 || 0) / Math.max(p.pp, 0.1);
  return { ...p, pp: p.p3, p10: p.p10 * k, p50: p.p50 * k, p90: p.p90 * k };
}
const lineupScore = (ro, risk, h = 1) => { const lu = bestLineup(ro.map(p => horizon(p, h)), risk); return lu ? lu.score : -1e9; };

// ---------- κίνδυνοι
export function injuryRisk(p) { return p.status === 'injured' || p.status === 'rest' ? 'high' : p.status === 'doubtful' ? 'medium' : 'low'; }
export function minutesRisk(p) {
  if (!p.m10 || p.m10 < 12 || (p.gp ?? 9) < 3) return 'high';
  const d = (p.m3 ?? p.m10) - p.m10;
  return d <= -5 || p.m10 < 18 ? 'medium' : 'low';
}
const avgDiff = p => (p.nx && p.nx.length ? p.nx.reduce((s, x) => s + x[4], 0) / p.nx.length : 3);
const RISKPEN = { high: 8, medium: 3, low: 0 };

/**
 * Αξιολόγηση ενός trade: πώληση outC, αγορά inC.
 * bank = διαθέσιμα credits (ταμείο) πριν από το trade
 */
export function tradeEval(roster, outC, inC, players, { bank = 0, transfersLeft = 99, risk = 'balanced', coach = null, maxPerTeam = MAX_PER_TEAM } = {}) {
  const P = new Map(players.map(p => [p.c, p]));
  const out = roster.find(p => p.c === outC), inn = P.get(inC);
  const errors = [];
  if (!out) errors.push({ k: 'not_in_roster' });
  if (!inn) errors.push({ k: 'unknown_player' });
  if (errors.length) return { errors };
  if (roster.some(p => p.c === inC)) errors.push({ k: 'already_in' });
  if (out.pos !== inn.pos) errors.push({ k: 'pos_mismatch', a: out.pos, b: inn.pos });
  if (transfersLeft < 1) errors.push({ k: 'no_transfers' });
  const after = roster.map(p => (p.c === outC ? inn : p));
  const bankAfter = Math.round((bank + out.price - inn.price) * 10) / 10;
  if (bankAfter < -1e-9) errors.push({ k: 'bank', bankAfter });
  const tc = after.filter(p => p.t === inn.t).length;
  if (tc > maxPerTeam) errors.push({ k: 'team_max', t: inn.t, n: tc, max: maxPerTeam });
  const rk = risk === 'balanced' ? 'ceiling' : risk;
  const before1 = lineupScore(roster, rk, 1), after1 = lineupScore(after, rk, 1);
  const before3 = lineupScore(roster, rk, 3), after3 = lineupScore(after, rk, 3);
  const dNext = Math.round((inn.pp - out.pp) * 10) / 10, d3 = Math.round(((inn.p3 || 0) - (out.p3 || 0)) * 10) / 10;
  const dFP = Math.round((after1 - before1) * 10) / 10, dFP3 = Math.round((after3 - before3) * 10) / 10;
  const dVpc = Math.round(((inn.vpc ?? pirPerCredit(inn.p3 / 3, inn.price)) - (out.vpc ?? pirPerCredit(out.p3 / 3, out.price))) * 100) / 100;
  const ir = injuryRisk(inn), mr = minutesRisk(inn);
  const dDiff = Math.round((avgDiff(inn) - avgDiff(out)) * 10) / 10;   // θετικό = δυσκολότερο πρόγραμμα για τον νέο
  const w = risk === 'safe' ? 1.6 : risk === 'ceiling' ? 0.6 : 1;     // πόσο μετράει το ρίσκο
  let score = d3 + 0.5 * dNext - w * (RISKPEN[ir] + RISKPEN[mr]) - 1.5 * dDiff;
  if (risk === 'ceiling') score += 0.25 * ((inn.p90 || 0) - (out.p90 || 0));
  if (risk === 'safe') score += 0.25 * ((inn.p10 || 0) - (out.p10 || 0));
  if (inn.small) score -= 3 * w;
  if (out.status === 'injured' || out.status === 'rest') score += 4;   // πουλάς παίκτη που δεν παίζει
  const rec = errors.length ? 'invalid' : score >= 10 ? 'strong_buy' : score >= 3 ? 'buy' : score > -3 ? 'neutral' : score > -10 ? 'avoid' : 'strong_avoid';
  return { errors, out, inn, bankAfter, dNext, d3, dFP, dFP3, dVpc, injuryRisk: ir, minutesRisk: mr, dDiff, sigOut: out.sig, sigIn: inn.sig, score: Math.round(score * 10) / 10, rec, after };
}

/**
 * Multi-trade optimizer: έως maxTrades (1-4) αλλαγές, beam search πάνω σε ανταλλαγές ίδιας θέσης.
 * Σέβεται ταμείο, θέσεις, έως 6 ανά ομάδα και υπόλοιπο transfers.
 */
export function multiTrade(roster, players, { bank = 0, transfersLeft = 4, maxTrades = 4, risk = 'balanced', horizonRounds = 3, maxPerTeam = MAX_PER_TEAM, beam = 6, minGain = 0.5 } = {}) {
  const K = Math.max(0, Math.min(4, maxTrades, transfersLeft));
  const rk = risk === 'balanced' ? 'ceiling' : risk;
  const pool = players.filter(p => p.status !== 'injured' && p.status !== 'rest' && p.opp && !p.small);
  const score = ro => lineupScore(ro, rk, horizonRounds);
  const base = score(roster);
  let states = [{ ro: roster, bank, trades: [], s: base }];
  const results = [states[0]];
  const ok = (ro, b) => b >= -1e-9 && Object.values(ro.reduce((m, p) => ((m[p.t] = (m[p.t] || 0) + 1), m), {})).every(n => n <= maxPerTeam);
  for (let step = 0; step < K; step++) {
    const next = [];
    for (const st of states) {
      const sold = new Set(st.trades.map(t => t.out)), bought = new Set(st.trades.map(t => t.in));
      for (let i = 0; i < st.ro.length; i++) {
        const o = st.ro[i];
        if (bought.has(o.c)) continue;
        // υποψήφιοι: οι καλύτεροι της ίδιας θέσης που χωράνε στο ταμείο
        const cands = pool.filter(q => q.pos === o.pos && !st.ro.some(x => x.c === q.c) && !sold.has(q.c) && q.price <= st.bank + o.price + 1e-9)
          .sort((a, b) => horizon(b, horizonRounds).pp - horizon(a, horizonRounds).pp).slice(0, 12);
        for (const q of cands) {
          const ro = st.ro.slice(); ro[i] = q;
          const b = Math.round((st.bank + o.price - q.price) * 10) / 10;
          if (!ok(ro, b)) continue;
          const s = score(ro);
          if (s > st.s + minGain) next.push({ ro, bank: b, trades: [...st.trades, { out: o.c, in: q.c, gain: Math.round((s - st.s) * 10) / 10 }], s });
        }
      }
    }
    if (!next.length) break;
    next.sort((a, b) => b.s - a.s);
    const seen = new Set();
    states = next.filter(x => { const k = x.ro.map(p => p.c).sort().join(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, beam);
    results.push(states[0]);
  }
  const best = results.reduce((a, b) => (b.s > a.s ? b : a));
  const lu = r => bestLineup(r.map(p => horizon(p, 1)), rk);
  return { before: Math.round(base * 10) / 10, after: Math.round(best.s * 10) / 10, trades: best.trades, bank: best.bank, roster: best.ro,
    nextBefore: Math.round((lu(roster)?.score || 0) * 10) / 10, nextAfter: Math.round((lu(best.ro)?.score || 0) * 10) / 10,
    byK: results.map((r, k) => ({ k, total: Math.round(r.s * 10) / 10, trades: r.trades })) };
}

// ---------- Round planner
// lineup = { start:[5 κωδικοί], sixth, bench:[4], captain, coach }, curTurn = τρέχον turn (0..), παίκτες με day < curTurn έχουν παίξει
export function canBeActive(p, curTurn) { return p.day == null || p.day >= curTurn; }
export function captainEligible(lineup, c, P, curTurn) {
  if (!lineup.start.includes(c)) return { ok: false, why: 'not_starter' };
  const p = P.get(c);
  if (!p) return { ok: false, why: 'unknown' };
  if (!canBeActive(p, curTurn)) return { ok: false, why: 'played' };
  if (p.status === 'injured' || p.status === 'rest') return { ok: false, why: 'out' };
  return { ok: true };
}
const wb = p => 1 + 0.1 * (p.pwin ?? 0.5);
export function expectedPoints(p, slot, captain = false) { return (p.pp || 0) * wb(p) * (slot === 'bench' ? 0.5 : 1) * (captain && slot === 'start' ? 2 : 1); }

export function planRound(lineup, players, coaches, days, curTurn = 0) {
  const P = new Map(players.map(p => [p.c, p]));
  const slotOf = c => (lineup.start.includes(c) ? 'start' : lineup.sixth === c ? 'sixth' : 'bench');
  const all = [...lineup.start, lineup.sixth, ...lineup.bench].filter(Boolean).map(c => P.get(c)).filter(Boolean);
  const coach = coaches.find(x => x.t === lineup.coach);
  const starters = lineup.start.map(c => P.get(c)).filter(Boolean);
  const turns = days.map((d, i) => {
    const pl = all.filter(p => p.day === i);
    const avail = starters.filter(p => p.day >= i && p.status !== 'injured' && p.status !== 'rest');
    const best = [...avail].sort((a, b) => b.pp - a.pp)[0] || null;
    const diff = [...avail].filter(p => p !== best).sort((a, b) => (b.p90 - b.pp) + 0.5 * b.p90 - ((a.p90 - a.pp) + 0.5 * a.p90))[0] || null;
    const pts = pl.reduce((s, p) => s + expectedPoints(p, slotOf(p.c), p.c === lineup.captain), 0) + (coach && coach.day === i ? coach.exp : 0);
    return { i, date: d, state: i < curTurn ? 'done' : i === curTurn ? 'current' : 'next',
      playing: pl.map(p => ({ c: p.c, slot: slotOf(p.c), pp: p.pp, captain: p.c === lineup.captain })),
      laterAvail: all.filter(p => p.day > i).map(p => p.c), alreadyPlayed: all.filter(p => p.day < i).map(p => p.c),
      bestCaptain: best && best.c, diffCaptain: diff && diff.c, coach: coach && coach.day === i ? coach.t : null, points: Math.round(pts * 10) / 10 };
  });
  // αλλαγές field/bench μεταξύ turns: ενεργός που έπαιξε (στο turn i) ↔ παίκτης πάγκου που παίζει αργότερα
  // πριν: a + 0.5·y, μετά: 0.5·a + y → συμφέρει όταν ο ενεργός φέρει λιγότερο από y
  const subs = [];
  const usedB = new Set();
  for (const t of turns) {
    const actives = all.filter(p => p.day === t.i && slotOf(p.c) !== 'bench').sort((a, b) => a.pp - b.pp);
    for (const a of actives) {
      const b = lineup.bench.map(c => P.get(c)).filter(x => x && x.day > t.i && !usedB.has(x.c) && (slotOf(a.c) === 'sixth' || x.pos === a.pos) && x.status !== 'injured' && x.status !== 'rest').sort((x, y) => y.pp - x.pp)[0];
      if (b) { usedB.add(b.c); subs.push({ after: t.i, down: a.c, up: b.c, threshold: Math.round(b.pp * wb(b) * 10) / 10 }); }
    }
  }
  // αλλαγή αρχηγού: αν ο αρχηγός παίζει νωρίς, πέρασέ την σε βασικό που παίζει αργότερα αν φέρει λιγότερα από την εκτίμηση εκείνου
  const cap = P.get(lineup.captain);
  const capSwitch = cap ? starters.filter(p => p.day > cap.day && p.c !== cap.c && p.status === 'playing').sort((a, b) => b.pp - a.pp)[0] : null;
  const total = turns.reduce((s, t) => s + t.points, 0);
  return { turns, subs, capSwitch: capSwitch ? { from: cap.c, to: capSwitch.c, day: cap.day, threshold: Math.round(capSwitch.pp * 10) / 10 } : null, total: Math.round(total * 10) / 10 };
}

// καλύτερη χρήση μιας 10άδας ως lineup αντικείμενο με κωδικούς
export function lineupOf(ro, risk = 'ceiling', formation = 'auto') {
  const lu = bestLineup(ro, risk, formation);
  return lu ? { formation: lu.formation, start: lu.start.map(p => p.c), sixth: lu.sixth?.c || null, bench: lu.bench.map(p => p.c), captain: lu.captain.c } : null;
}

// ---------- Alerts
export function alertSeverity(kind, slot, isCaptain) {
  const active = slot === 'start' || slot === 'sixth';
  if (kind === 'ruled_out' || kind === 'injury') return isCaptain || active ? 'critical' : 'warning';
  if (kind === 'doubtful') return isCaptain ? 'critical' : active ? 'warning' : 'info';
  if (kind === 'minutes_drop') return active ? 'warning' : 'info';
  if (kind === 'captain_today') return 'info';
  if (kind === 'b2b') return 'info';
  if (kind === 'return' || kind === 'minutes_up' || kind === 'probable_starter' || kind === 'bench_movable') return 'info';
  return 'info';
}

/** alerts για τη σύνθεση: από την κατάσταση των παικτών, τις ειδήσεις και το τρέχον turn */
export function buildAlerts(lineup, players, news = [], { curTurn = 0, now = new Date().toISOString() } = {}) {
  const P = new Map(players.map(p => [p.c, p]));
  const slotOf = c => (lineup.start.includes(c) ? 'start' : lineup.sixth === c ? 'sixth' : 'bench');
  const mine = [...lineup.start, lineup.sixth, ...lineup.bench].filter(Boolean);
  const out = [];
  const add = (c, kind, before, after, action, source, ts = now) => {
    const p = P.get(c); if (!p) return;
    const slot = slotOf(c), cap = c === lineup.captain;
    out.push({ c, team: p.t, kind, severity: alertSeverity(kind, slot, cap), slots: [slot, ...(cap ? ['captain'] : [])], before, after, action, source, ts });
  };
  for (const c of mine) {
    const p = P.get(c); if (!p) continue;
    const slot = slotOf(c);
    if (p.status === 'injured' || p.status === 'rest') add(c, 'ruled_out', p.pp0 ?? p.l5 ?? null, 0, slot === 'bench' ? 'keep_bench' : 'to_bench', p.status_src || 'injury_list');
    else if (p.status === 'doubtful') add(c, 'doubtful', p.pp0 ?? p.l5 ?? null, p.pp, 'have_backup', p.status_src || 'missed_games_rule');
    if (p.m3 != null && p.m10 && p.m3 - p.m10 <= -5) add(c, 'minutes_drop', null, p.pp, 'watch', 'model');
    if (p.b2b) add(c, 'b2b', null, p.pp, 'watch', 'schedule');
    if (c === lineup.captain && p.day === curTurn) add(c, 'captain_today', null, p.pp, 'confirm_captain', 'schedule');
    if (slot === 'bench' && p.day != null && p.day >= curTurn && p.status === 'playing') {
      // μόνο όταν κάποιος ενεργός της ίδιας θέσης (ή ο 6ος) είναι εκτός/αμφίβολος και δεν έχει παίξει ακόμα
      const need = [...lineup.start, lineup.sixth].filter(Boolean).map(x => P.get(x)).some(a => a && (a.status !== 'playing') && (a.pos === p.pos || a.c === lineup.sixth) && (a.day == null || a.day >= curTurn));
      if (need) add(c, 'bench_movable', null, p.pp, 'can_move', 'schedule');
    }
  }
  const mineSet = new Set(mine);
  for (const n of news) if (mineSet.has(n.c) && ['return', 'probable_starter', 'minutes_up', 'projection_change', 'transfer'].includes(n.kind)) add(n.c, n.kind, n.before ?? null, n.after ?? null, 'review', n.source || 'model', n.ts || now);
  // δημοσιεύματα τύπου (τελευταίες 4 μέρες): ειδοποίηση με link, χωρίς αλλαγή εκτίμησης
  const fresh = Date.parse(now) - 4 * 864e5;
  for (const n of news) if (mineSet.has(n.c) && /^dom_/.test(n.kind) && Date.parse(n.ts) >= fresh) { add(n.c, n.kind, n.before ?? null, n.after ?? 0, 'check_news', n.source, n.ts); Object.assign(out[out.length - 1], { link: n.detail?.link, severity: n.kind === 'dom_absent' ? 'info' : alertSeverity('doubtful', slotOf(n.c), n.c === lineup.captain) }); }
  for (const n of news) if (mineSet.has(n.c) && n.kind === 'press' && Date.parse(n.ts) >= fresh) { add(n.c, 'press', null, P.get(n.c)?.pp ?? null, 'check_news', n.source, n.ts); Object.assign(out[out.length - 1], { title: n.title, i18n: n.i18n, link: n.link, tag: n.tag }); if (n.tag !== 'return') out[out.length - 1].severity = alertSeverity('doubtful', slotOf(n.c), n.c === lineup.captain); }
  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---------- εισαγωγή σύνθεσης (CSV / copy-paste)
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export function matchPlayer(q, players) {
  const n = norm(q); if (!n) return null;
  const byCode = players.find(p => p.c === q.trim() || p.c === q.trim().replace(/^P/i, ''));
  if (byCode) return byCode;
  const cands = players.map(p => { const a = norm(p.dn || p.n), parts = a.split(' '); const flip = norm((p.n || '').split(',').reverse().join(' '));
    const s = a === n || flip === n ? 3 : a.includes(n) || flip.includes(n) ? 2 : parts.some(x => x.length > 2 && n.split(' ').includes(x)) ? 1 : 0; return { p, s }; }).filter(x => x.s).sort((a, b) => b.s - a.s);
  return cands.length && (cands.length === 1 || cands[0].s > cands[1].s) ? cands[0].p : null;
}
/** «Όνομα» ή «slot,Όνομα» ανά γραμμή· «coach,PAN» ή «C: PAN» για προπονητή, «*» ή «(C)» για αρχηγό */
export function parseRoster(text, players, teams = []) {
  const ro = [], miss = [], slots = {};
  let coach = null, captain = null;
  for (let line of String(text).split(/\r?\n/)) {
    line = line.trim(); if (!line || /^#/.test(line) || /^slot\s*,/i.test(line)) continue;
    const cells = line.split(/[,;\t]/).map(x => x.trim()).filter(Boolean);
    let slot = null, name = cells[0];
    if (cells.length > 1 && /^(start|starter|sixth|6th|bench|captain|coach|πεντάδα|πάγκος|αρχηγός|προπονητής)$/i.test(cells[0])) { slot = cells[0].toLowerCase(); name = cells[1]; }
    const mC = name.match(/^(?:coach|προπονητής|c)\s*[:=]\s*(.+)$/i);
    if (slot === 'coach' || slot === 'προπονητής' || mC) { const t = (mC ? mC[1] : name).trim().toUpperCase(); coach = teams.includes(t) ? t : (teams.find(x => norm(x) === norm(t)) || t); continue; }
    let cap = false;
    if (/\*|\(c\)|\[c\]/i.test(name) || slot === 'captain' || slot === 'αρχηγός') { cap = true; name = name.replace(/\*|\(c\)|\[c\]/ig, '').trim(); }
    const p = matchPlayer(name, players);
    if (!p) { miss.push(name); continue; }
    if (ro.includes(p)) continue;
    ro.push(p);
    if (cap) { captain = p.c; slot = 'start'; }
    if (slot) slots[p.c] = /bench|πάγκος/.test(slot) ? 'bench' : /sixth|6th/.test(slot) ? 'sixth' : 'start';
  }
  return { roster: ro, missing: miss, coach, captain, slots };
}
export function toRosterCSV(lineup, P, coachT) {
  const rows = ['slot,player'];
  for (const c of lineup.start) rows.push(`${c === lineup.captain ? 'captain' : 'start'},${P.get(c)?.dn || c}`);
  if (lineup.sixth) rows.push(`sixth,${P.get(lineup.sixth)?.dn || lineup.sixth}`);
  for (const c of lineup.bench) rows.push(`bench,${P.get(c)?.dn || c}`);
  if (coachT) rows.push(`coach,${coachT}`);
  return rows.join('\n');
}

export { FORMATIONS, POS, ROSTER, playerValue };
