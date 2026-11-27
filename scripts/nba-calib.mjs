// NBA: μοντέλο έναντι αγοράς σε ΟΛΟ το backtest (walk-forward, data/nba/model/backtest-games.json)
// με τις ιστορικές γραμμές ESPN BET (data/nba/espn-odds, scripts/nba-espn-odds.mjs).
//   1. Brier / log loss: μοντέλο, αγορά στο άνοιγμα, αγορά στο κλείσιμο
//   2. διόρθωση κλίσης (logit p' = a·logit p + c) και μείξη με το άνοιγμα, εκτίμηση walk-forward ανά 100 αγώνες
//   3. στοίχημα στο ΑΝΟΙΓΜΑ όπου EV ≥ όριο: ROI με το αποτέλεσμα και CLV έναντι του κλεισίματος (χωρίς γκανιότα)
//   4. χάντικαπ/σύνολο στη γραμμή κλεισίματος (−110): ποσοστό επιτυχίας όταν το μοντέλο διαφωνεί ≥ Χ πόντους
//   node scripts/nba-calib.mjs [--json data/nba/model/calib.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--json'), OUT = outArg > 0 ? process.argv[outArg + 1] : null;
const J = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; } };
const BT = J('data/nba/model/backtest-games.json') || [];
const ODDS = {}; const od = path.join(ROOT, 'data/nba/espn-odds');
for (const f of fs.existsSync(od) ? fs.readdirSync(od).filter(f => f.endsWith('.json')) : []) Object.assign(ODDS, J(`data/nba/espn-odds/${f}`));
const nv = (h, a) => h > 1 && a > 1 ? (1 / h) / (1 / h + 1 / a) : null;
const clip = p => Math.min(1 - 1e-4, Math.max(1e-4, p)), lg = p => Math.log(clip(p) / (1 - clip(p))), sg = z => 1 / (1 + Math.exp(-z));

const rows = [];
for (const [id, season, p, margin, total, y, ym, yt] of BT) {
  const o = ODDS[id]; if (!o) continue;
  const [mlH, mlA, oH, oA, sp, tot] = o, close = nv(mlH, mlA), open = nv(oH, oA) ?? close;
  if (close == null) continue;
  rows.push({ id, season, p, margin, total, y, ym, yt, mlH, mlA, oH: oH || mlH, oA: oA || mlA, close, open, sp, tot });
}

// walk-forward: παράμετροι από τους προηγούμενους αγώνες (σειρά backtest = χρονολογική), ανά 100
function fitLogit(X, T, dims) {   // Newton, X: [[...features, 1]]
  let w = new Array(dims).fill(0); w[0] = 1;
  for (let it = 0; it < 30; it++) {
    const g = new Array(dims).fill(0), H = Array.from({ length: dims }, (_, i) => Array.from({ length: dims }, (_, j) => i === j ? 1e-6 : 0));
    X.forEach((x, i) => { const p = sg(x.reduce((a, v, k) => a + v * w[k], 0)), d = p - T[i], v = p * (1 - p); for (let a = 0; a < dims; a++) { g[a] += d * x[a]; for (let b = 0; b < dims; b++) H[a][b] += v * x[a] * x[b]; } });
    const M = H.map((r, i) => [...r, g[i]]);
    for (let i = 0; i < dims; i++) { let q = i; for (let j = i + 1; j < dims; j++) if (Math.abs(M[j][i]) > Math.abs(M[q][i])) q = j; [M[i], M[q]] = [M[q], M[i]];
      for (let j = 0; j < dims; j++) if (j !== i) { const f = M[j][i] / M[i][i]; for (let k = i; k <= dims; k++) M[j][k] -= f * M[i][k]; } }
    const step = M.map((r, i) => r[dims] / r[i]); w = w.map((v, i) => v - step[i]); if (Math.hypot(...step) < 1e-8) break;
  }
  return w;
}
const MIN_TRAIN = 200, STEP = 100;
for (let i = MIN_TRAIN; i < rows.length; i += STEP) {
  const tr = rows.slice(0, i), te = rows.slice(i, i + STEP), T = tr.map(r => r.y);
  const ws = fitLogit(tr.map(r => [lg(r.p), 1]), T, 2), wb = fitLogit(tr.map(r => [lg(r.p), lg(r.open), 1]), T, 3);
  for (const r of te) { r.self = sg(ws[0] * lg(r.p) + ws[1]); r.blend = sg(wb[0] * lg(r.p) + wb[1] * lg(r.open) + wb[2]); r.w = [ws, wb]; }
}
const test = rows.filter(r => r.self != null);
const mean = xs => xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null;
const brier = (L, k) => +mean(L.map(r => (r[k] - r.y) ** 2)).toFixed(4), logl = (L, k) => +mean(L.map(r => -(r.y * Math.log(clip(r[k])) + (1 - r.y) * Math.log(1 - clip(r[k]))))).toFixed(4);
function boot(xs) { if (xs.length < 30) return null; let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648), o = [];
  for (let b = 0; b < 1000; b++) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rnd() * xs.length)]; o.push(s / xs.length); } o.sort((a, b) => a - b); return [+o[25].toFixed(4), +o[974].toFixed(4)]; }
