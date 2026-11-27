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
