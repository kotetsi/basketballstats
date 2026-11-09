// Σύγκριση ομάδων: metrics ανά split (σύνολο, εντός, εκτός, τελευταίοι 5/10) από τα επίσημα box scores κάθε αγώνα.
// Ίδιοι τύποι με τη σελίδα Team Analytics (src/analytics/metrics.mjs): κατοχές FGA − OREB + TOV + 0.44·FTA, ratings ανά 100 κατοχές.
// Τρέχει στο build (server-side aggregation)· ο browser παίρνει έτοιμες τιμές.
import { rate, zero, add, I } from '../analytics/metrics.mjs';
import { TEAM_SPLITS } from './catalog.mjs';

const div = (a, b) => (b > 0 ? a / b : null);

/**
 * games: γραμμές του AB.teamGames(C, team) — { home, pf, pa, secs, own:[SK], opp:[SK], r }
 * pirOf(g): PIR της ομάδας σε αυτόν τον αγώνα (άθροισμα παικτών) ή null αν δεν υπάρχει
 */
export function teamSplitMetrics(games, pirOf = null) {
  const own = zero(), opp = zero(); let secs = 0;
  for (const g of games) { add(own, g.own || []); add(opp, g.opp || []); secs += g.secs || 2400; }
  const n = games.length;
  if (!n) return null;
  const r = rate(own, opp, secs);
  const w = games.filter(g => g.pf > g.pa).length;
  const pfpg = games.reduce((a, g) => a + g.pf, 0) / n, papg = games.reduce((a, g) => a + g.pa, 0) / n;
  const pirs = pirOf ? games.map(pirOf) : [];
  return {
    gp: n, w, l: n - w, wpct: w / n, pfpg, papg, diff: pfpg - papg,
    ortg: r.ortg, drtg: r.drtg, net: r.net, pace: r.pace,
    rpg: (own[I.oreb] + own[I.dreb]) / n, apg: own[I.ast] / n, tovpg: own[I.tov] / n, stlpg: own[I.stl] / n, blkpg: own[I.blk] / n,
    p2: div(own[I.fgm2], own[I.fga2]), p3: div(own[I.fgm3], own[I.fga3]), ft: div(own[I.ftm], own[I.fta]),
    efg: r.efg, ts: r.ts, astto: div(own[I.ast], own[I.tov]),
    // PIR ομάδας μόνο αν υπάρχει για όλους τους αγώνες του δείγματος (αλλιώς ο μέσος όρος θα ήταν παραπλανητικός)
    pir: pirs.length && pirs.every(x => x != null) ? pirs.reduce((a, b) => a + b, 0) / n : null,
    oreb: r.oreb, dreb: r.dreb, ftr: r.ftr, oefg: r.oefg, otov: r.otov,
  };
}

/** όλα τα splits μιας ομάδας· games με χρονολογική σειρά */
export function teamSplits(games, pirOf = null) {
  const by = { all: games, home: games.filter(g => g.home), away: games.filter(g => !g.home), l5: games.slice(-5), l10: games.slice(-10) };
  return Object.fromEntries(TEAM_SPLITS.map(s => [s, teamSplitMetrics(by[s], pirOf)]));
}

const r4 = v => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10000) / 10000);
export const roundMetrics = m => (m ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'number' ? r4(v) : v])) : null);
