// Συγκεντρωτικά νούμερα για το ιδιωτικό dashboard των επενδυτών → data/predictions/investor-metrics.json
// ΜΟΝΟ μετρήσεις (ακρίβεια, Brier, MAE, CLV, ROI, πλήθη). Καμία γραμμή, απόδοση ή επιλογή.
//   node scripts/investor-metrics.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; } };
const r4 = x => x == null ? null : +(+x).toFixed(4);

// 1. μοντέλα αποτελέσματος (backtest χωρίς διαρροή)
const leagues = [];
const ml = J('data/matchups/backtest.json')?.summary;
if (ml) leagues.push({ league: 'EuroLeague + EuroCup', games: ml.n, accuracy: r4(ml.accuracy), brier: r4(ml.brier), margin_mae: r4(ml.margin_mae) });
const gb = J('data/gbl/model/latest.json')?.backtest;
if (gb) leagues.push({ league: 'Stoiximan GBL', games: gb.n, accuracy: r4(gb.accuracy), brier: r4(gb.brier), margin_mae: r4(gb.margin_mae) });
const nbt = J('data/nba/model/backtest-games.json');
if (nbt?.length) leagues.push({ league: 'NBA', games: nbt.length, accuracy: r4(nbt.filter(x => (x[2] > 0.5) === (x[5] === 1)).length / nbt.length),
  brier: r4(nbt.reduce((a, x) => a + (x[2] - x[5]) ** 2, 0) / nbt.length), margin_mae: r4(nbt.reduce((a, x) => a + Math.abs(x[3] - x[6]), 0) / nbt.length) });

// 2. προβολές παικτών: MAE μοντέλου έναντι μέσου όρου σεζόν
const projections = [];
for (const [league, f] of [['Stoiximan GBL', 'data/gbl/model/projections-eval.json'], ['NBA', 'data/nba/model/projections-eval.json']]) {
  const e = J(f); if (!e?.mae) continue;
  for (const s of ['pts', 'reb', 'ast', 'fg3']) if (e.mae.model?.[s] != null)
    projections.push({ league, stat: s, n: e.n, model_mae: e.mae.model[s], season_avg_mae: e.mae.avg[s], gain: r4(1 - e.mae.model[s] / e.mae.avg[s]) });
}

// 3. props EuroLeague: η διαδρομή του CLV (EV ≥ 5%)
const pc = J('data/predictions/props-calib.json'), props_steps = [];
if (pc) {
  const v = pc.variants, b = pc.best_price, T = '0.05';
  const add = (step, s, book) => s && props_steps.push({ step, picks: s.n, clv: s.clv, clv_lo: s.ci95?.[0] ?? null, clv_hi: s.ci95?.[1] ?? null, prices: book });
  add('Μοντέλο (αρχικό)', v.pm?.raw?.picks?.[T], 'ένα book');
  add('+ διόρθωση κλίσης', v.pm?.self_loo?.picks?.[T], 'ένα book');
  add('+ συμπαίκτες, αντίπαλος, ρυθμός', v.px?.self_loo?.picks?.[T] ?? v.pc?.self_loo?.picks?.[T], 'ένα book');
  add('+ καλύτερη τιμή', b?.model_pace?.[T]?.best ?? b?.model_full?.[T]?.best, 'καλύτερη τιμή');
  add('+ καλύτερη τιμή, μόνο ελληνικά books', b?.model_pace?.[T]?.best_greek ?? b?.model_self?.[T]?.best_greek, 'ελληνικά books');
}
const clvHead = pc ? { lines: pc.counts.lines, games: pc.counts.games, rounds: pc.counts.rounds.join(', '), margin: J('data/predictions/props-clv.json')?.margin_close ?? null } : null;

// 4. εκτός δείγματος (κλειδωμένες προβλέψεις, αποτέλεσμα)
const oo = J('data/predictions/props-oos.json'), oos = [];
if (oo) for (const t of ['0.03', '0.05', '0.08']) { const s = oo.live?.[t]; if (s) oos.push({ ev_min: +t, picks: s.n, games: s.games, roi: s.roi, hit: s.hit, ci_lo: s.ci95?.[0] ?? null, ci_hi: s.ci95?.[1] ?? null }); }
const oosHead = oo ? { rounds: oo.rounds.join(', '), settled: oo.counts.settled, games: oo.counts.games, ll_market: oo.logloss.market, ll_model: oo.logloss.model_live } : null;

// 5. NBA έναντι αγοράς (ESPN BET)
const nc = J('data/nba/model/calib.json'), nba_market = [];
if (nc?.brier) for (const [k, lab] of [['model', 'Μοντέλο'], ['self', 'Μοντέλο, διορθωμένο'], ['blend', 'Μείξη με άνοιγμα'], ['open', 'Αγορά στο άνοιγμα'], ['close', 'Αγορά στο κλείσιμο']])
  nba_market.push({ who: lab, brier: nc.brier[k], log_loss: nc.logloss[k] });
const nba_bets = [];
if (nc?.ml_at_open) for (const [k, lab] of [['p', 'Μοντέλο'], ['self', 'Διορθωμένο'], ['blend', 'Μείξη']]) { const s = nc.ml_at_open[k]?.['0.05']; if (s) nba_bets.push({ model: lab, picks: s.n, roi: s.roi, clv: s.clv, clv_lo: s.clv_ci95?.[0] ?? null, clv_hi: s.clv_ci95?.[1] ?? null }); }

const out = { generated: new Date().toISOString(), note: 'μόνο συγκεντρωτικές μετρήσεις, χωρίς γραμμές ή αποδόσεις',
  leagues, projections, props_steps, props_head: clvHead, oos, oos_head: oosHead, nba_market, nba_bets, nba_head: nc ? { games: nc.counts.tested, margin: nc.margin_close } : null };
fs.writeFileSync(path.join(ROOT, 'data/predictions/investor-metrics.json'), JSON.stringify(out, null, 1));
console.log(`Investor metrics: ${leagues.length} πρωταθλήματα, ${projections.length} προβολές, ${props_steps.length} βήματα CLV, ${oos.length} εκτός δείγματος, NBA ${nba_market.length}`);
