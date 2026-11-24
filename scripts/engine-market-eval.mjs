// Intelligence Engine, Φάση 6: έχει το engine πλεονέκτημα έναντι των bookmakers στα player props; (μόνο ανάγνωση)
//
// Γραμμές: data/odds/props-history.jsonl (κάθε τιμή με t = αλλαγή τιμής και seen = πότε τη διαβάσαμε).
// Για κάθε (αγώνας, bookmaker, παίκτης, stat, γραμμή) κρατάμε την ΤΕΛΕΥΤΑΙΑ τιμή over και under με seen < τζάμπολ
// (υπήρχε πριν από τον αγώνα· ποτέ τιμή κλεισίματος που δεν είχαμε δει). Δεν χρησιμοποιούνται τα data/odds/hist
// (μόνο open/close χωρίς χρονοσφραγίδα).
// Πιθανότητα engine: projectPlayer() του src/engine/projections.mjs με αγώνες < αγωνιστική και λεπτά «αν παίξει» από το
// walk-forward του hurdle (data/fantasy/perf/minutes_hurdle.csv.gz). Αν ο παίκτης δεν έπαιξε, η γραμμή είναι void.
//   node scripts/engine-market-eval.mjs [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { STATS, pOver, matchPlayer, noVig } from '../src/odds/props.mjs';
import { projectPlayer, leagueRates, prevSeasonRates } from '../src/engine/projections.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const outArg = process.argv.indexOf('--json'), OUT = outArg > 0 ? process.argv[outArg + 1] : null;
const season = J('site.config.json').season, cache = J('data/cache.json');
const prev = (() => { try { return J(`data/fantasy/hist/E${+season.slice(1) - 1}.json`).players; } catch { return []; } })();
const PREV = prevSeasonRates(prev);
const LIC = J('data/odds/licensed.json');
const grBrands = new Set(Object.keys(LIC.gr?.brands || {}));
const isGr = book => grBrands.has(book) || grBrands.has(book.replace(/\.gr$/, '')) && book.endsWith('.gr');
const SK = ['pts', 'reb', 'ast', 'fg3'];

// λεπτά walk-forward
const HZ = new Map();
{ const L = gunzipSync(fs.readFileSync(path.join(ROOT, 'data/fantasy/perf/minutes_hurdle.csv.gz'))).toString().split('\n').filter(Boolean), H = L[0].split(',');
  for (const l of L.slice(1)) { const v = Object.fromEntries(H.map((h, i) => [h, l.split(',')[i]])); if (v.season === season) HZ.set(`${v.round}|${v.c}`, v); } }

// 1. τελευταία pregame τιμή ανά (event, book, player, stat, line, sel)
const Q = new Map();
for (const l of fs.readFileSync(path.join(ROOT, 'data/odds/props-history.jsonl'), 'utf8').split('\n')) {
  if (!l) continue; const x = JSON.parse(l), st = x.market.replace('prop:', '');
  if (!SK.includes(st) || !(x.seen < x.commence)) continue;
  const k = `${x.event}|${x.book}|${x.player}|${st}|${x.line}|${x.sel}`, o = Q.get(k);
  if (!o || o.seen < x.seen) Q.set(k, x);
}
// 2. ζεύγη over/under
const pairs = new Map();
for (const x of Q.values()) { const st = x.market.replace('prop:', ''), k = `${x.event}|${x.book}|${x.player}|${st}|${x.line}`; const p = pairs.get(k) || { ...x, st }; p[x.sel] = x.price; p.seenMax = p.seenMax > x.seen ? p.seenMax : x.seen; pairs.set(k, p); }

