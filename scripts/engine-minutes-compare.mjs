// Intelligence Engine, Φάση 3: σύγκριση μοντέλων ΛΕΠΤΩΝ στο ίδιο walk-forward δείγμα (μόνο ανάγνωση).
// Δείγμα: οι γραμμές του walk-forward backtest του Fantasy (data/fantasy/perf/pred_<S>.csv.gz): κάθε παίκτης του ρόστερ
// σε κάθε αγωνιστική, με πρόβλεψη που βγήκε ΜΟΝΟ από προηγούμενες αγωνιστικές και πραγματικά λεπτά y_min (0 = δεν έπαιξε).
// Οι υπόλοιπες μέθοδοι υπολογίζονται εδώ από τα box score της σεζόν, πάλι μόνο με αγώνες πριν από την αγωνιστική-στόχο.
//
// Δύο στόχοι, γιατί οι δύο πελάτες θέλουν διαφορετικό πράγμα:
//   «αναμενόμενα»  E[λεπτά]           (Fantasy: ο παίκτης μπορεί να μην παίξει)        — όλες οι γραμμές
//   «αν παίξει»    E[λεπτά | παίζει]  (props: void αν δεν παίξει)                     — γραμμές με y_min > 0
//   node scripts/engine-minutes-compare.mjs [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { PARAMS } from '../src/odds/props.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const CONF = J('site.config.json'), CUR = CONF.season;
const outArg = process.argv.indexOf('--json'), OUT = outArg > 0 ? process.argv[outArg + 1] : null;
const MIN_PLAYED = 3;   // όπως το project() των props: πρόβλεψη μόνο με ≥ 3 αγώνες

function readCsvGz(f) {
  const lines = gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n').filter(Boolean);
  const head = lines[0].split(',');
  return lines.slice(1).map(l => { const v = l.split(','); return Object.fromEntries(head.map((h, i) => [h, v[i]])); });
}
const ew = (xs, half) => { let s = 0, w = 0; xs.forEach((x, i) => { const k = Math.pow(0.5, (xs.length - 1 - i) / half); s += k * x; w += k; }); return w ? s / w : null; };
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// πειραματικό hurdle (fantasy/perf/minutes_hurdle.py): αν υπάρχει το αρχείο, μπαίνει στη σύγκριση στο ίδιο δείγμα
const HZ = new Map();
const HZF = path.join(ROOT, 'data/fantasy/perf/minutes_hurdle.csv.gz');
if (fs.existsSync(HZF)) for (const r of readCsvGz(HZF)) HZ.set(`${r.season}|${r.round}|${r.c}`, r);
const METHODS = ['python_v2', 'python_roll10', 'ew3_props', 'season_mean', 'last5', 'last10', ...(HZ.size ? ['hurdle'] : [])];
// για τον στόχο «αναμενόμενα»: οι μέθοδοι «αν παίξει» πολλαπλασιάζονται με το ποσοστό συμμετοχής (play_rate5 του backtest)
function forecasts(row, played) {
  const m = played.map(r => r[7] / 60);
  const cond = { ew3_props: ew(m, PARAMS.minHalf), season_mean: mean(m), last5: mean(m.slice(-5)), last10: mean(m.slice(-10)) };
  const pr = +row.play_rate5;
  const expd = Object.fromEntries(Object.entries(cond).map(([k, v]) => [k, v == null ? null : v * pr]));
  // το μοντέλο Python προβλέπει αναμενόμενα λεπτά (με τον κίνδυνο να μην παίξει)· για «αν παίξει» διαιρούμε με το play_rate5
  const py = +row['pir-2stage-v2|min'], r10 = row['roll10-avg|min'] === '' ? null : +row['roll10-avg|min'];
  return {
    expected: { python_v2: py, python_roll10: r10, ...expd },
    ifplays: { python_v2: pr > 0 ? Math.min(48, py / pr) : null, python_roll10: r10 != null && pr > 0 ? Math.min(48, r10 / pr) : null, ...cond },
  };
}

