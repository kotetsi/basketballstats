import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const site = 'https://basketballstats.eu';

for (const lang of ['', 'en/', 'es/', 'sr/', 'tr/']) {
  test(`portal navigation and homepage links resolve: ${lang || 'el'}`, async () => {
    const html = await fs.readFile(path.join(dist, lang, 'index.html'), 'utf8');
    const nav = html.match(/<nav class="nav"[\s\S]*?<\/nav>/)?.[0] || '';
    const main = html.match(/<main class="wrap portal-home">[\s\S]*?<\/main>/)?.[0] || '';
    assert.ok(nav && main, 'localized portal navigation and main content exist');

    const hrefs = [...(nav + main).matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    assert.ok(hrefs.length >= 18, 'expected navigation, hero, card and Match Center links');
    for (const href of hrefs) {
      if (/^(?:https?:|mailto:|tel:|#|javascript:)/i.test(href)) continue;
      const url = new URL(href, site);
      const target = path.join(dist, decodeURIComponent(url.pathname));
      const file = url.pathname.endsWith('/') ? path.join(target, 'index.html') : target;
      await assert.doesNotReject(fs.access(file), `${lang || 'el'} link target missing: ${href}`);
    }
  });
}
