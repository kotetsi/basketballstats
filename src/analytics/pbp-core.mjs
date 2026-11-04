// Μετατροπή του επίσημου play-by-play της EuroLeague σε «stints»:
// διαστήματα όπου η πεντάδα μιας ομάδας μένει ίδια, με τα στατιστικά της ομάδας και του αντιπάλου.
// Καθαρές συναρτήσεις (χωρίς δίκτυο), για να ελέγχονται με unit tests.

// Σειρά στατιστικών σε κάθε πλευρά ενός stint
export const SK = ['pts', 'fgm2', 'fga2', 'fgm3', 'fga3', 'ftm', 'fta', 'oreb', 'dreb', 'tov', 'ast', 'stl', 'blk', 'pf'];
const IX = Object.fromEntries(SK.map((k, i) => [k, i]));
const NS = SK.length;

const QKEYS = ['FirstQuarter', 'SecondQuarter', 'ThirdQuarter', 'ForthQuarter'];
const trim = s => (s == null ? '' : String(s).trim());

// Ποια στατιστικά αλλάζει κάθε τύπος γεγονότος (στην EuroLeague «2FGA» = άστοχο δίποντο, «2FGM» = εύστοχο)
const EFFECT = {
  '2FGM': { pts: 2, fgm2: 1, fga2: 1 }, '2FGA': { fga2: 1 },
  '3FGM': { pts: 3, fgm3: 1, fga3: 1 }, '3FGA': { fga3: 1 },
  'FTM': { pts: 1, ftm: 1, fta: 1 }, 'FTA': { fta: 1 },
  'O': { oreb: 1 }, 'D': { dreb: 1 }, 'TO': { tov: 1 }, 'AS': { ast: 1 },
  'ST': { stl: 1 }, 'FV': { blk: 1 }, 'CM': { pf: 1 }, 'CMU': { pf: 1 }, 'CMT': { pf: 1 }, 'CMD': { pf: 1 }, 'OF': { pf: 1 },
};

// "07:43" → δευτερόλεπτα που απομένουν στην περίοδο
export function clock(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(trim(s));
  return m ? +m[1] * 60 + +m[2] : null;
}
export const periodLen = q => (q <= 4 ? 600 : 300);
export const periodStart = q => (q <= 4 ? (q - 1) * 600 : 2400 + (q - 5) * 300);

// Όλα τα γεγονότα σε μία λίστα, με αριθμό περιόδου και χρόνο από την αρχή του αγώνα
export function flatten(pbp) {
  const out = [];
  QKEYS.forEach((k, i) => (pbp[k] || []).forEach(e => out.push({ ...e, q: i + 1 })));
  // Οι παρατάσεις έρχονται όλες μαζί στο ExtraTime· τις χωρίζουμε με τα «BP» (Begin Period)
  let q = 4;
  for (const e of pbp.ExtraTime || []) { if (trim(e.PLAYTYPE) === 'BP') q++; out.push({ ...e, q: Math.max(q, 5) }); }
  let lastT = 0;
  for (const e of out) {
    const rem = clock(e.MARKERTIME);
    const t = rem == null ? (trim(e.PLAYTYPE) === 'BP' ? periodStart(e.q) : lastT) : periodStart(e.q) + periodLen(e.q) - rem;
    e.t = Math.max(t, lastT); lastT = e.t;
    e.type = trim(e.PLAYTYPE); e.team = trim(e.CODETEAM); e.pid = trim(e.PLAYER_ID);
  }
  return out;
}

const isClutch = (t, q, margin) => q >= 4 && (periodStart(q) + periodLen(q) - t) <= 300 && Math.abs(margin) <= 5;

/**
 * Κύρια συνάρτηση.
 * @param pbp      απάντηση του /api/PlayByPlay
 * @param starters { [teamCode]: [playerIds] } από το Boxscore (IsStarter)
 * @returns { teams:[A,B], stints:{[team]: [{p:[5 ids], s:secs, c:0|1, own:[..], opp:[..]}]}, checks }
 */
