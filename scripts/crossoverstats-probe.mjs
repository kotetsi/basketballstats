#!/usr/bin/env node
/**
 * One-shot, read-only connectivity probe for the public CrossoverStats EuroLeague props board.
 *
 * This is deliberately NOT a scheduled collector:
 * - one HTTP GET only;
 * - no login, cookies, API discovery, proxy, or anti-bot bypass;
 * - no persistence of prices or page content;
 * - exits with a clear status if the page has no current EuroLeague prices.
 *
 * Before turning this into an automated data feed, review CrossoverStats terms and obtain
 * permission for automated collection/reuse. robots.txt alone is not legal permission.
 *
 * Usage: node scripts/crossoverstats-probe.mjs
 */
const URL = 'https://crossoverstats.com/props?league=euroleague&sort=edge';
const UA = 'BasketballStats public-page availability probe (+https://basketballstats.eu)';
const timeout = AbortSignal.timeout(15000);

function stripHtml(value) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRows(html) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => stripHtml(m[1]));
  return rows.filter(row =>
    /\b(points|rebounds|assists|three pointers made)\b/i.test(row) &&
    /\b\d+(?:\.\d+)?\b/.test(row) &&
    /\b(?:iddaa|unibet|pinnacle)\b/i.test(row)
  );
}

async function main() {
  console.log('CrossoverStats EuroLeague public-page probe');
  console.log('URL:', URL);
  const response = await fetch(URL, {
    method: 'GET',
    headers: { 'user-agent': UA, accept: 'text/html' },
    signal: timeout,
    redirect: 'follow',
  });

  console.log('HTTP status:', response.status);
  console.log('Final URL:', response.url);
  console.log('Content-Type:', response.headers.get('content-type') || 'unknown');

  if (!response.ok) {
    console.error('RESULT: page unavailable; no data collected.');
    process.exitCode = 2;
    return;
  }

  const html = await response.text();
  const text = stripHtml(html);
  const rows = extractRows(html);
  const noPrices = /no prices are up yet|nothing priced right now/i.test(text);

  if (noPrices || rows.length === 0) {
    console.log('RESULT: no current EuroLeague price rows were found in the returned HTML.');
    console.log('Page says no prices:', noPrices ? 'yes' : 'not detected');
    console.log('Parsed prop rows:', rows.length);
    console.log('Likely explanation: no current lines, or the board is rendered client-side.');
    console.log('No page data or odds were saved.');
    process.exitCode = 3;
    return;
  }

  console.log('RESULT: current-looking public rows found:', rows.length);
  console.log('Sample rows (maximum 5):');
  for (const row of rows.slice(0, 5)) console.log('-', row);
  console.log('No page data or odds were saved.');
  console.log('This probe does not establish permission for scheduled scraping or commercial reuse.');
}

main().catch(error => {
  console.error('RESULT: probe failed:', error.message);
  process.exitCode = 1;
});