function metrics(pairs) {
  const n = pairs.length; if (!n) return { n: 0 };
  let ae = 0, se = 0, b = 0;
  for (const [p, y] of pairs) { ae += Math.abs(p - y); se += (p - y) ** 2; b += p - y; }
  return { n, mae: +(ae / n).toFixed(3), rmse: +Math.sqrt(se / n).toFixed(3), bias: +(b / n).toFixed(3) };
}
const BUCKETS = [[0, 10, '<10'], [10, 20, '10-20'], [20, 30, '20-30'], [30, 99, '30+']];
const bucketOf = v => (BUCKETS.find(([a, b]) => v >= a && v < b) || BUCKETS[0])[2];

const seasons = fs.readdirSync(path.join(ROOT, 'data/fantasy/perf')).filter(f => /^pred_E\d{4}\.csv\.gz$/.test(f)).map(f => f.slice(5, 10)).sort();
const acc = { expected: {}, ifplays: {} }; const add = (tgt, key, m, p, y) => { ((acc[tgt][key] ||= {})[m] ||= []).push([p, y]); };
const rowsUsed = {}, skipped = {};
for (const S of seasons) {
  const raw = S === CUR ? J('data/cache.json') : (() => { try { return J(`data/fantasy/hist/${S}.json`); } catch { return null; } })();
  if (!raw) { skipped[S] = 'χωρίς box score'; continue; }
  const P = new Map(raw.players.map(p => [p.c, p]));
  let used = 0;
  for (const row of readCsvGz(path.join(ROOT, `data/fantasy/perf/pred_${S}.csv.gz`))) {
    if (row['pir-2stage-v2|min'] === '' || row['pir-2stage-v2|min'] == null) continue;
    const R = +row.round, y = +row.y_min, p = P.get(row.c);
    if (!p) continue;
    const played = p.g.filter(r => r[0] < R && r[7] > 0).sort((a, b) => a[0] - b[0]);
    if (played.length < MIN_PLAYED) continue;
    const F = forecasts(row, played);
    if (HZ.size) { const h = HZ.get(`${S}|${R}|${row.c}`); F.expected.hurdle = h ? +h.hz_exp : null; F.ifplays.hurdle = h ? +h.hz_cond : null; }
    if (METHODS.some(m => F.expected[m] == null || F.ifplays[m] == null)) continue;   // ίδιο δείγμα για όλες τις μεθόδους
    used++;
    for (const m of METHODS) {
      for (const key of ['all', S, `bucket:${bucketOf(F.ifplays.season_mean)}`]) add('expected', key, m, F.expected[m], y);
      if (y > 0) for (const key of ['all', S, `bucket:${bucketOf(F.ifplays.season_mean)}`]) add('ifplays', key, m, F.ifplays[m], y);
    }
  }
  rowsUsed[S] = used;
}

const report = { generated: new Date().toISOString(), note: 'Walk-forward· ίδιο δείγμα για όλες τις μεθόδους (≥3 προηγούμενοι αγώνες με λεπτά). Ανακατανομή λόγω απουσιών ΔΕΝ περιλαμβάνεται (δεν υπάρχει ιστορικό pregame απουσιών πριν από τις 16/11/2026).',
  rows: rowsUsed, skipped, targets: {} };
for (const tgt of ['expected', 'ifplays']) {
  report.targets[tgt] = {};
  for (const [key, by] of Object.entries(acc[tgt])) report.targets[tgt][key] = Object.fromEntries(METHODS.map(m => [m, metrics(by[m] || [])]));
}
const best = tgt => Object.entries(report.targets[tgt].all).sort((a, b) => a[1].mae - b[1].mae).map(([m, x]) => `${m} ${x.mae}`).join(' · ');
console.log(JSON.stringify({ rows: rowsUsed, expected_all: report.targets.expected.all, ifplays_all: report.targets.ifplays.all }, null, 1));
console.log('\nΑναμενόμενα λεπτά (MAE):', best('expected'));
console.log('Αν παίξει (MAE):        ', best('ifplays'));
if (OUT) fs.writeFileSync(path.resolve(OUT), JSON.stringify(report, null, 1));
