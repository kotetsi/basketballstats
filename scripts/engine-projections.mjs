// Intelligence Engine: κοινές προβλέψεις παικτών για την επόμενη αγωνιστική → data/projections/latest.json
// Είσοδοι: data/cache.json, data/fantasy/hist/<προηγούμενη σεζόν>.json, data/projections/minutes.json (fantasy/perf/minutes_hurdle.py --next),
// data/fantasy/latest.json (κατάσταση παικτών + PIR/λεπτό). Δεν τις αλλάζει. Δεν το διαβάζει ακόμα καμία σελίδα.
//   node scripts/engine-projections.mjs [--out path]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProjections, DEFAULT_LADDER } from '../src/engine/projections.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const tryJ = f => { try { return J(f); } catch { return null; } };
const outArg = process.argv.indexOf('--out'), OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'data/projections/latest.json');
const conf = J('site.config.json'), season = conf.season;
const minutesFile = tryJ('data/projections/minutes.json');
if (!minutesFile) { console.error('engine-projections: λείπει το data/projections/minutes.json (τρέξε: python fantasy/perf/minutes_hurdle.py --next)'); process.exit(1); }
if (minutesFile.season !== season) { console.error(`engine-projections: minutes.json για ${minutesFile.season}, όχι ${season}`); process.exit(1); }
const prevSeason = 'E' + (+season.slice(1) - 1);
const prev = tryJ(`data/fantasy/hist/${prevSeason}.json`);
const fantasy = tryJ('data/fantasy/latest.json');
const out = buildProjections({ cache: J('data/cache.json'), prevPlayers: prev?.players || [], minutesFile, fantasy, ladder: conf.engine?.ladder || DEFAULT_LADDER });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`engine-projections: αγωνιστική ${out.round}, ${out.players.length} παίκτες, ποιότητα ${JSON.stringify(out.quality_counts)}, pregame=${out.pregame} → ${path.relative(ROOT, OUT)}`);
if (!fantasy || fantasy.round !== out.round) console.warn('engine-projections: το data/fantasy/latest.json δεν είναι για την ίδια αγωνιστική: χωρίς PIR και κατάσταση παικτών');
