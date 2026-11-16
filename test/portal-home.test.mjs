import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/portal-home.mjs', import.meta.url));
const locales = [
  ['', 'vathmologia'],
  ['en/', 'standings'],
  ['es/', 'clasificacion'],
  ['sr/', 'tabela'],
  ['tr/', 'puan-durumu']
];

test('portal generator creates localized homepages and preserves standings pages', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'basketballstats-portal-'));
  try {
    const dist = path.join(tmp, 'dist');
    const source = '<!doctype html><html><head><title>Old</title><meta name="description" content="Old"><link rel="canonical" href="https://basketballstats.eu/"><link rel="alternate" hreflang="el" href="https://basketballstats.eu/"><link rel="alternate" hreflang="en" href="https://basketballstats.eu/en/"><link rel="alternate" hreflang="es" href="https://basketballstats.eu/es/"><link rel="alternate" hreflang="sr" href="https://basketballstats.eu/sr/"><link rel="alternate" hreflang="tr" href="https://basketballstats.eu/tr/"><link rel="alternate" hreflang="x-default" href="https://basketballstats.eu/"></head><body data-view="stand"><nav class="nav">Old navigation</nav><main class="wrap one"><h1>EuroLeague</h1><table id="standTbl"><tbody></tbody></table><section class="todayhome"><h2>Today</h2></section></main><nav class="foot"><a href="/">Standings</a></nav></body></html>';
    for (const [dir] of locales) {
      const folder = path.join(dist, dir);
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(path.join(folder, 'index.html'), source);
      await fs.writeFile(path.join(dist, 'sitemap-' + (dir ? dir.slice(0, -1) : 'el') + '.xml'), '<urlset><url><loc>https://basketballstats.eu/' + dir + '</loc></url></urlset>');
    }

    const result = spawnSync(process.execPath, [script], { cwd: tmp, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    for (const [dir, standings] of locales) {
      const home = await fs.readFile(path.join(dist, dir, 'index.html'), 'utf8');
      assert.match(home, /Basketball Intelligence Portal/);
      assert.match(home, /data-view="portal"/);
      assert.equal((home.match(/class="portal-card"/g) || []).length, 12);
      assert.match(home, /class="todayhome"/);

      const oldStandings = await fs.readFile(path.join(dist, dir, standings, 'index.html'), 'utf8');
      assert.match(oldStandings, /id="standTbl"/);
      assert.match(oldStandings, /Basketball Intelligence|Match Center/);
      for (const [altDir, altStandings] of locales) {
        const expected = 'https://basketballstats.eu/' + altDir + altStandings + '/';
        assert.ok(oldStandings.includes('hreflang="' + (altDir ? altDir.slice(0,-1) : 'el') + '" href="' + expected + '"'), expected);
      }
      assert.ok(oldStandings.includes('hreflang="x-default" href="https://basketballstats.eu/vathmologia/"'));
      const sitemapName = 'sitemap-' + (dir ? dir.slice(0,-1) : 'el') + '.xml';
      const sitemap = await fs.readFile(path.join(dist, sitemapName), 'utf8');
      assert.ok(sitemap.includes('<loc>https://basketballstats.eu/' + dir + standings + '/</loc>'));
      assert.ok(!sitemap.includes('<loc>https://basketballstats.eu/' + dir + '</loc>'));
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