const P = new Map(cache.players.map(p => [p.c, p]));
const rosterOf = t => cache.players.filter(p => String(p.t).split(';').includes(t));
const projCache = new Map(), leagueAt = new Map();
const rows = [];
let unmatched = 0, noMin = 0, voided = 0, insuff = 0, unplayed = 0;
for (const x of pairs.values()) {
  if (!(x.over > 1 && x.under > 1)) continue;
  const [, r, h, a] = x.event.split('-'), R = +r;
  let pl = null, team = null; for (const t of [h, a]) { pl = matchPlayer(x.player, rosterOf(t)); if (pl) { team = t; break; } }
  if (!pl) { unmatched++; continue; }
  const game = cache.league.games.find(g => g[0] === R && g[2] === h && g[3] === a);
  if (!game?.[6]) { unplayed++; continue; }
  const hz = HZ.get(`${R}|${pl.c}`); if (!hz) { noMin++; continue; }
  const key = `${R}|${pl.c}`;
  if (!projCache.has(key)) {
    if (!leagueAt.has(R)) leagueAt.set(R, leagueRates(cache.players, R));
    projCache.set(key, projectPlayer(pl, { round: R, minutes: { p_play: +hz.hz_p, min_if_plays: +hz.hz_cond, min_exp: +hz.hz_exp }, league: leagueAt.get(R), prev: PREV.get(pl.c) || null }));
  }
  const pj = projCache.get(key);
  if (!pj.stats) { insuff++; continue; }
  const row = pl.g.find(g => g[0] === R && g[7] > 0);
  if (!row) { voided++; continue; }   // δεν έπαιξε: void
  const s = pj.stats[x.st], pm = pOver(s.mean, s.sd ** 2, x.line), nv = noVig(x.over, x.under), y = STATS[x.st](row) > x.line ? 1 : 0;
  rows.push({ event: x.event, round: R, book: x.book, gr: isGr(x.book), c: pl.c, st: x.st, line: x.line, over: x.over, under: x.under, pm, pk: nv.over, margin: nv.margin, y });
}

// 3. μετρικές
const clamp = p => Math.min(1 - 1e-4, Math.max(1e-4, p));
const brier = (xs, f) => xs.reduce((s, r) => s + (f(r) - r.y) ** 2, 0) / xs.length;
const logl = (xs, f) => -xs.reduce((s, r) => s + Math.log(r.y ? clamp(f(r)) : 1 - clamp(f(r))), 0) / xs.length;
const F = { engine: r => r.pm, market: r => r.pk, blend: r => 0.5 * r.pm + 0.5 * r.pk };
// bootstrap ανά αγώνα (οι γραμμές του ίδιου αγώνα συσχετίζονται): διαφορά Brier engine − market
function bootstrap(xs, stat, B = 400) {
  const byG = new Map(); for (const r of xs) (byG.get(r.event) || byG.set(r.event, []).get(r.event)).push(r);
  const G = [...byG.values()]; let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = []; for (let b = 0; b < B; b++) { const s = []; for (let i = 0; i < G.length; i++) s.push(...G[Math.floor(rnd() * G.length)]); out.push(stat(s)); }
  out.sort((p, q) => p - q); return [out[Math.floor(0.025 * B)], out[Math.floor(0.975 * B)]];
}
function picks(xs, prob, thr) {   // στοίχημα 1 μονάδας όπου EV ≥ thr (καλύτερη πλευρά ανά γραμμή/bookmaker)
  let n = 0, pnl = 0; const ps = [];
  for (const r of xs) {
    const p = prob(r), eo = p * r.over - 1, eu = (1 - p) * r.under - 1;
    const [ev, side] = eo >= eu ? [eo, 'over'] : [eu, 'under'];
    if (ev < thr) continue;
    const win = side === 'over' ? r.y === 1 : r.y === 0; n++; const v = win ? (side === 'over' ? r.over : r.under) - 1 : -1; pnl += v; ps.push({ event: r.event, v });
  }
  let ci = null;
  if (n >= 30) { const byG = new Map(); for (const x of ps) (byG.get(x.event) || byG.set(x.event, []).get(x.event)).push(x.v); const G = [...byG.values()]; let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); const o = []; for (let b = 0; b < 400; b++) { let s = 0, m = 0; for (let i = 0; i < G.length; i++) { const g = G[Math.floor(rnd() * G.length)]; s += g.reduce((a, c) => a + c, 0); m += g.length; } o.push(s / m); } o.sort((a, c) => a - c); ci = [+o[10].toFixed(3), +o[389].toFixed(3)]; }
  return { n, roi: n ? +(pnl / n).toFixed(3) : null, roi_ci95: ci };
}
function summary(xs) {
  if (!xs.length) return { n: 0 };
  const m = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, { brier: +brier(xs, f).toFixed(4), logloss: +logl(xs, f).toFixed(4) }]));
  const ci = bootstrap(xs, s => brier(s, F.engine) - brier(s, F.market));
  const ciB = bootstrap(xs, s => brier(s, F.blend) - brier(s, F.market));
  const ece = f => { const b = Array.from({ length: 10 }, () => [0, 0, 0]); for (const r of xs) { const q = f(r), k = Math.min(9, Math.floor(q * 10)); b[k][0]++; b[k][1] += q; b[k][2] += r.y; } return +(b.reduce((a, [n, sq, sy]) => a + Math.abs(sq - sy), 0) / xs.length).toFixed(4); };
  return { n: xs.length, games: new Set(xs.map(r => r.event)).size, players: new Set(xs.map(r => r.c)).size, ...m,
    brier_engine_minus_market_ci95: ci.map(v => +v.toFixed(4)), brier_blend_minus_market_ci95: ciB.map(v => +v.toFixed(4)),
    ece_engine: ece(F.engine), ece_blend: ece(F.blend), ece_market: ece(F.market),
    picks: Object.fromEntries([0.03, 0.05, 0.08].map(t => [`ev${t * 100}`, { engine: picks(xs, F.engine, t), blend: picks(xs, F.blend, t) }])) };
}
const report = { generated: new Date().toISOString(), season, method: 'last quote seen before tip-off; engine as-of round; void if not played', counts: { lines: rows.length, unmatched, unplayed, no_minutes: noMin, insufficient: insuff, void_dnp: voided },
  all: summary(rows), greece_licensed: summary(rows.filter(r => r.gr)), by_stat: Object.fromEntries(SK.map(s => [s, summary(rows.filter(r => r.st === s))])),
  by_round: Object.fromEntries([...new Set(rows.map(r => r.round))].sort().map(R => [R, summary(rows.filter(r => r.round === R))])) };
