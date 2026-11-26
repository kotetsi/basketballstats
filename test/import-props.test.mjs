import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePropsSnapshot } from '../src/odds/import-props.mjs';

const now = Date.parse('2026-11-27T10:00:00Z');
const sample = () => ({
  capturedAt: '2026-11-27T09:00:00Z',
  events: [{
    eventId: 'game-1', home: 'Olympiacos', away: 'Real Madrid', commence: '2026-11-27T19:00:00Z',
    books: [{ key: 'iddaa', title: 'iddaa', props: [
      { playerId: 'p1', name: 'Player One', stat: 'pts', line: 14.5, over: 1.9, under: 1.9 },
      { name: 'Player Two', stat: 'reb', line: 5.5, over: 1.8 }
    ] }]
  }]
});

test('normalizes explicit snapshot to existing event/book/props shape', () => {
  const out = normalizePropsSnapshot(sample(), { now });
  assert.equal(out.provider, 'manual');
  assert.equal(out.events[0].books[0].key, 'iddaa');
  assert.deepEqual(out.events[0].books[0].markets.props[0], {
    playerId: 'p1', name: 'Player One', stat: 'pts', line: 14.5, over: 1.9, under: 1.9,
    upd: '2026-11-27T09:00:00.000Z'
  });
  assert.equal(out.events[0].books[0].markets.props[1].under, null);
});

test('rejects stale snapshots', () => {
  const x = sample(); x.capturedAt = '2026-11-20T00:00:00Z';
  assert.throws(() => normalizePropsSnapshot(x, { now }), /stale/i);
});

test('rejects unknown markets, invalid odds and duplicate props', () => {
  const x = sample(); x.events[0].books[0].props[0].stat = 'blocks';
  assert.throws(() => normalizePropsSnapshot(x, { now }), /Unknown stat/);
  const y = sample(); y.events[0].books[0].props[0].over = 1;
  assert.throws(() => normalizePropsSnapshot(y, { now }), /decimal odds/);
  const z = sample(); z.events[0].books[0].props.push({ ...z.events[0].books[0].props[0] });
  assert.throws(() => normalizePropsSnapshot(z, { now }), /Duplicate prop/);
});

test('rejects duplicate events and future timestamps', () => {
  const x = sample(); x.events.push({ ...x.events[0] });
  assert.throws(() => normalizePropsSnapshot(x, { now }), /Duplicate eventId/);
  const y = sample(); y.capturedAt = '2026-11-27T11:00:00Z';
  assert.throws(() => normalizePropsSnapshot(y, { now }), /future/);
});
