import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { startingFives } from '../src/quiz/five.mjs';

test('published rosters have five distinct starters and belong to a completed fixture', () => {
  const { players, league } = JSON.parse(readFileSync(new URL('../data/cache.json', import.meta.url)));
  const lineups = startingFives(players, league.games, name => name);
  assert.ok(lineups.length > 100);
  for (const { round, date, team, opponent, roster } of lineups) {
    const fixture = league.games.find(game => game[0] === round && game[6] &&
      ((game[2] === team && game[3] === opponent) || (game[2] === opponent && game[3] === team)));
    assert.ok(fixture);
    assert.equal(roster.filter(player => player.start).length, 5);
    for (const player of roster) {
      const home = Number(fixture[2] === team);
      assert.ok(players.find(p => p.n === player.name).g.some(row =>
        row[0] === round && row[1] === date && row[2] === opponent && row[3] === home &&
        row[4] === fixture[home ? 4 : 5] && row[5] === fixture[home ? 5 : 4] && Boolean(row[6]) === player.start));
    }
  }
});
