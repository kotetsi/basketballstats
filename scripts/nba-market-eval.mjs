// NBA: μοντέλο έναντι αγοράς, μόνο με προβλέψεις που κλειδώθηκαν πριν από τον αγώνα (data/nba/model/archive)
// και το τελευταίο στιγμιότυπο αποδόσεων πριν από το τζάμπολ (data/nba/odds/<μέρα>.json).
//   Νικητής: Brier μοντέλου, αγοράς (μέση πιθανότητα χωρίς γκανιότα) και μείξης 50/50.
//   Προσομοίωση στοιχήματος (1 μονάδα): όπου το μοντέλο βλέπει αξία ≥ EDGE στην καλύτερη απόδοση.
//   Χάντικαπ/σύνολο: P(κάλυψη) από κανονική κατανομή γύρω από την εκτίμηση του μοντέλου (σ από το backtest).
//   node scripts/nba-market-eval.mjs → data/nba/model/market-eval.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const EDGE = 0.03, SIG_M = 12.5, SIG_T = 18;
const ncdf = x => 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x ** 3)));

// αποτελέσματα
const res = new Map();
for (const d of await fs.readdir(path.join(ROOT, 'data', 'nba')).catch(() => [])) { const j = await readJSON(path.join(ROOT, 'data', 'nba', d, 'games.json'), null); for (const g of j?.games || []) if (g.played && g.home.score != null) res.set(g.id, g); }
// προβλέψεις πριν από τον αγώνα
const pred = new Map();
const adir = path.join(ROOT, 'data', 'nba', 'model', 'archive');
for (const f of (await fs.readdir(adir).catch(() => [])).filter(f => f.endsWith('.jsonl')).sort())
  for (const l of (await fs.readFile(path.join(adir, f), 'utf8')).split('\n').filter(Boolean)) { const x = JSON.parse(l); (pred.get(x.id) || pred.set(x.id, []).get(x.id)).push(x); }
// αποδόσεις: το τελευταίο στιγμιότυπο πριν από το τζάμπολ
const odds = new Map();
const odir = path.join(ROOT, 'data', 'nba', 'odds');
for (const f of (await fs.readdir(odir).catch(() => [])).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort())
  for (const s of (await readJSON(path.join(odir, f), { snapshots: [] })).snapshots) for (const [id, g] of Object.entries(s.games)) if (Date.parse(s.at) < Date.parse(g.tip)) odds.set(id, { at: s.at, ...g });

const rows = [], bets = { ml: [], spread: [], total: [] };
for (const [id, o] of odds) {
  const g = res.get(id); if (!g) continue;
  const P = (pred.get(id) || []).filter(x => Date.parse(x.at) < Date.parse(o.tip)).at(-1); if (!P) continue;
  const books = Object.entries(o.books);
  const nv = books.map(([, b]) => b.ml).filter(Boolean).map(([h, a]) => (1 / h) / (1 / h + 1 / a));
  if (!nv.length) continue;
  const mkt = nv.reduce((a, x) => a + x, 0) / nv.length, y = g.home.score > g.away.score ? 1 : 0, margin = g.home.score - g.away.score, total = g.home.score + g.away.score;
  rows.push({ id, y, model: P.p_home, market: mkt, blend: (P.p_home + mkt) / 2, elo: P.elo_p });
  // νικητής: καλύτερη απόδοση κάθε πλευράς
  const best = side => Math.max(...books.map(([, b]) => b.ml?.[side] || 0));
  for (const [side, p, won] of [[0, P.p_home, y === 1], [1, 1 - P.p_home, y === 0]]) { const pr = best(side); if (pr > 1 && p * pr - 1 >= EDGE) bets.ml.push({ id, ev: p * pr - 1, ret: won ? pr - 1 : -1 }); }
  // χάντικαπ (γραμμή του γηπεδούχου): καλύπτει αν margin + line > 0
  // γραμμές χάντικαπ/συνόλου: της Pinnacle αν υπάρχει (η πιο «σφιχτή» αγορά), αλλιώς του πρώτου bookmaker
  const ref = k => (o.books.pinnacle?.[k]) || books.map(([, b]) => b[k]).filter(Boolean)[0];
  const sp = ref('spread');
  if (sp) { const pH = 1 - ncdf((-sp.line - P.margin) / SIG_M), push = margin + sp.line === 0;
    for (const [p, pr, won] of [[pH, sp.h, margin + sp.line > 0], [1 - pH, sp.a, margin + sp.line < 0]]) if (!push && p * pr - 1 >= EDGE) bets.spread.push({ id, ev: p * pr - 1, ret: won ? pr - 1 : -1 }); }
  const tt = ref('total');
  if (tt) { const pO = 1 - ncdf((tt.line - P.total) / SIG_T), push = total === tt.line;
    for (const [p, pr, won] of [[pO, tt.over, total > tt.line], [1 - pO, tt.under, total < tt.line]]) if (!push && p * pr - 1 >= EDGE) bets.total.push({ id, ev: p * pr - 1, ret: won ? pr - 1 : -1 }); }
}
const brier = k => rows.length ? +(rows.reduce((a, r) => a + (r[k] - r.y) ** 2, 0) / rows.length).toFixed(4) : null;
const sum = L => ({ n: L.length, roi: L.length ? +(L.reduce((a, x) => a + x.ret, 0) / L.length).toFixed(4) : null, avg_ev: L.length ? +(L.reduce((a, x) => a + x.ev, 0) / L.length).toFixed(4) : null });
const out = { generated_at: new Date().toISOString(), games: rows.length, edge: EDGE,
  brier: { model: brier('model'), market: brier('market'), blend: brier('blend'), elo: brier('elo') },
  bets: { ml: sum(bets.ml), spread: sum(bets.spread), total: sum(bets.total) },
  note: 'μόνο προβλέψεις κλειδωμένες πριν από τον αγώνα και αποδόσεις πριν από το τζάμπολ· λίγοι αγώνες = μεγάλη αβεβαιότητα' };
await fs.mkdir(path.join(ROOT, 'data', 'nba', 'model'), { recursive: true });
await fs.writeFile(path.join(ROOT, 'data', 'nba', 'model', 'market-eval.json'), JSON.stringify(out, null, 1));
console.log(`NBA μοντέλο έναντι αγοράς: ${rows.length} αγώνες · Brier μοντέλο ${out.brier.model} αγορά ${out.brier.market} μείξη ${out.brier.blend} · στοιχήματα ML ${out.bets.ml.n} (ROI ${out.bets.ml.roi}) χάντικαπ ${out.bets.spread.n} (${out.bets.spread.roi}) σύνολο ${out.bets.total.n} (${out.bets.total.roi})`);
