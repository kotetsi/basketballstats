// «Data posts» για τη Stoiximan GBL: 2 αναρτήσεις την ημέρα με αναλύσεις από τα box scores του esake.gr (data/gbl/<σεζόν>/),
// δίπλα στα data posts της EuroLeague (scripts/data-posts.mjs). Μία κάρτα 1080×1350 σε κάθε εκτέλεση.
//   node scripts/data-posts-gbl.mjs        διαλέγει την επόμενη ανάρτηση GBL της ημέρας και γράφει το social/data/plan.json
//   node scripts/daily-social.mjs post     με SOCIAL_PLAN=social/data/plan.json κάνει την ανάρτηση (κοινό data/daily-social.json)
//   DP_TODAY=2026-12-06 άλλη ημέρα · DP_ONLY=recap|matchup|leaders|ratings|profile · DP_ALL=1 όλα για προεπισκόπηση · DP_DRY=1 χωρίς εικόνες
//
// Θέματα: recap (το ματς της αγωνιστικής, με δεκάλεπτα), matchup (το ματς της ημέρας: επίθεση/άμυνα ανά 100 κατοχές),
// leaders (κορυφαίοι σε PIR και πόντους), ratings (επίθεση/άμυνα όλων των ομάδων), profile (θέση μιας ομάδας στις 14 σε 7 κατηγορίες).
// Η GBL δεν δίνει θέσεις σουτ ούτε +/−, οπότε δεν υπάρχει ανάλυση σουτ και η κούρσα MVP είναι μόνο με PIR/πόντους.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { card, esc, f1, pc, sg } from './data-cards.mjs';
import { loadGbl, standings, displayName, shortName, seasonLabel } from '../src/gbl/pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = process.env, DRY = E.DP_DRY === '1', ONLY = E.DP_ONLY || '', ALL = E.DP_ALL === '1', PER_DAY = 2;
const readJ = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const athensDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
const today = E.DP_TODAY || athensDay(), yesterday = athensDay(new Date(new Date(today + 'T12:00:00Z') - 864e5));
const STATE = path.join(ROOT, 'data', 'daily-social.json'), PLAN = path.join(ROOT, 'social', 'data', 'plan.json');
const outDir = path.join(ROOT, 'social', 'data', today);
const state = await readJ(STATE, { posted: [] });
const done = key => state.posted.some(k => k.startsWith(key + '@'));

const G = await loadGbl(ROOT);
if (!G) { console.log('GBL: δεν υπάρχουν δεδομένα'); process.exit(0); }
const S = G.cur, games = G.seasons[S].filter(g => g.phase !== 'playoffs'), box = G.box;
const SEAS = seasonLabel(S);
// οι ώρες του esake.gr είναι ώρα Ελλάδας
const gTime = g => { for (const o of ['+02:00', '+03:00']) { const d = new Date(g.date + ':00' + o); if (d.toLocaleString('sv-SE', { timeZone: 'Europe/Athens' }).slice(0, 16).replace(' ', 'T') === g.date) return d; } return new Date(g.date + ':00+02:00'); };
const hhmm = d => d.toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// ------------------------------------------------------------------ ομάδες: ονόματα, χρώματα, σύνολα
const NAME = new Map(); for (const g of games) { NAME.set(g.home.logo, g.home.name); NAME.set(g.away.logo, g.away.name); }
const tn = id => shortName(NAME.get(id));
const COL = { 'Παναθηναϊκός': '#1f8a3b', 'Ολυμπιακός': '#c8102e', 'ΑΕΚ': '#f2c200', 'Άρης': '#f2c200', 'ΠΑΟΚ': '#9aa3b5', 'Περιστέρι': '#1f5fbf', 'Προμηθέας': '#e4572e', 'Κολοσσός': '#1f5fbf', 'Μαρούσι': '#ffcc00', 'Καρδίτσα': '#2a9df4', 'Μύκονος': '#2a9df4', 'Ηρακλής': '#4a7bd0', 'Δόξα Λευκάδας': '#3ecf8e', 'Vikos Falcons': '#e4572e' };
const col = id => COL[tn(id)] || '#e4572e';
const MASC = { 'Παναθηναϊκός': ['ο', 'του Παναθηναϊκού', 'τον Παναθηναϊκό'], 'Ολυμπιακός': ['ο', 'του Ολυμπιακού', 'τον Ολυμπιακό'], 'Άρης': ['ο', 'του Άρη', 'τον Άρη'], 'ΠΑΟΚ': ['ο', 'του ΠΑΟΚ', 'τον ΠΑΟΚ'], 'Προμηθέας': ['ο', 'του Προμηθέα', 'τον Προμηθέα'], 'Κολοσσός': ['ο', 'του Κολοσσού', 'τον Κολοσσό'], 'Ηρακλής': ['ο', 'του Ηρακλή', 'τον Ηρακλή'] };
const NEUT = { 'Περιστέρι': ['το', 'του Περιστερίου', 'το Περιστέρι'], 'Μαρούσι': ['το', 'του Αμαρουσίου', 'το Μαρούσι'] };
const art = id => MASC[tn(id)] || NEUT[tn(id)] || ['η', `της ${tn(id)}`, `τη ${tn(id)}`];
const Nom = id => (art(id)[0] + ' ' + tn(id)).replace(/^./, m => m.toUpperCase()), nom = id => art(id)[0] + ' ' + tn(id), gen = id => art(id)[1], acc = id => art(id)[2];

