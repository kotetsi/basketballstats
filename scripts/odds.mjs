// Odds ingestion από ΑΔΕΙΟΔΟΤΗΜΕΝΟ πάροχο (όχι scraping bookmakers).
// Χρειάζεται ODDS_API_KEY στα GitHub Secrets. Χωρίς κλειδί δεν κάνει τίποτα.
//
//   ODDS_PROVIDER = theoddsapi (προεπιλογή)   · adapters: theoddsapi, generic (JSON σε ODDS_GENERIC_URL)
//   ODDS_MIN_INTERVAL_MIN = 90                · rate limiting ανάμεσα σε κλήσεις (εξοικονόμηση quota)
//   node scripts/odds.mjs [--force]           · --force: αγνοεί το rate limit
//
// Αρχεία:
//   data/odds/history.jsonl   κάθε αλλαγή τιμής (append-only, idempotent) → line movement, closing lines, CLV
//   data/odds/latest.json     τρέχουσες τιμές ανά αγώνα/bookmaker (για το build)
//   data/odds/status.json     τελευταία επιτυχία, quota, για alerting
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendChanges } from '../src/odds/core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'odds');
const KEY = (process.env.ODDS_API_KEY || '').trim();
const PROVIDER = process.env.ODDS_PROVIDER || 'theoddsapi';
const MIN_INT = +(process.env.ODDS_MIN_INTERVAL_MIN || 90);
const FORCE = process.argv.includes('--force');
const STALE_H = 30;

// ονόματα παρόχων → κωδικοί ομάδων (EuroLeague)
const ALIAS = {
  OLY: ['olympiacos', 'olympiakos'], PAN: ['panathinaikos'], MAD: ['real madrid'], BAR: ['barcelona', 'barca'], ULK: ['fenerbahce'], IST: ['anadolu efes', 'efes'],
  RED: ['crvena zvezda', 'red star', 'zvezda'], PAR: ['partizan'], ZAL: ['zalgiris'], TEL: ['maccabi'], HTA: ['hapoel'], DUB: ['dubai'], MIL: ['olimpia milano', 'armani', 'milano', 'milan'],
  MUN: ['bayern'], VIR: ['virtus', 'bologna'], ASV: ['asvel', 'villeurbanne', 'lyon'], BAS: ['baskonia', 'vitoria'], BES: ['besiktas'], PAM: ['valencia'], PRS: ['paris'],
};
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const codeOf = name => { const n = norm(name); for (const [c, al] of Object.entries(ALIAS)) if (al.some(a => n.includes(a))) return c; return null; };

async function readJSON(f, d) { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } }

