// Intelligence Engine, Φάση 4: αμετάβλητο αρχείο pregame προβλέψεων παικτών + settlement + αξιολόγηση.
//
// Αρχείο: data/predictions/<season>/r<round>.jsonl, μόνο προσθήκες, αλυσίδα SHA-256 (όπως το data/ledger).
//   * Ένα snapshot γράφεται ΜΟΝΟ πριν από το τζάμπολ του αγώνα του παίκτη και ΜΟΝΟ αν η πρόβλεψη άλλαξε από το τελευταίο snapshot.
//   * Τίποτα δεν ξαναγράφεται και τίποτα δεν διαγράφεται. Η «τελευταία έγκυρη pregame» είναι το τελευταίο snapshot με predicted_at < tip.
// Settlement: ΠΑΡΑΓΟΜΕΝΟ (ξαναϋπολογίζεται κάθε φορά από το αρχείο + τα box score). Δεν αγγίζει το αρχείο.
//   Ένα settlement δεν μπορεί να «φτιάξει» pregame πρόβλεψη: χρησιμοποιεί μόνο γραμμές του αρχείου με predicted_at < tip.
import { createHash } from 'node:crypto';
import { STATS } from '../odds/props.mjs';
import { decodeGameDate, gameId, legacyGid } from './data.mjs';

export const ARCHIVE_VERSION = 1;
export const GENESIS = '0'.repeat(64);
const STAT_KEYS = ['pts', 'reb', 'ast', 'fg3'];

/** σταθερή σειριοποίηση (ταξινομημένα κλειδιά) για hash και σύγκριση περιεχομένου */
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export const hashOf = (prev, rec) => createHash('sha256').update(prev + stable(rec)).digest('hex');
/** περιεχόμενο της πρόβλεψης (χωρίς χρόνο/αλυσίδα): αν δεν αλλάξει, δεν γράφεται νέο snapshot */
const content = r => stable({ models: r.models, quality: r.quality, flags: r.flags, minutes: r.minutes, stats: r.stats, pir: r.pir, status: r.status });

export function parseArchive(txt) { return String(txt || '').split('\n').filter(Boolean).map(l => JSON.parse(l)); }

export function verifyChain(lines) {
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    const { hash, ...rec } = lines[i];
    if (rec.prev !== prev || hashOf(prev, rec) !== hash) return { ok: false, bad: i + 1, n: lines.length };
    prev = hash;
  }
  return { ok: true, n: lines.length, head: lines.length ? prev : null };
}

/** τζάμπολ κάθε αγώνα της αγωνιστικής: Map(team → { game_id, legacy_gid, tip, home, away }) */
export function tipsOf(cache, season, round, comp = 'E') {
  const m = new Map();
  for (const g of cache.league.games) {
    if (g[0] !== round) continue;
    const x = { game_id: gameId(season, round, g[2], g[3]), legacy_gid: legacyGid(comp, round, g[2], g[3]), tip: decodeGameDate(g[1], season), home: g[2], away: g[3] };
    m.set(g[2], x); m.set(g[3], x);
  }
  return m;
}

/**
 * Νέα snapshots από ένα data/projections/latest.json.
 * @returns { add: [εγγραφές], skipped: { late, unchanged, no_game, insufficient } }
 */
