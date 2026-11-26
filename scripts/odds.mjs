// Odds ingestion από ΑΔΕΙΟΔΟΤΗΜΕΝΟ πάροχο (όχι scraping bookmakers).
// Χρειάζεται ODDS_API_KEY στα GitHub Secrets. Χωρίς κλειδί δεν κάνει τίποτα.
//
//   ODDS_PROVIDER = oddspapi (προεπιλογή)     · adapters: oddspapi, theoddsapi, generic (JSON σε ODDS_GENERIC_URL)
//   ODDS_MIN_INTERVAL_MIN = 180               · rate limiting ανάμεσα σε κλήσεις (εξοικονόμηση quota, όχι για oddspapi)
//   node scripts/odds.mjs [--force]           · --force: αγνοεί το rate limit
//
// Πολλοί πάροχοι: το workflow τρέχει το script μία φορά ανά πάροχο (π.χ. oddspapi για props, theoddsapi για τις
// κύριες αγορές). Οι τιμές ΣΥΓΧΩΝΕΥΟΝΤΑΙ στο latest.json: κάθε bookmaker έχει «src» = πάροχος· ο oddspapi έχει
// προτεραιότητα, και ένας bookmaker που υπάρχει ήδη από άλλον πάροχο δεν διπλασιάζεται. Οι bookmakers του
// theoddsapi γράφονται με πρόθεμα «toa_», ώστε να μη θεωρηθούν ποτέ επιβεβαιωμένα ελληνικά feeds του μητρώου.
// Η κατάσταση των άλλων παρόχων (εκτός oddspapi) γράφεται στο status.providers[<πάροχος>].
//
// Αρχεία:
//   data/odds/history.jsonl        αλλαγές main markets (append-only, idempotent)
//   data/odds/props-history.jsonl  αλλαγές player props (append-only, idempotent)
//   data/odds/latest.json     τρέχουσες τιμές ανά αγώνα/bookmaker (για το build)
//   data/odds/status.json     τελευταία επιτυχία, quota, για alerting
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendChanges, appendPropSnapshots } from '../src/odds/core.mjs';
import { extractProps } from '../src/odds/props.mjs';
import { confirmedFeeds } from '../src/odds/value.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'odds');
const KEY = (process.env.ODDS_API_KEY || '').trim();
const PROVIDER = process.env.ODDS_PROVIDER || 'oddspapi';
const MIN_INT = +(process.env.ODDS_MIN_INTERVAL_MIN || 180);
const FORCE = process.argv.includes('--force');
const STALE_H = 30;