const BX = ['pts', 'f2m', 'f2a', 'f3m', 'f3a', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'tov', 'stl', 'blk'];
const sumTeam = t => { const o = Object.fromEntries(BX.map(k => [k, 0])); for (const p of t.players || []) for (const k of BX) o[k] += p[k] || 0; return o; };
const poss = b => b.f2a + b.f3a + 0.44 * b.fta - b.oreb + b.tov;
const T = {};
const played = games.filter(g => g.played && box[g.id]);
for (const g of played) {
  // στο box του esake.gr η πρώτη ομάδα είναι η γηπεδούχος (όπως στο src/gbl/pages.mjs)· έλεγχος ότι οι πόντοι βγάζουν το σκορ
  const B = box[g.id]; if ((B.teams || []).length !== 2) continue;
  const tm = { [g.home.logo]: sumTeam(B.teams[0]), [g.away.logo]: sumTeam(B.teams[1]) };
  if (tm[g.home.logo].pts !== g.hs || tm[g.away.logo].pts !== g.as) { console.log(`GBL: το box του ${g.id} δεν βγάζει το σκορ, παραλείπεται`); continue; }
  for (const [me, op] of [[g.home.logo, g.away.logo], [g.away.logo, g.home.logo]]) {
    const t = (T[me] ||= { id: me, g: 0, o: Object.fromEntries(BX.map(k => [k, 0])), d: Object.fromEntries(BX.map(k => [k, 0])) });
    t.g++; for (const k of BX) { t.o[k] += tm[me][k]; t.d[k] += tm[op][k]; }
  }
}
for (const t of Object.values(T)) {
  const P = (poss(t.o) + poss(t.d)) / 2;
  Object.assign(t, { ortg: 100 * t.o.pts / P, drtg: 100 * t.d.pts / P, pace: P / t.g, ppg: t.o.pts / t.g, papg: t.d.pts / t.g, rpg: (t.o.oreb + t.o.dreb) / t.g, apg: t.o.ast / t.g, tpg: t.o.tov / t.g, p3: t.o.f3m / t.o.f3a, ft: t.o.ftm / t.o.fta, efg: (t.o.f2m + 1.5 * t.o.f3m) / (t.o.f2a + t.o.f3a), oefg: (t.d.f2m + 1.5 * t.d.f3m) / (t.d.f2a + t.d.f3a) });
  t.net = t.ortg - t.drtg;
}
const TL = Object.values(T), NT = TL.length;
const rank = (id, k, low = false) => 1 + TL.filter(t => (low ? t[k] < T[id][k] : t[k] > T[id][k])).length;
const ST = standings(G.seasons[S]), stand = Object.fromEntries(ST.map(s => [s.id, s]));
const rec = id => stand[id] ? `${stand[id].w}-${stand[id].l}` : '';
const pos = id => stand[id]?.pos;
const LAST_R = Math.max(0, ...played.map(g => g.round || 0));
const rkCol = r => r <= 3 ? '#3ecf8e' : r <= 6 ? '#e4572e' : r >= NT - 2 ? '#ff6b6b' : '#5b6478';
const ACTIVE = new Set(TL.filter(t => /Παναθηναϊκός|Ολυμπιακός/.test(tn(t.id))).map(t => t.id));
const NOTE = `Stoiximan GBL ${SEAS} · box scores esake.gr`;
const items = [];

