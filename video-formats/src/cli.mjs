#!/usr/bin/env node
// node video-formats/src/cli.mjs <command>
//   list                         all formats with availability and missing data
//   generate <formatId> [k=v]    build validated production requests (printed; add save=1 to store as draft stories)
//   calendar [days=14]           editorial suggestions
//   performance                  performance by format
import path from 'node:path';
import { loadConfig } from '../../video-factory/src/config.mjs';
import { StoryStore } from '../../video-factory/src/stories/store.mjs';
import { loadContext } from './datasets.mjs';
import { loadFormats, availability, generate, loadSettings } from './engine.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const kv = Object.fromEntries(rest.filter(a => a.includes('=')).map(a => [a.split('=')[0], isNaN(+a.split('=')[1]) ? a.split('=')[1] : +a.split('=')[1]]));
const pos = rest.filter(a => !a.includes('='));
const cfg = loadConfig();
const ctx = loadContext(cfg.dataDir);
const formats = await loadFormats();
const settings = loadSettings();

if (cmd === 'list') {
  for (const s of formats) { const a = availability(ctx, s, settings); console.log(`${String(s.number).padStart(2)} ${a.status.padEnd(12)} ${s.id.padEnd(26)} ${a.missing.map(m => m.detail).join('; ')}`); }
} else if (cmd === 'generate') {
  const s = formats.find(x => x.id === pos[0]); if (!s) throw new Error('unknown format');
  const r = await generate(ctx, s, kv, settings);
  console.log(`availability: ${r.availability.status} (${r.availability.reason})`);
  for (const q of r.requests) { console.log(`\n# ${q.id} · ${q.title} · est ${JSON.stringify(q.estSecs)}`); for (const seg of q.scripts[s.durations.recommended]) console.log(`  [${seg.role}/${seg.scene}] ${seg.text}`); if (kv.save) { new StoryStore(cfg.storiesDir).save(q); console.log('  saved as draft story'); } }
  for (const x of r.rejected) console.log(`rejected ${x.key}: ${x.problems.join(' | ')}`);
} else if (cmd === 'calendar') {
  const { buildCalendar } = await import('./calendar.mjs');
  const c = await buildCalendar(ctx, formats, { days: kv.days || 14, settings, productionsDir: cfg.productionsDir });
  for (const d of c.days) console.log(`${d.date} ${d.gameDay ? '🏀' : '  '} ${d.slots.map(s => `${s.formatId}${s.show ? `(${s.show})` : ''}`).join(', ')}`);
} else if (cmd === 'performance') {
  const { performanceByFormat } = await import('./analytics.mjs');
  console.log(JSON.stringify(performanceByFormat(cfg.productionsDir, formats), null, 2));
} else console.log('commands: list, generate <id>, calendar, performance');
