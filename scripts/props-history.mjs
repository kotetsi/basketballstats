// Ιστορικές αποδόσεις player props (OddsPapi /historical-odds) για έλεγχο του μοντέλου σε παλιές αγωνιστικές.
// Κάθε αγώνας = 1 κλήση (έως 3 bookmakers). Οι κλήσεις μετρούν στο ίδιο μηνιαίο όριο με τις κανονικές αποδόσεις
// (data/odds/status.json) και αφήνουμε πάντα απόθεμα για τις τρέχουσες αγωνιστικές.
//   ROUNDS=9,10  BOOKS=stoiximan,superbet,bet365  MAX=12  RESERVE=70  PROBE=1 (μόνο 1 αγώνας, ωμή απάντηση για έλεγχο μορφής)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DIR = path.join(ROOT, 'data', 'odds'), HD = path.join(DIR, 'hist');
const KEY = (process.env.ODDS_API_KEY || '').trim();
if (!KEY) { console.log('Χωρίς ODDS_API_KEY, παράλειψη.'); process.exit(0); }
const ROUNDS = String(process.env.ROUNDS || '').split(',').map(Number).filter(Boolean);
const BOOKS = process.env.BOOKS || 'stoiximan,superbet,bet365';
const MAX = +(process.env.MAX || 12), RESERVE = +(process.env.RESERVE || 70), PROBE = process.env.PROBE === '1';
const CAP = +(process.env.ODDS_MONTHLY_CAP || 240);
const readJ = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
await fs.mkdir(HD, { recursive: true });

