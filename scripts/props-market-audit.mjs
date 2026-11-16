// Audit πραγματικών player-prop quotes και κάλυψης ελληνικών feeds.
// Δεν υπολογίζει ROI και δεν βαφτίζει μια μεμονωμένη τιμή «market consensus».
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'odds');
const round = (x, n = 2) => Number.isFinite(x) ? +x.toFixed(n) : null;
const ageHours = (stamp, now) => stamp && Number.isFinite(new Date(stamp).getTime()) ? (now - new Date(stamp).getTime()) / 36e5 : null;
const keyOf = p => [p.playerId != null ? `id:${p.playerId}` : (p.name || p.player || ''), p.stat || p.market || '', p.line ?? ''].join('|');

export function auditPropsMarket({ latest = {}, registry = {}, history = [], status = {}, now = Date.now() } = {}) {
  const brands = registry.brands || {};
  const confirmed = new Map();
  for (const [brandKey, brand] of Object.entries(brands)) {
    if (brand.greek_prices !== 'confirmed') continue;
    for (const feed of brand.feeds || []) confirmed.set(feed, brandKey);
  }

  const games = Object.entries(latest.games || {}).filter(([, g]) => {
    const start = g.commence || g.t;
    return start && new Date(start).getTime() > now;
  });
  const bookAgg = new Map();
  const gameRows = [];
  const sourceQuoteTimes = [];
  let greekGameCount = 0, gamesWithProps = 0, totalProps = 0, completeProps = 0, oneSidedProps = 0;

  for (const [event, game] of games) {
    const books = [];
    for (const [feed, quote] of Object.entries(game.books || {})) {
      const brandKey = confirmed.get(feed);
      if (!brandKey) continue;
      greekGameCount++;
      const props = Array.isArray(quote.props) ? quote.props : [];
      const distinct = new Map();
      for (const p of props) {
        const k = keyOf(p), old = distinct.get(k) || { over: false, under: false };
        old.over ||= p.over > 1; old.under ||= p.under > 1;
        distinct.set(k, old);
      }
      const complete = [...distinct.values()].filter(x => x.over && x.under).length;
      const oneSided = [...distinct.values()].filter(x => x.over !== x.under).length;
      const brand = brands[brandKey];
      const updated = quote.upd || props.map(p => p.upd).filter(Boolean).sort().at(-1) || null;
      if (updated) sourceQuoteTimes.push(updated);
      const row = { feed, brand: brand.brand || brandKey, games: 1, props: distinct.size, complete, oneSided, updated,
        ageHours: round(ageHours(updated, now)) };
      books.push(row);
      const agg = bookAgg.get(feed) || { feed, brand: row.brand, games: 0, props: 0, complete: 0, oneSided: 0, newest: null, oldest: null };
      agg.games++; agg.props += row.props; agg.complete += complete; agg.oneSided += oneSided;
      if (updated && (!agg.newest || updated > agg.newest)) agg.newest = updated;
      if (updated && (!agg.oldest || updated < agg.oldest)) agg.oldest = updated;
      bookAgg.set(feed, agg);
      totalProps += distinct.size; completeProps += complete; oneSidedProps += oneSided;
    }
    const withProps = books.filter(b => b.props > 0);
    if (withProps.length) gamesWithProps++;
    gameRows.push({ event, commence: game.commence || game.t, greekBooks: books.length,
      booksWithProps: withProps.length, props: books.reduce((n, b) => n + b.props, 0), books });
  }

  const propBookmakers = [...bookAgg.values()].filter(x => x.props > 0);
  const snapshots = (history || []).filter(x => confirmed.has(x.book));
  const windows = { open: 0, mid: 0, close: 0, unknown: 0 };
  const seenByEventBook = new Map();
  const uniqueQuotes = new Set();
  for (const s of snapshots) {
    const w = ['open', 'mid', 'close'].includes(s.window) ? s.window : 'unknown';
    windows[w]++;
    uniqueQuotes.add([s.provider, s.event, s.book, s.market, s.sel, s.player || '', s.line ?? '', s.seen || ''].join('|'));
    const k = [s.event, s.book].join('|');
    const a = seenByEventBook.get(k) || new Set();
    if (s.seen) a.add(s.seen);
    seenByEventBook.set(k, a);
  }
  const capturesPerEventBook = [...seenByEventBook.values()].map(x => x.size);
  const snapshotTimes = snapshots.map(x => x.seen).filter(Boolean).sort();
  const collectorUpdatedAge = ageHours(latest.updated, now);
  const latestQuoteUpdated = sourceQuoteTimes.sort().at(-1) || null;
  const latestQuoteAge = ageHours(latestQuoteUpdated, now);
  const warnings = [];
  if (!snapshots.length) warnings.push('Δεν υπάρχει ακόμη αρχείο ιστορικών Player Props snapshots στο branch/data.');
  if (games.length && gamesWithProps === 0) warnings.push('Δεν βρέθηκαν ελληνικά feeds με Player Props στους προσεχείς αγώνες.');
  if (gameRows.some(g => g.booksWithProps > 0 && g.books.filter(b => b.props > 0).length < 2)) warnings.push('Υπάρχουν αγώνες με props από μία μόνο ελληνική εταιρεία· δεν υπάρχει ανεξάρτητο market consensus.');
  if (totalProps > 0 && propBookmakers.length < 2) warnings.push('Τα Player Props προέρχονται από μία μόνο επιβεβαιωμένη ελληνική εταιρεία· δεν μπορεί να υπολογιστεί πολυεταιρική συναίνεση αγοράς.');
  if (latestQuoteAge == null || latestQuoteAge > 12) warnings.push('Η πιο πρόσφατη πραγματική τιμή bookmaker είναι παλιά ή δεν έχει έγκυρη χρονική σήμανση (>12 ώρες).');
  if (status.lastSuccess && (status.events === 0 || status.matched === 0)) warnings.push('Η τελευταία εκτέλεση ολοκληρώθηκε χωρίς να φέρει/αντιστοιχίσει νέους αγώνες· το timestamp του collector δεν σημαίνει νέα δεδομένα αγοράς.');

  return {
    generatedAt: new Date(now).toISOString(), provider: latest.provider || null,
    collectorUpdated: latest.updated || null, collectorUpdatedAgeHours: round(collectorUpdatedAge),
    lastIngestAt: status.lastSuccess || status.lastCall || null, lastIngestEvents: status.events ?? null, lastIngestMatched: status.matched ?? null,
    latestQuoteUpdated, latestQuoteAgeHours: round(latestQuoteAge),
    upcomingGames: games.length, gamesWithGreekBooks: gameRows.filter(g => g.greekBooks > 0).length,
    greekBookGameQuotes: greekGameCount, gamesWithPlayerProps: gamesWithProps, independentGreekPropBookmakers: propBookmakers.length,
    totalDistinctPlayerProps: totalProps, completeOverUnderPairs: completeProps, oneSidedProps,
    bookmakers: [...bookAgg.values()].map(x => ({ ...x, newestAgeHours: round(ageHours(x.newest, now)) })).sort((a, b) => b.props - a.props),
    events: gameRows,
    history: { available: snapshots.length > 0, snapshots: snapshots.length, uniqueSnapshots: uniqueQuotes.size,
      windows, eventBookPairs: seenByEventBook.size,
      capturesPerEventBook: { min: capturesPerEventBook.length ? Math.min(...capturesPerEventBook) : 0,
        median: capturesPerEventBook.length ? capturesPerEventBook.sort((a,b)=>a-b)[Math.floor(capturesPerEventBook.length/2)] : 0,
        max: capturesPerEventBook.length ? Math.max(...capturesPerEventBook) : 0 },
      firstSeen: snapshotTimes[0] || null, lastSeen: snapshotTimes.at(-1) || null },
    warnings,
  };
}

async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }
async function readJsonl(file) {
  const raw = await fs.readFile(file, 'utf8').catch(() => '');
  return raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [latest, registry, history, status] = await Promise.all([
    readJson(path.join(DIR, 'latest.json'), {}),
    readJson(path.join(DIR, 'bookmakers-gr.json'), {}),
    readJsonl(path.join(DIR, 'props-history.jsonl')),
    readJson(path.join(DIR, 'status.json'), {}),
  ]);
  console.log(JSON.stringify(auditPropsMarket({ latest, registry, history, status }), null, 2));
}
