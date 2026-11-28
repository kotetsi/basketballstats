// «Data posts»: 3 επιπλέον αναρτήσεις την ημέρα με αναλύσεις από τα επίσημα δεδομένα EuroLeague, πέρα από τη ρουτίνα
// του scripts/daily-social.mjs. Μία κάρτα 1080×1350 (4:5) σε κάθε εκτέλεση· το workflow «Social: data posts» τρέχει 3 φορές τη μέρα.
//   node scripts/data-posts.mjs prepare   διαλέγει την επόμενη ανάρτηση της ημέρας, φτιάχνει την κάρτα στο social/data/<ημερομηνία>/
//                                         και γράφει το social/data/plan.json (ένα item)
//   node scripts/daily-social.mjs post   με SOCIAL_PLAN=social/data/plan.json κάνει την ανάρτηση (κοινό αρχείο data/daily-social.json)
//   DP_DATA=dist/assets/data.json  τοπικά δεδομένα · DP_TODAY=2026-11-28 άλλη ημέρα · DP_ONLY=recap|matchup|profile|mvp|shotq|ratings
//   DP_ALL=1  φτιάχνει όλα τα διαθέσιμα της ημέρας (για προεπισκόπηση), όχι μόνο το επόμενο · DP_DRY=1 χωρίς εικόνες
//
// Θέματα (κάθε μέρα 3, χωρίς επανάληψη):
//   recap    Το ματς της βραδιάς: σκορ, δεκάλεπτα, το δεκάλεπτο που έκρινε τον αγώνα, κορυφαίοι (μετά από βραδιά με αγώνες)
//   matchup  Η μάχη της ημέρας: επίθεση της μίας ομάδας απέναντι στην άμυνα της άλλης (πόντοι ανά 100 κατοχές) (μέρα με αγώνες)
//   mvp      Η κούρσα του MVP με δύο τρόπους: PIR ανά αγώνα και +/− ανά αγώνα (μία φορά ανά αγωνιστική)
//   shotq    Καλά σουτ ή καλό σουτάρισμα; Αναμενόμενο eFG% από τη θέση των σουτ απέναντι στο πραγματικό (μία φορά ανά αγωνιστική)
//   ratings  Οι καλύτερες επιθέσεις και άμυνες (πόντοι ανά 100 κατοχές) (μία φορά ανά αγωνιστική)
//   profile  Τα βασικά μιας ομάδας: θέση ανάμεσα στις 20 σε 7 κατηγορίες (μία ομάδα τη μέρα, πρώτα όσες παίζουν νωρίτερα)
// Όλα από τα data/pbp και data/shots (box score, σκορ ανά λεπτό, θέση σουτ) και το assets/data.json. Τίποτα επινοημένο.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://basketballstats.eu';
const E = process.env, DRY = E.DP_DRY === '1', ONLY = E.DP_ONLY || '', ALL = E.DP_ALL === '1', PER_DAY = 3;
const readJ = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const SEASON = (await readJ(path.join(ROOT, 'site.config.json'), {})).season || 'E2026';
const athensDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
const today = E.DP_TODAY || athensDay(), yesterday = athensDay(new Date(new Date(today + 'T12:00:00Z') - 864e5));
const STATE = path.join(ROOT, 'data', 'daily-social.json'), PLAN = path.join(ROOT, 'social', 'data', 'plan.json');
const outDir = path.join(ROOT, 'social', 'data', today);

const data = E.DP_DATA ? JSON.parse(await fs.readFile(E.DP_DATA, 'utf8')) : await (await fetch(`${SITE}/assets/data.json?t=${Date.now()}`)).json();
const GRN = await readJ(path.join(ROOT, 'data', 'greek-names.json'), {});
const state = await readJ(STATE, { posted: [] });

// ------------------------------------------------------------------ ονόματα
const team = c => data.teams[c] || [c, '#e4572e'];
const tn = c => team(c)[0];
const MASC = { OLY: ['ο', 'του Ολυμπιακού', 'τον Ολυμπιακό'], PAN: ['ο', 'του Παναθηναϊκού', 'τον Παναθηναϊκό'], RED: ['ο', 'του Ερυθρού Αστέρα', 'τον Ερυθρό Αστέρα'] };
const nom = c => MASC[c] ? `ο ${tn(c)}` : `η ${tn(c)}`;                       // ο Ολυμπιακός / η Ρεάλ Μαδρίτης
const Nom = c => nom(c).replace(/^./, m => m.toUpperCase());
const gen = c => MASC[c] ? MASC[c][1] : `της ${tn(c)}`;                      // του Ολυμπιακού / της Ρεάλ
const acc = c => MASC[c] ? MASC[c][2] : `τη ${tn(c)}`;                       // τον Ολυμπιακό / τη Ρεάλ
const nice = n => { const [s, f] = String(n).split(', '); return [f, s].filter(Boolean).map(w => w.toLowerCase().replace(/(^|[\s-])\S/g, m => m.toUpperCase())).join(' ').replace(/\bTj\b/g, 'TJ'); };
const grName = n => { const g = GRN[n]; if (!g) return nice(n); const m = g.match(/^\S+\s+\(([^)]+)\)\s+(.+)$/); return m ? `${m[1]} ${m[2]}` : g; };
const surname = n => { const g = grName(n).split(' '); return g.length > 1 ? g.slice(1).join(' ') : g[0]; };
const gDate = w => new Date(Date.UTC(2020 + (+w[8]), +w.slice(0, 2) - 1, +w.slice(2, 4), +w.slice(4, 6), +w.slice(6, 8)));
const hhmm = d => d.toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const f1 = v => v.toFixed(1).replace('.', ','), pc = v => (100 * v).toFixed(1).replace('.', ',') + '%', sg = v => (v > 0 ? '+' : v < 0 ? '−' : '') + f1(Math.abs(v));
const SEAS = (() => { const y = +String(data.season || SEASON).replace(/\D/g, ''); return y ? `${y}-${String(y + 1).slice(2)}` : ''; })();

