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
import { extractProps } from '../src/odds/props.mjs';
import { confirmedFeeds } from '../src/odds/value.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'odds');
const KEY = (process.env.ODDS_API_KEY || '').trim();
const PROVIDER = process.env.ODDS_PROVIDER || 'oddspapi';
const MIN_INT = +(process.env.ODDS_MIN_INTERVAL_MIN || 180);
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
    const url = `https://api.the-odds-api.com/v4/sports/basketball_euroleague/odds?apiKey=${encodeURIComponent(KEY)}&regions=${process.env.ODDS_REGIONS || 'eu,uk'}&markets=h2h,spreads,totals&oddsFormat=decimal&dateFormat=iso`;
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
  // OddsPapi (v4): basketball sportId 11, EuroLeague tournamentId 138. Το δωρεάν πακέτο έχει 250 κλήσεις/μήνα,
  // οπότε: meta (ομάδες, αγορές, bookmakers) μία φορά την εβδομάδα, fixtures μία φορά τη μέρα,
  // και αποδόσεις ανά αγώνα σε 3 «παράθυρα»: άνοιγμα (≤96 ώρες πριν), ~1 μέρα πριν, και κλείσιμο (≤4 ώρες πριν).
  async oddspapi(ctx) {
    const BASE = 'https://api.oddspapi.io/v4', SPORT = 11, TOUR = +(process.env.ODDSPAPI_TOURNAMENT || 138);
    const month = new Date().toISOString().slice(0, 7), st = (ctx.status.oddspapi ||= {});
    if (st.month !== month) { st.month = month; st.calls = 0; }
    const CAP = +(process.env.ODDS_MONTHLY_CAP || 240);
    const lastCall = {};
    const call = async (p, o) => {
      if (st.calls >= CAP) throw new Error(`μηνιαίο όριο ${CAP} κλήσεων`);
      // ρυθμός: το OddsPapi δέχεται ~1 κλήση το δευτερόλεπτο ανά endpoint· σε 429 περιμένουμε όσο λέει και ξαναδοκιμάζουμε μία φορά
      for (let attempt = 0; ; attempt++) {
        const wait = 1100 - (Date.now() - (lastCall[p] || 0)); if (wait > 0) await new Promise(res => setTimeout(res, wait));
        st.calls++; lastCall[p] = Date.now();
        const r = await fetch(`${BASE}/${p}?${new URLSearchParams({ apiKey: KEY, ...o })}`, { signal: AbortSignal.timeout(30000) });
        if (r.status === 429 && attempt < 2) { const t = await r.text(); const sec = +(t.match(/wait ([\d.]+) seconds/)?.[1] || 1); await new Promise(res => setTimeout(res, Math.ceil(sec * 1000) + 1200)); continue; }
        if (!r.ok) throw new Error(`OddsPapi /${p} ${r.status}: ${(await r.text()).slice(0, 200)}`);
        return r.json();
      }
    };
    const arr = x => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.entries(x).map(([k, v]) => (typeof v === 'object' ? { _k: k, ...v } : { _k: k, name: v })) : []);
    const pick = (o, ks) => { for (const k of ks) if (o[k] != null) return o[k]; return null; };
    const metaF = path.join(DIR, 'oddspapi_meta.json');
    let meta = await readJSON(metaF, {});
    if (!meta.at || Date.now() - new Date(meta.at) > 7 * 864e5) {
      const parts = await call('participants', { sportId: SPORT, tournamentId: TOUR });
      const markets = await call('markets', { sportId: SPORT });
      const books = await call('bookmakers', {}).catch(() => []);
      meta = {
        at: new Date().toISOString(),
        parts: Object.fromEntries(arr(parts).map(p => [String(pick(p, ['participantId', 'id', '_k'])), pick(p, ['participantName', 'name', 'shortName'])])),
        markets: Object.fromEntries(arr(markets).map(m => [String(pick(m, ['marketId', 'id', '_k'])), { name: pick(m, ['marketName', 'name']) || '', line: pick(m, ['handicap', 'line', 'marketLine', 'points']), outcomes: arr(m.outcomes).map(o => ({ id: String(pick(o, ['outcomeId', 'id', '_k'])), name: pick(o, ['outcomeName', 'name']) })) }])),
        books: Object.fromEntries(arr(books).map(b => [String(pick(b, ['slug', 'bookmakerSlug', 'bookmaker', '_k'])), pick(b, ['bookmakerName', 'name', 'title']) || pick(b, ['slug'])])),
      };
      await fs.writeFile(metaF, JSON.stringify(meta));
    }
    // fixtures (μία φορά τη μέρα)
    const today = new Date().toISOString().slice(0, 10);
    if (st.fixturesDay !== today || !st.fixtures) {
      const to = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
      const fx = await call('fixtures', { sportId: SPORT, tournamentId: TOUR, from: today, to });
      st.fixtures = arr(fx).map(f => ({ id: String(pick(f, ['fixtureId', 'id'])), p1: String(f.participant1Id), p2: String(f.participant2Id), start: f.startTime || f.trueStartTime }));
      st.fixturesDay = today;
    }
    st.done ||= {};
    const now = Date.now(), events = [];
    for (const f of st.fixtures) {
      const hrs = (new Date(f.start) - now) / 3600e3;
      if (hrs < -1 || hrs > 96) continue;
      const WINS = (process.env.ODDSPAPI_WINDOWS || 'open,close').split(',');
      // player props συνήθως ανεβαίνουν ~1 μέρα πριν: αν η πρώτη λήψη δεν είχε props, παίρνουμε και το «mid» παράθυρο
      if ((st.props ||= {})[f.id] === 0 && !WINS.includes('mid')) WINS.push('mid');
      const win = hrs <= 4 ? 'close' : hrs <= 30 ? 'mid' : 'open';
      if (!WINS.includes(win)) continue;
      const done = (st.done[f.id] ||= []);
      if (done.includes(win) && !FORCE) continue;
      const res = await call('odds', { fixtureId: f.id, oddsFormat: 'decimal' }).catch(e => { console.log('Odds:', e.message); return null; });
      if (!res) continue;
      done.push(win);
      const price = o => { const p = o && (o.players?.['0'] || Object.values(o.players || {})[0]); return p && p.active !== false ? p.price : null; };
      const changed = o => { const p = o && (o.players?.['0'] || Object.values(o.players || {})[0]); return p?.changedAt || null; };
      const bo = res.bookmakerOdds || {};
      // κύρια γραμμή handicap/συνόλου: η αγορά (marketId) που έχουν οι περισσότεροι bookmakers
      const count = re => { const c = {}; for (const b of Object.values(bo)) for (const mid of Object.keys(b.markets || {})) if (re.test(meta.markets[mid]?.name || '')) c[mid] = (c[mid] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };
      const hMid = count(/handicap/i), tMid = count(/over\s*\/\s*under|total/i);
      const books = [];
      for (const [slug, b] of Object.entries(bo)) {
        if (b.bookmakerIsActive === false) continue;
        const M = b.markets || {}, m = {}; let upd = null;
        const two = mid => { const oc = M[mid]?.outcomes || {}; const ids = Object.keys(oc).sort((x, y) => +x - +y); const ps = ids.map(i => price(oc[i])); upd = ids.map(i => changed(oc[i])).filter(Boolean).sort().pop() || upd; return ps.length >= 2 && ps[0] > 1 && ps[1] > 1 ? ps.slice(0, 2) : null; };
        const ml = two('111'); if (ml) m.ml = ml;
        if (hMid) { const p = two(hMid); if (p) m.spread = { line: meta.markets[hMid]?.line != null ? +meta.markets[hMid].line : null, h: p[0], a: p[1] }; }
        if (tMid) { const p = two(tMid); if (p) m.total = { line: meta.markets[tMid]?.line != null ? +meta.markets[tMid].line : null, over: p[0], under: p[1] }; }
        const pr = extractProps(M, meta); if (pr.length) m.props = pr;
        if (Object.keys(m).length) books.push({ key: slug, title: meta.books[slug] || slug, upd, markets: m });
      }
      st.props[f.id] = books.reduce((n, b) => n + (b.markets.props?.length || 0), 0);
      events.push({ eventId: f.id, home: meta.parts[f.p1] || '', away: meta.parts[f.p2] || '', commence: f.start, books });
    }
    // καθαρισμός παλιών αγώνων από τη μνήμη κατάστασης
    for (const id of Object.keys(st.done)) if (!st.fixtures.some(f => f.id === id)) { delete st.done[id]; delete st.props?.[id]; }
    return { quota: { used: st.calls, cap: CAP, month }, events };
  },
  // γενικός adapter: ένα JSON στο ίδιο σχήμα με το παραπάνω (π.χ. από άλλον αδειοδοτημένο πάροχο μέσω proxy)
  async generic() {
    const r = await fetch(process.env.ODDS_GENERIC_URL, { headers: { authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`generic ${r.status}`);
    return { quota: {}, events: await r.json() };
  },
};

// ΜΟΝΟ αδειοδοτημένοι bookmakers: επιστρέφει τις χώρες (gr/uk/es/rs) όπου ο bookmaker έχει άδεια (data/odds/licensed.json)
let LIC = null;
const JUR = ['gr', 'uk', 'es', 'rs'];
const clean = s => norm(s).replace(/[^a-z0-9 _]/g, '').trim();
// εκδόσεις χωρών (π.χ. «maxbet.rs», «Admiral IT», «betfair_es»): μετρούν μόνο για τη χώρα τους
const SUFFIX = { gr: 'gr', rs: 'rs', es: 'es', uk: 'uk', gb: 'uk', it: 'xx', dk: 'xx', ro: 'xx', me: 'xx', ba: 'xx', fr: 'xx', de: 'xx', se: 'xx', nl: 'xx', pt: 'xx', at: 'xx', be: 'xx', ch: 'xx', bg: 'xx', hr: 'xx', si: 'xx', mk: 'xx', cy: 'xx', pl: 'xx', cz: 'xx', sk: 'xx', hu: 'xx', ie: 'xx', us: 'xx', ca: 'xx', br: 'xx', co: 'xx', mx: 'xx', pe: 'xx', ar: 'xx', au: 'xx', fi: 'xx', no: 'xx', ee: 'xx', lv: 'xx', lt: 'xx', ua: 'xx', ru: 'xx', tr: 'xx', ng: 'xx', ke: 'xx', za: 'xx', in: 'xx',
  // πολιτείες ΗΠΑ (π.χ. «bet365-nj»): δεν είναι ευρωπαϊκές εκδόσεις
  nj: 'xx', pa: 'xx', ny: 'xx', az: 'xx', mi: 'xx', va: 'xx', il: 'xx', oh: 'xx', tn: 'xx', ia: 'xx', ks: 'xx', ky: 'xx', la: 'xx', md: 'xx', ma: 'xx', nc: 'xx', wy: 'xx', ct: 'xx', dc: 'xx', nv: 'xx', wv: 'xx', vt: 'xx', nh: 'xx' };
const countryOf = (key, title) => { const m = /(?:^|[\s._\-(])([a-z]{2})\)?$/.exec(norm(String(key)).trim()) || /(?:^|[\s._\-(])([a-z]{2})\)?$/.exec(norm(String(title)).trim()); return m && SUFFIX[m[1]] ? SUFFIX[m[1]] : null; };
// Ελλάδα: μόνο τα feeds με επιβεβαιωμένες ελληνικές τιμές του μητρώου (data/odds/bookmakers-gr.json), με ακριβές όνομα
let GRREG = null;
export const jurisdictions = (key, title, lic = LIC, gr = GRREG) => {
  const n = clean(key + ' ' + title), c = countryOf(key, title);
  return JUR.filter(j => {
    if (j === 'gr' && gr) return confirmedFeeds(gr).has(key);
    return (!c || c === j) && Object.values(lic?.[j]?.brands || {}).some(al => al.some(a => { const x = clean(a); return x.length >= 3 && n.includes(x); }));
  });
};
async function main() {
  LIC = await readJSON(path.join(DIR, 'licensed.json'), null);
  GRREG = await readJSON(path.join(DIR, 'bookmakers-gr.json'), null);
  if (!LIC) { console.log('Odds: λείπει το data/odds/licensed.json — δεν αποθηκεύεται καμία απόδοση'); return 0; }
  await fs.mkdir(DIR, { recursive: true });
  const status = await readJSON(path.join(DIR, 'status.json'), {});
  if (!KEY) { console.log('Odds: δεν υπάρχει ODDS_API_KEY — παραλείπεται (καμία απόδοση χωρίς αδειοδοτημένο πάροχο)'); return 0; }
  const fx = await readJSON(path.join(ROOT, 'data', 'matchups', 'fixtures.json'), { fixtures: [] });
  const now = Date.now();
  const soon = fx.fixtures.filter(f => f.comp === 'E' && new Date(f.t) - now < 4 * 864e5 && new Date(f.t) - now > -3 * 3600e3);
  if (!FORCE && PROVIDER !== 'oddspapi' && status.lastCall && now - new Date(status.lastCall) < MIN_INT * 60000) { console.log('Odds: rate limit, επόμενη κλήση αργότερα'); return stale(status); }
  if (!FORCE && !soon.length) { console.log('Odds: κανένας αγώνας τις επόμενες 4 μέρες'); return 0; }
  let res;
  try { res = await ADAPTERS[PROVIDER]({ status, fx }); } catch (e) { console.log('Odds: σφάλμα παρόχου —', e.message); status.lastError = new Date().toISOString(); status.error = e.message; await fs.writeFile(path.join(DIR, 'status.json'), JSON.stringify(status, null, 1)); return stale(status, true); }
  const ts = new Date().toISOString();
  // αντιστοίχιση με τους δικούς μας αγώνες
  const snaps = [], latest = await readJSON(path.join(DIR, 'latest.json'), { games: {} });
  let matched = 0;
  for (const ev of res.events) {
    const h = codeOf(ev.home), a = codeOf(ev.away);
    const f = fx.fixtures.find(x => x.comp === 'E' && x.h === h && x.a === a && Math.abs(new Date(x.t) - new Date(ev.commence)) < 3 * 864e5);
    if (!f) continue;
    if (!ev.books.some(b => jurisdictions(b.key, b.title).length)) continue;
    matched++;
    const gid = `E-${f.r}-${h}-${a}`;
    const G = (latest.games[gid] = { t: f.t, commence: ev.commence, provider: PROVIDER, books: {}, updated: ts });
    for (const b of ev.books.filter(b => jurisdictions(b.key, b.title).length)) {
      G.books[b.key] = { title: b.title, upd: b.upd, lic: jurisdictions(b.key, b.title), ...b.markets };
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

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
