// Stoiximan GBL: ανάγνωση των σελίδων του esake.gr (src/gbl/esake.mjs), με δείγματα στο test/fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseResults, parseBox, checkBox, parseDate, text } from '../src/gbl/esake.mjs';

const R = fs.readFileSync(new URL('./fixtures/gbl-results.html', import.meta.url), 'utf8');
const B = fs.readFileSync(new URL('./fixtures/gbl-box.html', import.meta.url), 'utf8');

test('ημερομηνίες: Σεπ–Δεκ στο πρώτο έτος της σεζόν, Ιαν–Αυγ στο δεύτερο', () => {
  assert.equal(parseDate('Σαβ 21 Νοε - 15:00', 'G2026'), '2026-11-21T15:00');
  assert.equal(parseDate('Κυρ 5 Ιαν - 16:00', 'G2026'), '2027-01-05T16:00');
  assert.equal(parseDate('Τετ 3 Μαΐ', 'G2025'), '2026-05-03');
  assert.equal(parseDate('—', 'G2026'), null);
});

test('Game Center: αγώνες, ομάδες, σκορ, περίοδοι, μη τελειωμένοι', () => {
  const g = parseResults(R, 'G2026');
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].id, g[0].round, g[0].hs, g[0].as, g[0].played], ['3C7521D5', 8, 35, 41, true]);
  assert.deepEqual(g[0].home, { logo: '00000011', name: 'ΚΟΛΟΣΣΟΣ H HOTELS COLLECTION' });
  assert.deepEqual(g[0].away, { logo: '00000010', name: 'ΑΕΚ' });
  assert.deepEqual(g[0].quarters.at(-1), ['OT1', 7, 10]);
  assert.equal(g[1].played, false);
  assert.equal(g[1].hs, null);
  assert.equal(g[1].away.name, 'ΠΡΟΜΗΘΕΑΣ ΠΑΤΡΑΣ');
});

test('box score: παίκτες, σουτ, λεπτά, PIR, σύνολα και έλεγχος με το σκορ', () => {
  const b = parseBox(B), [g] = parseResults(R, 'G2026');
  assert.equal(b.teams.length, 2);
  const [h, a] = b.teams;
  assert.equal(h.team, '00000017');
  assert.equal(h.players.length, 3);
  const f = h.players.find(p => p.pid === '9DBC8FE2');
  assert.deepEqual([f.name, f.no, f.pts, f.f2m, f.f2a, f.ftm, f.fta, f.reb, f.oreb, f.secs, f.pir], ['FORRESTER JAKOB', 8, 22, 9, 12, 4, 5, 13, 5, 2230, 34]);
  assert.equal(h.totals.pts, 35);
  assert.equal(a.totals.pts, 41);
  assert.equal(h.team_reb.reb, 5);
  assert.deepEqual(checkBox(b, g), []);
  assert.ok(checkBox(b, { ...g, hs: 36 }).length, 'λάθος σκορ → απόρριψη');
});

test('κείμενο: <br> και &nbsp; γίνονται κενά', () => assert.equal(text('Α<br>Β&nbsp;Γ'), 'Α Β Γ'));

test('αγωνιστικές φάσης και playoffs', async () => {
  const { parseSeries, resultsUrl, PHASES } = await import('../src/gbl/esake.mjs');
  const h = "<script>$j('#series').append(new Option('QF1', '201'));</script><script>$j('#series').append(new Option('F1', '401'));$j('#series').append(new Option('F1', '401'));</script>";
  assert.deepEqual(parseSeries(h), [{ value: '201', label: 'QF1' }, { value: '401', label: 'F1' }]);
  assert.match(resultsUrl('44B80BEB', PHASES.playoffs, '201'), /idseason=00000002&series=201$/);
});
