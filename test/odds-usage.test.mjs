import test from 'node:test';
import assert from 'node:assert/strict';
import { teamIndex, teamState, fitUsage } from '../src/odds/usage.mjs';

// γραμμή: [round, date, opp, , , , , secs, pts, , , fg3, , , , oreb, dreb, ast]
const row = (R, opp, min, pts, reb = 0, ast = 0, fg3 = 0) => { const r = new Array(26).fill(0); r[0] = R; r[2] = opp; r[7] = min * 60; r[8] = pts; r[11] = fg3; r[16] = reb; r[17] = ast; return r; };
const games = [1, 2, 3, 4].map(R => [R, '0', 'AAA', 'BBB', 0, 0, 1]);

test('απών βασικός: δεν έπαιξε στον προηγούμενο αγώνα, μερίδιο από τους μέσους όρους', () => {
  const star = { c: 'S', g: [1, 2, 3].map(R => row(R, 'BBB', 30, 20)) };          // έλειψε στον 4
  const mate = { c: 'M', g: [1, 2, 3, 4].map(R => row(R, 'BBB', 20, 10)) };
  const ix = teamIndex([star, mate], games);
  const st = teamState(ix, 'AAA', 4, {});                   // πριν από τον 4: έπαιξε στον 3 → όχι απών
  assert.deepEqual(st.absent, []);
  const act = teamState(ix, 'AAA', 4, { actual: true });    // στον ίδιο τον 4 λείπει
  assert.deepEqual(act.absent, ['S']);
  assert.ok(Math.abs(act.miss.pts - 20 / 30) < 1e-9);
});

test('fitUsage: k > 0 όταν οι υπόλοιποι σκοράρουν περισσότερο χωρίς τον βασικό', () => {
  const players = [], g = [];
  for (let R = 1; R <= 12; R++) g.push([R, '0', 'AAA', 'BBB', 0, 0, 1]);
  const out = R => R > 6 && R % 2 === 0;                    // λείπει στις 8, 10, 12
  players.push({ c: 'S', g: g.filter(x => !out(x[0])).map(x => row(x[0], 'BBB', 30, 20)) });
  for (const c of ['A', 'B']) players.push({ c, g: g.map(x => row(x[0], 'BBB', 20, out(x[0] - 1) ? 13 : 10)) });   // +30% μετά από απουσία
  const k = fitUsage([{ players, games: g }]);
  assert.ok(k.pts.k > 0.2, JSON.stringify(k.pts));
});

test('αντίπαλος ανά θέση: όποιος δίνει περισσότερα σε γκαρντ έχει f > 1, μόνο από αγώνες πριν', async () => {
  const { oppIndex, contextFactor } = await import('../src/odds/usage.mjs');
  const g = [[1, '0', 'AAA', 'BBB', 0, 0, 1], [1, '0', 'CCC', 'DDD', 0, 0, 1], [2, '0', 'AAA', 'DDD', 0, 0, 1]];
  const players = [
    { c: 'G1', pos: 'Guard', g: [row(1, 'BBB', 30, 30), row(2, 'DDD', 30, 10)] },   // ο BBB έδωσε πολλά σε γκαρντ
    { c: 'G2', pos: 'Guard', g: [row(1, 'DDD', 30, 10)] },
  ];
  const ox = oppIndex(players, g);
  assert.ok(ox.factor('BBB', 'G', 2, 'pts') > 1 && ox.factor('DDD', 'G', 2, 'pts') < 1);
  assert.equal(ox.factor('BBB', 'G', 1, 'pts'), 1, 'πριν από την 1η αγωνιστική: τίποτα');
  const B = { pts: { beta: 0.5 }, reb: { beta: 0 }, ast: { beta: 0 }, fg3: { beta: 0 } };
  const f = contextFactor({ ox, B }, { c: 'X', pos: 'Guard', team: 'AAA', opp: 'BBB', R: 2, s: 'pts' });
  assert.ok(Math.abs(f - (1 + 0.5 * (ox.factor('BBB', 'G', 2, 'pts') - 1))) < 1e-12);
});

test('ρυθμός και κατοστάρα: γρήγορες ομάδες pace > 1, μεγάλη αναμενόμενη διαφορά κόβει λεπτά βασικών', async () => {
  const { gameIndex, paceBlowFactor } = await import('../src/odds/usage.mjs');
  const g = [[1, '0', 'AAA', 'BBB', 110, 70, 1], [1, '0', 'CCC', 'DDD', 75, 75, 1], [2, '0', 'AAA', 'CCC', 0, 0, 0]];
  const gx = gameIndex(g);
  assert.ok(gx.pace('AAA', 'BBB', 2) > 1 && gx.pace('CCC', 'DDD', 2) < 1);
  assert.equal(gx.pace('AAA', 'BBB', 1), 1, 'χωρίς αγώνες πριν');
  assert.ok(gx.margin('AAA', 'CCC', 2, true) > 0 && gx.margin('CCC', 'AAA', 2, false) < 0);
  const PB = { pts: { coef: 0 }, reb: { coef: 0 }, ast: { coef: 0 }, fg3: { coef: 0 }, min: { coef: -0.1 } };
  const st = paceBlowFactor({ gx, PB }, { team: 'AAA', opp: 'BBB', R: 2, s: 'pts', home: true, avgMin: 30 });
  const bench = paceBlowFactor({ gx, PB }, { team: 'AAA', opp: 'BBB', R: 2, s: 'pts', home: true, avgMin: 12 });
  assert.ok(st < 1 && bench === 1);
});
