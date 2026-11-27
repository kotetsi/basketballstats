// Βελτιώνει την πιθανότητα του μοντέλου στα props και μετράει αν ανεβαίνει το CLV (ίδιες γραμμές με το props-clv.mjs).
//   1. usage: συμπαίκτες εκτός → ανεβαίνει ο ρυθμός ανά λεπτό των υπολοίπων (k από προηγούμενες σεζόν, src/odds/usage.mjs)
//      «γνωστό» = απών στον προηγούμενο αγώνα· «πραγματικό» = απών στον ίδιο τον αγώνα (άνω όριο: δεν το ξέρουμε πάντα από το mid)
//   2. βαθμονόμηση στην αγορά: logit p = a·logit(μοντέλο) + b·logit(αγορά στο mid χωρίς γκανιότα) + c,
//      στόχος = πιθανότητα κλεισίματος χωρίς γκανιότα. Εκτός δείγματος: (i) walk-forward ανά αγωνιστική, (ii) leave-one-game-out
// Μετρήσεις: log loss έναντι κλεισίματος και έναντι αποτελέσματος, CLV/κίνηση των επιλογών με EV ≥ όριο στην τιμή του mid.
//   node scripts/props-calib.mjs [--json data/predictions/props-calib.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pOver, noVig } from '../src/odds/props.mjs';
import { loadClvRows, clv } from '../src/odds/clv-rows.mjs';
import { teamIndex, teamState, fitUsage } from '../src/odds/usage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--json'), OUT = outArg > 0 ? process.argv[outArg + 1] : null;
const THR = [0.03, 0.05, 0.08];
const { rows, season, cache } = loadClvRows();

// 1. usage: k από όλες τις προηγούμενες σεζόν
const hist = fs.readdirSync(path.join(ROOT, 'data/fantasy/hist')).filter(f => /^E\d{4}\.json$/.test(f) && f.slice(0, 5) < season)
  .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/fantasy/hist', f), 'utf8'))).map(h => ({ players: h.players, games: h.league.games }));
const K = fitUsage(hist);
const ix = teamIndex(cache.players, cache.league.games), stCache = new Map();
const stateOf = (t, R, actual) => { const k = `${t}|${R}|${actual}`; if (!stCache.has(k)) stCache.set(k, teamState(ix, t, R, { actual })); return stCache.get(k); };
for (const r of rows) {
  r.pmid = noVig(r.mid.over, r.mid.under).over;
  for (const [key, actual] of [['pu', false], ['pa', true]]) {
    const st = stateOf(r.team, r.round, actual), absentSelf = st?.absent.includes(r.c);
    const f = st && !absentSelf ? 1 + K[r.st].k * st.miss[r.st] : 1;
    r[key] = pOver(r.mean * f, r.sd ** 2 * f, r.line);
    if (actual) r.missA = st?.miss[r.st] || 0; else r.missK = st?.miss[r.st] || 0;
  }
}

// 2. βαθμονόμηση (λογιστική με «μαλακό» στόχο, Newton)
const lg = p => { const q = Math.min(1 - 1e-4, Math.max(1e-4, p)); return Math.log(q / (1 - q)); };
const sg = z => 1 / (1 + Math.exp(-z));
function fit(train, key, { noMarket = false } = {}) {
  let w = [1, 0, 0];
  const X = train.map(r => [lg(r[key]), lg(r.pmid), 1]), T = train.map(r => r.pcBook);
  for (let it = 0; it < 30; it++) {
    const g = [0, 0, 0], H = [[1e-6, 0, 0], [0, 1e-6, 0], [0, 0, 1e-6]];
    X.forEach((x, i) => { const p = sg(x[0] * w[0] + x[1] * w[1] + x[2] * w[2]), d = p - T[i], v = p * (1 - p);
      for (let a = 0; a < 3; a++) { g[a] += d * x[a]; for (let b = 0; b < 3; b++) H[a][b] += v * x[a] * x[b]; } });
    if (noMarket) { g[1] = 0; H[1] = [0, 1, 0]; H[0][1] = H[2][1] = 0; }
    const step = solve3(H, g); w = w.map((v, i) => v - step[i]); if (Math.hypot(...step) < 1e-8) break;
  }
  return w;
}
function solve3(A, b) { const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) { let p = i; for (let j = i + 1; j < 3; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j; [M[i], M[p]] = [M[p], M[i]];
    for (let j = 0; j < 3; j++) if (j !== i) { const f = M[j][i] / M[i][i]; for (let k = i; k < 4; k++) M[j][k] -= f * M[i][k]; } }
  return M.map((r, i) => r[3] / r[i]); }
const apply = (w, r, key) => sg(w[0] * lg(r[key]) + w[1] * lg(r.pmid) + w[2]);

