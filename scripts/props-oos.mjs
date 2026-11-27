// Τεστ ΕΚΤΟΣ δείγματος στα player props της EuroLeague: αγωνιστικές με κλειδωμένες προβλέψεις (data/predictions/<season>/rNN.jsonl)
// που ΔΕΝ χρησιμοποιήθηκαν στη βαθμονόμηση (props-calib.json → live_cal.rounds).
//   πιθανότητα = ζωντανό μοντέλο: κλειδωμένη πρόβλεψη (predicted_at < τιμή) × πλαίσιο (συμπαίκτες, αντίπαλος, ρυθμός, κατοστάρα) → κλίση
//   επιλογή: πλευρά με EV ≥ όριο στην ΚΑΛΥΤΕΡΗ τιμή «mid» ανάμεσα στα books · εκκαθάριση με το πραγματικό αποτέλεσμα (DNP = άκυρο)
// Μετρά ROI (1 μονάδα ανά επιλογή) με 95% διάστημα (bootstrap ανά αγώνα) και log loss μοντέλου έναντι αγοράς. Χωρίς τιμές κλεισίματος.
//   node scripts/props-oos.mjs [--json data/predictions/props-oos.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pOver, matchPlayer, noVig, STATS, liveCal } from '../src/odds/props.mjs';
import { bootstrapMean } from '../src/odds/clv-rows.mjs';
import { teamIndex, oppIndex, gameIndex, contextFactor, paceBlowFactor, USAGE_KEYS } from '../src/odds/usage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const outArg = process.argv.indexOf('--json'), OUT = outArg > 0 ? process.argv[outArg + 1] : null;
const THR = [0.03, 0.05, 0.08];
const season = J('site.config.json').season, cache = J('data/cache.json'), PC = J('data/predictions/props-calib.json');
const cal = liveCal(PC), used = new Set(PC.live_cal?.rounds || []);
const LIC = J('data/odds/licensed.json'), grBrands = new Set(Object.keys(LIC.gr?.brands || {}));
const isGr = b => grBrands.has(b) || (b.endsWith('.gr') && grBrands.has(b.replace(/\.gr$/, '')));

// κλειδωμένες προβλέψεις, μόνο αγωνιστικές εκτός βαθμονόμησης
const ARCH = new Map(), ROUNDS = new Set();
const dir = path.join(ROOT, 'data', 'predictions', season);
for (const f of (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(f => /^r\d+\.jsonl$/.test(f))) {
  const R = +f.slice(1, -6); if (used.has(R)) continue;
  for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) { if (!l) continue; let x; try { x = JSON.parse(l); } catch { continue; }
    if (!x.legacy_gid || !x.player_id) continue; ROUNDS.add(R); const k = `${x.legacy_gid}|${x.player_id}`; (ARCH.get(k) || ARCH.set(k, []).get(k)).push(x); }
}
const played = new Set(cache.league.games.filter(g => g[6]).map(g => `E-${g[0]}-${g[2]}-${g[3]}`));

// τελευταία τιμή «mid» (ή, αν λείπει, οποιαδήποτε πριν από το τζάμπολ) ανά (αγώνας, book, παίκτης, stat, γραμμή, πλευρά)
const Q = new Map();
for (const l of fs.readFileSync(path.join(ROOT, 'data/odds/props-history.jsonl'), 'utf8').split('\n')) {
  if (!l) continue; const x = JSON.parse(l), st = x.market.replace('prop:', ''), R = +x.event.split('-')[1];
  if (!ROUNDS.has(R) || !USAGE_KEYS.includes(st) || !(x.seen < x.commence) || x.window !== 'mid' || !played.has(x.event)) continue;
  const k = `${x.event}|${x.book}|${x.player}|${st}|${x.line}|${x.sel}`, o = Q.get(k); if (!o || o.seen < x.seen) Q.set(k, x);
}
const pairs = new Map();
for (const x of Q.values()) { const st = x.market.replace('prop:', ''), k = `${x.event}|${x.book}|${x.player}|${st}|${x.line}`;
  const p = pairs.get(k) || { event: x.event, book: x.book, player: x.player, st, line: x.line, seen: '' }; p[x.sel] = x.price; if (x.seen > p.seen) p.seen = x.seen; pairs.set(k, p); }

const ix = teamIndex(cache.players, cache.league.games), ox = oppIndex(cache.players, cache.league.games), gx = PC.pace_blowout ? gameIndex(cache.league.games) : null;
const POS = new Map(cache.players.map(p => [p.c, p.pos]));
const avgMin = (p, R) => { const L = (p.g || []).filter(x => x[0] < R && x[7] > 0); return L.length ? L.reduce((a, x) => a + x[7] / 60, 0) / L.length : 0; };
const rosterOf = t => cache.players.filter(p => String(p.t).split(';').includes(t));
const lg = p => Math.log(p / (1 - p)), sg = z => 1 / (1 + Math.exp(-z)), clip = p => Math.min(1 - 1e-4, Math.max(1e-4, p));
const lines = []; let unmatched = 0, noPred = 0;
for (const p of pairs.values()) {
  if (!(p.over > 1 && p.under > 1)) continue;
  const [, r, h, a] = p.event.split('-'), R = +r;
  let pl = null, team = null; for (const t of [h, a]) { pl = matchPlayer(p.player, rosterOf(t)); if (pl) { team = t; break; } }
  if (!pl) { unmatched++; continue; }
  const L = (ARCH.get(`${p.event}|${pl.c}`) || []).filter(x => x.predicted_at < p.seen).sort((x, y) => x.predicted_at.localeCompare(y.predicted_at)), x = L.at(-1);
  const s = x?.stats?.[p.st]; if (!s || x.quality === 'insufficient' || x.quality === 'out') { noPred++; continue; }
  const opp = team === h ? a : h, q = { c: pl.c, pos: POS.get(pl.c), team, opp, R, s: p.st };
  const f = PC.usage_k && PC.opp_beta ? contextFactor({ ix, ox, K: PC.usage_k, B: PC.opp_beta }, q) * paceBlowFactor({ gx, PB: PC.pace_blowout }, { team, opp, R, s: p.st, home: team === h, avgMin: avgMin(pl, R) }) : 1;
  const raw = clip(pOver(s.mean, s.sd ** 2, p.line)), full = clip(pOver(s.mean * f, s.sd ** 2 * f, p.line));
  const g = (pl.g || []).find(r => r[0] === R && r[7] > 0);
  lines.push({ event: p.event, R, c: pl.c, st: p.st, line: p.line, book: p.book, gr: isGr(p.book), over: p.over, under: p.under,
    raw, live: cal ? sg(cal.a * lg(full) + cal.c) : full, mkt: noVig(p.over, p.under).over, y: g ? STATS[p.st](g) : null });
}

