// Append pregame Fantasy availability/status snapshots for leakage-safe backtests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function statusRows(snapshot, capturedAt = new Date().toISOString()) {
  if (!snapshot || !Array.isArray(snapshot.players) || !snapshot.generated) {
    throw new Error('Invalid data/fantasy/latest.json snapshot');
  }
  return snapshot.players.map(p => ({
    captured_at: capturedAt,
    snapshot_generated_at: snapshot.generated,
    round: snapshot.round ?? null,
    player_id: String(p.c),
    player_name: p.n ?? null,
    team: p.t ?? null,
    status: p.status ?? 'unknown',
    status_source: p.status_src ?? 'unknown',
    status_detail: p.status_detail ?? null,
  }));
}

// Deduplicate by source snapshot + player, while retaining later snapshots
// even when the player's status did not change (they establish continued availability).
export function freshStatusRows(existingLines, rows) {
  const seen = new Set();
  for (const line of existingLines || []) {
    try {
      const x = JSON.parse(line);
      seen.add(x.snapshot_generated_at + '|' + x.player_id);
    } catch { /* Ignore malformed legacy lines; do not let them block capture. */ }
  }
  const fresh = [];
  for (const row of rows) {
    const key = row.snapshot_generated_at + '|' + row.player_id;
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(row);
  }
  return fresh;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const latestPath = path.join(root, 'data/fantasy/latest.json');
  const historyPath = path.join(root, 'data/fantasy/status-history.jsonl');
  const snapshot = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  const rows = statusRows(snapshot);
  const existing = fs.existsSync(historyPath)
    ? fs.readFileSync(historyPath, 'utf8').split(/\r?\n/).filter(Boolean)
    : [];
  const fresh = freshStatusRows(existing, rows);
  if (fresh.length) fs.appendFileSync(historyPath, fresh.map(x => JSON.stringify(x)).join('\n') + '\n');
  console.log(JSON.stringify({ snapshot: snapshot.generated, round: snapshot.round, players: rows.length, appended: fresh.length, history: historyPath }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
