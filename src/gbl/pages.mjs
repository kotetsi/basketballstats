// Stoiximan GBL: σελίδες του site (μόνο στα ελληνικά) από τα data/gbl (scripts/gbl.mjs) και το μοντέλο (predictor/gbl.py).
//   /gbl/                         βαθμολογία, προβλέψεις επόμενης αγωνιστικής, αποτελέσματα, κορυφαίοι, ακρίβεια μοντέλου
//   /gbl/<ομάδα>/                 πρόγραμμα, αποτελέσματα, ρόστερ με μέσους όρους, επόμενος αγώνας με πρόβλεψη
//   /gbl/<ομάδα>/<παίκτης>/       μέσοι όροι και αγώνας προς αγώνα
// Καθαρές συναρτήσεις: το build.mjs δίνει τα εργαλεία του (esc, slugify, url) και γράφει τις σελίδες.
import fs from 'node:fs/promises';
import path from 'node:path';

const readJSON = async f => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return null; } };

/** όλα όσα χρειάζονται οι σελίδες: πρόγραμμα όλων των σεζόν, box scores της τρέχουσας, μοντέλο */
export async function loadGbl(root) {
  const base = path.join(root, 'data', 'gbl');
  let dirs = [];
  try { dirs = (await fs.readdir(base)).filter(d => /^G\d{4}$/.test(d)).sort(); } catch { return null; }
  const seasons = {};
  for (const S of dirs) { const j = await readJSON(path.join(base, S, 'games.json')); if (j?.games?.length) seasons[S] = j.games; }
  const cur = Object.keys(seasons).sort().at(-1);
  if (!cur) return null;
  const box = {};
  for (const g of seasons[cur]) if (g.box) { const b = await readJSON(path.join(base, cur, 'box', `${g.id}.json`)); if (b) box[g.id] = b; }
  // Έλληνες παίκτες στα ελληνικά: data/gbl/greek-names.json (id παίκτη → όνομα), αλλιώς το data/greek-names.json της EuroLeague
  const gn = { ...(await readJSON(path.join(base, 'greek-names.json')) || {}) }; delete gn._σχόλιο; delete gn._latin;
  const el = await readJSON(path.join(root, 'data', 'greek-names.json')) || {};
  return { cur, seasons, box, model: await readJSON(path.join(base, 'model', 'latest.json')), players: await readJSON(path.join(base, 'players.json')) || {}, gn, el };
}

// ---- ονόματα: το esake.gr γράφει κεφαλαία και με χορηγούς. Σύντομο ελληνικό όνομα για πίνακες και URLs.
const SHORT = [
  [/ΠΑΝΑΘΗΝΑ/, 'Παναθηναϊκός'], [/ΟΛΥΜΠΙΑΚ/, 'Ολυμπιακός'], [/^ΑΕΚ\b/, 'ΑΕΚ'], [/^ΑΡΗΣ/, 'Άρης'], [/^ΠΑΟΚ/, 'ΠΑΟΚ'],
  [/ΠΕΡΙΣΤΕΡ/, 'Περιστέρι'], [/ΠΡΟΜΗΘ/, 'Προμηθέας'], [/ΚΟΛΟΣΣ/, 'Κολοσσός'], [/ΜΑΡΟΥΣ/, 'Μαρούσι'], [/ΚΑΡΔΙΤΣ/, 'Καρδίτσα'],
  [/ΜΥΚΟΝ/, 'Μύκονος'], [/ΗΡΑΚΛΗ/, 'Ηρακλής'], [/ΛΑΥΡΙ/, 'Λαύριο'], [/ΠΑΝΙΩΝ/, 'Πανιώνιος'], [/ΔΟΞΑ/, 'Δόξα Λευκάδας'],
  [/VIKOS|ΦALCONS|FALCONS/i, 'Vikos Falcons'], [/ΑΠΟΛΛΩΝ/, 'Απόλλων Πάτρας'], [/ΙΩΝΙΚ/, 'Ιωνικός'], [/ΨΥΧΙΚ/, 'Ψυχικό'],
  [/ΚΗΦΙΣ/, 'Κηφισιά'], [/ΡΟΔ|ΚΟΛΟΣΣΟΣ ΡΟΔΟΥ/, 'Κολοσσός'], [/ΧΑΛΚΙΔ/, 'Χαλκίδα'], [/ΑΙΓΑΛ/, 'Αιγάλεω'],
];
// URLs σε greeklish όπως τα γράφει ο κόσμος (το slugify δίνει «maroysi»)
const SLUG = { 'Μαρούσι': 'marousi', 'Δόξα Λευκάδας': 'doxa-lefkadas', 'Ολυμπιακός': 'olympiacos', 'Κηφισιά': 'kifisia', 'Απόλλων Πάτρας': 'apollon-patras', 'Ψυχικό': 'psychiko' };
export const teamSlug = (n, slugify) => SLUG[n] || slugify(n);
export const shortName = full => { const s = String(full || '').trim(); for (const [re, n] of SHORT) if (re.test(s)) return n; return s; };
/** το esake.gr γράφει «ΕΠΩΝΥΜΟ ΟΝΟΜΑ» με κεφαλαία: «VEZENKOV SASHA» → «Sasha Vezenkov», «DE SOUSA SILVIO» → «Silvio De Sousa».
 *  Με 3+ λέξεις χωρίς πρόθεμα επωνύμου η σειρά δεν είναι σίγουρη, οπότε μένει όπως είναι. */
