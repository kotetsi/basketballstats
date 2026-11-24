// Ενιαία εκτέλεση όλων των tests.
//   npm test             unit tests (όλα τα test/*.test.mjs και src/**/*.test.mjs που δεν χρειάζονται dist/) + Python tests
//   npm run test:full    + offline build με --readonly, ελέγχους στις σελίδες που παράγονται, validation δεδομένων,
//                          μέγεθος dist/ και έλεγχο ότι το build δεν άλλαξε κανένα αρχείο στο data/
// Επιλογές: --no-python (παράλειψη Python), --require-python (αποτυχία αν λείπουν οι βιβλιοθήκες)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = new Set(process.argv.slice(2));
const FULL = A.has('--full'), NO_PY = A.has('--no-python'), REQ_PY = A.has('--require-python');
// tests που διαβάζουν το dist/ ή το .premium-data/ (τρέχουν μόνο μετά το build)
const POST_BUILD = new Set(['test/seo.test.mjs', 'test/portal-routes.test.mjs', 'test/premium-public-build.test.mjs']);
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

const results = [];
function run(label, cmd, args, { allowFail = false } = {}) {
  console.log(`\n▶ ${label}\n  ${cmd} ${args.join(' ')}`);
  const t = Date.now(), r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, BS_DATA_READONLY: '1' } });
  const ok = r.status === 0;
  results.push({ label, ok, s: Math.round((Date.now() - t) / 100) / 10, allowFail });
  return ok;
}
function findTests(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!['e2e', 'fixtures'].includes(e.name)) out.push(...findTests(rel)); }
    else if (e.name.endsWith('.test.mjs')) out.push(rel);
  }
  return out;
}
/** hash των αρχείων του data/ που παρακολουθεί το git (για να φανεί αν το build τα άλλαξε) */
function dataHashes() {
  const r = spawnSync('git', ['ls-files', '-z', 'data'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return null;
  const H = {};
  for (const f of r.stdout.split('\0').filter(Boolean)) { try { H[f] = createHash('sha1').update(fs.readFileSync(path.join(ROOT, f))).digest('hex'); } catch { H[f] = 'missing'; } }
  return H;
}

const all = [...findTests('test'), ...findTests('src')].sort();
// tests του Worker λογαριασμών/PRO: θέλουν node:sqlite (Node ≥ 22.5)· σε παλιότερη Node παραλείπονται με μήνυμα
// (τρέχουν στο account-test.yml με Node 22)
let hasSqlite = true; try { await import('node:sqlite'); } catch { hasSqlite = false; }
const NEEDS_SQLITE = new Set(all.filter(f => /d1-shim|node:sqlite/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
if (!hasSqlite && NEEDS_SQLITE.size) console.warn(`⚠ Node ${process.version} χωρίς node:sqlite: παραλείπονται ${[...NEEDS_SQLITE].join(', ')}`);
const unit = all.filter(f => !POST_BUILD.has(f) && (hasSqlite || !NEEDS_SQLITE.has(f)));
run(`Node unit tests (${unit.length} αρχεία)`, process.execPath, ['--test', ...unit]);

// Python (Game Predictor, Fantasy): χρειάζονται numpy/pandas/scikit-learn
if (!NO_PY) {
  const probe = spawnSync(PY, ['-c', 'import numpy, pandas, sklearn'], { cwd: ROOT });
  if (probe.status === 0) {
    run('Python: predictor', PY, ['-m', 'unittest', 'predictor/test_predictor.py', 'predictor/test_lineups.py']);
    run('Python: fantasy', PY, ['-m', 'unittest', 'discover', '-s', 'fantasy/tests']);
  } else if (REQ_PY) results.push({ label: 'Python: λείπουν numpy/pandas/scikit-learn', ok: false });
  else console.warn('\n⚠ Python tests παραλείφθηκαν (λείπουν numpy/pandas/scikit-learn· pip install -r fantasy/requirements.txt -r predictor/requirements.txt)');
}

if (FULL) {
  const before = dataHashes();
  if (run('Offline build (--readonly: δεν γράφει στο data/)', process.execPath, ['build.mjs', '--offline', '--readonly'])) {
    run('Αρχική σελίδα portal', process.execPath, ['scripts/portal-home.mjs']);
    const post = all.filter(f => POST_BUILD.has(f));
    run(`Tests στις σελίδες του build (${post.length} αρχεία)`, process.execPath, ['--test', ...post]);
    run('Μέγεθος dist/ και αρχικές σελίδες 5 γλωσσών', process.execPath, ['scripts/dist-size.mjs']);
  }
  run('Validation δεδομένων (engine)', process.execPath, ['scripts/engine-validate.mjs']);
  run('Αλυσίδα αρχείου pregame προβλέψεων', process.execPath, ['scripts/engine-archive.mjs', '--verify']);
  const after = dataHashes();
  if (before && after) {
    const changed = Object.keys({ ...before, ...after }).filter(f => before[f] !== after[f]);
    results.push({ label: `Το build δεν άλλαξε το data/${changed.length ? ' (άλλαξαν: ' + changed.slice(0, 8).join(', ') + ')' : ''}`, ok: !changed.length });
  }
}

console.log('\n──────── Αποτελέσματα ────────');
for (const r of results) console.log(`${r.ok ? '✔' : '✘'} ${r.label}${r.s != null ? ` (${r.s}s)` : ''}`);
const failed = results.filter(r => !r.ok && !r.allowFail);
if (failed.length) { console.error(`\n${failed.length} βήματα απέτυχαν`); process.exit(1); }
console.log('\nΌλα πέρασαν.');