// ------------------------------------------------------------------ recap: το ματς (χθες ή σήμερα που τελείωσε)
function recap() {
  const D = [yesterday, today].find(d => played.some(g => g.date.slice(0, 10) === d && g.quarters?.length));
  if (!D) return;
  const L = played.filter(g => g.date.slice(0, 10) === D && g.quarters?.length);
  const score = g => (ACTIVE.has(g.home.logo) || ACTIVE.has(g.away.logo) ? 30 : 0) + (Math.abs(g.hs - g.as) <= 5 ? 25 : Math.abs(g.hs - g.as) <= 10 ? 10 : 0) + (g.quarters.length > 4 ? 20 : 0) + (g.hs + g.as) / 40;
  const g = [...L].sort((a, b) => score(b) - score(a))[0], key = `gbl:recap-${g.id}`; if (done(key)) return;
  const H = g.home.logo, A = g.away.logo, W = g.hs > g.as ? H : A, Lo = W === H ? A : H, wi = W === H ? 0 : 1;
  const q = g.quarters.map(x => [x[1], x[2]]), qd = q.map((x, i) => ({ i, d: wi === 0 ? x[0] - x[1] : x[1] - x[0], x }));
  const best = [...qd].sort((a, b) => b.d - a.d)[0], qn = i => i < 4 ? `${i + 1}ο δεκάλεπτο` : (i === 4 ? 'παράταση' : `${i - 3}η παράταση`);
  const m = Math.abs(g.hs - g.as);
  const head = m <= 3 ? 'Κρίθηκε στο τέλος' : best.d >= 8 ? `${best.x[wi]}-${best.x[1 - wi]} στο ${qn(best.i)}` : 'Σταθερά μπροστά';
  const why = `Το ${qn(best.i)} το κέρδισε ${best.x[wi]}-${best.x[1 - wi]} (${best.d > 0 ? '+' : ''}${best.d}).`;
  const lead = id => { const t = box[g.id].teams[id === H ? 0 : 1]; const p = [...(t?.players || [])].sort((a, b) => b.pir - a.pir || b.pts - a.pts)[0]; return p ? { n: displayName(p.pid, p.name, G), ...p } : null; };
  const lw = lead(W), ll = lead(Lo);
  const qrow = (id, i) => `<tr><td style="font-weight:800;color:${col(id)}">${esc(tn(id))}</td>${q.map((x, j) => `<td class="n" style="${j === best.i ? 'color:#e4572e' : ''}">${x[i]}</td>`).join('')}<td class="n" style="font-size:40px">${i ? g.as : g.hs}</td></tr>`;
  const ln = (id, p) => p ? `<div style="margin-top:22px;font-size:32px"><b style="color:${col(id)}">${esc(p.n)}</b> <span class="muted">· ${p.pts} πόντοι, ${p.reb} ριμπ., ${p.ast} ασίστ, ${p.pir} PIR</span></div>` : '';
  const body = `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
    <div style="text-align:center;flex:1"><div style="font-size:150px;font-weight:800;line-height:1;color:${W === H ? '#fff' : '#aeb6c8'}">${g.hs}</div><div style="font-size:32px;margin-top:8px">${esc(tn(H))}</div></div>
    <div style="font-size:60px;color:#5b6478">–</div>
    <div style="text-align:center;flex:1"><div style="font-size:150px;font-weight:800;line-height:1;color:${W === A ? '#fff' : '#aeb6c8'}">${g.as}</div><div style="font-size:32px;margin-top:8px">${esc(tn(A))}</div></div></div>
    <table style="margin-top:44px"><tr><td></td>${q.map((_, j) => `<td class="n muted" style="font-size:24px">${j < 4 ? j + 1 + 'ο' : 'Π' + (j - 3)}</td>`).join('')}<td class="n muted" style="font-size:24px">ΤΕΛ</td></tr>${qrow(H, 0)}${qrow(A, 1)}</table>
    <div style="margin-top:34px;font-size:34px;line-height:1.35">${esc(why)} ${Nom(W)} πάει στο <b>${rec(W)}</b>${pos(W) ? ` (${pos(W)}η θέση)` : ''}.</div>${ln(W, lw)}${ln(Lo, ll)}`;
  const text = `🏀 ${tn(H)} – ${tn(A)} ${g.hs}-${g.as}: ${head.charAt(0).toUpperCase() + head.slice(1).toLowerCase()}\n\n${why}\n${lw ? `Κορυφαίος ο ${lw.n} με ${lw.pts} πόντους και ${lw.pir} PIR.` : ''}\n\n${Nom(W)} πάει στο ${rec(W)}, ${nom(Lo)} στο ${rec(Lo)}. Τι κράτησες από το ματς; 👇\n\nΌλο το box score: basketballstats.eu\n\n#GBL #μπάσκετ #basketleague`;
  items.push({ fmt: 'recap', key, html: card({ col: col(W), tag: 'ΤΟ ΜΑΤΣ', kicker: `Stoiximan GBL · ${g.round ? g.round + 'η αγωνιστική' : g.stage || ''}`, title: esc(head), body, note: NOTE }), text, alt: `${tn(H)} – ${tn(A)} ${g.hs}-${g.as}, σκορ ανά δεκάλεπτο` });
}

