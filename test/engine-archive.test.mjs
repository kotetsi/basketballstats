// Intelligence Engine, Φάση 4: αρχείο pregame προβλέψεων.
import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, verifyChain, latestPregame, settle, evaluate, hashOf, GENESIS } from '../src/engine/archive.mjs';

const row = (round, opp, home, mins, pts) => { const r = new Array(26).fill(0); Object.assign(r, { 0: round, 2: opp, 3: home, 7: mins * 60, 8: pts, 15: 1, 16: 3, 17: 2, 11: 1, 25: pts }); return r; };
// αγωνιστική 5: OLY-PAN στις 01/12 18:00 UTC
const cache = (played = false) => ({
  players: [{ c: '1', n: 'A', t: 'OLY', g: [row(1, 'PAN', 1, 20, 8), row(2, 'PAN', 0, 22, 10), row(3, 'PAN', 1, 24, 12), row(4, 'PAN', 0, 20, 9), ...(played ? [row(5, 'PAN', 1, 30, 20)] : [])] },
    { c: '2', n: 'B', t: 'PAN', g: [row(1, 'OLY', 0, 20, 5), row(2, 'OLY', 1, 20, 5), row(3, 'OLY', 0, 20, 5)] }],
  league: { games: [[5, '120118006', 'OLY', 'PAN', played ? 80 : 0, played ? 70 : 0, played ? 1 : 0]] },
});
const pstat = m => ({ mean: m, median: Math.round(m), sd: 3, mean_exp: m * 0.9, over: { '10.5': 0.5, '15.5': 0.2 } });
const proj = (ptsMean = 11) => ({
  version: 'engine-proj-1', season: 'E2026', round: 5, generated_at: '2026-12-01T08:00:00.000Z', models: { minutes: { version: 'min-hurdle-x2' }, stats: 'engine-stats-x1', pir: 'x' },
  players: [
    { player_id: '1', team_id: 'OLY', status: 'playing', quality: 'ok', flags: [], minutes: { p_play: 0.95, if_plays: 23, expected: 21.85 }, pir: { per_min: 0.5, mean: 11.5, mean_exp: 10.9 },
      stats: { pts: pstat(ptsMean), reb: pstat(4), ast: pstat(2), fg3: pstat(1) } },
    { player_id: '2', team_id: 'PAN', status: 'injured', quality: 'out', flags: [], minutes: { p_play: 0, if_plays: 20, expected: 0 }, pir: null, stats: { pts: pstat(5), reb: pstat(4), ast: pstat(2), fg3: pstat(1) } },
    { player_id: '3', team_id: 'PAN', quality: 'insufficient', flags: ['few_games'], minutes: null, stats: null, pir: null },
  ],
});
const T0 = new Date('2026-12-01T09:00:00Z'), T1 = new Date('2026-12-01T15:00:00Z'), AFTER = new Date('2026-12-01T18:30:00Z');

test('snapshot: μόνο pregame, μόνο όταν αλλάζει, αλυσίδα έγκυρη', () => {
  const a = snapshot([], proj(), cache(), T0);
  assert.equal(a.add.length, 2);
  assert.equal(a.skipped.insufficient, 1);
  assert.equal(a.add[0].prediction_id, 'E2026-5-OLY-PAN|1');
  assert.equal(a.add[0].tip, '2026-12-01T18:00:00.000Z');
  const b = snapshot(a.add, proj(), cache(), T1);
  assert.equal(b.add.length, 0, 'ίδια πρόβλεψη → κανένα νέο snapshot');
  const c = snapshot(a.add, proj(13), cache(), T1);
  assert.equal(c.add.length, 1);
  assert.equal(c.add[0].snapshot, 2);
  const lines = [...a.add, ...c.add];
  assert.equal(verifyChain(lines).ok, true);
  const late = snapshot(lines, proj(20), cache(), AFTER);
  assert.equal(late.add.length, 0, 'μετά το τζάμπολ δεν αρχειοθετείται τίποτα');
  assert.equal(late.skipped.late, 2);
});

test('verifyChain: πιάνει αλλοίωση, διαγραφή και αναδιάταξη', () => {
  const a = snapshot([], proj(), cache(), T0).add;
  const c = snapshot(a, proj(13), cache(), T1).add;
  const lines = [...a, ...c];
  const tampered = lines.map((l, i) => (i === 0 ? { ...l, stats: { ...l.stats, pts: { ...l.stats.pts, mean: 30 } } } : l));
  assert.deepEqual(verifyChain(tampered), { ok: false, bad: 1, n: 3 });
  assert.equal(verifyChain(lines.slice(1)).ok, false, 'διαγραφή της πρώτης γραμμής');
  assert.equal(verifyChain([lines[1], lines[0], lines[2]]).ok, false);
  // αλλοίωση που ξαναϋπολογίζει το hash της γραμμής σπάει την επόμενη
  const { hash, ...r0 } = { ...lines[0], quality: 'experimental' };
  const rehashed = [{ ...r0, hash: hashOf(GENESIS, r0) }, ...lines.slice(1)];
  assert.equal(verifyChain(rehashed).bad, 2);
});

test('latestPregame: αγνοεί snapshot με predicted_at ≥ tip ακόμα κι αν υπάρχει στο αρχείο', () => {
  const a = snapshot([], proj(), cache(), T0).add;
  const forged = { ...a[0], snapshot: 2, predicted_at: '2026-12-01T19:00:00.000Z', stats: { ...a[0].stats, pts: pstat(20) } };
  const L = latestPregame([...a, forged]);
  assert.equal(L.get('E2026-5-OLY-PAN|1').snapshot, 1);
});

test('settle: μόνο τελειωμένοι αγώνες, σφάλματα, βάσεις as-of, όποιος δεν έπαιξε', () => {
  const a = snapshot([], proj(), cache(), T0).add;
  const c = snapshot(a, proj(13), cache(), T1).add;
  assert.equal(settle([...a, ...c], cache(false)).length, 0, 'ο αγώνας δεν έχει παιχτεί');
  const S = settle([...a, ...c], cache(true));
  assert.equal(S.length, 2);
  const x = S.find(s => s.player_id === '1');
  assert.equal(x.snapshot, 2, 'η τελευταία pregame');
  assert.equal(x.played, true);
  assert.equal(x.stats.pts.actual, 20);
  assert.equal(x.stats.pts.err, -7);
  assert.equal(x.stats.pts.base.season, 9.75, 'μέσος σεζόν μόνο από τις αγωνιστικές 1–4');
  assert.deepEqual(x.stats.pts.over['15.5'], [0.2, 1]);
  assert.equal(x.errors.min_exp, -8.15);
  const y = S.find(s => s.player_id === '2');
  assert.equal(y.played, false);
  assert.equal(y.actual.minutes, 0);
  assert.equal(y.errors.min_exp, 0);
  const R = evaluate(S);
  assert.equal(R.n_predictions, 2);
  assert.equal(R.n_played, 1);
  assert.equal(R.stats.pts.engine.mae, 7);
  assert.ok(R.sample_note);
  assert.ok(R.minutes.p_play_brier >= 0);
});