const VARIANTS = { pm: 'μοντέλο (σήμερα)', pu: 'μοντέλο + συμπαίκτες εκτός (γνωστό)', pa: 'μοντέλο + συμπαίκτες εκτός (πραγματικό, άνω όριο)' };
const rounds = [...new Set(rows.map(r => r.round))].sort((a, b) => a - b), events = [...new Set(rows.map(r => r.event))];
const weights = {};
for (const key of Object.keys(VARIANTS)) {
  weights[key] = { all: fit(rows, key).map(v => +v.toFixed(3)) };
  for (const R of rounds.slice(1)) { const w = fit(rows.filter(r => r.round < R), key); weights[key][`wf${R}`] = w.map(v => +v.toFixed(3)); for (const r of rows) if (r.round === R) r[`${key}_wf`] = apply(w, r, key); }
  for (const e of events) { const w = fit(rows.filter(r => r.event !== e), key); for (const r of rows) if (r.event === e) r[`${key}_lo`] = apply(w, r, key); }
  // μόνο διόρθωση κλίσης/κλίμακας του μοντέλου, χωρίς την αγορά (μένει ανεξάρτητη γνώμη)
  for (const R of rounds.slice(1)) { const w = fit(rows.filter(r => r.round < R), key, { noMarket: true }); weights[key][`self_wf${R}`] = w.map(v => +v.toFixed(3)); for (const r of rows) if (r.round === R) r[`${key}_swf`] = apply(w, r, key); }
  for (const e of events) { const w = fit(rows.filter(r => r.event !== e), key, { noMarket: true }); for (const r of rows) if (r.event === e) r[`${key}_slo`] = apply(w, r, key); }
}

// μετρήσεις
const ll = (p, t) => -(t * Math.log(Math.max(1e-6, p)) + (1 - t) * Math.log(Math.max(1e-6, 1 - p)));
const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
const settled = rows.filter(r => r.y != null && r.y !== r.line);
function score(pOf, L = rows) {
  const S = L.filter(r => r.y != null && r.y !== r.line);
  const c = Object.fromEntries(THR.map(t => { const s = clv(L, t, pOf).same_book; return [t, { n: s.n, clv: s.clv, ci95: s.ci95, move: s.move, move_ci95: s.move_ci95 }]; }));
  return { logloss_close: +mean(L.map(r => ll(pOf(r), r.pcBook))).toFixed(4), logloss_result: S.length ? +mean(S.map(r => ll(pOf(r), r.y > r.line ? 1 : 0))).toFixed(4) : null, n_settled: S.length, picks: c };
}
const wfRows = rows.filter(r => r.round > rounds[0]);
const report = { generated: new Date().toISOString(), season, usage_k: K,
  counts: { lines: rows.length, games: events.length, rounds, settled: settled.length, with_absent_known: rows.filter(r => r.missK > 0).length, with_absent_actual: rows.filter(r => r.missA > 0).length },
  weights, market_mid: { all: score(r => r.pmid), wf: score(r => r.pmid, wfRows) }, variants: {} };
for (const [key, name] of Object.entries(VARIANTS))
  report.variants[key] = { name, raw: score(r => r[key]), self_loo: score(r => r[`${key}_slo`]), blend_loo: score(r => r[`${key}_lo`]), raw_wf: score(r => r[key], wfRows), self_wf: score(r => r[`${key}_swf`], wfRows), blend_wf: score(r => r[`${key}_wf`], wfRows) };
if (OUT) fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 1));

const f = x => x == null ? '–' : (100 * x).toFixed(2) + '%';
const line = (lab, s) => `  ${lab.padEnd(34)} LL κλείσιμο ${s.logloss_close.toFixed(4)} · LL αποτέλεσμα ${s.logloss_result?.toFixed(4) ?? '–'} · ` +
  THR.map(t => `EV≥${t * 100}%: ${s.picks[t].n} CLV ${f(s.picks[t].clv)} κίνηση ${f(s.picks[t].move)}`).join(' · ');
console.log(`Props βαθμονόμηση: ${rows.length} γραμμές, ${events.length} αγώνες, αγωνιστικές ${rounds.join(',')} · με απόντα (γνωστό) ${report.counts.with_absent_known}, (πραγματικό) ${report.counts.with_absent_actual}`);
console.log(`  k usage: ${Object.entries(K).map(([s, v]) => `${s} ${v.k}`).join(' · ')}`);
console.log('Όλες οι γραμμές (βαθμονόμηση leave-one-game-out):');
console.log(line('αγορά στο mid', report.market_mid.all));
for (const [k, v] of Object.entries(report.variants)) { console.log(line(v.name, v.raw)); console.log(line('  + διόρθωση κλίσης', v.self_loo)); console.log(line('  + μείξη με αγορά', v.blend_loo)); }
console.log(`Walk-forward (εκπαίδευση σε προηγούμενες αγωνιστικές, έλεγχος σε ${rounds.slice(1).join(',')}):`);
console.log(line('αγορά στο mid', report.market_mid.wf));
for (const [k, v] of Object.entries(report.variants)) { console.log(line(v.name, v.raw_wf)); console.log(line('  + διόρθωση κλίσης', v.self_wf)); console.log(line('  + μείξη με αγορά', v.blend_wf)); }
console.log('Βάρη (μοντέλο, αγορά, σταθερά):', JSON.stringify(weights));
