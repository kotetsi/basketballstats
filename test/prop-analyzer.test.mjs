// Prop Analyzer: hit rates, φίλτρα, «χωρίς συμπαίκτη», κύρια γραμμή, EV, πίνακας, άμυνα ανά θέση, προβλέψεις επόμενου αγώνα.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hits, filterGames, roundsWithout, summary, mainLine, evaluate, board, modelLine, VAL } from '../src/props/calc.mjs';
import { defenseVsPos, nextProjections, hitRate, pOver, PARAMS } from '../src/odds/props.mjs';

// γραμμή data.json: [r, date, opp, home, win, start, min, pts, reb, ast, fg3, stl, blk, tov, pir, tsc, osc]
const R = (r, opp, home, start, pts, reb = 4, ast = 2) => [r, `2026-10-${10 + r}`, opp, home, 1, start, 25, pts, reb, ast, 1, 1, 0, 1, pts, 80, 70];
const P = { c: '1', t: 'OLY', g: [R(1, 'PAN', 1, 1, 10), R(2, 'MAD', 0, 1, 15), R(3, 'PAN', 0, 0, 20), R(4, 'BAR', 1, 1, 12), R(5, 'RED', 1, 0, 8), R(6, 'MAD', 0, 1, 18)] };

test('hits: over/under/push και ποσοστό χωρίς τα push', () => {
  assert.deepEqual(hits([10, 12, 14], 11.5), { n: 3, over: 2, under: 1, push: 0, win: 2, rate: 2 / 3 });
  const h = hits([10, 12, 14], 12, 'under'); assert.equal(h.push, 1); assert.equal(h.rate, 0.5);
  assert.equal(hits([], 5).rate, null);
  assert.deepEqual(hitRate([3, 5], 4), { n: 2, over: 1, under: 1, push: 0, rate: 0.5 });
});

test('φίλτρα αγώνων και τελευταίοι Ν', () => {
  assert.deepEqual(filterGames(P.g, { venue: 'home' }).map(r => r[0]), [1, 4, 5]);
  assert.deepEqual(filterGames(P.g, { role: 'bench' }).map(r => r[0]), [3, 5]);
  assert.deepEqual(filterGames(P.g, { range: 2 }).map(r => r[0]), [5, 6]);
  assert.deepEqual(filterGames(P.g, { opp: 'MAD' }).map(r => r[0]), [2, 6]);
  const mate = { g: [R(1, 'PAN', 1, 1, 5), R(2, 'MAD', 0, 1, 5), R(6, 'MAD', 0, 1, 5)] };
  const w = roundsWithout(P, mate); assert.deepEqual([...w], [3, 4, 5]);
  assert.deepEqual(filterGames(P.g, { without: w, venue: 'home' }).map(r => r[0]), [4, 5]);
});

test('σύνοψη: L5, σεζόν, έδρα όπως ο επόμενος αγώνας και με τον αντίπαλο', () => {
  const S = summary(P, 'pts', 11.5, { next: { opp: 'MAD', home: 0 } });
  assert.equal(S.all.win, 4); assert.equal(S.L5.n, 5); assert.equal(S.venue.n, 3); assert.equal(S.venue.win, 3);
  assert.deepEqual([S.h2h.n, S.h2h.win], [2, 2]); assert.equal(S.avg, 83 / 6); assert.equal(S.med, 13.5);
  assert.equal(VAL.pra(P.g[0]), 16);
});

test('κύρια γραμμή: πιο κοντά στο 50-50, με τιμές και στις δύο πλευρές', () => {
  const L = [{ l: 9.5, o: [1.3], u: [3.2] }, { l: 11.5, o: [1.85], u: [1.9] }, { l: 13.5, o: [2.6] }];
  assert.equal(mainLine(L).l, 11.5); assert.equal(mainLine([]), null);
  assert.equal(modelLine(12.7), 12.5); assert.equal(modelLine(0.2), 0.5);
});

