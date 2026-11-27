// NBA: ανάγνωση του δημόσιου API του ESPN (site.api.espn.com). Καθαρές συναρτήσεις χωρίς εξαρτήσεις.
//   πρόγραμμα/αποτελέσματα μιας μέρας: /apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD (διαστήματα: HTTP 400)
//   αγώνας (box score + play-by-play με θέσεις σουτ): /apis/site/v2/sports/basketball/nba/summary?event=<id>
// Το επίσημο cdn.nba.com απαντά 403 σε αυτοματοποιημένα αιτήματα, οπότε δεν το χρησιμοποιούμε.
export const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
export const scoreboardUrl = day => `${BASE}/scoreboard?dates=${day}`;
export const summaryUrl = id => `${BASE}/summary?event=${id}`;
/** σεζόν ESPN (έτος λήξης) → δικό μας κλειδί: 2027 → N2026 (σεζόν 2026-27) */
export const seasonKey = espnYear => `N${espnYear - 1}`;

const team = c => ({ id: c.id, abbr: c.team?.abbreviation, name: c.team?.displayName, score: c.score != null && c.score !== '' ? +c.score : null });

/** scoreboard → [{ id, date, year, type (1 προετοιμασία, 2 κανονική, 3 playoffs, 5 play-in), status, played, neutral, home, away }] */
export function parseScoreboard(j) {
  return (j?.events || []).map(e => {
    const c = e.competitions?.[0] || {}, cs = c.competitors || [];
    const h = cs.find(x => x.homeAway === 'home'), a = cs.find(x => x.homeAway === 'away');
    const st = e.status?.type || c.status?.type || {};
    return { id: e.id, date: e.date, year: e.season?.year, type: e.season?.type, status: st.name, played: !!st.completed, neutral: !!c.neutralSite,
      home: h ? team(h) : null, away: a ? team(a) : null };
  }).filter(g => g.home && g.away);
}

const pair = s => { const m = /^(\d+)-(\d+)$/.exec(String(s || '')); return m ? [+m[1], +m[2]] : [0, 0]; };
const num = s => (/^[+-]?\d+$/.test(String(s)) ? +s : 0);
const clockSec = s => { const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(String(s || '')); return m ? Math.round(+m[1] * 60 + +m[2]) : (/^\d+(\.\d+)?$/.test(String(s)) ? Math.round(+s) : 0); };

/** γραμμή box score με τη σειρά των keys του ESPN */
function line(keys, vals) {
  const v = k => vals[keys.indexOf(k)];
  const [fgm, fga] = pair(v('fieldGoalsMade-fieldGoalsAttempted')), [f3m, f3a] = pair(v('threePointFieldGoalsMade-threePointFieldGoalsAttempted')), [ftm, fta] = pair(v('freeThrowsMade-freeThrowsAttempted'));
  return { min: num(v('minutes')), pts: num(v('points')), fgm, fga, f3m, f3a, ftm, fta, reb: num(v('rebounds')), oreb: num(v('offensiveRebounds')), dreb: num(v('defensiveRebounds')),
    ast: num(v('assists')), tov: num(v('turnovers')), stl: num(v('steals')), blk: num(v('blocks')), pf: num(v('fouls')), pm: num(v('plusMinus')) };
}

/**
 * summary → { id, date, home, away, hs, as, teams: [{ id, abbr, players, totals }], shots }
 * shots: [περίοδος, δευτ. που απομένουν, ομάδα, σουτέρ, ασίστ|null, x, y, εύστοχο 0/1, πόντοι 2/3, τύπος]
 * (οι βολές δεν μπαίνουν: δεν έχουν θέση). Πρώτη ομάδα = γηπεδούχος.
 */
export function parseSummary(j) {
  const c = j?.header?.competitions?.[0] || {}, cs = c.competitors || [];
  const H = cs.find(x => x.homeAway === 'home'), A = cs.find(x => x.homeAway === 'away');
  if (!H || !A) return null;
  const teams = [H, A].map(t => {
    const bp = (j.boxscore?.players || []).find(x => x.team?.id === t.id);
    const st = bp?.statistics?.[0] || {}, keys = st.keys || [];
    const players = (st.athletes || []).map(a => ({ id: a.athlete?.id, name: a.athlete?.displayName, pos: a.athlete?.position?.abbreviation || null, starter: !!a.starter,
      dnp: !!a.didNotPlay, reason: a.didNotPlay ? a.reason || null : null, ...(a.didNotPlay || !a.stats?.length ? {} : line(keys, a.stats)) }));
    return { id: t.id, abbr: t.team?.abbreviation, players, totals: st.totals?.length ? line(keys, st.totals) : null };
  });
  const shots = [];
  for (const p of j.plays || []) {
    if (!p.shootingPlay || !(p.pointsAttempted >= 2)) continue;
    const x = p.coordinate?.x, y = p.coordinate?.y;
    if (!(Math.abs(x) < 1000 && Math.abs(y) < 1000)) continue;
    const pa = p.participants || [];
    shots.push([p.period?.number || 0, clockSec(p.clock?.displayValue), p.team?.id || null, pa[0]?.athlete?.id || null, p.scoringPlay && pa[1] ? pa[1].athlete?.id || null : null,
      x, y, p.scoringPlay ? 1 : 0, p.pointsAttempted, +p.type?.id || 0]);
  }
  return { id: j.header?.id || c.id, date: c.date, neutral: !!c.neutralSite, home: team(H), away: team(A), hs: +H.score, as: +A.score, teams, shots };
}

/** έλεγχος: πόντοι παικτών = σύνολο ομάδας = σκορ, και εύστοχα σουτ από το play-by-play ≈ εύστοχα του box score */
export function checkSummary(s) {
  const errs = [];
  if (!s || s.teams.length !== 2) return ['λείπουν ομάδες'];
  s.teams.forEach((t, i) => {
    const sum = t.players.reduce((a, p) => a + (p.pts || 0), 0), score = i === 0 ? s.hs : s.as;
    if (sum !== score) errs.push(`${t.abbr}: πόντοι παικτών ${sum} ≠ σκορ ${score}`);
    if (t.totals && t.totals.pts !== score) errs.push(`${t.abbr}: σύνολο ${t.totals.pts} ≠ σκορ ${score}`);
  });
  return errs;
}