console.log(JSON.stringify({ counts: report.counts, all: report.all, greece: { n: report.greece_licensed.n, ...report.greece_licensed.engine && { engine: report.greece_licensed.engine, market: report.greece_licensed.market, ci: report.greece_licensed.brier_engine_minus_market_ci95, picks: report.greece_licensed.picks } } }, null, 1));
for (const s of SK) { const x = report.by_stat[s]; console.log(s, x.n, 'brier engine', x.engine?.brier, 'market', x.market?.brier, 'blend', x.blend?.brier, 'ci', JSON.stringify(x.brier_engine_minus_market_ci95)); }
// σύγκριση με το σημερινό μοντέλο props στις ίδιες γραμμές (data/odds/props-track.json: τελευταία pregame πιθανότητα, best τιμές Ελλάδας)
{
  const T = (() => { try { return J('data/odds/props-track.json').lines; } catch { return {}; } })();
  const eng = new Map(); for (const r of rows) eng.set(`${r.event}|${r.c}|${r.st}|${r.line}`, r);
  const same = [];
  for (const [k, x] of Object.entries(T)) { const e = eng.get(k); if (!e || x[11] == null || x[11] === 'void' || x[7] == null) continue; same.push({ event: x[0], y: x[11] > x[4] ? 1 : 0, engine: e.pm, props: x[7], market: x[8] ?? e.pk, over: x[5], under: x[6] }); }
  const b = f => +(same.reduce((s, r) => s + (f(r) - r.y) ** 2, 0) / same.length).toFixed(4);
  report.vs_props_model = same.length ? { n: same.length, games: new Set(same.map(r => r.event)).size, brier: { engine: b(r => r.engine), props_today: b(r => r.props), market: b(r => r.market), engine_blend: b(r => 0.5 * r.engine + 0.5 * r.market), props_blend: b(r => 0.5 * r.props + 0.5 * r.market) },
    ci_engine_minus_props: bootstrap(same, s => s.reduce((a, r) => a + (r.engine - r.y) ** 2 - (r.props - r.y) ** 2, 0) / s.length).map(v => +v.toFixed(4)) } : null;
  console.log('vs props model', JSON.stringify(report.vs_props_model));
}
if (OUT) fs.writeFileSync(path.resolve(OUT), JSON.stringify(report, null, 1));