export function buildStints(pbp, starters) {
  const A = trim(pbp.CodeTeamA), B = trim(pbp.CodeTeamB);
  const ev = flatten(pbp);
  const on = { [A]: new Set(starters[A] || []), [B]: new Set(starters[B] || []) };
  const score = { [A]: 0, [B]: 0 };
  const acc = { [A]: new Map(), [B]: new Map() };
  const total = { [A]: new Array(NS).fill(0), [B]: new Array(NS).fill(0) };
  const lost = { secs: 0, events: 0 };
  let t0 = 0, q0 = 1, curQ = 0;
  // Πρώτη «εμφάνιση» κάθε παίκτη σε κάθε περίοδο: αν πρώτα βγαίνει (OUT) ή κάνει φάση, ήταν ήδη στο παρκέ·
  // αν πρώτα μπαίνει (IN), δεν ήταν. Έτσι διορθώνονται αλλαγές ανάμεσα σε περιόδους που δεν καταγράφηκαν.
  const first = {};
  for (const e of ev) {
    if (!e.pid || !on[e.team]) continue;
    const f = (first[e.q] ||= {}), k = e.team + '|' + e.pid;
    if (!(k in f)) f[k] = e.type === 'IN' ? 'IN' : e.type === 'OUT' ? 'OUT' : (EFFECT[e.type] ? 'ACT' : null);
    if (f[k] === null) delete f[k];
  }
  const startPeriod = q => {
    for (const [k, v] of Object.entries(first[q] || {})) {
      const [tm, pid] = k.split('|');
      if (v === 'IN') on[tm].delete(pid); else on[tm].add(pid);
    }
    // Αν έμειναν >5, βγαίνουν όσοι δεν εμφανίζονται καθόλου στην περίοδο — μόνο αν αυτό είναι μονοσήμαντο
    for (const tm of [A, B]) {
      const extra = on[tm].size - 5; if (extra <= 0) continue;
      const idle = [...on[tm]].filter(pid => !((tm + '|' + pid) in (first[q] || {})));
      if (idle.length === extra) idle.forEach(pid => on[tm].delete(pid));
    }
  };

  const key = (tm, clutch) => [...on[tm]].sort().join(',') + '|' + clutch;
  const cell = (tm, clutch) => {
    const k = key(tm, clutch); let c = acc[tm].get(k);
    if (!c) { c = { p: [...on[tm]].sort(), s: 0, c: clutch, own: new Array(NS).fill(0), opp: new Array(NS).fill(0) }; acc[tm].set(k, c); }
    return c;
  };
  const valid = () => on[A].size === 5 && on[B].size === 5;
  const advance = (t, q) => {
    // Το διάστημα κόβεται στο όριο των τελευταίων 5 λεπτών (για σωστό clutch)
    const cut = periodStart(q0) + periodLen(q0) - 300;
    if (q0 >= 4 && t0 < cut && t > cut) advanceTo(cut);
    advanceTo(t);
    q0 = q;
  };
  const advanceTo = t => {
    if (t > t0) {
      const cl = isClutch(t0, q0, score[A] - score[B]) ? 1 : 0;
      if (valid()) { cell(A, cl).s += t - t0; cell(B, cl).s += t - t0; } else lost.secs += t - t0;
    }
    t0 = Math.max(t0, t);
  };

  const shots = [];
  const FG = { '2FGM': [1, 0], '2FGA': [0, 0], '3FGM': [1, 1], '3FGA': [0, 1] };
  ev.forEach((e, i) => (e.i = i));
  for (const e of ev) {
    advance(e.t, e.q);
    if (e.q !== curQ) { curQ = e.q; startPeriod(e.q); }
    if (e.type === 'IN' && on[e.team]) { on[e.team].add(e.pid); continue; }
    if (e.type === 'OUT' && on[e.team]) { on[e.team].delete(e.pid); continue; }
    const eff = EFFECT[e.type];
    if (!eff || !on[e.team]) continue;
    const opp = e.team === A ? B : A;
    for (const [k, v] of Object.entries(eff)) total[e.team][IX[k]] += v;
    const cl = isClutch(e.t, e.q, score[A] - score[B]) ? 1 : 0;
    if (valid()) {
      const mine = cell(e.team, cl), theirs = cell(opp, cl);
      for (const [k, v] of Object.entries(eff)) { mine.own[IX[k]] += v; theirs.opp[IX[k]] += v; }
    } else lost.events++;
    if (FG[e.type] && e.pid) {
      const [made, three] = FG[e.type], mg = e.team === A ? score[A] - score[B] : score[B] - score[A];
      shots.push({ n: e.NUMBEROFPLAY, i: e.i, team: e.team, pid: e.pid, q: e.q, t: e.t, clk: trim(e.MARKERTIME), made, three, margin: mg, clutch: cl,
        on: on[e.team].size === 5 ? [...on[e.team]].sort() : null, def: on[opp].size === 5 ? [...on[opp]].sort() : null, ast: null });
    }
    if (eff.pts) score[e.team] += eff.pts;
  }
  // assisted: κάθε ασίστ ταιριάζει με το πιο κοντινό (σε σειρά γεγονότων) εύστοχο σουτ της ίδιας ομάδας στον ίδιο χρόνο (±2΄΄)
  const madeBy = shots.filter(s => s.made);
  for (const e of ev) {
    if (e.type !== 'AS' || !e.pid) continue;
    let best = null, bd = 1e9;
    for (const s of madeBy) {
      if (s.ast || s.team !== e.team || s.pid === e.pid || Math.abs(s.t - e.t) > 2) continue;
      const d = Math.abs(s.i - e.i);
      if (d < bd && d <= 12) { bd = d; best = s; }
    }
    if (best) best.ast = e.pid;
  }
  const end = Math.max(t0, ev.length ? periodStart(ev[ev.length - 1].q) + periodLen(ev[ev.length - 1].q) : 2400);
  advance(end, q0);

  const out = { [A]: [...acc[A].values()].filter(x => x.s > 0 || x.own.some(Boolean) || x.opp.some(Boolean)), [B]: [...acc[B].values()].filter(x => x.s > 0 || x.own.some(Boolean) || x.opp.some(Boolean)) };
  const sumPts = tm => out[tm].reduce((a, x) => a + x.own[0], 0);
  return {
    teams: [A, B], stints: out, total, secs: end, shots,
    checks: { scoreA: score[A], scoreB: score[B], stintPtsA: sumPts(A), stintPtsB: sumPts(B), lostSecs: lost.secs, lostEvents: lost.events },
  };
}
