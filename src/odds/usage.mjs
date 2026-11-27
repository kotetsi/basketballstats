// Συμπαίκτες εκτός → ανακατανομή ρυθμού (usage). Τα λεπτά τα καλύπτει ήδη το μοντέλο λεπτών (team_missing_min).
// Εδώ: όταν λείπει ένας βασικός, πόσο ανεβαίνουν οι πόντοι/ριμπάουντ/ασίστ/τρίποντα ΑΝΑ ΛΕΠΤΟ των υπολοίπων.
//   miss_s = Σ (μέσος όρος s ανά αγώνα των απόντων) / (μέσος όρος s ανά αγώνα της ομάδας)
//   ρυθμός_νέος = ρυθμός × (1 + k_s × miss_s), k_s από προηγούμενες σεζόν (walk-forward: ποτέ από τη σεζόν-στόχο)
// «Απών» (γνωστό πριν από τον αγώνα): βασικός (≥ 15' μέσο, ≥ 3 αγώνες) που δεν έπαιξε στον προηγούμενο αγώνα της ομάδας.
import { STATS } from './props.mjs';

export const USAGE_KEYS = ['pts', 'reb', 'ast', 'fg3'];
const REG_MIN = 15, REG_GAMES = 3;

/** δείκτης ομάδας: team → round → [{c, row}] (row μόνο αν έπαιξε) και team → ταξινομημένες αγωνιστικές */
export function teamIndex(players, games) {
  const opp = new Map();   // round|opp → team
  for (const g of games) { opp.set(`${g[0]}|${g[3]}`, g[2]); opp.set(`${g[0]}|${g[2]}`, g[3]); }
  const T = new Map(), rounds = new Map();
  for (const g of games) for (const t of [g[2], g[3]]) (rounds.get(t) || rounds.set(t, new Set()).get(t)).add(g[0]);
  for (const p of players) for (const r of p.g || []) {
    const t = opp.get(`${r[0]}|${r[2]}`); if (!t) continue;
    const m = T.get(t) || T.set(t, new Map()).get(t); (m.get(r[0]) || m.set(r[0], []).get(r[0])).push({ c: p.c, row: r });
  }
  return { T, rounds: new Map([...rounds].map(([t, s]) => [t, [...s].sort((a, b) => a - b)])) };
}

/** για ομάδα t πριν από την αγωνιστική R: ρυθμοί ανά παίκτη, σύνολα ομάδας, απόντες (γνωστό πριν) */
export function teamState(ix, t, R, { actual = false } = {}) {
  const byR = ix.T.get(t), rs = (ix.rounds.get(t) || []).filter(r => r < R);
  if (!byR || !rs.length) return null;
  const P = new Map(), tot = Object.fromEntries(USAGE_KEYS.map(s => [s, 0]));
  for (const r of rs) for (const { c, row } of byR.get(r) || []) {
    if (!(row[7] > 0)) continue;
    const o = P.get(c) || P.set(c, { c, n: 0, min: 0, x: Object.fromEntries(USAGE_KEYS.map(s => [s, 0])) }).get(c);
    o.n++; o.min += row[7] / 60; for (const s of USAGE_KEYS) { o.x[s] += STATS[s](row); tot[s] += STATS[s](row); }
  }
  const G = rs.length, last = rs.at(-1);
  const played = new Set((byR.get(actual ? R : last) || []).filter(x => x.row[7] > 0).map(x => x.c));
  const absent = [...P.values()].filter(o => o.n >= REG_GAMES && o.min / o.n >= REG_MIN && !played.has(o.c)).map(o => o.c);
  const miss = Object.fromEntries(USAGE_KEYS.map(s => [s, tot[s] > 0 ? absent.reduce((a, c) => a + P.get(c).x[s] / G, 0) / (tot[s] / G) : 0]));
  return { P, absent, miss, G };
}