export function snapshot(lines, projections, cache, now = new Date()) {
  const { season, round } = projections, T = tipsOf(cache, season, round), nowIso = now.toISOString();
  const last = new Map(); for (const l of lines) last.set(l.prediction_id, l);
  let prev = lines.length ? lines[lines.length - 1].hash : GENESIS;
  const add = [], skipped = { late: 0, unchanged: 0, no_game: 0, insufficient: 0 };
  for (const p of projections.players) {
    if (!p.stats || !p.minutes) { skipped.insufficient++; continue; }
    const g = T.get(p.team_id);
    if (!g || !g.tip || (g.home !== p.team_id && g.away !== p.team_id)) { skipped.no_game++; continue; }
    if (!(nowIso < g.tip)) { skipped.late++; continue; }                 // μετά το τζάμπολ: ΔΕΝ είναι pregame
    const pid = `${g.game_id}|${p.player_id}`;
    const body = {
      v: ARCHIVE_VERSION, prediction_id: pid, game_id: g.game_id, legacy_gid: g.legacy_gid, season, round, player_id: p.player_id,
      team_id: p.team_id, opp_id: g.home === p.team_id ? g.away : g.home, tip: g.tip, predicted_at: nowIso, source_generated_at: projections.generated_at,
      models: { engine: projections.version, ...projections.models }, quality: p.quality, flags: p.flags, status: p.status,
      minutes: p.minutes, pir: p.pir,
      stats: Object.fromEntries(STAT_KEYS.map(s => [s, { mean: p.stats[s].mean, median: p.stats[s].median, sd: p.stats[s].sd, over: p.stats[s].over }])),
    };
    const old = last.get(pid);
    if (old && content(old) === content(body)) { skipped.unchanged++; continue; }
    const rec = { ...body, snapshot: old ? old.snapshot + 1 : 1, prev };
    const hash = hashOf(prev, rec);
    const full = { ...rec, hash };
    add.push(full); last.set(pid, full); prev = hash;
  }
  return { add, skipped };
}

