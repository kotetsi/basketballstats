import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, randomLineup, lineupPoints, rng, evalRound, summarize, BUDGET } from '../fantasy/optbt.mjs';

const mk = (i, pos, team, price, pir, fp) => ({ c: 'p' + i, pos, team, price, n_played: 6, start_rate5: 0.8, m5: 25, pwin: 0.5, actual_fp: fp, 'm|pir': pir, 'm|p10': pir - 5, 'm|p50': pir, 'm|p90': pir + 5 });
const pool = [];
let i = 0;
for (const [pos, k] of [['Guard', 12], ['Forward', 12], ['Center', 7]]) for (let j = 0; j < k; j++) { const pir = 4 + ((i * 7) % 17); pool.push(mk(i, pos, 'T' + (i % 6), 5 + (pir % 9), pir, pir + ((i * 5) % 7) - 3)); i++; }

test('optimizer percentile', () => {
  assert.equal(percentile(5, [1, 2, 3, 4]), 1);
  assert.equal(percentile(0, [1, 2, 3, 4]), 0);
  assert.equal(percentile(3, [1, 2, 3, 4]), 0.625);   // 2 κάτω + μισή ισοβαθμία
  assert.equal(percentile(1, []), null);
});
test('τυχαίες συνθέσεις: πάντα έγκυρες (θέσεις, budget, ομάδα, σχηματισμός, αρχηγός στην πεντάδα)', () => {
  const R = rng(3);
  for (let k = 0; k < 200; k++) {
    const l = randomLineup(pool, R); assert.ok(l);
    const P = new Map(pool.map(p => [p.c, p])), ro = l.roster.map(c => P.get(c));
    assert.equal(ro.filter(p => p.pos === 'Guard').length, 4); assert.equal(ro.filter(p => p.pos === 'Center').length, 2);
    assert.ok(ro.reduce((s, p) => s + p.price, 0) <= BUDGET + 1e-9);
    const t = {}; for (const p of ro) t[p.team] = (t[p.team] || 0) + 1; assert.ok(Object.values(t).every(n => n <= 6));
    assert.equal(l.start.length, 5); assert.ok(l.start.includes(l.captain)); assert.equal(l.bench.length, 4);
    assert.equal(new Set([...l.start, l.sixth, ...l.bench]).size, 10);
  }
});
test('πόντοι σύνθεσης: πάγκος 50%, αρχηγός ×2', () => {
  const act = new Map([['a', 10], ['b', 10], ['c', 10], ['d', 10], ['e', 10], ['f', 6], ['g', 4], ['h', 4], ['i', 4], ['j', 4]]);
  assert.equal(lineupPoints({ start: ['a', 'b', 'c', 'd', 'e'], captain: 'a', sixth: 'f', bench: ['g', 'h', 'i', 'j'] }, act), 50 + 10 + 6 + 8);
});
test('optimizer backtest: τέλεια ≥ optimizer ≥ χειρότερη, percentile στο [0,1]', () => {
  const ev = evalRound(pool, ['m'], { nRandom: 300, seed: 2 });
  const m = ev.models.m;
  assert.ok(ev.best >= m.points - 1e-6 && m.points >= ev.worst - 1e-6);
  assert.ok(ev.best >= ev.random.p90 && ev.worst <= ev.random.p10);
  assert.ok(m.pct >= 0 && m.pct <= 1);
  assert.ok(m.arrangement <= 1 + 1e-9);
  const s = summarize([{ models: ev.models }], ['m']);
  assert.equal(s.m.n, 1); assert.equal(s.m.hidden, true);
});
