// NBA: σελίδες του site (μόνο στα ελληνικά) από τα data/nba (scripts/nba.mjs, predictor/nba.py, scripts/nba-proj.mjs).
//   /nba/                        βαθμολογία Ανατολής/Δύσης, οι αγώνες της νύχτας με προβλέψεις
//   /nba/programma/ /nba/prognostika/ /nba/provoles/ /nba/koryfaioi/ /nba/statistika-omadon/
//   /nba/<ομάδα>/                επόμενος αγώνας, πρόγραμμα, ρόστερ, ζώνες σουτ, ζευγάρια ασίστ
//   /nba/<ομάδα>/<παίκτης>/      μέσοι όροι, shot chart, ζώνες, ασίστ, αγώνας προς αγώνα, προβολή
// Συντεταγμένες σουτ του ESPN σε πόδια: καλάθι στο (25, 0), τρίποντο 23,75 πόδια (22 στις γωνίες).
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadNba } from './projections.mjs';

const readJSON = async f => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return null; } };

/** όλα όσα χρειάζονται οι σελίδες */
export async function loadNbaSite(root) {
  const N = await loadNba(root);
  if (!N.cur) return null;
  const m = path.join(root, 'data', 'nba', 'model');
  return { ...N, model: await readJSON(path.join(m, 'latest.json')), proj: await readJSON(path.join(m, 'projections.json')),
    projEval: await readJSON(path.join(m, 'projections-eval.json')), market: await readJSON(path.join(m, 'market-eval.json')) };
}

// ---- ομάδες: ελληνικά ονόματα όπως τα γράφει ο αθλητικός τύπος, URLs, περιφέρεια
export const TEAMS = {
  ATL: ['Χοκς', 'hawks', 'E'], BOS: ['Σέλτικς', 'celtics', 'E'], BKN: ['Νετς', 'nets', 'E'], CHA: ['Χόρνετς', 'hornets', 'E'], CHI: ['Μπουλς', 'bulls', 'E'],
  CLE: ['Καβαλίερς', 'cavaliers', 'E'], DET: ['Πίστονς', 'pistons', 'E'], IND: ['Πέισερς', 'pacers', 'E'], MIA: ['Χιτ', 'heat', 'E'], MIL: ['Μπακς', 'bucks', 'E'],
  NY: ['Νικς', 'knicks', 'E'], ORL: ['Μάτζικ', 'magic', 'E'], PHI: ['Σίξερς', 'sixers', 'E'], TOR: ['Ράπτορς', 'raptors', 'E'], WSH: ['Γουίζαρντς', 'wizards', 'E'],
  DAL: ['Μάβερικς', 'mavericks', 'W'], DEN: ['Νάγκετς', 'nuggets', 'W'], GS: ['Γουόριορς', 'warriors', 'W'], HOU: ['Ρόκετς', 'rockets', 'W'], LAC: ['Κλίπερς', 'clippers', 'W'],
  LAL: ['Λέικερς', 'lakers', 'W'], MEM: ['Γκρίζλις', 'grizzlies', 'W'], MIN: ['Τίμπεργουλβς', 'timberwolves', 'W'], NO: ['Πέλικανς', 'pelicans', 'W'], OKC: ['Θάντερ', 'thunder', 'W'],
  PHX: ['Σανς', 'suns', 'W'], POR: ['Μπλέιζερς', 'blazers', 'W'], SAC: ['Κινγκς', 'kings', 'W'], SA: ['Σπερς', 'spurs', 'W'], UTAH: ['Τζαζ', 'jazz', 'W'],
};
// Έλληνες του NBA στα ελληνικά (id του ESPN)
export const GREEK = { '3032977': 'Γιάννης Αντετοκούνμπο' };
export const seasonLabel = S => `${S.slice(1)}-${String(+S.slice(1) + 1).slice(2)}`;

// ---- ζώνες σουτ (από τη θέση): καλάθι, ρακέτα, μέση απόσταση, γωνιακό τρίποντο, τρίποντο
export function zoneOf(x, y, pts) {
  const d = Math.hypot(x - 25, y);
  if (pts === 3) return (x <= 3 || x >= 47) && y <= 9 ? 'c3' : 'ab3';
  if (d < 4) return 'rim';
  if (x >= 17 && x <= 33 && y <= 13.75) return 'paint';
  return 'mid';
}
export const ZONES = [['rim', 'Κάτω από το καλάθι'], ['paint', 'Ρακέτα'], ['mid', 'Μέση απόσταση'], ['c3', 'Τρίποντο γωνίας'], ['ab3', 'Τρίποντο (υπόλοιπο)']];

/** σουτ → { zone: { a, m } } */
export function zoneSplit(shots) {
  const z = Object.fromEntries(ZONES.map(([k]) => [k, { a: 0, m: 0 }]));
  for (const s of shots) { const k = zoneOf(s[5], s[6], s[8]); z[k].a++; z[k].m += s[7]; }
  return z;
}

/** SVG μισού γηπέδου με τα σουτ (εύστοχα: κύκλοι, άστοχα: ×). Κλίμακα 10 px/πόδι, καλάθι πάνω. */
export function shotChartSvg(shots, { title = '' } = {}) {
  const X = x => (x * 10).toFixed(0), Y = y => ((y + 5.25) * 10).toFixed(0);
  const court = `<rect x="0" y="0" width="500" height="470" class="sc-floor"/>
<line x1="220" y1="40" x2="280" y2="40" class="sc-l"/><circle cx="250" cy="52.5" r="7.5" class="sc-l"/>
<rect x="170" y="0" width="160" height="190" class="sc-l"/><circle cx="250" cy="190" r="60" class="sc-l"/>
<path d="M 210 52.5 A 40 40 0 0 0 290 52.5" class="sc-l"/>
<path d="M 30 0 L 30 142 A 237.5 237.5 0 0 0 470 142 L 470 0" class="sc-l"/>`;
  const dots = shots.filter(s => s[6] <= 41).map(s => s[7]
    ? `<circle cx="${X(s[5])}" cy="${Y(s[6])}" r="5" class="sc-m"/>`
    : `<path d="M${X(s[5]) - 4} ${Y(s[6]) - 4}l8 8m0-8l-8 8" class="sc-x"/>`).join('');
  return `<figure class="shotchart"><svg viewBox="0 0 500 470" role="img" aria-label="${title}">${court}${dots}</svg><figcaption><span class="sc-k m">●</span> εύστοχο <span class="sc-k x">×</span> άστοχο</figcaption></figure>`;
}

