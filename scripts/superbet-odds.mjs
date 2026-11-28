// Αποδόσεις νικητή αγώνα (Συμπ. παράταση) της Superbet.gr για EuroLeague, GBL και NBA, πριν από τους αγώνες.
// Χρησιμεύει για τον έλεγχο του μοντέλου: «τι έδινε η Superbet λίγο πριν το τζάμπολ».
//   node scripts/superbet-odds.mjs          λήψη + προσθήκη στο data/superbet-odds/YYYY-MM.jsonl
// Γράφει γραμμή μόνο όταν αλλάζει η απόδοση ενός αγώνα (ή εμφανίζεται πρώτη φορά), ώστε το αρχείο να μένει μικρό.
// Μόνο αγώνες που δεν έχουν αρχίσει (index=active-prematch): ποτέ live αποδόσεις.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'superbet-odds');
const API = 'https://production-superbet-offer-gr.freetls.fastly.net/v3/el-GR/events';
const COMPS = { E: 19114, G: 319, N: 164 };   // Superbet tournament ids: EuroLeague, Basket League (A1), NBA
const ML = 759;                                // «Νικητής Αγώνα (Συμπ. Παράταση)»

const now = new Date();
const iso = d => d.toISOString().replace(/\.\d+Z$/, '.000Z');
const start = iso(new Date(now.getTime() - 3600e3)), end = iso(new Date(now.getTime() + 10 * 86400e3));

await fs.mkdir(DIR, { recursive: true });
// τελευταία γνωστή τιμή ανά αγώνα (από τον τρέχοντα και τον προηγούμενο μήνα)
const month = d => d.toISOString().slice(0, 7);
const prevMonth = month(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));
const last = new Map();
for (const m of [prevMonth, month(now)]) {
  const txt = await fs.readFile(path.join(DIR, `${m}.jsonl`), 'utf8').catch(() => '');
  for (const l of txt.split('\n')) { if (!l) continue; const x = JSON.parse(l); last.set(x.id, `${x.p1}|${x.p2}`); }
}

const rows = [];
let fail = 0;
for (const [comp, t] of Object.entries(COMPS)) {
  const url = `${API}?startDate=${start}&endDate=${end}&index=active-prematch&tournaments=${t}`;
  let j;
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (basketballstats.eu odds check)', accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.log(`Superbet ${comp}: HTTP ${r.status}`); fail++; continue; }
    j = await r.json();
  } catch (e) { console.log(`Superbet ${comp}: ${e.message}`); fail++; continue; }
  const evs = Array.isArray(j.events) ? j.events : [];
  let n = 0, changed = 0;
  for (const ev of evs) {
    const fx = ev.fixture ?? {};
    const utc = fx.utc_date ? new Date(fx.utc_date) : null;
    if (!utc || utc <= now) continue;                               // ποτέ αγώνας που άρχισε
    const m = (ev.markets ?? []).find(x => x.id === ML);
    const o1 = m?.odds?.find(o => o.metadata?.code === '1'), o2 = m?.odds?.find(o => o.metadata?.code === '2');
    if (!o1?.price || !o2?.price || o1.status !== 1 || o2.status !== 1) continue;
    n++;
    const [home, away] = String(fx.event_name || '').split('·');
    const key = `${o1.price}|${o2.price}`;
    if (last.get(ev.event_id) === key) continue;
    last.set(ev.event_id, key); changed++;
    rows.push({ t: now.toISOString(), comp, id: ev.event_id, br: fx.betradar_id ?? null, tip: utc.toISOString(), home: home?.trim() ?? null, away: away?.trim() ?? null, p1: o1.price, p2: o2.price });
  }
  console.log(`Superbet ${comp}: ${evs.length} αγώνες, ${n} με αποδόσεις, ${changed} αλλαγές`);
}
if (rows.length) await fs.appendFile(path.join(DIR, `${month(now)}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`Superbet: γράφτηκαν ${rows.length} γραμμές`);
if (fail === Object.keys(COMPS).length) process.exit(1);   // καμία απάντηση: να φανεί στο Actions