/** k_s με ελάχιστα τετράγωνα σε y = b·(1 + c + k·miss), b = ρυθμός πριν × λεπτά αγώνα. Σεζόν: [{players, games}] */
export function fitUsage(seasons, { minGames = 5 } = {}) {
  const acc = Object.fromEntries(USAGE_KEYS.map(s => [s, { n: 0, Sbb: 0, Sbbm: 0, Sbbmm: 0, Syb: 0, Sybm: 0, withMiss: 0 }]));
  for (const { players, games } of seasons) {
    const ix = teamIndex(players, games);
    for (const [t, rs] of ix.rounds) for (const R of rs) {
      const st = teamState(ix, t, R); if (!st) continue;
      for (const { c, row } of ix.T.get(t)?.get(R) || []) {
        const o = st.P.get(c); if (!o || o.n < minGames || !(row[7] / 60 >= 10) || st.absent.includes(c)) continue;
        for (const s of USAGE_KEYS) {
          const b = o.x[s] / o.min * row[7] / 60, m = st.miss[s], y = STATS[s](row), a = acc[s];
          a.n++; a.Sbb += b * b; a.Sbbm += b * b * m; a.Sbbmm += b * b * m * m; a.Syb += (y - b) * b; a.Sybm += (y - b) * b * m; if (m > 0) a.withMiss++;
        }
      }
    }
  }
  const out = {};
  for (const s of USAGE_KEYS) { const a = acc[s], det = a.Sbb * a.Sbbmm - a.Sbbm ** 2;
    const k = det > 0 ? (a.Sbb * a.Sybm - a.Sbbm * a.Syb) / det : 0;
    out[s] = { k: +k.toFixed(3), n: a.n, with_miss: a.withMiss }; }
  return out;
}

// Αντίπαλος ανά θέση: πόσα δίνει η ομάδα-αντίπαλος ανά λεπτό σε G/F/C έναντι της λίγκας, μόνο από αγώνες < R.
//   f = (X + K·lg) / (M·lg + K·lg)  (συρρίκνωση προς 1 με K ψευδο-λεπτά), ρυθμός_νέος = ρυθμός × (1 + β_s·(f − 1))
export const posG = pos => { const q = String(pos || '').toLowerCase(); return q.startsWith('g') ? 'G' : q.startsWith('c') ? 'C' : 'F'; };
const OPP_K = 300;
export function oppIndex(players, games) {
  const opp = new Map(); for (const g of games) { opp.set(`${g[0]}|${g[3]}`, g[2]); opp.set(`${g[0]}|${g[2]}`, g[3]); }
  const A = new Map(), L = new Map();   // opp|pos → round → {m, x}, pos → round → {m, x}
  const add = (M, k, R, row) => { const byR = M.get(k) || M.set(k, new Map()).get(k), o = byR.get(R) || byR.set(R, { m: 0, x: Object.fromEntries(USAGE_KEYS.map(s => [s, 0])) }).get(R);
    o.m += row[7] / 60; for (const s of USAGE_KEYS) o.x[s] += STATS[s](row); };
  for (const p of players) { const g = posG(p.pos); for (const r of p.g || []) if (r[7] > 0) { add(A, `${r[2]}|${g}`, r[0], r); add(L, g, r[0], r); } }
  const sumBefore = (byR, R) => { const o = { m: 0, x: Object.fromEntries(USAGE_KEYS.map(s => [s, 0])) }; for (const [r, v] of byR || []) if (r < R) { o.m += v.m; for (const s of USAGE_KEYS) o.x[s] += v.x[s]; } return o; };
  const memo = new Map();
  return { opp, factor(o, pos, R, s) {
    const k = `${o}|${pos}|${R}`; if (!memo.has(k)) { const a = sumBefore(A.get(`${o}|${pos}`), R), l = sumBefore(L.get(pos), R);
      memo.set(k, Object.fromEntries(USAGE_KEYS.map(s => { const lg = l.m ? l.x[s] / l.m : 0; return [s, lg > 0 ? (a.x[s] + OPP_K * lg) / (a.m * lg + OPP_K * lg) : 1]; }))); }
    return memo.get(k)[s]; } };
}