// Quota exhaustion is fatal for this run: do not swallow it as an ordinary per-fixture miss.
export const isQuotaLimitError = error => /μηνιαίο όριο \d+ κλήσεων/i.test(String(error?.message || error));

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
    // ομάδες/αγορές/bookmakers αλλάζουν σπάνια: ανανέωση κάθε ODDSPAPI_META_DAYS μέρες (3 κλήσεις)
    const META_DAYS = +(process.env.ODDSPAPI_META_DAYS || 30);
    if (!meta.at || Date.now() - new Date(meta.at) > META_DAYS * 864e5) {
      const parts = await call('participants', { sportId: SPORT, tournamentId: TOUR });
      const markets = await call('markets', { sportId: SPORT });
      const books = await call('bookmakers', {}).catch(e => { if (isQuotaLimitError(e)) throw e; return []; });
      meta = {
        at: new Date().toISOString(),
        parts: Object.fromEntries(arr(parts).map(p => [String(pick(p, ['participantId', 'id', '_k'])), pick(p, ['participantName', 'name', 'shortName'])])),
        markets: Object.fromEntries(arr(markets).map(m => [String(pick(m, ['marketId', 'id', '_k'])), { name: pick(m, ['marketName', 'name']) || '', line: pick(m, ['handicap', 'line', 'marketLine', 'points']), outcomes: arr(m.outcomes).map(o => ({ id: String(pick(o, ['outcomeId', 'id', '_k'])), name: pick(o, ['outcomeName', 'name']) })) }])),
        books: Object.fromEntries(arr(books).map(b => [String(pick(b, ['slug', 'bookmakerSlug', 'bookmaker', '_k'])), pick(b, ['bookmakerName', 'name', 'title']) || pick(b, ['slug'])])),
      };
      await fs.writeFile(metaF, JSON.stringify(meta));
    }
    // fixtures: όχι κάθε μέρα. Νέα κλήση μόνο αν η λίστα είναι παλιότερη από ODDSPAPI_FIXTURES_DAYS μέρες
    // ή αν κάποιος δικός μας αγώνας EuroLeague των επόμενων 96 ωρών λείπει από αυτήν.
    const today = new Date().toISOString().slice(0, 10);
    const FIX_DAYS = +(process.env.ODDSPAPI_FIXTURES_DAYS || 3);
    const fixAge = st.fixturesDay ? (Date.parse(today) - Date.parse(st.fixturesDay)) / 864e5 : Infinity;
    const ours = (ctx.fx?.fixtures || []).filter(f => f.comp === 'E' && new Date(f.t) - Date.now() > 0 && new Date(f.t) - Date.now() < 96 * 3600e3);
    const missing = ours.some(f => !(st.fixtures || []).some(x => Math.abs(new Date(x.start) - new Date(f.t)) < 3 * 3600e3));
    // «λείπει αγώνας»: το πολύ μία επιπλέον κλήση τη μέρα (π.χ. αναβληθείς αγώνας που δεν θα εμφανιστεί ποτέ)
    if (!st.fixtures || fixAge >= FIX_DAYS || (missing && st.fixturesDay !== today)) {
      const to = new Date(Date.now() + (FIX_DAYS + 4) * 864e5).toISOString().slice(0, 10);
      const fx = await call('fixtures', { sportId: SPORT, tournamentId: TOUR, from: today, to });
      st.fixtures = arr(fx).map(f => ({ id: String(pick(f, ['fixtureId', 'id'])), p1: String(f.participant1Id), p2: String(f.participant2Id), start: f.startTime || f.trueStartTime }));
      st.fixturesDay = today;
    }
    st.done ||= {};
    st.propDone ||= {};
    st.propAttempts ||= {};
    const PROP_RETRY_MS = 6 * 3600e3, MAX_PROP_ATTEMPTS = 2;
    const now = Date.now(), events = [];
    for (const f of st.fixtures) {
      const hrs = (new Date(f.start) - now) / 3600e3;
      if (hrs < -1 || hrs > 96) continue;
      // προεπιλογή: μόνο «mid» (~1 μέρα πριν, τότε ανεβαίνουν τα props) και «close» (για το CLV)·
      // το «open» κόστιζε μία κλήση ανά αγώνα και εξαντλούσε το μηνιαίο όριο των 250 κλήσεων
      const WINS = (process.env.ODDSPAPI_WINDOWS || 'mid,close').split(',');
      // player props συνήθως ανεβαίνουν ~1 μέρα πριν: αν η πρώτη λήψη δεν είχε props, παίρνουμε και το «mid» παράθυρο
      if ((st.props ||= {})[f.id] === 0 && !WINS.includes('mid')) WINS.push('mid');
      const win = hrs <= 4 ? 'close' : hrs <= 30 ? 'mid' : 'open';
      if (!WINS.includes(win)) continue;
      const done = (st.done[f.id] ||= []);
      const propDone = (st.propDone[f.id] ||= []);
      const attempts = (st.propAttempts[f.id] ||= {});
      const attempt = attempts[win] || { count: 0, lastAttempt: null };
      const lastAttemptAt = Date.parse(attempt.lastAttempt || '');
      if (!FORCE && (propDone.includes(win) || attempt.count >= MAX_PROP_ATTEMPTS ||
          (Number.isFinite(lastAttemptAt) && now - lastAttemptAt < PROP_RETRY_MS))) continue;
      attempts[win] = { count: attempt.count + 1, lastAttempt: new Date(now).toISOString() };
      const res = await call('odds', { fixtureId: f.id, oddsFormat: 'decimal' }).catch(e => { console.log('Odds:', e.message); if (isQuotaLimitError(e)) throw e; return null; });
      if (!res) continue;
      if (!done.includes(win)) done.push(win);
      const price = o => { const p = o && (o.players?.['0'] || Object.values(o.players || {})[0]); return p && p.active !== false ? p.price : null; };
      const changed = o => { const p = o && (o.players?.['0'] || Object.values(o.players || {})[0]); return p?.changedAt || null; };
      const bo = res.bookmakerOdds || {};
      // κύρια γραμμή handicap/συνόλου: η αγορά (marketId) που έχουν οι περισσότεροι bookmakers
      const count = re => { const c = {}; for (const b of Object.values(bo)) for (const mid of Object.keys(b.markets || {})) if (re.test(meta.markets[mid]?.name || '')) c[mid] = (c[mid] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };
      // μόνο αγορές ολόκληρου αγώνα (όχι ημίχρονα/περίοδοι/ομάδα/παίκτης)
      const hMid = count(/^handicap \(incl\. overtime\)$/i);
      const isOU = mid => /^over under \(incl\. overtime\)$/i.test(meta.markets[mid]?.name || '');
      const books = [];
      for (const [slug, b] of Object.entries(bo)) {
        if (b.bookmakerIsActive === false) continue;
        const M = b.markets || {}, m = {}; let upd = null;
        const two = mid => { const oc = M[mid]?.outcomes || {}; const ids = Object.keys(oc).sort((x, y) => +x - +y); const ps = ids.map(i => price(oc[i])); upd = ids.map(i => changed(oc[i])).filter(Boolean).sort().pop() || upd; return ps.length >= 2 && ps[0] > 1 && ps[1] > 1 ? ps.slice(0, 2) : null; };
        const ml = two('111'); if (ml) m.ml = ml;
        if (hMid) { const p = two(hMid); if (p) m.spread = { line: meta.markets[hMid]?.line != null ? +meta.markets[hMid].line : null, h: p[0], a: p[1] }; }
        // σύνολο πόντων: κύρια γραμμή κάθε bookmaker = η γραμμή με τις πιο ισορροπημένες τιμές Over/Under
        {
          let best = null;
          for (const mid of Object.keys(M).filter(isOU)) {
            const oc = M[mid]?.outcomes || {}, nm = meta.markets[mid]?.outcomes || [];
            const idOf = re => nm.find(o => re.test(o.name || ''))?.id;
            const ov = price(oc[idOf(/^over/i)]), un = price(oc[idOf(/^under/i)]), line = meta.markets[mid]?.line;
            if (!(ov > 1 && un > 1) || line == null) continue;
            const d = Math.abs(1 / ov - 1 / un);
            if (!best || d < best.d) best = { d, line: +line, over: ov, under: un, upd: [oc[idOf(/^over/i)], oc[idOf(/^under/i)]].map(changed).filter(Boolean).sort().pop() };
          }
          if (best) { m.total = { line: best.line, over: best.over, under: best.under }; if (best.upd && (!upd || best.upd > upd)) upd = best.upd; }
        }
        const pr = extractProps(M, meta); if (pr.length) m.props = pr;
        // αναγνωριστικό παίκτη του παρόχου → όνομα (το /historical-odds δίνει μόνο αναγνωριστικό)
        for (const mk of Object.values(M || {})) for (const oc of Object.values(mk?.outcomes || {})) for (const [pid, pe] of Object.entries(oc?.players || {})) if (pid !== '0' && pe?.playerName) (ctx.status.playerNames ||= {})[pid] = pe.playerName;
        if (Object.keys(m).length) books.push({ key: slug, title: meta.books[slug] || slug, upd, window: win || null, markets: m });
      }
      st.props[f.id] = books.reduce((n, b) => n + (b.markets.props?.length || 0), 0);
      events.push({ eventId: f.id, home: meta.parts[f.p1] || '', away: meta.parts[f.p2] || '', commence: f.start, window: win, books });
    }
    // καθαρισμός παλιών αγώνων από τη μνήμη κατάστασης
    for (const id of Object.keys(st.done)) if (!st.fixtures.some(f => f.id === id)) {
      delete st.done[id]; delete st.props?.[id]; delete st.propDone?.[id]; delete st.propAttempts?.[id];
    }
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
// Έλεγχος λογικής για αγορές δύο επιλογών: και οι δύο τιμές > 1 και άθροισμα αντίστροφων (overround) 0,98–1,15.
// Πιάνει τιμές-«σκουπίδια» όπως 1,01/1,01 ή 1,52/1,02 (Betfair Exchange χωρίς ρευστότητα), που δείχνουν ψεύτικη αξία.
export const saneTwoWay = (a, b) => a > 1 && b > 1 && 1 / a + 1 / b >= 0.98 && 1 / a + 1 / b <= 1.15;
export function saneMarkets(m = {}) {
  const out = { ...m };
  if (out.ml && !saneTwoWay(out.ml[0], out.ml[1])) delete out.ml;
  if (out.spread && !saneTwoWay(out.spread.h, out.spread.a)) delete out.spread;
  if (out.total && !saneTwoWay(out.total.over, out.total.under)) delete out.total;
  return out;
}

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
  // ο oddspapi γράφει την κατάσταση στο πάνω επίπεδο (όπως πριν)· οι υπόλοιποι πάροχοι στο status.providers[πάροχος]
  const PRIMARY = PROVIDER === 'oddspapi';
  const pst = PRIMARY ? status : ((status.providers ||= {})[PROVIDER] ||= {});
  if (!FORCE && !PRIMARY && pst.lastCall && now - new Date(pst.lastCall) < MIN_INT * 60000) { console.log('Odds: rate limit, επόμενη κλήση αργότερα'); return stale(pst); }
  if (!FORCE && !soon.length) { console.log('Odds: κανένας αγώνας τις επόμενες 4 μέρες'); return 0; }
  let res;
  try { res = await ADAPTERS[PROVIDER]({ status, fx }); } catch (e) { console.log('Odds: σφάλμα παρόχου —', e.message); pst.lastError = new Date().toISOString(); pst.error = e.message; pst.quotaExhausted = isQuotaLimitError(e); await fs.writeFile(path.join(DIR, 'status.json'), JSON.stringify(status, null, 1)); return stale(pst, true); }
  const ts = new Date().toISOString();
  // αντιστοίχιση με τους δικούς μας αγώνες
  const snaps = [], propSnaps = [], latest = await readJSON(path.join(DIR, 'latest.json'), { games: {} });
  let matched = 0;
  for (const ev of res.events) {
    const h = codeOf(ev.home), a = codeOf(ev.away);
    const f = fx.fixtures.find(x => x.comp === 'E' && x.h === h && x.a === a && Math.abs(new Date(x.t) - new Date(ev.commence)) < 3 * 864e5);
    if (!f) continue;
    // bookmakers του theoddsapi με πρόθεμα: δεν συμπίπτουν ποτέ με feeds του oddspapi/του ελληνικού μητρώου
    const evBooks = PRIMARY ? ev.books : ev.books.map(b => ({ ...b, key: `toa_${b.key}` }));
    if (!evBooks.some(b => jurisdictions(b.key, b.title).length)) continue;
    matched++;
    const gid = `E-${f.r}-${h}-${a}`;
    // συγχώνευση: κρατάμε τους bookmakers των ΑΛΛΩΝ παρόχων και ξαναγράφουμε μόνο του τρέχοντος
    const prev = latest.games[gid];
    const G = (latest.games[gid] = { t: f.t, commence: ev.commence, provider: prev?.provider || PROVIDER, books: {}, updated: ts });
    for (const [k, b] of Object.entries(prev?.books || {})) if ((b.src || 'oddspapi') !== PROVIDER) G.books[k] = b;
    const brandOf = b => clean(b.title || b.key).replace(/\s+/g, '');
    const propSnapStart = propSnaps.length;
    for (const b0 of evBooks.filter(b => jurisdictions(b.key, b.title).length)) {
      // αγορές με αδύνατες τιμές (π.χ. Betfair Exchange χωρίς ρευστότητα: 1,01 και στις δύο πλευρές) δεν αποθηκεύονται
      const b = { ...b0, markets: saneMarkets(b0.markets) };
      if (!Object.keys(b.markets).length) continue;
      // ο ίδιος bookmaker από δύο παρόχους: κρατάμε του oddspapi (έχει props και ελέγχεται από το μητρώο)
      if (!PRIMARY && Object.values(G.books).some(x => (x.src || 'oddspapi') !== PROVIDER && brandOf(x) === brandOf(b))) continue;
      if (PRIMARY) for (const [k, x] of Object.entries(G.books)) if (x.src && x.src !== PROVIDER && brandOf(x) === brandOf(b)) delete G.books[k];
      G.books[b.key] = { title: b.title, upd: b.upd, lic: jurisdictions(b.key, b.title), src: PROVIDER, ...b.markets };
      const add = (market, sel, price, line) => price > 1 && snaps.push({ provider: PROVIDER, event: gid, book: b.key, market, sel, line: line ?? null, price, t: b.upd || ts, seen: ts });
      if (b.markets.ml) { add('ml', 'home', b.markets.ml[0]); add('ml', 'away', b.markets.ml[1]); }
      if (b.markets.spread) { add('spread', 'home', b.markets.spread.h, b.markets.spread.line); add('spread', 'away', b.markets.spread.a, -b.markets.spread.line); }
      if (b.markets.total) { add('total', 'over', b.markets.total.over, b.markets.total.line); add('total', 'under', b.markets.total.under, b.markets.total.line); }
      // Ιστορικό player props: ξεχωριστό κλειδί παίκτη + stat + γραμμή, ώστε να μην ενώνονται διαφορετικοί παίκτες.
      for (const p of b.markets.props || []) {
        if ((!p.name && p.playerId == null) || !p.stat || !Number.isFinite(+p.line)) continue;
        const stamp = p.upd || b.upd || ts;
        for (const [sel, price] of [['over', p.over], ['under', p.under]]) {
          if (price > 1) propSnaps.push({ provider: PROVIDER, event: gid, commence: ev.commence, book: b.key, market: `prop:${p.stat}`, sel, player: p.name || null, playerId: p.playerId ?? null, line: +p.line, price: +price, t: stamp, seen: ts, window: b.window || null });
        }
      }
    }
    if (PROVIDER === 'oddspapi' && ev.window && propSnaps.length > propSnapStart) {
      const state = status.oddspapi ||= {};
      const captured = (state.propDone[String(ev.eventId)] ||= []);
      if (!captured.includes(ev.window)) captured.push(ev.window);
    }
  }
  // ιστορικό: μόνο αλλαγές (idempotent)
  const readHistory = async file => (await fs.readFile(file, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(l => JSON.parse(l));
  const hf = path.join(DIR, 'history.jsonl');
  const phf = path.join(DIR, 'props-history.jsonl');
  const [hist, propHist] = await Promise.all([readHistory(hf), readHistory(phf)]);
  const added = appendChanges(hist, snaps);
  const propAdded = appendPropSnapshots(propHist, propSnaps);
  if (added.length) await fs.appendFile(hf, added.map(x => JSON.stringify(x)).join('\n') + '\n');
  if (propAdded.length) await fs.appendFile(phf, propAdded.map(x => JSON.stringify(x)).join('\n') + '\n');
  const totalAdded = added.length + propAdded.length;
  if (PRIMARY || !latest.provider) latest.provider = PROVIDER;
  latest.updated = ts;
  await fs.writeFile(path.join(DIR, 'latest.json'), JSON.stringify(latest));
  Object.assign(pst, { provider: PROVIDER, lastCall: ts, lastSuccess: ts, events: res.events.length, matched, added: totalAdded, propAdded: propAdded.length, quota: res.quota, quotaExhausted: false, error: null });
  if (totalAdded) pst.lastChange = ts;
  await fs.writeFile(path.join(DIR, 'status.json'), JSON.stringify(status, null, 1));
  console.log(`Odds (${PROVIDER}): ${res.events.length} αγώνες από τον πάροχο, ${matched} αντιστοιχίστηκαν, ${totalAdded} νέες τιμές (${propAdded.length} player props) · quota: ${res.quota.remaining ?? '?'}`);
  return 0;
}

// alerting: exit code 3 όταν το feed είναι «παγωμένο» (το workflow ανοίγει issue)
function stale(status, failed = false) {
  const last = status.lastSuccess ? new Date(status.lastSuccess) : null;
  if (failed && (!last || Date.now() - last > STALE_H * 3600e3)) { console.log(`Odds: ALERT — καμία επιτυχής ενημέρωση εδώ και >${STALE_H} ώρες`); return 3; }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