// ------------------------------------------------------------------ δεδομένα αγώνων (box score + σκορ + σουτ)
const pbpDir = path.join(ROOT, 'data', 'pbp', SEASON), shDir = path.join(ROOT, 'data', 'shots', SEASON);
const games = [];
for (const f of await fs.readdir(pbpDir).catch(() => [])) {
  const g = await readJ(path.join(pbpDir, f), null); if (!g?.box || g.ph !== 'RS' && g.ph) continue;
  const s = await readJ(path.join(shDir, f), null);
  games.push({ ...g, file: f, sc: s?.sc || null, shots: s?.s || null });
}
games.sort((a, b) => a.r - b.r || a.d.localeCompare(b.d));
const LAST_R = Math.max(0, ...games.map(g => g.r));
const BX = ['pts', 'fgm2', 'fga2', 'fgm3', 'fga3', 'ftm', 'fta', 'oreb', 'dreb', 'tov', 'ast', 'stl', 'blk', 'pf'];
const bx = a => Object.fromEntries(BX.map((k, i) => [k, a[i] || 0]));
const poss = b => b.fga2 + b.fga3 + 0.44 * b.fta - b.oreb + b.tov;
// συνολικά ανά ομάδα: δικά της και των αντιπάλων
const T = {};
for (const g of games) for (const [me, op] of [[g.h, g.a], [g.a, g.h]]) {
  const t = (T[me] ||= { c: me, g: 0, w: 0, o: Object.fromEntries(BX.map(k => [k, 0])), d: Object.fromEntries(BX.map(k => [k, 0])) });
  const m = bx(g.box[me]), o = bx(g.box[op]);
  t.g++; if (m.pts > o.pts) t.w++;
  for (const k of BX) { t.o[k] += m[k]; t.d[k] += o[k]; }
}
for (const t of Object.values(T)) {
  const P = (poss(t.o) + poss(t.d)) / 2;
  Object.assign(t, { ortg: 100 * t.o.pts / P, drtg: 100 * t.d.pts / P, pace: P / t.g, ppg: t.o.pts / t.g, papg: t.d.pts / t.g,
    rpg: (t.o.oreb + t.o.dreb) / t.g, apg: t.o.ast / t.g, tpg: t.o.tov / t.g, p3: t.o.fgm3 / t.o.fga3, ft: t.o.ftm / t.o.fta,
    efg: (t.o.fgm2 + 1.5 * t.o.fgm3) / (t.o.fga2 + t.o.fga3), oefg: (t.d.fgm2 + 1.5 * t.d.fgm3) / (t.d.fga2 + t.d.fga3) });
  t.net = t.ortg - t.drtg;
}
const TL = Object.values(T), NT = TL.length;
const rank = (c, k, low = false) => 1 + TL.filter(t => (low ? t[k] < T[c][k] : t[k] > T[c][k])).length;
const stand = Object.fromEntries((data.league.stand || []).map(s => [s[1], s]));
const rec = c => stand[c] ? `${stand[c][2]}-${stand[c][3]}` : `${T[c]?.w}-${T[c]?.g - T[c]?.w}`;
const pos = c => stand[c]?.[0];

