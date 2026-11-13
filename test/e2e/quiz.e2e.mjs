import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { quizQuestions } from '../../src/quiz/questions.mjs';

const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    let file = path.join('dist', new URL(req.url, 'http://localhost').pathname);
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/html' }).end(content);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(0);
await once(server, 'listening');
const origin = 'http://localhost:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 360, height: 760 } });
  await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const date = new Date('2026-11-13T12:00:00Z');
    const OriginalDate = Date;
    window.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [date.valueOf()])); }
    };
    Object.defineProperty(navigator, 'share', { value: async payload => { window.lastShare = payload; } });
  });
  await page.goto(origin + '/en/');
  await page.locator('nav [data-v="quiz"]').click();
  assert.equal(new URL(page.url()).pathname, '/en/quiz/');
  const buttons = page.locator('.quiz-options button');
  await buttons.first().waitFor();
  const { pool, season } = JSON.parse(await page.locator('#quiz-data').textContent());
  const questions = quizQuestions(pool, season + '/2026-11-13');
  const { players } = await (await fetch(origin + '/assets/data.json')).json();
  assert.ok(pool.every(player => players.some(source => String(source.c) === player.id)));
  for (const [i, question] of questions.entries()) {
    assert.equal(await page.locator('.quiz-progress').textContent(), 'Question ' + (i + 1) + ' of 5');
    assert.deepEqual(await buttons.allTextContents(), question.options.map(option => option.name));
    await buttons.nth(i === 0 ? (question.correct + 1) % 4 : question.correct).click();
    assert.equal(await page.locator('.quiz-options button:disabled').count(), 4);
    assert.ok((await page.locator('.quiz-feedback').textContent()).includes(question.options[question.correct].name));
    await page.locator('[data-action="next"]').click();
  }
  assert.equal(await page.locator('#quiz-heading').textContent(), 'Score 4/5');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.lastShare), { text: 'EuroLeague Quiz · 2026-11-13 · 4/5', url: origin + '/en/quiz/' });
  await page.getByRole('button', { name: 'Copy score' }).click();
  await page.getByText('Score copied.').waitFor();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /4\/5\r?\n.*\/en\/quiz\/$/);
  await page.getByRole('button', { name: 'Play again' }).click();
  assert.deepEqual(await buttons.allTextContents(), questions[0].options.map(option => option.name));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
  assert.match(await page.locator('link[rel="canonical"]').getAttribute('href'), /\/en\/quiz\/$/);
  assert.equal(await page.locator('link[rel="alternate"][hreflang]').count(), 6);
  await page.getByRole('link', { name: 'Guess the Player →', exact: true }).click();
  assert.equal(new URL(page.url()).pathname, '/en/guess-the-player/');
  await page.locator('article a[href="/en/quiz/"]').click();
  for (const lang of ['el', 'en', 'es', 'sr', 'tr']) {
    const route = (lang === 'el' ? '/' : '/' + lang + '/') + 'quiz/';
    const html = await (await fetch(origin + route)).text();
    const sitemap = await (await fetch(origin + '/sitemap-' + lang + '.xml')).text();
    assert.ok(html.includes('<html lang="' + lang + '">'));
    assert.ok(sitemap.includes(route + '</loc>'));
  }
  assert.deepEqual(errors, []);
  console.log('Quiz browser flow, sharing, mobile layout, Guess the Player and multilingual SEO passed.');
} finally {
  await browser?.close();
  server.close();
}