const cap = w => /^([A-ZΑ-Ω]\.)+$/.test(w) ? w : w.split(/([-'’])/).map(x => /^[-'’]$/.test(x) ? x : x.charAt(0) + x.slice(1).toLocaleLowerCase('el')).join('').replace(/^Mc([a-z])/, (_, c) => 'Mc' + c.toUpperCase());
const PART = /^(DE|DA|DI|DOS|DEL|VAN|VON|LE|LA|EL|AL|MAC|ST\.?)$/i;
export const niceName = s => {
  const w = String(s || '').trim().split(/\s+/).filter(Boolean);
  let o = w;
  if (w.length === 2) o = [w[1], w[0]];
  else if (w.length === 3 && PART.test(w[0])) o = [w[2], w[0], w[1]];
  return o.map(cap).join(' ');
};
export const seasonLabel = S => `${S.slice(1)}-${String(+S.slice(1) + 1).slice(2)}`;

/** βαθμολογία κανονικής περιόδου: νίκη 2 βαθμοί, ήττα 1. Ισοβαθμία: μεταξύ τους αγώνες (νίκες, διαφορά), μετά συνολική διαφορά. */
export function standings(games) {
  const T = new Map(), add = (id, name) => { if (!T.has(id)) T.set(id, { id, name, w: 0, l: 0, pf: 0, pa: 0, hw: 0, hl: 0, aw: 0, al: 0, form: [] }); return T.get(id); };
  const reg = games.filter(g => g.phase !== 'playoffs');
  for (const g of reg) { add(g.home.logo, g.home.name); add(g.away.logo, g.away.name); }
  const played = reg.filter(g => g.played).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const g of played) {
    const h = T.get(g.home.logo), a = T.get(g.away.logo), hw = g.hs > g.as;
    h.pf += g.hs; h.pa += g.as; a.pf += g.as; a.pa += g.hs;
    if (hw) { h.w++; h.hw++; a.l++; a.al++; } else { a.w++; a.aw++; h.l++; h.hl++; }
    h.form.push(hw ? 'W' : 'L'); a.form.push(hw ? 'L' : 'W');
  }
  const pts = t => 2 * t.w + t.l;
  const h2h = (ids, id) => { let w = 0, d = 0; for (const g of played) { const H = g.home.logo, A = g.away.logo; if (!ids.has(H) || !ids.has(A) || (H !== id && A !== id)) continue; const my = H === id ? g.hs : g.as, op = H === id ? g.as : g.hs; if (my > op) w++; d += my - op; } return [w, d]; };
  const rows = [...T.values()].sort((a, b) => pts(b) - pts(a) || b.pf - b.pa - (a.pf - a.pa));
  // ομάδες με ίδιους βαθμούς: ταξινόμηση με τα μεταξύ τους
  const out = [];
  for (let i = 0; i < rows.length;) {
    let j = i; while (j < rows.length && pts(rows[j]) === pts(rows[i])) j++;
    const grp = rows.slice(i, j), ids = new Set(grp.map(t => t.id));
    if (grp.length > 1) grp.sort((a, b) => { const [wa, da] = h2h(ids, a.id), [wb, db] = h2h(ids, b.id); return wb - wa || db - da || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf; });
    out.push(...grp); i = j;
  }
  return out.map((t, i) => ({ ...t, pos: i + 1, pts: pts(t), gp: t.w + t.l, last5: t.form.slice(-5) }));
}

