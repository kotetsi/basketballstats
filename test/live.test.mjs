import test from 'node:test';
import assert from 'node:assert/strict';
import { liveFP, liveScore, playerState, currentTurn, turnTimeline, recommendations, simulateRemaining, liveAlerts, roundReview } from '../src/fantasy/live.mjs';
import { enumerateLineups } from '../src/fantasy/turns.mjs';

const mk = (c, pos, t, pp, day, x = {}) => ({ c, pos, t, price: 10, pp, pp0: pp, p10: pp * 0.5, p50: pp, p90: pp * 1.5, pm: 25, pwin: 0.5, status: 'playing', day, gp: 8, conf: 70, ...x });
const R = [mk('g1', 'Guard', 'A', 20, 0), mk('g2', 'Guard', 'B', 10, 1), mk('g3', 'Guard', 'C', 8, 0), mk('g4', 'Guard', 'D', 12, 1),
  mk('f1', 'Forward', 'A', 14, 0), mk('f2', 'Forward', 'B', 11, 1), mk('f3', 'Forward', 'C', 7, 0), mk('f4', 'Forward', 'D', 9, 1),
  mk('c1', 'Center', 'C', 13, 0), mk('c2', 'Center', 'D', 6, 1)];
const coaches = [{ t: 'A', price: 6, exp: 5, p10: -5, p50: 10, p90: 20, pwin: 0.6 }];
const lu = { start: ['g1', 'g2', 'f1', 'f2', 'c1'], sixth: 'g3', bench: ['g4', 'f3', 'f4', 'c2'], captain: 'g1', coach: 'A' };
const days = ['d0', 'd1'];
const G = (state, margin, day, frac = 1, id = 'x') => ({ state, margin, day, frac, id, home: margin >= 0 });
const pre = { A: G('scheduled', 0, 0, 0, 'AC'), C: G('scheduled', 0, 0, 0, 'AC'), B: G('scheduled', 0, 1, 0, 'BD'), D: G('scheduled', 0, 1, 0, 'BD') };