// ------------------------------------------------------------------ matchup: το ματς της ημέρας
function matchup() {
  const L = games.filter(g => !g.played && g.date.slice(0, 10) === today && T[g.home.logo] && T[g.away.logo] && (E.DP_TODAY || gTime(g) > new Date()));
  if (!L.length) return;
  const sc = g => (ACTIVE.has(g.home.logo) || ACTIVE.has(g.away.logo) ? 100 : 0) - (pos(g.home.logo) || 14) - (pos(g.away.logo) || 14);
  const g = [...L].sort((a, b) => sc(b) - sc(a))[0], H = g.home.logo, A = g.away.logo, key = `gbl:matchup-${g.id}`; if (done(key)) return;
  const [O, D] = rank(H, 'ortg') + rank(A, 'drtg', true) <= rank(A, 'ortg') + rank(H, 'drtg', true) ? [H, A] : [A, H];
  const rows = [['Επίθεση (ανά 100 κατοχές)', 'ortg', false, f1], ['Άμυνα (ανά 100 κατοχές)', 'drtg', true, f1], ['Ρυθμός (κατοχές)', 'pace', false, f1], ['eFG%', 'efg', false, pc], ['eFG% αντιπάλων', 'oefg', true, pc], ['Ριμπάουντ', 'rpg', false, f1], ['Λάθη', 'tpg', true, f1]];
  const cell = (id, k, low, f) => `<td class="n" style="font-size:29px;padding:11px 10px">${f(T[id][k])} <span class="rk" style="background:${rkCol(rank(id, k, low))};font-size:20px;min-width:56px">${rank(id, k, low)}η</span></td>`;
  const t = hhmm(gTime(g));
  const body = `<div style="display:flex;justify-content:space-between;align-items:flex-end">
    <div><div style="font-size:26px" class="muted">ΕΠΙΘΕΣΗ</div><div style="font-size:46px;font-weight:800;color:${col(O)}">${esc(tn(O))}</div><div style="font-size:110px;font-weight:800;line-height:1">${f1(T[O].ortg)}</div><div class="muted" style="font-size:26px">${rank(O, 'ortg')}η επίθεση στις ${NT}</div></div>
    <div style="text-align:right"><div style="font-size:26px" class="muted">ΑΜΥΝΑ</div><div style="font-size:46px;font-weight:800;color:${col(D)}">${esc(tn(D))}</div><div style="font-size:110px;font-weight:800;line-height:1">${f1(T[D].drtg)}</div><div class="muted" style="font-size:26px">${rank(D, 'drtg', true)}η άμυνα στις ${NT}</div></div></div>
    <table style="margin-top:34px"><tr><td></td><td class="n" style="color:${col(H)};font-size:26px;padding:8px 10px">${esc(tn(H))}</td><td class="n" style="color:${col(A)};font-size:26px;padding:8px 10px">${esc(tn(A))}</td></tr>
    ${rows.map(([l, k, low, f]) => `<tr><td style="font-size:27px;padding:11px 10px">${l}</td>${cell(H, k, low, f)}${cell(A, k, low, f)}</tr>`).join('')}</table>`;
  const text = `⚔️ Το ματς της ημέρας στη GBL: ${tn(H)} – ${tn(A)} (${t})\n\nΕπίθεση ${gen(O)}: ${f1(T[O].ortg)} πόντοι ανά 100 κατοχές (${rank(O, 'ortg')}η στη λίγκα).\nΆμυνα ${gen(D)}: ${f1(T[D].drtg)} πόντοι ανά 100 κατοχές (${rank(D, 'drtg', true)}η).\n\nΡυθμός: ${f1(T[H].pace)} – ${f1(T[A].pace)} κατοχές ανά αγώνα. Ρεκόρ: ${rec(H)} – ${rec(A)}.\n\nΠοιο θα επικρατήσει, η επίθεση ή η άμυνα; 👇\n\nΌλα τα στατιστικά της GBL: basketballstats.eu\n\n#GBL #μπάσκετ #basketleague`;
  items.push({ fmt: 'matchup', key, html: card({ col: col(O), tag: 'ΤΟ ΜΑΤΣ ΤΗΣ ΗΜΕΡΑΣ', kicker: `Stoiximan GBL · ${g.round}η αγωνιστική · ${t}`, title: `${esc(tn(H))} – ${esc(tn(A))}`, sub: `${rank(D, 'drtg', true)}η άμυνα απέναντι στην ${rank(O, 'ortg')}η επίθεση · ρεκόρ ${rec(H)} – ${rec(A)}`, body, note: `Κατοχές: FGA + 0,44·FTA − επιθ. ριμπάουντ + λάθη<br>Μέχρι και την ${LAST_R}η αγωνιστική` }), text, alt: `${tn(H)} – ${tn(A)}: επίθεση και άμυνα` });
}

