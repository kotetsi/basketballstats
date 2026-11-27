// Superbet (μέσω ArbPlay, δοκιμαστικό κλειδί έως 3/12/2026): γραμμές παικτών EuroLeague, GBL και NBA πριν από τους αγώνες.
// Το repo είναι δημόσιο, οπότε:
//   - το κλειδί έρχεται μόνο από το env ARBPLAY_KEY (GitHub secret) και δεν γράφεται πουθενά,
//   - οι γραμμές αποθηκεύονται κρυπτογραφημένες (AES-256, κωδικός = ARBPLAY_KEY) στο data/superbet/,
//   - στο log γράφονται μόνο πλήθη, ποτέ αποδόσεις.
//   node scripts/superbet-arbplay.mjs            λήψη + αποθήκευση (στο GitHub Actions)
//   node scripts/superbet-arbplay.mjs --decrypt  τυπώνει τα αποκρυπτογραφημένα snapshots (JSON lines)
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'superbet');
const FILE = 'site_pregame_superbet_basketball.json';
const KEY = process.env.ARBPLAY_KEY;
const UNTIL = Date.parse('2026-12-03T23:59:59+02:00');
if (!KEY) { console.log('Superbet: λείπει το ARBPLAY_KEY (GitHub → Settings → Secrets → Actions)'); process.exit(process.env.CI ? 1 : 0); }

const pass = crypto.createHash('sha256').update('basketballstats-superbet|' + KEY).digest();
function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', pass, iv);
  const body = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(obj))), c.final()]);
  return Buffer.concat([Buffer.from('SB1'), iv, c.getAuthTag(), body]);
}
function open(buf) {
  if (buf.subarray(0, 3).toString() !== 'SB1') throw new Error('άγνωστη μορφή');
  const d = crypto.createDecipheriv('aes-256-gcm', pass, buf.subarray(3, 15)); d.setAuthTag(buf.subarray(15, 31));
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(31)), d.final()])));
}

if (process.argv.includes('--decrypt')) {
  for (const f of (await fs.readdir(DIR).catch(() => [])).filter(f => f.endsWith('.bin')).sort()) process.stdout.write(JSON.stringify(open(await fs.readFile(path.join(DIR, f)))) + '\n');
  process.exit(0);
}
if (Date.now() > UNTIL) { console.log('Superbet: η δοκιμή της ArbPlay έληξε (3/12), τίποτα να κάνω'); process.exit(0); }

const r = await fetch(`https://api.arbplay.app/v1/data/${FILE}`, { headers: { 'X-API-Key': KEY }, signal: AbortSignal.timeout(60000) });
if (!r.ok) { console.log(`Superbet: HTTP ${r.status}${r.status === 429 ? ` (Retry-After ${r.headers.get('retry-after')})` : ''}`); process.exit(r.status === 401 || r.status === 403 ? 1 : 0); }
const J = await r.json();
const events = Array.isArray(J.data) ? J.data : [];

// Ποια διοργάνωση: το fixture έχει μόνο tournament_id (χωρίς όνομα), οπότε τις αναγνωρίζουμε από τις ομάδες
// (event_name = "Γηπεδούχος·Φιλοξενούμενος", στα αγγλικά). Ψήφος ανά tournament_id: Ολυμπιακός–Παναθηναϊκός
// στη GBL πάει στη GBL γιατί οι υπόλοιποι αγώνες της ίδιας διοργάνωσης είναι ελληνικοί.
const EL = /olympiacos|olympiakos|panathinaikos|real madrid|barcelona|fenerbahce|efes|monaco|partizan|crvena|red star|zvezda|zalgiris|maccabi|hapoel|bayern|virtus|olimpia|milan|baskonia|valencia|paris basket|^paris|asvel|villeurbanne|dubai/i;
const GR = /olympiacos|olympiakos|panathinaikos|aek|aris|paok|peristeri|promitheas|kolossos|maroussi|marousi|lavrio|panionios|karditsa|mykonos|iraklis|kifisia|kifissia|amarousiou|rhodes|rodou|apollon|ionikos|psychiko/i;
const NBA = /hawks|celtics|nets|hornets|bulls|cavaliers|pistons|pacers|\bheat\b|bucks|knicks|magic|76ers|sixers|raptors|wizards|mavericks|nuggets|warriors|rockets|clippers|lakers|grizzlies|timberwolves|pelicans|thunder|\bsuns\b|blazers|\bkings\b|spurs|\bjazz\b/i;
const teamsOf = ev => String(ev.fixture?.event_name || '').split(/·|\s+-\s+|\s+vs?\.?\s+/i).map(x => x.trim()).filter(Boolean);
const vote = ev => { const t = teamsOf(ev); if (t.length !== 2) return null; if (t.every(x => NBA.test(x))) return 'nba'; const el = t.every(x => EL.test(x)), gr = t.every(x => GR.test(x)); return el && gr ? 'both' : el ? 'euroleague' : gr ? 'gbl' : null; };
const tally = new Map();
for (const ev of events) { const k = ev.fixture?.tournament_id, v = vote(ev); if (k == null || !v) continue; const o = tally.get(k) ?? { euroleague: 0, gbl: 0, both: 0, nba: 0 }; o[v]++; tally.set(k, o); }
// Για να μην πάρουμε π.χ. την ισπανική ACB (Μπαρτσελόνα–Βαλένθια) για EuroLeague: τουλάχιστον 3 αγώνες
// και το 60% των αγώνων της διοργάνωσης να είναι ανάμεσα σε ομάδες της ίδιας λίστας.
const size = new Map(); for (const ev of events) { const k = ev.fixture?.tournament_id; size.set(k, (size.get(k) || 0) + 1); }
const T = new Map([...tally].map(([k, o]) => {
  const c = o.nba > o.euroleague + o.gbl + o.both ? 'nba' : o.euroleague > o.gbl ? 'euroleague' : o.gbl > o.euroleague ? 'gbl' : o.both ? 'euroleague' : null;
  const hits = c === 'nba' ? o.nba : o[c] + o.both;
  return [k, c && hits >= 3 && hits / size.get(k) >= 0.6 ? c : null];
}).filter(([, c]) => c));
const comp = ev => { const k = ev.fixture?.tournament_id, c = T.get(k); return c && vote(ev) ? c : null; };
const meta = o => o?.metadata ?? o?.meta ?? {};

