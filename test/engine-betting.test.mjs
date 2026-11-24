// Intelligence Engine, Φάση 6: στοίχημα ως καταναλωτής του engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { propsGate, engineIndex, engineDist, fairOdds, ev, GATE_RULES } from '../src/engine/betting.mjs';
import { gameProps } from '../src/odds/props.mjs';

const passing = () => ({ generated: 'x', all: { n: 5000, games: 50, engine: { brier: 0.24 }, market: { brier: 0.245 }, blend: { brier: 0.238 },
  brier_blend_minus_market_ci95: [-0.01, -0.002], ece_blend: 0.02, picks: { ev8: { blend: { n: 400, roi: 0.06, roi_ci95: [0.01, 0.11] } } } } });

test('πύλη: κλειστή χωρίς δεδομένα και σε κάθε κριτήριο που αποτυγχάνει, ανοιχτή μόνο αν περνούν όλα', () => {
  assert.deepEqual(propsGate(null).reasons, ['no_evidence']);
  assert.equal(propsGate(passing()).open, true);
  const fail = (f, reason) => { const r = passing(); f(r.all); const g = propsGate(r); assert.equal(g.open, false); assert.ok(g.reasons.includes(reason), reason); };
  fail(a => { a.games = 20; }, 'games');
  fail(a => { a.n = 100; }, 'lines');
  fail(a => { a.brier_blend_minus_market_ci95 = [-0.006, 0.0001]; }, 'brier_ci_upper');
  fail(a => { a.ece_blend = 0.05; }, 'ece');
  fail(a => { a.picks.ev8.blend.n = 50; }, 'picks');
  fail(a => { a.picks.ev8.blend.roi_ci95 = [-0.02, 0.2]; }, 'roi_ci_lower');
  assert.equal(GATE_RULES.minEv, 0.08);
});

test('δίκαιη απόδοση και EV (τύποι της προδιαγραφής)', () => {
  assert.equal(fairOdds(0.5), 2);
  assert.equal(fairOdds(0), null);
  assert.ok(Math.abs(ev(0.55, 2) - 0.1) < 1e-12);
});

const proj = { round: 5, players: [
  { player_id: '1', quality: 'ok', minutes: { if_plays: 25 }, stats: { pts: { mean: 12, sd: 4 }, reb: { mean: 5, sd: 2 }, ast: { mean: 3, sd: 1.5 }, fg3: { mean: 1.5, sd: 1.1 } } },
  { player_id: '2', quality: 'insufficient', minutes: null, stats: null },
  { player_id: '3', quality: 'out', minutes: { if_plays: 20 }, stats: { pts: { mean: 9, sd: 3 }, reb: { mean: 3, sd: 1 }, ast: { mean: 1, sd: 1 }, fg3: { mean: 1, sd: 1 } } } ] };

test('engineIndex / engineDist: μόνο παίκτες με πρόβλεψη, σωστή αγωνιστική, κλιμάκωση για απουσίες', () => {
  const E = engineIndex(proj);
  assert.deepEqual([...E.keys()], ['1']);
  assert.deepEqual(engineDist(E, '1', 'pts', 5), [12, 16]);
  assert.equal(engineDist(E, '1', 'pts', 6), null, 'άλλη αγωνιστική');
  assert.equal(engineDist(E, '1', 'pra', 5), null, 'συνδυασμοί μένουν στο props μοντέλο');
  const [m, v] = engineDist(E, '1', 'pts', 5, { minAdj: 30, minBase: 25 });
  assert.ok(Math.abs(m - 14.4) < 1e-9 && Math.abs(v - 19.2) < 1e-9);
  assert.deepEqual(engineDist(E, '1', 'pts', 5, { minAdj: 25.2, minBase: 25 }), [12, 16], 'μικρή διαφορά λεπτών = χωρίς κλιμάκωση');
});

test('gameProps: με engine οι 4 στατιστικές παίρνουν την κατανομή του engine (src=engine), οι συνδυασμοί όχι', () => {
  const r = (round, pts) => { const x = new Array(26).fill(0); Object.assign(x, { 0: round, 2: 'PAN', 3: 1, 7: 1500, 8: pts, 15: 1, 16: 4, 17: 3, 11: 1, 4: 80 }); return x; };
  const players = [{ c: '1', n: 'ALPHA, A', t: 'OLY', g: [r(1, 10), r(2, 12), r(3, 14), r(4, 11)] }];
  const books = { b: { title: 'B', lic: ['gr'], props: [{ name: 'Alpha, A', stat: 'pts', line: 11.5, over: 1.9, under: 1.9 }, { name: 'Alpha, A', stat: 'pra', line: 18.5, over: 1.9, under: 1.9 }] } };
  const E = engineIndex(proj), engine = (c, s, o) => engineDist(E, c, s, 5, o);
  const R = gameProps({ h: 'OLY', a: 'PAN', books }, { players, jur: 'gr', priors: { pts: 0.4, pra: 0.7 }, teamGames: { OLY: [1, 2, 3, 4] }, engine });
  const pts = R.rows.find(x => x.stat === 'pts'), pra = R.rows.find(x => x.stat === 'pra');
  assert.equal(pts.src, 'engine');
  assert.equal(pts.mu, 12);
  assert.equal(pra.src, 'props-v1');
  const R0 = gameProps({ h: 'OLY', a: 'PAN', books }, { players, jur: 'gr', priors: { pts: 0.4, pra: 0.7 }, teamGames: { OLY: [1, 2, 3, 4] } });
  assert.equal(R0.rows.find(x => x.stat === 'pts').src, 'props-v1', 'χωρίς engine: ίδια συμπεριφορά με πριν');
});