// ομάδες γραμμών: καλύτερη τιμή ανά πλευρά, αγορά = μέση πιθανότητα χωρίς γκανιότα
const groups = new Map();
for (const l of lines) { const k = `${l.event}|${l.c}|${l.st}|${l.line}`; (groups.get(k) || groups.set(k, []).get(k)).push(l); }
const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
function bets(pOf, thr, only = null) {
  const out = [];
  for (const G0 of groups.values()) {
    const G = only ? G0.filter(only) : G0; if (!G.length || G[0].y == null || G[0].y === G[0].line) continue;
    const p = pOf ? mean(G.map(pOf)) : null, won = G[0].y > G[0].line ? 'over' : 'under';
    for (const side of ['over', 'under']) {
      const price = Math.max(...G.map(l => l[side])), q = side === 'over' ? p : 1 - p;
      if (pOf && q * price - 1 < thr) continue;
      out.push({ event: G[0].event, side, v: side === won ? price - 1 : -1 });
    }
  }
  return { n: out.length, games: new Set(out.map(x => x.event)).size, roi: out.length ? +mean(out.map(x => x.v)).toFixed(4) : null, ci95: new Set(out.map(x => x.event)).size >= 8 ? bootstrapMean(out) : null,   // με < 8 αγώνες το διάστημα δεν έχει νόημα
    under: out.filter(x => x.side === 'under').length, hit: out.length ? +(out.filter(x => x.v > 0).length / out.length).toFixed(3) : null };
}
const ll = (p, t) => -(t * Math.log(p) + (1 - t) * Math.log(1 - p));
const settled = [...groups.values()].filter(G => G[0].y != null && G[0].y !== G[0].line);
const LL = f => settled.length ? +mean(settled.map(G => ll(clip(mean(G.map(f))), G[0].y > G[0].line ? 1 : 0))).toFixed(4) : null;
const report = { generated: new Date().toISOString(), season, rounds: [...ROUNDS].sort((a, b) => a - b), calibrated_on: [...used], live_cal: cal,
  method: 'κλειδωμένη πρόβλεψη πριν από την τιμή mid · καλύτερη τιμή mid ανάμεσα στα books · εκκαθάριση με το αποτέλεσμα · 1 μονάδα ανά επιλογή',
  counts: { lines: lines.length, groups: groups.size, settled: settled.length, games: new Set(lines.map(l => l.event)).size, unmatched, no_prediction: noPred },
  logloss: { market: LL(l => l.mkt), model_raw: LL(l => l.raw), model_live: LL(l => l.live) },
  over_rate: settled.length ? +mean(settled.map(G => G[0].y > G[0].line ? 1 : 0)).toFixed(3) : null,
  baseline: { all_sides_best: bets(null, 0) },
  live: Object.fromEntries(THR.map(t => [t, bets(l => l.live, t)])), live_greek: Object.fromEntries(THR.map(t => [t, bets(l => l.live, t, l => l.gr)])),
  raw: Object.fromEntries(THR.map(t => [t, bets(l => l.raw, t)])) };
if (OUT) fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 1));
const f = x => x == null ? '–' : (100 * x).toFixed(2) + '%';
console.log(`Props εκτός δείγματος: αγωνιστικές ${report.rounds.join(',') || '–'} (βαθμονόμηση σε ${report.calibrated_on.join(',')}) · ${report.counts.lines} γραμμές, ${report.counts.settled} εκκαθαρισμένες σε ${report.counts.games} αγώνες`);
console.log(`  log loss: αγορά ${report.logloss.market} · μοντέλο χωρίς διορθώσεις ${report.logloss.model_raw} · ζωντανό μοντέλο ${report.logloss.model_live} · over έπιασαν ${f(report.over_rate)}`);
console.log(`  όλες οι πλευρές στην καλύτερη τιμή: ROI ${f(report.baseline.all_sides_best.roi)}`);
for (const [lab, M] of [['ζωντανό', report.live], ['ζωντανό, ελληνικά books', report.live_greek], ['χωρίς διορθώσεις', report.raw]])
  console.log(`  ${lab}: ` + THR.map(t => `EV≥${t * 100}%: ${M[t].n} (under ${M[t].under}) ROI ${f(M[t].roi)} ${JSON.stringify(M[t].ci95)} πέτυχαν ${f(M[t].hit)}`).join(' | '));
