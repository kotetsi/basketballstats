// Φόρτωση των επεξεργασμένων αγώνων (data/pbp/<σεζόν>/*.json) και υπολογισμοί για το build.
import fs from 'node:fs/promises';
import path from 'node:path';
import { rate, zero, add, sum, rated, onOff, groupLineups, percentile, rank } from './metrics.mjs';

const pc = id => String(id || '').replace(/^P/, ''); // "P004194" → "004194" (κωδικός στο cache)

export async function loadComp(ROOT, code) {
  const dir = path.join(ROOT, 'data', 'pbp', code);
  let files = [];
  try { files = (await fs.readdir(dir)).filter(f => f.endsWith('.json')); } catch { return null; }
  const raw = [];
  for (const f of files) { try { raw.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'))); } catch { /* χαλασμένο αρχείο */ } }
  if (!raw.length) return null;
  raw.sort((a, b) => String(a.d || '').localeCompare(String(b.d || '')) || a.gc - b.gc);
  const games = [], byTeam = {}, names = {};
  raw.forEach((g, gi) => {
    games.push({ gc: g.gc, r: g.r, d: g.d, ph: g.ph || 'RS', h: g.h, a: g.a, hs: g.hs, as: g.as, secs: g.secs, coach: g.coach || {}, box: g.box, ok: g.chk?.ok !== false });
    for (const [id, v] of Object.entries(g.pl || {})) names[pc(id)] = v[0];
    for (const tm of [g.h, g.a]) {
      const T = (byTeam[tm] ||= { stints: [], games: [] });
      T.games.push(gi);
      if (g.chk && g.chk.ok === false && g.chk.lostSecs > 300) continue; // πολύ ελλιπές play-by-play: μόνο box score
      for (const [p, s, c, own, opp] of g.st?.[tm] || []) {
        if (p.length !== 5 || p.some(i => i < 0)) continue;
        T.stints.push({ g: gi, p: p.map(i => pc(g.ids[i])), s, c, own, opp });
      }
    }
  });
  return { code, games, byTeam, names };
}

// Ομαδικά στατιστικά ανά αγώνα από τα box scores (όλοι οι αγώνες, ανεξάρτητα από την ποιότητα του play-by-play)
export function teamGames(C, tm) {
  return C.games.filter(g => g.h === tm || g.a === tm).map(g => {
    const home = g.h === tm, op = home ? g.a : g.h;
    return { gc: g.gc, r: g.r, d: g.d, ph: g.ph, home, opp: op, pf: home ? g.hs : g.as, pa: home ? g.as : g.hs, secs: g.secs || 2400, own: g.box[tm], opp: g.box[op], coach: g.coach[tm] };
  });
}

export function teamSeason(C, tm, pred = () => true) {
  const gs = teamGames(C, tm).filter(pred);
  const own = zero(), opp = zero(); let secs = 0;
  for (const g of gs) { add(own, g.own); add(opp, g.opp); secs += g.secs; }
  const r = rate(own, opp, secs);
  // pace ανά 40 λεπτά αγώνα (οι παρατάσεις μετρούν στα λεπτά)
  return { ...r, gp: gs.length, w: gs.filter(g => g.pf > g.pa).length, pfpg: gs.length ? gs.reduce((a, g) => a + g.pf, 0) / gs.length : 0, papg: gs.length ? gs.reduce((a, g) => a + g.pa, 0) / gs.length : 0 };
}

export const METRICS = [
  // κλειδί, καλύτερο = ψηλό;
  ['ortg', true], ['drtg', false], ['net', true], ['pace', true], ['ppp', true], ['efg', true], ['ts', true], ['ast', true],
  ['tov', false], ['oreb', true], ['dreb', true], ['reb', true], ['ftr', true],
  ['oefg', false], ['otov', true], ['ooreb', false], ['oftr', false],
];

export function leagueTable(C) {
  const teams = Object.keys(C.byTeam);
  const rows = Object.fromEntries(teams.map(t => [t, teamSeason(C, t)]));
  const avg = {};
  for (const [k] of METRICS) { const xs = teams.map(t => rows[t][k]).filter(x => x != null); avg[k] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
  const pct = {}, rk = {};
  for (const t of teams) {
    pct[t] = {}; rk[t] = {};
    for (const [k, hb] of METRICS) { const xs = teams.map(x => rows[x][k]); pct[t][k] = percentile(xs, rows[t][k], hb); rk[t][k] = rank(xs, rows[t][k], hb); }
  }
  return { teams, rows, avg, pct, rk };
}

// Σύντομη ερμηνεία των Four Factors στα ελληνικά/αγγλικά/ισπανικά/σερβικά
export function interpret(p, T) {
  const good = [], bad = [];
  const F = [
    ['efg', T('εύστοχη στο σουτ', 'efficient shooting', 'tiro eficiente', 'efikasno šutiranje'), T('άστοχη στο σουτ', 'poor shooting', 'tiro poco eficiente', 'slabo šutiranje')],
    ['tov', T('προσέχει την μπάλα', 'protects the ball', 'cuida el balón', 'čuva loptu'), T('χάνει πολλές κατοχές', 'turns the ball over a lot', 'pierde muchos balones', 'gubi mnogo lopti')],
    ['oreb', T('δυνατή στις δεύτερες ευκαιρίες', 'strong on second chances', 'fuerte en segundas oportunidades', 'jaka u drugim šansama'), T('παίρνει λίγα επιθετικά ριμπάουντ', 'few offensive rebounds', 'pocos rebotes ofensivos', 'malo skokova u napadu')],
    ['ftr', T('κερδίζει πολλές βολές', 'gets to the line often', 'va mucho a la línea', 'često ide na liniju'), T('κερδίζει λίγες βολές', 'rarely gets to the line', 'va poco a la línea', 'retko ide na liniju')],
    ['oefg', T('κρατά χαμηλά τα ποσοστά των αντιπάλων', 'holds opponents to poor shooting', 'limita el acierto rival', 'drži protivnike na lošem šutu'), T('αφήνει εύκολα σουτ στους αντιπάλους', 'allows easy shots', 'concede tiros fáciles', 'dozvoljava lake šuteve')],
    ['otov', T('προκαλεί λάθη', 'forces turnovers', 'fuerza pérdidas', 'izaziva izgubljene lopte'), T('προκαλεί λίγα λάθη', 'forces few turnovers', 'fuerza pocas pérdidas', 'izaziva malo grešaka')],
    ['ooreb', T('κλείνει καλά τα ριμπάουντ', 'boxes out well', 'cierra bien el rebote', 'dobro zatvara skok'), T('δίνει δεύτερες ευκαιρίες', 'concedes second chances', 'concede segundas oportunidades', 'daje druge šanse')],
  ];
  for (const [k, g, b] of F) { const v = p[k]; if (v == null) continue; if (v >= 75) good.push([v, g]); else if (v <= 25) bad.push([100 - v, b]); }
  good.sort((a, b) => b[0] - a[0]); bad.sort((a, b) => b[0] - a[0]);
  const G = good.slice(0, 2).map(x => x[1]), Bd = bad.slice(0, 2).map(x => x[1]);
  const and = T(' και ', ' and ', ' y ', ' i ');
  if (G.length && Bd.length) return T(`Η ομάδα είναι ${G.join(and)}, αλλά ${Bd.join(and)}.`, `The team is ${G.join(and)}, but ${Bd.join(and)}.`, `El equipo destaca en ${G.join(and)}, pero ${Bd.join(and)}.`, `Tim je ${G.join(and)}, ali ${Bd.join(and)}.`);
  if (G.length) return T(`Η ομάδα ξεχωρίζει: ${G.join(and)}.`, `Strengths: ${G.join(and)}.`, `Puntos fuertes: ${G.join(and)}.`, `Prednosti: ${G.join(and)}.`);
  if (Bd.length) return T(`Αδυναμίες: ${Bd.join(and)}.`, `Weaknesses: ${Bd.join(and)}.`, `Debilidades: ${Bd.join(and)}.`, `Slabosti: ${Bd.join(and)}.`);
  return T('Η ομάδα κινείται κοντά στον μέσο όρο της λίγκας σε όλους τους Four Factors.', 'The team is close to the league average in all four factors.', 'El equipo está cerca de la media en los cuatro factores.', 'Tim je blizu proseka lige u sva četiri faktora.');
}

// On/off όλων των παικτών μιας διοργάνωσης (για τη σελίδα-πίνακα)
export function allOnOff(C) {
  const out = [];
  for (const [tm, T] of Object.entries(C.byTeam)) {
    const ids = new Set(T.stints.flatMap(x => x.p));
    for (const id of ids) {
      const r = onOff(T.stints, id);
      out.push({ id, t: tm, n: C.names[id] || id, on: r.on, off: r.off, diff: r.diff });
    }
  }
  return out;
}

// Συμπαγής μορφή για το static API (ο browser κάνει τα φίλτρα)
export function teamPack(C, tm) {
  const T = C.byTeam[tm]; if (!T) return null;
  const pids = [...new Set(T.stints.flatMap(x => x.p))];
  const pix = Object.fromEntries(pids.map((id, i) => [id, i]));
  const gis = [...new Set(T.games)];
  const gix = Object.fromEntries(gis.map((g, i) => [g, i]));
  return {
    team: tm, season: C.code,
    players: pids.map(id => [id, C.names[id] || id]),
    games: gis.map(gi => { const g = C.games[gi], home = g.h === tm; return [g.gc, g.r, g.d, home ? g.a : g.h, home ? 1 : 0, g.ph, home ? g.hs : g.as, home ? g.as : g.hs]; }),
    stints: T.stints.map(x => [gix[x.g], x.p.map(id => pix[id]), x.s, x.c, x.own, x.opp]),
  };
}

export { sum, rated, onOff, groupLineups };

// Επικεφαλίδες όλων των αγώνων όλων των σεζόν (για head-to-head και ιστορικό)
export async function loadHeaders(ROOT) {
  const base = path.join(ROOT, 'data', 'pbp'), out = {};
  let dirs = [];
  try { dirs = await fs.readdir(base); } catch { return out; }
  for (const s of dirs) {
    let files = [];
    try { files = (await fs.readdir(path.join(base, s))).filter(f => f.endsWith('.json')); } catch { continue; }
    out[s] = [];
    for (const f of files) {
      try { const g = JSON.parse(await fs.readFile(path.join(base, s, f), 'utf8')); out[s].push({ comp: s[0], season: s, gc: g.gc, d: g.d, h: g.h, a: g.a, hs: g.hs, as: g.as }); } catch { }
    }
  }
  return out;
}
