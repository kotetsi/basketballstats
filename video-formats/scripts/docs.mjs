import fs from 'node:fs';
import { loadConfig } from '../../video-factory/src/config.mjs';
import { loadContext } from '../src/datasets.mjs';
import { loadFormats, availability, FAMILIES } from '../src/engine.mjs';
const ctx = loadContext(loadConfig().dataDir); const F = await loadFormats();
let md = `# The 30 formats\n\nGenerated from the specs in \`src/formats/\` (\`node video-formats/scripts/docs.mjs\`). Availability as of data through round ${ctx.lastRound}.\n`;
for (const [fam, label] of Object.entries(FAMILIES)) {
  md += `\n## ${label}\n`;
  for (const f of F.filter(x => x.family === fam)) {
    const a = availability(ctx, f, { enabled: {} });
    md += `\n### ${f.number}. ${f.name} \`${f.id}\`\n\n**Status:** ${a.status}${a.missing.length ? `. Missing: ${a.missing.map(m => m.detail).join('; ')}` : a.status === 'planned' ? `. ${a.reason}` : ''}\n\n${f.description}\n\n`;
    md += `| | |\n|---|---|\n| Concept | ${f.concept} |\n| Audience | ${f.audience} |\n| Duration | ${f.durations.recommended} (supports ${f.durations.supported.join(', ')}) |\n| Aspect ratios | ${f.aspects.join(', ')} |\n| Required data | ${f.requires.map(r => `\`${r.dataset}\` (${r.why})`).join('; ')} |\n| Validation | ${f.validation.join('; ')} |\n| Script structure | ${f.scriptStructure.join(' → ')} |\n| Visual template | ${f.visual} |\n| Narration | ${f.narration.style}: ${f.narration.notes} |\n| Frequency | ${f.frequency} |\n| Example | ${f.example} |\n`;
  }
}
fs.writeFileSync(new URL('../docs/FORMATS.md', import.meta.url), md);
let d = `# Datasets and availability\n\nMeasured from the real files by \`src/datasets.mjs\` (data through round ${ctx.lastRound}).\n\n| Dataset | Available | Coverage | Note |\n|---|---|---|---|\n`;
for (const [k, v] of Object.entries(ctx.datasets)) d += `| \`${k}\`: ${v.label} | ${v.available ? '✓' : '✗'} | ${JSON.stringify(v.coverage).replace(/\|/g, '/')} | ${v.note || ''} |\n`;
d += `\n## How to unlock the remaining formats\n\n- **Agree or Disagree?**: add an editorial claims queue (claim text + the metric that decides it) to the dashboard; then \`editorialClaims\` becomes available.\n- **The Perfect Team**: record the Fantasy squad size and position slots in \`fantasy/official/\`; the optimiser can then use budget 100 and max 6 per team (already known).\n- **What Happened Next?**: needs career data beyond EuroLeague seasons (other leagues).\n- **The Basketball World Ranking**: needs comparable data for other competitions.\n- **The Statistical Court**, **The Rotation Lab**: data exists; only the builders are missing.\n- **Greek**: Greek scripts and labels (voice via ElevenLabs multilingual).\n\nNever generate a format whose data is missing: the engine returns \`missing-data\` or \`insufficient\` with the exact reason instead.\n`;
fs.writeFileSync(new URL('../docs/DATA.md', import.meta.url), d);
console.log('docs written');