/** β_s με ελάχιστα τετράγωνα σε y = b·(1 + c + β·(f − 1)), b = ρυθμός του παίκτη πριν × λεπτά αγώνα */
export function fitOpp(seasons, { minGames = 5, minRound = 4 } = {}) {
  const acc = Object.fromEntries(USAGE_KEYS.map(s => [s, { n: 0, Sbb: 0, Sbbm: 0, Sbbmm: 0, Syb: 0, Sybm: 0 }]));
  for (const { players, games } of seasons) {
    const ox = oppIndex(players, games);
    for (const p of players) {
      const pl = (p.g || []).filter(r => r[7] > 0).sort((a, b) => a[0] - b[0]), g = posG(p.pos);
      const cum = { m: 0, x: Object.fromEntries(USAGE_KEYS.map(s => [s, 0])) }; let n = 0;
      for (const r of pl) {
        if (n >= minGames && r[0] >= minRound && r[7] / 60 >= 10) for (const s of USAGE_KEYS) {
          const b = cum.x[s] / cum.m * r[7] / 60, m = ox.factor(r[2], g, r[0], s) - 1, y = STATS[s](r), a = acc[s];
          a.n++; a.Sbb += b * b; a.Sbbm += b * b * m; a.Sbbmm += b * b * m * m; a.Syb += (y - b) * b; a.Sybm += (y - b) * b * m;
        }
        n++; cum.m += r[7] / 60; for (const s of USAGE_KEYS) cum.x[s] += STATS[s](r);
      }
    }
  }
  const out = {};
  for (const s of USAGE_KEYS) { const a = acc[s], det = a.Sbb * a.Sbbmm - a.Sbbm ** 2; out[s] = { beta: +(det > 0 ? (a.Sbb * a.Sybm - a.Sbbm * a.Syb) / det : 0).toFixed(3), n: a.n }; }
  return out;
}

/** συνολικός πολλαπλασιαστής ρυθμού για (παίκτης, ομάδα, αντίπαλος, αγωνιστική, στατιστικό) */
export function contextFactor({ ix, ox, K, B }, { c, pos, team, opp, R, s }) {
  let f = 1;
  if (ix && K) { const st = teamState(ix, team, R); if (st && !st.absent.includes(c)) f *= 1 + K[s].k * st.miss[s]; }
  if (ox && B && opp) f *= 1 + B[s].beta * (ox.factor(opp, posG(pos), R, s) - 1);
  return Math.min(1.35, Math.max(0.75, f));
}

// Ρυθμός και «κατοστάρα» από τα σκορ των αγώνων < R (games: [round, date, home, away, hs, as, played]).
//   pace = (μέσο σύνολο πόντων στους αγώνες της ομάδας + του αντιπάλου) / (2 × μέσο σύνολο λίγκας), συρρίκνωση με PACE_N αγώνες
//   αναμενόμενη διαφορά = (μέση διαφορά ομάδας − αντιπάλου)/2 ± HOME/2, συρρίκνωση με MARGIN_N αγώνες
//   ρυθμός_νέος = ρυθμός × (1 + βp·(pace − 1)) · λεπτά_νέα = λεπτά × (1 + γ·|διαφορά|/10) μόνο για βασικούς (≥ 25')
const PACE_N = 4, MARGIN_N = 3, HOME = 3, STARTER_MIN = 25;
export function gameIndex(games) {
  const T = new Map(); const add = (t, R, tot, mar) => (T.get(t) || T.set(t, []).get(t)).push([R, tot, mar]);
  for (const g of games) if (g[6] && g[4] != null) { add(g[2], g[0], g[4] + g[5], g[4] - g[5] - HOME); add(g[3], g[0], g[4] + g[5], g[5] - g[4] + HOME); }
  const memo = new Map();
  const stat = (t, R) => { const k = `${t}|${R}`; if (!memo.has(k)) { const L = (T.get(t) || []).filter(x => x[0] < R);
    memo.set(k, { n: L.length, tot: L.reduce((a, x) => a + x[1], 0), mar: L.reduce((a, x) => a + x[2], 0) }); } return memo.get(k); };
  const lgMemo = new Map();
  const league = R => { if (!lgMemo.has(R)) { const L = games.filter(g => g[6] && g[4] != null && g[0] < R); lgMemo.set(R, L.length ? L.reduce((a, g) => a + g[4] + g[5], 0) / L.length : null); } return lgMemo.get(R); };
  return {
    pace(t, o, R) { const lg = league(R); if (!lg) return 1; const a = stat(t, R), b = stat(o, R);
      return ((a.tot + PACE_N * lg) / (a.n + PACE_N) + (b.tot + PACE_N * lg) / (b.n + PACE_N)) / (2 * lg); },
    margin(t, o, R, home) { const a = stat(t, R), b = stat(o, R);
      return (a.mar / (a.n + MARGIN_N) - b.mar / (b.n + MARGIN_N)) / 2 + (home ? HOME / 2 : -HOME / 2); },
  };
}

