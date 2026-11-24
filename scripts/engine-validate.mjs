// Intelligence Engine — validation δεδομένων (Φάση 2). Μόνο ανάγνωση: δεν γράφει τίποτα στο data/.
//   node scripts/engine-validate.mjs              σύνοψη στην οθόνη (JSON)
//   node scripts/engine-validate.mjs --out f.json  και αναφορά σε αρχείο (π.χ. artifact του CI)
// Exit code 1 αν βρεθεί σφάλμα (severity 'error') σε οποιαδήποτε σεζόν. Οι προειδοποιήσεις δεν σταματούν τίποτα.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSeason } from '../src/engine/data.mjs';
import { validateSeason, summarize } from '../src/engine/validate.mjs';
import { injuryReport } from '../src/engine/identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = async f => JSON.parse(await fs.readFile(path.join(ROOT, f), 'utf8'));
const CONF = await J('site.config.json').catch(() => ({}));
const SEASON = process.env.SEASON || CONF.season || 'E2026';
const outArg = process.argv.indexOf('--out'), OUT = outArg > 0 ? process.argv[outArg + 1] : null;

const report = { generated: new Date().toISOString(), season: SEASON, seasons: {}, injuries: null, status_history: null };
let errors = 0;

const cache = await J('data/cache.json');
const sources = [[SEASON, cache]];
for (const f of (await fs.readdir(path.join(ROOT, 'data', 'fantasy', 'hist')).catch(() => [])).filter(f => /^E\d{4}\.json$/.test(f)).sort()) {
  const s = f.slice(0, 5); if (s !== SEASON) sources.push([s, await J(`data/fantasy/hist/${f}`)]);
}
for (const [s, raw] of sources) {
  const N = normalizeSeason(raw, { season: s });
  const S = summarize(validateSeason(N));
  errors += S.errors;
  report.seasons[s] = { players: N.players.length, games: N.games.length, final: N.games.filter(g => g.game_status === 'final').length,
    player_games: N.player_games.length, fetched_at: N.meta.fetched_at, ...S };
}

// τραυματίες (traumaties.md): ποιες εγγραφές δεν αντιστοιχίζονται σε παίκτη (δεν είναι σφάλμα δεδομένων· αναφέρεται)
try {
  const R = injuryReport(await fs.readFile(path.join(ROOT, 'traumaties.md'), 'utf8'), cache.players);
  report.injuries = { entries: R.n, matched: R.matched, unmatched: R.unmatched.map(u => ({ line: u.line, who: u.who, team: u.team, reason: u.reason, candidates: u.candidates })) };
} catch (e) { report.injuries = { error: e.message }; }

// pregame κατάσταση παικτών: κάλυψη (από πότε υπάρχει) — απαραίτητη για backtest απουσιών χωρίς διαρροή
try {
  const txt = await fs.readFile(path.join(ROOT, 'data', 'fantasy', 'status-history.jsonl'), 'utf8');
  let n = 0, first = null, last = null; const rounds = new Set();
  for (const l of txt.split('\n')) { if (!l) continue; const r = JSON.parse(l); n++; rounds.add(r.round); if (!first || r.captured_at < first) first = r.captured_at; if (!last || r.captured_at > last) last = r.captured_at; }
  report.status_history = { rows: n, first, last, rounds: [...rounds].sort((a, b) => a - b) };
} catch (e) { report.status_history = { error: e.message }; }

const brief = Object.fromEntries(Object.entries(report.seasons).map(([s, x]) => [s, { player_games: x.player_games, errors: x.errors, warnings: x.warnings, codes: Object.fromEntries(Object.entries(x.by).map(([k, v]) => [k, v.n])) }]));
console.log(JSON.stringify({ seasons: brief, injuries: report.injuries && { entries: report.injuries.entries, unmatched: report.injuries.unmatched?.map(u => `${u.who} ${u.team}: ${u.reason}`) }, status_history: report.status_history }, null, 1));
if (OUT) await fs.writeFile(path.resolve(OUT), JSON.stringify(report, null, 1));
if (errors) { console.error(`engine-validate: ${errors} σφάλματα δεδομένων`); process.exit(1); }
console.log('engine-validate: χωρίς σφάλματα δεδομένων');
