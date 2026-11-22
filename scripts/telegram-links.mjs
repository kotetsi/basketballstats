// Links πρόσκλησης του καναλιού Telegram, ένα για κάθε πηγή, ώστε να φαίνεται από πού έρχονται οι νέοι συνδρομητές
// (στην εφαρμογή Telegram: Κανάλι → Διαχείριση → Σύνδεσμοι πρόσκλησης → πόσοι μπήκαν από τον καθένα).
// Φτιάχνει μόνο όσα λείπουν από το data/telegram-links.json και κρατά μία μέτρηση συνδρομητών την ημέρα στο
// data/telegram-stats.json. Χρειάζεται το bot να είναι διαχειριστής στο κανάλι με δικαίωμα «Πρόσκληση χρηστών».
//   TELEGRAM_TOKEN  token του bot      TELEGRAM_CHAT  κανάλι, π.χ. @eubasketballstats_eu
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = String(process.env.TELEGRAM_TOKEN || '').replace(/\s+/g, ''), CHAT = String(process.env.TELEGRAM_CHAT || '').trim();
if (!TOKEN || !CHAT) { console.log('Telegram links: χωρίς TELEGRAM_TOKEN / TELEGRAM_CHAT, παράλειψη.'); process.exit(0); }

// πηγή → όνομα του link όπως θα φαίνεται στη λίστα του καναλιού (έως 32 χαρακτήρες)
export const SOURCES = {
  site: 'Site · μπάρα ανακοίνωσης',
  picks: 'Site · picks & προγνωστικά',
  fantasy: 'Site · Fantasy',
  inj: 'Site · τραυματίες & μεταγραφές',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  vidcast: 'Vidcast',
  stoixima: 'stoixima.com.gr',
};

const LINKS = path.join(ROOT, 'data', 'telegram-links.json'), STATS = path.join(ROOT, 'data', 'telegram-stats.json');
const readJ = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const api = async (method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
  return j.result;
};

const links = await readJ(LINKS, {});
let made = 0;
for (const [k, name] of Object.entries(SOURCES)) {
  if (links[k]) continue;
  try { const r = await api('createChatInviteLink', { chat_id: CHAT, name: name.slice(0, 32) }); links[k] = r.invite_link; made++; console.log('Telegram links: νέο', k); }
  catch (e) { console.log('Telegram links:', e.message, '(το bot πρέπει να είναι διαχειριστής με δικαίωμα πρόσκλησης)'); break; }
}
if (made) await fs.writeFile(LINKS, JSON.stringify(links, null, 1) + '\n');

// μία μέτρηση συνδρομητών την ημέρα (ώρα Αθήνας)
try {
  const n = await api('getChatMemberCount', { chat_id: CHAT });
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Athens' });
  const st = await readJ(STATS, { daily: [] });
  const last = st.daily.at(-1);
  if (last && last.d === day) last.n = n; else st.daily.push({ d: day, n });
  st.daily = st.daily.slice(-400);
  await fs.writeFile(STATS, JSON.stringify(st, null, 1) + '\n');
  console.log('Telegram: συνδρομητές', n);
} catch (e) { console.log('Telegram stats:', e.message); }
