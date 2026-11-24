// Intelligence Engine, Φάση 3: walk-forward αξιολόγηση των στατιστικών (πόντοι, ριμπάουντ, ασίστ, τρίποντα) «αν παίξει»
// σε 7 σεζόν (μόνο ανάγνωση). Δείγμα: οι γραμμές του hurdle (data/fantasy/perf/minutes_hurdle.csv.gz) όπου ο παίκτης
// έπαιξε και είχε ≥3 προηγούμενους αγώνες με λεπτά. Ίδιο δείγμα για όλες τις μεθόδους. Κάθε πρόβλεψη χρησιμοποιεί μόνο
// αγώνες με αγωνιστική < στόχο, και ο ρυθμός της λίγκας (prior) μόνο αγώνες πριν από τον στόχο.
//   node scripts/engine-stats-compare.mjs [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { STATS, PARAMS, project, pOver, pmf } from '../src/odds/props.mjs';
// διάμεσος της αρνητικής διωνυμικής: το σημείο που ελαχιστοποιεί το MAE (για counts με πολλά 0, π.χ. τρίποντα)
export function nbMedian(mu, v) { let c = 0; for (let k = 0; k < 200; k++) { c += pmf(k, mu, v); if (c >= 0.5) return k; } return Math.round(mu); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const CUR = J('site.config.json').season;
const outArg = process.argv.indexOf('--json'), OUT = outArg > 0 ? process.argv[outArg + 1] : null;
export const LADDER = { pts: [5.5, 10.5, 15.5, 20.5], reb: [2.5, 4.5, 6.5], ast: [1.5, 3.5, 5.5], fg3: [0.5, 1.5, 2.5] };
const SK = Object.keys(LADDER);

function readCsvGz(f) {
  const L = gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n').filter(Boolean), H = L[0].split(',');
  return L.slice(1).map(l => { const v = l.split(','); return Object.fromEntries(H.map((h, i) => [h, v[i]])); });
}
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const medianOf = xs => { const a = [...xs].sort((p, q) => p - q), n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
const HZ = readCsvGz(path.join(ROOT, 'data/fantasy/perf/minutes_hurdle.csv.gz'));
const bySeason = {}; for (const r of HZ) (bySeason[r.season] ||= []).push(r);

// παραλλαγές ρυθμού (grid): ENGINE_VARIANTS='[{"name":"h16","rateHalf":16,"prior":40,"prev":0}]'
//   prev = βάρος (σε λεπτά) του ρυθμού της ΠΡΟΗΓΟΥΜΕΝΗΣ σεζόν του παίκτη ως prior (0 = μόνο λίγκα)
const VARIANTS = JSON.parse(process.env.ENGINE_VARIANTS || '[]');
const METHODS = ['props_ew', 'engine_hurdle', ...VARIANTS.map(v => v.name), 'season_mean', 'last5', 'last10'];
const seasonsAll = fs.readdirSync(path.join(ROOT, 'data/fantasy/hist')).filter(f => /^E\d{4}\.json$/.test(f)).map(f => f.slice(0, 5));
const prevRates = S => { // ρυθμός ανά λεπτό κάθε παίκτη στην προηγούμενη σεζόν (ολόκληρη: είναι παρελθόν)
  const prevS = 'E' + (+S.slice(1) - 1); if (!seasonsAll.includes(prevS) && prevS !== CUR) return new Map();
  const raw = prevS === CUR ? J('data/cache.json') : J(`data/fantasy/hist/${prevS}.json`), out = new Map();
  for (const p of raw.players) { let m = 0; const x = Object.fromEntries(SK.map(s => [s, 0])); for (const r of p.g || []) if (r[7] > 0) { m += r[7] / 60; for (const s of SK) x[s] += STATS[s](r); } if (m > 0) out.set(p.c, { m, x }); }
  return out;
};
const acc = {}; // key → stat → method → {n, ae, se, b, brier, nb, aeMed}
const A = (key, s, m) => (((acc[key] ||= {})[s] ||= {})[m] ||= { n: 0, ae: 0, se: 0, bias: 0, brier: 0, nb: 0, aeMed: 0 });
const rowsUsed = {}, CAL = {};   // βαθμονόμηση: stat → μέθοδος → 10 δέκατα [n, Σp, Σεπιτυχίες]
for (const S of Object.keys(bySeason).sort()) {
  const raw = S === CUR ? J('data/cache.json') : J(`data/fantasy/hist/${S}.json`);
  const P = new Map(raw.players.map(p => [p.c, p])), PREV = VARIANTS.some(v => v.prev) ? prevRates(S) : new Map();
  // ρυθμός λίγκας ανά stat, μόνο από αγωνιστικές < r
  const tot = new Map();
  for (const p of raw.players) for (const r of p.g || []) if (r[7] > 0) { const t = tot.get(r[0]) || tot.set(r[0], { m: 0, ...Object.fromEntries(SK.map(s => [s, 0])) }).get(r[0]); t.m += r[7] / 60; for (const s of SK) t[s] += STATS[s](r); }
  const rounds = [...tot.keys()].sort((a, b) => a - b), priorAt = new Map(); const cum = { m: 0, ...Object.fromEntries(SK.map(s => [s, 0])) };
  for (const r of rounds) { priorAt.set(r, Object.fromEntries(SK.map(s => [s, cum.m ? cum[s] / cum.m : 0]))); for (const k of Object.keys(cum)) cum[k] += tot.get(r)[k]; }
  let used = 0;
  for (const h of bySeason[S]) {
    const R = +h.round, p = P.get(h.c); if (!p || !(+h.y_min > 0)) continue;
    const target = p.g.find(r => r[0] === R && r[7] > 0); if (!target) continue;
    const hist = p.g.filter(r => r[0] < R && r[7] > 0).sort((a, b) => a[0] - b[0]);
    if (hist.length < 3) continue;
    used++;
    for (const s of SK) {
      const y = STATS[s](target), pr = priorAt.get(R)?.[s] || 0, xs = hist.map(STATS[s]);
      const a = project(hist, s, { prior: pr }), b = project(hist, s, { prior: pr, minutes: +h.hz_cond });
      const pred = { props_ew: [a.mu, a.var], engine_hurdle: [b.mu, b.var], season_mean: [mean(xs)], last5: [mean(xs.slice(-5))], last10: [mean(xs.slice(-10))] };
      for (const V of VARIANTS) {
        const pv = PREV.get(h.c); let prior = pr;
        if (V.prev && pv) prior = (pv.x[s] + V.prev * pr) / (pv.m + V.prev) ;   // ρυθμός προηγούμενης σεζόν, σμικρυμένος προς τη λίγκα
        const c = project(hist, s, { prior, minutes: +h.hz_cond, P: { ...PARAMS, rateHalf: V.rateHalf ?? PARAMS.rateHalf, prior: V.prior ?? PARAMS.prior, disp: { ...PARAMS.disp, ...(V.disp || {}) }, minSd: V.minSd ?? PARAMS.minSd } });
        pred[V.name] = [c.mu, c.var];
      }
      for (const m of METHODS) {
        const [mu, v] = pred[m];
        for (const key of ['all', S]) {
          const x = A(key, s, m); x.n++; x.ae += Math.abs(mu - y); x.aeMed += Math.abs((v != null ? nbMedian(mu, v) : (m === 'season_mean' ? medianOf(xs) : m === 'last5' ? medianOf(xs.slice(-5)) : medianOf(xs.slice(-10)))) - y); x.se += (mu - y) ** 2; x.bias += mu - y;
          for (const L of LADDER[s]) {
            // πιθανότητα: αρνητική διωνυμική για τα μοντέλα· για τις βάσεις, η εμπειρική συχνότητα του παίκτη (ίδιο παράθυρο)
            const win = m === 'last5' ? xs.slice(-5) : m === 'last10' ? xs.slice(-10) : xs;
            const q = v != null ? pOver(mu, v, L) : (win.filter(z => z > L).length + 0.5) / (win.length + 1);
            x.brier += (q - (y > L ? 1 : 0)) ** 2; x.nb++;
            if (v != null && key === 'all') { const b = Math.min(9, Math.floor(q * 10)); const cb = ((CAL[s] ||= {})[m] ||= Array.from({ length: 10 }, () => [0, 0, 0])); cb[b][0]++; cb[b][1] += q; cb[b][2] += y > L ? 1 : 0; }
          }
        }
      }
    }
  }
  rowsUsed[S] = used;
}
const report = { generated: new Date().toISOString(), rows: rowsUsed, ladder: LADDER, results: {}, calibration: {} };
for (const [st, by] of Object.entries(CAL)) { report.calibration[st] = {}; for (const [m, bins] of Object.entries(by)) { const N = bins.reduce((a, b) => a + b[0], 0);
  report.calibration[st][m] = { ece: +(bins.reduce((a, [n, sp, sy]) => a + (n ? Math.abs(sp - sy) : 0), 0) / N).toFixed(4), bins: bins.map(([n, sp, sy]) => n ? [n, +(sp / n).toFixed(3), +(sy / n).toFixed(3)] : [0, null, null]) }; } }
for (const [key, by] of Object.entries(acc)) {
  report.results[key] = {};
  for (const s of SK) report.results[key][s] = Object.fromEntries(METHODS.map(m => { const x = by[s][m]; return [m, { n: x.n, mae: +(x.ae / x.n).toFixed(3), mae_median: +(x.aeMed / x.n).toFixed(3), rmse: +Math.sqrt(x.se / x.n).toFixed(3), bias: +(x.bias / x.n).toFixed(3), brier: +(x.brier / x.nb).toFixed(4) }]; }));
}
console.log(JSON.stringify({ rows: rowsUsed }));
for (const s of SK) console.log(s, Object.entries(report.results.all[s]).map(([m, x]) => `${m} mae ${x.mae} brier ${x.brier}`).join(' · '));
if (OUT) fs.writeFileSync(path.resolve(OUT), JSON.stringify(report, null, 1));
