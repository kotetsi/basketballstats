// Posts to the BasketballStats Telegram channel: the round preview (schedule + parlay) before the round
// and the results after it. Runs at the end of every GitHub Actions build; does nothing without the two secrets.
//   TELEGRAM_TOKEN  bot token from @BotFather      TELEGRAM_CHAT  channel, e.g. @basketballstats_gr
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.TELEGRAM_TOKEN, CHAT = process.env.TELEGRAM_CHAT;
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
const RG = '<i>21+ · Παίξτε υπεύθυνα. Οι εκτιμήσεις είναι στατιστικές και δεν αποτελούν συμβουλή στοιχήματος.</i>';

async function send(text) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: false }) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error('Telegram: ' + (j.description || r.status));
}

const posts = [];
// 1. results of the last completed round
const done = [...new Set(games.map(g => g[0]))].filter(r => games.filter(g => g[0] === r).every(g => g[6]));
const lastDone = done.length ? Math.max(...done) : 0;
if (lastDone && !state.posted.includes('res-' + lastDone)) {
  const L = games.filter(g => g[0] === lastDone).map(g => `${g[4] > g[5] ? '<b>' + esc(tn(g[2])) + '</b>' : esc(tn(g[2]))} ${g[4]}-${g[5]} ${g[5] > g[4] ? '<b>' + esc(tn(g[3])) + '</b>' : esc(tn(g[3]))}`);
  posts.push({ key: 'res-' + lastDone, text: `🏀 <b>EuroLeague · Τα αποτελέσματα της ${lastDone}ης αγωνιστικής</b>\n\n${L.join('\n')}\n\n📊 Η αγωνιστική σε αριθμούς: ${SITE}/arthra/agonistiki-${lastDone}-se-arithmous/\n📈 Βαθμολογία και πιθανότητες playoffs: ${SITE}/` });
}
// 2. preview of the next round, from 36 hours before its first game
const next = games.find(g => !g[6]);
if (next) {
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
await fs.writeFile(STATE, JSON.stringify(state, null, 1));