/** η τελευταία έγκυρη pregame πρόβλεψη κάθε prediction_id */
export function latestPregame(lines) {
  const m = new Map();
  for (const l of lines) if (l.predicted_at < l.tip) { const o = m.get(l.prediction_id); if (!o || o.snapshot < l.snapshot) m.set(l.prediction_id, l); }
  return m;
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
/**
 * Settlement: σύνδεση της τελευταίας pregame πρόβλεψης με το αποτέλεσμα. Μόνο για αγώνες που έχουν τελειώσει.
 * Οι βάσεις σύγκρισης (μέσος σεζόν / 5 / 10) υπολογίζονται από αγώνες ΠΡΙΝ από την αγωνιστική (as-of).
 */
export function settle(lines, cache) {
  const P = new Map(cache.players.map(p => [p.c, p]));
  const final = new Set(cache.league.games.filter(g => g[6]).map(g => `${g[0]}|${g[2]}|${g[3]}`));
  const out = [];
  for (const l of latestPregame(lines).values()) {
    const [, , home, away] = l.legacy_gid.split('-');
    if (!final.has(`${l.round}|${home}|${away}`)) continue;
    const p = P.get(l.player_id);
    const opp = l.opp_id, isHome = l.team_id === home ? 1 : 0;
    const row = p?.g?.find(r => r[0] === l.round && r[2] === opp && r[3] === isHome) || null;
    const played = !!(row && row[7] > 0);
    const hist = (p?.g || []).filter(r => r[0] < l.round && r[7] > 0).sort((a, b) => a[0] - b[0]);
    const rec = { prediction_id: l.prediction_id, snapshot: l.snapshot, hash: l.hash, season: l.season, round: l.round, player_id: l.player_id, team_id: l.team_id,
      quality: l.quality, models: { minutes: l.models?.minutes?.version, stats: l.models?.stats, engine: l.models?.engine }, predicted_at: l.predicted_at, tip: l.tip,
      played, actual: { minutes: row ? +(row[7] / 60).toFixed(2) : 0, pir: row ? row[25] : null },
      pred: { p_play: l.minutes.p_play, min_if_plays: l.minutes.if_plays, min_exp: l.minutes.expected, pir_exp: l.pir?.mean_exp ?? null, pir_if: l.pir?.mean ?? null },
      errors: { min_exp: +(l.minutes.expected - (row ? row[7] / 60 : 0)).toFixed(2) }, stats: {} };
    if (played) {
      rec.errors.min_if_plays = +(l.minutes.if_plays - row[7] / 60).toFixed(2);
      if (l.pir) rec.errors.pir = +(l.pir.mean - row[25]).toFixed(2);
      for (const s of STAT_KEYS) {
        const y = STATS[s](row), xs = hist.map(STATS[s]);
        rec.stats[s] = { actual: y, mean: l.stats[s].mean, median: l.stats[s].median, err: +(l.stats[s].mean - y).toFixed(2),
          over: Object.fromEntries(Object.entries(l.stats[s].over).map(([L, q]) => [L, [q, y > +L ? 1 : 0]])),
          base: xs.length ? { season: +mean(xs).toFixed(2), last5: +mean(xs.slice(-5)).toFixed(2), last10: +mean(xs.slice(-10)).toFixed(2) } : null };
      }
    }
    out.push(rec);
  }
  return out.sort((a, b) => a.round - b.round || a.prediction_id.localeCompare(b.prediction_id));
}

function agg(pairs) {
  if (!pairs.length) return { n: 0 };
  let ae = 0, se = 0, b = 0; for (const [p, y] of pairs) { ae += Math.abs(p - y); se += (p - y) ** 2; b += p - y; }
  return { n: pairs.length, mae: +(ae / pairs.length).toFixed(3), rmse: +Math.sqrt(se / pairs.length).toFixed(3), bias: +(b / pairs.length).toFixed(3) };
}
const minBand = m => (m < 10 ? '<10' : m < 20 ? '10-20' : m < 30 ? '20-30' : '30+');

/** αναφορά αξιολόγησης από τα settled (σε πραγματικό χρόνο, μόνο pregame προβλέψεις) */
export function evaluate(settled) {
  const R = { n_predictions: settled.length, n_played: settled.filter(x => x.played).length, rounds: [...new Set(settled.map(x => x.round))].sort((a, b) => a - b), minutes: {}, pir: {}, stats: {}, by_quality: {}, by_model: {}, by_minutes: {}, calibration: {} };
  R.minutes.expected = agg(settled.map(x => [x.pred.min_exp, x.actual.minutes]));
  R.minutes.if_plays = agg(settled.filter(x => x.played).map(x => [x.pred.min_if_plays, x.actual.minutes]));
  // P(παίζει): Brier
  const pp = settled.map(x => [x.pred.p_play, x.played ? 1 : 0]);
  R.minutes.p_play_brier = pp.length ? +(pp.reduce((a, [q, y]) => a + (q - y) ** 2, 0) / pp.length).toFixed(4) : null;
  R.pir.expected = agg(settled.filter(x => x.pred.pir_exp != null).map(x => [x.pred.pir_exp, x.actual.pir ?? 0]));
  R.pir.if_plays = agg(settled.filter(x => x.played && x.pred.pir_if != null).map(x => [x.pred.pir_if, x.actual.pir]));
  const pl = settled.filter(x => x.played && x.stats.pts);
  for (const s of STAT_KEYS) {
    const rows = pl.filter(x => x.stats[s].base);
    const over = rows.flatMap(x => Object.values(x.stats[s].over));
    R.stats[s] = {
      engine: agg(rows.map(x => [x.stats[s].mean, x.stats[s].actual])), engine_median: agg(rows.map(x => [x.stats[s].median, x.stats[s].actual])),
      season_mean: agg(rows.map(x => [x.stats[s].base.season, x.stats[s].actual])), last5: agg(rows.map(x => [x.stats[s].base.last5, x.stats[s].actual])),
      last10: agg(rows.map(x => [x.stats[s].base.last10, x.stats[s].actual])),
      brier: over.length ? +(over.reduce((a, [q, y]) => a + (q - y) ** 2, 0) / over.length).toFixed(4) : null, n_thresholds: over.length,
    };
    const bins = Array.from({ length: 10 }, () => [0, 0, 0]);
    for (const [q, y] of over) { const b = Math.min(9, Math.floor(q * 10)); bins[b][0]++; bins[b][1] += q; bins[b][2] += y; }
    R.calibration[s] = bins.map(([n, sq, sy]) => (n ? { n, p: +(sq / n).toFixed(3), hit: +(sy / n).toFixed(3) } : { n: 0 }));
  }
  const group = (key, fn) => { const g = {}; for (const x of pl) (g[fn(x)] ||= []).push(x); for (const [k, xs] of Object.entries(g)) R[key][k] = Object.fromEntries(STAT_KEYS.map(s => [s, agg(xs.map(x => [x.stats[s].mean, x.stats[s].actual]))])); };
  group('by_quality', x => x.quality);
  group('by_model', x => `${x.models.minutes}+${x.models.stats}`);
  group('by_minutes', x => minBand(x.pred.min_if_plays));
  R.sample_note = R.n_played < 500 ? 'μικρό δείγμα: τα νούμερα δεν είναι ακόμα αξιόπιστα' : null;
  return R;
}
