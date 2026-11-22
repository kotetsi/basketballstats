// Βαθμονόμηση της P(Over) του Prop Analyzer σε πραγματικές γραμμές bookmakers με αποτέλεσμα (ίδιες πηγές με το props-history-eval):
//  ιστορικό OddsPapi (τιμές κλεισίματος) + γραμμές του props-track. Για κάθε γραμμή, πιθανότητα μοντέλου walk-forward
//  (μόνο αγώνες πριν από την αγωνιστική) με και χωρίς xPTS, και επιλογή της μετατόπισης logit (calShift) με το μικρότερο log-loss.
//  Έλεγχος σταθερότητας: η μετατόπιση εκτιμάται χωριστά σε μονές/ζυγές αγωνιστικές και μετριέται στις άλλες.
// node scripts/props-calshift-eval.mjs
import fs from 'node:fs';
import path from 'node:path';
import { STATS, PARAMS, project, pOver, teamMinutes, statOfMarket } from '../src/odds/props.mjs';
import { leagueZonePct, loadShotIndex, xptsRows } from '../src/odds/xpts.mjs';

const ROOT = new URL('..', import.meta.url).pathname, OD = path.join(ROOT, 'data/odds');
const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const C = J(path.join(ROOT, 'data/cache.json')), SEASON = J(path.join(ROOT, 'site.config.json')).season;
const players = (C.players || []).filter(p => !String(p.t).includes(';'));
const POS = Object.fromEntries(J(path.join(ROOT, 'data/fantasy/latest.json')).players.map(p => [p.c, p.pos]));
const META = J(path.join(OD, 'oddspapi_meta.json')).markets, NAMES = J(path.join(OD, 'status.json')).playerNames || {};
const TRACK = (() => { try { return J(path.join(OD, 'props-track.json')).lines; } catch { return {}; } })();
const LZ = leagueZonePct(path.join(ROOT, 'data/shots')), IDX = loadShotIndex(path.join(ROOT, 'data/shots', SEASON), C.league.games);
const stats = Object.keys(STATS), byCode = Object.fromEntries(players.map(p => [p.c, p]));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const priorBy = new Map(); { const cum = Object.fromEntries(stats.map(s => [s, 0])); let cm = 0;
  const allR = [...new Set(players.flatMap(p => p.g.filter(r => r[7] > 0).map(r => +r[0])))].sort((a, b) => a - b);
  for (const R of [...allR, Math.max(...allR) + 1]) { priorBy.set(R, Object.fromEntries(stats.map(s => [s, cm ? cum[s] / cm : 0]))); for (const p of players) for (const r of p.g) if (+r[0] === R && r[7] > 0) { for (const s of stats) cum[s] += STATS[s](r); cm += r[7] / 60; } } }
const hist = (p, R) => p.g.filter(r => r[7] > 0 && +r[0] < R).sort((a, b) => a[0] - b[0]);
const rowOf = (p, R) => p.g.find(r => +r[0] === R && r[7] > 0);
const minC = new Map();
function pModel(p, R, gid, s, line, xp) {
  const key = gid + '|' + p.t;
  if (!minC.has(key)) {
    const team = players.filter(x => x.t === p.t), tm = team.map(x => ({ c: x.c, pos: POS[x.c] || 'Forward', pl: hist(x, R) }));
    const prevR = Math.max(0, ...[...new Set(team.flatMap(x => x.g.filter(r => r[7] > 0).map(r => +r[0])))].filter(r => r < R));
    const out = new Set(team.filter(x => !rowOf(x, R)).map(x => x.c)), fresh = new Set(tm.filter(x => out.has(x.c) && x.pl.length && +x.pl[x.pl.length - 1][0] === prevR).map(x => x.c));
    minC.set(key, teamMinutes(tm, out, fresh).M);
  }
  const min = minC.get(key)[p.c], h = hist(p, R); if (!(min > 0) || h.length < 3) return null;
  const pr = project(h, s, { prior: priorBy.get(R)[s], minutes: min, xrows: xp ? xptsRows(h, p.c, IDX, LZ, { lam: PARAMS.xLam, k: PARAMS.xK }) : null });
  return pr ? pOver(pr.mu, pr.var, line) : null;
}
const L = [];   // { R, p0 (χωρίς xPTS), p1 (με xPTS), mk (αγορά χωρίς vig), y }
const seen = new Set();
function add(R, gid, p, s, line, po, pu) {
  const row = rowOf(p, R); if (!row) return; const y = STATS[s](row); if (y === line) return;
  const k = `${gid}|${p.c}|${s}|${line}`; if (seen.has(k)) return; seen.add(k);
  const p0 = pModel(p, R, gid, s, line, false), p1 = pModel(p, R, gid, s, line, true); if (p0 == null || p1 == null) return;
  L.push({ R, p0, p1, po, pu, mk: (1 / po) / (1 / po + 1 / pu), y: y > line ? 1 : 0 });
}
for (const f of fs.readdirSync(path.join(OD, 'hist')).filter(f => /^E-\d+-/.test(f))) {
  const H = J(path.join(OD, 'hist', f)); const [, R, h, a] = H.gid.match(/^E-(\d+)-(\w+)-(\w+)$/);
  const roster = players.filter(p => p.t === h || p.t === a);
  const find = pid => { const nm = NAMES[pid]; if (!nm) return null; const [last, first = ''] = nm.split(',').map(fold); const c = roster.filter(p => { const x = fold(p.n); return x.includes(last) && (!first || x.includes(first.split(' ')[0])); }); return c.length === 1 ? c[0] : null; };
  for (const [book, mkts] of Object.entries(H.books)) {
    if (book === 'bet365') continue;
    for (const [mid, outs] of Object.entries(mkts)) {
      const M = META[mid], s = statOfMarket(M?.name); if (!s) continue;
      const oId = M.outcomes.find(o => o.name === 'Over')?.id, uId = M.outcomes.find(o => o.name === 'Under')?.id, O = outs[oId] || {}, U = outs[uId] || {};
      for (const pid of Object.keys(O)) { const po = O[pid]?.close, pu = U[pid]?.close; if (!(po > 1 && pu > 1)) continue; const p = find(pid); if (p) add(+R, H.gid, p, s, M.line, po, pu); }
    }
  }
}
for (const r of Object.values(TRACK)) { const [gid, R, c, s, line, po, pu, , , , , res] = r; if (typeof res !== 'number' || !(po > 1 && pu > 1)) continue; const p = byCode[c]; if (p && stats.includes(s)) add(R, gid, p, s, line, po, pu); }

