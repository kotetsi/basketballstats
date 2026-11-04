import test from 'node:test';
import assert from 'node:assert/strict';
import { pirPerCredit, valueGrade, validateRoster, rosterCost, tradeEval, multiTrade, planRound, captainEligible, lineupOf, alertSeverity, buildAlerts, parseRoster } from '../src/fantasy/manager.mjs';

const mk = (c, pos, t, price, pp, day = 0, extra = {}) => ({ c, dn: 'Player ' + c, n: 'P' + c, pos, t, price, pp, p10: pp * 0.5, p50: pp, p90: pp * 1.5, p3: pp * 3, day, pwin: 0.5, status: 'playing', opp: 'XXX', m3: 25, m10: 25, gp: 8, nx: [[1, 'A', 1, pp, 3, 0], [2, 'B', 0, pp, 3, 0], [3, 'C', 1, pp, 3, 0]], ...extra });
const roster = [
  mk('g1', 'Guard', 'AAA', 10, 12, 0), mk('g2', 'Guard', 'AAA', 9, 10, 1), mk('g3', 'Guard', 'BBB', 8, 8, 0), mk('g4', 'Guard', 'BBB', 6, 5, 2),
  mk('f1', 'Forward', 'CCC', 12, 14, 1), mk('f2', 'Forward', 'CCC', 10, 11, 0), mk('f3', 'Forward', 'DDD', 8, 7, 2), mk('f4', 'Forward', 'DDD', 6, 4, 1),
  mk('c1', 'Center', 'EEE', 11, 13, 2), mk('c2', 'Center', 'EEE', 7, 6, 0),
];
const market = [...roster, mk('g9', 'Guard', 'FFF', 7, 15, 1), mk('f9', 'Forward', 'FFF', 9, 16, 2), mk('c9', 'Center', 'GGG', 20, 25, 1), mk('gi', 'Guard', 'HHH', 5, 14, 1, { status: 'injured' })];

test('PIR per credit και value grade', () => {
  assert.equal(pirPerCredit(20, 10), 2);
  assert.equal(pirPerCredit(5, 0), 0);
  const s = [2, 1.5, 1.2, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05, 0, -1, -2, -3, -4, -5];
  assert.equal(valueGrade(2, s), 'A+');
  assert.equal(valueGrade(-5, s), 'D');
});
test('budget και θέσεις', () => {
  assert.equal(rosterCost(roster), 87);
  assert.deepEqual(validateRoster(roster), []);
  assert.ok(validateRoster(roster, { cap: 80 }).some(e => e.k === 'budget'));
  const bad = [...roster.slice(0, 9), mk('g5', 'Guard', 'AAA', 5, 5)];
  assert.ok(validateRoster(bad).some(e => e.k === 'pos_over' && e.pos === 'Guard'));
  assert.ok(validateRoster(bad).some(e => e.k === 'pos_under' && e.pos === 'Center'));
  const seven = Array.from({ length: 7 }, (_, i) => mk('x' + i, i < 4 ? 'Guard' : 'Forward', 'ZZZ', 5, 5));
  assert.ok(validateRoster(seven, { partial: true }).some(e => e.k === 'team_max'));
});
test('trade value: καλή αγορά, λάθος θέση, ταμείο, τραυματίας', () => {
  const t = tradeEval(roster, 'g4', 'g9', market, { bank: 13 });
  assert.equal(t.errors.length, 0);
  assert.equal(t.bankAfter, 12);
  assert.equal(t.dNext, 10);
  assert.ok(['buy', 'strong_buy'].includes(t.rec));
  assert.ok(t.dFP > 0);
  assert.ok(tradeEval(roster, 'g4', 'f9', market, { bank: 13 }).errors.some(e => e.k === 'pos_mismatch'));
  assert.ok(tradeEval(roster, 'c2', 'c9', market, { bank: 2 }).errors.some(e => e.k === 'bank'));
  assert.ok(tradeEval(roster, 'g4', 'g9', market, { bank: 13, transfersLeft: 0 }).errors.some(e => e.k === 'no_transfers'));
  const inj = tradeEval(roster, 'g4', 'gi', market, { bank: 13 });
  assert.equal(inj.injuryRisk, 'high');
  assert.ok(inj.score < t.score);
});
test('multi-trade optimizer: σέβεται ταμείο, θέσεις, ομάδα και transfers', () => {
  const r = multiTrade(roster, market, { bank: 13, transfersLeft: 2, maxTrades: 4 });
  assert.ok(r.trades.length >= 1 && r.trades.length <= 2);
  assert.ok(r.after > r.before);
  assert.ok(r.bank >= 0);
  assert.deepEqual(validateRoster(r.roster, { cap: 100 }).filter(e => e.k !== 'budget'), []);
  const cnt = r.roster.reduce((m, p) => ((m[p.t] = (m[p.t] || 0) + 1), m), {});
  assert.ok(Object.values(cnt).every(n => n <= 6));
  assert.ok(!r.roster.some(p => p.c === 'gi'));
  assert.equal(multiTrade(roster, market, { bank: 13, transfersLeft: 0 }).trades.length, 0);
});
test('round planner: turns, αλλαγές, captain eligibility', () => {
  const lu = lineupOf(roster);
  assert.equal(lu.start.length, 5); assert.equal(lu.bench.length, 4);
  const plan = planRound(lu, roster, [], ['d0', 'd1', 'd2'], 1);
  assert.equal(plan.turns.length, 3);
  assert.equal(plan.turns[0].state, 'done'); assert.equal(plan.turns[1].state, 'current');
  for (const t of plan.turns) for (const c of t.playing) assert.equal(roster.find(p => p.c === c.c).day, t.i);
  // κάθε αλλαγή ανεβάζει παίκτη που δεν έχει παίξει ακόμα
  for (const s of plan.subs) assert.ok(roster.find(p => p.c === s.up).day > s.after);
  const P = new Map(roster.map(p => [p.c, p]));
  const early = lu.start.find(c => P.get(c).day === 0);
  if (early) assert.equal(captainEligible(lu, early, P, 1).why, 'played');
  const late = lu.start.find(c => P.get(c).day >= 1);
  if (late) assert.ok(captainEligible(lu, late, P, 1).ok);
  assert.equal(captainEligible(lu, lu.bench[0], P, 0).why, 'not_starter');
  assert.ok(plan.total > 0);
});
test('injury alert severity', () => {
  assert.equal(alertSeverity('ruled_out', 'start', false), 'critical');
  assert.equal(alertSeverity('ruled_out', 'bench', false), 'warning');
  assert.equal(alertSeverity('doubtful', 'bench', true), 'critical');
  assert.equal(alertSeverity('doubtful', 'sixth', false), 'warning');
  assert.equal(alertSeverity('return', 'bench', false), 'info');
  const ro = roster.map(p => (p.c === 'f1' ? { ...p, status: 'injured', pp: 0 } : p));
  const lu = lineupOf(roster);
  const al = buildAlerts(lu, ro, [], { curTurn: 0 });
  assert.equal(al[0].c, 'f1'); assert.equal(al[0].severity, 'critical');
});
test('εισαγωγή σύνθεσης από κείμενο', () => {
  const r = parseRoster('captain,Player g1\nPlayer g2\nbench,Player c2\ncoach,EEE\nΆγνωστος Παίκτης', market, ['EEE']);
  assert.equal(r.roster.length, 3); assert.equal(r.captain, 'g1'); assert.equal(r.coach, 'EEE'); assert.equal(r.slots.c2, 'bench'); assert.deepEqual(r.missing, ['Άγνωστος Παίκτης']);
});