// ------------------------------------------------------------------ leaders: PIR και πόντοι ανά αγώνα
function leaders() {
  const key = `gbl:leaders-r${LAST_R}`; if (done(key)) return;
  const P = {};
  for (const g of played) (box[g.id].teams || []).forEach((t, i) => { const team = i === 0 ? g.home.logo : g.away.logo; for (const p of t.players || []) { if (!(p.secs > 0)) continue; const o = (P[p.pid] ||= { pid: p.pid, raw: p.name, team, n: 0, pir: 0, pts: 0 }); o.n++; o.pir += p.pir; o.pts += p.pts; o.team = team; } });
  const minG = Math.max(3, Math.ceil(LAST_R * 0.6));
  const L = Object.values(P).filter(o => o.n >= minG).map(o => ({ ...o, name: displayName(o.pid, o.raw, G), pir: o.pir / o.n, pts: o.pts / o.n }));
  const A = [...L].sort((a, b) => b.pir - a.pir).slice(0, 5), B = [...L].sort((a, b) => b.pts - a.pts).slice(0, 5), both = A.filter(a => B.includes(a));
  const last = n => n.split(' ').slice(-1)[0];
  const colm = (X, k, lab) => `<div style="flex:1"><div class="muted" style="font-size:26px;letter-spacing:1px;margin-bottom:14px">${lab}</div>${X.map((o, i) => `<div style="display:flex;align-items:baseline;gap:16px;padding:16px 0;border-bottom:1px solid #2e3648"><b style="font-size:30px;color:#e4572e;width:34px">${i + 1}</b><div style="flex:1"><div style="font-size:34px;font-weight:800;${both.includes(o) ? 'color:#3ecf8e' : ''}">${esc(last(o.name))}</div><div class="muted" style="font-size:22px">${esc(tn(o.team))}</div></div><b style="font-size:38px">${f1(o[k])}</b></div>`).join('')}</div>`;
  const body = `<div style="display:flex;gap:56px">${colm(A, 'pir', 'PIR ΑΝΑ ΑΓΩΝΑ')}${colm(B, 'pts', 'ΠΟΝΤΟΙ ΑΝΑ ΑΓΩΝΑ')}</div>
    <div style="margin-top:40px;font-size:30px;line-height:1.4">${both.length ? `<span class="gr">Και στις δύο λίστες:</span> ${both.map(o => esc(last(o.name))).join(', ')}.` : 'Κανείς δεν είναι στο Top 5 και των δύο λιστών.'}<br><span class="muted" style="font-size:26px">PIR: όλη η συνεισφορά. Πόντοι: μόνο το σκοράρισμα.</span></div>`;
  const head = A[0] === B[0] ? `${last(A[0].name)} πρώτος και στα δύο` : `${last(A[0].name)} ή ${last(B[0].name)};`;
  const text = `🏆 Οι κορυφαίοι της Stoiximan GBL μετά από ${LAST_R} αγωνιστικές\n\nPIR ανά αγώνα:\n${A.map((o, i) => `${i + 1}. ${o.name} (${tn(o.team)}) ${f1(o.pir)}`).join('\n')}\n\nΠόντοι ανά αγώνα:\n${B.map((o, i) => `${i + 1}. ${o.name} (${tn(o.team)}) ${f1(o.pts)}`).join('\n')}\n\n${both.length ? `Και στις δύο λίστες: ${both.map(o => o.name).join(', ')}.` : 'Κανείς δεν είναι και στις δύο λίστες.'}\nΠοιος είναι ο MVP μέχρι τώρα; 👇\n\n(τουλάχιστον ${minG} αγώνες) · basketballstats.eu\n\n#GBL #μπάσκετ #basketleague`;
  items.push({ fmt: 'leaders', key, html: card({ tag: 'ΚΟΡΥΦΑΙΟΙ GBL', kicker: `Stoiximan GBL ${SEAS} · μετά από ${LAST_R} αγωνιστικές`, title: esc(head), sub: 'PIR και πόντοι ανά αγώνα', body, note: `Τουλάχιστον ${minG} αγώνες · ${NOTE}` }), text, alt: 'Κορυφαίοι της GBL σε PIR και πόντους ανά αγώνα' });
}

