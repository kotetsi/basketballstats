// Intelligence Engine, Φάση 3: κοινές προβλέψεις παικτών.
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPlayer, buildProjections, leagueRates, prevSeasonRates, DEFAULT_LADDER, STAT_KEYS } from '../src/engine/projections.mjs';

const row = (round, mins, pts, reb = 4, ast = 2, fg3 = 1) => {
  const r = new Array(26).fill(0);
  r[0] = round; r[7] = mins * 60; r[8] = pts; r[15] = 1; r[16] = reb - 1; r[17] = ast; r[11] = fg3;
  return r;
};
const player = (g, c = '000001') => ({ c, n: 'TEST, A', t: 'OLY', pos: 'Guard', g });
const minutes = { p_play: 0.9, min_if_plays: 25, min_exp: 22.5, opp: 'PAN', home: 1 };
const league = { pts: 0.4, reb: 0.15, ast: 0.08, fg3: 0.03 };

test('χρησιμοποιεί μόνο αγώνες πριν από την αγωνιστική-στόχο', () => {
  const g = [row(1, 25, 10), row(2, 25, 12), row(3, 25, 14), row(4, 25, 11)];
  const a = projectPlayer(player(g), { round: 5, minutes, league });
  const b = projectPlayer(player([...g, row(5, 40, 40), row(6, 40, 40)]), { round: 5, minutes, league });
  assert.deepEqual(a.stats, b.stats, 'οι αγώνες 5 και 6 (μέλλον) δεν επηρεάζουν την πρόβλεψη της 5ης');
  assert.equal(a.n_games, 4);
});

test('σκάλα ορίων: πιθανότητες μειώνονται όσο ανεβαίνει το όριο, μέσα στο [0,1]', () => {
  const p = projectPlayer(player([row(1, 25, 10), row(2, 25, 14), row(3, 25, 18), row(4, 25, 12)]), { round: 5, minutes, league });
  for (const s of STAT_KEYS) {
    const v = DEFAULT_LADDER[s].map(L => p.stats[s].over[String(L)]);
    for (let i = 0; i < v.length; i++) { assert.ok(v[i] >= 0 && v[i] <= 1); if (i) assert.ok(v[i] <= v[i - 1], `${s} μονοτονία`); }
    assert.ok(Math.abs(p.stats[s].mean_exp - p.stats[s].mean * 0.9) < 0.02);
  }
  assert.equal(p.quality, 'experimental');   // 4 αγώνες, χωρίς προηγούμενη σεζόν
});

test('διαθεσιμότητα: τραυματίας → δεν αναμένεται να παίξει· αμφίβολος → αβέβαιο', () => {
  const g = [row(1, 25, 10), row(2, 25, 12), row(3, 25, 14), row(4, 25, 11), row(5, 25, 9), row(6, 25, 13)];
  const inj = projectPlayer(player(g), { round: 7, minutes, league, status: 'injured', ppm: 0.5 });
  assert.equal(inj.quality, 'out');
  assert.equal(inj.minutes.p_play, 0);
  assert.equal(inj.pir.mean_exp, 0);
  const dbt = projectPlayer(player(g), { round: 7, minutes, league, status: 'doubtful', ppm: 0.5 });
  assert.equal(dbt.quality, 'uncertain');
  assert.equal(dbt.minutes.p_play, +(0.9 * 0.4).toFixed(4));
  assert.equal(dbt.pir.mean, 12.5);   // «αν παίξει» δεν αλλάζει
});

test('λίγα δεδομένα: δεν «εφευρίσκει» πρόβλεψη', () => {
  const p = projectPlayer(player([row(1, 20, 5), row(2, 20, 5)]), { round: 3, minutes, league });
  assert.equal(p.quality, 'insufficient');
  assert.equal(p.stats, null);
  assert.ok(p.flags.includes('few_games'));
  assert.equal(projectPlayer(player([row(1, 20, 5), row(2, 20, 5), row(3, 20, 5)]), { round: 4, minutes: null, league }).quality, 'insufficient');
});

test('prior προηγούμενης σεζόν: τραβά τον ρυθμό προς την περσινή του απόδοση', () => {
  const g = [row(1, 25, 5), row(2, 25, 5), row(3, 25, 5)];
  const prev = prevSeasonRates([player([row(1, 30, 30), row(2, 30, 30)])]).get('000001');
  const a = projectPlayer(player(g), { round: 4, minutes, league });
  const b = projectPlayer(player(g), { round: 4, minutes, league, prev });
  assert.ok(b.stats.pts.mean > a.stats.pts.mean);
  assert.equal(b.has_prev_season, true);
});

test('leagueRates: μόνο αγώνες πριν από την αγωνιστική', () => {
  const L = leagueRates([player([row(1, 20, 10), row(2, 20, 30)])], 2);
  assert.equal(L.pts, 0.5);
});

test('buildProjections: έκδοση, μοντέλα, pregame', () => {
  const cache = { players: [player([row(1, 25, 10), row(2, 25, 12), row(3, 25, 14)])], league: { games: [[4, '120118006', 'OLY', 'PAN', 0, 0, 0]] } };
  const mf = { model: 'min-hurdle-x2', season: 'E2026', round: 4, generated_at: 'x', n_train: 10, players: { '000001': minutes } };
  const before = buildProjections({ cache, minutesFile: mf, now: new Date('2026-12-01T10:00:00Z') });
  assert.equal(before.first_tip, '2026-12-01T18:00:00.000Z');
  assert.equal(before.pregame, true);
  assert.equal(before.models.minutes.version, 'min-hurdle-x2');
  assert.equal(before.players.length, 1);
  assert.equal(buildProjections({ cache, minutesFile: mf, now: new Date('2026-12-01T19:00:00Z') }).pregame, false);
});
