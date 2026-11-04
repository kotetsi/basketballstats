// Shot Charts & Scoring Zones: σύστημα συντεταγμένων, ζώνες και αθροίσεις. Ίδιος κώδικας σε build, browser και tests.
//
// Σύστημα συντεταγμένων (ίδιο με της EuroLeague, σε εκατοστά):
//   καλάθι στο (0,0) · x πλάγια, από −750 (αριστερά όπως κοιτάς το καλάθι από το γήπεδο) έως +750 · y προς το κέντρο
//   τελική γραμμή στο y = −157,5 · γραμμή τριπόντου: τόξο 675 cm, γωνίες στα |x| = 660 cm · ρακέτα 490 × 580 cm
export const COURT = { halfW: 750, baseY: -157.5, halfLen: 1400 - 157.5, arc: 675, corner: 660, paintW: 490, paintLen: 580, rim: 125, ftY: 580 - 157.5 };
export const CORNER_Y = Math.sqrt(COURT.arc ** 2 - COURT.corner ** 2); // ≈ 141 cm: εκεί που το τόξο συναντά τις ευθείες

// Κανονικοποίηση: αν ένα σουτ είναι καταγεγραμμένο στο απέναντι μισό (y > halfLen), καθρεφτίζεται·
// τιμές εκτός γηπέδου περιορίζονται στα όρια.
export function normalize(x, y) {
  if (x == null || y == null || !Number.isFinite(+x) || !Number.isFinite(+y)) return null;
  x = +x; y = +y;
  // το άλλο καλάθι είναι στο y = 2800 − 2·157,5 = 2485
  if (y > COURT.halfLen + 50) { y = 2485 - y; x = -x; }
  return { x: Math.max(-COURT.halfW, Math.min(COURT.halfW, x)), y: Math.max(COURT.baseY, Math.min(COURT.halfLen, y)) };
}

export const ZONES = ['rim', 'paint', 'mid', 'c3l', 'c3r', 'w3l', 'w3r', 'top3'];
export const GROUPS = { rim: ['rim'], paint: ['paint'], mid: ['mid'], corner3: ['c3l', 'c3r'], wing3: ['w3l', 'w3r'], top3: ['top3'] };

// Ζώνη ενός σουτ. Το αν είναι τρίποντο το ορίζει ο επίσημος τύπος του σουτ (όχι η θέση), ώστε να μη διαφωνούμε με το box score.
export function zoneOf(x, y, three) {
  const d = Math.hypot(x, y);
  if (!three) {
    if (d <= COURT.rim) return 'rim';
    if (Math.abs(x) <= COURT.paintW / 2 && y <= COURT.ftY) return 'paint';
    return 'mid';
  }
  if (y <= CORNER_Y + 20 && Math.abs(x) >= COURT.corner - 40) return x < 0 ? 'c3l' : 'c3r';
  const ang = Math.atan2(x, y) * 180 / Math.PI; // 0 = ευθεία μπροστά από το καλάθι
  if (Math.abs(ang) <= 22.5) return 'top3';
  return x < 0 ? 'w3l' : 'w3r';
}

export const ptsOf = s => (s.made ? (s.three ? 3 : 2) : 0);

// Άθροιση ανά ζώνη: FGA, FGM, FG%, πόντοι ανά σουτ, μερίδιο, % assisted
export function zoneStats(shots, zones = ZONES) {
  const tot = shots.length;
  const out = {};
  for (const z of zones) {
    const L = shots.filter(s => s.z === z);
    const fgm = L.filter(s => s.made).length, ast = L.filter(s => s.made && s.ast).length;
    out[z] = { fga: L.length, fgm, fg: L.length ? fgm / L.length : null, pps: L.length ? L.reduce((a, s) => a + ptsOf(s), 0) / L.length : null, share: tot ? L.length / tot : 0, astPct: fgm ? ast / fgm : null };
  }
  return out;
}
export function groupStats(shots) {
  const out = {}, tot = shots.length;
  for (const [g, zs] of Object.entries(GROUPS)) {
    const L = shots.filter(s => zs.includes(s.z)), fgm = L.filter(s => s.made).length, ast = L.filter(s => s.made && s.ast).length;
    out[g] = { fga: L.length, fgm, fg: L.length ? fgm / L.length : null, pps: L.length ? L.reduce((a, s) => a + ptsOf(s), 0) / L.length : null, share: tot ? L.length / tot : 0, astPct: fgm ? ast / fgm : null };
  }
  return out;
}

// Assisted / unassisted (self-created) και αποδοτικότητα ανά τύπο δημιουργίας.
// Μόνο τα εύστοχα σουτ έχουν σήμανση ασίστ στην πηγή, οπότε η αποδοτικότητα «assisted» μετριέται ανά εύστοχο.
export function creation(shots) {
  const made = shots.filter(s => s.made), a = made.filter(s => s.ast), u = made.filter(s => !s.ast);
  const fb = shots.filter(s => s.fb), sc = shots.filter(s => s.sc);
  const eff = L => (L.length ? { fga: L.length, fgm: L.filter(s => s.made).length, fg: L.filter(s => s.made).length / L.length, pps: L.reduce((x, s) => x + ptsOf(s), 0) / L.length } : null);
  return { made: made.length, assisted: a.length, unassisted: u.length, astPct: made.length ? a.length / made.length : null,
    ast3Pct: (() => { const m3 = made.filter(s => s.three); return m3.length ? m3.filter(s => s.ast).length / m3.length : null; })(),
    ptsAssisted: a.reduce((x, s) => x + ptsOf(s), 0), ptsSelf: u.reduce((x, s) => x + ptsOf(s), 0),
    fastbreak: eff(fb), secondChance: eff(sc), halfcourt: eff(shots.filter(s => !s.fb && !s.sc)) };
}