/** μέσοι όροι παικτών της σεζόν (τελευταία ομάδα) από τα box scores */
export function nbaPlayerStats(N, S = N.cur) {
  const P = new Map();
  const games = N.seasons[S].filter(g => g.played && N.box[S][g.id]).sort((a, b) => a.date.localeCompare(b.date));
  for (const g of games) {
    const b = N.box[S][g.id];
    b.teams.forEach((t, k) => {
      const opp = b.teams[1 - k], my = k === 0 ? b.hs : b.as, op = k === 0 ? b.as : b.hs;
      for (const p of t.players) {
        if (p.dnp || !(p.min > 0)) continue;
        const o = P.get(p.id) ?? { id: p.id, name: GREEK[p.id] || p.name, latin: p.name, pos: p.pos, team: t.abbr, gp: 0, gs: 0, min: 0, pts: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, f3m: 0, f3a: 0, ftm: 0, fta: 0, pm: 0, log: [] };
        o.team = t.abbr; o.pos = p.pos || o.pos; o.gp++; if (p.starter) o.gs++;
        for (const k2 of ['min', 'pts', 'reb', 'oreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'f3m', 'f3a', 'ftm', 'fta', 'pm']) o[k2] += p[k2] || 0;
        o.log.push({ gid: g.id, date: g.date, home: k === 0, opp: opp.abbr, my, op, min: p.min, pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk, f3: `${p.f3m}/${p.f3a}`, fg: `${p.fgm}/${p.fga}`, pm: p.pm });
        P.set(p.id, o);
      }
    });
  }
  return [...P.values()].map(o => ({ ...o, mpg: o.min / o.gp, ppg: o.pts / o.gp, rpg: o.reb / o.gp, apg: o.ast / o.gp, spg: o.stl / o.gp, bpg: o.blk / o.gp, tpg: o.f3m / o.gp, topg: o.tov / o.gp,
    ts: o.pts / (2 * (o.fga + 0.44 * o.fta) || 1), efg: (o.fgm + 0.5 * o.f3m) / (o.fga || 1) }));
}

/** βαθμολογία: ποσοστό νικών, διαφορά από τον πρώτο (GB), έδρα/εκτός, 10 τελευταίοι, σερί. Χωρίς τα επίσημα κριτήρια ισοβαθμίας. */
export function nbaStandings(games) {
  const T = new Map(), get = abbr => { if (!T.has(abbr)) T.set(abbr, { abbr, w: 0, l: 0, hw: 0, hl: 0, aw: 0, al: 0, pf: 0, pa: 0, res: [] }); return T.get(abbr); };
  for (const g of games.filter(g => g.played && g.type === 2 && g.home.score != null).sort((a, b) => a.date.localeCompare(b.date))) {
    const h = get(g.home.abbr), a = get(g.away.abbr), hw = g.home.score > g.away.score;
    h.pf += g.home.score; h.pa += g.away.score; a.pf += g.away.score; a.pa += g.home.score;
    if (hw) { h.w++; h.hw++; a.l++; a.al++; } else { a.w++; a.aw++; h.l++; h.hl++; }
    h.res.push(hw ? 'W' : 'L'); a.res.push(hw ? 'L' : 'W');
  }
  const out = { E: [], W: [] };
  for (const t of T.values()) { const c = TEAMS[t.abbr]?.[2]; if (c) out[c].push({ ...t, gp: t.w + t.l, pct: t.w + t.l ? t.w / (t.w + t.l) : 0, l10: t.res.slice(-10), streak: (() => { const r = t.res; if (!r.length) return ''; let n = 0; for (let i = r.length - 1; i >= 0 && r[i] === r.at(-1); i--) n++; return `${r.at(-1) === 'W' ? 'Ν' : 'Η'}${n}`; })() }); }
  for (const c of ['E', 'W']) { out[c].sort((a, b) => b.pct - a.pct || (b.pf - b.pa) - (a.pf - a.pa)); const top = out[c][0]; out[c].forEach((t, i) => { t.pos = i + 1; t.gb = top ? ((top.w - t.w) + (t.l - top.l)) / 2 : 0; }); }
  return out;
}

/** όλες οι σελίδες: [{ key, title, desc, main, ld, noindex }] */
export function nbaPages(N, { esc, slugify, url, siteUrl, siteName, home }) {
  const S = N.cur, SL = seasonLabel(S), games = N.seasons[S], L = `NBA ${SL}`;
  const tn = a => TEAMS[a]?.[0] || a, tUrl = a => url('nba:' + (TEAMS[a]?.[1] || a.toLowerCase()));
  const fullName = new Map(); for (const g of games) { fullName.set(g.home.abbr, g.home.name); fullName.set(g.away.abbr, g.away.name); }
  const tA = a => `<a href="${tUrl(a)}">${esc(tn(a))}</a>`;
  const f1 = x => (Number.isFinite(x) ? x.toFixed(1).replace('.', ',') : '–');
  const pv = x => (Number.isFinite(x) ? (100 * x).toFixed(1).replace('.', ',') + '%' : '–');
  const pc = (m, a) => (a ? Math.round(100 * m / a) + '%' : '–');
  const sg = x => (x > 0 ? '+' : '') + f1(x);
  const when = iso => new Date(iso).toLocaleString('el-GR', { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const crumbs = list => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: siteUrl + u })) });
  const note = `<p class="note">Πηγή: ESPN (box scores και play-by-play), απουσίες από τις πεντάδες του Rotowire· ενημέρωση κάθε πρωί και κάθε βράδυ. Ώρες Ελλάδας. Οι προβλέψεις είναι στατιστικές εκτιμήσεις, όχι συμβουλές στοιχήματος· το στοίχημα επιτρέπεται μόνο άνω των 21 ετών.</p>`;
  const pages = [];
  const SECT = [['nba', 'Βαθμολογία'], ['nba:programma', 'Πρόγραμμα'], ['nba:prognostika', 'Προγνωστικά'], ['nba:provoles', 'Προβολές παικτών'], ['nba:koryfaioi', 'Κορυφαίοι'], ['nba:statistika-omadon', 'Στατιστικά ομάδων']];
  // οι ενότητες του πρωταθλήματος είναι στο κεντρικό μενού (scripts/portal-home.mjs)· εδώ μόνο οι καρτέλες «Παίκτες»
  const PSECT = ['nba:koryfaioi', 'nba:provoles'];
  const nav = cur => PSECT.includes(cur) ? `<p class="leadnav gblnav">${SECT.filter(([k]) => PSECT.includes(k)).map(([k, n]) => `<a href="${url(k)}"${k === cur ? ' aria-current="page"' : ''}>${esc(n)}</a>`).join('')}</p>` : '';
  const sect = (key, h1, lede, body, title, desc) => pages.push({ key, title, desc, main: `<section class="article ec">${nav(key)}<h1>${esc(h1)}</h1><p class="lede2">${lede}</p>${body}${note}</section>`,
    ld: [crumbs([[siteName, home], [L, url('nba')], ...(key === 'nba' ? [] : [[h1, url(key)]])])] });

  const players = nbaPlayerStats(N), PB = new Map(players.map(p => [p.id, p]));
  const pSlug = new Map(); { const u = new Set(); for (const p of players) { let s = slugify(p.latin || p.name) || p.id; if (u.has(p.team + '/' + s)) s += '-' + p.id; u.add(p.team + '/' + s); pSlug.set(p.id, s); } }
  const pUrl = p => url(`nba:${TEAMS[p.team]?.[1] || p.team.toLowerCase()}/${pSlug.get(p.id)}`);
  const pA = p => (p && TEAMS[p.team] ? `<a href="${pUrl(p)}">${esc(p.name)}</a>` : esc(p?.name || ''));
  const pred = new Map((N.model?.predictions || []).map(p => [p.id, p]));
  const estScore = p => `${Math.round((p.total + p.margin) / 2)}-${Math.round((p.total - p.margin) / 2)}`;
  const card = g => { const p = pred.get(g.id), fav = p && (p.p_home >= 0.5 ? g.home.abbr : g.away.abbr);
    return `<div class="fx"><span class="when">${esc(when(g.date))}</span><div class="row"><span>${tA(g.away.abbr)}</span><b>${g.played ? g.away.score : ''}</b></div><div class="row"><span>@ ${tA(g.home.abbr)}</span><b>${g.played ? g.home.score : ''}</b></div>${!g.played && p ? `<span class="when">Πρόβλεψη: <b>${Math.round(100 * Math.max(p.p_home, 1 - p.p_home))}%</b> ${esc(tn(fav))} · εκτίμηση ${estScore(p)}${p.out?.length ? ` · ${p.out.length} εκτός` : ''}</span>` : ''}</div>`; };
  const now = Date.now();
  const recent = games.filter(g => g.played && now - Date.parse(g.date) < 3 * 864e5).sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = games.filter(g => !g.played && Date.parse(g.date) > now - 3 * 3600e3).sort((a, b) => a.date.localeCompare(b.date));
  const next24 = upcoming.filter(g => Date.parse(g.date) < now + 30 * 3600e3);

  // ---- 1. Βαθμολογία
  const ST = nbaStandings(games);
  const stTbl = list => `<div class="tbl"><table><thead><tr><th>#</th><th class="l">Ομάδα</th><th>Ν</th><th>Η</th><th>%</th><th>Διαφ.</th><th>Έδρα</th><th>Εκτός</th><th>+/−</th><th>Σερί</th><th class="ecform">10 τελ.</th></tr></thead><tbody>${list.map(t => `<tr${t.pos <= 6 ? ' class="ecq"' : ''}><td>${t.pos}</td><td class="l">${tA(t.abbr)}</td><td>${t.w}</td><td>${t.l}</td><td>${(t.pct).toFixed(3).replace(/^0/, '')}</td><td>${t.gb ? f1(t.gb) : '–'}</td><td>${t.hw}-${t.hl}</td><td>${t.aw}-${t.al}</td><td>${sg((t.pf - t.pa) / (t.gp || 1))}</td><td>${t.streak}</td><td class="ecform">${t.l10.filter(x => x === 'W').length}-${t.l10.filter(x => x === 'L').length}</td></tr>`).join('')}</tbody></table></div>`;
  sect('nba', L, 'Η βαθμολογία της Ανατολής και της Δύσης, οι αγώνες της νύχτας με τις προβλέψεις του μοντέλου μας, και όλα τα στατιστικά του NBA στα ελληνικά.',
    `${next24.length ? `<h2>Οι αγώνες της νύχτας</h2><div class="ecfx">${next24.map(card).join('')}</div><p class="sub"><a href="${url('nba:prognostika')}">Όλα τα προγνωστικά →</a> · <a href="${url('nba:provoles')}">Προβολές παικτών →</a></p>` : ''}
<div class="ecgrid"><div><h2>Ανατολή</h2>${stTbl(ST.E)}</div><div><h2>Δύση</h2>${stTbl(ST.W)}</div></div>
<p class="sub">Με χρώμα οι 6 πρώτοι (playoffs). Οι 7οι–10οι παίζουν play-in. +/−: μέση διαφορά πόντων. Η σειρά είναι με το ποσοστό νικών· τα επίσημα κριτήρια ισοβαθμίας του NBA δεν εφαρμόζονται.</p>
${recent.length ? `<h2>Πρόσφατα αποτελέσματα</h2><div class="ecfx">${recent.slice(0, 15).map(card).join('')}</div>` : ''}`,
    `NBA ${SL}: βαθμολογία, αποτελέσματα, προγνωστικά στα ελληνικά | ${siteName}`,
    `Η βαθμολογία του NBA ${SL} (Ανατολή και Δύση), αποτελέσματα, πρόγραμμα, προγνωστικά, προβολές παικτών και shot charts, στα ελληνικά.`);

  // ---- 2. Πρόγραμμα
  const byDay = new Map(); for (const g of [...games.filter(g => g.played && now - Date.parse(g.date) < 7 * 864e5), ...upcoming.filter(g => Date.parse(g.date) < now + 10 * 864e5)].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = new Date(g.date).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'long' }); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(g); }
  sect('nba:programma', `Πρόγραμμα NBA ${SL}`, 'Τα αποτελέσματα της τελευταίας εβδομάδας και οι αγώνες των επόμενων 10 ημερών, σε ώρα Ελλάδας, με πρόβλεψη για όσους πλησιάζουν.',
    [...byDay].map(([k, gs]) => `<h2>${esc(k)}</h2><div class="ecfx">${gs.map(card).join('')}</div>`).join(''),
    `Πρόγραμμα NBA σε ώρα Ελλάδας και αποτελέσματα | ${siteName}`, `Το πρόγραμμα του NBA σε ώρα Ελλάδας: οι αγώνες των επόμενων ημερών και τα αποτελέσματα της εβδομάδας.`);

  // ---- 3. Προγνωστικά
  const M = N.model || {}, bt = M.backtest, ME = N.market;
  const acc = bt ? `<h2>Πόσο πέφτει μέσα το μοντέλο</h2><p>Κάθε αγώνας προβλέφθηκε μόνο με όσα ήταν γνωστά πριν από αυτόν (walk-forward, χωρίς να «ξέρει» το αποτέλεσμα).</p>
<div class="tbl"><table><thead><tr><th class="l"></th><th>Αγώνες</th><th>Βρήκε τον νικητή</th></tr></thead><tbody><tr><td class="l">«Πάντα ο γηπεδούχος»</td><td>${bt.n}</td><td>${pv(bt.home_accuracy)}</td></tr>${bt.elo_accuracy != null ? `<tr><td class="l">Elo (μόνο τα σκορ)</td><td>${bt.n}</td><td>${pv(bt.elo_accuracy)}</td></tr>` : ''}<tr><td class="l"><b>Μοντέλο BasketballStats</b></td><td>${bt.n}</td><td><b>${pv(bt.accuracy)}</b></td></tr></tbody></table></div>
<p class="sub">Μέσο λάθος στη διαφορά πόντων: ${f1(bt.margin_mae)} · στο σύνολο πόντων: ${f1(bt.total_mae)}.</p>` : '';
  const mkt = ME?.games >= 30 ? `<h2>Μοντέλο έναντι αγοράς</h2><p>Σε ${ME.games} αγώνες με προβλέψεις κλειδωμένες πριν από το τζάμπολ: Brier μοντέλου ${String(ME.brier.model).replace('.', ',')}, αγοράς ${String(ME.brier.market).replace('.', ',')} (όσο μικρότερο, τόσο πιο σωστές οι πιθανότητες).</p>` : '';
  const dayPred = upcoming.filter(g => pred.has(g.id));
  sect('nba:prognostika', 'Προγνωστικά NBA', 'Πιθανότητα νίκης και εκτιμώμενο σκορ για κάθε αγώνα των επόμενων ημερών, με τις απουσίες της βραδιάς από τις πεντάδες του Rotowire.',
    (dayPred.length ? `<div class="ecfx">${dayPred.map(card).join('')}</div>` : '<p>Δεν υπάρχουν ακόμα προβλέψεις για τους επόμενους αγώνες.</p>') + acc + mkt,
    `Προγνωστικά NBA: πρόβλεψη για κάθε αγώνα | ${siteName}`, `Προγνωστικά για κάθε αγώνα του NBA: πιθανότητα νίκης, εκτιμώμενο σκορ, απουσίες και πόσο πέφτει μέσα το μοντέλο.`);

  // ---- 4. Προβολές παικτών
  const PJ = N.proj, PJP = new Map((PJ?.games || []).flatMap(g => g.players.map(x => [x.pid, { ...x, g }])));
  const pjTbl = (list, noPlay) => `<div class="tbl"><table><thead><tr><th class="l">Παίκτης</th><th>Λεπ.</th><th>Π</th><th>Ριμπ.</th><th>Ασ.</th><th>3Π</th><th>PRA</th>${noPlay ? '' : '<th>Παίζει</th>'}</tr></thead><tbody>${list.map(x => `<tr><td class="l">${pA(PB.get(x.pid) || { name: x.name, team: x.team, id: x.pid })}${x.status ? ` <small class="muted">${esc(x.status)}</small>` : ''}</td><td>${f1(x.min)}</td><td><b>${f1(x.pts)}</b></td><td>${f1(x.reb)}</td><td>${f1(x.ast)}</td><td>${f1(x.fg3)}</td><td><b>${f1(x.pra)}</b></td>${noPlay ? '' : `<td>${Math.round(100 * x.p_play)}%</td>`}</tr>`).join('')}</tbody></table></div>`;
  const PE = N.projEval?.mae;
  sect('nba:provoles', 'Προβολές παικτών NBA', 'Τι περιμένουμε από κάθε παίκτη στον επόμενο αγώνα, αν παίξει: λεπτά, πόντοι, ριμπάουντ, ασίστ, τρίποντα και PRA (πόντοι + ριμπάουντ + ασίστ). Η στήλη «Παίζει» βγαίνει από το Rotowire (Probable 75%, Questionable 50%, Doubtful 25%)· όσοι είναι Out δεν εμφανίζονται.',
    ((PJ?.games || []).length ? PJ.games.map(g => `<h2>${esc(tn(g.away))} – ${esc(tn(g.home))}</h2><p class="sub">${esc(when(g.date))}</p><div class="ecgrid">${[g.away, g.home].map(t => `<div><h3>${tA(t)}</h3>${pjTbl(g.players.filter(x => x.team === t).slice(0, 10))}</div>`).join('')}</div>`).join('') : '<p>Δεν υπάρχουν προβολές για τους επόμενους αγώνες.</p>')
    + (PE ? `<h2>Πόσο πέφτουν μέσα</h2><p>Έλεγχος σε ${N.projEval.n.toLocaleString('el-GR')} εμφανίσεις παικτών, όπου κάθε προβολή έγινε μόνο με τους αγώνες πριν από αυτόν. Μέσο λάθος:</p><div class="tbl"><table><thead><tr><th class="l"></th><th>Λεπτά</th><th>Π</th><th>Ριμπ.</th><th>Ασ.</th><th>3Π</th><th>PRA</th></tr></thead><tbody>${[['Μέσος όρος σεζόν', PE.avg], ['Μέσος όρος 5 τελευταίων', PE.last5], ['<b>Προβολή BasketballStats</b>', PE.model]].map(([n, e]) => `<tr><td class="l">${n}</td>${['min', 'pts', 'reb', 'ast', 'fg3', 'pra'].map(k => `<td>${f1(e[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''),
    `Προβολές παικτών NBA: πόντοι, ριμπάουντ, ασίστ, PRA | ${siteName}`, `Πόσους πόντους, ριμπάουντ, ασίστ και τρίποντα περιμένουμε από κάθε παίκτη του NBA απόψε, με τις απουσίες της βραδιάς.`);

  // ---- 5. Κορυφαίοι
  const teamGp = new Map(); for (const t of [...ST.E, ...ST.W]) teamGp.set(t.abbr, t.gp);
  const qual = players.filter(p => p.gp >= Math.max(5, 0.5 * (teamGp.get(p.team) || 0)) && p.mpg >= 15);
  const top = (list, v, fm) => `<div class="tbl"><table><tbody>${list.slice().sort((a, b) => v(b) - v(a)).slice(0, 10).map((p, i) => `<tr><td>${i + 1}</td><td class="l">${pA(p)} <small class="muted">${esc(tn(p.team))}</small></td><td><b>${fm(v(p))}</b></td></tr>`).join('')}</tbody></table></div>`;
  const CAT = [['Πόντοι', p => p.ppg, f1], ['Ριμπάουντ', p => p.rpg, f1], ['Ασίστ', p => p.apg, f1], ['Κλεψίματα', p => p.spg, f1], ['Κοψίματα', p => p.bpg, f1], ['Τρίποντα (εύστοχα)', p => p.tpg, f1],
    ['True Shooting %', p => p.ts, pv, p => p.fga >= 8 * p.gp], ['Τρίποντα %', p => p.f3m / p.f3a, pv, p => p.f3a >= 3 * p.gp], ['Βολές %', p => p.ftm / p.fta, pv, p => p.fta >= 2 * p.gp], ['Λεπτά', p => p.mpg, f1]];
  sect('nba:koryfaioi', `Κορυφαίοι NBA ${SL}`, 'Οι κορυφαίοι της σεζόν σε κάθε κατηγορία, σε μέσους όρους ανά αγώνα (όσοι έχουν παίξει τουλάχιστον τους μισούς αγώνες της ομάδας τους, με 15+ λεπτά).',
    `<div class="ecgrid">${CAT.map(([n, v, fm, ok]) => `<div><h3>${n}</h3>${top(ok ? qual.filter(ok) : qual, v, fm)}</div>`).join('')}</div>`,
    `Κορυφαίοι NBA ${SL}: πόντοι, ριμπάουντ, ασίστ, τρίποντα | ${siteName}`, `Οι κορυφαίοι παίκτες του NBA ${SL} σε πόντους, ριμπάουντ, ασίστ, κλεψίματα, κοψίματα, τρίποντα και ποσοστά.`);

  // ---- 6. Στατιστικά ομάδων: ανά 100 κατοχές, Four Factors, πού σουτάρουν
  const TS = new Map(), tShots = new Map();
  for (const g of games.filter(g => g.played && N.box[S][g.id])) {
    const b = N.box[S][g.id], [x, y] = b.teams.map(t => t.totals || {});
    const poss = t => t.fga - t.oreb + t.tov + 0.44 * t.fta;
    [[b.teams[0].abbr, x, y, b.teams[0].id], [b.teams[1].abbr, y, x, b.teams[1].id]].forEach(([ab, me, op, tid]) => {
      const o = TS.get(ab) ?? { gp: 0, pts: 0, opp: 0, poss: 0, oposs: 0, fgm: 0, f3m: 0, fga: 0, ofgm: 0, of3m: 0, ofga: 0, tov: 0, otov: 0, oreb: 0, dreb: 0, ooreb: 0, odreb: 0, fta: 0, ofta: 0, ast: 0 };
      o.gp++; o.pts += me.pts; o.opp += op.pts; o.poss += poss(me); o.oposs += poss(op); o.fgm += me.fgm; o.f3m += me.f3m; o.fga += me.fga; o.ofgm += op.fgm; o.of3m += op.f3m; o.ofga += op.fga;
      o.tov += me.tov; o.otov += op.tov; o.oreb += me.oreb; o.dreb += me.dreb; o.ooreb += op.oreb; o.odreb += op.dreb; o.fta += me.fta; o.ofta += op.fta; o.ast += me.ast;
      TS.set(ab, o);
      const l = tShots.get(ab) || []; for (const s of b.shots) if (s[2] === tid) l.push(s); tShots.set(ab, l);
    });
  }
  const TR = [...TS].map(([ab, o]) => { const P = (o.poss + o.oposs) / 2; return { ab, ortg: 100 * o.pts / P, drtg: 100 * o.opp / P, net: 100 * (o.pts - o.opp) / P, pace: P / o.gp, efg: (o.fgm + 0.5 * o.f3m) / o.fga, oefg: (o.ofgm + 0.5 * o.of3m) / o.ofga, tovp: o.tov / o.poss, otovp: o.otov / o.oposs, orb: o.oreb / (o.oreb + o.odreb), drb: o.dreb / (o.dreb + o.ooreb), ftr: o.fta / o.fga, astp: o.ast / o.fgm }; }).sort((a, b) => b.net - a.net);
  const zs = new Map([...tShots].map(([ab, l]) => [ab, zoneSplit(l)]));
  const lgZ = zoneSplit([...tShots.values()].flat());
  sect('nba:statistika-omadon', `Στατιστικά ομάδων NBA ${SL}`, 'Επίθεση και άμυνα ανά 100 κατοχές, ρυθμός, τα «Four Factors» και από πού σουτάρει κάθε ομάδα (μερίδιο σουτ ανά ζώνη και ποσοστό).',
    `<h2>Επίθεση, άμυνα, ρυθμός</h2><div class="tbl"><table><thead><tr><th class="l">Ομάδα</th><th>Επίθεση</th><th>Άμυνα</th><th>Net</th><th>Κατοχές</th></tr></thead><tbody>${TR.map(t => `<tr><td class="l">${tA(t.ab)}</td><td>${f1(t.ortg)}</td><td>${f1(t.drtg)}</td><td><b>${sg(t.net)}</b></td><td>${f1(t.pace)}</td></tr>`).join('')}</tbody></table></div>
<h2>Four Factors</h2><div class="tbl"><table><thead><tr><th class="l">Ομάδα</th><th>eFG%</th><th>Λάθη%</th><th>Επ. ριμπ.%</th><th>Βολές/σουτ</th><th>eFG% αντ.</th><th>Λάθη% αντ.</th><th>Αμ. ριμπ.%</th><th>Ασίστ%</th></tr></thead><tbody>${TR.map(t => `<tr><td class="l">${tA(t.ab)}</td><td>${pv(t.efg)}</td><td>${pv(t.tovp)}</td><td>${pv(t.orb)}</td><td>${f1(100 * t.ftr)}</td><td>${pv(t.oefg)}</td><td>${pv(t.otovp)}</td><td>${pv(t.drb)}</td><td>${pv(t.astp)}</td></tr>`).join('')}</tbody></table></div>
<h2>Από πού σουτάρουν</h2><div class="tbl"><table><thead><tr><th class="l">Ομάδα</th>${ZONES.map(([, n]) => `<th>${n}</th>`).join('')}</tr></thead><tbody>${TR.map(t => { const z = zs.get(t.ab), tot = Object.values(z).reduce((a, x) => a + x.a, 0); return `<tr><td class="l">${tA(t.ab)}</td>${ZONES.map(([k]) => `<td>${Math.round(100 * z[k].a / tot)}% <small class="muted">${pc(z[k].m, z[k].a)}</small></td>`).join('')}</tr>`; }).join('')}<tr><td class="l"><b>Μέσος όρος NBA</b></td>${ZONES.map(([k]) => { const tot = Object.values(lgZ).reduce((a, x) => a + x.a, 0); return `<td><b>${Math.round(100 * lgZ[k].a / tot)}%</b> <small class="muted">${pc(lgZ[k].m, lgZ[k].a)}</small></td>`; }).join('')}</tr></tbody></table></div>
<p class="sub">Σε κάθε κελί: τι ποσοστό των σουτ της ομάδας είναι από αυτή τη ζώνη, και (μικρά) πόσα μπαίνουν. Ζώνες από τη θέση κάθε σουτ στο play-by-play.</p>`,
    `Στατιστικά ομάδων NBA ${SL}: επίθεση, άμυνα, Four Factors, ζώνες σουτ | ${siteName}`, `Τα στατιστικά των ομάδων του NBA ${SL} ανά 100 κατοχές: επίθεση, άμυνα, ρυθμός, Four Factors και από πού σουτάρει κάθε ομάδα.`);

  // ---- ομάδες
  const shotsBy = new Map(), astBy = new Map();     // παίκτης → σουτ · (ασίστ → σουτέρ) → εύστοχα
  for (const g of games.filter(g => g.played && N.box[S][g.id])) for (const s of N.box[S][g.id].shots) {
    (shotsBy.get(s[3]) || shotsBy.set(s[3], []).get(s[3])).push(s);
    if (s[4] && s[7]) { const k = s[4] + '>' + s[3]; astBy.set(k, (astBy.get(k) || 0) + s[8]); }
  }
  const pairs = [...astBy].map(([k, pts]) => { const [a, b] = k.split('>'); return { a, b, pts }; });
  const zoneTbl = (z, ref) => `<div class="tbl"><table><thead><tr><th class="l">Ζώνη</th><th>Σουτ</th><th>Εύστοχα</th><th>%</th>${ref ? '<th>NBA</th>' : ''}</tr></thead><tbody>${ZONES.map(([k, n]) => `<tr><td class="l">${n}</td><td>${z[k].a}</td><td>${z[k].m}</td><td><b>${pc(z[k].m, z[k].a)}</b></td>${ref ? `<td>${pc(ref[k].m, ref[k].a)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  for (const ab of Object.keys(TEAMS)) {
    const T = [...ST.E, ...ST.W].find(t => t.abbr === ab); if (!T) continue;
    const gs = games.filter(g => g.home.abbr === ab || g.away.abbr === ab).sort((a, b) => a.date.localeCompare(b.date));
    const ros = players.filter(p => p.team === ab).sort((a, b) => b.mpg - a.mpg);
    const next = gs.find(g => !g.played && Date.parse(g.date) > now - 3 * 3600e3), np = next && pred.get(next.id);
    const A = TR.find(t => t.ab === ab), rk = k => TR.slice().sort((a, b) => k === 'drtg' ? a[k] - b[k] : b[k] - a[k]).findIndex(t => t.ab === ab) + 1;
    const ids = new Set(ros.map(p => p.id)), tp = pairs.filter(x => ids.has(x.a) && ids.has(x.b)).sort((a, b) => b.pts - a.pts).slice(0, 8);
    const res = g => { const h = g.home.abbr === ab, my = h ? g.home.score : g.away.score, op = h ? g.away.score : g.home.score; return `<b class="${my > op ? 'ecw' : 'ecl'}">${my > op ? 'Ν' : 'Η'} ${my}-${op}</b>`; };
    const last = gs.filter(g => g.played).slice(-10), fut = gs.filter(g => !g.played).slice(0, 8);
    const pjL = next ? (PJ?.games || []).find(x => x.gid === next.id)?.players.filter(x => x.team === ab).slice(0, 10) || [] : [];
    const main = `<section class="article ec">${nav('')}<p class="crumbs"><a href="${url('nba')}">${esc(L)}</a></p>
<h1>${esc(tn(ab))}</h1><p class="sub">${esc(fullName.get(ab) || '')} · ${T.pos}η θέση στη ${TEAMS[ab][2] === 'E' ? 'Ανατολή' : 'Δύση'} · ${T.w}-${T.l} · Έδρα ${T.hw}-${T.hl} · Εκτός ${T.aw}-${T.al} · Σερί ${T.streak}</p>
${next ? `<section class="nextbox"><p class="kicker">Επόμενος αγώνας</p><h2>${esc(tn(next.away.abbr))} – ${esc(tn(next.home.abbr))}</h2><p>🕒 ${esc(when(next.date))} (ώρα Ελλάδας)</p>${np ? `<p>Πρόβλεψη: <b>${Math.round(100 * (next.home.abbr === ab ? np.p_home : 1 - np.p_home))}%</b> πιθανότητα νίκης για ${esc(tn(ab))} · εκτίμηση ${estScore(np)}</p>` : ''}</section>` : ''}
${pjL.length ? `<h2>Προβολές για τον επόμενο αγώνα</h2>${pjTbl(pjL)}` : ''}
${A ? `<h2>Ανά 100 κατοχές</h2><div class="tbl"><table><thead><tr><th>Επίθεση</th><th>Άμυνα</th><th>Net</th><th>Κατοχές</th><th>eFG%</th><th>Λάθη%</th></tr></thead><tbody><tr><td><b>${f1(A.ortg)}</b> <small class="muted">${rk('ortg')}η</small></td><td><b>${f1(A.drtg)}</b> <small class="muted">${rk('drtg')}η</small></td><td><b>${sg(A.net)}</b> <small class="muted">${rk('net')}η</small></td><td>${f1(A.pace)}</td><td>${pv(A.efg)}</td><td>${pv(A.tovp)}</td></tr></tbody></table></div>` : ''}
<h2>Τελευταίοι αγώνες και πρόγραμμα</h2><div class="tbl"><table><tbody>${[...last.slice().reverse(), ...fut].map(g => { const h = g.home.abbr === ab; return `<tr><td class="l">${esc(new Date(g.date).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short' }))}</td><td class="l">${h ? '' : '@ '}${tA(h ? g.away.abbr : g.home.abbr)}</td><td>${g.played ? res(g) : esc(when(g.date))}</td></tr>`; }).join('')}</tbody></table></div>
${ros.length ? `<h2>Ρόστερ και μέσοι όροι</h2><div class="tbl"><table><thead><tr><th class="l">Παίκτης</th><th>Αγ.</th><th>Λεπ.</th><th>Π</th><th>Ριμπ.</th><th>Ασ.</th><th>3Π%</th><th>TS%</th></tr></thead><tbody>${ros.map(p => `<tr><td class="l">${pA(p)}</td><td>${p.gp}</td><td>${f1(p.mpg)}</td><td><b>${f1(p.ppg)}</b></td><td>${f1(p.rpg)}</td><td>${f1(p.apg)}</td><td>${pc(p.f3m, p.f3a)}</td><td>${pv(p.ts)}</td></tr>`).join('')}</tbody></table></div>` : ''}
<h2>Από πού σουτάρει</h2>${zoneTbl(zs.get(ab) || zoneSplit([]), lgZ)}
${tp.length ? `<h2>Ποιος βρίσκει ποιον</h2><p class="sub">Πόντοι από καλάθια μετά από ασίστ, στη σεζόν.</p><div class="tbl"><table><thead><tr><th class="l">Ασίστ</th><th class="l">Σουτέρ</th><th>Πόντοι</th></tr></thead><tbody>${tp.map(x => `<tr><td class="l">${pA(PB.get(x.a))}</td><td class="l">${pA(PB.get(x.b))}</td><td><b>${x.pts}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
${note}</section>`;
    pages.push({ key: 'nba:' + TEAMS[ab][1], title: `${tn(ab)} (${fullName.get(ab) || ab}): πρόγραμμα, αποτελέσματα, ρόστερ | NBA ${SL}`, desc: `Οι ${tn(ab)} στο NBA ${SL}: επόμενος αγώνας με πρόβλεψη, αποτελέσματα, ρόστερ με μέσους όρους, από πού σουτάρουν και ποιος βρίσκει ποιον.`, main,
      ld: [{ '@context': 'https://schema.org', '@type': 'SportsTeam', name: fullName.get(ab) || ab, alternateName: tn(ab), sport: 'Basketball', url: siteUrl + tUrl(ab), memberOf: { '@type': 'SportsOrganization', name: 'NBA' } }, crumbs([[siteName, home], [L, url('nba')], [tn(ab), tUrl(ab)]])] });
  }

  // ---- παίκτες
  for (const p of players) {
    if (!TEAMS[p.team]) continue;
    const sh = shotsBy.get(p.id) || [], z = zoneSplit(sh), u = pUrl(p);
    const from = pairs.filter(x => x.b === p.id).sort((a, b) => b.pts - a.pts).slice(0, 5), to = pairs.filter(x => x.a === p.id).sort((a, b) => b.pts - a.pts).slice(0, 5);
    const pj = PJP.get(p.id);
    const main = `<section class="article ec">${nav('')}<p class="crumbs"><a href="${url('nba')}">${esc(L)}</a> › ${tA(p.team)}</p>
<h1>${esc(p.name)}</h1><p class="sub">${esc(tn(p.team))}${p.pos ? ` · ${esc(p.pos)}` : ''} · ${p.gp} αγώνες (${p.gs} βασικός) · ${f1(p.mpg)} λεπτά</p>
<div class="tbl"><table><thead><tr><th>Π</th><th>Ριμπ.</th><th>Ασ.</th><th>Κλ.</th><th>Κοψ.</th><th>Λάθη</th><th>Σουτ%</th><th>3Π%</th><th>Βολές%</th><th>TS%</th></tr></thead><tbody><tr><td><b>${f1(p.ppg)}</b></td><td>${f1(p.rpg)}</td><td>${f1(p.apg)}</td><td>${f1(p.spg)}</td><td>${f1(p.bpg)}</td><td>${f1(p.topg)}</td><td>${pc(p.fgm, p.fga)}</td><td>${pc(p.f3m, p.f3a)}</td><td>${pc(p.ftm, p.fta)}</td><td>${pv(p.ts)}</td></tr></tbody></table></div>
${pj ? `<h2>Επόμενος αγώνας: ${pj.team === pj.g.home ? '' : '@ '}${esc(tn(pj.team === pj.g.home ? pj.g.away : pj.g.home))}</h2><p class="sub">${esc(when(pj.g.date))} · προβολή αν παίξει${pj.status ? ` · ${esc(pj.status)}` : ''}</p>${pjTbl([pj], true)}` : ''}
${sh.length >= 20 ? `<h2>Shot chart</h2>${shotChartSvg(sh, { title: `Σουτ του ${p.name}` })}<h3>Ανά ζώνη</h3>${zoneTbl(z, lgZ)}` : ''}
${from.length || to.length ? `<h2>Ασίστ</h2><div class="ecgrid">${from.length ? `<div><h3>Του δίνουν</h3><div class="tbl"><table><tbody>${from.map(x => `<tr><td class="l">${pA(PB.get(x.a))}</td><td><b>${x.pts}</b> π.</td></tr>`).join('')}</tbody></table></div></div>` : ''}${to.length ? `<div><h3>Δίνει σε</h3><div class="tbl"><table><tbody>${to.map(x => `<tr><td class="l">${pA(PB.get(x.b))}</td><td><b>${x.pts}</b> π.</td></tr>`).join('')}</tbody></table></div></div>` : ''}</div>` : ''}
<h2>Αγώνας προς αγώνα</h2><div class="tbl"><table><thead><tr><th class="l">Ημ.</th><th class="l">Αντίπαλος</th><th>Σκορ</th><th>Λεπ.</th><th>Π</th><th>Ριμπ.</th><th>Ασ.</th><th>Σουτ</th><th>3Π</th><th>+/−</th></tr></thead><tbody>${p.log.slice().reverse().map(r => `<tr><td class="l">${esc(new Date(r.date).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short' }))}</td><td class="l">${r.home ? '' : '@ '}${TEAMS[r.opp] ? tA(r.opp) : esc(r.opp)}</td><td><b class="${r.my > r.op ? 'ecw' : 'ecl'}">${r.my > r.op ? 'Ν' : 'Η'} ${r.my}-${r.op}</b></td><td>${r.min}</td><td><b>${r.pts}</b></td><td>${r.reb}</td><td>${r.ast}</td><td>${r.fg}</td><td>${r.f3}</td><td>${r.pm > 0 ? '+' : ''}${r.pm}</td></tr>`).join('')}</tbody></table></div>
${note}</section>`;
    pages.push({ key: `nba:${TEAMS[p.team][1]}/${pSlug.get(p.id)}`, title: `${p.name} (${tn(p.team)}): στατιστικά, shot chart | NBA ${SL}`,
      desc: `${p.name} στο NBA ${SL} με τους ${tn(p.team)}: ${f1(p.ppg)} πόντοι, ${f1(p.rpg)} ριμπάουντ, ${f1(p.apg)} ασίστ ανά αγώνα, shot chart, από πού σουτάρει και αγώνας προς αγώνα.`, main,
      ld: [{ '@context': 'https://schema.org', '@type': 'Person', name: p.name, ...(p.latin && p.latin !== p.name ? { alternateName: p.latin } : {}), url: siteUrl + u, memberOf: { '@type': 'SportsTeam', name: fullName.get(p.team) || p.team, url: siteUrl + tUrl(p.team) } }, crumbs([[siteName, home], [L, url('nba')], [tn(p.team), tUrl(p.team)], [p.name, u]])],
      noindex: p.gp < 5 });
  }
  return pages;
}
