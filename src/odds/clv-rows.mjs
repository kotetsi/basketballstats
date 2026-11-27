// Γραμμές CLV για τα player props της EuroLeague (κοινό για props-clv.mjs και props-calib.mjs): βλ. scripts/props-clv.mjs
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { pOver, matchPlayer, noVig, STATS } from './props.mjs';
import { projectPlayer, leagueRates, prevSeasonRates } from '../engine/projections.mjs';

export const SK = ['pts', 'reb', 'ast', 'fg3'];

export function loadClvRows() {
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const season = J('site.config.json').season, cache = J('data/cache.json');
const prev = (() => { try { return J(`data/fantasy/hist/E${+season.slice(1) - 1}.json`).players; } catch { return []; } })();
const PREV = prevSeasonRates(prev);
const LIC = J('data/odds/licensed.json'), grBrands = new Set(Object.keys(LIC.gr?.brands || {}));
const isGr = b => grBrands.has(b) || (b.endsWith('.gr') && grBrands.has(b.replace(/\.gr$/, '')));

// λεπτά walk-forward (για αγωνιστικές χωρίς κλειδωμένο αρχείο)
const HZ = new Map();
{ const L = gunzipSync(fs.readFileSync(path.join(ROOT, 'data/fantasy/perf/minutes_hurdle.csv.gz'))).toString().split('\n').filter(Boolean), H = L[0].split(',');
  for (const l of L.slice(1)) { const v = Object.fromEntries(H.map((h, i) => [h, l.split(',')[i]])); if (v.season === season) HZ.set(`${v.round}|${v.c}`, v); } }
// κλειδωμένες προβλέψεις: όλες, για να πάρουμε την τελευταία ΠΡΙΝ από το mid
const ARCH = new Map(), ARCH_ROUNDS = new Set();
{ const dir = path.join(ROOT, 'data', 'predictions', season);
  for (const f of (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(f => /^r\d+\.jsonl$/.test(f)))
    for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) { if (!l) continue; let x; try { x = JSON.parse(l); } catch { continue; }
      if (!x.legacy_gid || !x.player_id) continue; ARCH_ROUNDS.add(+x.round); const k = `${x.legacy_gid}|${x.player_id}`; (ARCH.get(k) || ARCH.set(k, []).get(k)).push(x); } }

// τιμές: τελευταία ανά (event, book, player, stat, line, window, sel) με seen < τζάμπολ
const Q = new Map();
for (const l of fs.readFileSync(path.join(ROOT, 'data/odds/props-history.jsonl'), 'utf8').split('\n')) {
  if (!l) continue; const x = JSON.parse(l), st = x.market.replace('prop:', '');
  if (!SK.includes(st) || !(x.seen < x.commence) || !['mid', 'close'].includes(x.window)) continue;
  const k = `${x.event}|${x.book}|${x.player}|${st}|${x.line}|${x.window}|${x.sel}`, o = Q.get(k);
  if (!o || o.seen < x.seen) Q.set(k, x);
}
const pairs = new Map();   // event|book|player|stat|line → { mid: {over, under, seen}, close: {...} }
for (const x of Q.values()) { const st = x.market.replace('prop:', ''), k = `${x.event}|${x.book}|${x.player}|${st}|${x.line}`;
  const p = pairs.get(k) || { event: x.event, book: x.book, player: x.player, st, line: x.line }; const w = (p[x.window] ||= {}); w[x.sel] = x.price; w.seen = w.seen > x.seen ? w.seen : x.seen; pairs.set(k, p); }
// consensus κλεισίματος ανά (event, player, stat, line)
const cons = new Map();
for (const p of pairs.values()) { const c = p.close; if (!(c?.over > 1 && c?.under > 1)) continue; const nv = noVig(c.over, c.under); const k = `${p.event}|${p.player}|${p.st}|${p.line}`; const o = cons.get(k) || { s: 0, n: 0 }; o.s += nv.over; o.n++; cons.set(k, o); }

const rosterOf = t => cache.players.filter(p => String(p.t).split(';').includes(t));
const projCache = new Map(), leagueAt = new Map();
const rows = []; let noModel = 0, unmatched = 0;
for (const p of pairs.values()) {
  const m = p.mid, c = p.close;
  if (!(m?.over > 1 && m?.under > 1 && c?.over > 1 && c?.under > 1)) continue;
  const [, r, h, a] = p.event.split('-'), R = +r;
  let pl = null, team = null; for (const t of [h, a]) { pl = matchPlayer(p.player, rosterOf(t)); if (pl) { team = t; break; } }
  if (!pl) { unmatched++; continue; }
  let s = null, src;
  if (ARCH_ROUNDS.has(R)) {
    const L = (ARCH.get(`${p.event}|${pl.c}`) || []).filter(x => x.predicted_at < m.seen).sort((x, y) => x.predicted_at.localeCompare(y.predicted_at));
    const x = L.at(-1); if (x?.stats?.[p.st] && x.quality !== 'insufficient' && x.quality !== 'out') { s = x.stats[p.st]; src = 'archive'; }
  } else {
    const hz = HZ.get(`${R}|${pl.c}`), key = `${R}|${pl.c}`;
    if (hz) { if (!projCache.has(key)) { if (!leagueAt.has(R)) leagueAt.set(R, leagueRates(cache.players, R));
      projCache.set(key, projectPlayer(pl, { round: R, minutes: { p_play: +hz.hz_p, min_if_plays: +hz.hz_cond, min_exp: +hz.hz_exp }, league: leagueAt.get(R), prev: PREV.get(pl.c) || null })); }
      const pj = projCache.get(key); if (pj.stats) { s = pj.stats[p.st]; src = 'walkforward'; } }
  }
  if (!s) { noModel++; continue; }
  const pm = pOver(s.mean, s.sd ** 2, p.line), cs = cons.get(`${p.event}|${p.player}|${p.st}|${p.line}`);
  const g = (pl.g || []).find(x => x[0] === R && x[7] > 0);
  rows.push({ event: p.event, round: R, team, c: pl.c, mean: s.mean, sd: s.sd, y: g ? STATS[p.st](g) : null, book: p.book, gr: isGr(p.book), st: p.st, line: p.line, pm, mid: m, close: c, pcBook: noVig(c.over, c.under).over, pcCons: cs ? cs.s / cs.n : null, src });
}
  return { rows, unmatched, noModel, season, cache, isGr };
}

