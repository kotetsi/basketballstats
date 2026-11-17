import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const appPath = fileURLToPath(new URL('../src/app.js', import.meta.url));

test('displayed win probabilities are complementary and total exactly 100%', async () => {
  const source = await fs.readFile(appPath, 'utf8');
  const match = source.match(/const splitWinProbability=(p=>\{const home=Math\.round\(100\*p\);return \[home,100-home\];\});/);
  assert.ok(match, 'shared complementary percentage helper must exist');
  assert.equal((source.match(/splitWinProbability\(x\.prob\)/g) || []).length, 2, 'both game cards and game detail must use the helper');
  const split = Function('return (' + match[1] + ')')();
  for (const probability of [0, 0.305, 0.31, 0.5, 0.695, 0.7, 1]) {
    const [home, away] = split(probability);
    assert.equal(home + away, 100);
    assert.ok(Number.isInteger(home) && Number.isInteger(away));
  }
  assert.deepEqual(split(0.7), [70, 30]);
  assert.deepEqual(split(0.695), [70, 30]);
});
