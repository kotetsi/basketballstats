import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPropsMarket } from '../scripts/props-market-audit.mjs';

const now = Date.parse('2026-11-16T00:00:00Z');
const registry = { brands: {
  stoiximan: { brand: 'Stoiximan', greek_prices: 'confirmed', feeds: ['stoiximan'] },
  bet365: { brand: 'bet365', greek_prices: 'confirmed', feeds: ['bet365.gr'] },
  foreign: { brand: 'Foreign', greek_prices: 'unconfirmed', feeds: ['foreign'] },
} };
const latest = { provider: 'oddspapi', updated: '2026-11-15T23:00:00Z', games: {
  'E-1-OLY-PAN': { commence: '2026-11-17T19:00:00Z', books: {
    stoiximan: { upd: '2026-11-15T22:00:00Z', props: [
      { name: 'Player A', stat: 'pts', line: 15.5, over: 1.9, under: 1.9 },
      { name: 'Player B', stat: 'reb', line: 5.5, over: 1.8 },
    ] },
    'bet365.gr': { upd: '2026-11-15T21:00:00Z', props: [
      { name: 'Player A', stat: 'pts', line: 15.5, over: 1.95, under: 1.85 },
    ] },
    foreign: { upd: '2026-11-15T23:00:00Z', props: [{ name: 'Player C', stat: 'pts', line: 10.5, over: 1.9, under: 1.9 }] },
  } },
  'E-1-MAD-BAR': { commence: '2026-11-18T19:00:00Z', books: { stoiximan: { props: [] } } },
  'E-0-OLD': { commence: '2026-11-15T19:00:00Z', books: { stoiximan: { props: [] } } },
} };

test('market audit counts only confirmed Greek feeds and complete prop pairs', () => {
  const r = auditPropsMarket({ latest, registry, now });
  assert.equal(r.upcomingGames, 2);
  assert.equal(r.gamesWithGreekBooks, 2);
  assert.equal(r.greekBookGameQuotes, 3);
  assert.equal(r.gamesWithPlayerProps, 1);
  assert.equal(r.totalDistinctPlayerProps, 3);
  assert.equal(r.completeOverUnderPairs, 2);
  assert.equal(r.oneSidedProps, 1);
  assert.deepEqual(r.bookmakers.map(x => x.feed).sort(), ['bet365.gr', 'stoiximan']);
  assert.ok(!r.events[0].books.some(x => x.feed === 'foreign'));
});

test('market audit reports snapshot coverage and missing archive', () => {
  const history = [
    { book: 'stoiximan', event: 'E-1-OLY-PAN', market: 'prop:pts', sel: 'over', player: 'Player A', line: 15.5, seen: '2026-11-15T10:00:00Z', window: 'open' },
    { book: 'stoiximan', event: 'E-1-OLY-PAN', market: 'prop:pts', sel: 'over', player: 'Player A', line: 15.5, seen: '2026-11-16T00:00:00Z', window: 'close' },
    { book: 'foreign', event: 'E-1-OLY-PAN', market: 'prop:pts', sel: 'under', player: 'Player A', line: 15.5, seen: '2026-11-16T00:00:00Z', window: 'close' },
  ];
  const r = auditPropsMarket({ latest, registry, history, status: { lastSuccess: '2026-11-16T00:00:00Z', events: 0, matched: 0 }, now });
  assert.equal(r.history.available, true);
  assert.equal(r.history.snapshots, 2);
  assert.equal(r.history.windows.open, 1);
  assert.equal(r.history.windows.close, 1);
  assert.equal(r.history.eventBookPairs, 1);
  assert.equal(r.latestQuoteUpdated, '2026-11-15T22:00:00Z');
  assert.equal(r.latestQuoteAgeHours, 2);
  assert.ok(r.warnings.some(x => x.includes('χωρίς να φέρει/αντιστοιχίσει')));
  const empty = auditPropsMarket({ latest, registry, now });
  assert.equal(empty.history.available, false);
  assert.ok(empty.warnings.some(x => x.includes('Δεν υπάρχει ακόμη αρχείο')));
});