test('live fantasy points, captain και bench multiplier, μπόνους νίκης μόνο στο τέλος', () => {
  assert.equal(liveFP(10, { slot: 'start' }), 10);
  assert.equal(liveFP(10, { slot: 'start', captain: true }), 20);
  assert.equal(liveFP(10, { slot: 'bench' }), 5);
  assert.equal(liveFP(10, { slot: 'bench', captain: true }), 5);
  assert.equal(liveFP(10, { slot: 'start', won: true, finished: false }), 10);   // όχι μπόνους πριν το τέλος
  assert.equal(liveFP(10, { slot: 'start', won: true, finished: true }), 11);
  assert.equal(liveFP(10, { slot: 'start', captain: true, won: true, finished: true }), 22);
});
test('καταστάσεις παικτών και projected για όσους δεν ξεκίνησαν', () => {
  assert.equal(playerState(R[0], G('final', 5, 0), { min: 0, pir: 0 }), 'dnp');
  assert.equal(playerState(R[0], G('final', 5, 0), { min: 20, pir: 10 }), 'finished');
  assert.equal(playerState(R[0], G('live', 5, 0, 0.5), { min: 10, pir: 5 }), 'playing');
  assert.equal(playerState({ ...R[0], status: 'injured' }, G('scheduled', 0, 0, 0), null), 'injured');
  const S = liveScore(lu, R, coaches, pre, {});
  assert.equal(S.actual, 0);
  assert.equal(S.rows.find(r => r.c === 'g1').show, 42);   // 20 × 1,05 × 2
  assert.equal(S.coach.actual, 0);                         // προπονητής μόνο στο τελικό
});
test('remaining και updated projection, turn progression', () => {
  const g = { ...pre, A: G('final', 12, 0, 1, 'AC'), C: G('final', -12, 0, 1, 'AC') };
  const box = { g1: { min: 30, pir: 30 }, f1: { min: 25, pir: 10 }, g3: { min: 0, pir: 0 }, f3: { min: 20, pir: 4 }, c1: { min: 28, pir: 15 } };
  const S = liveScore(lu, R, coaches, g, box);
  assert.equal(S.rows.find(r => r.c === 'g1').actual, 66);   // 30 × 1,1 × 2 (νίκη)
  assert.equal(S.rows.find(r => r.c === 'c1').actual, 15);   // ήττα: χωρίς μπόνους
  assert.equal(S.rows.find(r => r.c === 'g3').state, 'dnp'); assert.equal(S.rows.find(r => r.c === 'g3').actual, 0);
  assert.equal(S.coach.actual, 20);                          // νίκη 11-20
  const rem = S.rows.filter(r => r.state === 'not_started').reduce((s, r) => s + r.projected, 0);
  assert.ok(Math.abs(S.remaining - rem) < 0.5);
  assert.ok(Math.abs(S.updated - (S.actual + S.remaining)) < 0.05);
  assert.equal(currentTurn(days, g), 1); assert.equal(currentTurn(days, pre), 0);
  const TL = turnTimeline(lu, R, coaches, g, box, days);
  assert.equal(TL[0].state, 'done'); assert.ok(TL[1].available.includes('g2')); assert.ok(!TL[1].available.includes('g1'));
  const sim = simulateRemaining(lu, R, coaches, g, box, 100, 300);
  assert.ok(sim.p5 <= sim.p50 && sim.p50 <= sim.p95); assert.ok(sim.pBeat >= 0 && sim.pBeat <= 1);
});
test('recommendations και alerts', () => {
  // ο 6ος (g3) έκανε DNP, ο f1 έφερε 1 PIR: αλλαγή με παίκτη πάγκου που παίζει αύριο
  const g = { ...pre, A: G('final', 5, 0, 1, 'AC'), C: G('final', -5, 0, 1, 'AC') };
  const box = { g1: { min: 30, pir: 2 }, f1: { min: 25, pir: 1 }, g3: { min: 0, pir: 0 }, f3: { min: 20, pir: 4 }, c1: { min: 28, pir: 15 } };
  const rec = recommendations(lu, R, coaches, g, box, days);
  assert.ok(rec.list.some(x => x.k === 'captain' && x.out === 'g1'));   // ο αρχηγός έφερε 2: πέρασέ τον σε βασικό που δεν έχει παίξει
  assert.ok(rec.list.some(x => x.k === 'swap' && x.out === 'g3'));
  assert.ok(rec.list.every(x => x.impact > 0 && ['low', 'medium', 'high'].includes(x.risk)));
  assert.ok(rec.bestRemaining > rec.current);
  const A = liveAlerts(lu, R, coaches, g, box, days, { initial: 200 });
  assert.ok(A.some(a => a.k === 'projection_drop'));
  assert.ok(A.some(a => a.k === 'game_final'));
  const inj = R.map(p => (p.c === 'g2' ? { ...p, status: 'injured' } : p));
  const A2 = liveAlerts({ ...lu, captain: 'g2' }, inj, coaches, pre, {}, days);
  assert.equal(A2[0].k, 'captain_out'); assert.equal(A2[0].severity, 'critical');
  const A3 = liveAlerts(lu, R, coaches, { ...pre, D: G('live', 2, 1, 0.5, 'BD') }, { g4: { min: 15, pir: 20 } }, days);
  assert.ok(A3.some(a => a.k === 'bench_hot' && a.c === 'g4'));
});
test('round review', () => {
  const g = { A: G('final', 5, 0, 1, 'AC'), C: G('final', -5, 0, 1, 'AC'), B: G('final', 3, 1, 1, 'BD'), D: G('final', -3, 1, 1, 'BD') };
  const box = Object.fromEntries(R.map(p => [p.c, { min: 25, pir: p.c === 'g4' ? 30 : p.c === 'g1' ? 5 : p.pp }]));
  const P = new Map(R.map(p => [p.c, p]));
  const rv = roundReview(lu, R, coaches, g, box, { initial: 120, enumerate: ro => enumerateLineups(ro, P) });
  assert.equal(rv.best.c, 'g4'); assert.equal(rv.worst.c, 'g1');
  assert.ok(rv.captain.missed > 0); assert.ok(rv.bestArrangement.missed >= 0);
  assert.ok(rv.lessons.some(l => l.k === 'captain'));
});