const statusF = path.join(DIR, 'status.json'), status = await readJ(statusF, {});
const month = new Date().toISOString().slice(0, 7), st = (status.oddspapi ||= {});
if (st.month !== month) { st.month = month; st.calls = 0; }
const left = () => CAP - (st.calls || 0) - RESERVE;
let last = 0;
async function call(p, o) {
  if (left() <= 0) throw new Error(`όριο: ${st.calls}/${CAP} κλήσεις, απόθεμα ${RESERVE} για τις τρέχουσες αγωνιστικές`);
  const wait = 5200 - (Date.now() - last); if (wait > 0) await new Promise(r => setTimeout(r, wait));
  st.calls = (st.calls || 0) + 1; last = Date.now();
  const r = await fetch(`https://api.oddspapi.io/v4/${p}?${new URLSearchParams({ apiKey: KEY, ...o })}`, { signal: AbortSignal.timeout(60000) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`/${p} ${r.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}
const save = async () => fs.writeFile(statusF, JSON.stringify(status, null, 1));

// αγώνες της σεζόν από το data.json του site (ημερομηνία/ώρα και ομάδες) και αντιστοίχιση με fixtures του παρόχου
const site = JSON.parse(await fs.readFile(path.join(ROOT, 'dist', 'assets', 'data.json'), 'utf8').catch(async () => (await fetch('https://basketballstats.eu/assets/data.json')).text()));
const gd = w => new Date(Date.UTC(2020 + (+w[8]), +w.slice(0, 2) - 1, +w.slice(2, 4), +w.slice(4, 6), +w.slice(6, 8)));
const meta = await readJ(path.join(DIR, 'oddspapi_meta.json'), {});
const fxF = path.join(HD, 'fixtures.json');
let fx = await readJ(fxF, null);
if (!fx) {
  const games = site.league.games.filter(g => g[6]);
  const from = games.map(g => gd(g[1])).sort((a, b) => a - b)[0].toISOString().slice(0, 10);
  const res = await call('fixtures', { sportId: 11, tournamentId: +(process.env.ODDSPAPI_TOURNAMENT || 138), from, to: new Date().toISOString().slice(0, 10) });
  const arr = Array.isArray(res) ? res : Object.values(res || {});
  fx = arr.map(f => ({ id: String(f.fixtureId ?? f.id), p1: String(f.participant1Id), p2: String(f.participant2Id), n1: meta.parts?.[f.participant1Id] || null, n2: meta.parts?.[f.participant2Id] || null, start: f.startTime || f.trueStartTime }));
  await fs.writeFile(fxF, JSON.stringify(fx, null, 1)); await save();
  console.log(`fixtures: ${fx.length} αγώνες από ${from}`);
}
// αντιστοίχιση: ίδια ώρα έναρξης (±3 ώρες) και ονόματα ομάδων που ταιριάζουν
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
const tok = s => fold(s).split(/\s+/).filter(w => w.length > 3 && !['basket', 'basketball', 'club', 'team'].includes(w));
const teamNames = c => [c, ...(site.teams[c] || []).filter(x => typeof x === 'string')].join(' ');
const like = (a, c) => { const A = tok(a), B = tok(teamNames(c)).concat(tok(site.teamsEn?.[c] || '')); return A.some(w => B.some(v => v.startsWith(w.slice(0, 5)) || w.startsWith(v.slice(0, 5)))); };
const mapF = path.join(HD, 'map.json'), map = await readJ(mapF, {});
for (const g of site.league.games.filter(g => g[6] && (!ROUNDS.length || ROUNDS.includes(g[0])))) {
  const gid = `E-${g[0]}-${g[2]}-${g[3]}`; if (map[gid]) continue;
  const t = gd(g[1]);
  const c = fx.filter(f => Math.abs(new Date(f.start) - t) < 3 * 36e5);
  const m = c.find(f => (like(f.n1, g[2]) && like(f.n2, g[3])) || (like(f.n1, g[3]) && like(f.n2, g[2]))) || (c.length === 1 ? c[0] : null);
  if (m) map[gid] = { id: m.id, start: m.start, n1: m.n1, n2: m.n2 };
}
await fs.writeFile(mapF, JSON.stringify(map, null, 1));
const todo = Object.entries(map).filter(([gid]) => !ROUNDS.length || ROUNDS.includes(+gid.split('-')[1]));
console.log(`αντιστοιχίστηκαν ${todo.length} αγώνες για τις αγωνιστικές ${ROUNDS.join(',') || 'όλες'}· κλήσεις μήνα ${st.calls}/${CAP}`);

let n = 0;
for (const [gid, f] of todo) {
  const out = path.join(HD, `${gid}.json`);
  if (await fs.stat(out).then(() => true, () => false)) continue;
  if (n >= (PROBE ? 1 : MAX) || left() <= 0) break;
  let res;
  try { res = await call('historical-odds', { fixtureId: f.id, bookmakers: BOOKS }); } catch (e) { console.log(gid, e.message); await save(); break; }
  n++;
  if (PROBE) { await fs.writeFile(path.join(HD, `raw-${gid}.json`), JSON.stringify(res)); describe(res); }
  // κρατάμε μόνο player props: για κάθε (bookmaker, market, outcome, player) την πρώτη και την τελευταία τιμή πριν το τζάμπολ
  const start = new Date(f.start).getTime(), keep = {};
  for (const [bk, b] of Object.entries(res.bookmakers || res)) {
    for (const [mid, mk] of Object.entries(b?.markets || {})) {
      for (const [oid, oc] of Object.entries(mk?.outcomes || {})) {
        for (const [pid, pe] of Object.entries(oc?.players || {})) {
          if (pid === '0') continue;
          const E = (Array.isArray(pe) ? pe : [pe]).filter(e => e && e.price > 1 && new Date(e.createdAt || 0).getTime() <= start).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          if (!E.length) continue;
          const lastE = E[E.length - 1];
          ((keep[bk] ||= {})[mid] ||= {})[oid] ||= {};
          keep[bk][mid][oid][pid] = { open: E[0].price, close: lastE.price, active: lastE.active !== false, name: lastE.playerName || pe.playerName || null };
        }
      }
    }
  }
  await fs.writeFile(out, JSON.stringify({ gid, fixture: f.id, start: f.start, books: keep }));
  await save();
  console.log(gid, Object.fromEntries(Object.entries(keep).map(([b, m]) => [b, Object.keys(m).length])));
}
await save();
console.log(`τέλος: ${n} κλήσεις historical-odds· μήνας ${st.calls}/${CAP}`);

function describe(r) {
  const top = Object.keys(r || {}).slice(0, 10); console.log('κορυφή:', top);
  const b = r.bookmakers || r, bk = Object.keys(b)[0], m = b[bk]?.markets || {}, mid = Object.keys(m)[0], o = m[mid]?.outcomes || {}, oid = Object.keys(o)[0], pl = o[oid]?.players || {}, pid = Object.keys(pl).find(k => k !== '0') || Object.keys(pl)[0];
  console.log('bookmaker', bk, 'markets', Object.keys(m).length, 'π.χ.', mid, meta.markets?.[mid]?.name, '→ outcome', oid, '→ player', pid, JSON.stringify(pl[pid]).slice(0, 400));
}
