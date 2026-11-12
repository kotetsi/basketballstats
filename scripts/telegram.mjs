// Αναρτήσεις στο κανάλι Telegram του BasketballStats. Τρέχει στο τέλος κάθε build στο GitHub Actions· χωρίς token δεν κάνει τίποτα.
//   1. κάθε ΝΕΟ pick των tipsters του TELEGRAM_TIPSTERS (προεπιλογή: high-fidelity), μία φορά, μόνο αν ο αγώνας δεν έχει αρχίσει
//   2. (μόνο με TELEGRAM_ROUNDS=1) προεπισκόπηση αγωνιστικής πριν και αποτελέσματα μετά
//   TELEGRAM_TOKEN  token του bot (@BotFather)      TELEGRAM_CHAT  κανάλι, π.χ. @eubasketballstats_eu
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = String(process.env.TELEGRAM_TOKEN || '').replace(/\s+/g, ''), CHAT = String(process.env.TELEGRAM_CHAT || '').trim();
const TIPSTERS = String(process.env.TELEGRAM_TIPSTERS || 'high-fidelity').split(',').map(s => s.trim()).filter(Boolean);
const ROUNDS = process.env.TELEGRAM_ROUNDS === '1';
const DRY = process.env.TELEGRAM_DRY === '1';
const SITE = 'https://basketballstats.eu';
if (!TOKEN || !CHAT) { console.log('Telegram: δεν έχουν οριστεί TELEGRAM_TOKEN / TELEGRAM_CHAT, παράλειψη.'); process.exit(0); }

const readJ = async (f, d = null) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const data = await readJ(path.join(ROOT, 'dist', 'assets', 'data.json'));
const par = await readJ(path.join(ROOT, 'dist', 'api', 'paroli', 'latest.json'));
const STATE = path.join(ROOT, 'data', 'telegram.json');
const state = await readJ(STATE, { posted: [] });
if (!data) { console.log('Telegram: δεν βρέθηκε το data.json'); process.exit(0); }

const tn = c => (data.teams[c] ? data.teams[c][0] : c);
const gd = w => new Date(Date.UTC(2020 + (+w[8]), +w.slice(0, 2) - 1, +w.slice(2, 4), +w.slice(4, 6), +w.slice(6, 8)));
const when = d => d.toLocaleString('el-GR', { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const games = data.league.games;
const RG = '<i>21+ | Παίζουμε υπεύθυνα. Το περιεχόμενο είναι στατιστική ανάλυση και όχι συμβουλή στοιχήματος. Κανένα σημείο δεν είναι σίγουρο.</i>';

async function send(text) {
  if (process.env.TELEGRAM_DRY === '1') { console.log('--- (δοκιμή, δεν στάλθηκε)\n' + text); return; }
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error('Telegram: ' + (j.description || r.status));
}

const posts = [];
// 0. νέα picks των tipsters: μία ανάρτηση ανά pick (κλειδί από το περιεχόμενο, όχι από τη σειρά στο αρχείο)
const now0 = Date.now(), aTag = (u, t) => `<a href="${esc(u)}">${esc(t)}</a>`;
for (const t of data.tips || []) {
  if (!TIPSTERS.includes(t.s)) continue;
  const [h, a] = t.g.split('-'), g = games.find(x => x[0] === t.r && x[2] === h && x[3] === a);
  if (!g || g[6] || gd(g[1]) <= now0) continue;                              // ποτέ pick αγώνα που άρχισε ή τελείωσε
  const key = `pick-${t.s}-${t.r}-${t.g}-${t.l}`.toLowerCase().replace(/\s+/g, '_').slice(0, 120);
  if (state.posted.includes(key)) continue;
  const url = t.u.startsWith('http') ? t.u : SITE + t.u;
  posts.push({ key, text: `🎯 <b>Νέο pick · ${esc(t.n)}</b>\n\n🏀 ${esc(tn(h))} – ${esc(tn(a))}\n🕗 ${esc(when(gd(g[1])))}\n\n👉 <b>${esc(t.l)}</b>${t.o ? ` @${Number(t.o).toFixed(2)}` : ''}\n\n📝 Η ανάλυση: ${aTag(url, url.replace(/^https:\/\//, ''))}\n📊 Όλα τα picks και το ποσοστό επιτυχίας: ${SITE}/tipsters/\n\n${RG}` });
}
// 1. results of the last completed round
const done = [...new Set(games.map(g => g[0]))].filter(r => games.filter(g => g[0] === r).every(g => g[6]));
const lastDone = done.length ? Math.max(...done) : 0;
if (ROUNDS && lastDone && !state.posted.includes('res-' + lastDone)) {
  const L = games.filter(g => g[0] === lastDone).map(g => `${g[4] > g[5] ? '<b>' + esc(tn(g[2])) + '</b>' : esc(tn(g[2]))} ${g[4]}-${g[5]} ${g[5] > g[4] ? '<b>' + esc(tn(g[3])) + '</b>' : esc(tn(g[3]))}`);
  posts.push({ key: 'res-' + lastDone, text: `🏀 <b>EuroLeague · Τα αποτελέσματα της ${lastDone}ης αγωνιστικής</b>\n\n${L.join('\n')}\n\n📊 Η αγωνιστική σε αριθμούς: ${SITE}/arthra/agonistiki-${lastDone}-se-arithmous/\n📈 Βαθμολογία και πιθανότητες playoffs: ${SITE}/` });
}
// 2. preview of the next round, from 36 hours before its first game
const next = games.find(g => !g[6]);
if (ROUNDS && next) {
  const r = next[0], rg = games.filter(g => g[0] === r).sort((a, b) => gd(a[1]) - gd(b[1]));
  const first = gd(rg[0][1]), now = Date.now();
  if (first - now < 36 * 3600e3 && first > now && !state.posted.includes('pre-' + r)) {
    const L = rg.map(g => `${esc(when(gd(g[1])))} · ${esc(tn(g[2]))} – ${esc(tn(g[3]))}`);
    let p = '';
    if (par && par.round === r) p = `\n\n🎯 <b>Το παρολί του μοντέλου</b> (${Math.round(par.P * 100)}%, δίκαιη απόδοση ${(1 / par.P).toFixed(2)}):\n${par.picks.map(x => `• ${esc(tn(x.fav))} (${Math.round(x.p * 100)}%)`).join('\n')}\n${par.url}${par.record?.n ? `\nΜέχρι τώρα: ${par.record.hits}/${par.record.picks} επιλογές, ${par.record.won}/${par.record.n} παρολί` : ''}`;
    posts.push({ key: 'pre-' + r, text: `🏀 <b>EuroLeague · ${r}η αγωνιστική</b>\n\n${L.join('\n')}${p}\n\n🔮 Προβλέψεις αγώνων: ${SITE}/prognostika/\n🧮 Fantasy PIR Projections: ${SITE}/fantasy/projections/\n\n${RG}` });
  }
}
for (const p of posts) {
  try { await send(p.text); state.posted.push(p.key); console.log('Telegram: στάλθηκε', p.key); }
  catch (e) { console.error(e.message); }
}
state.posted = state.posted.slice(-200);
if (!DRY) await fs.writeFile(STATE, JSON.stringify(state, null, 1));
