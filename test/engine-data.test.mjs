// Intelligence Engine, Φάση 2: κανονικοποίηση, validation, προστασία από διαρροή, ταυτότητες.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeSeason, decodeGameDate, gameId, legacyGid, availabilityOf, ROW, ROW_LEN } from '../src/engine/data.mjs';
import { validateSeason, validateRow, pirOf, summarize } from '../src/engine/validate.mjs';
import { asOf, assertNoFuture, statusAsOf, walkForward, LeakageError } from '../src/engine/asof.mjs';
import { parseInjuryLines, resolve, injuryReport } from '../src/engine/identity.mjs';

// γραμμή αγώνα στη μορφή του cache.json (26 θέσεις)
function row({ round, date, opp, home, tp, op, secs = 1200, fg2 = [2, 4], fg3 = [1, 3], ft = [2, 2], oreb = 1, dreb = 3, ast = 2, stl = 1, tov = 1, blk = 0, blka = 0, pf = 2, pfd = 2, start = 1 }) {
  const pts = 2 * fg2[0] + 3 * fg3[0] + ft[0];
  const r = new Array(ROW_LEN).fill(0);
  Object.assign(r, { [ROW.round]: round, [ROW.date]: date, [ROW.opp]: opp, [ROW.home]: home, [ROW.team_pts]: tp, [ROW.opp_pts]: op, [ROW.started]: start, [ROW.secs]: secs,
    [ROW.points]: pts, [ROW.fg2m]: fg2[0], [ROW.fg2a]: fg2[1], [ROW.fg3m]: fg3[0], [ROW.fg3a]: fg3[1], [ROW.ftm]: ft[0], [ROW.fta]: ft[1], [ROW.oreb]: oreb, [ROW.dreb]: dreb,
    [ROW.assists]: ast, [ROW.steals]: stl, [ROW.turnovers]: tov, [ROW.blocks]: blk, [ROW.blocks_against]: blka, [ROW.fouls]: pf, [ROW.fouls_drawn]: pfd, [ROW.plus_minus]: 0 });
  const miss = (fg2[1] - fg2[0]) + (fg3[1] - fg3[0]) + (ft[1] - ft[0]);
  r[ROW.pir] = pts + oreb + dreb + ast + stl + blk + pfd - miss - tov - blka - pf;
  return r;
}
// μικρή σεζόν: 2 αγωνιστικές, OLY-PAN (γηπεδούχος OLY) και PAN-OLY, κάθε ομάδα με έναν παίκτη που έχει όλους τους πόντους
function fixture() {
  const a = row({ round: 1, date: '2026-10-01', opp: 'PAN', home: 1, tp: 9, op: 9 });          // OLY: 9 πόντοι
  const b = row({ round: 1, date: '2026-10-01', opp: 'OLY', home: 0, tp: 9, op: 9 });          // PAN: 9 πόντοι
  const c = row({ round: 2, date: '2026-10-08', opp: 'OLY', home: 1, tp: 9, op: 9 });
  const d = row({ round: 2, date: '2026-10-08', opp: 'PAN', home: 0, tp: 9, op: 9 });
  return {
    fetchedAt: '2026-10-09T00:00:00.000Z',
    players: [{ c: '000001', n: 'ALPHA, A', t: 'OLY', pos: 'Guard', ct: 'Greece', g: [a, d] }, { c: '000002', n: 'BETA, B', t: 'PAN', pos: 'Center', ct: 'Serbia', g: [b, c] }],
    league: { games: [[1, '100118006', 'OLY', 'PAN', 9, 9, 1], [2, '100818006', 'PAN', 'OLY', 9, 9, 1], [3, '101518006', 'OLY', 'PAN', 0, 0, 0]] },
  };
}

test('decodeGameDate: συμπτυγμένη μορφή του build και ISO', () => {
  assert.equal(decodeGameDate('100118006', 'E2026'), '2026-10-01T18:00:00.000Z');
  assert.equal(decodeGameDate('010818007', 'E2026'), '2027-01-08T18:00:00.000Z');   // Ιανουάριος = επόμενο έτος της σεζόν
  assert.equal(decodeGameDate('093016005', 'E2025'), '2025-09-30T16:00:00.000Z');
  assert.equal(decodeGameDate('2026-11-04T19:45:00.000Z', 'E2026'), '2026-11-04T19:45:00.000Z');
  assert.equal(decodeGameDate('bad', 'E2026'), null);
});