const keep = [], seen = {};
for (const ev of events) {
  const c = comp(ev);
  const fx = ev.fixture ?? {};
  for (const k of Object.keys(fx)) seen['πεδίο fixture: ' + k] = (seen['πεδίο fixture: ' + k] || 0) + 1;
  if (!c) continue;
  seen[c] = (seen[c] || 0) + 1;
  const lines = [];
  for (const m of ev.markets ?? []) {
    if (!/^player/i.test(m.name || '')) continue;
    for (const o of m.odds ?? []) {
      const md = meta(o), sp = md.specifiers ?? o.specifiers ?? {};
      const nm = md.name ?? o.name ?? '';
      const side = /\bover\b/i.test(nm) ? 'over' : /\bunder\b/i.test(nm) ? 'under' : null;
      lines.push({ market: m.name, player: sp.player ?? null, line: sp.total != null ? +sp.total : null, side, price: +o.price || null, name: nm });
    }
  }
  if (lines.length) keep.push({ comp: c, event: fx.event_name ?? null, date: fx.event_date ?? null, fixture: fx, lines });
}

console.log(`Superbet: ${events.length} αγώνες στο αρχείο, ενημέρωση ${J.updated_at}`);
for (const [k, v] of Object.entries(seen).sort()) if (!k.startsWith('πεδίο')) console.log(`  ${k}: ${v}`);
// διοργανώσεις: πλήθος αγώνων, αγορές παικτών, δύο παραδείγματα (μόνο ονόματα ομάδων, όχι αποδόσεις)
const byT = new Map();
for (const ev of events) {
  const fx = ev.fixture ?? {}, t = `${fx.category_id}/${fx.tournament_id}`;
  const o = byT.get(t) ?? { n: 0, pm: 0, ex: [] }; o.n++;
  o.pm += (ev.markets ?? []).filter(m => /^player/i.test(m.name || '')).length;
  if (o.ex.length < 2) o.ex.push(fx.event_name);
  byT.set(t, o);
}
for (const [k, c] of T) console.log(`  αναγνωρίστηκε: tournament ${k} = ${c} (${JSON.stringify(tally.get(k))})`);
for (const [t, o] of [...byT].sort((a, b) => b[1].n - a[1].n)) console.log(`  διοργάνωση ${t}: ${o.n} αγώνες, ${o.pm} αγορές παικτών — ${o.ex.join(' | ')}`);
const nl = keep.reduce((a, e) => a + e.lines.length, 0);
console.log(`  κρατήθηκαν: ${keep.length} αγώνες (${['euroleague', 'gbl', 'nba'].map(c => `${c} ${keep.filter(e => e.comp === c).length}`).join(', ')}) με ${nl} γραμμές παικτών`);
if (!keep.length) process.exit(0);

await fs.mkdir(DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await fs.writeFile(path.join(DIR, `${stamp}.bin`), seal({ fetched: new Date().toISOString(), updated_at: J.updated_at, events: keep }));
console.log(`  αποθηκεύτηκε κρυπτογραφημένο: data/superbet/${stamp}.bin`);
