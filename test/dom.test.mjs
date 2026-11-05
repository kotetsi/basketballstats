import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar, parseBox, matchEL, gameDate } from '../fantasy/dom_fetch.mjs';

test('ABA ημερολόγιο: αγώνες, ομάδες, σκορ', () => {
  const html = `<tr><td><p class="hidden-xs"><a href="https://www.aba-liga.com/match/15/26/1/Overview/q1/1/home/a-b/">Partizan Mozzart Bet <span>:</span> Krka</a></p></td><td class="scoretable"><a href="x">88 : 80</a></td></tr>
<tr><td><p class="hidden-xs"><a href="https://www.aba-liga.com/match/2/26/1/Overview/q1/1/home/c-d/">Dubai <span>:</span> Cibona</a></p></td><td class="scoretable"> </td></tr>`;
  const c = parseCalendar(html);
  assert.equal(c.length, 2); assert.deepEqual([c[0].id, c[0].played, c[0].hs, c[0].as], [15, true, 88, 80]); assert.equal(c[1].played, false); assert.equal(c[1].home, 'Dubai');
});
test('ABA box score: πίνακας ανά ομάδα, λεπτά ΜΜ:ΔΔ, 00:00, ημερομηνία', () => {
  const row = (i, m) => `<tr><td>${i}</td><td><strong><a href='/player/${i}/26/1/first-last${i}/'>Last${i} F.</a> </strong>*</td><td>${m}</td><td>5</td></tr>`;
  const tbl = (club, n) => `<h4 class="x">${club}</h4> <div class="table-responsive"> <table class="table match_boxscore_team_table"><thead><tr><td colspan="2"></td><td>Min</td></tr></thead>${Array.from({ length: n }, (_, i) => row(i, i === 0 ? '00:00' : i === 1 ? '25:30' : '10:00')).join('')}</table></div>`;
  const html = `<p>05.11.2026 20:00</p>${tbl('Partizan Mozzart Bet', 6)}${tbl('Krka', 7)}`;
  const t = parseBox(html);
  assert.equal(t.length, 2); assert.equal(t[0].club, 'Partizan Mozzart Bet'); assert.equal(t[0].players[0].min, 0); assert.equal(t[0].players[1].min, 25.5); assert.equal(t[0].players[1].slug, 'first-last1'); assert.equal(t[1].players.length, 7);
  assert.equal(gameDate(html), '2026-11-05');
});
test('αντιστοίχιση ονόματος ABA → EuroLeague μέσα στην ίδια ομάδα', () => {
  const pl = [{ c: '1', n: 'NWORA, JORDAN', t: 'RED' }, { c: '2', n: 'NWORA, OTHER', t: 'PAR' }, { c: '3', n: 'DOBRIC, OGNJEN', t: 'RED' }];
  assert.equal(matchEL('jordan-nwora', 'RED', pl)?.c, '1');
  assert.equal(matchEL('ognjen-dobric', 'RED', pl)?.c, '3');
  assert.equal(matchEL('unknown-guy', 'RED', pl), null);
});
