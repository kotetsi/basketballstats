// Backtest: «διορθωμένοι για τύχη» πόντοι/τρίποντα στο ιστορικό του Prop Analyzer.
// Σε κάθε προηγούμενο αγώνα του παίκτη, οι πόντοι από σουτ αντικαθίστανται μερικώς (λ) από τους αναμενόμενους (xPTS):
// Σ αξία σουτ × ευστοχία της ζώνης (λίγκα, ή παίκτης με shrinkage k προσπαθειών προς τη λίγκα, μόνο από προηγούμενους αγώνες).
// Ο στόχος (ο αγώνας που προβλέπεται) μένει πάντα ο πραγματικός. node scripts/props-xpts-backtest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { STATS, PARAMS, project, pmf } from '../src/odds/props.mjs';
import { loadShotIndex, leagueZonePct, xptsRows } from '../src/odds/xpts.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cache.json')));
const SEASON = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'))).season;
const players = (C.players || []).filter(p => !String(p.t).includes(';'));
const LZ = leagueZonePct(path.join(ROOT, 'data/shots'));
const IDX = loadShotIndex(path.join(ROOT, 'data/shots', SEASON), C.league.games);

const allRounds = [...new Set(players.flatMap(p => p.g.filter(r => r[7] > 0).map(r => +r[0])))].sort((a, b) => a - b);
const priorAt = new Map(), cum = Object.fromEntries(Object.keys(STATS).map(s => [s, 0])); let cm = 0;
for (const R of allRounds) {
  priorAt.set(R, Object.fromEntries(Object.keys(STATS).map(s => [s, cm ? cum[s] / cm : 0])));
  for (const p of players) for (const r of p.g.filter(r => r[7] > 0 && +r[0] === R)) { cm += r[7] / 60; for (const s of Object.keys(STATS)) cum[s] += STATS[s](r); }
}

const HALF = process.env.HALF; // odd | even: μόνο αγώνες-στόχοι σε μονές/ζυγές αγωνιστικές (έλεγχος σταθερότητας)
function run(lam, k, stats) {
  const out = {};
  for (const s of stats) {
    let ll = 0, n = 0, se = 0;
    for (const p of players) {
      const pl = p.g.filter(r => r[7] > 0).sort((a, b) => a[0] - b[0]);
      for (let i = 3; i < pl.length; i++) {
        if (HALF && (+pl[i][0] % 2 === 1) !== (HALF === 'odd')) continue;
        const hist = pl.slice(0, i), xrows = lam ? xptsRows(hist, p.c, IDX, LZ, { lam, k }) : null;
        const pr = project(hist, s, { prior: priorAt.get(+pl[i][0])[s], xrows, P: PARAMS }); if (!pr || pr.min < 10) continue;
        const y = STATS[s](pl[i]); ll += Math.log(Math.max(1e-12, pmf(y, pr.mu, pr.var))); se += Math.abs(y - pr.mu); n++;
      }
    }
    out[s] = { n, ll: +(ll / n).toFixed(4), mae: +(se / n).toFixed(3) };
  }
  return out;
}
const stats = ['pts', 'fg3', 'pr', 'pa', 'pra'];
console.log('σουτ με ζώνη στο ευρετήριο:', IDX.size, 'εμφανίσεις παικτών');
console.log('λ=0 (σημερινό μοντέλο)', JSON.stringify(run(0, 0, stats)));
for (const k of [Infinity, 150, 60]) for (const lam of [0.25, 0.5, 0.75, 1]) console.log(`λ=${lam} k=${k}`, JSON.stringify(run(lam, k, stats)));
