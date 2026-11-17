import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };
const read = file => fs.readFile(path.join(root, '.premium-data', file), 'utf8').then(JSON.parse);
const conf = JSON.parse(await fs.readFile(path.join(root, 'site.config.json'), 'utf8'));
const ON = conf.premium?.enabled === true;
const PUBLIC = ['assets/props/data.json', 'api/compare/players/metrics.json', 'api/compare/teams/metrics.json'];

test('Premium datasets are always generated privately', async () => {
  const props = await read('props/data.json');
  assert.ok(Array.isArray(props.players), 'private Prop Analyzer dataset should be generated');
  const players = await read('compare/players/metrics.json');
  assert.ok(players.seasons, 'private player comparison dataset should be generated');
  const teams = await read('compare/teams/metrics.json');
  assert.ok(teams.comps, 'private team comparison dataset should be generated');
});

test(ON ? 'Premium on: the public site build omits Premium datasets' : 'Premium off: the tools keep their public datasets', async () => {
  for (const file of PUBLIC) assert.equal(await exists(path.join(root, 'dist', file)), !ON, file + (ON ? ' must not be published in dist' : ' must stay public while Premium is off'));
});
