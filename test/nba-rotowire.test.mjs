// NBA: πεντάδες και απουσίες του Rotowire (src/nba/rotowire.mjs), με απόσπασμα της σελίδας (Χιτ–Νικς, 27/11/2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLineups, nameKey } from '../src/nba/rotowire.mjs';

const li = (pct, pos, title, text, inj) => `<li class="lineup__player is-pct-play-${pct}${inj ? ' has-injury-status' : ''}" title="x"> <div class="lineup__pos">${pos}</div> <a title="${title}" href="/basketball/player/x-1">${text}</a> ${inj ? `<span class="lineup__inj">${inj}</span>` : ''} </li>`;
const html = `<div class="lineup is-nba"><div class="lineup__time">7:00 PM ET</div><div class="lineup__abbr">MIA</div><div class="lineup__abbr">NYK</div>
<ul class="lineup__list is-visit"><li class="lineup__status is-confirmed">Confirmed Lineup</li>${li(100, 'PG', 'Davion Mitchell', 'D. Mitchell')}${li(75, 'PF', 'Giannis Antetokounmpo', 'G. Antetokounmpo', 'Prob')}<li class="lineup__title is-middle">MAY NOT PLAY</li>${li(75, 'F', 'Giannis Antetokounmpo', 'G. Antetokounmpo', 'Prob')}</ul>
<ul class="lineup__list is-home"><li class="lineup__status is-expected">Expected Lineup</li>${li(100, 'PG', 'Jalen Brunson', 'Jalen Brunson')}${li(50, 'C', 'Karl-Anthony Towns', 'K. Towns', 'Ques')}<li class="lineup__title is-middle">MAY NOT PLAY</li>${li(50, 'C', 'Karl-Anthony Towns', 'K. Towns', 'Ques')}${li(0, 'F', 'OG Anunoby', 'OG Anunoby', 'Out')}</ul></div>`;

test('πεντάδες: ομάδες με συντομογραφίες ESPN, βασικοί, «MAY NOT PLAY» με κατάσταση και πιθανότητα', () => {
  const [g] = parseLineups(html);
  assert.equal(g.away, 'MIA'); assert.equal(g.home, 'NY');          // NYK → NY όπως στο ESPN
  assert.deepEqual(g.confirmed, { away: true, home: false });
  assert.deepEqual(g.teams.NY.starters.map(p => p.name), ['Jalen Brunson', 'Karl-Anthony Towns']);
  assert.deepEqual(g.teams.NY.mayNotPlay.map(p => [p.name, p.status, p.pct]), [['Karl-Anthony Towns', 'Ques', 50], ['OG Anunoby', 'Out', 0]]);
  assert.equal(g.teams.MIA.mayNotPlay[0].status, 'Prob');
});

test('ονόματα: παύλες, τόνοι και Jr. δεν μετράνε', () => {
  assert.equal(nameKey('Karl-Anthony Towns'), nameKey('Karl Anthony Towns'));
  assert.equal(nameKey('Jaren Jackson Jr.'), nameKey('Jaren Jackson'));
  assert.equal(nameKey('Nikola Jokić'), nameKey('Nikola Jokic'));
});
