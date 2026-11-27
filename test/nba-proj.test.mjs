// NBA: προβολές παικτών (src/nba/projections.mjs): μόνο ο επόμενος αγώνας, Out εκτός, πιθανότητα από το Rotowire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nbaProjections } from '../src/nba/projections.mjs';

const pl = (id, name, min, pts) => ({ id, name, pos: 'G', min, pts, reb: 4, ast: 3, f3m: 1, dnp: false });
const box = id => ({ teams: [{ abbr: 'NY', players: [pl('1', 'Jalen Brunson', 35, 28), pl('2', 'OG Anunoby', 30, 15), pl('3', 'Karl-Anthony Towns', 33, 22)] }, { abbr: 'MIA', players: [pl('9', 'Bam Adebayo', 33, 18)] }] });
const gm = (id, date, played) => ({ id, date, played, home: { abbr: 'NY' }, away: { abbr: 'MIA' }, box: played });
const now = new Date('2026-11-27T22:00:00Z');
const games = [gm('a', '2026-11-20T00:00Z', true), gm('b', '2026-11-22T00:00Z', true), gm('c', '2026-11-24T00:00Z', true), gm('d', '2026-11-26T00:00Z', true), gm('e', '2026-11-28T00:00Z', false)];
const N = { cur: 'N2026', seasons: { N2026: games }, box: { N2026: Object.fromEntries(['a', 'b', 'c', 'd'].map(id => [id, box(id)])) } };
const lineups = { at: '2026-11-27T21:00:00Z', games: [{ home: 'NY', away: 'MIA', teams: { NY: { starters: [{ name: 'Jalen Brunson', pct: 100, mnp: false }], mayNotPlay: [{ name: 'Karl Anthony Towns', status: 'Ques', pct: 50, mnp: true }, { name: 'OG Anunoby', status: 'Out', pct: 0, mnp: true }] }, MIA: { starters: [], mayNotPlay: [] } } }] };

test('προβολές NBA: Out εκτός, Ques με 50%, μόνο ο επόμενος αγώνας', () => {
  const P = nbaProjections(N, lineups, now);
  assert.equal(P.games.length, 1); assert.equal(P.games[0].gid, 'e');
  const by = Object.fromEntries(P.games[0].players.map(x => [x.name, x]));
  assert.ok(!by['OG Anunoby']);                                   // Out
  assert.equal(by['Karl-Anthony Towns'].p_play, 0.5);             // Ques, με άλλη γραφή στο Rotowire
  assert.equal(by['Jalen Brunson'].p_play, 1);
  assert.ok(by['Jalen Brunson'].pts > 20 && by['Jalen Brunson'].pra > by['Jalen Brunson'].pts);
});