const lg = x => Math.log(x / (1 - x)), sg = z => 1 / (1 + Math.exp(-z)), cl = x => Math.min(1 - 1e-4, Math.max(1e-4, x));
const shift = (q, c) => sg(lg(cl(q)) + c);
const ll = (rows, key, c, blend = 0) => rows.reduce((t, r) => { const q = (1 - blend) * shift(r[key], c) + blend * r.mk; return t - (r.y ? Math.log(q) : Math.log(1 - q)); }, 0) / rows.length;
const best = (rows, key) => { let b = null; for (let c = -0.3; c <= 0.6001; c += 0.01) { const v = ll(rows, key, c); if (!b || v < b.v) b = { c: +c.toFixed(2), v }; } return b; };
const rounds = [...new Set(L.map(r => r.R))].sort((a, b) => a - b);
console.log(`${L.length} γραμμές με αποτέλεσμα · αγωνιστικές ${rounds.join(', ')} · over στην πράξη ${(100 * L.reduce((s, r) => s + r.y, 0) / L.length).toFixed(1)}%`);
for (const [key, name] of [['p0', 'χωρίς xPTS'], ['p1', 'με xPTS']]) {
  const mean = L.reduce((s, r) => s + r[key], 0) / L.length, b = best(L, key);
  const odd = L.filter(r => r.R % 2), even = L.filter(r => !(r.R % 2)), bo = best(odd, key), be = best(even, key);
  console.log(`${name}: μέση P(over) ${(100 * mean).toFixed(1)}% · log-loss χωρίς διόρθωση ${ll(L, key, 0).toFixed(4)}, με calShift ${PARAMS.calShift} ${ll(L, key, PARAMS.calShift).toFixed(4)}, καλύτερο ${b.c} → ${b.v.toFixed(4)}`
    + ` · μονές: καλύτερο ${bo.c} (στις ζυγές ${ll(even, key, bo.c).toFixed(4)}) · ζυγές: καλύτερο ${be.c} (στις μονές ${ll(odd, key, be.c).toFixed(4)})`
    + ` · μείξη 50/50 με αγορά (calShift ${PARAMS.calShift}): ${ll(L, key, PARAMS.calShift, 0.5).toFixed(4)}, (καλύτερο ${b.c}): ${ll(L, key, b.c, 0.5).toFixed(4)}`);
}
console.log(`αγορά μόνη: log-loss ${ll(L.map(r => ({ ...r, m: r.mk })), 'm', 0).toFixed(4)}`);
// βάρος μοντέλου στη μείξη με την αγορά (PARAMS.blend), με xPTS και την καλύτερη μετατόπιση
{ const c = best(L, 'p1').c, odd = L.filter(r => r.R % 2), even = L.filter(r => !(r.R % 2));
  console.log('βάρος μοντέλου στη μείξη (με xPTS, calShift ' + c + '): ' + [0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map(w => `${w}: ${ll(L, 'p1', c, 1 - w).toFixed(4)} (μονές ${ll(odd, 'p1', c, 1 - w).toFixed(4)}, ζυγές ${ll(even, 'p1', c, 1 - w).toFixed(4)})`).join(' · ')); }
// «Αξίζει» (απλοποιημένο: EV ≥ 5% με τη μείξη 50/50, |μοντέλο − αγορά| ≤ 25 μονάδες): επιτυχία και ROI ανά ρύθμιση
for (const [key, c] of [['p0', PARAMS.calShift], ['p1', PARAMS.calShift], ['p1', 0.04]]) {
  let n = 0, w = 0, pr = 0; const by = { over: [0, 0], under: [0, 0] };
  for (const r of L) { const pm = shift(r[key], c); for (const side of ['over', 'under']) { const m = side === 'over' ? pm : 1 - pm, mk = side === 'over' ? r.mk : 1 - r.mk, price = side === 'over' ? r.po : r.pu, pb = 0.5 * m + 0.5 * mk;
    if (pb * price - 1 < 0.05 || Math.abs(m - mk) > 0.25) continue; const win = (r.y === 1) === (side === 'over'); n++; w += win; pr += win ? price - 1 : -1; by[side][0]++; by[side][1] += win ? price - 1 : -1; } }
  console.log(`Αξίζει ${key === 'p1' ? 'με' : 'χωρίς'} xPTS, calShift ${c}: ${n} επιλογές, επιτυχία ${(100 * w / n).toFixed(1)}%, ROI ${(100 * pr / n).toFixed(1)}% (over ${by.over[0]} ROI ${(100 * by.over[1] / Math.max(1, by.over[0])).toFixed(1)}%, under ${by.under[0]} ROI ${(100 * by.under[1] / Math.max(1, by.under[0])).toFixed(1)}%)`);
}
