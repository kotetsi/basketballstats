import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve('dist');
const output = path.resolve('artifacts/portal-preview');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep) && target !== root) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const stat = await fs.stat(target);
    if (stat.isDirectory()) target = path.join(target, 'index.html');
    const data = await fs.readFile(target);
    res.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

async function assertConsentDoesNotCoverContent(page, label) {
  const consent = page.locator('#ccb');
  if (!(await consent.count())) return;
  const layout = await consent.evaluate(el => ({
    position: getComputedStyle(el).position,
    isFirstBodyChild: document.body.firstElementChild === el
  }));
  if (layout.position === 'fixed' || !layout.isFirstBodyChild) {
    throw new Error('Cookie consent banner may overlap page content on ' + label);
  }
}

await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const locales = [
    ['el', '/'],
    ['en', '/en/'],
    ['es', '/es/'],
    ['sr', '/sr/'],
    ['tr', '/tr/']
  ];

  for (const [locale, url] of locales) {
    const response = await desktop.goto('http://127.0.0.1:4173' + url, { waitUntil: 'networkidle' });
    if (!response?.ok()) throw new Error('Homepage failed to load for ' + locale + ': ' + response?.status());
    await assertConsentDoesNotCoverContent(desktop, locale);
    const legacyHeader = desktop.locator('.shero');
    if (await legacyHeader.count() && await legacyHeader.first().isVisible()) {
      throw new Error('Legacy standings header is still visible on ' + locale + ' portal homepage');
    }
    await desktop.screenshot({ path: path.join(output, 'portal-' + locale + '-desktop.png'), fullPage: true });
  }

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  const response = await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error('Greek mobile homepage failed to load: ' + response?.status());
  await assertConsentDoesNotCoverContent(mobile, 'mobile');
  await mobile.screenshot({ path: path.join(output, 'portal-el-mobile.png'), fullPage: true });

  console.log('Saved six portal screenshots to artifacts/portal-preview.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
