import test from 'node:test';
import assert from 'node:assert/strict';
import { contributions, reasonsFor, sentence, keyFactors, alternatives, compare, sensitivity, lineupCSV } from '../src/fantasy/insight.mjs';

const mk = (c, pos, t, price, pp, day = 0, x = {}) => ({ c, pos, t, price, pp, pp0: pp, p10: pp * 0.5, p50: pp, p90: pp * 1.5, pm: 25, pm0: 25, pirpm: pp / 25, start: 0.9, gp: 8, day, pwin: 0.5, status: 'playing', opp: 'X', odrtg: 115, gpace: 74, l3: pp, l5: pp, l10: pp, nx: [[1, 'X', 1, pp, 3, 0]], ...x });
const R = [mk('g1', 'Guard', 'A', 10, 20, 0), mk('g2', 'Guard', 'A', 9, 10, 1), mk('g3', 'Guard', 'B', 8, 8, 0), mk('g4', 'Guard', 'B', 6, 5, 2, { start: 0.2 }),
  mk('f1', 'Forward', 'C', 12, 14, 1), mk('f2', 'Forward', 'C', 10, 11, 0), mk('f3', 'Forward', 'D', 8, 7, 2), mk('f4', 'Forward', 'D', 5, 4, 1),
  mk('c1', 'Center', 'E', 11, 13, 2), mk('c2', 'Center', 'E', 7, 6, 0), mk('g9', 'Guard', 'F', 7, 15, 1, { odrtg: 125, nx: [[1, 'X', 1, 15, 1, 0]] }), mk('f9', 'Forward', 'F', 6, 12, 2)];
const coaches = [{ t: 'A', price: 6, exp: 5, p10: -5, p50: 10, p90: 20, pwin: 0.6, opp: 'X' }, { t: 'B', price: 4, exp: 2, p10: -10, p50: -5, p90: 10, pwin: 0.4, opp: 'X' }];
const lu = { formation: '2-2-1', start: ['g1', 'g2', 'f1', 'f2', 'c1'], sixth: 'g3', bench: ['g4', 'f3', 'f4', 'c2'], captain: 'g1', coach: 'A' };

test('contribution: μερίδια αθροίζουν σε 1, Euler floor/ceiling αθροίζουν στο σύνολο, αρχηγός ξεχωριστά', () => {
  const C = contributions(lu, R, coaches);
  const share = C.rows.reduce((s, x) => s + x.share, 0) + C.coach.share;
  assert.ok(Math.abs(share - 1) < 1e-9);
  assert.ok(Math.abs(C.rows.reduce((s, x) => s + x.floor, 0) + C.coach.floor - C.floor) < 0.1);
  assert.ok(Math.abs(C.rows.reduce((s, x) => s + x.ceiling, 0) + C.coach.ceiling - C.ceiling) < 0.1);
  assert.ok(Math.abs(C.rows.reduce((s, x) => s + x.riskShare, 0) + C.coach.riskShare - 1) < 1e-9);
  const cap = C.rows.find(x => x.captain);
  assert.equal(cap.captainExtra, cap.base); assert.equal(C.captainExtra, Math.round(cap.base * 10) / 10);
  assert.equal(C.rows.find(x => x.c === 'g4').points, 5 * 1.05 * 0.5);
});
test('εξηγήσεις από πραγματικά features', () => {
  const cap = reasonsFor('g1', 'captain', lu, R, R);
  assert.ok(cap.reasons.some(r => r.k === 'best_median_starter'));
  assert.ok(cap.reasons.some(r => r.k === 'high_pp' && r.v === 20));
  const b = reasonsFor('g4', 'bench', lu, R, R);
  assert.ok(b.reasons.some(r => r.k === 'low_start')); assert.ok(b.reasons.some(r => r.k === 'plays_later'));
  const L = { d: { bench: 'Μπήκε πάγκος επειδή', captain: 'Αρχηγός επειδή' }, r: { low_start: 'έχει χαμηλή πιθανότητα βασικού ({v})', plays_later: 'παίζει αργότερα', cheap: 'είναι φθηνός ({v})', below_starters: 'έχει λιγότερο PIR από τους βασικούς ({v})' }, and: ' και ' };
  const s = sentence('bench', b.reasons, L);
  assert.ok(s.startsWith('Μπήκε πάγκος επειδή')); assert.ok(s.includes('20%')); assert.ok(s.endsWith('.'));
});
test('key factors: score 0–100, ownership μη διαθέσιμο', () => {
  const K = keyFactors(lu, R, coaches);
  assert.equal(K.length, 9);
  for (const k of K) if (k.score != null) assert.ok(k.score >= 0 && k.score <= 100);
  assert.equal(K.find(k => k.k === 'ownership').available, false);
  assert.equal(K.find(k => k.k === 'budget').p.cost, 92);
});
test('εναλλακτικές: 4 διαθέσιμες στρατηγικές + differential μη διαθέσιμο, όλες έγκυρες', () => {
  const A = alternatives(R, coaches, { budget: 110 }, lu);
  assert.equal(A.length, 5);
  assert.equal(A.find(a => a.k === 'differential').available, false);
  for (const a of A.filter(x => x.available)) { assert.ok(a.lineup.start.includes(a.lineup.captain)); assert.ok(a.cost <= 110 + 1e-9); assert.ok(a.diff); }
  const v = A.find(a => a.k === 'value'), b = A.find(a => a.k === 'balanced');
  assert.ok(v.cost <= b.cost + 1e-9);   // το value κρατά ίδια ή περισσότερα credits
  assert.equal(alternatives(R, coaches, { budget: 20 }).filter(a => a.available).length, 0);
});
test('σύγκριση lineups', () => {
  const lu2 = { ...lu, start: ['g9', 'g2', 'f1', 'f2', 'c1'], bench: ['g1', 'f3', 'f4', 'c2'], captain: 'f1' };
  const d = compare(lu, lu2, R, coaches);
  assert.equal(d.players.find(x => x.c === 'g9').change, 'in');
  assert.equal(d.players.find(x => x.c === 'g4').change, 'out');
  assert.equal(d.players.find(x => x.c === 'g1').change, 'slot');
  assert.equal(d.captain.same, false);
  assert.equal(compare(lu, lu, R, coaches).changed, 0);
});
test('sensitivity: ο αρχηγός έχει τη μεγαλύτερη επίδραση, ο πάγκος λίγη', () => {
  const S = sensitivity(lu, R, coaches);
  assert.equal(S.rows[0].c, 'g1'); assert.equal(S.rows[0].impact, 'high');
  assert.ok(S.rows[0].dnp < -40 + 1e-9);   // χάνει 2 × 20 × 1,05
  assert.ok(S.rows.find(r => r.c === 'c2').impact === 'low');
  assert.ok(S.rows.find(r => r.c === 'g2').minDown < 0); assert.ok(S.rows.find(r => r.c === 'f3').minUp > 0);
  assert.ok(S.rows[0].capSwap && S.rows[0].capSwap.delta > S.rows[0].dnp);
  assert.ok(lineupCSV(lu, R, coaches).split('\n').length === 13);
});
