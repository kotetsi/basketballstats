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

// Ονόματα, χρώματα και διευθύνσεις ομάδων (κωδικός Ευρωλίγκας → [όνομα, χρώμα, slug])
const TEAMS = {
  OLY: ['Ολυμπιακός', '#c8102e', 'olympiakos'], PAN: ['Παναθηναϊκός', '#007a3d', 'panathinaikos'],
  MAD: ['Ρεάλ Μαδρίτης', '#5b4a9b', 'real-madrite'], ULK: ['Φενέρμπαχτσε', '#1d3c8f', 'fenerbahce'],
  PAR: ['Παρτιζάν', '#3b3b3b', 'partizan'], RED: ['Ερυθρός Αστέρας', '#b3122e', 'erythros-asteras'],
  BAR: ['Μπαρτσελόνα', '#a50044', 'barcelona'], ASV: ['Βιλερμπάν', '#1a1a1a', 'villeurbanne'],
  ZAL: ['Ζαλγκίρις', '#00703c', 'zalgiris'], HTA: ['Χάποελ Τελ Αβίβ', '#d71920', 'hapoel-tel-aviv'],
  VIR: ['Βίρτους Μπολόνια', '#222222', 'virtus-bolonia'], BES: ['Μπεσίκτας', '#2a2a2a', 'besiktas'],
  BAS: ['Μπασκόνια', '#1b3a6b', 'baskonia'], MIL: ['Αρμάνι Μιλάνο', '#c8102e', 'armani-milano'],
  DUB: ['Ντουμπάι', '#0a6e8a', 'ntoumpai'], PAM: ['Βαλένθια', '#e46b11', 'valenthia'],
  TEL: ['Μακάμπι Τελ Αβίβ', '#d9a400', 'makampi-tel-aviv'], IST: ['Αναντολού Εφές', '#003b7a', 'anadolou-efes'],
  PRS: ['Παρί', '#2b2b2b', 'pari'], MUN: ['Μπάγερν', '#c8102e', 'bayern'],
};

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
function parsePick(sel) {
  const s = sel.trim().toLowerCase().replace(',', '.');
  let m;
  if (/^[12]$/.test(s)) return { kind: 'ml', side: +s };
  if ((m = s.match(/^([12])\s*([+-]\s*\d+(?:\.\d+)?)$/))) return { kind: 'hc', side: +m[1], line: parseFloat(m[2].replace(/\s/g, '')) };
  if ((m = s.match(/^(over|under|o|u|πάνω|πανω|κάτω|κατω)\s*(\d+(?:\.\d+)?)$/))) return { kind: 'tot', over: /^(over|o|πάνω|πανω)$/.test(m[1]), line: parseFloat(m[2]) };
  return null;
}
function pickLabel(p, h, a) {
  const tn = c => (TEAMS[c] || [c])[0];
  if (p.kind === 'ml') return `Νίκη ${tn(p.side === 1 ? h : a)}`;
  if (p.kind === 'hc') return `${tn(p.side === 1 ? h : a)} ${p.line > 0 ? '+' : ''}${p.line}`;
  return `${p.over ? 'Over' : 'Under'} ${p.line} πόντοι`;
}
function gradePick(p, hs, as) {
  let v;
  if (p.kind === 'ml') v = p.side === 1 ? hs - as : as - hs;
  else if (p.kind === 'hc') v = (p.side === 1 ? hs - as : as - hs) + p.line;
  else v = p.over ? hs + as - p.line : p.line - (hs + as);
  return v > 0 ? 'W' : v < 0 ? 'L' : 'P';
}
async function loadTipsters(games) {
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
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('|')) continue;
      const parts = line.split('|').map(x => x.trim());
      const round = parseInt(parts[0], 10);
      const gm = (parts[1] || '').toUpperCase().match(/^([A-Z]{3})\s*-\s*([A-Z]{3})$/);
      const p = parsePick(parts[2] || '');
      const odds = parts[3] ? parseFloat(parts[3].replace(',', '.')) : null;
      if (!round || !gm || !p) { errors.push(line); continue; }
      const [, h, a] = gm;
      const g = games.find(x => x[0] === round && x[2] === h && x[3] === a);
      let res = 'pending';
      if (!g) { res = 'unknown'; errors.push(line + '  (δεν βρέθηκε αυτός ο αγώνας σε αυτή την αγωνιστική: έλεγξε ποιος είναι γηπεδούχος)'); }
      else if (g[6]) res = gradePick(p, g[4], g[5]);
      picks.push({ round, h, a, label: pickLabel(p, h, a), odds: odds && odds > 1 ? odds : null, res, score: g && g[6] ? `${g[4]}-${g[5]}` : '', date: g ? g[1] : '' });
    }
    if (errors.length) console.warn(`Tipster ${name}: ${errors.length} γραμμές με πρόβλημα:`, errors);
    const settled = picks.filter(x => x.res === 'W' || x.res === 'L');
    const W = settled.filter(x => x.res === 'W').length, L = settled.length - W;
    const withOdds = picks.filter(x => x.odds && (x.res === 'W' || x.res === 'L' || x.res === 'P'));
    const units = withOdds.reduce((s, x) => s + (x.res === 'W' ? x.odds - 1 : x.res === 'L' ? -1 : 0), 0);
    const staked = withOdds.filter(x => x.res !== 'P').length;
    picks.sort((x, y) => y.round - x.round || (y.date || '').localeCompare(x.date || ''));
    out.push({ name, slug, bio: meta.bio || '', picks, W, L, P: picks.filter(x => x.res === 'P').length,
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
    const slug = meta.slug || slugify(meta.title) || slugify(f.replace(/\.md$/, ''));
    const date = meta.date || '';
    const dateText = date ? new Date(date + 'T12:00:00Z').toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    list.push({ title: meta.title, desc: meta.description || '', type: meta.type === 'prognostiko' ? 'prognostiko' : 'arthro',
      round: meta.round ? +meta.round : null, game: (meta.game || '').toUpperCase(), author: meta.author || '', date, dateText, slug,
      url: BASE + 'arthra/' + slug + '/', html: markdown(body) });
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

  // slugs παικτών (μοναδικά)
  const used = new Set();
  for (const p of players) {
    let s = slugify(niceName(p.n)) || p.c;
    if (used.has(s)) s += '-' + p.c;
    used.add(s); p.s = s;
  }
  const athens = new Date(data.fetchedAt).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'numeric', year: 'numeric' });
  const updated = `${athens} · έως και την ${lastRound}η αγωνιστική`;

  // καθαρισμός και αρχεία
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, 'assets'), { recursive: true });
  const articles = await loadArticles();
  const tipsters = await loadTipsters(league.games);
  await fs.writeFile(path.join(OUT, 'assets', 'data.json'), JSON.stringify({ updated, teams: TEAMS, players, league,
    articles: articles.map(({ html, ...a }) => a),
    tips: tipsters.flatMap(t => t.picks.filter(p => p.res === 'pending').map(p => ({ g: p.h + '-' + p.a, r: p.round, n: t.name, s: t.slug, l: p.label }))) }));
  await fs.copyFile(path.join(ROOT, 'src', 'app.js'), path.join(OUT, 'assets', 'app.js'));
  await fs.copyFile(path.join(ROOT, 'src', 'app.css'), path.join(OUT, 'assets', 'app.css'));
  const shell = await fs.readFile(path.join(ROOT, 'src', 'shell.html'), 'utf8');
  const ver = Date.now().toString(36);

  const urls = [];
  const adUnit = (AD_CLIENT && AD_SLOT)
    ? `<div class="wrap adwrap"><span class="adlabel">Διαφήμιση</span><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(AD_CLIENT)}" data-ad-slot="${esc(AD_SLOT)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`
    : '';
  const adHead = AD_CLIENT ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(AD_CLIENT)}" crossorigin="anonymous"></script>\n` : '';
  const shellB = shell.replaceAll('{{BASE}}', BASE).replaceAll('{{UPDATED}}', esc(updated)).replaceAll('{{SEASON}}', SEASON_LABEL);
  const topband = shellB.slice(0, shellB.indexOf('\n<div id="v'));
  const footer = shellB.slice(shellB.lastIndexOf('{{AD}}<footer')).replace('{{AD}}', adUnit);

  function head(title, desc, url) {
    return `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="el_GR">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta name="theme-color" content="#1d2330">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Sans+Extra+Condensed:wght@600;800&family=Fira+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="${BASE}assets/app.css?v=${ver}">
${adHead}</head>`;
  }
  async function write(rel, html) {
    const file = path.join(OUT, rel, 'index.html');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, html);
  }
  // απλή σελίδα (άρθρα, πολιτική απορρήτου): ίδια κεφαλίδα και υποσέλιδο
  async function simplePage(rel, { title, desc, view, main }) {
    const url = SITE_URL + BASE + rel; urls.push(url);
    await write(rel, `${head(title, desc, url)}
<body data-view="${view}" data-base="${BASE}">
${topband}
${adUnit}<main class="wrap one">${main}</main>
${footer}
<script src="${BASE}assets/app.js?v=${ver}" defer></script>
</body>
</html>
`);
  }

  async function page(rel, { title, desc, view, id = '', h1p = '', ledep = '', h1t = '', ledet = '' }) {
    const url = SITE_URL + BASE + rel;
    urls.push(url);
    let body = shellB
      .replace('{{PLAYER_H1}}', esc(h1p)).replace('{{PLAYER_LEDE}}', ledep ? `<p class="lede">${esc(ledep)}</p>` : '')
      .replace('{{TEAM_H1}}', esc(h1t)).replace('{{TEAM_LEDE}}', ledet ? `<p class="lede">${esc(ledet)}</p>` : '');
    const map = { stand: 'vStand', team: 'vTeam', player: 'vPlayer', form: 'vForm', fantasy: 'vFantasy', preds: 'vPreds' };
    for (const [v, el] of Object.entries(map)) body = body.replace(`{{HIDDEN_${el}}}`, v === view ? '' : ' hidden');
    // μία διαφήμιση στην ορατή ενότητα + μία πριν από το υποσέλιδο
    const at = body.indexOf(`<div id="${map[view]}"`);
    const k = body.indexOf('{{AD}}', at);
    if (k > -1) body = body.slice(0, k) + adUnit + body.slice(k + 6);
    body = body.replace('{{AD}}<footer', adUnit + '<footer').replaceAll('{{AD}}', '');
    await write(rel, `${head(title, desc, url)}
<body data-view="${view}" data-id="${esc(id)}" data-base="${BASE}">
${body}
<script src="${BASE}assets/app.js?v=${ver}" defer></script>
</body>
</html>
`);
  }

  const S = `EuroLeague ${SEASON_LABEL}`;
  await page('', { view: 'stand', title: `EuroLeague βαθμολογία ${SEASON_LABEL}: πρόγραμμα, στατιστικά ομάδων και παικτών | ${SITE_NAME}`,
    desc: `Η βαθμολογία της ${S} μετά την ${lastRound}η αγωνιστική, το πρόγραμμα, στατιστικά ομάδων και παικτών στα ελληνικά.` });
  await page('thermometro/', { view: 'form', title: `Θερμόμετρο φόρμας ${S}: ποιος ανεβαίνει, ποιος πέφτει | ${SITE_NAME}`,
    desc: `Οι παίκτες και οι ομάδες της EuroLeague σε φόρμα: οι 3 τελευταίοι αγώνες σε σύγκριση με τους προηγούμενους.` });
  await page('fantasy/', { view: 'fantasy', title: `EuroLeague Fantasy: ποιους να βάλεις στην ${lastRound + 1}η αγωνιστική | ${SITE_NAME}`,
    desc: `Εκτιμήσεις PIR ανά θέση, δυσκολία προγράμματος, διπλές εβδομάδες και η πεντάδα της αγωνιστικής για το EuroLeague Fantasy.` });

  await page('prognostika/', { view: 'preds', title: `EuroLeague προγνωστικά ${lastRound + 1}ης αγωνιστικής: εκτιμήσεις και ανάλυση | ${SITE_NAME}`,
    desc: `Προγνωστικά για την ${lastRound + 1}η αγωνιστική της ${S}: εκτίμηση σκορ, πιθανότητα νίκης, σύνολο πόντων, φόρμα και η ανάλυσή μας.` });

  // άρθρα
  const typeLabel = t => (t === 'prognostiko' ? 'Προγνωστικό' : 'Άρθρο');
  await simplePage('arthra/', { view: 'articles', title: `Άρθρα και προγνωστικά EuroLeague | ${SITE_NAME}`,
    desc: `Αναλύσεις, προεπισκοπήσεις αγωνιστικών και προγνωστικά για την ${S}.`,
    main: `<section class="article"><h1>Άρθρα</h1><p class="sub">Αναλύσεις, προεπισκοπήσεις και προγνωστικά για την ${esc(S)}</p>` +
      (articles.length ? `<div class="alist">${articles.map(a => `<a class="acard" href="${a.url}"><time>${esc(typeLabel(a.type))} · ${esc(a.dateText)}</time><h2>${esc(a.title)}</h2><p>${esc(a.desc)}</p></a>`).join('')}</div>`
        : `<p class="sub">Τα πρώτα άρθρα έρχονται σύντομα.</p>`) + `</section>` });
  for (const a of articles) {
    await simplePage(`arthra/${a.slug}/`, { view: 'articles', title: `${a.title} | ${SITE_NAME}`, desc: a.desc || a.title,
      main: `<article class="article"><p class="sub"><a href="${BASE}arthra/">Άρθρα</a> · ${esc(typeLabel(a.type))}</p><h1>${esc(a.title)}</h1>
<div class="byline">${esc([a.dateText, a.author].filter(Boolean).join(' · '))}</div>
<div class="prose">${a.html}</div>
${a.type === 'prognostiko' ? `<p class="note">Τα προγνωστικά αποτελούν προσωπική άποψη και όχι συμβουλή. Το στοίχημα επιτρέπεται μόνο σε άτομα άνω των 21 ετών. Παίξτε υπεύθυνα. <a href="${BASE}prognostika/">Δείτε τις εκτιμήσεις της αγωνιστικής</a>.</p>` : ''}
</article>` });
  }


  // Tipsters
  const pctTxt = v => (v == null ? '–' : Math.round(v * 100) + '%');
  const unitsTxt = v => (v > 0 ? '+' : '') + v.toFixed(2);
  const resChip = r => r === 'W' ? '<span class="res w">Ν</span>' : r === 'L' ? '<span class="res l">Η</span>' : r === 'P' ? '<span class="res p">=</span>' : '<span class="res q">…</span>';
  const tName = c => (TEAMS[c] || [c])[0];
  const gameTxt = p => `${esc(tName(p.h))} – ${esc(tName(p.a))}`;
  const disclaimer = `<p class="note">Οι επιλογές των tipsters είναι προσωπικές απόψεις και όχι συμβουλή. Οι μονάδες υπολογίζονται με 1 μονάδα ποντάρισμα ανά επιλογή και μόνο όπου δηλώθηκε απόδοση. Το στοίχημα επιτρέπεται μόνο σε άτομα άνω των 21 ετών. Παίξτε υπεύθυνα.</p>`;
  const nextR = Math.min(...league.games.filter(g => !g[6]).map(g => g[0]));
  const upcoming = tipsters.flatMap(t => t.picks.filter(p => p.res === 'pending').map(p => ({ ...p, t })));
  const byGame = {};
  for (const p of upcoming) (byGame[`${p.round}|${p.h}|${p.a}`] ||= []).push(p);
  await simplePage('tipsters/', { view: 'tipsters', title: `Tipsters EuroLeague: βαθμολογία και επιλογές ${nextR}ης αγωνιστικής | ${SITE_NAME}`,
    desc: `Οι tipsters του ${SITE_NAME}: ποσοστό επιτυχίας, μονάδες κέρδους και οι επιλογές τους για την ${nextR}η αγωνιστική της ${S}.`,
    main: `<section class="article wide"><h1>Tipsters</h1><p class="sub">Η βαθμολογία ενημερώνεται αυτόματα με τα τελικά σκορ κάθε αγώνα</p>
${tipsters.length ? `<div class="tbl"><table class="tiptbl"><thead><tr><th>#</th><th>Tipster</th><th>Επιλογές</th><th>Ν-Η</th><th>Επιτυχία</th><th>Μονάδες</th><th>ROI</th><th>Φόρμα</th></tr></thead><tbody>
${tipsters.map((t, i) => `<tr><td>${i + 1}</td><td class="l"><a class="tlink" href="${BASE}tipsters/${t.slug}/"><span>${esc(t.name)}</span></a></td><td>${t.W + t.L + t.P}</td><td>${t.W}-${t.L}${t.P ? `-${t.P}` : ''}</td><td>${pctTxt(t.pct)}</td><td class="${t.units > 0 ? 'up' : t.units < 0 ? 'down' : ''}">${unitsTxt(t.units)}</td><td>${t.roi == null ? '–' : (t.roi > 0 ? '+' : '') + Math.round(t.roi * 100) + '%'}</td><td>${t.form.split('').map(resChip).join(' ') || '–'}</td></tr>`).join('')}
</tbody></table></div>` : `<p class="sub">Δεν υπάρχουν ακόμη tipsters.</p>`}
</section>
<section class="article wide"><h2>Οι επιλογές για τους επόμενους αγώνες</h2>
${Object.keys(byGame).length ? `<div class="tipgames">${Object.values(byGame).map(ps => `<div class="fx"><span class="when">${ps[0].round}η αγωνιστική</span><div class="row"><b>${gameTxt(ps[0])}</b></div>${ps.map(p => `<div class="row"><a href="${BASE}tipsters/${p.t.slug}/">${esc(p.t.name)}</a><span>${esc(p.label)}${p.odds ? ` @ ${p.odds.toFixed(2)}` : ''}</span></div>`).join('')}</div>`).join('')}</div>` : `<p class="sub">Δεν έχουν δηλωθεί ακόμη επιλογές για τους επόμενους αγώνες.</p>`}
${disclaimer}</section>` });
  for (const t of tipsters) {
    await simplePage(`tipsters/${t.slug}/`, { view: 'tipsters', title: `${t.name}: επιλογές και βαθμολογία tipster EuroLeague | ${SITE_NAME}`,
      desc: `${t.name}: ${t.W}-${t.L} στις επιλογές EuroLeague, ποσοστό επιτυχίας ${pctTxt(t.pct)}, ${unitsTxt(t.units)} μονάδες.`,
      main: `<section class="article wide"><p class="sub"><a href="${BASE}tipsters/">Tipsters</a></p><h1>${esc(t.name)}</h1>${t.bio ? `<p class="lede2">${esc(t.bio)}</p>` : ''}
<div class="adv tipstats"><div><span>Επιλογές</span><b>${t.W + t.L + t.P}</b></div><div><span>Ν-Η</span><b>${t.W}-${t.L}</b></div><div><span>Επιτυχία</span><b>${pctTxt(t.pct)}</b></div><div><span>Μονάδες</span><b>${unitsTxt(t.units)}</b></div></div>
<div class="tbl"><table class="tiptbl"><thead><tr><th>Αγ.</th><th>Αγώνας</th><th>Επιλογή</th><th>Απόδοση</th><th>Σκορ</th><th>Αποτέλεσμα</th></tr></thead><tbody>
${t.picks.map(p => `<tr><td>${p.round}</td><td class="l">${gameTxt(p)}</td><td class="l">${esc(p.label)}</td><td>${p.odds ? p.odds.toFixed(2) : '–'}</td><td>${p.score || '–'}</td><td>${p.res === 'unknown' ? '<span class="res q" title="Δεν βρέθηκε ο αγώνας">?</span>' : resChip(p.res === 'pending' ? 'Q' : p.res)}</td></tr>`).join('')}
</tbody></table></div>${disclaimer}</section>` });
  }

  // πολιτική απορρήτου
  const owner = CONF.owner || '[Επωνυμία ιδιοκτήτη]', email = CONF.email || '[email επικοινωνίας]';
  await simplePage('politiki-aporritou/', { view: 'legal', title: `Πολιτική απορρήτου | ${SITE_NAME}`, desc: `Πώς το ${SITE_NAME} χρησιμοποιεί cookies και προσωπικά δεδομένα.`,
    main: `<div class="legal"><h1>Πολιτική απορρήτου</h1>
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
<p class="sub">Τελευταία ενημέρωση: ${esc(athens)}</p></div>` });

  const srow = Object.fromEntries(league.stand.map(s => [s[1], s]));
  for (const [c, [name]] of Object.entries(TEAMS)) {
    const s = srow[c];
    const lede = s ? `${name}: ${s[0]}η θέση στην ${S} με ρεκόρ ${s[2]}-${s[3]} και ${s[4]}-${s[5]} πόντους υπέρ/κατά.` : `${name} στην ${S}.`;
    await page(`omada/${TEAMS[c][2]}/`, { view: 'team', id: c, h1t: name, ledet: lede,
      title: `${name} ${S}: ρόστερ, πρόγραμμα, στατιστικά | ${SITE_NAME}`,
      desc: lede + ' Ρόστερ, πρόγραμμα, τέσσερις παράγοντες και φόρμα παικτών.' });
  }
  for (const p of players) {
    const n = niceName(p.n), s = playerSummary(p);
    const lede = `${n} (${teamName(p.t)}) στην ${S}: ${s.G} αγώνες, ${f1(s.pts)} πόντοι, ${f1(s.reb)} ριμπάουντ, ${f1(s.ast)} ασίστ και ${f1(s.pir)} PIR ανά αγώνα.`;
    await page(`paiktis/${p.s}/`, { view: 'player', id: p.c, h1p: n, ledep: lede,
      title: `${n} στατιστικά ${S} (${teamName(p.t)}) | ${SITE_NAME}`, desc: lede });
  }

  const today = new Date().toISOString().slice(0, 10);
  await fs.writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`).join('\n')}
</urlset>
`);
  if (AD_CLIENT) await fs.writeFile(path.join(OUT, 'ads.txt'), `google.com, ${AD_CLIENT.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}${BASE}sitemap.xml\n`);
  await fs.writeFile(path.join(OUT, '404.html'), `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Η σελίδα δεν βρέθηκε | ${SITE_NAME}</title><link rel="stylesheet" href="${BASE}assets/app.css"></head><body><main class="wrap one" style="padding-block:60px"><section><h2>Η σελίδα δεν βρέθηκε</h2><p class="sub">Ίσως ο παίκτης άλλαξε ομάδα ή η διεύθυνση γράφτηκε λάθος.</p><p><a href="${BASE}">Πίσω στη βαθμολογία</a></p></section></main></body></html>\n`);
  console.log(`Έτοιμο: ${urls.length} σελίδες στον φάκελο dist/ (${updated}).`);
}

main().catch(e => { console.error(e); process.exit(1); });