test('normalizeSeason: οντότητες, game_id, team_id ανά γραμμή, provenance', () => {
  const N = normalizeSeason(fixture(), { season: 'E2026', availability: { '000002': { m: 1, k: 'inj' } } });
  assert.equal(N.games.length, 3);
  assert.equal(N.games[0].game_id, gameId('E2026', 1, 'OLY', 'PAN'));
  assert.equal(N.games[0].legacy_gid, legacyGid('E', 1, 'OLY', 'PAN'));
  assert.equal(N.games[2].game_status, 'scheduled');
  assert.equal(N.games[2].home_score, null);
  assert.deepEqual(N.teams.map(t => t.team_id), ['OLY', 'PAN']);
  assert.equal(N.player_games.length, 4);
  const r = N.player_games.find(x => x.player_id === '000001' && x.round === 2);
  assert.equal(r.game_id, 'E2026-2-PAN-OLY');
  assert.equal(r.team_id, 'OLY');
  assert.equal(r.minutes, 20);
  assert.equal(r.rebounds, 4);
  assert.ok(r.source && r.fetched_at === '2026-10-09T00:00:00.000Z');
  assert.equal(N.players.find(p => p.player_id === '000002').active_status, 'injured');
  assert.equal(N.players.find(p => p.player_id === '000001').active_status, 'no_known_absence');
  assert.deepEqual(N.issues, []);
});

test('normalizeSeason: παίκτης με 2 ομάδες — κάθε γραμμή παίρνει την ομάδα του αγώνα', () => {
  const F = fixture();
  F.players[0].t = 'PAN;OLY';                       // ίδιος παίκτης «πέρασε» και από την PAN (μόνο για το test)
  const N = normalizeSeason(F, { season: 'E2026' });
  const rows = N.player_games.filter(x => x.player_id === '000001');
  assert.deepEqual(rows.map(x => x.team_id), ['OLY', 'OLY']);
  assert.equal(N.players[0].team_id, 'OLY');
});

test('normalizeSeason: γραμμή χωρίς αντίστοιχο αγώνα καταγράφεται, δεν «μαντεύεται»', () => {
  const F = fixture();
  F.players[0].g.push(row({ round: 9, date: '2026-12-01', opp: 'MAD', home: 1, tp: 9, op: 0 }));
  const N = normalizeSeason(F, { season: 'E2026' });
  assert.deepEqual(N.issues, [{ code: 'unmatched_game', ref: '000001|9|MAD' }]);
  assert.equal(summarize(validateSeason(N)).errors, 1);
});

test('normalizeSeason: απορρίπτει μη έγκυρη είσοδο', () => {
  assert.throws(() => normalizeSeason({}, { season: 'E2026' }), TypeError);
  assert.throws(() => normalizeSeason(fixture(), { season: '2026' }), TypeError);
});

test('validateSeason: καθαρά δεδομένα → κανένα εύρημα', () => {
  assert.deepEqual(validateSeason(normalizeSeason(fixture(), { season: 'E2026' })), []);
});

test('validateRow: πιάνει αδύνατα στατιστικά', () => {
  const N = normalizeSeason(fixture(), { season: 'E2026' });
  const base = N.player_games[0];
  const codes = r => validateRow(r).map(f => f.code);
  assert.deepEqual(codes({ ...base, two_pointers_made: 5, two_pointers_attempted: 4, points: base.points + 6 }), ['made_gt_attempted', 'pir_mismatch']);
  assert.deepEqual(codes({ ...base, points: base.points + 1 }), ['points_mismatch', 'pir_mismatch']);
  assert.deepEqual(codes({ ...base, seconds: 70 * 60 }), ['minutes_out_of_range']);
  assert.deepEqual(codes({ ...base, assists: -1 }), ['invalid_number']);
  assert.deepEqual(codes({ ...base, pir: base.pir + 1 }), ['pir_mismatch']);
  assert.equal(pirOf(base), base.pir);
});

test('validateSeason: διπλή ταυτότητα, λάθος σκορ, άθροισμα πόντων', () => {
  const F = fixture();
  F.players.push({ ...F.players[0], g: [] });                                     // ίδιος player_id δύο φορές
  F.players[1].g[0] = row({ round: 1, date: '2026-10-01', opp: 'OLY', home: 0, tp: 8, op: 9 });   // λάθος σκορ ομάδας στη γραμμή
  F.league.games[1][4] = 12;                                                      // PAN 12 πόντοι, οι παίκτες έχουν 9
  const S = summarize(validateSeason(normalizeSeason(F, { season: 'E2026' })));
  assert.ok(S.by.duplicate_player_id && S.by.duplicate_player_id.severity === 'error');
  assert.ok(S.by.row_score_mismatch);
  assert.equal(S.by.team_points_mismatch.severity, 'warn');
});

test('asOf: κρύβει αγώνες και γραμμές από το cutoff και μετά', () => {
  const N = normalizeSeason(fixture(), { season: 'E2026' });
  const A = asOf(N, '2026-10-05T00:00:00Z');
  assert.equal(A.player_games.length, 2);
  assert.ok(A.player_games.every(r => r.round === 1));
  const g2 = A.games.find(g => g.round === 2);
  assert.equal(g2.game_status, 'scheduled');
  assert.equal(g2.home_score, null);
  assert.equal(N.games[1].home_score, 9, 'η είσοδος δεν αλλάζει');
  // ακριβώς στο τζάμπολ: ο αγώνας ΔΕΝ είναι γνωστός
  assert.equal(asOf(N, '2026-10-08T18:00:00.000Z').player_games.length, 2);
});