// ---- adapters: επιστρέφουν [{eventId, home, away, commence, books:[{key,title,upd, markets:{ml:[h,a], spread:{line,h,a}, total:{line,over,under}}}]}]
const ADAPTERS = {
  async theoddsapi() {
    const url = `https://api.the-odds-api.com/v4/sports/basketball_euroleague/odds?apiKey=${encodeURIComponent(KEY)}&regions=eu&markets=h2h,spreads,totals&oddsFormat=decimal&dateFormat=iso`;
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`The Odds API ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const quota = { remaining: r.headers.get('x-requests-remaining'), used: r.headers.get('x-requests-used') };
    const data = await r.json();
    return { quota, events: data.map(ev => ({
      eventId: ev.id, home: ev.home_team, away: ev.away_team, commence: ev.commence_time,
      books: (ev.bookmakers || []).map(b => {
        const m = {};
        for (const mk of b.markets || []) {
          const o = n => mk.outcomes.find(x => x.name === n);
          if (mk.key === 'h2h') m.ml = [o(ev.home_team)?.price, o(ev.away_team)?.price];
          if (mk.key === 'spreads') { const h = o(ev.home_team), a = o(ev.away_team); if (h && a) m.spread = { line: h.point, h: h.price, a: a.price }; }
          if (mk.key === 'totals') { const ov = mk.outcomes.find(x => /over/i.test(x.name)), un = mk.outcomes.find(x => /under/i.test(x.name)); if (ov && un) m.total = { line: ov.point, over: ov.price, under: un.price }; }
        }
        return { key: b.key, title: b.title, upd: b.last_update, markets: m };
      }),
    })) };
  },
  // γενικός adapter: ένα JSON στο ίδιο σχήμα με το παραπάνω (π.χ. από άλλον αδειοδοτημένο πάροχο μέσω proxy)
  async generic() {
    const r = await fetch(process.env.ODDS_GENERIC_URL, { headers: { authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`generic ${r.status}`);
    return { quota: {}, events: await r.json() };
  },
};

async function main() {
  await fs.mkdir(DIR, { recursive: true });
  const status = await readJSON(path.join(DIR, 'status.json'), {});
  if (!KEY) { console.log('Odds: δεν υπάρχει ODDS_API_KEY — παραλείπεται (καμία απόδοση χωρίς αδειοδοτημένο πάροχο)'); return 0; }
  const fx = await readJSON(path.join(ROOT, 'data', 'matchups', 'fixtures.json'), { fixtures: [] });
  const now = Date.now();
  const soon = fx.fixtures.filter(f => f.comp === 'E' && new Date(f.t) - now < 4 * 864e5 && new Date(f.t) - now > -3 * 3600e3);
  if (!FORCE && status.lastCall && now - new Date(status.lastCall) < MIN_INT * 60000) { console.log('Odds: rate limit, επόμενη κλήση αργότερα'); return stale(status); }
  if (!FORCE && !soon.length) { console.log('Odds: κανένας αγώνας τις επόμενες 4 μέρες'); return 0; }
  let res;
  try { res = await ADAPTERS[PROVIDER](); } catch (e) { console.log('Odds: σφάλμα παρόχου —', e.message); status.lastError = new Date().toISOString(); status.error = e.message; await fs.writeFile(path.join(DIR, 'status.json'), JSON.stringify(status, null, 1)); return stale(status, true); }
  const ts = new Date().toISOString();
  // αντιστοίχιση με τους δικούς μας αγώνες
  const snaps = [], latest = await readJSON(path.join(DIR, 'latest.json'), { games: {} });
  let matched = 0;
  for (const ev of res.events) {
    const h = codeOf(ev.home), a = codeOf(ev.away);
    const f = fx.fixtures.find(x => x.comp === 'E' && x.h === h && x.a === a && Math.abs(new Date(x.t) - new Date(ev.commence)) < 3 * 864e5);
    if (!f) continue;
    matched++;
    const gid = `E-${f.r}-${h}-${a}`;
    const G = (latest.games[gid] = { t: f.t, commence: ev.commence, provider: PROVIDER, books: {}, updated: ts });
    for (const b of ev.books) {
      G.books[b.key] = { title: b.title, upd: b.upd, ...b.markets };
      const add = (market, sel, price, line) => price > 1 && snaps.push({ provider: PROVIDER, event: gid, book: b.key, market, sel, line: line ?? null, price, t: b.upd || ts, seen: ts });
      if (b.markets.ml) { add('ml', 'home', b.markets.ml[0]); add('ml', 'away', b.markets.ml[1]); }
      if (b.markets.spread) { add('spread', 'home', b.markets.spread.h, b.markets.spread.line); add('spread', 'away', b.markets.spread.a, -b.markets.spread.line); }
      if (b.markets.total) { add('total', 'over', b.markets.total.over, b.markets.total.line); add('total', 'under', b.markets.total.under, b.markets.total.line); }
    }
  }
  // ιστορικό: μόνο αλλαγές (idempotent)
  const hf = path.join(DIR, 'history.jsonl');
  const hist = (await fs.readFile(hf, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(l => JSON.parse(l));
  const added = appendChanges(hist, snaps);
  if (added.length) await fs.appendFile(hf, added.map(x => JSON.stringify(x)).join('\n') + '\n');
  latest.provider = PROVIDER; latest.updated = ts;
  await fs.writeFile(path.join(DIR, 'latest.json'), JSON.stringify(latest));
  Object.assign(status, { provider: PROVIDER, lastCall: ts, lastSuccess: ts, events: res.events.length, matched, added: added.length, quota: res.quota, error: null });
  if (added.length) status.lastChange = ts;
  await fs.writeFile(path.join(DIR, 'status.json'), JSON.stringify(status, null, 1));
  console.log(`Odds (${PROVIDER}): ${res.events.length} αγώνες από τον πάροχο, ${matched} αντιστοιχίστηκαν, ${added.length} νέες τιμές · quota: ${res.quota.remaining ?? '?'}`);
  return 0;
}

// alerting: exit code 3 όταν το feed είναι «παγωμένο» (το workflow ανοίγει issue)
function stale(status, failed = false) {
  const last = status.lastSuccess ? new Date(status.lastSuccess) : null;
  if (failed && (!last || Date.now() - last > STALE_H * 3600e3)) { console.log(`Odds: ALERT — καμία επιτυχής ενημέρωση εδώ και >${STALE_H} ώρες`); return 3; }
  return 0;
}

process.exitCode = await main();
