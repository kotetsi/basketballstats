// NBA: σελίδες (src/nba/pages.mjs): ζώνες σουτ, βαθμολογία ανά περιφέρεια, shot chart, παραγωγή σελίδων.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zoneOf, nbaStandings, shotChartSvg, nbaPages } from '../src/nba/pages.mjs';

test('ζώνες σουτ από τη θέση (πόδια, καλάθι στο 25,0)', () => {
  assert.equal(zoneOf(25, 1, 2), 'rim'); assert.equal(zoneOf(20, 10, 2), 'paint'); assert.equal(zoneOf(10, 15, 2), 'mid');
  assert.equal(zoneOf(1, 0, 3), 'c3'); assert.equal(zoneOf(25, 25, 3), 'ab3');
});

const T = (abbr, name) => ({ abbr, name });
const g = (id, h, a, hs, as, date) => ({ id, date, type: 2, played: hs != null, home: { ...T(h, h), score: hs }, away: { ...T(a, a), score: as }, box: hs != null });

test('βαθμολογία: Ανατολή/Δύση, ποσοστό, διαφορά από τον πρώτο, σερί', () => {
  const st = nbaStandings([g('1', 'NY', 'MIA', 110, 100, '2026-11-01T00:00Z'), g('2', 'MIA', 'NY', 90, 100, '2026-11-03T00:00Z'), g('3', 'LAL', 'GS', 120, 99, '2026-11-02T00:00Z')]);
  assert.deepEqual(st.E.map(t => [t.abbr, t.w, t.l, t.gb, t.streak]), [['NY', 2, 0, 0, 'Ν2'], ['MIA', 0, 2, 2, 'Η2']]);
  assert.equal(st.W[0].abbr, 'LAL');
});

test('shot chart: εύστοχα κύκλοι, άστοχα ×, όχι τα σουτ από το άλλο μισό', () => {
  const svg = shotChartSvg([[1, 0, '1', 'p', null, 25, 1, 1, 2, 0], [1, 0, '1', 'p', null, 2, 25, 0, 3, 0], [4, 0, '1', 'p', null, 25, 70, 0, 3, 0]]);
  assert.equal((svg.match(/class="sc-m"/g) || []).length, 1);
  assert.equal((svg.match(/class="sc-x"/g) || []).length, 1);
});

test('σελίδες: αρχική, ενότητες, ομάδες, παίκτης με ελληνικό όνομα', () => {
  const pl = (id, name, pts) => ({ id, name, pos: 'F', starter: true, dnp: false, min: 34, pts, reb: 10, oreb: 2, ast: 5, stl: 1, blk: 1, tov: 3, pf: 2, fgm: 10, fga: 18, f3m: 1, f3a: 3, ftm: pts - 21, fta: 10, pm: 5 });
  const box = { hs: 110, as: 100, teams: [{ id: '18', abbr: 'NY', players: [pl('9', 'Jalen Brunson', 110)], totals: { pts: 110, fga: 80, fgm: 40, f3m: 10, f3a: 30, ftm: 20, fta: 25, oreb: 10, dreb: 30, tov: 12, ast: 25 } },
    { id: '14', abbr: 'MIA', players: [pl('3032977', 'Giannis Antetokounmpo', 100)], totals: { pts: 100, fga: 85, fgm: 38, f3m: 8, f3a: 28, ftm: 16, fta: 20, oreb: 12, dreb: 28, tov: 14, ast: 20 } }],
    shots: [[1, 600, '14', '3032977', null, 25, 1, 1, 2, 110]] };
  const N = { cur: 'N2026', seasons: { N2026: [g('1', 'NY', 'MIA', 110, 100, '2026-11-01T00:00Z')] }, box: { N2026: { 1: box } }, model: null, proj: null };
  const P = nbaPages(N, { esc: s => String(s), slugify: s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-'), url: k => '/' + k.replace(':', '/') + '/', siteUrl: 'https://x', siteName: 'BS', home: '/' });
  for (const k of ['nba', 'nba:programma', 'nba:prognostika', 'nba:provoles', 'nba:koryfaioi', 'nba:statistika-omadon', 'nba:knicks', 'nba:heat']) assert.ok(P.some(p => p.key === k), k);
  const gi = P.find(p => p.key === 'nba:heat/giannis-antetokounmpo');
  assert.ok(gi); assert.match(gi.main, /Γιάννης Αντετοκούνμπο/);
});
