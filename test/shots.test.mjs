import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, zoneOf, zoneStats, groupStats, creation, defensiveShots, defensiveProfile, topAssisters, assistNetwork, ptsOf, CORNER_Y } from '../src/shots/zones.mjs';
import { buildStints } from '../src/analytics/pbp-core.mjs';
import { mergeShots } from '../scripts/shots.mjs';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);

test('κανονικοποίηση συντεταγμένων', () => {
  assert.deepEqual(normalize(100, 200), { x: 100, y: 200 });
  assert.deepEqual(normalize(100, 2485 - 200), { x: -100, y: 200 });   // σουτ στο απέναντι μισό → καθρέφτισμα
  assert.equal(normalize(9999, 0).x, 750);                              // εκτός γηπέδου → στο όριο
  assert.equal(normalize(null, 5), null); assert.equal(normalize('x', 5), null);
});

test('ζώνες', () => {
  assert.equal(zoneOf(0, 50, false), 'rim');
  assert.equal(zoneOf(150, 300, false), 'paint');
  assert.equal(zoneOf(400, 300, false), 'mid');
  assert.equal(zoneOf(-690, 60, true), 'c3l');
  assert.equal(zoneOf(690, 100, true), 'c3r');
  assert.equal(zoneOf(0, 720, true), 'top3');
  assert.equal(zoneOf(-500, 500, true), 'w3l');
  assert.equal(zoneOf(500, 500, true), 'w3r');
  assert.ok(CORNER_Y > 130 && CORNER_Y < 150);
});

const S = [
  { pid: 'a', z: 'rim', made: 1, three: 0, ast: 'b' }, { pid: 'a', z: 'rim', made: 0, three: 0 },
  { pid: 'a', z: 'w3l', made: 1, three: 1, ast: 'c' }, { pid: 'a', z: 'w3l', made: 1, three: 1, ast: null },
  { pid: 'a', z: 'c3r', made: 0, three: 1, fb: 1 }, { pid: 'b', z: 'mid', made: 1, three: 0, ast: 'a', sc: 1 },
];
test('FG% και πόντοι ανά σουτ', () => {
  const z = zoneStats(S);
  near(z.rim.fg, 0.5); near(z.rim.pps, 1); near(z.w3l.fg, 1); near(z.w3l.pps, 3); near(z.c3r.fg, 0); near(z.rim.share, 2 / 6);
  const g = groupStats(S); near(g.wing3.fg, 1); near(g.corner3.fga, 1);
  assert.equal(ptsOf({ made: 1, three: 1 }), 3);
});
test('assisted / unassisted', () => {
  const c = creation(S.filter(s => s.pid === 'a'));
  assert.equal(c.made, 3); assert.equal(c.assisted, 2); near(c.astPct, 2 / 3); near(c.ast3Pct, 0.5);
  assert.equal(c.ptsAssisted, 5); assert.equal(c.ptsSelf, 3); assert.equal(c.fastbreak.fga, 1);
  assert.deepEqual(topAssisters(S.filter(s => s.pid === 'a')).map(x => x.id).sort(), ['b', 'c']);
  assert.equal(assistNetwork(S)[0].n, 1);
});
test('αμυντικό προφίλ', () => {
  const opp = [{ z: 'rim', made: 1, three: 0, def: ['d1', 'd2'] }, { z: 'rim', made: 0, three: 0, def: ['d2'] }, { z: 'top3', made: 1, three: 1, def: ['d1'] }];
  assert.equal(defensiveShots(opp, 'd1').length, 2);
  const p = defensiveProfile(defensiveShots(opp, 'd2'), { rim: { fg: 0.6 } });
  near(p.rim.fg, 0.5); near(p.rim.freq, 1); near(p.vsLeague.rim, -0.1); near(p.pps, 1);
});

test('play-by-play → σουτ με ασίστ, πεντάδες και συντεταγμένες', () => {
  const E = (tm, pid, type, mt, n) => ({ PLAYTYPE: type, CODETEAM: tm, PLAYER_ID: pid, MARKERTIME: mt, NUMBEROFPLAY: n });
  const A5 = ['a1', 'a2', 'a3', 'a4', 'a5'], B5 = ['b1', 'b2', 'b3', 'b4', 'b5'];
  const pbp = { CodeTeamA: 'AAA', CodeTeamB: 'BBB', FirstQuarter: [E('', '', 'BP', '', 1), E('AAA', 'a1', '3FGM', '09:00', 2), E('AAA', 'a2', 'AS', '09:00', 3), E('BBB', 'b1', '2FGA', '08:30', 4), E('BBB', 'b1', '2FGM', '08:00', 5)] };
  const r = buildStints(pbp, { AAA: A5, BBB: B5 });
  assert.equal(r.shots.length, 3);
  assert.equal(r.shots[0].ast, 'a2'); assert.equal(r.shots[2].ast, null);
  assert.deepEqual(r.shots[0].def, B5); assert.equal(r.shots[1].margin, -3);
  const m = mergeShots(r.shots, [{ ID_ACTION: '3FGM', NUM_ANOT: 2, ID_PLAYER: 'a1 ', COORD_X: 0, COORD_Y: 720, CONSOLE: '09:00', FASTBREAK: '1' }], 'AAA');
  assert.equal(m.matched, 1); assert.equal(m.shots[0].z, 'top3'); assert.equal(m.shots[0].fb, 1); assert.equal(m.shots[1].x, null);
});
