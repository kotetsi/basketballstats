import test from 'node:test';
import assert from 'node:assert/strict';
import { statusRows, freshStatusRows } from '../scripts/fantasy-status-history.mjs';

test('status snapshots retain source and timestamp for each player', () => {
  const rows = statusRows({ generated:'2026-11-16T10:00:00Z',round:12,players:[
    {c:'1',n:'PLAYER, A',t:'OLY',status:'injured',status_src:'injury_list'},
    {c:'2',n:'PLAYER, B',t:'PAN',status:'doubtful',status_src:'missed_games_rule'}
  ]},'2026-11-16T10:01:00Z');
  assert.equal(rows.length,2);
  assert.equal(rows[0].status,'injured');
  assert.equal(rows[0].status_source,'injury_list');
  assert.equal(rows[0].snapshot_generated_at,'2026-11-16T10:00:00Z');
  assert.equal(rows[1].status_source,'missed_games_rule');
});

test('invalid or missing player snapshot is rejected', () => {
  assert.throws(()=>statusRows({players:[]}),/Invalid/);
});

test('re-running the same snapshot does not append duplicate player rows', () => {
  const rows = statusRows({generated:'2026-11-16T10:00:00Z',players:[{c:'1'},{c:'2'}]},'2026-11-16T10:01:00Z');
  const existing = [JSON.stringify(rows[0])];
  assert.deepEqual(freshStatusRows(existing, rows).map(x=>x.player_id), ['2']);
  assert.deepEqual(freshStatusRows([...existing, JSON.stringify(rows[1])], rows), []);
});

test('a later snapshot is retained even when status is unchanged', () => {
  const first = statusRows({generated:'2026-11-16T10:00:00Z',players:[{c:'1',status:'playing'}]});
  const later = statusRows({generated:'2026-11-16T15:00:00Z',players:[{c:'1',status:'playing'}]});
  assert.equal(freshStatusRows([JSON.stringify(first[0])], later).length, 1);
});

test('malformed legacy lines do not block valid status rows', () => {
  const rows = statusRows({generated:'2026-11-16T10:00:00Z',players:[{c:'1'}]});
  assert.equal(freshStatusRows(['{not json'], rows).length, 1);
});
