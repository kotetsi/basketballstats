import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join('dist', pathname, pathname.endsWith('/') ? 'index.html' : '');
  try {
    const body = await fs.readFile(file);
    res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0, '127.0.0.1');

try {
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const languages = { el: '/', en: '/en/', es: '/es/', sr: '/sr/', tr: '/tr/' };
  const browser = await chromium.launch({ executablePath: process.env.FINDER_CHROMIUM });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block',
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());

    for (const [lang, root] of Object.entries(languages)) {
      const finder = root + 'player-finder/';
      await page.goto(origin + root);
      await page.locator('.nav a[data-v="finder"]').click();
      assert.equal(new URL(page.url()).pathname, finder);
      assert.equal(await page.locator('html').getAttribute('lang'), lang);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      assert.equal(new URL(canonical).pathname, finder);
      assert.match(await page.title(), /\S/);
      assert.match(await page.locator('meta[name="description"]').getAttribute('content'), /\S/);
      assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), canonical);
      const sitemap = await fs.readFile(`dist/sitemap-${lang}.xml`, 'utf8');
      assert.ok(sitemap.includes('<loc>' + canonical + '</loc>'));
      for (const [alternate, prefix] of Object.entries({ ...languages, 'x-default': '/' })) {
        const href = await page.locator(`link[hreflang="${alternate}"]`).getAttribute('href');
        assert.equal(new URL(href).pathname, prefix + 'player-finder/');
      }
      for (const [alternate, prefix] of Object.entries(languages)) {
        if (alternate === lang) continue;
        assert.equal(await page.locator(`a.langsw[hreflang="${alternate}"]`).getAttribute('href'), prefix + 'player-finder/');
      }

      const rows = page.locator('#finder-rows tr');
      await rows.first().waitFor();
      const links = await page.locator('#finder-rows a').evaluateAll(links => links.map(link => link.getAttribute('href')));
      await Promise.all(links.map(async href => {
        assert.ok(href.startsWith(root));
        await fs.access(path.join('dist', href, 'index.html'));
      }));
      const comparison = await page.locator('#finder p a').getAttribute('href');
      assert.ok(comparison.startsWith(root));
      assert.equal((await page.request.get(origin + comparison)).status(), 200);

      await page.locator('#finder-metric').selectOption('points');
      assert.equal(await page.locator('[data-stat="points"]').getAttribute('aria-sort'), 'descending');
      const points = await rows.evaluateAll(rows => rows.map(row => Number(row.cells[5].textContent.replace(',', '.'))));
      assert.ok(points.every((value, i) => i === 0 || points[i - 1] >= value));
      const firstName = await rows.first().locator('a').textContent();
      await page.locator('#finder-search').fill(firstName);
      assert.ok(await rows.count() >= 1);
      await page.locator('#finder-search').fill('zz-no-such-player');
      assert.equal(await rows.count(), 0);
      assert.ok(await page.locator('#finder-status').textContent());
      await page.locator('#finder-search').fill('');

      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}px in ${lang}`);
        assert.ok(await page.locator('.finder-results').evaluate(el => el.scrollWidth > el.clientWidth));
        assert.ok(await page.locator('#finder-search').evaluate(el => el.offsetHeight >= 44));
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      console.log(`Finder ${lang}: navigation, links, SEO, filters and mobile layout passed`);
    }

    await page.route('**/assets/data.json', route => route.fulfill({ status: 503 }));
    await page.goto(origin + '/en/player-finder/');
    await page.getByRole('status').filter({ hasText: 'Could not load players.' }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
} finally {
  server.close();
}
