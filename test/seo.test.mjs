import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../dist/', import.meta.url);
for (const lang of ['', 'en/', 'es/', 'sr/', 'tr/']) {
  test(`standings are present before JavaScript: ${lang || 'el'}`, async () => {
    const html = await fs.readFile(new URL(lang + 'index.html', root), 'utf8');
    const table = html.match(/<table id="standTbl"[^>]*>([\s\S]*?)<\/table>/)?.[1];
    assert.ok(table, 'static standings table exists');
    const rows = table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
    assert.equal((rows?.match(/<tr>/g) || []).length, 20);
    assert.equal((rows.match(/<td/g) || []).length, 20 * 13);
    assert.match(rows, /href="[^"?]+\/"/);
    assert.match(html.match(/<h1>(.*?)<\/h1>/)?.[1] || '', /EuroLeague|Euroliga|Evrolige/);
  });
}

test('all generated sports events have real game dates and locations', async () => {
  let count = 0;
  async function scan(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await scan(file);
      else if (entry.name.endsWith('.html')) {
        const html = await fs.readFile(file, 'utf8');
        const walk = node => {
          if (!node || typeof node !== 'object') return;
          if (node['@type'] === 'SportsEvent') {
            count++;
            assert.ok(Number.isFinite(Date.parse(node.startDate)), `${file}: missing startDate`);
            assert.ok(node.location?.name, `${file}: missing location`);
          }
          Object.values(node).forEach(walk);
        };
        for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) walk(JSON.parse(match[1]));
      }
    }
  }
  await scan(fileURLToPath(root));
  assert.ok(count > 20, 'checks real generated game pages across languages');
});