// Ποιοι μοιράζουν τις ασίστ σε έναν παίκτη / δίκτυο ασίστ μιας ομάδας
export function topAssisters(shots, n = 5) {
  const m = {};
  for (const s of shots) if (s.made && s.ast) m[s.ast] = (m[s.ast] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, c]) => ({ id, n: c }));
}
export function assistNetwork(shots) {
  const m = {};
  for (const s of shots) if (s.made && s.ast) { const k = s.ast + '>' + s.pid; m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).map(([k, n]) => { const [from, to] = k.split('>'); return { from, to, n }; }).sort((a, b) => b.n - a.n);
}

// Αμυντικό προφίλ: σουτ των αντιπάλων όσο ο παίκτης (ή όλη η ομάδα) είναι στο παρκέ
export function defensiveShots(oppShots, pid = null) {
  return pid ? oppShots.filter(s => s.def && s.def.includes(pid)) : oppShots;
}
export function defensiveProfile(oppShots, league) {
  const g = groupStats(oppShots), all = oppShots.length;
  const rim = g.rim, three = oppShots.filter(s => s.three);
  const out = {
    fga: all, pps: all ? oppShots.reduce((a, s) => a + ptsOf(s), 0) / all : null, zones: g,
    rim: { freq: rim.share, fg: rim.fg }, three: { freq: all ? three.length / all : 0, fg: three.length ? three.filter(s => s.made).length / three.length : null },
  };
  if (league) out.vsLeague = Object.fromEntries(Object.keys(GROUPS).map(k => [k, g[k].fg != null && league[k]?.fg != null ? g[k].fg - league[k].fg : null]));
  return out;
}

// Hot / cold: διαφορά FG% από τον μέσο όρο της λίγκας, σε κλίμακα χρωμάτων (μπλε → γκρι → κόκκινο)
export function heat(fg, avg, n, minN = 5) {
  if (fg == null || avg == null || n < minN) return null;
  return Math.max(-1, Math.min(1, (fg - avg) / 0.12));
}

export function percentile(values, v) {
  const xs = values.filter(x => x != null);
  if (v == null || xs.length < 2) return null;
  return Math.round(100 * xs.filter(x => x < v).length / (xs.length - 1));
}

// Περιγραφή στα ελληνικά/αγγλικά κ.λπ. (π.χ. «σουτάρει 42% από τα wings…»)
export function describe(g, cr, T) {
  const pc = v => Math.round(100 * v) + '%';
  const parts = [];
  const z3 = [['wing3', T('από τα wings', 'from the wings', 'desde los laterales', 'sa krila')], ['top3', T('από το top of the key', 'from the top of the key', 'desde el frontal', 'sa vrha')], ['corner3', T('από τις γωνίες', 'from the corners', 'desde las esquinas', 'iz uglova')]]
    .filter(([k]) => g[k].fga >= 5).map(([k, t]) => [g[k].fg, t]);
  if (z3.length >= 2) {
    const s = z3.sort((a, b) => b[0] - a[0]), last = s[s.length - 1];
    parts.push(T(`Σουτάρει ${s.slice(0, -1).map(([v, t]) => `${pc(v)} ${t}`).join(' και ')}, αλλά ${pc(last[0])} ${last[1]}.`,
      `Shoots ${s.slice(0, -1).map(([v, t]) => `${pc(v)} ${t}`).join(' and ')}, but ${pc(last[0])} ${last[1]}.`,
      `Tira con un ${s.slice(0, -1).map(([v, t]) => `${pc(v)} ${t}`).join(' y un ')}, pero un ${pc(last[0])} ${last[1]}.`,
      `Šutira ${s.slice(0, -1).map(([v, t]) => `${pc(v)} ${t}`).join(' i ')}, ali ${pc(last[0])} ${last[1]}.`));
  } else if (g.rim.fga >= 5) {
    parts.push(T(`Στο καλάθι (rim) σουτάρει ${pc(g.rim.fg)} σε ${g.rim.fga} προσπάθειες.`, `At the rim he shoots ${pc(g.rim.fg)} on ${g.rim.fga} attempts.`, `En el aro tira con un ${pc(g.rim.fg)} en ${g.rim.fga} intentos.`, `Ispod koša šutira ${pc(g.rim.fg)} iz ${g.rim.fga} pokušaja.`));
  }
  if (cr.ast3Pct != null) parts.push(T(`Το ${pc(cr.ast3Pct)} των εύστοχων τριπόντων του είναι assisted.`, `${pc(cr.ast3Pct)} of his made threes are assisted.`, `El ${pc(cr.ast3Pct)} de sus triples anotados son asistidos.`, `${pc(cr.ast3Pct)} njegovih pogođenih trojki je posle asistencije.`));
  return parts.join(' ');
}