// ------------------------------------------------------------------ ratings: επίθεση/άμυνα όλων
function ratings() {
  const key = `gbl:ratings-r${LAST_R}`; if (done(key)) return;
  const L = [...TL].sort((a, b) => b.net - a.net), bo = [...TL].sort((a, b) => b.ortg - a.ortg)[0], bd = [...TL].sort((a, b) => a.drtg - b.drtg)[0];
  const row = (t, i) => `<tr><td style="font-size:26px;color:#8f98ad;width:40px;padding:9px 6px">${i + 1}</td><td style="font-size:30px;font-weight:700;padding:9px 6px;color:${ACTIVE.has(t.id) ? '#e4572e' : '#fff'}">${esc(tn(t.id))}</td><td class="n" style="font-size:30px;padding:9px 6px">${f1(t.ortg)}</td><td class="n" style="font-size:30px;padding:9px 6px">${f1(t.drtg)}</td><td class="n" style="font-size:30px;padding:9px 6px;color:${t.net >= 0 ? '#3ecf8e' : '#ff6b6b'}">${sg(t.net)}</td></tr>`;
  const body = `<table><tr><td></td><td class="muted" style="font-size:22px;padding:6px">ΟΜΑΔΑ</td><td class="n muted" style="font-size:22px;padding:6px">ΕΠΙΘΕΣΗ</td><td class="n muted" style="font-size:22px;padding:6px">ΑΜΥΝΑ</td><td class="n muted" style="font-size:22px;padding:6px">ΔΙΑΦΟΡΑ</td></tr>${L.map(row).join('')}</table>`;
  const text = `📈 Επίθεση και άμυνα: όλες οι ομάδες της Stoiximan GBL μετά από ${LAST_R} αγωνιστικές\n\nΠόντοι ανά 100 κατοχές, για να μη μετράει ο ρυθμός.\n\n⚡ Καλύτερη επίθεση: ${tn(bo.id)} (${f1(bo.ortg)})\n🛡️ Καλύτερη άμυνα: ${tn(bd.id)} (${f1(bd.drtg)})\n🥇 Καλύτερη διαφορά: ${tn(L[0].id)} (${sg(L[0].net)})\n\nΠοια ομάδα σε ξαφνιάζει; 👇\n\nbasketballstats.eu\n\n#GBL #μπάσκετ #basketleague`;
  items.push({ fmt: 'ratings', key, html: card({ tag: 'ΕΠΙΘΕΣΗ & ΑΜΥΝΑ', kicker: `Stoiximan GBL · μετά από ${LAST_R} αγωνιστικές`, title: 'Πόντοι ανά 100 κατοχές', body, note: 'Κατοχές: FGA + 0,44·FTA − επιθ. ριμπάουντ + λάθη' }).replace('<h1>', '<h1 style="font-size:54px">'), text, alt: 'Επίθεση και άμυνα όλων των ομάδων της GBL ανά 100 κατοχές' });
}