/** όνομα για τη σελίδα: οι Έλληνες (χώρα ΕΛΛΑΔΑ στο esake.gr) στα ελληνικά, οι υπόλοιποι όπως τους γράφει ο κόσμος (λατινικά) */
export function displayName(pid, raw, G = {}) {
  if (G.gn?.[pid]) return G.gn[pid];
  if (/^ΕΛΛ(ΑΔΑ|ΗΝΙΚΗ)$/.test(G.players?.[pid]?.country || '')) { const w = String(raw).trim().split(/\s+/); const k = w.length === 2 ? `${w[0]}, ${w[1]}` : null; if (k && G.el?.[k]) return G.el[k]; }
  return niceName(raw);
}

/** μέσοι όροι παικτών της σεζόν από τα box scores */
export function playerStats(games, box, G = {}) {
  const P = new Map();
  for (const g of games) {
    const b = box[g.id]; if (!b) continue;
    b.teams.forEach((t, i) => {
      const team = i === 0 ? g.home.logo : g.away.logo, opp = i === 0 ? g.away : g.home;
      for (const p of t.players) {
        if (!(p.secs > 0)) continue;
        const o = P.get(p.pid) ?? { pid: p.pid, name: displayName(p.pid, p.name, G), latin: niceName(p.name), team, gp: 0, secs: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pir: 0, f2m: 0, f2a: 0, f3m: 0, f3a: 0, ftm: 0, fta: 0, log: [] };
        o.team = team; o.gp++;
        for (const k of ['secs', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pir', 'f2m', 'f2a', 'f3m', 'f3a', 'ftm', 'fta']) o[k] += p[k] || 0;
        o.log.push({ id: g.id, date: g.date, round: g.round, stage: g.stage, home: i === 0, opp: opp.logo, oppName: opp.name, my: i === 0 ? g.hs : g.as, op: i === 0 ? g.as : g.hs, min: p.secs / 60, pts: p.pts, reb: p.reb, ast: p.ast, pir: p.pir, f3: `${p.f3m}/${p.f3a}` });
        P.set(p.pid, o);
      }
    });
  }
  return [...P.values()].map(o => ({ ...o, min: o.secs / 60 / o.gp, ppg: o.pts / o.gp, rpg: o.reb / o.gp, apg: o.ast / o.gp, spg: o.stl / o.gp, bpg: o.blk / o.gp, pirg: o.pir / o.gp }));
}

/** όλες οι σελίδες: [{ key, title, desc, main, ld }] */
export function gblPages(G, { esc, slugify, url, siteUrl, siteName, home }) {
  const S = G.cur, SL = seasonLabel(S), games = G.seasons[S], L = `Stoiximan GBL ${SL}`;
  const names = new Map(); for (const g of games) { names.set(g.home.logo, g.home.name); names.set(g.away.logo, g.away.name); }
  const tSlug = new Map(), used = new Set();
  for (const [id, n] of names) { let s = teamSlug(shortName(n), slugify) || id.toLowerCase(); if (used.has(s)) s += '-' + id.toLowerCase(); used.add(s); tSlug.set(id, s); }
  const tUrl = id => url('gbl:' + tSlug.get(id));
  const tShort = id => shortName(names.get(id));
  const tA = id => `<a href="${tUrl(id)}">${esc(tShort(id))}</a>`;
  const PAL = ['#c8102e', '#00529b', '#007a3d', '#f28c00', '#5b2c83', '#00838f', '#8d6e63', '#d81b60', '#3949ab', '#2e7d32', '#6d4c41', '#ad1457'];
  const crest = (id, big) => { const n = tShort(id); return `<span class="${big ? 'bigcrest' : 'crest'}" style="background:${PAL[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % PAL.length]}">${esc(n.slice(0, 3).toLocaleUpperCase('el'))}</span>`; };
  const tn = id => `<span class="ectn">${crest(id)}${tA(id)}</span>`;
  const f1 = x => (Number.isFinite(x) ? x.toFixed(1).replace('.', ',') : '–');
  const pc = (m, a) => (a ? Math.round(100 * m / a) + '%' : '–');
  const when = iso => { if (!iso) return '–'; const d = new Date(iso.length > 10 ? iso + ':00+02:00' : iso + 'T12:00:00+02:00'); return d.toLocaleString('el-GR', { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'short', ...(iso.length > 10 ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}) }); };
  const rd = g => (g.round ? `${g.round}η αγωνιστική` : g.stage || '');
  const pr = new Map((G.model?.predictions || []).map(p => [p.id, p]));
  const estScore = p => { const h = Math.round((p.total + p.margin) / 2), a = Math.round((p.total - p.margin) / 2); return `${h}-${a}`; };

  const ST = standings(games);
  const players = playerStats(games, G.box, G);
  const pSlug = new Map(); { const u = new Set(); for (const p of players) { let s = slugify(p.latin) || p.pid.toLowerCase(); const k = p.team + '/' + s; if (u.has(k)) s += '-' + p.pid.toLowerCase(); u.add(p.team + '/' + s); pSlug.set(p.pid, s); } }
  const pUrl = p => url(`gbl:${tSlug.get(p.team)}/${pSlug.get(p.pid)}`);
  const pA = p => `<a href="${pUrl(p)}">${esc(p.name)}</a>`;
  const playedR = games.filter(g => g.played && g.round).map(g => g.round);
  const lastR = playedR.length ? Math.max(...playedR) : 0;
  const upcoming = games.filter(g => !g.played).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const nextR = upcoming[0]?.round || null;
  const minG = Math.max(1, Math.ceil(lastR / 2));
  const qual = players.filter(p => p.gp >= minG && p.min >= 10);
  const form = f => f.map(x => `<i class="ecf ${x === 'W' ? 'w' : 'l'}">${x === 'W' ? 'Ν' : 'Η'}</i>`).join('');
  const note = `<p class="note">Πηγή: επίσημα στοιχεία της ΕΣΑΚΕ (esake.gr), ενημέρωση κάθε βράδυ. Ώρες Ελλάδας. Οι προβλέψεις είναι στατιστικές εκτιμήσεις, όχι συμβουλές στοιχήματος· το στοίχημα επιτρέπεται μόνο άνω των 21 ετών.</p>`;

  const fxCard = g => {
    const p = pr.get(g.id);
    const right = id => g.played ? `<b>${id === g.home.logo ? g.hs : g.as}</b>` : '';
    return `<div class="fx"><span class="when">${esc(rd(g))} · ${esc(when(g.date))}</span><div class="row">${tn(g.home.logo)}${right(g.home.logo)}</div><div class="row">${tn(g.away.logo)}${right(g.away.logo)}</div>${!g.played && p ? `<span class="when">Πρόβλεψη: <b>${Math.round(100 * Math.max(p.p_home, 1 - p.p_home))}%</b> ${esc(tShort(p.p_home >= 0.5 ? g.home.logo : g.away.logo))} · εκτίμηση ${estScore(p)}</span>` : ''}</div>`;
  };

  const standTbl = `<div class="tbl"><table><thead><tr><th>#</th><th class="l">Ομάδα</th><th>Αγ.</th><th>Ν</th><th>Η</th><th>Βαθ.</th><th>Υπέρ</th><th>Κατά</th><th>+/−</th><th class="ecform">Φόρμα</th></tr></thead><tbody>${ST.map(t => `<tr><td>${t.pos}</td><td class="l">${tn(t.id)}</td><td>${t.gp}</td><td>${t.w}</td><td>${t.l}</td><td><b>${t.pts}</b></td><td>${t.pf}</td><td>${t.pa}</td><td>${t.pf - t.pa > 0 ? '+' : ''}${t.pf - t.pa}</td><td class="ecform">${form(t.last5)}</td></tr>`).join('')}</tbody></table></div>`;

  const LEAD = [['pirg', 'PIR'], ['ppg', 'Πόντοι'], ['rpg', 'Ριμπάουντ'], ['apg', 'Ασίστ']];
  const leadTbl = ([k, lab]) => `<div><h3>${lab}</h3><div class="tbl"><table><tbody>${qual.slice().sort((a, b) => b[k] - a[k]).slice(0, 10).map((p, i) => `<tr><td>${i + 1}</td><td class="l">${pA(p)} <small class="muted">${esc(tShort(p.team))}</small></td><td><b>${f1(p[k])}</b></td></tr>`).join('')}</tbody></table></div></div>`;

  const M = G.model || {}, bt = M.backtest, elo = M.elo;
  const pct1 = x => (x * 100).toFixed(1).replace('.', ',') + '%';
  const acc = bt ? `<h2>Πόσο πέφτει μέσα το μοντέλο</h2>
<p>Κάθε αγώνας από το ${seasonLabel(Object.keys(G.seasons).sort()[1] || S)} και μετά προβλέφθηκε μόνο με όσα ήταν γνωστά πριν από αυτόν (walk-forward, χωρίς να «ξέρει» το αποτέλεσμα).</p>
<div class="tbl"><table><thead><tr><th class="l"></th><th>Αγώνες</th><th>Βρήκε τον νικητή</th></tr></thead><tbody>
<tr><td class="l">«Πάντα ο γηπεδούχος»</td><td>${bt.n}</td><td>${pct1(bt.home_accuracy)}</td></tr>
${bt.elo_accuracy != null ? `<tr><td class="l">Elo (μόνο τα σκορ)</td><td>${bt.n}</td><td>${pct1(bt.elo_accuracy)}</td></tr>` : ''}
<tr><td class="l"><b>Μοντέλο BasketballStats</b></td><td>${bt.n}</td><td><b>${pct1(bt.accuracy)}</b></td></tr>
</tbody></table></div>
<p class="sub">Μέσο λάθος στη διαφορά πόντων: ${f1(bt.margin_mae)} · στο σύνολο πόντων: ${f1(bt.total_mae)}.</p>` : '';

  const pages = [];
  const hubMain = `<section class="article ec">
<h1>${esc(L)}</h1>
<p class="lede2">Βαθμολογία, αποτελέσματα, πρόγραμμα, κορυφαίοι παίκτες και οι προβλέψεις του μοντέλου μας για κάθε αγώνα της Stoiximan GBL.${lastR ? ` Έως και την ${lastR}η αγωνιστική.` : ''}</p>
<h2>Βαθμολογία</h2>${standTbl}
<p class="sub">Νίκη 2 βαθμοί, ήττα 1. Στην ισοβαθμία μετράνε οι μεταξύ τους αγώνες.</p>
${nextR ? `<h2>Επόμενη αγωνιστική: ${nextR}η, με προβλέψεις</h2><div class="ecfx">${upcoming.filter(g => g.round === nextR).map(fxCard).join('')}</div>` : ''}
${lastR ? `<h2>Αποτελέσματα: ${lastR}η αγωνιστική</h2><div class="ecfx">${games.filter(g => g.round === lastR && g.played).map(fxCard).join('')}</div>` : ''}
${qual.length ? `<h2>Κορυφαίοι παίκτες</h2><div class="ecgrid">${LEAD.map(leadTbl).join('')}</div><p class="sub">Μέσοι όροι ανά αγώνα, με τουλάχιστον ${minG} αγώνες και 10 λεπτά.</p>` : ''}
${acc}
<h2>Ομάδες</h2><p class="leadnav">${ST.map(t => tA(t.id)).join('')}</p>
${note}
</section>`;
  pages.push({ key: 'gbl', title: `Stoiximan GBL ${SL}: βαθμολογία, αποτελέσματα, προγνωστικά | ${siteName}`,
    desc: `Η βαθμολογία της Stoiximan GBL ${SL}, αποτελέσματα, πρόγραμμα, κορυφαίοι παίκτες και προβλέψεις για κάθε αγώνα της επόμενης αγωνιστικής.`,
    main: hubMain, ld: [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [[siteName, home], [L, url('gbl')]].map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: siteUrl + u })) }] });

  const crumbs = list => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: siteUrl + u })) });
  for (const t of ST) {
    const id = t.id, nm = tShort(id), full = names.get(id);
    const gs = games.filter(g => g.home.logo === id || g.away.logo === id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const ros = players.filter(p => p.team === id).sort((a, b) => b.min - a.min);
    const next = gs.find(g => !g.played), np = next && pr.get(next.id);
    const res = g => { const h = g.home.logo === id, my = h ? g.hs : g.as, op = h ? g.as : g.hs; return `<b class="${my > op ? 'ecw' : 'ecl'}">${my > op ? 'Ν' : 'Η'} ${my}-${op}</b>`; };
    const nextBox = next ? `<section class="nextbox"><p class="kicker">Επόμενος αγώνας · ${esc(rd(next))}</p><h2>${esc(tShort(next.home.logo))} – ${esc(tShort(next.away.logo))}</h2><p>🕒 ${esc(when(next.date))} (ώρα Ελλάδας)${next.venue ? ` · ${esc(next.venue)}` : ''}</p>${np ? `<p>Πρόβλεψη: <b>${Math.round(100 * (next.home.logo === id ? np.p_home : 1 - np.p_home))}%</b> πιθανότητα νίκης για ${esc(nm)} · εκτίμηση ${estScore(np)}</p>` : ''}</section>` : '';
    const main = `<section class="article ec">
<p class="crumbs"><a href="${url('gbl')}">${esc(L)}</a></p>
<div class="echead">${crest(id, 1)}<div><h1>${esc(nm)}</h1><p class="sub">${esc(full)} · ${t.pos}η θέση · ${t.w}-${t.l} · Έδρα ${t.hw}-${t.hl} · Εκτός ${t.aw}-${t.al}</p></div></div>
${nextBox}<h2>Πρόγραμμα και αποτελέσματα</h2>
<div class="tbl"><table><thead><tr><th class="l">Αγ.</th><th class="l">Αντίπαλος</th><th>Αποτέλεσμα / ώρα</th></tr></thead><tbody>${gs.map(g => { const h = g.home.logo === id, o = h ? g.away.logo : g.home.logo; return `<tr><td class="l">${esc(g.round || g.stage || '')}</td><td class="l">${h ? '' : '@ '}${tA(o)}</td><td>${g.played ? res(g) : esc(when(g.date))}</td></tr>`; }).join('')}</tbody></table></div>
${ros.length ? `<h2>Ρόστερ και μέσοι όροι</h2>
<div class="tbl"><table><thead><tr><th class="l">Παίκτης</th><th>Αγ.</th><th>Λεπ.</th><th>Π</th><th>Ριμπ.</th><th>Ασ.</th><th>3Π%</th><th>PIR</th></tr></thead><tbody>${ros.map(p => `<tr><td class="l">${pA(p)}</td><td>${p.gp}</td><td>${f1(p.min)}</td><td>${f1(p.ppg)}</td><td>${f1(p.rpg)}</td><td>${f1(p.apg)}</td><td>${pc(p.f3m, p.f3a)}</td><td><b>${f1(p.pirg)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
${note}
</section>`;
    pages.push({ key: 'gbl:' + tSlug.get(id), title: `${nm} μπάσκετ: πρόγραμμα, αποτελέσματα, ρόστερ | Stoiximan GBL ${SL}`,
      desc: `${nm} στη Stoiximan GBL ${SL}: πρόγραμμα, αποτελέσματα, μέσοι όροι των παικτών και πρόβλεψη για τον επόμενο αγώνα.`, main,
      ld: [{ '@context': 'https://schema.org', '@type': 'SportsTeam', name: full, alternateName: nm, sport: 'Basketball', url: siteUrl + tUrl(id), memberOf: { '@type': 'SportsOrganization', name: 'Stoiximan GBL' }, athlete: ros.map(p => ({ '@type': 'Person', name: p.name, url: siteUrl + pUrl(p) })) }, crumbs([[siteName, home], [L, url('gbl')], [nm, tUrl(id)]])] });
  }

  const POS = { PG: 'Πλέι μέικερ', SG: 'Σούτινγκ γκαρντ', G: 'Γκαρντ', SF: 'Σμολ φόργουορντ', PF: 'Πάουερ φόργουορντ', F: 'Φόργουορντ', C: 'Σέντερ' };
  const CTRY = { 'ΕΛΛΑΔΑ': 'Ελλάδα', 'ΕΛΛΗΝΙΚΗ': 'Ελλάδα', 'ΗΠΑ': 'ΗΠΑ', 'ΓΑΛΛΙΑ': 'Γαλλία', 'ΚΑΝΑΔΑΣ': 'Καναδάς', 'ΣΕΡΒΙΑ': 'Σερβία', 'ΣΕΝΕΓΑΛΗ': 'Σενεγάλη', 'ΛΙΘΟΥΑΝΙΑ': 'Λιθουανία', 'ΙΣΠΑΝΙΑ': 'Ισπανία', 'ΓΕΡΜΑΝΙΑ': 'Γερμανία', 'ΝΙΓΗΡΙΑ': 'Νιγηρία', 'ΚΥΠΡΟΣ': 'Κύπρος', 'ΤΟΥΡΚΙΑ': 'Τουρκία', 'ΒΟΥΛΓΑΡΙΑ': 'Βουλγαρία', 'ΑΥΣΤΡΑΛΙΑ': 'Αυστραλία', 'ΛΕΥΚΟΡΩΣΙΑ': 'Λευκορωσία', 'ΑΝΓΚΟΛΑ': 'Αγκόλα', 'Β. ΜΑΚΕΔΟΝΙΑ': 'Β. Μακεδονία', 'ΔΟΜΙΝΙΚΑΝΗ ΔΗΜΟΚΡΑΤΙΑ': 'Δομινικανή Δημοκρατία' };
  const info = pid => { const x = G.players?.[pid]; if (!x) return ''; const age = x.born ? Math.floor((Date.now() - Date.parse(x.born)) / 31557600000) : null;
    return [x.pos && (POS[x.pos] || x.pos), x.height && `${x.height.toFixed(2).replace('.', ',')} μ.`, age && `${age} ετών`, x.country && (CTRY[x.country] || x.country)].filter(Boolean).map(v => ' · ' + esc(v)).join(''); };
  for (const p of players) {
    const nm = tShort(p.team), u = pUrl(p);
    const rows = p.log.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const main = `<section class="article ec">
<p class="crumbs"><a href="${url('gbl')}">${esc(L)}</a> › ${tA(p.team)}</p>
<h1>${esc(p.name)}</h1><p class="sub">${esc(nm)}${info(p.pid)} · ${p.gp} αγώνες · ${f1(p.min)} λεπτά</p>
<div class="tbl"><table><thead><tr><th>Π</th><th>Ριμπ.</th><th>Ασ.</th><th>Κλ.</th><th>Κοψ.</th><th>Λάθη</th><th>2Π%</th><th>3Π%</th><th>Βολές</th><th>PIR</th></tr></thead><tbody><tr><td><b>${f1(p.ppg)}</b></td><td>${f1(p.rpg)}</td><td>${f1(p.apg)}</td><td>${f1(p.spg)}</td><td>${f1(p.bpg)}</td><td>${f1(p.tov / p.gp)}</td><td>${pc(p.f2m, p.f2a)}</td><td>${pc(p.f3m, p.f3a)}</td><td>${pc(p.ftm, p.fta)}</td><td><b>${f1(p.pirg)}</b></td></tr></tbody></table></div>
<h2>Αγώνας προς αγώνα</h2>
<div class="tbl"><table><thead><tr><th class="l">Αγ.</th><th class="l">Αντίπαλος</th><th>Σκορ</th><th>Λεπ.</th><th>Π</th><th>Ριμπ.</th><th>Ασ.</th><th>3Π</th><th>PIR</th></tr></thead><tbody>${rows.map(r => `<tr><td class="l">${esc(r.round || r.stage || '')}</td><td class="l">${r.home ? '' : '@ '}${names.has(r.opp) ? tA(r.opp) : esc(shortName(r.oppName))}</td><td><b class="${r.my > r.op ? 'ecw' : 'ecl'}">${r.my > r.op ? 'Ν' : 'Η'} ${r.my}-${r.op}</b></td><td>${Math.round(r.min)}</td><td>${r.pts}</td><td>${r.reb}</td><td>${r.ast}</td><td>${esc(r.f3)}</td><td><b>${r.pir}</b></td></tr>`).join('')}</tbody></table></div>
${note}
</section>`;
    pages.push({ key: `gbl:${tSlug.get(p.team)}/${pSlug.get(p.pid)}`, title: `${p.name} (${nm}): στατιστικά Stoiximan GBL ${SL} | ${siteName}`,
      desc: `${p.name} στη Stoiximan GBL ${SL} με ${nm}: ${f1(p.ppg)} πόντοι, ${f1(p.rpg)} ριμπάουντ, ${f1(p.apg)} ασίστ και ${f1(p.pirg)} PIR ανά αγώνα, αγώνας προς αγώνα.`, main,
      ld: [{ '@context': 'https://schema.org', '@type': 'Person', name: p.name, ...(p.latin !== p.name ? { alternateName: p.latin } : {}), url: siteUrl + u, memberOf: { '@type': 'SportsTeam', name: names.get(p.team), url: siteUrl + tUrl(p.team) } }, crumbs([[siteName, home], [L, url('gbl')], [nm, tUrl(p.team)], [p.name, u]])],
      noindex: p.gp < 3 });
  }
  return pages;
}