// ------------------------------------------------------------------ κάρτα
const SHORT = { MAD: 'Ρεάλ', BAR: 'Μπαρτσελόνα', HTA: 'Χάποελ', TEL: 'Μακάμπι', IST: 'Εφές', MIL: 'Αρμάνι', RED: 'Ερυθρός', VIR: 'Βίρτους', MUN: 'Μπάγερν', ULK: 'Φενέρ', PAM: 'Βαλένθια', ASV: 'Βιλερμπάν', OLY: 'Ολυμπιακός', PAN: 'Παναθηναϊκός' };
const vis = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return '#e4572e'; const n = parseInt(m[1], 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]; return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 70 ? '#' + m[1] : '#e4572e'; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** k = { col, tag, kicker, title, sub, body (html), note } */
function card(k) {
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;background:#1d2331;color:#fff;font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;overflow:hidden;display:flex;flex-direction:column;padding:76px 72px 56px;position:relative}
.bar{position:absolute;left:0;right:0;top:0;height:18px;background:${k.col || '#e4572e'}}
.top{display:flex;justify-content:space-between;align-items:center}.brand{font-size:40px;font-weight:800;letter-spacing:1px}.brand i{font-style:normal;color:#e4572e}
.tag{background:#e4572e;border-radius:40px;padding:10px 24px;font-size:24px;font-weight:700;letter-spacing:.5px}
.kick{margin-top:58px;font-size:28px;font-weight:700;color:#e4572e;letter-spacing:2px;text-transform:uppercase}
h1{margin-top:14px;font-size:70px;line-height:1.05;font-weight:800}.sub{margin-top:16px;font-size:32px;color:#aeb6c8;line-height:1.3}
.body{margin-top:44px;flex:1;display:flex;flex-direction:column}
.foot{display:flex;justify-content:space-between;align-items:flex-end;gap:30px;margin-top:24px}.site{font-size:34px;font-weight:700;white-space:nowrap}.note{font-size:22px;color:#8f98ad;line-height:1.35;text-align:right}
table{width:100%;border-collapse:collapse}td{padding:15px 10px;font-size:32px;border-bottom:1px solid #2e3648}td.n{text-align:right;font-weight:800;white-space:nowrap}
.rk{display:inline-block;min-width:76px;text-align:center;border-radius:10px;padding:4px 10px;font-size:26px;font-weight:800}
.trk{height:16px;background:#2e3648;border-radius:8px;overflow:hidden;width:220px}.trk i{display:block;height:100%;border-radius:8px}
.muted{color:#aeb6c8}.or{color:#e4572e}.gr{color:#3ecf8e}.rd{color:#ff6b6b}
</style></head><body><div class="bar"></div>
<div class="top"><div class="brand">BASKETBALL<i>STATS</i></div><div class="tag">${esc(k.tag)}</div></div>
<div class="kick">${esc(k.kicker)}</div><h1>${k.title}</h1>${k.sub ? `<div class="sub">${k.sub}</div>` : ''}
<div class="body">${k.body}</div>
<div class="foot"><div class="site">basketballstats.eu</div><div class="note">${k.note || 'Επίσημα στατιστικά EuroLeague'}</div></div></body></html>`;
}
const rkCol = r => r <= 3 ? '#3ecf8e' : r <= 8 ? '#e4572e' : r >= NT - 2 ? '#ff6b6b' : '#5b6478';
const rk = r => `<span class="rk" style="background:${rkCol(r)}">${r}η</span>`;

// ------------------------------------------------------------------ θέματα
const ACTIVE = new Set(['OLY', 'PAN']);   // προτεραιότητα για ελληνικό κοινό
const items = [];
const LG = data.league.games, gDay = g => athensDay(gDate(g[1]));

// recap: ο αγώνας της βραδιάς (χθες ή απόψε που ήδη τελείωσε)
function recap() {
  const D = [yesterday, today].find(d => games.some(g => g.d === d && g.sc));
  if (!D) return;
  const G = games.filter(g => g.d === D && g.sc);
  const qs = g => { const n = Math.max(4, Math.ceil(g.secs / 600 - 4 > 0 ? 4 + (g.secs - 2400) / 300 : 4)), out = [];
    const at = b => { let s = [0, 0]; for (const e of g.sc) if (e[0] <= b) s = [e[4], e[5]]; else break; return s; };
    let prev = [0, 0]; for (let i = 0; i < n; i++) { const b = i < 4 ? 600 * (i + 1) : 2400 + 300 * (i - 3), s = at(b); out.push([s[0] - prev[0], s[1] - prev[1]]); prev = s; }
    return out; };
  const score = g => { const q = qs(g), w = g.hs > g.as ? 0 : 1, m = Math.abs(g.hs - g.as);
    const greek = (ACTIVE.has(g.h) || ACTIVE.has(g.a)) ? 30 : 0, close = m <= 5 ? 25 : m <= 10 ? 10 : 0, ot = q.length > 4 ? 20 : 0;
    // ανατροπή: ο νικητής ήταν πίσω με 10+ σε κάποια φάση
    let worst = 0; for (const e of g.sc) worst = Math.min(worst, w === 0 ? e[4] - e[5] : e[5] - e[4]);
    return greek + close + ot + (worst <= -10 ? 20 : 0) + (g.hs + g.as) / 40; };
  const g = [...G].sort((a, b) => score(b) - score(a))[0];
  const key = `dp:recap-${g.gc}`; if (state.posted.some(k => k.startsWith(key + '@'))) return;
  const q = qs(g), W = g.hs > g.as ? g.h : g.a, L = W === g.h ? g.a : g.h, wi = W === g.h ? 0 : 1;
  let worst = 0; for (const e of g.sc) worst = Math.min(worst, wi === 0 ? e[4] - e[5] : e[5] - e[4]);
  const qd = q.map((x, i) => ({ i, d: wi === 0 ? x[0] - x[1] : x[1] - x[0], x }));
  const best = [...qd].sort((a, b) => b.d - a.d)[0], qn = i => i < 4 ? `${i + 1}ο δεκάλεπτο` : (i === 4 ? 'παράταση' : `${i - 3}η παράταση`);
  const top = c => Object.entries(g.pl || {}).filter(([, v]) => v[1] === c).sort((a, b) => b[1][2] - a[1][2])[0];
  // πόντοι παίκτη από data.players (επίσημο box)
  const ptsOf = (pid) => { const p = data.players.find(p => p.c === pid.replace(/^P/, '')); const x = p?.g.find(x => x[0] === g.r && x[7] > 0); return x ? { n: p.n, pts: x[8], reb: x[15] + x[16], ast: x[17], pir: x[25] } : null; };
  const lead = c => Object.keys(g.pl || {}).filter(pid => g.pl[pid][1] === c).map(ptsOf).filter(Boolean).sort((a, b) => b.pir - a.pir || b.pts - a.pts)[0];
  const lw = lead(W), ll = lead(L), m = Math.abs(g.hs - g.as);
  const head = worst <= -10 ? `Ανατροπή από το −${-worst}` : m <= 3 ? `Κρίθηκε στο τέλος` : best.d >= 8 ? `${best.x[wi]}-${best.x[1 - wi]} στο ${qn(best.i)}` : `Σταθερά μπροστά`;
  const why = worst <= -10 ? `${Nom(W)} βρέθηκε πίσω με ${-worst} πόντους και το γύρισε.` : `Το ${qn(best.i)} το κέρδισε ${best.x[wi]}-${best.x[1 - wi]} (${best.d > 0 ? '+' : ''}${best.d}).`;
  const qrow = (c, i) => `<tr><td style="font-weight:800;color:${vis(team(c)[1])}">${esc(tn(c))}</td>${q.map((x, j) => `<td class="n" style="${j === best.i ? 'color:#e4572e' : ''}">${x[i]}</td>`).join('')}<td class="n" style="font-size:40px">${i ? g.as : g.hs}</td></tr>`;
  const ln = (c, p) => p ? `<div style="margin-top:22px;font-size:32px"><b style="color:${vis(team(c)[1])}">${esc(grName(p.n))}</b> <span class="muted">· ${p.pts} πόντοι, ${p.reb} ριμπ., ${p.ast} ασίστ, ${p.pir} PIR</span></div>` : '';
  const body = `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
    <div style="text-align:center;flex:1"><div style="font-size:150px;font-weight:800;line-height:1;color:${W === g.h ? '#fff' : '#aeb6c8'}">${g.hs}</div><div style="font-size:32px;margin-top:8px">${esc(tn(g.h))}</div></div>
    <div style="font-size:60px;color:#5b6478">–</div>
    <div style="text-align:center;flex:1"><div style="font-size:150px;font-weight:800;line-height:1;color:${W === g.a ? '#fff' : '#aeb6c8'}">${g.as}</div><div style="font-size:32px;margin-top:8px">${esc(tn(g.a))}</div></div></div>
    <table style="margin-top:44px"><tr><td></td>${q.map((_, j) => `<td class="n muted" style="font-size:24px">${j < 4 ? j + 1 + 'ο' : 'Π' + (j - 3)}</td>`).join('')}<td class="n muted" style="font-size:24px">ΤΕΛ</td></tr>${qrow(g.h, 0)}${qrow(g.a, 1)}</table>
    <div style="margin-top:34px;font-size:34px;line-height:1.35">${esc(why)} ${Nom(W)} πάει στο <b>${rec(W)}</b>${pos(W) ? ` (${pos(W)}η θέση)` : ''}.</div>${ln(W, lw)}${ln(L, ll)}`;
  const text = `🏀 ${tn(g.h)} – ${tn(g.a)} ${g.hs}-${g.as}: ${head.toLowerCase().replace(/^./, m => m.toUpperCase())}\n\n${why}\n${lw ? `Κορυφαίος ο ${grName(lw.n)} με ${lw.pts} πόντους και ${lw.pir} PIR.` : ''}\n\n${Nom(W)} πάει στο ${rec(W)}, ${nom(L)} στο ${rec(L)}. Τι κράτησες από το ματς; 👇\n\nΌλο το box score: basketballstats.eu\n\n#EuroLeague #μπάσκετ #basketball`;
  items.push({ fmt: 'recap', key, html: card({ col: vis(team(W)[1]), tag: 'ΤΟ ΜΑΤΣ ΤΗΣ ΒΡΑΔΙΑΣ', kicker: `EuroLeague · ${g.r}η αγωνιστική`, title: esc(head), body }), text, alt: `${tn(g.h)} – ${tn(g.a)} ${g.hs}-${g.as}, σκορ ανά δεκάλεπτο` });
}

// matchup: το ματς της ημέρας, επίθεση απέναντι σε άμυνα
function matchup() {
  const G = LG.filter(g => !g[6] && gDay(g) === today && T[g[2]] && T[g[3]] && (E.DP_TODAY || gDate(g[1]) > Date.now())); if (!G.length) return;
  const sc = g => (ACTIVE.has(g[2]) || ACTIVE.has(g[3]) ? 100 : 0) - (pos(g[2]) || 20) - (pos(g[3]) || 20);
  const g = [...G].sort((a, b) => sc(b) - sc(a))[0], H = g[2], A = g[3];
  const key = `dp:matchup-${g[0]}-${H}-${A}`; if (state.posted.some(k => k.startsWith(key + '@'))) return;
  // η πιο ενδιαφέρουσα αντιπαράθεση: η καλύτερη επίθεση από τις δύο απέναντι στην άμυνα της άλλης
  // η πιο δυνατή αντιπαράθεση: όποιο ζευγάρι (επίθεση της μίας, άμυνα της άλλης) έχει τις καλύτερες θέσεις μαζί
  const [O, D] = rank(H, 'ortg') + rank(A, 'drtg', true) <= rank(A, 'ortg') + rank(H, 'drtg', true) ? [H, A] : [A, H];
  const rows = [['Επίθεση (ανά 100 κατοχές)', 'ortg', false, f1], ['Άμυνα (ανά 100 κατοχές)', 'drtg', true, f1], ['Ρυθμός (κατοχές)', 'pace', false, f1], ['eFG%', 'efg', false, pc], ['eFG% αντιπάλων', 'oefg', true, pc], ['Ριμπάουντ', 'rpg', false, f1], ['Λάθη', 'tpg', true, f1]];
  const cell = (c, k, low, f) => `<td class="n" style="font-size:29px;padding:11px 10px">${f(T[c][k])} <span class="rk" style="background:${rkCol(rank(c, k, low))};font-size:20px;min-width:56px">${rank(c, k, low)}η</span></td>`;
  const body = `<div style="display:flex;justify-content:space-between;align-items:flex-end">
    <div><div style="font-size:26px" class="muted">ΕΠΙΘΕΣΗ</div><div style="font-size:46px;font-weight:800;color:${vis(team(O)[1])}">${esc(SHORT[O] || tn(O))}</div><div style="font-size:110px;font-weight:800;line-height:1">${f1(T[O].ortg)}</div><div class="muted" style="font-size:26px">${rank(O, 'ortg')}η επίθεση στις ${NT}</div></div>
    <div style="text-align:right"><div style="font-size:26px" class="muted">ΑΜΥΝΑ</div><div style="font-size:46px;font-weight:800;color:${vis(team(D)[1])}">${esc(SHORT[D] || tn(D))}</div><div style="font-size:110px;font-weight:800;line-height:1">${f1(T[D].drtg)}</div><div class="muted" style="font-size:26px">${rank(D, 'drtg', true)}η άμυνα στις ${NT}</div></div></div>
    <table style="margin-top:34px"><tr><td></td><td class="n" style="color:${vis(team(H)[1])};font-size:26px;padding:8px 10px">${esc(SHORT[H] || tn(H))}</td><td class="n" style="color:${vis(team(A)[1])};font-size:26px;padding:8px 10px">${esc(SHORT[A] || tn(A))}</td></tr>
    ${rows.map(([l, k, low, f]) => `<tr><td style="font-size:27px;padding:11px 10px">${l}</td>${cell(H, k, low, f)}${cell(A, k, low, f)}</tr>`).join('')}</table>`;
  const t = hhmm(gDate(g[1]));
  const text = `⚔️ Η μάχη της ημέρας: ${tn(H)} – ${tn(A)} (${t})\n\nΕπίθεση ${gen(O)}: ${f1(T[O].ortg)} πόντοι ανά 100 κατοχές (${rank(O, 'ortg')}η στη EuroLeague).\nΆμυνα ${gen(D)}: ${f1(T[D].drtg)} πόντοι ανά 100 κατοχές (${rank(D, 'drtg', true)}η).\n\nΡυθμός: ${f1(T[H].pace)} – ${f1(T[A].pace)} κατοχές ανά αγώνα. Ρεκόρ: ${rec(H)} – ${rec(A)}.\n\nΠοιο θα επικρατήσει, η επίθεση ή η άμυνα; 👇\n\nΌλα τα στατιστικά και οι προβλέψεις: basketballstats.eu\n\n#EuroLeague #μπάσκετ #basketball`;
  items.push({ fmt: 'matchup', key, html: card({ col: vis(team(O)[1]), tag: 'Η ΜΑΧΗ ΤΗΣ ΗΜΕΡΑΣ', kicker: `${g[0]}η αγωνιστική · ${t}`, title: `${esc(SHORT[H] || tn(H))} – ${esc(SHORT[A] || tn(A))}`, sub: `${rank(D, 'drtg', true)}η άμυνα απέναντι στην ${rank(O, 'ortg')}η επίθεση · ρεκόρ ${rec(H)} – ${rec(A)}`, body, note: `Κατοχές: FGA + 0,44·FTA − επιθ. ριμπάουντ + λάθη<br>Μέχρι και την ${LAST_R}η αγωνιστική` }), text, alt: `${tn(H)} – ${tn(A)}: επίθεση και άμυνα` });
}

// mvp: PIR ανά αγώνα και +/− ανά αγώνα
function mvp() {
  const key = `dp:mvp-r${LAST_R}`; if (state.posted.some(k => k.startsWith(key + '@'))) return;
  const minG = Math.max(3, Math.ceil(LAST_R * 0.6));
  const P = data.players.map(p => { const G = (p.g || []).filter(x => x[7] > 0); return { p, n: G.length, pir: G.reduce((s, x) => s + x[25], 0) / (G.length || 1), pm: G.reduce((s, x) => s + x[24], 0) / (G.length || 1), c: p.t.split(';').pop() }; }).filter(o => o.n >= minG);
  const A = [...P].sort((a, b) => b.pir - a.pir).slice(0, 5), B = [...P].sort((a, b) => b.pm - a.pm).slice(0, 5);
  const both = A.filter(a => B.includes(a));
  const col = (L, k, f, lab) => `<div style="flex:1"><div class="muted" style="font-size:26px;letter-spacing:1px;margin-bottom:14px">${lab}</div>${L.map((o, i) => `<div style="display:flex;align-items:baseline;gap:16px;padding:16px 0;border-bottom:1px solid #2e3648"><b style="font-size:30px;color:#e4572e;width:34px">${i + 1}</b><div style="flex:1"><div style="font-size:34px;font-weight:800;${both.includes(o) ? 'color:#3ecf8e' : ''}">${esc(surname(o.p.n))}</div><div class="muted" style="font-size:22px">${esc(tn(o.c))}</div></div><b style="font-size:38px">${f(o[k])}</b></div>`).join('')}</div>`;
  const body = `<div style="display:flex;gap:56px">${col(A, 'pir', f1, 'PIR ΑΝΑ ΑΓΩΝΑ')}${col(B, 'pm', sg, '+/− ΑΝΑ ΑΓΩΝΑ')}</div>
    <div style="margin-top:40px;font-size:30px;line-height:1.4">${both.length ? `<span class="gr">Και στις δύο λίστες:</span> ${both.map(o => esc(surname(o.p.n))).join(', ')}.` : 'Κανείς δεν είναι στο Top 5 και των δύο λιστών.'}<br><span class="muted" style="font-size:26px">PIR: τι έκανε ο ίδιος. +/−: πόσο καλύτερη ήταν η ομάδα του όσο έπαιζε.</span></div>`;
  const head = A[0] === B[0] ? `${surname(A[0].p.n)} πρώτος και στις δύο` : `${surname(A[0].p.n)} ή ${surname(B[0].p.n)};`;
  const text = `🏆 Η κούρσα του MVP μετά από ${LAST_R} αγωνιστικές, με δύο τρόπους\n\nPIR ανά αγώνα:\n${A.map((o, i) => `${i + 1}. ${grName(o.p.n)} (${tn(o.c)}) ${f1(o.pir)}`).join('\n')}\n\n+/− ανά αγώνα:\n${B.map((o, i) => `${i + 1}. ${grName(o.p.n)} (${tn(o.c)}) ${sg(o.pm)}`).join('\n')}\n\n${both.length ? `Και στις δύο λίστες: ${both.map(o => grName(o.p.n)).join(', ')}.` : 'Κανείς δεν είναι και στις δύο λίστες.'}\nΕσύ ποιον βλέπεις MVP; 👇\n\n(τουλάχιστον ${minG} αγώνες) · basketballstats.eu\n\n#EuroLeague #MVP #μπάσκετ`;
  items.push({ fmt: 'mvp', key, html: card({ tag: 'ΚΟΥΡΣΑ MVP', kicker: `EuroLeague ${SEAS} · μετά από ${LAST_R} αγωνιστικές`, title: esc(head), sub: 'Δύο τρόποι να δεις την κούρσα', body, note: `Τουλάχιστον ${minG} αγώνες` }), text, alt: `Κούρσα MVP: PIR και +/− ανά αγώνα` });
}

// shotq: αναμενόμενο eFG% (από τη ζώνη κάθε σουτ, με τα ποσοστά όλης της λίγκας) απέναντι στο πραγματικό
function shotq() {
  const key = `dp:shotq-r${LAST_R}`; if (state.posted.some(k => k.startsWith(key + '@'))) return;
  const Z = {}, rows = [];
  for (const g of games) if (g.shots) for (const s of g.shots) { const z = s[8]; if (!z) continue; const o = (Z[z] ||= { a: 0, m: 0, v: s[5] ? 3 : 2 }); o.a++; o.m += s[4] ? 1 : 0; rows.push([s[1] ? g.h : g.a, s[1] ? g.a : g.h, z, s[4] ? 1 : 0, s[5] ? 3 : 2]); }
  if (rows.length < 2000) return;
  const xp = z => Z[z].m / Z[z].a * Z[z].v;
  const agg = {}; for (const [o, d, z, m, v] of rows) { for (const [c, side] of [[o, 'o'], [d, 'd']]) { const a = (agg[c] ||= { o: { n: 0, x: 0, r: 0 }, d: { n: 0, x: 0, r: 0 } })[side]; a.n++; a.x += xp(z); a.r += m * v; } }
  const L = Object.entries(agg).map(([c, a]) => ({ c, xe: a.o.x / a.o.n / 2, ae: a.o.r / a.o.n / 2, dxe: a.d.x / a.d.n / 2, dae: a.d.r / a.d.n / 2 })).map(o => ({ ...o, mk: 100 * (o.ae - o.xe), dmk: 100 * (o.dae - o.dxe) }));
  const bestQ = [...L].sort((a, b) => b.xe - a.xe)[0], hot = [...L].sort((a, b) => b.mk - a.mk), cold = hot.at(-1), def = [...L].sort((a, b) => a.dmk - b.dmk)[0];
  const xs = L.map(o => o.xe), ys = L.map(o => o.mk), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys, -1), y1 = Math.max(...ys, 1);
  const W = 936, H = 560, px = x => 70 + (x - x0) / (x1 - x0 || 1) * (W - 140), py = y => 40 + (y1 - y) / (y1 - y0) * (H - 90);
  const zero = py(0), mx = px(xs.reduce((s, v) => s + v, 0) / xs.length);
  // ετικέτες χωρίς επικάλυψη: πάνω, κάτω, δεξιά ή αριστερά από την κουκκίδα, όποια θέση είναι ελεύθερη
  const placed = [], lab = o => { const t = SHORT[o.c] || tn(o.c).split(' ')[0], w = t.length * 12 + 6, h = 24, X = px(o.xe), Y = py(o.mk);
    const box = (x, y) => [x - w / 2, y - h, x + w / 2, y + 4], free = b => b[0] > 4 && b[2] < W - 4 && b[1] > 4 && b[3] < H - 4 && placed.every(q => b[2] < q[0] || b[0] > q[2] || b[3] < q[1] || b[1] > q[3]) && L.every(d => { const cx = px(d.xe), cy = py(d.mk); return cx < b[0] - 9 || cx > b[2] + 9 || cy < b[1] - 9 || cy > b[3] + 9; });
    for (const [x, y] of [[X, Y - 20], [X, Y + 40], [X + w / 2 + 18, Y + 9], [X - w / 2 - 18, Y + 9], [X, Y - 46], [X, Y + 66]]) { const b = box(x, y); if (free(b)) { placed.push(b); return `<text x="${x}" y="${y}" font-size="21" fill="#fff" text-anchor="middle" font-weight="700">${esc(t)}</text>`; } }
    return ''; };
  const dots = L.map(o => `<circle cx="${px(o.xe)}" cy="${py(o.mk)}" r="${ACTIVE.has(o.c) || o === bestQ || o === hot[0] || o === cold ? 14 : 10}" fill="${vis(team(o.c)[1])}" stroke="#fff" stroke-width="2"/>`).join('') + [...L].sort((a, b) => (ACTIVE.has(b.c) - ACTIVE.has(a.c)) || Math.abs(b.mk) - Math.abs(a.mk)).map(lab).join('');
  const body = `<svg width="${W}" height="${H}" style="background:#232a3b;border-radius:18px">
    <line x1="40" x2="${W - 20}" y1="${zero}" y2="${zero}" stroke="#5b6478" stroke-dasharray="8 8"/><line x1="${mx}" x2="${mx}" y1="20" y2="${H - 40}" stroke="#5b6478" stroke-dasharray="8 8"/>
    <text x="${W - 24}" y="34" font-size="22" fill="#3ecf8e" text-anchor="end">σουτάρουν καλύτερα από το αναμενόμενο ↑</text>
    <text x="${W - 24}" y="${H - 14}" font-size="22" fill="#aeb6c8" text-anchor="end">καλύτερες θέσεις σουτ →</text>${dots}</svg>
    <div style="margin-top:26px;font-size:27px;line-height:1.42">🎯 Καλύτερες θέσεις σουτ: <b>${esc(tn(bestQ.c))}</b> (αναμενόμενο ${pc(bestQ.xe)})<br>🔥 Πάνω από το αναμενόμενο: <b>${esc(tn(hot[0].c))}</b> (${sg(hot[0].mk)}), <b>${esc(tn(hot[1].c))}</b> (${sg(hot[1].mk)})<br>🥶 Κάτω από το αναμενόμενο: <b>${esc(tn(cold.c))}</b> (${sg(cold.mk)})<br>🛡️ Αντίπαλοι πιο άστοχοι από το αναμενόμενο: <b>${esc(tn(def.c))}</b> (${sg(def.dmk)})</div>`;
  const text = `🎯 Καλά σουτ ή καλό σουτάρισμα;\n\nΠήραμε και τα ${rows.length.toLocaleString('el-GR')} σουτ της EuroLeague μετά από ${LAST_R} αγωνιστικές και ρωτήσαμε δύο πράγματα:\n1️⃣ Πόσο καλά ήταν τα σουτ; (αναμενόμενο eFG% από τη θέση τους)\n2️⃣ Μπήκαν περισσότερο ή λιγότερο απ' ό,τι θα περίμενε κανείς;\n\n🎯 Καλύτερες θέσεις σουτ: ${tn(bestQ.c)}\n🔥 Σουτάρουν πάνω από το αναμενόμενο: ${tn(hot[0].c)} (${sg(hot[0].mk)}), ${tn(hot[1].c)} (${sg(hot[1].mk)})\n🥶 Κάτω από το αναμενόμενο: ${tn(cold.c)} (${sg(cold.mk)})\n🛡️ Οι αντίπαλοι ${gen(def.c)} σουτάρουν ${sg(def.dmk)} κάτω από το αναμενόμενο\n\nΗ ποιότητα των σουτ συνήθως μένει. Η ευστοχία ανεβοκατεβαίνει. Ποιοι θα «κρυώσουν» και ποιοι θα ανέβουν; 👇\n\nΤα shot charts όλων: basketballstats.eu\n\n#EuroLeague #μπάσκετ #basketball #shotchart`;
  items.push({ fmt: 'shotq', key, html: card({ tag: 'ΑΝΑΛΥΣΗ ΣΟΥΤ', kicker: `EuroLeague · μετά από ${LAST_R} αγωνιστικές`, title: 'Καλά σουτ ή καλό σουτάρισμα;', sub: `${rows.length.toLocaleString('el-GR')} σουτ · αναμενόμενο eFG% από τη θέση του σουτ`, body, note: 'Μονάδες eFG% · αναμενόμενο = ποσοστό όλης της λίγκας ανά ζώνη' }), text, alt: 'Αναμενόμενο και πραγματικό eFG% ανά ομάδα' });
}

// ratings: επίθεση και άμυνα όλων των ομάδων
function ratings() {
  const key = `dp:ratings-r${LAST_R}`; if (state.posted.some(k => k.startsWith(key + '@'))) return;
  const L = [...TL].sort((a, b) => b.net - a.net);
  const mo = Math.max(...TL.map(t => t.ortg)), lo = Math.min(...TL.map(t => t.ortg)), md = Math.max(...TL.map(t => t.drtg)), ld = Math.min(...TL.map(t => t.drtg));
  const row = (t, i) => `<tr><td style="font-size:24px;color:#8f98ad;width:40px;padding:5px 6px">${i + 1}</td><td style="font-size:26px;font-weight:700;padding:5px 6px;color:${ACTIVE.has(t.c) ? '#e4572e' : '#fff'}">${esc(tn(t.c))}</td><td class="n" style="font-size:26px;padding:5px 6px">${f1(t.ortg)}</td><td class="n" style="font-size:26px;padding:5px 6px">${f1(t.drtg)}</td><td class="n" style="font-size:26px;padding:5px 6px;color:${t.net >= 0 ? '#3ecf8e' : '#ff6b6b'}">${sg(t.net)}</td></tr>`;
  const bo = [...TL].sort((a, b) => b.ortg - a.ortg)[0], bd = [...TL].sort((a, b) => a.drtg - b.drtg)[0];
  const body = `<table><tr><td></td><td class="muted" style="font-size:22px;padding:6px">ΟΜΑΔΑ</td><td class="n muted" style="font-size:22px;padding:6px">ΕΠΙΘΕΣΗ</td><td class="n muted" style="font-size:22px;padding:6px">ΑΜΥΝΑ</td><td class="n muted" style="font-size:22px;padding:6px">ΔΙΑΦΟΡΑ</td></tr>${L.map(row).join('')}</table>`;
  const text = `📈 Επίθεση και άμυνα: όλες οι ομάδες της EuroLeague μετά από ${LAST_R} αγωνιστικές\n\nΠόντοι ανά 100 κατοχές, για να μη μετράει ο ρυθμός.\n\n⚡ Καλύτερη επίθεση: ${tn(bo.c)} (${f1(bo.ortg)})\n🛡️ Καλύτερη άμυνα: ${tn(bd.c)} (${f1(bd.drtg)})\n🥇 Καλύτερη διαφορά: ${tn(L[0].c)} (${sg(L[0].net)})\n\n${['OLY', 'PAN'].filter(c => T[c]).map(c => `${tn(c)}: ${f1(T[c].ortg)} / ${f1(T[c].drtg)} (${L.findIndex(t => t.c === c) + 1}η θέση)`).join('\n')}\n\nΠοια ομάδα σε ξαφνιάζει; 👇\n\nbasketballstats.eu\n\n#EuroLeague #μπάσκετ #basketball`;
  items.push({ fmt: 'ratings', key, html: card({ tag: 'ΕΠΙΘΕΣΗ & ΑΜΥΝΑ', kicker: `EuroLeague · μετά από ${LAST_R} αγωνιστικές`, title: 'Πόντοι ανά 100 κατοχές', body, note: `Κατοχές: FGA + 0,44·FTA − επιθ. ριμπάουντ + λάθη` }).replace('<h1>', '<h1 style="font-size:54px">'), text, alt: 'Επίθεση και άμυνα όλων των ομάδων ανά 100 κατοχές' });
  void mo; void lo; void md; void ld;
}

// profile: τα βασικά μιας ομάδας (μία τη μέρα)
function profile(n = 1) {
  const nextG = c => LG.filter(g => !g[6] && (g[2] === c || g[3] === c)).sort((a, b) => gDate(a[1]) - gDate(b[1]))[0];
  const nr = LG.filter(g => !g[6]).map(g => g[0]).sort((a, b) => a - b)[0] || LAST_R + 1;
  const order = Object.keys(T).filter(c => !state.posted.some(k => k.startsWith(`dp:profile-${c}-r${nr}@`)))
    .sort((a, b) => (ACTIVE.has(b) - ACTIVE.has(a)) || (gDate((nextG(a) || [0, '999999999'])[1]) - gDate((nextG(b) || [0, '999999999'])[1])) || a.localeCompare(b));
  for (const c of order.slice(0, n)) {
    const t = T[c], ng = nextG(c);
    const R = [['Πόντοι', 'ppg', false, f1], ['Πόντοι που δέχεται', 'papg', true, f1], ['Ριμπάουντ', 'rpg', false, f1], ['Ασίστ', 'apg', false, f1], ['Λάθη', 'tpg', true, f1], ['Τρίποντο', 'p3', false, pc], ['Βολές', 'ft', false, pc]];
    const rs = R.map(([l, k, low, f]) => ({ l, r: rank(c, k, low), v: f(t[k]) }));
    const body = `<table>${rs.map(o => `<tr><td>${o.l}</td><td class="n">${o.v}</td><td style="width:240px;padding-left:24px"><div class="trk"><i style="width:${Math.round(100 * (NT + 1 - o.r) / NT)}%;background:${rkCol(o.r)}"></i></div></td><td class="n" style="width:110px">${rk(o.r)}</td></tr>`).join('')}</table>
      <div style="margin-top:36px;font-size:30px;line-height:1.4">${(() => { const b = [...rs].sort((a, b) => a.r - b.r)[0], w = [...rs].sort((a, b) => b.r - a.r)[0]; return `Δυνατό σημείο: <span class="gr">${b.l.toLowerCase()} (${b.r}η)</span>. Αδύνατο: <span class="rd">${w.l.toLowerCase()} (${w.r}η)</span>.`; })()}${ng ? `<br><span class="muted">Επόμενος αγώνας: ${esc(tn(ng[2] === c ? ng[3] : ng[2]))} (${ng[2] === c ? 'εντός' : 'εκτός'}), ${gDate(ng[1]).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'numeric' })} ${hhmm(gDate(ng[1]))}</span>` : ''}</div>`;
    const b = [...rs].sort((a, b) => a.r - b.r)[0], w = [...rs].sort((a, b) => b.r - a.r)[0];
    const text = `📋 Τα βασικά ${gen(c)} μετά από ${t.g} αγώνες (${rec(c)})\n\nΘέση ανάμεσα στις ${NT} ομάδες της EuroLeague:\n${rs.map(o => `• ${o.l}: ${o.v} (${o.r}η)`).join('\n')}\n\n💪 Δυνατό σημείο: ${b.l.toLowerCase()}. ⚠️ Αδύνατο: ${w.l.toLowerCase()}.${ng ? `\nΕπόμενος αγώνας με ${acc(ng[2] === c ? ng[3] : ng[2])}.` : ''}\n\nΣυμφωνείς; Τι πρέπει να διορθώσει; 👇\n\nΌλα τα στατιστικά της ομάδας: basketballstats.eu\n\n#EuroLeague #μπάσκετ #basketball`;
    items.push({ fmt: 'profile', key: `dp:profile-${c}-r${nr}`, html: card({ col: vis(team(c)[1]), tag: 'ΠΡΟΦΙΛ ΟΜΑΔΑΣ', kicker: `${tn(c)} · EuroLeague ${SEAS}`, title: 'Τα βασικά', sub: `Ρεκόρ ${rec(c)}${pos(c) ? ` · ${pos(c)}η θέση` : ''} · θέση ανάμεσα στις ${NT} ομάδες`, body, note: `Ανά αγώνα · μέχρι και την ${LAST_R}η αγωνιστική` }), text, alt: `Προφίλ ${gen(c)}: θέση σε 7 κατηγορίες` });
  }
}

// ------------------------------------------------------------------ επιλογή
const postedToday = new Set(state.posted.filter(k => k.startsWith('dp:') && k.includes(`@${today}:`)).map(k => k.split('@')[0]));
const F = { recap, matchup, mvp, shotq, ratings };
for (const f of ['recap', 'matchup', 'mvp', 'shotq', 'ratings']) if (!ONLY || ONLY === f) F[f]();
if (!ONLY || ONLY === 'profile') profile(PER_DAY);
const todo = items.filter(it => !state.posted.some(k => k.startsWith(it.key + '@')));
const done = postedToday.size;
const pick = ALL ? todo : (done >= PER_DAY && !ONLY ? [] : todo.slice(0, 1));
console.log(`Data posts ${today}: ${done}/${PER_DAY} σήμερα · διαθέσιμα: ${todo.map(i => i.key).join(', ') || '—'}`);
if (!pick.length) { await fs.mkdir(path.dirname(PLAN), { recursive: true }); await fs.writeFile(PLAN, JSON.stringify({ date: today, items: [] }, null, 1)); process.exit(0); }

await fs.mkdir(outDir, { recursive: true });
const plan = { date: today, items: [] };
const { chromium } = DRY ? {} : await import('playwright');
const br = DRY ? null : await chromium.launch(E.PW_CHROME ? { executablePath: E.PW_CHROME } : {});
for (const it of pick) {
  const name = it.key.replace(/^dp:/, ''), img = path.join(outDir, `${name}.png`);
  if (!DRY) { const pg = await br.newPage({ viewport: { width: 1080, height: 1350 } }); await pg.setContent(it.html); await pg.screenshot({ path: img, type: 'png' }); await pg.close(); }
  if (ALL) await fs.writeFile(path.join(outDir, `${name}.txt`), it.text);
  // το κλειδί κρατά και την ημέρα (για το όριο των 3 την ημέρα) — daily-social.mjs προσθέτει «:<δίκτυο>»
  plan.items.push({ key: `${it.key}@${today}`, image: path.relative(ROOT, img), text: it.text, short: it.text.split('\n')[0] + ' · basketballstats.eu', kinds: ['post'], nets: ['fb', 'ig', 'threads'], alt: it.alt });
  console.log(`→ ${it.fmt}: ${it.text.split('\n')[0]}`);
}
if (br) await br.close();
await fs.writeFile(PLAN, JSON.stringify(plan, null, 1));