test('EV: μισό μοντέλο, μισό αγορά χωρίς vig (όπως η σελίδα value)', () => {
  const pj = [14, 30], line = 12.5, E = evaluate(pj, line, { o: [2.0, 'A'], u: [1.8, 'B'] }, 0.5);
  const pm = pOver(14, 30, line), mk = (1 / 2) / (1 / 2 + 1 / 1.8);
  assert.ok(Math.abs(E.pm - pm) < 1e-12); assert.ok(Math.abs(E.mk - mk) < 1e-12);
  assert.ok(Math.abs(E.pb - (pm + mk) / 2) < 1e-12); assert.ok(Math.abs(E.evO - (E.pb * 2 - 1)) < 1e-12);
  const M = evaluate(pj, line, null); assert.equal(M.pb, M.pm); assert.equal(M.evO, null);
  assert.equal(evaluate(null, line, null).pm, null);
});

test('πίνακας: γραμμή bookmaker όταν υπάρχει, αλλιώς μοντέλου μόνο για παίκτες με ρόλο', () => {
  const D = { blend: 0.5, next: { OLY: { opp: 'MAD', home: 0, gid: 'E-7-MAD-OLY' } }, players: [
    { ...P, out: 0, min: 26, pj: { pts: [14, 30], reb: [4, 6], fg3: [0.4, 0.5] } },
    { c: '2', t: 'OLY', out: 0, min: 6, g: P.g, pj: { pts: [3, 4] } },
    { c: '3', t: 'OLY', out: 1, min: 0, g: P.g, pj: {} },
  ] };
  const rows = board(D, { '1|reb': [{ l: 5.5, o: [2.1, 'A'], u: [1.75, 'B'] }] });
  assert.deepEqual(rows.map(r => `${r.c}|${r.s}|${r.src}|${r.line}`).sort(), ['1|pts|model|14.5', '1|reb|book|5.5']);
  const rb = rows.find(r => r.s === 'reb'); assert.equal(rb.side, 'under'); assert.equal(rb.price, 1.75); assert.equal(rb.book, 'B'); assert.ok(rb.ev != null);
});

test('άμυνα ανά θέση: ανά αγώνα, κατάταξη 1 = δίνει τα περισσότερα', () => {
  const g = (r, opp, pts) => { const x = new Array(26).fill(0); x[0] = r; x[2] = opp; x[7] = 1500; x[8] = pts; return x; };
  const pl = [{ c: 'a', g: [g(1, 'X', 20), g(2, 'Y', 10)] }, { c: 'b', g: [g(1, 'X', 10), g(3, 'X', 6)] }];
  const D = defenseVsPos(pl, p => ({ a: 'Guard', b: 'Guard' })[p.c]);
  assert.deepEqual(D.teams.X.Guard.pts, [18, 1]); assert.deepEqual(D.teams.Y.Guard.pts, [10, 2]); assert.equal(D.avg.Guard.pts, 14); assert.equal(D.n, 2);
});

test('προβλέψεις επόμενου αγώνα: εκτός χωρίς πρόβλεψη, τα λεπτά του πάνε στους συμπαίκτες', () => {
  const g = (r, sec, pts) => { const x = new Array(26).fill(0); x[0] = r; x[7] = sec; x[8] = pts; return x; };
  const players = [
    { c: 'a', n: 'A, A', t: 'T', g: [1, 2, 3, 4].map(r => g(r, 1800, 12)) },
    { c: 'b', n: 'B, B', t: 'T', g: [1, 2, 3, 4].map(r => g(r, 1500, 10)) },
  ];
  const fx = [{ c: 'a', pos: 'Guard', status: 'playing' }, { c: 'b', pos: 'Guard', status: 'injured' }];
  const priors = { pts: 0.4, reb: 0.2, ast: 0.1, fg3: 0.05, pr: 0.6, pa: 0.5, pra: 0.7, ar: 0.3 };
  const X = nextProjections(['T'], { players, fx, teamGames: { T: [1, 2, 3, 4] }, priors });
  assert.equal(X.b.out, true); assert.deepEqual(X.b.pj, {});
  assert.ok(X.a.min > X.a.base); assert.ok(Math.abs(X.a.min - Math.min(36, 30 + 25 * PARAMS.share)) < 0.2);
  assert.equal(Object.keys(X.a.pj).length, 8);
});
