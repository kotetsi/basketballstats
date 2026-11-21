// Επιλογή ρυθμίσεων RAPM με cross-validation ανά αγώνα στα πραγματικά ζεύγη πεντάδων (data/pbp/<σεζόν>/*.json, πεδίο mu).
// Μετρά το σφάλμα πρόβλεψης (πόντοι/100 κατοχές) σε αγώνες της τρέχουσας σεζόν που δεν χρησιμοποιήθηκαν στο fit,
// για διάφορα λ και βάρος της προηγούμενης σεζόν. node scripts/rapm-eval.mjs
import fs from 'node:fs';
import path from 'node:path';
import { rapmRows, fitRapm, rapmError } from '../src/analytics/rapm.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const SEASON = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'))).season, PREV = 'E' + (+SEASON.slice(1) - 1);
export function loadPairs(code, w = 1) {
  const dir = path.join(ROOT, 'data', 'pbp', code); if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .filter(g => g.mu && !(g.chk && g.chk.ok === false && g.chk.lostSecs > 300)).map(g => ({ id: code + '-' + g.gc, ids: g.ids.map(x => x.replace(/^P/, '')), mu: g.mu, w }));
}
const cur = loadPairs(SEASON), prev = loadPairs(PREV);
console.log(`${SEASON}: ${cur.length} αγώνες με ζεύγη · ${PREV}: ${prev.length}`);
const K = 5, folds = cur.map((g, i) => i % K);
const res = [];
for (const wPrev of prev.length ? [0, 0.5, 0.75, 1] : [0]) for (const lam of [1000, 2000, 3000]) {
  let e = 0, n = 0;
  for (let f = 0; f < K; f++) {
    const tr = rapmRows([...cur.filter((_, i) => folds[i] !== f), ...(wPrev ? prev.map(g => ({ ...g, w: wPrev })) : [])]).rows;
    const te = rapmRows(cur.filter((_, i) => folds[i] === f)).rows;
    const fit = fitRapm(tr, lam), p = te.reduce((s, r) => s + r.poss, 0);
    e += rapmError(fit, te) * p; n += p;
  }
  res.push({ wPrev, lam, rmse: Math.sqrt(e / n) });
  console.log(`βάρος προηγ. σεζόν ${wPrev} · λ ${lam}: RMSE ${Math.sqrt(e / n).toFixed(3)}`);
}
const base = Math.sqrt(rapmError({ off: {}, def: {}, h: 0 }, rapmRows(cur).rows));
console.log('χωρίς μοντέλο (όλοι μέσοι):', base.toFixed(3), '· καλύτερο:', JSON.stringify(res.sort((a, b) => a.rmse - b.rmse)[0]));
