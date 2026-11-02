// BasketballStats — ενημέρωση δεδομένων και παραγωγή στατικών σελίδων.
// Χρήση:  node build.mjs            (τραβάει νέα δεδομένα από την Ευρωλίγκα)
//         node build.mjs --offline  (χρησιμοποιεί τα αποθηκευμένα δεδομένα)
// Ρυθμίσεις (μεταβλητές περιβάλλοντος):
//   SITE_URL   η διεύθυνση του site, π.χ. https://basketballstats.eu   (για sitemap/canonical)
//   SITE_BASE  αν το site μπει σε υποφάκελο, π.χ. /stats/      (προεπιλογή /)
//   SEASON     κωδικός σεζόν της Ευρωλίγκας                    (προεπιλογή E2026)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translate, APP_CODE, SHELL_CODE } from './src/en.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONF = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8').catch(() => '{}'));
const SITE_URL = (process.env.SITE_URL || CONF.siteUrl || 'https://example.gr').replace(/\/$/, '');
let BASE = process.env.SITE_BASE || CONF.base || '/';
if (!BASE.endsWith('/')) BASE += '/';
const SEASON = process.env.SEASON || CONF.season || 'E2026';
const SITE_NAME = CONF.siteName || 'BasketballStats';
const AD_CLIENT = (process.env.ADSENSE_CLIENT || CONF.adsenseClient || '').trim();
const AD_SLOT = (process.env.ADSENSE_SLOT || CONF.adsenseSlot || '').trim();
const SEASON_LABEL = `${+SEASON.slice(1)}-${String(+SEASON.slice(1) + 1).slice(2)}`;
const OFFLINE = process.argv.includes('--offline');
const OUT = path.join(ROOT, 'dist');
const CACHE = path.join(ROOT, 'data', 'cache.json');
const FEED = 'https://feeds.incrowdsports.com/provider/euroleague-feeds';

// Ομάδες: κωδικός Ευρωλίγκας → [ελληνικό όνομα, χρώμα, slug, αγγλικό όνομα, αγγλικό slug]
const TEAMS = {
  OLY: ['Ολυμπιακός', '#c8102e', 'olympiakos', 'Olympiacos', 'olympiacos'], PAN: ['Παναθηναϊκός', '#007a3d', 'panathinaikos', 'Panathinaikos', 'panathinaikos'],
  MAD: ['Ρεάλ Μαδρίτης', '#5b4a9b', 'real-madrite', 'Real Madrid', 'real-madrid'], ULK: ['Φενέρμπαχτσε', '#1d3c8f', 'fenerbahce', 'Fenerbahce', 'fenerbahce'],
  PAR: ['Παρτιζάν', '#3b3b3b', 'partizan', 'Partizan', 'partizan'], RED: ['Ερυθρός Αστέρας', '#b3122e', 'erythros-asteras', 'Crvena Zvezda', 'crvena-zvezda'],
  BAR: ['Μπαρτσελόνα', '#a50044', 'barcelona', 'Barcelona', 'barcelona'], ASV: ['Βιλερμπάν', '#1a1a1a', 'villeurbanne', 'ASVEL', 'asvel'],
  ZAL: ['Ζαλγκίρις', '#00703c', 'zalgiris', 'Zalgiris', 'zalgiris'], HTA: ['Χάποελ Τελ Αβίβ', '#d71920', 'hapoel-tel-aviv', 'Hapoel Tel Aviv', 'hapoel-tel-aviv'],
  VIR: ['Βίρτους Μπολόνια', '#222222', 'virtus-bolonia', 'Virtus Bologna', 'virtus-bologna'], BES: ['Μπεσίκτας', '#2a2a2a', 'besiktas', 'Besiktas', 'besiktas'],
  BAS: ['Μπασκόνια', '#1b3a6b', 'baskonia', 'Baskonia', 'baskonia'], MIL: ['Αρμάνι Μιλάνο', '#c8102e', 'armani-milano', 'Olimpia Milano', 'olimpia-milano'],
  DUB: ['Ντουμπάι', '#0a6e8a', 'ntoumpai', 'Dubai Basketball', 'dubai'], PAM: ['Βαλένθια', '#e46b11', 'valenthia', 'Valencia Basket', 'valencia'],
  TEL: ['Μακάμπι Τελ Αβίβ', '#d9a400', 'makampi-tel-aviv', 'Maccabi Tel Aviv', 'maccabi-tel-aviv'], IST: ['Αναντολού Εφές', '#003b7a', 'anadolou-efes', 'Anadolu Efes', 'anadolu-efes'],
  PRS: ['Παρί', '#2b2b2b', 'pari', 'Paris Basketball', 'paris'], MUN: ['Μπάγερν', '#c8102e', 'bayern', 'Bayern Munich', 'bayern-munich'],
};

// Γλώσσες: τα ελληνικά στη ρίζα του site, τα αγγλικά στο /en/
const LANGS = ['el', 'en'];
const PATHS = {
  el: { team: 'omada', player: 'paiktis', form: 'thermometro', fantasy: 'fantasy', preds: 'prognostika', articles: 'arthra', tipsters: 'tipsters', legal: 'politiki-aporritou', app: 'efarmogi' },
  en: { team: 'team', player: 'player', form: 'thermometer', fantasy: 'fantasy', preds: 'predictions', articles: 'articles', tipsters: 'tipsters', legal: 'privacy', app: 'app' },
};
const ordEn = n => { const t = n % 100; return n + (t > 10 && t < 14 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th')); };

// ---------- βοηθητικά
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch (e) { /* retry */ }
    await sleep(1500 * (i + 1));
  }
  throw new Error('Αποτυχία λήψης: ' + url);
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const GR = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
const slugify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[α-ω]/g, c => GR[c] || '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function niceName(n) {
  const [a, b] = n.split(',').map(s => s.trim());
  const cap = s => s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
  return b ? cap(b) + ' ' + cap(a) : cap(a);
}
const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : '–');
const teamName = c => c.split(';').map(x => (TEAMS[x] || [x])[0]).join(' / ');


