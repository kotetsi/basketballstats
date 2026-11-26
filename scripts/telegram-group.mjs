// Ομάδα συζήτησης του καναλιού Telegram (η ομάδα που είναι συνδεδεμένη με το @eubasketballstats_eu ως «Συζήτηση»).
// Τρέχει από το workflow «Social καθημερινά» (12:10 και 18:10 ώρα Ελλάδας). Χωρίς token ή χωρίς συνδεδεμένη ομάδα δεν κάνει τίποτα.
//   1. Μέρα αγώνων: ένα μήνυμα «Σήμερα στη EuroLeague» με τις πιθανότητες του μοντέλου και μία δημοσκόπηση
//      «Ποιος κερδίζει;» ανά αγώνα, μία φορά την ημέρα, πριν από το πρώτο τζάμπολ.
//   2. Την επόμενη μέρα: τα τελικά σκορ, με ✅/❌ για το φαβορί του μοντέλου (όπως ήταν πριν από τον αγώνα) και τον απολογισμό.
// Η ομάδα βρίσκεται αυτόματα από το κανάλι (getChat → linked_chat_id)· το bot πρέπει να είναι διαχειριστής της ομάδας.
//   TELEGRAM_TOKEN  token του bot    TELEGRAM_CHAT  κανάλι, π.χ. @eubasketballstats_eu
//   TELEGRAM_GROUP  (προαιρετικό) id ή @username της ομάδας, αν δεν θέλουμε την αυτόματη εύρεση
//   SOCIAL_DATA=dist/assets/data.json  τοπικά δεδομένα · TELEGRAM_DRY=1 μόνο εμφάνιση · TG_NOW=ISO ώρα για δοκιμή
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://basketballstats.eu';
const TOKEN = String(process.env.TELEGRAM_TOKEN || '').replace(/\s+/g, ''), CHAT = String(process.env.TELEGRAM_CHAT || '').trim();
const DRY = process.env.TELEGRAM_DRY === '1';
const STATE = path.join(ROOT, 'data', 'telegram-group.json');
const RG = '<i>21+ | Παίζουμε υπεύθυνα. Πιθανότητες από στατιστικό μοντέλο, όχι εγγύηση ούτε συμβουλή στοιχήματος.</i>';

const readJ = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const gameDate = w => new Date(Date.UTC(2020 + (+w[8]), +w.slice(0, 2) - 1, +w.slice(2, 4), +w.slice(4, 6), +w.slice(6, 8)));
export const athensDay = d => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
const hhmm = d => d.toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const athensHour = d => +d.toLocaleString('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' });
const pct = p => `${Math.round(p * 100)}%`;

