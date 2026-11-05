import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, nameIndex, matchPlayers, parseRSS, teamsIn, isEL } from '../fantasy/press_fetch.mjs';

const players = [{ c: '1', n: 'VEZENKOV, SASHA', t: 'OLY' }, { c: '2', n: 'NUNN, KENDRICK', t: 'PAN' }, { c: '3', n: 'SLOUKAS, KOSTAS', t: 'PAN' }];
const idx = nameIndex(players, { 'VEZENKOV, SASHA': 'Σάσα Βεζένκοφ', 'SLOUKAS, KOSTAS': 'Κώστας Σλούκας' });
test('κατάταξη τίτλων', () => {
  assert.equal(classify('Kendrick Nunn ruled out with ankle sprain'), 'injury');
  assert.equal(classify('Sasha Vezenkov returns to practice'), 'return');
  assert.equal(classify('Nunn questionable for Thursday'), 'doubtful');
  assert.equal(classify('Χάνει το ματς ο Σλούκας λόγω θλάσης'), 'injury');
  assert.equal(classify('Αμφίβολος ο Βεζένκοφ για την Πέμπτη'), 'doubtful');
  assert.equal(classify('Panathinaikos wins in Madrid'), null);
  assert.equal(classify('Ο Ολυμπιακός νίκησε εκτός έδρας'), null);
});
test('αναγνώριση παικτών σε λατινικά και ελληνικά', () => {
  assert.deepEqual(matchPlayers('Kendrick Nunn ruled out', idx).map(p => p.c), ['2']);
  assert.deepEqual(matchPlayers('Αμφίβολος ο Βεζένκοφ', idx).map(p => p.c), ['1']);
  assert.deepEqual(matchPlayers('Sloukas and Nunn both out', idx).map(p => p.c).sort(), ['2', '3']);
  assert.equal(matchPlayers('Team news', idx).length, 0);
});
test('RSS: τίτλος, link, ημερομηνία (CDATA, entities)', () => {
  const xml = `<rss><channel><item><title><![CDATA[Nunn out &amp; doubtful]]></title><link>https://x.y/a</link><pubDate>Thu, 05 Nov 2026 10:00:00 +0000</pubDate><description>κείμενο που δεν κρατάμε</description></item></channel></rss>`;
  const it = parseRSS(xml);
  assert.equal(it.length, 1); assert.equal(it[0].title, 'Nunn out & doubtful'); assert.equal(it[0].link, 'https://x.y/a'); assert.ok(it[0].ts.startsWith('2026-11-05'));
  assert.equal(Object.keys(it[0]).includes('description'), false);
});
test('ροή τίτλων: ομάδες και EuroLeague', () => {
  assert.deepEqual(teamsIn('Real Madrid beat Panathinaikos'), ['MAD', 'PAN']);
  assert.deepEqual(teamsIn('Ο Παναθηναϊκός πήρε το ντέρμπι με τον Ολυμπιακό'), ['OLY', 'PAN']);
  assert.deepEqual(teamsIn('NBA: Lakers win'), []);
  assert.equal(isEL('EuroLeague Round 10 preview'), true);
});