/** βp (ρυθμός, ανά στατιστικό) και γ (λεπτά βασικών ανά 10 πόντους αναμενόμενης διαφοράς) από προηγούμενες σεζόν */
export function fitPaceBlowout(seasons, { minGames = 5, minRound = 4, oppB = null } = {}) {
  const acc = Object.fromEntries([...USAGE_KEYS, 'min'].map(s => [s, { n: 0, Sbb: 0, Sbbm: 0, Sbbmm: 0, Syb: 0, Sybm: 0 }]));
  const push = (a, b, m, y) => { a.n++; a.Sbb += b * b; a.Sbbm += b * b * m; a.Sbbmm += b * b * m * m; a.Syb += (y - b) * b; a.Sybm += (y - b) * b * m; };
  for (const { players, games } of seasons) {
    const gx = gameIndex(games), side = new Map(), ox = oppB ? oppIndex(players, games) : null;
    for (const g of games) { side.set(`${g[0]}|${g[3]}`, [g[2], true]); side.set(`${g[0]}|${g[2]}`, [g[3], false]); }
    for (const p of players) {
      const pl = (p.g || []).filter(r => r[7] > 0).sort((a, b) => a[0] - b[0]);
      const cum = { n: 0, m: 0, x: Object.fromEntries(USAGE_KEYS.map(s => [s, 0])) };
      for (const r of pl) {
        const sd = side.get(`${r[0]}|${r[2]}`);
        if (sd && cum.n >= minGames && r[0] >= minRound) {
          const [t, home] = sd, pace = gx.pace(t, r[2], r[0]) - 1, avgMin = cum.m / cum.n;
          if (r[7] / 60 >= 10) for (const s of USAGE_KEYS) push(acc[s], cum.x[s] / cum.m * r[7] / 60 * (ox ? 1 + oppB[s].beta * (ox.factor(r[2], posG(p.pos), r[0], s) - 1) : 1), pace, STATS[s](r));
          if (avgMin >= STARTER_MIN) push(acc.min, avgMin, Math.abs(gx.margin(t, r[2], r[0], home)) / 10, r[7] / 60);
        }
        cum.n++; cum.m += r[7] / 60; for (const s of USAGE_KEYS) cum.x[s] += STATS[s](r);
      }
    }
  }
  const out = {};
  for (const [s, a] of Object.entries(acc)) { const det = a.Sbb * a.Sbbmm - a.Sbbm ** 2; out[s] = { coef: +(det > 0 ? (a.Sbb * a.Sybm - a.Sbbm * a.Syb) / det : 0).toFixed(3), n: a.n }; }
  return out;
}

/** πολλαπλασιαστής ρυθμού × λεπτών από ρυθμό αγώνα και «κατοστάρα» (avgMin: μέσα λεπτά του παίκτη ως τώρα) */
export function paceBlowFactor({ gx, PB }, { team, opp, R, s, home, avgMin }) {
  if (!gx || !PB || !team || !opp) return 1;
  let f = 1 + PB[s].coef * (gx.pace(team, opp, R) - 1);
  if (avgMin >= STARTER_MIN) f *= 1 + PB.min.coef * Math.abs(gx.margin(team, opp, R, home)) / 10;
  return f;
}
