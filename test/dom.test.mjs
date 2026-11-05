import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar, parseBox, matchEL, gameDate } from '../fantasy/dom_fetch.mjs';

test('ABA ημερολόγιο: αγώνες, ομάδες, σκορ', () => {
  const html = `<tr><td><p class="hidden-xs"><a href="https://www.aba-liga.com/match/15/26/1/Overview/q1/1/home/a-b/">Partizan Mozzart Bet <span>:</span> Krka</a></p></td><td class="scoretable"><a href="x">88 : 80</a></td></tr>
<tr><td><p class="hidden-xs"><a href="https://www.aba-liga.com/match/2/26/1/Overview/q1/1/home/c-d/">Dubai <span>:</span> Cibona</a></p></td><td class="scoretable"> </td></tr>`;
  const c = parseCalendar(html);
  assert.equal(c.length, 2); assert.deepEqual([c[0].id, c[0].played, c[0].hs, c[0].as], [15, true, 88, 80]); assert.equal(c[1].played, false); assert.equal(c[1].home, 'Dubai');
});
test('ABA box score: στήλη Min, DNP, ημερομηνία', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => `<tr><td><a href="/player/${i}/26/1/x/">Player${i} Name</a></td><td>${i === 0 ? 'DNP' : i === 1 ? '25:30' : '10:00'}</td><td>5</td></tr>`).join('');
  const html = `<p>05.11.2026 20:00</p><table><tr><th>Player</th><th>Min</th><th>Pts</th></tr>${rows(6)}</table><table><tr><th>Player</th><th>Min</th><th>Pts</th></tr>${rows(7)}</table>`;
  const t = parseBox(html);
  assert.equal(t.length, 2); assert.equal(t[0][0].min, 0); assert.equal(t[0][1].min, 25.5); assert.equal(t[1].length, 7);
  assert.equal(gameDate(html), '2026-11-05');
});
test('αντιστοίχιση ονόματος ABA → EuroLeague μέσα στην ίδια ομάδα', () => {
  const pl = [{ c: '1', n: 'NWORA, JORDAN', t: 'RED' }, { c: '2', n: 'NWORA, OTHER', t: 'PAR' }, { c: '3', n: 'DOBRIC, OGNJEN', t: 'RED' }];
  assert.equal(matchEL('Nwora Jordan', 'RED', pl)?.c, '1');
  assert.equal(matchEL('Dobrić Ognjen', 'RED', pl)?.c, '3');
  assert.equal(matchEL('Unknown Guy', 'RED', pl), null);
});
