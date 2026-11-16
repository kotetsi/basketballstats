import test from 'node:test';
import assert from 'node:assert/strict';
import { statusRows } from '../scripts/fantasy-status-history.mjs';

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