// ------------------------------------------------------------------ profile: μία ομάδα
function profile(n = 1) {
  const fut = games.filter(g => !g.played).sort((a, b) => a.date.localeCompare(b.date));
  const nextG = id => fut.find(g => g.home.logo === id || g.away.logo === id);
  const nr = fut[0]?.round || LAST_R + 1;
  const order = Object.keys(T).filter(id => !done(`gbl:profile-${id}-r${nr}`))
    .sort((a, b) => (ACTIVE.has(b) - ACTIVE.has(a)) || String(nextG(a)?.date || '9').localeCompare(String(nextG(b)?.date || '9')) || a.localeCompare(b));
  for (const id of order.slice(0, n)) {
    const t = T[id], ng = nextG(id);
    const R = [['Πόντοι', 'ppg', false, f1], ['Πόντοι που δέχεται', 'papg', true, f1], ['Ριμπάουντ', 'rpg', false, f1], ['Ασίστ', 'apg', false, f1], ['Λάθη', 'tpg', true, f1], ['Τρίποντο', 'p3', false, pc], ['Βολές', 'ft', false, pc]];
    const rs = R.map(([l, k, low, f]) => ({ l, r: rank(id, k, low), v: f(t[k]) })), b = [...rs].sort((x, y) => x.r - y.r)[0], w = [...rs].sort((x, y) => y.r - x.r)[0];
    const opp = ng ? (ng.home.logo === id ? ng.away.logo : ng.home.logo) : null;
    const body = `<table>${rs.map(o => `<tr><td>${o.l}</td><td class="n">${o.v}</td><td style="width:240px;padding-left:24px"><div class="trk"><i style="width:${Math.round(100 * (NT + 1 - o.r) / NT)}%;background:${rkCol(o.r)}"></i></div></td><td class="n" style="width:110px"><span class="rk" style="background:${rkCol(o.r)}">${o.r}η</span></td></tr>`).join('')}</table>
      <div style="margin-top:36px;font-size:30px;line-height:1.4">Δυνατό σημείο: <span class="gr">${b.l.toLowerCase()} (${b.r}η)</span>. Αδύνατο: <span class="rd">${w.l.toLowerCase()} (${w.r}η)</span>.${ng ? `<br><span class="muted">Επόμενος αγώνας: ${esc(tn(opp))} (${ng.home.logo === id ? 'εντός' : 'εκτός'}), ${gTime(ng).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'numeric' })} ${hhmm(gTime(ng))}</span>` : ''}</div>`;
    const text = `📋 Τα βασικά ${gen(id)} στη Stoiximan GBL μετά από ${t.g} αγώνες (${rec(id)})\n\nΘέση ανάμεσα στις ${NT} ομάδες:\n${rs.map(o => `• ${o.l}: ${o.v} (${o.r}η)`).join('\n')}\n\n💪 Δυνατό σημείο: ${b.l.toLowerCase()}. ⚠️ Αδύνατο: ${w.l.toLowerCase()}.${opp ? `\nΕπόμενος αγώνας με ${acc(opp)}.` : ''}\n\nΣυμφωνείς; Τι πρέπει να διορθώσει; 👇\n\nΌλα τα στατιστικά της ομάδας: basketballstats.eu\n\n#GBL #μπάσκετ #basketleague`;
    items.push({ fmt: 'profile', key: `gbl:profile-${id}-r${nr}`, html: card({ col: col(id), tag: 'ΠΡΟΦΙΛ ΟΜΑΔΑΣ', kicker: `${tn(id)} · Stoiximan GBL ${SEAS}`, title: 'Τα βασικά', sub: `Ρεκόρ ${rec(id)}${pos(id) ? ` · ${pos(id)}η θέση` : ''} · θέση ανάμεσα στις ${NT} ομάδες`, body, note: `Ανά αγώνα · μέχρι και την ${LAST_R}η αγωνιστική` }), text, alt: `Προφίλ ${gen(id)}: θέση σε 7 κατηγορίες` });
  }
}