// ---------- άρθρα (Markdown στον φάκελο articles/)
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${u.replace(/"/g, '%22')}">${t}</a>`);
}
function markdown(md) {
  const out = []; let list = null, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } if (list) { out.push(`<${list.t}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.t}>`); list = null; } };
  for (const raw of md.split(/\r?\n/)) {
    const l = raw.trimEnd();
    let m;
    if (!l.trim()) { flush(); continue; }
    if ((m = l.match(/^(#{2,3})\s+(.*)/))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = l.match(/^>\s?(.*)/))) { flush(); out.push(`<blockquote><p>${inline(m[1])}</p></blockquote>`); continue; }
    if ((m = l.match(/^[-*]\s+(.*)/)) || (m = l.match(/^\d+[.)]\s+(.*)/))) {
      const t = /^\d/.test(l) ? 'ol' : 'ul';
      if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
      if (!list || list.t !== t) { if (list) flush(); list = { t, items: [] }; }
      list.items.push(m[1]); continue;
    }
    if (list) flush();
    para.push(l.trim());
  }
  flush();
  return out.join('\n');
}

// ---------- Tipsters (ένα αρχείο .md ανά tipster στον φάκελο tipsters/)
// Γραμμή επιλογής:  αγωνιστική | ΓΗΠ-ΦΙΛ | επιλογή | απόδοση (προαιρετική)
// Επιλογές: 1, 2, 1 -5.5, 2 +7.5, over 160.5, under 160.5
const PROP_STATS = { 'πόντοι': 'pts', 'ποντοι': 'pts', 'πόντους': 'pts', 'pts': 'pts', 'points': 'pts', 'ριμπάουντ': 'reb', 'ριμπαουντ': 'reb', 'reb': 'reb', 'rebounds': 'reb',
  'ασίστ': 'ast', 'ασιστ': 'ast', 'ast': 'ast', 'assists': 'ast', 'τρίποντα': '3pm', 'τριποντα': '3pm', '3pm': '3pm', 'pir': 'pir' };
const PROP_LABEL = { el: { pts: 'πόντοι', reb: 'ριμπάουντ', ast: 'ασίστ', '3pm': 'τρίποντα', pir: 'PIR' }, en: { pts: 'points', reb: 'rebounds', ast: 'assists', '3pm': '3-pointers', pir: 'PIR' } };
const propValue = (stat, r) => stat === 'pts' ? r[8] : stat === 'reb' ? r[15] + r[16] : stat === 'ast' ? r[17] : stat === '3pm' ? r[11] : r[25];
function parsePick(sel) {
  const s = sel.trim().toLowerCase().replace(',', '.');
  let m;
  // ατομικά: "Norris πόντοι 10+", "Norris πόντοι over 9.5", "Miles Norris ριμπάουντ under 4.5"
  if ((m = s.match(/^(.+?)\s+(\S+)\s+(\d+)\s*\+$/)) && PROP_STATS[m[2]]) return { kind: 'prop', who: m[1], stat: PROP_STATS[m[2]], min: +m[3] };
  if ((m = s.match(/^(.+?)\s+(\S+)\s+(over|under|o|u|πάνω|πανω|κάτω|κατω)\s*(\d+(?:\.\d+)?)$/)) && PROP_STATS[m[2]])
    return { kind: 'prop', who: m[1], stat: PROP_STATS[m[2]], over: /^(over|o|πάνω|πανω)$/.test(m[3]), line: parseFloat(m[4]) };
  if (/^[12]$/.test(s)) return { kind: 'ml', side: +s };
  if ((m = s.match(/^([12])\s*([+-]\s*\d+(?:\.\d+)?)$/))) return { kind: 'hc', side: +m[1], line: parseFloat(m[2].replace(/\s/g, '')) };
  if ((m = s.match(/^(over|under|o|u|πάνω|πανω|κάτω|κατω)\s*(\d+(?:\.\d+)?)$/))) return { kind: 'tot', over: /^(over|o|πάνω|πανω)$/.test(m[1]), line: parseFloat(m[2]) };
  return null;
}
function pickLabel(p, h, a, lg) {
  const tn = c => (TEAMS[c] || [c, 0, 0, c])[lg === 'en' ? 3 : 0], L = PROP_LABEL[lg];
  if (p.kind === 'prop') return p.min != null ? `${p.name} ${p.min}+ ${L[p.stat]}` : `${p.name} ${p.over ? 'over' : 'under'} ${p.line} ${L[p.stat]}`;
  if (p.kind === 'ml') return lg === 'en' ? `${tn(p.side === 1 ? h : a)} to win` : `Νίκη ${tn(p.side === 1 ? h : a)}`;
  if (p.kind === 'hc') return `${tn(p.side === 1 ? h : a)} ${p.line > 0 ? '+' : ''}${p.line}`;
  return `${p.over ? 'Over' : 'Under'} ${p.line} ${lg === 'en' ? 'points' : 'πόντοι'}`;
}
function gradePick(p, hs, as) {
  let v;
  if (p.kind === 'ml') v = p.side === 1 ? hs - as : as - hs;
  else if (p.kind === 'hc') v = (p.side === 1 ? hs - as : as - hs) + p.line;
  else v = p.over ? hs + as - p.line : p.line - (hs + as);
  return v > 0 ? 'W' : v < 0 ? 'L' : 'P';
}
async function loadTipsters(games, players) {
  const dir = path.join(ROOT, 'tipsters');
  let files = [];
  try { files = (await fs.readdir(dir)).filter(f => f.endsWith('.md') && !f.startsWith('_')); } catch { return []; }
  const out = [];
  for (const f of files) {
    const txt = await fs.readFile(path.join(dir, f), 'utf8');
    const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const meta = {}; let body = txt;
    if (m) { body = m[2]; for (const line of m[1].split(/\r?\n/)) { const k = line.match(/^(\w+):\s*(.*)$/); if (k) meta[k[1]] = k[2].replace(/^["']|["']$/g, '').trim(); } }
    const name = meta.name || f.replace(/\.md$/, '');
    const slug = meta.slug || slugify(name) || slugify(f.replace(/\.md$/, ''));
    const picks = [], errors = [];
    let cur = null; // η τελευταία επιλογή: οι γραμμές κειμένου από κάτω της είναι η ανάλυσή της
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith('#')) continue;
      // «EN:» σε δική του γραμμή (ή στην αρχή γραμμής): από εκεί και κάτω η αγγλική ανάλυση
      const en = line.match(/^(?:EN|English)\s*:\s*(.*)$/i);
      if (en && cur) { cur.lang = 'en'; if (en[1]) cur.text.en.push(en[1]); continue; }
      if (!line.includes('|')) { if (cur) cur.text[cur.lang].push(line); continue; }
      cur = null;
      const parts = line.split('|').map(x => x.trim());
      const round = parseInt(parts[0], 10);
      const gm = (parts[1] || '').toUpperCase().match(/^([A-Z]{3})\s*-\s*([A-Z]{3})$/);
      const p = parsePick(parts[2] || '');
      const odds = parts[3] ? parseFloat(parts[3].replace(',', '.')) : null;
      if (!round || !gm || !p) { errors.push(line + '  (δεν διαβάστηκε: έλεγξε τη μορφή)'); continue; }
      const [, h, a] = gm;
      const g = games.find(x => x[0] === round && x[2] === h && x[3] === a);
      let res = 'pending';
      if (p.kind === 'prop') {
        const words = p.who.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/);
        const cands = players.filter(x => [h, a].includes(x.t.split(';').pop()) || x.t.split(';').some(t => t === h || t === a))
          .filter(x => { const nm = x.n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return words.every(w => nm.includes(w)); });
        if (cands.length !== 1) { errors.push(line + (cands.length ? '  (βρέθηκαν πολλοί παίκτες με αυτό το όνομα: γράψε και το μικρό όνομα)' : '  (δεν βρέθηκε παίκτης με αυτό το όνομα στις δύο ομάδες)')); continue; }
        p.player = cands[0]; p.name = niceName(cands[0].n);
      }
      if (!g) { res = 'unknown'; errors.push(line + '  (δεν βρέθηκε αυτός ο αγώνας σε αυτή την αγωνιστική: έλεγξε ποιος είναι γηπεδούχος)'); }
      else if (g[6] && p.kind === 'prop') {
        const row = p.player.g.find(r => r[0] === round && r[7] > 0);
        if (!row) res = 'P'; // δεν αγωνίστηκε: η επιλογή ακυρώνεται
        else { const v = propValue(p.stat, row); const d = p.min != null ? v - p.min + 0.5 : (p.over ? v - p.line : p.line - v); res = d > 0 ? 'W' : d < 0 ? 'L' : 'P'; p.val = v; }
      }
      else if (g[6]) res = gradePick(p, g[4], g[5]);
      cur = { round, h, a, text: { el: [], en: [] }, lang: 'el', label: { el: pickLabel(p, h, a, 'el'), en: pickLabel(p, h, a, 'en') }, odds: odds && odds > 1 ? odds : null, res,
        score: g && g[6] ? `${g[4]}-${g[5]}` : '', val: p.kind === 'prop' && p.val != null ? p.val : null, stat: p.stat, date: g ? g[1] : '' };
      picks.push(cur);
    }
    picks.forEach((x, i) => {
      x.id = `${x.round}-${x.h}-${x.a}-${i + 1}`.toLowerCase();
      x.url = { el: BASE + 'tipsters/' + slug + '/' + x.id + '/', en: BASE + 'en/tipsters/' + slug + '/' + x.id + '/' };
      x.html = {}; x.excerpt = {};
      for (const lg of LANGS) {
        const tx = x.text[lg];
        x.html[lg] = tx.join('\n').trim() ? markdown(tx.join('\n')) : '';
        x.excerpt[lg] = tx.filter(Boolean).join(' ').replace(/[*#>\[\]]/g, '').slice(0, 155);
      }
      delete x.text; delete x.lang;
    });
    if (errors.length) console.warn(`Tipster ${name}: ${errors.length} γραμμές με πρόβλημα:`, errors);
    const settled = picks.filter(x => x.res === 'W' || x.res === 'L');
    const W = settled.filter(x => x.res === 'W').length, L = settled.length - W;
    const withOdds = picks.filter(x => x.odds && (x.res === 'W' || x.res === 'L' || x.res === 'P'));
    const units = withOdds.reduce((s, x) => s + (x.res === 'W' ? x.odds - 1 : x.res === 'L' ? -1 : 0), 0);
    const staked = withOdds.filter(x => x.res !== 'P').length;
    picks.sort((x, y) => y.round - x.round || (y.date || '').localeCompare(x.date || ''));
    out.push({ name, slug, bio: meta.bio || '', bioEn: meta.bio_en || '', picks, W, L, P: picks.filter(x => x.res === 'P').length,
      pending: picks.filter(x => x.res === 'pending').length, pct: settled.length ? W / settled.length : null,
      units, roi: staked ? units / staked : null, form: picks.filter(x => x.res === 'W' || x.res === 'L').slice(0, 5).map(x => x.res).join('') });
  }
  return out.sort((x, y) => (y.units - x.units) || ((y.pct ?? -1) - (x.pct ?? -1)));
}

async function loadArticles() {
  const dir = path.join(ROOT, 'articles');
  let files = [];
  try { files = (await fs.readdir(dir)).filter(f => f.endsWith('.md') && !f.startsWith('_')); } catch { return []; }
  const list = [];
  for (const f of files) {
    const txt = await fs.readFile(path.join(dir, f), 'utf8');
    const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const meta = {}; let body = txt;
    if (m) { body = m[2]; for (const line of m[1].split(/\r?\n/)) { const k = line.match(/^(\w+):\s*(.*)$/); if (k) meta[k[1]] = k[2].replace(/^["']|["']$/g, '').trim(); } }
    if (!meta.title || meta.draft === 'true') continue;
    // η αγγλική εκδοχή (προαιρετική) μπαίνει κάτω από τη γραμμή === English ===
    const [bodyEl, bodyEn] = body.split(/^\s*={3,}\s*(?:english|en)\s*={3,}\s*$/im);
    const slug = meta.slug || slugify(meta.title) || slugify(f.replace(/\.md$/, ''));
    const date = meta.date || '';
    const dateOf = loc => (date ? new Date(date + 'T12:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
    const a = { type: meta.type === 'prognostiko' ? 'prognostiko' : 'arthro', round: meta.round ? +meta.round : null, game: (meta.game || '').toUpperCase(), author: meta.author || '', date,
      el: { title: meta.title, desc: meta.description || '', slug, dateText: dateOf('el-GR'), url: BASE + 'arthra/' + slug + '/', html: markdown(bodyEl) } };
    if (meta.title_en && bodyEn && bodyEn.trim()) {
      const se = meta.slug_en || slugify(meta.title_en) || slug;
      a.en = { title: meta.title_en, desc: meta.description_en || '', slug: se, dateText: dateOf('en-GB'), url: BASE + 'en/articles/' + se + '/', html: markdown(bodyEn) };
    }
    list.push(a);
  }
  return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// ---------- λήψη δεδομένων από τα δημόσια feeds της Ευρωλίγκας
async function fetchAll() {
  const q = `seasonMode=Single&seasonCode=${SEASON}&limit=500`;
  const [trad, adv, misc, gamesRes] = await Promise.all([
    get(`${FEED}/v3/competitions/E/statistics/players/traditional?${q}&statisticMode=PerGame`),
    get(`${FEED}/v3/competitions/E/statistics/players/advanced?${q}&statisticMode=PerGame`),
    get(`${FEED}/v3/competitions/E/statistics/players/misc?${q}&statisticMode=PerGame`),
    get(`${FEED}/v2/competitions/E/seasons/${SEASON}/games?limit=500`),
  ]);
  const advM = Object.fromEntries((adv?.players || []).map(p => [p.player.code, p]));
  const miscM = Object.fromEntries((misc?.players || []).map(p => [p.player.code, p]));
  const list = trad?.players || [];
  console.log(`Παίκτες: ${list.length}. Λήψη αγώνων ανά παίκτη…`);

  const players = (await pool(list, 8, async p => {
    const c = p.player.code, tc = p.player.team.code;
    const [bio, st] = await Promise.all([
      get(`${FEED}/v2/competitions/E/seasons/${SEASON}/people/${c}`).catch(() => null),
      get(`${FEED}/v2/competitions/E/seasons/${SEASON}/people/${c}/stats`),
    ]);
    if (!st) return null;
    const b = bio?.data?.find(x => x.type === 'J') || bio?.data?.[0];
    const per = b?.person || {};
    const g = (st.games || []).filter(x => x.game.played).map(x => {
      const G = x.game, s = x.stats;
      const home = G.local.club.code === tc; const me = home ? G.local : G.road, op = home ? G.road : G.local;
      return [G.round, G.utcDate.slice(0, 10), op.club.code, home ? 1 : 0, me.score, op.score, s.startFive ? 1 : 0, Math.round(s.timePlayed || 0),
        s.points, s.fieldGoalsMade2, s.fieldGoalsAttempted2, s.fieldGoalsMade3, s.fieldGoalsAttempted3, s.freeThrowsMade, s.freeThrowsAttempted,
        s.offensiveRebounds, s.defensiveRebounds, s.assistances, s.steals, s.turnovers, s.blocksFavour, s.blocksAgainst,
        s.foulsCommited, s.foulsReceived, s.plusMinus, s.valuation].map(v => (v == null ? 0 : v));
    });
    const a = advM[c] || {}, m = miscM[c] || {};
    return { c, n: p.player.name, t: tc, age: p.player.age, h: per.height || null, w: per.weight || null,
      bd: (per.birthDate || '').slice(0, 10), ct: per.country?.name || '', pos: b?.positionName || '', no: b?.dorsal || '',
      poss: a.possesions || 0, dd: m.doubleDoubles || 0, td: m.tripleDoubles || 0, g };
  })).filter(Boolean);

  const games = (gamesRes?.data || []).map(x => {
    const d = x.date; // 2026-11-04T19:45:00.000Z
    const enc = d.slice(5, 7) + d.slice(8, 10) + d.slice(11, 13) + d.slice(14, 16) + d.slice(3, 4);
    return [x.round.round, enc, x.home.code, x.away.code, x.home.score, x.away.score, x.status === 'result' ? 1 : 0];
  }).sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));

  const playedRounds = games.filter(g => g[6]).map(g => g[0]);
  const lastRound = playedRounds.length ? Math.max(...playedRounds) : 0;
  let stand = [];
  if (lastRound) {
    const st = await get(`${FEED}/v3/competitions/E/seasons/${SEASON}/rounds/${lastRound}/basicstandings`);
    stand = (st?.teams || []).map(t => [t.position, t.club.code, t.gamesWon, t.gamesLost, t.pointsFor, t.pointsAgainst,
      t.homeRecord, t.awayRecord, (t.last5Form || []).join(''), t.positionChange]);
  }
  return { players, league: { stand, games }, lastRound, fetchedAt: new Date().toISOString() };
}

// ---------- σελίδες
function playerSummary(p) {
  const g = p.g.filter(r => r[7] > 0); const G = g.length || 1;
  const sum = i => g.reduce((s, r) => s + r[i], 0);
  return { G: g.length, pts: sum(8) / G, reb: (sum(15) + sum(16)) / G, ast: sum(17) / G, pir: sum(25) / G };
}

async function main() {
  let data;
  if (!OFFLINE) {
    try { data = await fetchAll(); }
    catch (e) { console.error('Η λήψη απέτυχε, χρησιμοποιώ τα αποθηκευμένα δεδομένα.', e.message); }
  }
  if (!data || !data.players.length) {
    data = JSON.parse(await fs.readFile(CACHE, 'utf8'));
    console.log('Χρήση αποθηκευμένων δεδομένων από', data.fetchedAt);
  } else {
    await fs.mkdir(path.dirname(CACHE), { recursive: true });
    await fs.writeFile(CACHE, JSON.stringify(data));
  }
  const { players, league } = data;
  const lastRound = data.lastRound || Math.max(0, ...league.games.filter(g => g[6]).map(g => g[0]));

  // slugs παικτών (μοναδικά, ίδια και στις δύο γλώσσες)
  const used = new Set();
  for (const p of players) {
    let s = slugify(niceName(p.n)) || p.c;
    if (used.has(s)) s += '-' + p.c;
    used.add(s); p.s = s;
  }
  const athens = new Date(data.fetchedAt).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'numeric', year: 'numeric' });
  const athensEn = new Date(data.fetchedAt).toLocaleDateString('en-GB', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', year: 'numeric' });
  const UPD = { el: `${athens} · έως και την ${lastRound}η αγωνιστική`, en: `${athensEn} · through Round ${lastRound}` };

  // καθαρισμός και αρχεία
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, 'assets'), { recursive: true });
  const articles = await loadArticles();
  const tipsters = await loadTipsters(league.games, players);
  const pendingTips = lg => tipsters.flatMap(t => t.picks.filter(p => p.res === 'pending').map(p => ({ g: p.h + '-' + p.a, r: p.round, n: t.name, s: t.slug, l: p.label[lg], u: p.url[lg] })));
  const artList = lg => articles.filter(a => a[lg]).map(a => ({ title: a[lg].title, desc: a[lg].desc, type: a.type, round: a.round, game: a.game, author: a.author, date: a.date, dateText: a[lg].dateText, slug: a[lg].slug, url: a[lg].url }));
  await fs.writeFile(path.join(OUT, 'assets', 'data.json'), JSON.stringify({ updated: UPD.el, teams: TEAMS, players, league,
    articles: artList('el'), tips: pendingTips('el'),
    en: { updated: UPD.en, articles: artList('en'), tips: pendingTips('en') } }));
  const appSrc = await fs.readFile(path.join(ROOT, 'src', 'app.js'), 'utf8');
  await fs.writeFile(path.join(OUT, 'assets', 'app.js'), appSrc);
  await fs.writeFile(path.join(OUT, 'assets', 'app.en.js'), translate(appSrc, APP_CODE, 'app.js'));
  await fs.copyFile(path.join(ROOT, 'src', 'app.css'), path.join(OUT, 'assets', 'app.css'));
  const shellSrc = await fs.readFile(path.join(ROOT, 'src', 'shell.html'), 'utf8');
  const SHELL = { el: shellSrc, en: translate(shellSrc, SHELL_CODE, 'shell.html') };
  const ver = Date.now().toString(36);

  // ---- διευθύνσεις: κάθε σελίδα έχει ένα κλειδί και μία διεύθυνση ανά γλώσσα
  const B = lg => (lg === 'el' ? BASE : BASE + 'en/');
  const artBySlug = Object.fromEntries(articles.map(a => [a.el.slug, a]));
  function urlFor(lg, key) {
    const [k, v] = key.split(':');
    const P = PATHS[lg];
    if (k === 'home') return B(lg);
    if (k === 'team') return B(lg) + P.team + '/' + TEAMS[v][lg === 'el' ? 2 : 4] + '/';
    if (k === 'player') return B(lg) + P.player + '/' + v + '/';
    if (k === 'article') { const a = artBySlug[v]; return a && a[lg] ? a[lg].url : null; }
    if (k === 'tipster') return B(lg) + 'tipsters/' + v + '/';
    if (k === 'pick') return B(lg) + 'tipsters/' + v + '/';
    return B(lg) + P[k] + '/';
  }

  const urls = [];
  const adUnit = lg => (AD_CLIENT && AD_SLOT)
    ? `<div class="wrap adwrap"><span class="adlabel">${lg === 'en' ? 'Advertisement' : 'Διαφήμιση'}</span><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(AD_CLIENT)}" data-ad-slot="${esc(AD_SLOT)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`
    : '';
  const adHead = AD_CLIENT ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(AD_CLIENT)}" crossorigin="anonymous"></script>\n` : '';

  // ---- εφαρμογή (PWA): εικονίδια, manifest ανά γλώσσα, service worker
  for (const f of await fs.readdir(path.join(ROOT, 'src'))) if (/\.(png|svg)$/.test(f)) await fs.copyFile(path.join(ROOT, 'src', f), path.join(OUT, f));
  for (const lg of LANGS) {
    const T = (el, en) => (lg === 'en' ? en : el);
    await fs.mkdir(path.join(OUT, lg === 'el' ? '' : 'en'), { recursive: true });
    await fs.writeFile(path.join(OUT, lg === 'el' ? '' : 'en', 'manifest.webmanifest'), JSON.stringify({
      name: T(`${SITE_NAME}: στατιστικά EuroLeague`, `${SITE_NAME}: EuroLeague stats`), short_name: SITE_NAME, lang: lg, dir: 'ltr',
      description: T('Βαθμολογία, στατιστικά παικτών και ομάδων, Θερμόμετρο φόρμας, Fantasy και προγνωστικά EuroLeague στα ελληνικά.',
        'EuroLeague standings, player and team stats, form thermometer, Fantasy tips and predictions.'),
      id: B(lg), start_url: B(lg) + '?source=app', scope: B(lg), display: 'standalone', orientation: 'portrait',
      background_color: '#1d2330', theme_color: '#1d2330', categories: ['sports'],
      icons: [
        { src: BASE + 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: BASE + 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: BASE + 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
      shortcuts: [
        { name: T('Βαθμολογία', 'Standings'), url: B(lg) },
        { name: 'Fantasy', url: urlFor(lg, 'fantasy') },
        { name: T('Προγνωστικά', 'Predictions'), url: urlFor(lg, 'preds') },
        { name: 'Tipsters', url: urlFor(lg, 'tipsters') }],
    }, null, 1));
  }
  // service worker: πρώτα δίκτυο (για φρέσκα στατιστικά), αν δεν υπάρχει σύνδεση η αποθηκευμένη έκδοση
  await fs.writeFile(path.join(OUT, 'sw.js'), `const C='bs-${ver}', OFF='${urlFor('el', 'app')}', OFF_EN='${urlFor('en', 'app')}';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['${BASE}','${BASE}en/',OFF,OFF_EN,'${BASE}assets/data.json','${BASE}icon-192.png'])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));}return res;})
    .catch(()=>caches.match(r,{ignoreSearch:u.pathname.endsWith('.css')||u.pathname.endsWith('.js')}).then(m=>m||(r.mode==='navigate'?caches.match(u.pathname.startsWith('${BASE}en/')?OFF_EN:OFF):Response.error()))));});
`);
  const pwaStyle = `<style>.only-install{display:none}.can-install .only-install{display:inline-flex}
.appbox{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin:18px 0}
.appbox>div{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px}
.appbox h3{margin:0 0 8px;font-family:var(--display);font-size:20px}
.appbox ol{margin:0;padding-left:20px}.appbox li{margin:4px 0}
.appbtn{align-items:center;gap:8px;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:12px 18px;font:600 16px var(--body);cursor:pointer}
.ioshint{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:50;display:flex;gap:12px;align-items:center;background:#1d2330;color:#f3f1ec;border-radius:12px;padding:12px 10px 12px 12px;box-shadow:0 8px 28px rgba(0,0,0,.35);font-size:14px;line-height:1.35}
.ioshint img{width:42px;height:42px;border-radius:10px;flex:none;box-shadow:0 0 0 1px rgba(255,255,255,.2)}.ioshint span{flex:1}.ioshint b{display:block;font-size:15px}
.ioshint svg{width:15px;height:18px;vertical-align:-3px;color:#e9773f}.ioshint button{background:none;border:0;color:inherit;font-size:26px;line-height:1;padding:4px 8px;cursor:pointer;opacity:.8}
.apphero{display:flex;flex-wrap:wrap;gap:18px;align-items:center}.apphero>div{flex:1 1 260px;min-width:0}.apphero h1{font-size:clamp(26px,7vw,40px);margin:0 0 6px}.apphero img{width:96px;height:96px;border-radius:22px}
.top{position:relative}.brand{padding-right:52px;max-width:100%;box-sizing:border-box}@media (max-width:640px){.brand{flex-wrap:wrap;row-gap:2px}.brand span{flex-basis:100%}}.langsw{position:absolute;right:16px;top:16px;color:var(--band-ink);text-decoration:none;font:600 13px var(--body);letter-spacing:.5px;border:1px solid #3a4152;border-radius:6px;padding:4px 8px;opacity:.85}.langsw:hover{opacity:1;border-color:var(--accent)}@media (min-width:641px){.brand{padding-right:0}.langsw{position:static}}</style>
`;
  const pwaHead = lg => {
    const T = (el, en) => (lg === 'en' ? en : el);
    return `<script>
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('${BASE}sw.js'));
addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.bsInstall=e;document.documentElement.classList.add('can-install');});
addEventListener('load',()=>{const ua=navigator.userAgent,ios=/iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
  if(!ios||!/Safari/.test(ua)||/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\\//.test(ua)||navigator.standalone||location.pathname.indexOf('/${PATHS[lg].app}/')>-1)return;
  try{if(localStorage.getItem('bsIosHint'))return;}catch(e){}
  setTimeout(()=>{const d=document.createElement('div');d.className='ioshint';d.innerHTML='<img src="${BASE}icon-192.png" alt=""><span><b>${T(`Βάλε το ${esc(SITE_NAME)} στην οθόνη σου`, `Add ${esc(SITE_NAME)} to your Home Screen`)}</b>${T('Πάτα', 'Tap')} <svg viewBox="0 0 20 24" aria-label="${T('κοινοποίηση', 'share')}"><path d="M10 2v13M5 7l5-5 5 5M3 11v10h14V11" fill="none" stroke="currentColor" stroke-width="2"/></svg> ${T('και «Προσθήκη στην οθόνη Αφετηρίας»', 'and then “Add to Home Screen”')}</span><button type="button" aria-label="${T('Κλείσιμο', 'Close')}">×</button>';
    d.querySelector('button').onclick=()=>{d.remove();try{localStorage.setItem('bsIosHint','1');}catch(e){}};document.body.appendChild(d);},2500);});
addEventListener('click',e=>{const b=e.target.closest('[data-install]');if(b&&window.bsInstall){window.bsInstall.prompt();window.bsInstall.userChoice.then(()=>{window.bsInstall=null;document.documentElement.classList.remove('can-install');});}});
</script>
${pwaStyle}`;
  };

  for (const LG of LANGS) {
    const T = (el, en) => (LG === 'en' ? en : el);
    const OTHER = LG === 'el' ? 'en' : 'el';
    const BL = B(LG);
    const ord = n => (LG === 'en' ? ordEn(n) : n + 'η');
    const tName = c => (TEAMS[c] || [c, 0, 0, c])[LG === 'en' ? 3 : 0];
    const teamNameL = c => c.split(';').map(tName).join(' / ');
    const updated = UPD[LG];
    const shellB = SHELL[LG].replaceAll('{{BASE}}', BL).replaceAll('{{UPDATED}}', esc(updated)).replaceAll('{{SEASON}}', SEASON_LABEL)
      .replace('<div class="search">', '{{LANGSW}}<div class="search">');
    const topband = shellB.slice(0, shellB.indexOf('\n<div id="v'));
    const footer = shellB.slice(shellB.lastIndexOf('{{AD}}<footer')).replace('{{AD}}', adUnit(LG))
      .replace(T('Πολιτική απορρήτου</a>', 'Privacy policy</a>'), `${T('Πολιτική απορρήτου</a>', 'Privacy policy</a>')}<a href="${urlFor(LG, 'app')}">${T('Εφαρμογή', 'App')}</a>`);
    const langSw = alt => `<a class="langsw" href="${alt || B(OTHER)}" hreflang="${OTHER}" lang="${OTHER}" title="${OTHER === 'en' ? 'English' : 'Ελληνικά'}">${OTHER === 'en' ? 'EN' : 'ΕΛ'}</a>`;
    const script = `<script src="${BASE}assets/${LG === 'en' ? 'app.en.js' : 'app.js'}?v=${ver}" defer></script>`;
    const bodyAttrs = (view, id) => `data-view="${view}"${id ? ` data-id="${esc(id)}"` : ''} data-base="${BL}" data-root="${BASE}"`;

    function head(title, desc, url, alt) {
      const elU = LG === 'el' ? url : alt, enU = LG === 'en' ? url : alt;
      const alts = alt ? `<link rel="alternate" hreflang="el" href="${esc(SITE_URL + elU)}">
<link rel="alternate" hreflang="en" href="${esc(SITE_URL + enU)}">
<link rel="alternate" hreflang="x-default" href="${esc(SITE_URL + elU)}">
` : '';
      return `<!doctype html>
<html lang="${LG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(SITE_URL + url)}">
${alts}<meta property="og:type" content="website">
<meta property="og:locale" content="${LG === 'en' ? 'en_GB' : 'el_GR'}">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(SITE_URL + url)}">
<meta name="theme-color" content="#1d2330">
<link rel="manifest" href="${BL}manifest.webmanifest">
<link rel="icon" href="${BASE}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${BASE}favicon-48.png" sizes="48x48" type="image/png">
<link rel="apple-touch-icon" href="${BASE}apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(SITE_NAME)}">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Sans+Extra+Condensed:wght@600;800&family=Fira+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="${BASE}assets/app.css?v=${ver}">
${adHead}${pwaHead(LG)}</head>`;
    }
    async function write(url, html) {
      const file = path.join(OUT, url.slice(BASE.length), 'index.html');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, html);
    }
    // απλή σελίδα (άρθρα, tipsters, πολιτική απορρήτου): ίδια κεφαλίδα και υποσέλιδο
    async function simplePage(key, { title, desc, view, main }) {
      const url = urlFor(LG, key), alt = urlFor(OTHER, key); urls.push(SITE_URL + url);
      await write(url, `${head(title, desc, url, alt)}
<body ${bodyAttrs(view)}>
${topband.replace('{{LANGSW}}', langSw(alt))}
${adUnit(LG)}<main class="wrap one">${main}</main>
${footer}
${script}
</body>
</html>
`);
    }
    async function page(key, { title, desc, view, id = '', h1p = '', ledep = '', h1t = '', ledet = '' }) {
      const url = urlFor(LG, key), alt = urlFor(OTHER, key); urls.push(SITE_URL + url);
      let body = shellB.replace('{{LANGSW}}', langSw(alt))
        .replace('{{PLAYER_H1}}', esc(h1p)).replace('{{PLAYER_LEDE}}', ledep ? `<p class="lede">${esc(ledep)}</p>` : '')
        .replace('{{TEAM_H1}}', esc(h1t)).replace('{{TEAM_LEDE}}', ledet ? `<p class="lede">${esc(ledet)}</p>` : '');
      const map = { stand: 'vStand', team: 'vTeam', player: 'vPlayer', form: 'vForm', fantasy: 'vFantasy', preds: 'vPreds' };
      for (const [v, el] of Object.entries(map)) body = body.replace(`{{HIDDEN_${el}}}`, v === view ? '' : ' hidden');
      // μία διαφήμιση στην ορατή ενότητα + μία πριν από το υποσέλιδο
      const at = body.indexOf(`<div id="${map[view]}"`);
      const k = body.indexOf('{{AD}}', at);
      if (k > -1) body = body.slice(0, k) + adUnit(LG) + body.slice(k + 6);
      body = body.replace('{{AD}}<footer', adUnit(LG) + '<footer').replaceAll('{{AD}}', '');
      await write(url, `${head(title, desc, url, alt)}
<body ${bodyAttrs(view, id)}>
${body}
${script}
</body>
</html>
`);
    }

    const S = `EuroLeague ${SEASON_LABEL}`;
    const nextR = Math.min(...league.games.filter(g => !g[6]).map(g => g[0]));
    await page('home', { view: 'stand',
      title: T(`EuroLeague βαθμολογία ${SEASON_LABEL}: πρόγραμμα, στατιστικά ομάδων και παικτών | ${SITE_NAME}`, `EuroLeague standings ${SEASON_LABEL}: schedule, team and player stats | ${SITE_NAME}`),
      desc: T(`Η βαθμολογία της ${S} μετά την ${lastRound}η αγωνιστική, το πρόγραμμα, στατιστικά ομάδων και παικτών στα ελληνικά.`,
        `The ${S} standings after Round ${lastRound}, the schedule, team ratings and player stats.`) });
    await page('form', { view: 'form',
      title: T(`Θερμόμετρο φόρμας ${S}: ποιος ανεβαίνει, ποιος πέφτει | ${SITE_NAME}`, `${S} form guide: who is heating up, who is cooling down | ${SITE_NAME}`),
      desc: T(`Οι παίκτες και οι ομάδες της EuroLeague σε φόρμα: οι 3 τελευταίοι αγώνες σε σύγκριση με τους προηγούμενους.`,
        `EuroLeague players and teams in form: the last 3 games compared with the earlier ones.`) });
    await page('fantasy', { view: 'fantasy',
      title: T(`EuroLeague Fantasy: ποιους να βάλεις στην ${lastRound + 1}η αγωνιστική | ${SITE_NAME}`, `EuroLeague Fantasy picks for Round ${lastRound + 1} | ${SITE_NAME}`),
      desc: T(`Εκτιμήσεις PIR ανά θέση, δυσκολία προγράμματος, διπλές εβδομάδες και η πεντάδα της αγωνιστικής για το EuroLeague Fantasy.`,
        `Projected PIR by position, schedule difficulty, double weeks and the team of the round for EuroLeague Fantasy.`) });
    await page('preds', { view: 'preds',
      title: T(`EuroLeague προγνωστικά ${lastRound + 1}ης αγωνιστικής: εκτιμήσεις και ανάλυση | ${SITE_NAME}`, `EuroLeague predictions Round ${lastRound + 1}: projected scores and analysis | ${SITE_NAME}`),
      desc: T(`Προγνωστικά για την ${lastRound + 1}η αγωνιστική της ${S}: εκτίμηση σκορ, πιθανότητα νίκης, σύνολο πόντων, φόρμα και η ανάλυσή μας.`,
        `Predictions for Round ${lastRound + 1} of the ${S}: projected score, win probability, total points, form and our analysis.`) });

    // άρθρα
    const typeLabel = t => (t === 'prognostiko' ? T('Προγνωστικό', 'Prediction') : T('Άρθρο', 'Article'));
    const arts = articles.filter(a => a[LG]);
    await simplePage('articles', { view: 'articles', title: T(`Άρθρα και προγνωστικά EuroLeague | ${SITE_NAME}`, `EuroLeague articles and predictions | ${SITE_NAME}`),
      desc: T(`Αναλύσεις, προεπισκοπήσεις αγωνιστικών και προγνωστικά για την ${S}.`, `Analysis, round previews and predictions for the ${S}.`),
      main: `<section class="article"><h1>${T('Άρθρα', 'Articles')}</h1><p class="sub">${T('Αναλύσεις, προεπισκοπήσεις και προγνωστικά για την', 'Analysis, previews and predictions for the')} ${esc(S)}</p>` +
        (arts.length ? `<div class="alist">${arts.map(a => `<a class="acard" href="${a[LG].url}"><time>${esc(typeLabel(a.type))} · ${esc(a[LG].dateText)}</time><h2>${esc(a[LG].title)}</h2><p>${esc(a[LG].desc)}</p></a>`).join('')}</div>`
          : `<p class="sub">${T('Τα πρώτα άρθρα έρχονται σύντομα.', 'The first articles are coming soon.')}</p>`) + `</section>` });
    for (const a of arts) {
      const x = a[LG];
      await simplePage('article:' + a.el.slug, { view: 'articles', title: `${x.title} | ${SITE_NAME}`, desc: x.desc || x.title,
        main: `<article class="article"><p class="sub"><a href="${urlFor(LG, 'articles')}">${T('Άρθρα', 'Articles')}</a> · ${esc(typeLabel(a.type))}</p><h1>${esc(x.title)}</h1>
<div class="byline">${esc([x.dateText, a.author].filter(Boolean).join(' · '))}</div>
<div class="prose">${x.html}</div>
${a.type === 'prognostiko' ? `<p class="note">${T('Τα προγνωστικά αποτελούν προσωπική άποψη και όχι συμβουλή. Το στοίχημα επιτρέπεται μόνο σε άτομα άνω των 21 ετών. Παίξτε υπεύθυνα.', 'Predictions are personal opinion, not advice. Betting is for adults only (21+ in Greece, 18+ in most other countries). Gamble responsibly.')} <a href="${urlFor(LG, 'preds')}">${T('Δείτε τις εκτιμήσεις της αγωνιστικής', 'See the projections for the round')}</a>.</p>` : ''}
</article>` });
    }

    // Tipsters
    const pctTxt = v => (v == null ? '–' : Math.round(v * 100) + '%');
    const unitsTxt = v => (v > 0 ? '+' : '') + v.toFixed(2);
    const resChip = r => r === 'W' ? `<span class="res w">${T('Ν', 'W')}</span>` : r === 'L' ? `<span class="res l">${T('Η', 'L')}</span>` : r === 'P' ? '<span class="res p">=</span>' : '<span class="res q">…</span>';
    const gameTxt = p => `${esc(tName(p.h))} – ${esc(tName(p.a))}`;
    const scoreTxt = p => p.score ? p.score + (p.val != null ? ` · ${p.val} ${PROP_LABEL[LG][p.stat]}` : '') : '';
    const disclaimer = `<p class="note">${T('Οι επιλογές των tipsters είναι προσωπικές απόψεις και όχι συμβουλή. Οι μονάδες υπολογίζονται με 1 μονάδα ποντάρισμα ανά επιλογή και μόνο όπου δηλώθηκε απόδοση. Το στοίχημα επιτρέπεται μόνο σε άτομα άνω των 21 ετών. Παίξτε υπεύθυνα.',
      'Tipster picks are personal opinions, not advice. Units assume a 1-unit stake per pick and only count picks with odds. Betting is for adults only (21+ in Greece, 18+ in most other countries). Gamble responsibly.')}</p>`;
    const upcoming = tipsters.flatMap(t => t.picks.filter(p => p.res === 'pending').map(p => ({ ...p, t })));
    const byGame = {};
    for (const p of upcoming) (byGame[`${p.round}|${p.h}|${p.a}`] ||= []).push(p);
    const roundTxt = r => T(`${r}η αγωνιστική`, `Round ${r}`);
    await simplePage('tipsters', { view: 'tipsters',
      title: T(`Tipsters EuroLeague: βαθμολογία και επιλογές ${nextR}ης αγωνιστικής | ${SITE_NAME}`, `EuroLeague tipsters: leaderboard and Round ${nextR} picks | ${SITE_NAME}`),
      desc: T(`Οι tipsters του ${SITE_NAME}: ποσοστό επιτυχίας, μονάδες κέρδους και οι επιλογές τους για την ${nextR}η αγωνιστική της ${S}.`,
        `The ${SITE_NAME} tipsters: hit rate, units won and their picks for Round ${nextR} of the ${S}.`),
      main: `<section class="article wide"><h1>Tipsters</h1><p class="sub">${T('Η βαθμολογία ενημερώνεται αυτόματα με τα τελικά σκορ κάθε αγώνα', 'The leaderboard updates automatically with the final score of every game')}</p>
${tipsters.length ? `<div class="tbl"><table class="tiptbl"><thead><tr><th>#</th><th>Tipster</th><th>${T('Επιλογές', 'Picks')}</th><th>${T('Ν-Η', 'W-L')}</th><th>${T('Επιτυχία', 'Hit rate')}</th><th>${T('Μονάδες', 'Units')}</th><th>ROI</th><th>${T('Φόρμα', 'Form')}</th></tr></thead><tbody>
${tipsters.map((t, i) => `<tr><td>${i + 1}</td><td class="l"><a class="tlink" href="${urlFor(LG, 'tipster:' + t.slug)}"><span>${esc(t.name)}</span></a></td><td>${t.W + t.L + t.P}</td><td>${t.W}-${t.L}${t.P ? `-${t.P}` : ''}</td><td>${pctTxt(t.pct)}</td><td class="${t.units > 0 ? 'up' : t.units < 0 ? 'down' : ''}">${unitsTxt(t.units)}</td><td>${t.roi == null ? '–' : (t.roi > 0 ? '+' : '') + Math.round(t.roi * 100) + '%'}</td><td>${t.form.split('').map(resChip).join(' ') || '–'}</td></tr>`).join('')}
</tbody></table></div>` : `<p class="sub">${T('Δεν υπάρχουν ακόμη tipsters.', 'No tipsters yet.')}</p>`}
</section>
<section class="article wide"><h2>${T('Οι επιλογές για τους επόμενους αγώνες', 'Picks for the upcoming games')}</h2>
${Object.keys(byGame).length ? `<div class="tipgames">${Object.values(byGame).map(ps => `<div class="fx"><span class="when">${roundTxt(ps[0].round)}</span><div class="row"><b>${gameTxt(ps[0])}</b></div>${ps.map(p => `<a class="row tippick" href="${p.url[LG]}"><span class="tn">${esc(p.t.name)}</span><span class="tl">${esc(p.label[LG])}${p.odds ? ` @ ${p.odds.toFixed(2)}` : ''}${p.html[LG] ? ` <i>${T('Ανάλυση', 'Analysis')} →</i>` : ''}</span></a>`).join('')}</div>`).join('')}</div>` : `<p class="sub">${T('Δεν έχουν δηλωθεί ακόμη επιλογές για τους επόμενους αγώνες.', 'No picks for the upcoming games yet.')}</p>`}
${disclaimer}</section>` });
    for (const t of tipsters) {
      const bio = LG === 'en' ? t.bioEn : t.bio;
      await simplePage('tipster:' + t.slug, { view: 'tipsters',
        title: T(`${t.name}: επιλογές και βαθμολογία tipster EuroLeague | ${SITE_NAME}`, `${t.name}: EuroLeague tipster picks and record | ${SITE_NAME}`),
        desc: T(`${t.name}: ${t.W}-${t.L} στις επιλογές EuroLeague, ποσοστό επιτυχίας ${pctTxt(t.pct)}, ${unitsTxt(t.units)} μονάδες.`,
          `${t.name}: ${t.W}-${t.L} on EuroLeague picks, ${pctTxt(t.pct)} hit rate, ${unitsTxt(t.units)} units.`),
        main: `<section class="article wide"><p class="sub"><a href="${urlFor(LG, 'tipsters')}">Tipsters</a></p><h1>${esc(t.name)}</h1>${bio ? `<p class="lede2">${esc(bio)}</p>` : ''}
<div class="adv tipstats"><div><span>${T('Επιλογές', 'Picks')}</span><b>${t.W + t.L + t.P}</b></div><div><span>${T('Ν-Η', 'W-L')}</span><b>${t.W}-${t.L}</b></div><div><span>${T('Επιτυχία', 'Hit rate')}</span><b>${pctTxt(t.pct)}</b></div><div><span>${T('Μονάδες', 'Units')}</span><b>${unitsTxt(t.units)}</b></div></div>
<div class="tbl"><table class="tiptbl"><thead><tr><th>${T('Αγ.', 'Rd')}</th><th>${T('Αγώνας', 'Game')}</th><th>${T('Επιλογή', 'Pick')}</th><th>${T('Απόδοση', 'Odds')}</th><th>${T('Σκορ', 'Score')}</th><th>${T('Αποτέλεσμα', 'Result')}</th></tr></thead><tbody>
${t.picks.map(p => `<tr><td>${p.round}</td><td class="l">${gameTxt(p)}</td><td class="l"><a class="pklink" href="${p.url[LG]}">${esc(p.label[LG])}</a>${p.html[LG] ? ` <span class="rk">· ${T('ανάλυση', 'analysis')}</span>` : ''}</td><td>${p.odds ? p.odds.toFixed(2) : '–'}</td><td>${scoreTxt(p) || '–'}</td><td>${p.res === 'unknown' ? `<span class="res q" title="${T('Δεν βρέθηκε ο αγώνας', 'Game not found')}">?</span>` : resChip(p.res === 'pending' ? 'Q' : p.res)}</td></tr>`).join('')}
</tbody></table></div>${disclaimer}</section>` });
      for (const p of t.picks) {
        const game = `${tName(p.h)} – ${tName(p.a)}`;
        const status = p.res === 'W' ? T('Κερδισμένο', 'Won') : p.res === 'L' ? T('Χαμένο', 'Lost') : p.res === 'P' ? T('Ακυρώθηκε', 'Void') : p.res === 'unknown' ? T('Δεν βρέθηκε ο αγώνας', 'Game not found') : T('Σε εξέλιξη', 'Pending');
        const when = p.date ? (() => { const s = p.date; const d = new Date(Date.UTC(2020 + +s[8], +s.slice(0, 2) - 1, +s.slice(2, 4), +s.slice(4, 6), +s.slice(6, 8)));
          return d.toLocaleString(T('el-GR', 'en-GB'), { timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) + T('', ' (Athens time)'); })() : '';
        const html = p.html[LG], label = p.label[LG];
        await simplePage('pick:' + t.slug + '/' + p.id, { view: 'tipsters',
          title: T(`${game} προγνωστικό: ${label} | ${t.name} | ${SITE_NAME}`, `${game} prediction: ${label} | ${t.name} | ${SITE_NAME}`),
          desc: p.excerpt[LG] || T(`${t.name}: ${label}${p.odds ? ' @ ' + p.odds.toFixed(2) : ''} για το ${game}, ${p.round}η αγωνιστική EuroLeague.`,
            `${t.name}: ${label}${p.odds ? ' @ ' + p.odds.toFixed(2) : ''} for ${game}, EuroLeague Round ${p.round}.`),
          main: `<article class="article"><p class="sub"><a href="${urlFor(LG, 'tipsters')}">Tipsters</a> · <a href="${urlFor(LG, 'tipster:' + t.slug)}">${esc(t.name)}</a></p>
<h1>${esc(game)}</h1>
<div class="byline">${T(`${p.round}η αγωνιστική EuroLeague`, `EuroLeague Round ${p.round}`)}${when ? ' · ' + esc(when) : ''}</div>
<div class="pickbox ${p.res}"><div><span>${T('Επιλογή', 'Pick')}</span><b>${esc(label)}</b></div><div><span>${T('Απόδοση', 'Odds')}</span><b>${p.odds ? p.odds.toFixed(2) : '–'}</b></div><div><span>${T('Αποτέλεσμα', 'Result')}</span><b>${esc(status)}</b>${p.score ? `<small>${esc(scoreTxt(p))}</small>` : ''}</div></div>
${html ? `<div class="prose">${html}</div>` : `<p class="sub">${T(`Ο ${esc(t.name)} δεν έχει γράψει ανάλυση για αυτή την επιλογή.`, `${esc(t.name)} has not written an analysis for this pick${p.html.el ? ' in English (it is available in Greek)' : ''}.`)}</p>`}
<p><a class="pread" href="${urlFor(LG, 'team:' + p.h)}">${esc(tName(p.h))}: ${T('στατιστικά', 'stats')} →</a> &nbsp; <a class="pread" href="${urlFor(LG, 'team:' + p.a)}">${esc(tName(p.a))}: ${T('στατιστικά', 'stats')} →</a> &nbsp; <a class="pread" href="${urlFor(LG, 'preds')}">${T('Εκτιμήσεις αγωνιστικής', 'Round projections')} →</a></p>
${disclaimer}</article>` });
      }
    }

    // σελίδα εφαρμογής (και σελίδα εκτός σύνδεσης)
    await simplePage('app', { view: 'app',
      title: T(`Εφαρμογή ${SITE_NAME} για κινητό: EuroLeague στατιστικά στην οθόνη σου`, `${SITE_NAME} mobile app: EuroLeague stats on your Home Screen`),
      desc: T(`Βάλε το ${SITE_NAME} στην αρχική οθόνη του κινητού σου, σε Android και iPhone. Δωρεάν, χωρίς λήψη από store.`, `Add ${SITE_NAME} to your phone’s Home Screen on Android and iPhone. Free, no app store download.`),
      main: `<div class="article"><div class="apphero"><img src="${BASE}icon-192.png" alt="" width="96" height="96"><div><h1>${T(`Το ${esc(SITE_NAME)} στο κινητό σου`, `${esc(SITE_NAME)} on your phone`)}</h1><p class="sub">${T('Δωρεάν, χωρίς εγγραφή και χωρίς λήψη από store. Ανοίγει σε πλήρη οθόνη σαν κανονική εφαρμογή και δείχνει τα τελευταία στατιστικά που είδες ακόμη και χωρίς σύνδεση.', 'Free, no sign-up and no app store download. It opens full screen like a regular app and shows the latest stats you viewed even when you are offline.')}</p></div></div>
<p><button class="appbtn only-install" data-install type="button">${T('Εγκατάσταση εφαρμογής', 'Install app')}</button></p>
<div class="appbox">
<div><h3>Android (Chrome)</h3><ol>${T('<li>Πάτησε το κουμπί «Εγκατάσταση εφαρμογής» πιο πάνω.</li><li>Αν δεν εμφανίζεται, άνοιξε το μενού ⋮ πάνω δεξιά.</li><li>Διάλεξε «Εγκατάσταση εφαρμογής» ή «Προσθήκη στην αρχική οθόνη».</li>', '<li>Tap the “Install app” button above.</li><li>If it does not appear, open the ⋮ menu at the top right.</li><li>Choose “Install app” or “Add to Home screen”.</li>')}</ol></div>
<div><h3>iPhone (Safari)</h3><ol>${T(`<li>Άνοιξε το ${esc(SITE_NAME)} στο Safari.</li><li>Πάτησε το κουμπί κοινοποίησης (τετράγωνο με βέλος προς τα πάνω).</li><li>Διάλεξε «Προσθήκη στην οθόνη Αφετηρίας» και μετά «Προσθήκη».</li>`, `<li>Open ${esc(SITE_NAME)} in Safari.</li><li>Tap the Share button (the square with an arrow pointing up).</li><li>Choose “Add to Home Screen”, then “Add”.</li>`)}</ol></div>
<div><h3>${T('Υπολογιστής', 'Computer')}</h3><ol>${T('<li>Άνοιξε το site σε Chrome ή Edge.</li><li>Πάτησε το εικονίδιο εγκατάστασης στη γραμμή διεύθυνσης ή το κουμπί πιο πάνω.</li>', '<li>Open the site in Chrome or Edge.</li><li>Click the install icon in the address bar or the button above.</li>')}</ol></div>
</div>
<p class="note">${T('Αν βλέπεις αυτή τη σελίδα χωρίς να την άνοιξες εσύ, μάλλον δεν έχεις σύνδεση στο ίντερνετ. Οι σελίδες που άνοιξες πρόσφατα είναι διαθέσιμες και εκτός σύνδεσης.', 'If you see this page without opening it yourself, you are probably offline. Pages you opened recently are available offline.')}</p></div>` });

    // πολιτική απορρήτου
    const owner = CONF.owner || T('[Επωνυμία ιδιοκτήτη]', '[Owner name]'), email = CONF.email || T('[email επικοινωνίας]', '[contact email]');
    await simplePage('legal', { view: 'legal', title: T(`Πολιτική απορρήτου | ${SITE_NAME}`, `Privacy policy | ${SITE_NAME}`),
      desc: T(`Πώς το ${SITE_NAME} χρησιμοποιεί cookies και προσωπικά δεδομένα.`, `How ${SITE_NAME} uses cookies and personal data.`),
      main: LG === 'el' ? `<div class="legal"><h1>Πολιτική απορρήτου</h1>
<p>Το ${esc(SITE_NAME)} (${esc(SITE_URL)}) ανήκει στην/στον ${esc(owner)}. Για κάθε θέμα σχετικά με τα δεδομένα σας επικοινωνήστε στο ${esc(email)}.</p>
<h2>Τι δεδομένα συλλέγουμε</h2>
<p>Δεν ζητάμε εγγραφή και δεν συλλέγουμε ονόματα ή στοιχεία επικοινωνίας. Ο διακομιστής καταγράφει τεχνικά στοιχεία (όπως διεύθυνση IP και τύπο συσκευής) για λόγους ασφάλειας και λειτουργίας.</p>
<h2>Cookies και διαφημίσεις</h2>
<p>Χρησιμοποιούμε την υπηρεσία Google AdSense για την προβολή διαφημίσεων. Η Google και οι συνεργάτες της μπορεί να χρησιμοποιούν cookies για να προβάλλουν διαφημίσεις με βάση τις προηγούμενες επισκέψεις σας σε αυτόν και σε άλλους ιστότοπους. Στην πρώτη σας επίσκεψη σας ζητάμε συγκατάθεση μέσω του μηνύματος cookies και μπορείτε να την αλλάξετε ανά πάσα στιγμή. Μπορείτε επίσης να απενεργοποιήσετε τις εξατομικευμένες διαφημίσεις από τις <a href="https://adssettings.google.com">Ρυθμίσεις διαφημίσεων της Google</a>. Περισσότερα για το <a href="https://policies.google.com/technologies/partner-sites">πώς η Google χρησιμοποιεί τα δεδομένα</a>.</p>
<h2>Γραμματοσειρές</h2>
<p>Οι γραμματοσειρές φορτώνονται από την υπηρεσία Google Fonts, οπότε η διεύθυνση IP σας διαβιβάζεται στην Google κατά τη φόρτωση της σελίδας.</p>
<h2>Τα δικαιώματά σας</h2>
<p>Σύμφωνα με τον Γενικό Κανονισμό Προστασίας Δεδομένων (ΓΚΠΔ) έχετε δικαίωμα πρόσβασης, διόρθωσης, διαγραφής και εναντίωσης στην επεξεργασία των δεδομένων σας, καθώς και δικαίωμα καταγγελίας στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (www.dpa.gr).</p>
<h2>Πηγή στατιστικών</h2>
<p>Τα στατιστικά προέρχονται από τα επίσημα δημόσια δεδομένα της EuroLeague. Το ${esc(SITE_NAME)} δεν συνδέεται με την EuroLeague.</p>
<p class="sub">Τελευταία ενημέρωση: ${esc(athens)}</p></div>` : `<div class="legal"><h1>Privacy policy</h1>
<p>${esc(SITE_NAME)} (${esc(SITE_URL)}) is owned by ${esc(owner)}. For any question about your data, contact ${esc(email)}.</p>
<h2>What data we collect</h2>
<p>We do not ask you to register and we do not collect names or contact details. The server logs technical data (such as IP address and device type) for security and operation.</p>
<h2>Cookies and advertising</h2>
<p>We use Google AdSense to show ads. Google and its partners may use cookies to show ads based on your previous visits to this and other websites. On your first visit we ask for your consent through the cookie message, and you can change it at any time. You can also turn off personalised ads in <a href="https://adssettings.google.com">Google Ad Settings</a>. Read more about <a href="https://policies.google.com/technologies/partner-sites">how Google uses data</a>.</p>
<h2>Fonts</h2>
<p>Fonts are loaded from Google Fonts, so your IP address is sent to Google when the page loads.</p>
<h2>Your rights</h2>
<p>Under the General Data Protection Regulation (GDPR) you have the right to access, correct and delete your data and to object to its processing, as well as the right to lodge a complaint with the Hellenic Data Protection Authority (www.dpa.gr) or your local data protection authority.</p>
<h2>Source of the stats</h2>
<p>The stats come from the official public EuroLeague data. ${esc(SITE_NAME)} is not affiliated with the EuroLeague.</p>
<p class="sub">Last updated: ${esc(athensEn)}</p></div>` });

    const srow = Object.fromEntries(league.stand.map(s => [s[1], s]));
    for (const c of Object.keys(TEAMS)) {
      const s = srow[c], name = tName(c);
      const lede = s ? T(`${name}: ${s[0]}η θέση στην ${S} με ρεκόρ ${s[2]}-${s[3]} και ${s[4]}-${s[5]} πόντους υπέρ/κατά.`, `${name}: ${ordEn(s[0])} in the ${S} with a ${s[2]}-${s[3]} record and ${s[4]}-${s[5]} points for/against.`)
        : T(`${name} στην ${S}.`, `${name} in the ${S}.`);
      await page('team:' + c, { view: 'team', id: c, h1t: name, ledet: lede,
        title: T(`${name} ${S}: ρόστερ, πρόγραμμα, στατιστικά | ${SITE_NAME}`, `${name} ${S}: roster, schedule, stats | ${SITE_NAME}`),
        desc: lede + T(' Ρόστερ, πρόγραμμα, τέσσερις παράγοντες και φόρμα παικτών.', ' Roster, schedule, four factors and player form.') });
    }
    for (const p of players) {
      const n = niceName(p.n), s = playerSummary(p), tn = teamNameL(p.t);
      const lede = T(`${n} (${tn}) στην ${S}: ${s.G} αγώνες, ${f1(s.pts)} πόντοι, ${f1(s.reb)} ριμπάουντ, ${f1(s.ast)} ασίστ και ${f1(s.pir)} PIR ανά αγώνα.`,
        `${n} (${tn}) in the ${S}: ${s.G} games, ${f1(s.pts)} points, ${f1(s.reb)} rebounds, ${f1(s.ast)} assists and ${f1(s.pir)} PIR per game.`);
      await page('player:' + p.s, { view: 'player', id: p.c, h1p: n, ledep: lede,
        title: T(`${n} στατιστικά ${S} (${tn}) | ${SITE_NAME}`, `${n} stats ${S} (${tn}) | ${SITE_NAME}`), desc: lede });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  await fs.writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`).join('\n')}
</urlset>
`);
  if (AD_CLIENT) await fs.writeFile(path.join(OUT, 'ads.txt'), `google.com, ${AD_CLIENT.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}${BASE}sitemap.xml\n`);
  await fs.writeFile(path.join(OUT, '404.html'), `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Η σελίδα δεν βρέθηκε · Page not found | ${SITE_NAME}</title><link rel="stylesheet" href="${BASE}assets/app.css"></head><body><main class="wrap one" style="padding-block:60px"><section><h2>Η σελίδα δεν βρέθηκε</h2><p class="sub">Ίσως ο παίκτης άλλαξε ομάδα ή η διεύθυνση γράφτηκε λάθος.</p><p><a href="${BASE}">Πίσω στη βαθμολογία</a></p></section><section lang="en"><h2>Page not found</h2><p class="sub">The player may have changed teams or the address may be wrong.</p><p><a href="${BASE}en/">Back to the standings</a></p></section></main></body></html>\n`);
  console.log(`Έτοιμο: ${urls.length} σελίδες στον φάκελο dist/ (${UPD.el}).`);
}

main().catch(e => { console.error(e); process.exit(1); });
