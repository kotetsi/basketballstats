#!/usr/bin/env node
// Offline JSON importer: node scripts/import-player-props.mjs input.json > normalized.json
// Reads an explicitly supplied file only. No network calls and no automatic data collection.
import fs from 'node:fs/promises';
import { normalizePropsSnapshot } from '../src/odds/import-props.mjs';

const file = process.argv[2];
if (!file || file === '--help') {
  console.log('Usage: node scripts/import-player-props.mjs <snapshot.json> [provider]');
  console.log('Reads a provider-neutral JSON snapshot and writes normalized JSON to stdout.');
  process.exit(file ? 0 : 2);
}
try {
  const input = JSON.parse(await fs.readFile(file, 'utf8'));
  const output = normalizePropsSnapshot(input, { provider: process.argv[3] || 'manual' });
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
} catch (error) {
  console.error(`Player Props import rejected: ${error.message}`);
  process.exitCode = 1;
}
