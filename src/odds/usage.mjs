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
