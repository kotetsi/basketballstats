// Intelligence Engine, Φάση 4: αρχειοθέτηση pregame προβλέψεων + settlement + αναφορά (CI, μετά το engine-projections).
//   node scripts/engine-archive.mjs            snapshot του data/projections/latest.json + settlement όλων των αγωνιστικών
//   node scripts/engine-archive.mjs --verify   μόνο έλεγχος αλυσίδας (exit 1 αν έχει σπάσει)
// Αρχεία: data/predictions/<season>/r<round>.jsonl (μόνο προσθήκες), head.json (κεφαλές αλυσίδων),
//         settled.json και report.json (παράγωγα: ξαναϋπολογίζονται κάθε φορά από το αρχείο + data/cache.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArchive, verifyChain, snapshot, settle, evaluate } from '../src/engine/archive.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'predictions');
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const tryJ = f => { try { return J(f); } catch { return null; } };
const VERIFY_ONLY = process.argv.includes('--verify');
const season = J('site.config.json').season, cache = J('data/cache.json');
const SD = path.join(DIR, season);
const files = () => (fs.existsSync(SD) ? fs.readdirSync(SD).filter(f => /^r\d+\.jsonl$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))) : []);
const read = f => parseArchive(fs.readFileSync(path.join(SD, f), 'utf8'));

// 1. έλεγχος όλων των αλυσίδων πριν γραφτεί οτιδήποτε
const heads = {};
for (const f of files()) {
  const v = verifyChain(read(f));
  if (!v.ok) { console.error(`engine-archive: σπασμένη αλυσίδα στο ${season}/${f}, γραμμή ${v.bad}. Δεν γράφεται τίποτα.`); process.exit(1); }
  heads[f] = { n: v.n, head: v.head };
}
if (VERIFY_ONLY) { console.log(`engine-archive: ${Object.keys(heads).length} αρχεία, όλες οι αλυσίδες εντάξει`); process.exit(0); }

// 2. snapshot (μόνο pregame, μόνο αν άλλαξε η πρόβλεψη)
const proj = tryJ('data/projections/latest.json');
if (proj && proj.season === season) {
  fs.mkdirSync(SD, { recursive: true });
  const f = `r${proj.round}.jsonl`, lines = fs.existsSync(path.join(SD, f)) ? read(f) : [];
  const { add, skipped } = snapshot(lines, proj, cache, new Date());
  if (add.length) fs.appendFileSync(path.join(SD, f), add.map(e => JSON.stringify(e)).join('\n') + '\n');
  const v = verifyChain([...lines, ...add]);
  if (!v.ok) { console.error('engine-archive: η αλυσίδα έσπασε μετά την προσθήκη'); process.exit(1); }
  heads[f] = { n: v.n, head: v.head };
  console.log(`engine-archive: αγωνιστική ${proj.round}: +${add.length} snapshots (${JSON.stringify(skipped)})`);
} else console.log('engine-archive: χωρίς προβλέψεις για αρχειοθέτηση');

// 3. settlement + αναφορά (παράγωγα)
const all = files().flatMap(read);
const settled = settle(all, cache);
const report = { generated: new Date().toISOString(), season, method: 'Μόνο η τελευταία pregame πρόβλεψη (predicted_at < tip) κάθε παίκτη/αγώνα· βάσεις σύγκρισης as-of πριν από την αγωνιστική.', ...evaluate(settled) };
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, 'settled.json'), JSON.stringify({ generated: report.generated, season, n: settled.length, rows: settled }));
fs.writeFileSync(path.join(DIR, 'report.json'), JSON.stringify(report, null, 1));
fs.writeFileSync(path.join(DIR, 'head.json'), JSON.stringify({ season, at: report.generated, files: heads }, null, 1) + '\n');
console.log(`engine-archive: settled ${settled.length} (έπαιξαν ${report.n_played}), αγωνιστικές ${report.rounds.join(',') || '-'}`);