function bets(L, k, thr) {
  const out = [];
  for (const r of L) for (const [q, price, won, pc] of [[r[k], r.oH, r.y === 1, r.close], [1 - r[k], r.oA, r.y === 0, 1 - r.close]]) {
    if (!(price > 1) || q * price - 1 < thr) continue;
    out.push({ roi: won ? price - 1 : -1, clv: price * pc - 1 });
  }
  return { n: out.length, roi: out.length ? +mean(out.map(x => x.roi)).toFixed(4) : null, roi_ci95: boot(out.map(x => x.roi)),
    clv: out.length ? +mean(out.map(x => x.clv)).toFixed(4) : null, clv_ci95: boot(out.map(x => x.clv)) };
}
const ncdf = x => 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x ** 3)));
function ats(L, kind, minDiff) {
  const out = [];
  for (const r of L) {
    if (kind === 'spread' && r.sp != null) { const d = r.margin + r.sp, res = r.ym + r.sp; if (Math.abs(d) >= minDiff && res !== 0) out.push((d > 0) === (res > 0) ? 1 : 0); }
    if (kind === 'total' && r.tot != null) { const d = r.total - r.tot, res = r.yt - r.tot; if (Math.abs(d) >= minDiff && res !== 0) out.push((d > 0) === (res > 0) ? 1 : 0); }
  }
  return { n: out.length, hit: out.length ? +mean(out).toFixed(3) : null, ci95: boot(out), roi_at_110: out.length ? +(mean(out) * (1 + 100 / 110) - 1).toFixed(4) : null };
}
const THR = [0.03, 0.05, 0.08];
const margin = mean(rows.map(r => 1 / r.mlH + 1 / r.mlA - 1));
const report = { generated: new Date().toISOString(), source: 'ESPN BET (άνοιγμα/κλείσιμο) · backtest walk-forward του μοντέλου',
  counts: { backtest: BT.length, with_odds: rows.length, tested: test.length, seasons: [...new Set(rows.map(r => r.season))] }, margin_close: margin == null ? null : +margin.toFixed(4),
  last_weights: test.at(-1)?.w ?? null,
  brier: test.length ? { model: brier(test, 'p'), self: brier(test, 'self'), blend: brier(test, 'blend'), open: brier(test, 'open'), close: brier(test, 'close') } : null,
  logloss: test.length ? { model: logl(test, 'p'), self: logl(test, 'self'), blend: logl(test, 'blend'), open: logl(test, 'open'), close: logl(test, 'close') } : null,
  ml_at_open: Object.fromEntries(['p', 'self', 'blend'].map(k => [k, Object.fromEntries(THR.map(t => [t, bets(test, k, t)]))])),
  spread: Object.fromEntries([2, 4, 6].map(d => [d, ats(test, 'spread', d)])), total: Object.fromEntries([3, 6, 9].map(d => [d, ats(test, 'total', d)])) };
if (OUT) { fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true }); fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 1)); }
const f = x => x == null ? '–' : (100 * x).toFixed(2) + '%';
console.log(`NBA βαθμονόμηση: ${report.counts.with_odds}/${report.counts.backtest} αγώνες με γραμμή, ${report.counts.tested} εκτός δείγματος · γκανιότα ${f(report.margin_close)}`);
if (report.brier) { console.log(`  Brier: μοντέλο ${report.brier.model} · διόρθωση ${report.brier.self} · μείξη ${report.brier.blend} · άνοιγμα ${report.brier.open} · κλείσιμο ${report.brier.close}`);
  console.log(`  log loss: μοντέλο ${report.logloss.model} · διόρθωση ${report.logloss.self} · μείξη ${report.logloss.blend} · άνοιγμα ${report.logloss.open} · κλείσιμο ${report.logloss.close}`);
  for (const [k, lab] of [['p', 'μοντέλο'], ['self', 'διόρθωση'], ['blend', 'μείξη']]) console.log(`  νικητής στο άνοιγμα, ${lab}: ` + THR.map(t => { const b = report.ml_at_open[k][t]; return `EV≥${t * 100}%: ${b.n} ROI ${f(b.roi)} ${JSON.stringify(b.roi_ci95)} CLV ${f(b.clv)} ${JSON.stringify(b.clv_ci95)}`; }).join(' | '));
  console.log('  χάντικαπ: ' + Object.entries(report.spread).map(([d, s]) => `διαφορά≥${d}: ${s.n} επιτυχία ${f(s.hit)} ${JSON.stringify(s.ci95)}`).join(' · '));
  console.log('  σύνολο: ' + Object.entries(report.total).map(([d, s]) => `διαφορά≥${d}: ${s.n} επιτυχία ${f(s.hit)} ${JSON.stringify(s.ci95)}`).join(' · ')); }
