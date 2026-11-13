import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildQuizPool, quizQuestions } from '../src/quiz/questions.mjs';

const { players } = JSON.parse(readFileSync(new URL('../data/cache.json', import.meta.url)));
const pool = buildQuizPool(players, name => name);
const seed = 'E2026/2026-11-13';

test('daily quiz is repeatable, order independent and varies by day', () => {
  const questions = quizQuestions(pool, seed);
  assert.equal(questions.length, 5);
  assert.deepEqual(questions, quizQuestions([...pool].reverse(), seed));
  assert.notDeepEqual(questions, quizQuestions(pool, 'E2026/2026-11-14'));
});

test('all choices and winners match the source game logs', () => {
  const columns = { pts: [8], reb: [15, 16], ast: [17], m3: [11], pir: [25] };
  for (let day = 1; day <= 28; day++) {
    const questions = quizQuestions(pool, 'E2026/2026-11-' + day);
    assert.deepEqual(questions.map(q => q.metric).sort(), Object.keys(columns).sort());
    for (const { metric, options, correct } of questions) {
      assert.equal(options.length, 4);
      assert.equal(new Set(options.map(option => option.name)).size, 4);
      assert.equal(new Set(options.map(option => option.value)).size, 4);
      assert.equal(options[correct].value, Math.max(...options.map(option => option.value)));
      for (const { name, value } of options) {
        const games = players.find(player => player.n === name).g.filter(game => game[7] > 0);
        assert.ok(games.length >= 3);
        const total = games.reduce((sum, game) => sum + columns[metric].reduce((sum, col) => sum + game[col], 0), 0);
        assert.equal(value, total, name + ' ' + metric);
      }
    }
  }
});

test('insufficient data, including ties, yields no partial quiz', () => {
  assert.deepEqual(quizQuestions([], seed), []);
  const tied = Array.from({ length: 4 }, (_, i) => ({ id: String(i), name: 'Player ' + i, totals: { pts: 10 } }));
  assert.deepEqual(quizQuestions(tied, seed), []);
});

test('difficulty changes the distance between options while preserving unique answers', () => {
  const ranked = Array.from({ length: 50 }, (_, i) => ({
    id: String(i), name: 'Player ' + i,
    totals: Object.fromEntries(['pts', 'reb', 'ast', 'm3', 'pir'].map(metric => [metric, i])),
  }));
  for (const [level, spread] of [['easy', 29], ['medium', 11], ['hard', 3]]) {
    const questions = quizQuestions(ranked, seed, level);
    assert.equal(questions.length, 5);
    assert.deepEqual(questions, quizQuestions([...ranked].reverse(), seed, level));
    for (const { options, correct } of questions) {
      const values = options.map(option => option.value);
      assert.equal(new Set(values).size, 4);
      assert.equal(values[correct], Math.max(...values));
      assert.equal(Math.max(...values) - Math.min(...values), spread);
    }
  }
});
