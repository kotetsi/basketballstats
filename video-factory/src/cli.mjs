#!/usr/bin/env node
// node video-factory/src/cli.mjs <command>
//   story <type> key=value...      build a story from data (saved as draft)
//   approve-story <id>             approve a story for production
//   produce <storyId> [formats=9x16,16x9] [preset=medium] [voice=local-en] [style=energetic] [mode=final] [llm=1]
//   list                           stories and productions
import { loadConfig } from './config.mjs';
import { loadModel } from './data/model.mjs';
import { buildStory } from './stories/builders.mjs';
import { StoryStore } from './stories/store.mjs';
import { Productions } from './productions/pipeline.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const kv = Object.fromEntries(rest.filter(a => a.includes('=')).map(a => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]));
const pos = rest.filter(a => !a.includes('='));
const cfg = loadConfig();
const log = m => console.log(`  ${m}`);

if (cmd === 'story') {
  const s = new StoryStore(cfg.storiesDir).save(buildStory(loadModel(cfg.dataDir), { type: pos[0], params: kv }));
  console.log(`story ${s.id} (draft): ${s.title}`);
} else if (cmd === 'approve-story') {
  console.log('approved', new StoryStore(cfg.storiesDir).approve(pos[0]).id);
} else if (cmd === 'produce') {
  const P = new Productions(cfg, { log });
  let p = P.create({ storyId: pos[0], formats: (kv.formats || '9x16,16x9').split(','), preset: kv.preset || 'medium', voiceId: kv.voice || 'local-en', style: kv.style || 'energetic' });
  console.log('production', p.id);
  p = await P.script(p.id, { useLlm: kv.llm !== '0' });
  console.log(`script: ${p.script.generator}, ~${p.script.estSecs}s, facts ${p.script.factCheck.ok ? 'OK' : p.script.factCheck.unsupported}${p.script.llmNote ? ` (${p.script.llmNote})` : ''}`);
  p = await P.render(p.id, { mode: kv.mode || 'final' });
  for (const r of p.renders) console.log(`${r.mode} ${r.format} ${r.w}x${r.h} ${r.secs}s ${(r.bytes / 1e6).toFixed(1)}MB in ${r.renderSecs}s → video-factory/${r.file}`);
} else if (cmd === 'list') {
  for (const s of new StoryStore(cfg.storiesDir).list()) console.log(`story ${s.status.padEnd(8)} ${s.id}`);
  for (const p of new Productions(cfg).list()) console.log(`prod  ${p.status.padEnd(9)} ${p.id}`);
} else {
  console.log('commands: story, approve-story, produce, list (see header of src/cli.mjs)');
}