// επιλογές και CLV
export function bootstrapMean(xs) {
  if (xs.length < 30) return null;
  const byG = new Map(); for (const x of xs) (byG.get(x.event) || byG.set(x.event, []).get(x.event)).push(x.v);
  const G = [...byG.values()]; let seed = 99; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); const o = [];
  for (let b = 0; b < 1000; b++) { let s = 0, n = 0; for (let i = 0; i < G.length; i++) { const g = G[Math.floor(rnd() * G.length)]; for (const v of g) { s += v; n++; } } o.push(s / n); }
  o.sort((a, b) => a - b); return [+o[25].toFixed(4), +o[974].toFixed(4)];
}
export function clv(xs, thr, pOf = r => r.pm) {
  const book = [], con = [];
  for (const r of xs) {
    const pm = pOf(r), eo = pm * r.mid.over - 1, eu = (1 - pm) * r.mid.under - 1;
    const [ev, side] = eo >= eu ? [eo, 'over'] : [eu, 'under'];
    if (ev < thr) continue;
    const price = r.mid[side];
    book.push({ event: r.event, side, st: r.st, v: price * (side === 'over' ? r.pcBook : 1 - r.pcBook) - 1, moved: price !== r.close[side],
      // κίνηση της αγοράς προς εμάς: η πιθανότητα χωρίς γκανιότα της πλευράς μας στο κλείσιμο μείον στο mid (> 0 = η αγορά ήρθε προς το μοντέλο)
      mv: (side === 'over' ? r.pcBook - noVig(r.mid.over, r.mid.under).over : noVig(r.mid.over, r.mid.under).over - r.pcBook) });
    if (r.pcCons != null) con.push({ event: r.event, v: price * (side === 'over' ? r.pcCons : 1 - r.pcCons) - 1 });
  }
  const sum = L => ({ n: L.length, games: new Set(L.map(x => x.event)).size, clv: L.length ? +(L.reduce((a, x) => a + x.v, 0) / L.length).toFixed(4) : null,
    move: L.length && L[0].mv != null ? +(L.reduce((a, x) => a + x.mv, 0) / L.length).toFixed(4) : null, move_ci95: L.length && L[0].mv != null ? bootstrapMean(L.map(x => ({ event: x.event, v: x.mv }))) : null,
    positive: L.length ? +(L.filter(x => x.v > 0).length / L.length).toFixed(3) : null, ci95: bootstrapMean(L) });
  const by = k => Object.fromEntries([...new Set(book.map(x => x[k]))].map(v => [v, sum(book.filter(x => x[k] === v))]));
  return { same_book: sum(book), consensus: sum(con), price_moved: book.length ? +(book.filter(x => x.moved).length / book.length).toFixed(3) : null, by_side: by('side'), by_stat: by('st') };
}
