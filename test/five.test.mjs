import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('each championship season has a valid, sourced starting five', () => {
  const games = JSON.parse(readFileSync(new URL('../data/quiz-champions.json', import.meta.url)));
  assert.deepEqual(games.map(game => game.year),
    Array.from({ length: 26 }, (_, index) => 2026 - index).filter(year => year !== 2020));
  for (const game of games) {
    assert.equal(game.roster.filter(player => player.start).length, 5);
    assert.ok(game.roster.length > 5);
    assert.equal(new Set(game.roster.map(player => player.name)).size, game.roster.length);
    assert.ok(game.source.includes('/seasons/E' + (game.year - 1) + '/games/'));
    assert.ok(game.score.split('–').map(Number).reduce((a, b) => a - b) > 0);
  }
  const olympiacos = games.find(game => game.year === 2012);
  assert.equal(olympiacos.team, 'OLY');
  assert.equal(olympiacos.score, '62–61');
});