/** Τι πρέπει να σταλεί τώρα στην ομάδα. Καθαρή συνάρτηση (χωρίς δίκτυο), για τα τεστ. */
export function groupPlan(data, state, now) {
  const tn = c => (data.teams[c] ? data.teams[c][0] : c);
  const games = data.league.games, today = athensDay(now), out = [];
  const key = g => `${g[0]}-${g[2]}-${g[3]}`;
  const hr = athensHour(now);
  if (hr < 9 || hr >= 23) return out;   // όχι μηνύματα νύχτα

  // 2. αποτελέσματα: αγώνες που τελείωσαν και είχαν μπει στο «Σήμερα», μία φορά ανά μέρα αγώνων
  for (const day of [...new Set(Object.values(state.mp || {}).map(x => x.day))].sort()) {
    if (day >= today || (state.done || []).includes('res-' + day)) continue;
    const G = games.filter(g => state.mp[key(g)]?.day === day);
    if (!G.length || !G.every(g => g[6])) continue;   // περιμένουμε να τελειώσουν όλοι οι αγώνες της μέρας
    let hits = 0, n = 0;
    const L = G.map(g => {
      const m = state.mp[key(g)], line = `${g[4] > g[5] ? '<b>' + esc(tn(g[2])) + '</b>' : esc(tn(g[2]))} ${g[4]}-${g[5]} ${g[5] > g[4] ? '<b>' + esc(tn(g[3])) + '</b>' : esc(tn(g[3]))}`;
      if (m.ph == null) return line;
      const favHome = m.ph >= 0.5, ok = favHome === (g[4] > g[5]); n++; if (ok) hits++;
      return `${line} ${ok ? '✅' : '❌'} <i>(μοντέλο: ${esc(tn(favHome ? g[2] : g[3]))} ${pct(Math.max(m.ph, 1 - m.ph))})</i>`;
    });
    const tot = state.tally || { hits: 0, n: 0 };
    out.push({ kind: 'res', day, hits, n, text: `📋 <b>Τα αποτελέσματα της ${dayLabel(day)}</b>\n\n${L.join('\n')}${n ? `\n\nΤο φαβορί του μοντέλου κέρδισε σε <b>${hits} από ${n}</b>· από την αρχή στην ομάδα: ${tot.hits + hits}/${tot.n + n}.` : ''}\n\nΠοιο ματς σας εξέπληξε; 👇` });
  }

  // 1. σήμερα: μία φορά, πριν από το πρώτο τζάμπολ της μέρας
  const T = games.filter(g => !g[6] && athensDay(gameDate(g[1])) === today).sort((a, b) => gameDate(a[1]) - gameDate(b[1]));
  if (T.length && gameDate(T[0][1]) > now && !(state.done || []).includes('day-' + today)) {
    const rows = T.map(g => ({ g, ph: data.mp?.[`${g[2]}|${g[3]}`]?.[2] ?? null }));
    const L = rows.map(({ g, ph }) => `🕗 ${hhmm(gameDate(g[1]))} · ${esc(tn(g[2]))} – ${esc(tn(g[3]))}${ph != null ? `: <b>${pct(ph)} – ${pct(1 - ph)}</b>` : ''}`);
    out.push({ kind: 'day', day: today, rows, text: `🏀 <b>Σήμερα στη EuroLeague</b> · ${T[0][0]}η αγωνιστική\n\n${L.join('\n')}\n\n<i>Οι πιθανότητες νίκης είναι του μοντέλου μας.</i> Εσείς τι λέτε; Ψηφίστε παρακάτω και γράψτε την άποψή σας 👇\n\n🔮 Όλες οι προβλέψεις: ${SITE}/prognostika/\n\n${RG}`,
      polls: rows.map(({ g }) => ({ q: `Ποιος κερδίζει; ${tn(g[2])} – ${tn(g[3])} (${hhmm(gameDate(g[1]))})`.slice(0, 300), o: [tn(g[2]), tn(g[3])] })) });
  }
  return out;
}
function dayLabel(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' }); }

async function api(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);   // το μήνυμα δεν περιέχει το token
  return j.result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!TOKEN || !CHAT) { console.log('Ομάδα Telegram: χωρίς TELEGRAM_TOKEN / TELEGRAM_CHAT, παράλειψη.'); process.exit(0); }
  let GROUP = String(process.env.TELEGRAM_GROUP || '').trim();
  if (!GROUP) {
    try { GROUP = String((await api('getChat', { chat_id: CHAT })).linked_chat_id || ''); } catch (e) { console.log(e.message); }
    if (!GROUP) { console.log('Ομάδα Telegram: το κανάλι δεν έχει συνδεδεμένη ομάδα συζήτησης ακόμα, παράλειψη.'); process.exit(0); }
  }
  const data = process.env.SOCIAL_DATA ? JSON.parse(await fs.readFile(process.env.SOCIAL_DATA, 'utf8')) : await (await fetch(`${SITE}/assets/data.json?t=${Date.now()}`)).json();
  const state = await readJ(STATE, { mp: {}, done: [], tally: { hits: 0, n: 0 } });
  const now = process.env.TG_NOW ? new Date(process.env.TG_NOW) : new Date();
  for (const p of groupPlan(data, state, now)) {
    try {
      if (DRY) { console.log(`--- ${p.kind} (δοκιμή)\n${p.text}`); for (const q of p.polls || []) console.log('[δημοσκόπηση]', q.q, q.o.join(' / ')); }
      else await api('sendMessage', { chat_id: GROUP, text: p.text, parse_mode: 'HTML', disable_web_page_preview: true });
      // μετά το μήνυμα η μέρα μετράει ως σταλμένη, ώστε μια αποτυχημένη δημοσκόπηση να μη διπλασιάσει το μήνυμα
      if (!DRY) for (const q of p.polls || []) await api('sendPoll', { chat_id: GROUP, question: q.q, options: q.o.map(text => ({ text })), is_anonymous: true }).catch(e => console.error('Ομάδα Telegram: δημοσκόπηση', e.message));
      state.done = [...(state.done || []), `${p.kind}-${p.day}`].slice(-120);
      if (p.kind === 'day') for (const { g, ph } of p.rows) state.mp[`${g[0]}-${g[2]}-${g[3]}`] = { day: p.day, ph };
      if (p.kind === 'res') { state.tally = { hits: (state.tally?.hits || 0) + p.hits, n: (state.tally?.n || 0) + p.n }; for (const k of Object.keys(state.mp)) if (state.mp[k].day === p.day) delete state.mp[k]; }
      console.log(DRY ? 'Ομάδα Telegram (δοκιμή):' : 'Ομάδα Telegram: στάλθηκε', p.kind, p.day);
    } catch (e) { console.error('Ομάδα Telegram:', e.message); }
  }
  if (!DRY) await fs.writeFile(STATE, JSON.stringify(state, null, 1) + '\n');
}
