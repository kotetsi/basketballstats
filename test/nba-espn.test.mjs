// NBA: ανάγνωση του API του ESPN (src/nba/espn.mjs), με δείγμα στη μορφή που απαντά (Heat–76ers, 25/11/2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScoreboard, parseSummary, checkSummary, seasonKey } from '../src/nba/espn.mjs';

const KEYS = ['minutes', 'points', 'fieldGoalsMade-fieldGoalsAttempted', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'freeThrowsMade-freeThrowsAttempted', 'rebounds', 'assists', 'turnovers', 'steals', 'blocks', 'offensiveRebounds', 'defensiveRebounds', 'fouls', 'plusMinus'];
const comp = (hs, as) => [{ homeAway: 'home', id: '20', score: String(hs), team: { abbreviation: 'PHI', displayName: 'Philadelphia 76ers' } }, { homeAway: 'away', id: '14', score: String(as), team: { abbreviation: 'MIA', displayName: 'Miami Heat' } }];
const ath = (id, name, stats, extra = {}) => ({ athlete: { id, displayName: name, position: { abbreviation: 'F' } }, starter: true, didNotPlay: false, stats, ...extra });
const summary = {
  header: { id: '401909317', competitions: [{ date: '2026-11-25T22:00Z', neutralSite: false, competitors: comp(6, 34) }] },
  boxscore: { players: [
    { team: { id: '20' }, statistics: [{ keys: KEYS, totals: ['', '6', '2-4', '1-2', '1-2', '3', '2', '0', '0', '0', '1', '2', '1', ''], athletes: [ath('1966', 'LeBron James', ['30', '6', '2-4', '1-2', '1-2', '3', '2', '0', '0', '0', '1', '2', '1', '+7'])] }] },
    { team: { id: '14' }, statistics: [{ keys: KEYS, totals: ['', '34', '12-20', '0-2', '10-13', '15', '6', '5', '2', '1', '1', '14', '3', ''], athletes: [
      ath('3032977', 'Giannis Antetokounmpo', ['36', '32', '11-18', '0-1', '10-13', '14', '4', '5', '2', '1', '1', '13', '3', '+4']),
      ath('4278053', 'Davion Mitchell', ['20', '2', '1-2', '0-1', '0-0', '1', '2', '0', '0', '0', '0', '1', '0', '-2']),
      { athlete: { id: '9', displayName: 'Nikola Jovic' }, didNotPlay: true, reason: "COACH'S DECISION", stats: [] }] }] }] },
  plays: [
    { shootingPlay: true, scoringPlay: true, pointsAttempted: 2, scoreValue: 2, period: { number: 1 }, clock: { displayValue: '11:14' }, team: { id: '14' }, coordinate: { x: 23, y: 1 }, type: { id: '110' }, participants: [{ athlete: { id: '3032977' } }, { athlete: { id: '4278053' } }] },
    { shootingPlay: true, scoringPlay: false, pointsAttempted: 3, scoreValue: 0, period: { number: 2 }, clock: { displayValue: '0:04.5' }, team: { id: '14' }, coordinate: { x: 2, y: 25 }, type: { id: '92' }, participants: [{ athlete: { id: '3032977' } }] },
    { shootingPlay: true, scoringPlay: true, pointsAttempted: 1, scoreValue: 1, period: { number: 1 }, clock: { displayValue: '4:48' }, team: { id: '20' }, coordinate: { x: -214748340, y: -214748365 }, type: { id: '98' }, participants: [{ athlete: { id: '1966' } }] },
    { shootingPlay: false, period: { number: 1 }, clock: { displayValue: '12:00' }, coordinate: { x: -214748340, y: -214748365 }, type: { id: '615' } },
  ],
};

test('σεζόν: ESPN 2027 = 2026-27', () => assert.equal(seasonKey(2027), 'N2026'));

test('πρόγραμμα: γηπεδούχος/φιλοξενούμενος, τελειωμένος ή όχι', () => {
  const sb = { events: [
    { id: '1', date: '2026-11-25T22:00Z', season: { year: 2027, type: 2 }, status: { type: { name: 'STATUS_FINAL', completed: true } }, competitions: [{ competitors: comp(111, 104) }] },
    { id: '2', date: '2026-12-01T00:30Z', season: { year: 2027, type: 2 }, status: { type: { name: 'STATUS_SCHEDULED', completed: false } }, competitions: [{ competitors: comp('', '') }] }] };
  const g = parseScoreboard(sb);
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].home.abbr, g[0].away.abbr, g[0].home.score, g[0].played], ['PHI', 'MIA', 111, true]);
  assert.equal(g[1].played, false); assert.equal(g[1].home.score, null);
});

test('αγώνας: box score, όποιος δεν έπαιξε, σουτ με θέση και ασίστ, όχι βολές', () => {
  const s = parseSummary(summary);
  assert.equal(s.teams[0].abbr, 'PHI');
  const g = s.teams[1].players[0];
  assert.deepEqual([g.name, g.min, g.pts, g.fgm, g.fga, g.ftm, g.fta, g.reb, g.oreb, g.ast, g.pm], ['Giannis Antetokounmpo', 36, 32, 11, 18, 10, 13, 14, 1, 4, 4]);
  assert.equal(s.teams[1].players[2].dnp, true);
  assert.equal(s.shots.length, 2);                                   // η βολή και το jump ball δεν μπαίνουν
  assert.deepEqual(s.shots[0], [1, 674, '14', '3032977', '4278053', 23, 1, 1, 2, 110]);
  assert.deepEqual(s.shots[1].slice(0, 5), [2, 5, '14', '3032977', null]);   // άστοχο: χωρίς ασίστ
  assert.deepEqual(checkSummary(s), []);
  assert.match(checkSummary({ ...s, as: 40 })[0], /MIA/);
});