// ------------------------------------------------------------------ επιλογή (όπως στο data-posts.mjs)
// πρώτα το ματς της ημέρας (πρέπει να βγει πριν το τζάμπολ, στις 13:10), μετά το ματς της προηγούμενης βραδιάς
const F = { matchup, recap, leaders, ratings };
for (const f of Object.keys(F)) if (!ONLY || ONLY === f) F[f]();
if (!ONLY || ONLY === 'profile') profile(PER_DAY);
const todo = items.filter(it => !done(it.key));
const doneToday = new Set(state.posted.filter(k => k.startsWith('gbl:') && k.includes(`@${today}:`)).map(k => k.split('@')[0])).size;
const pick = ALL ? todo : (doneToday >= PER_DAY && !ONLY ? [] : todo.slice(0, 1));
console.log(`GBL data posts ${today}: ${doneToday}/${PER_DAY} σήμερα · διαθέσιμα: ${todo.map(i => i.key).join(', ') || '—'}`);
await fs.mkdir(path.dirname(PLAN), { recursive: true });
if (!pick.length) { await fs.writeFile(PLAN, JSON.stringify({ date: today, items: [] }, null, 1)); process.exit(0); }
await fs.mkdir(outDir, { recursive: true });
const plan = { date: today, items: [] };
const { chromium } = DRY ? {} : await import('playwright');
const br = DRY ? null : await chromium.launch(E.PW_CHROME ? { executablePath: E.PW_CHROME } : {});
for (const it of pick) {
  const name = it.key.replace(':', '-'), img = path.join(outDir, `${name}.png`);
  if (!DRY) { const pg = await br.newPage({ viewport: { width: 1080, height: 1350 } }); await pg.setContent(it.html); await pg.screenshot({ path: img, type: 'png' }); await pg.close(); }
  if (ALL) await fs.writeFile(path.join(outDir, `${name}.txt`), it.text);
  plan.items.push({ key: `${it.key}@${today}`, image: path.relative(ROOT, img), text: it.text, short: it.text.split('\n')[0] + ' · basketballstats.eu', kinds: ['post'], nets: ['fb', 'ig', 'threads'], alt: it.alt });
  console.log(`→ ${it.fmt}: ${it.text.split('\n')[0]}`);
}
if (br) await br.close();
await fs.writeFile(PLAN, JSON.stringify(plan, null, 1));