test('assertNoFuture: «μοντέλο» που εκπαιδεύτηκε με μελλοντικό αγώνα αποτυγχάνει', () => {
  const N = normalizeSeason(fixture(), { season: 'E2026' });
  const cutoff = '2026-10-08T18:00:00.000Z';                                      // τζάμπολ της 2ης αγωνιστικής
  assert.equal(assertNoFuture(asOf(N, cutoff).player_games, cutoff), true);
  assert.throws(() => assertNoFuture(N.player_games, cutoff, { label: 'train' }), err => err instanceof LeakageError && err.refs.length === 2);
  assert.throws(() => assertNoFuture([{ player_id: 'x' }], cutoff), LeakageError);   // χωρίς χρονοσφραγίδα = αποτυχία
});

test('statusAsOf: μόνο snapshots πριν από το cutoff, το πιο πρόσφατο ανά παίκτη', () => {
  const rows = [
    { captured_at: '2026-10-01T10:00:00Z', player_id: 'A', status: 'playing' },
    { captured_at: '2026-10-02T10:00:00Z', player_id: 'A', status: 'injured' },
    { captured_at: '2026-10-09T10:00:00Z', player_id: 'A', status: 'playing' },   // μετά το cutoff
    { captured_at: '2026-10-09T10:00:00Z', player_id: 'B', status: 'injured' },   // μόνο μετά
  ];
  const S = statusAsOf(rows, '2026-10-08T18:00:00Z');
  assert.equal(S.A.status, 'injured');
  assert.equal(S.B, undefined);
});

test('walkForward: κάθε αγωνιστική εκπαιδεύεται μόνο με προηγούμενους αγώνες', () => {
  const N = normalizeSeason(fixture(), { season: 'E2026' });
  const W = walkForward(N, { fromRound: 1 });
  assert.deepEqual(W.map(w => w.round), [1, 2, 3]);
  for (const w of W) {
    assertNoFuture(w.train.player_games, w.cutoff);
    assert.ok(w.target.every(r => r.round === w.round));
  }
  assert.equal(W[0].train.player_games.length, 0);
  assert.equal(W[1].train.player_games.length, 2);
});

test('identity: αιτίες αποτυχίας αντιστοίχισης τραυματιών', () => {
  const players = [{ c: '1', n: 'PAPAPETROU, IOANNIS', t: 'PAN' }, { c: '2', n: 'PAPANIKOLAOU, KOSTAS', t: 'OLY' }, { c: '3', n: 'PAPANIKOLAOU, NIKOS', t: 'OLY' }, { c: '4', n: 'ŠARIĆ, DARIO', t: 'BAS;DUB' }];
  assert.deepEqual(resolve('Papapetrou', 'PAN', players), { player_id: '1' });
  assert.equal(resolve('Saric', 'DUB', players).player_id, '4');
  assert.equal(resolve('Papanikolaou', 'OLY', players).reason, 'ambiguous');
  assert.equal(resolve('Papapetrou', 'OLY', players).reason, 'team_mismatch');
  assert.equal(resolve('Nobody', 'OLY', players).reason, 'no_appearance_this_season');
  const txt = '# σχόλιο\n2026-11-01 | Papapetrou | PAN | - | x\n2026-11-02 | Nobody | OLY | + | y\nάσχετη γραμμή';
  assert.equal(parseInjuryLines(txt).length, 2);
  const R = injuryReport(txt, players);
  assert.equal(R.matched, 1);
  assert.equal(R.unmatched[0].reason, 'no_appearance_this_season');
});

test('availabilityOf: δεν εφευρίσκει κατάσταση', () => {
  assert.equal(availabilityOf(undefined), 'no_known_absence');
  assert.equal(availabilityOf({ m: 2, k: 'dbt' }), 'doubtful');
  assert.equal(availabilityOf({ m: 0, k: 'miss' }), 'missed_recent_games');
});

// πραγματικά δεδομένα του repo: η τρέχουσα σεζόν πρέπει να περνά χωρίς σφάλματα
test('data/cache.json: η τρέχουσα σεζόν κανονικοποιείται χωρίς σφάλματα', () => {
  const C = JSON.parse(fs.readFileSync(new URL('../data/cache.json', import.meta.url)));
  const conf = JSON.parse(fs.readFileSync(new URL('../site.config.json', import.meta.url)));
  const N = normalizeSeason(C, { season: conf.season });
  const S = summarize(validateSeason(N));
  assert.equal(S.errors, 0, JSON.stringify(S.by).slice(0, 500));
  assert.ok(N.player_games.length > 0);
  const ids = new Set(N.players.map(p => p.player_id));
  assert.equal(ids.size, N.players.length, 'μοναδικός player_id');
});
