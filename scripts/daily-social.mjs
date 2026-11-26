// Καθημερινή ρουτίνα social του BasketballStats (τρέχει από το GitHub Actions, workflow «Social καθημερινά»).
//   node scripts/daily-social.mjs prepare   βρίσκει το «Στατιστικό της ημέρας» και το pick της ημέρας, φτιάχνει κάρτες και βίντεο
//                                           στο social/daily/<ημερομηνία>/ και γράφει το social/daily/plan.json
//   (το workflow κάνει commit/push, ώστε οι εικόνες να έχουν δημόσιο URL για Instagram/Threads/Viber)
//   node scripts/daily-social.mjs post      ανεβάζει ό,τι λέει το plan.json σε κάθε συνδεδεμένο δίκτυο, μία φορά (data/daily-social.json)
//   SOCIAL_DATA=dist/assets/data.json  τοπικά δεδομένα · SOCIAL_DRY=1 μόνο εμφάνιση · DAILY_ONLY=stat|pick|shots|preview|top5|race|team
//   SOCIAL_PLAN=social/daily/<φάκελος>/plan.json  ανάρτηση έτοιμου plan (π.χ. δοκιμαστικό), χωρίς prepare
//
// «Στατιστικό της ημέρας»: από τους αγώνες της τελευταίας βραδιάς, όλα τα υποψήφια (σερί, ρεκόρ σεζόν, τέλειο σουτ,
// triple-double, σερί νικών ομάδας…) παίρνουν βαθμό σπανιότητας και κερδίζει το ένα. Μόνο επίσημα στατιστικά, τίποτα επινοημένο.
// Pick της ημέρας: ένα pick του High Fidelity για αγώνα της ημέρας· προτεραιότητα σε Ολυμπιακό/Παναθηναϊκό, μετά στο ματς
// με τις ψηλότερες ομάδες της βαθμολογίας. Μόνο αν ο αγώνας δεν έχει αρχίσει.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { statCardHtml, statStoryHtml, STAT_VIDEO_SECS } from './stat-card.mjs';
import { upcomingPicks, cardHtml, when, DISC, settledPicks, resultCardHtml, resultLine, recordLine } from './pick-cards.mjs';
import { shotReelHtml, shotOrder, SHOT_REEL_SECS } from './shot-reel.mjs';
import { isSeasonRecord, streakNote, activeStreak } from './stat-claims.mjs';
import { previewHtml, previewSecs, top5Html, TOP5_SECS, raceHtml, raceSecs, teamHtml, TEAM_SECS } from './round-videos.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://basketballstats.eu', RAW = 'https://raw.githubusercontent.com/kotetsi/basketballstats/main/';
const MODE = process.argv[2] || 'prepare', DRY = process.env.SOCIAL_DRY === '1', ONLY = process.env.DAILY_ONLY || '';
const PLAN = process.env.SOCIAL_PLAN ? path.resolve(ROOT, process.env.SOCIAL_PLAN) : path.join(ROOT, 'social', 'daily', 'plan.json'), STATE = path.join(ROOT, 'data', 'daily-social.json');
const readJ = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const CONF_SEASON = (await readJ(path.join(ROOT, 'site.config.json'), {})).season || 'E2026';
const athensDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });

if (MODE === 'post') { await post(); process.exit(0); }

// ------------------------------------------------------------------ prepare
const data = process.env.SOCIAL_DATA ? JSON.parse(await fs.readFile(process.env.SOCIAL_DATA, 'utf8')) : await (await fetch(`${SITE}/assets/data.json?t=${Date.now()}`)).json();
const GRN = await readJ(path.join(ROOT, 'data', 'greek-names.json'), {});
const state = await readJ(STATE, { posted: [] });
const today = process.env.DAILY_TODAY || athensDay(), yesterday = athensDay(new Date(new Date(today + 'T12:00:00Z') - 864e5));
const team = c => data.teams[c] || [c, '#e4572e'];
const tn = c => team(c)[0];
const nice = n => { const [s, f] = String(n).split(', '); return [f, s].filter(Boolean).map(w => w.toLowerCase().replace(/(^|[\s-])\S/g, m => m.toUpperCase())).join(' ').replace(/\bTj\b/g, 'TJ').replace(/\b(Ii|Iii|Iv|Jr)\b/g, m => m === 'Jr' ? 'Jr.' : m.toUpperCase()); };
const grName = n => { const g = GRN[n]; if (!g) return nice(n); const m = g.match(/^\S+\s+\(([^)]+)\)\s+(.+)$/); return m ? `${m[1]} ${m[2]}` : g; };
const gDate = w => new Date(Date.UTC(2020 + (+w[8]), +w.slice(0, 2) - 1, +w.slice(2, 4), +w.slice(4, 6), +w.slice(6, 8)));
const hhmm = d => d.toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const short = c => tn(c).split(' ')[0];
const SEAS = (() => { const y = +String(data.season || '').replace(/\D/g, ''); return y ? `${y}-${String(y + 1).slice(2)}` : ''; })();
const MASC = new Set(['OLY', 'PAN', 'RED']);   // αρσενικά ονόματα ομάδων (ο Ολυμπιακός, ο Παναθηναϊκός, ο Ερυθρός Αστέρας)
const accN = c => MASC.has(c) ? tn(c).split(' ').map(w => w.replace(/ς$/, '')).join(' ') : tn(c);
const vs = c => MASC.has(c) ? `στον ${accN(c)}` : `${/^([αεηιουωάέήίόύώ]|κ|π|τ|μπ|ντ|γκ|τσ|τζ|ξ|ψ)/i.test(tn(c)) ? 'στην' : 'στη'} ${tn(c)}`;
const withT = c => MASC.has(c) ? `τον ${accN(c)}` : `τη ${tn(c)}`;

const played = p => (p.g || []).filter(x => x[7] > 0).sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
// η τελευταία βραδιά με αγώνες: χθες ή σήμερα (ώρα Ελλάδας)
const days = [...new Set(data.players.flatMap(p => played(p).map(x => x[1])))].sort();
const D = [today, yesterday].find(d => days.includes(d));
const plan = { date: today, items: [] };
const outDir = path.join(ROOT, 'social', 'daily', today);

if (D && (!ONLY || ONLY === 'stat') && !state.posted.some(k => k.startsWith(`stat:${D}:`))) {
  const C = [];   // υποψήφια: { score, card, caption }
  const all = data.players.map(p => ({ p, G: played(p) })).filter(o => o.G.length);
  const teamOf = p => p.t.split(';').pop();
  const nextToday = c => data.league.games.find(g => !g[6] && (g[2] === c || g[3] === c) && athensDay(gDate(g[1])) === today);
  const later = (c, what) => { const g = nextToday(c); if (!g) return ''; const opp = g[2] === c ? g[3] : g[2]; return ` Απόψε (${hhmm(gDate(g[1]))}) με ${withT(opp)} ${what}`; };
  const barsOf = (G, k, n, f = x => x[k]) => G.slice(-n).map(x => [`${x[0]}η · ${short(x[2])}`, f(x)]);
  // όλες οι άλλες τιμές της σεζόν: όλοι οι αγώνες όλων, εκτός από τον συγκεκριμένο αγώνα του παίκτη (και της ίδιας βραδιάς οι άλλοι μετράνε)
  const othersOf = (row, f) => all.flatMap(o => o.G.filter(x => x !== row).map(f));
  for (const { p, G } of all) {
    const last = G[G.length - 1]; if (last[1] !== D) continue;
    const c = teamOf(p), who = `${tn(c)} · EuroLeague ${SEAS}`.replace(/\s·\s$/, ''), name = grName(p.n);
    const base = { team: team(c), who, player: name };
    // 1. σερί αγώνων με 20+ πόντους
    const s = activeStreak(G, x => x[8] >= 20);
    if (s >= 3) {
      const others = all.filter(o => o.p !== p).map(o => activeStreak(o.G, x => x[8] >= 20));
      const alone = others.every(k => k < s), best = Math.max(...all.map(o => { let b = 0, k = 0; for (const x of o.G) { k = x[8] >= 20 ? k + 1 : 0; b = Math.max(b, k); } return b; }));
      const extra = streakNote(s, others);
      C.push({ score: s * 12 + (alone ? 10 : 0) + (s >= best ? 15 : 0), card: { ...base, big: String(s), bigLabel: 'σερί αγώνες<br>με 20+ πόντους', line: `${extra}${later(c, `κυνηγά τον ${s + 1}ο.`)}`, bars: barsOf(G, 8, Math.min(s, 6)) },
        caption: `Ο ${name} έχει ${s} σερί αγώνες με 20+ πόντους: ${G.slice(-s).map(x => x[8]).join(' – ')}.\n${extra}${later(c, `κυνηγά τον ${s + 1}ο στη σειρά. Θα τα καταφέρει; 👇`)}` });
    }
    // 2. ρεκόρ σεζόν σε πόντους / PIR / ασίστ / ριμπάουντ / τρίποντα (σε έναν αγώνα)
    for (const [k, min, lab, f, w] of [[8, 25, 'πόντοι', null, 1.1], [25, 32, 'PIR', null, 1], [17, 11, 'ασίστ', null, 3], ['reb', 14, 'ριμπάουντ', x => x[15] + x[16], 2.5], [11, 7, 'τρίποντα', null, 5]]) {
      const v = f ? f(last) : last[k];
      if (v >= min && isSeasonRecord(v, othersOf(last, f || (x => x[k])))) C.push({ score: 30 + v * w, card: { ...base, big: String(v), bigLabel: `${lab}<br>— ρεκόρ σεζόν`, line: `Κανείς δεν είχε φέτος περισσότερα ${lab === 'PIR' ? 'PIR' : lab} σε αγώνα EuroLeague. Έγινε κόντρα ${vs(last[2])}.`, bars: barsOf(G, k, 5, f || undefined) },
        caption: `${v} ${lab} για τον ${name} κόντρα ${vs(last[2])}: ρεκόρ σεζόν στην EuroLeague. Κανείς δεν είχε φέτος περισσότερα σε έναν αγώνα.` });
    }
    // 3. τέλειο σουτ (8+ προσπάθειες εντός πεδιάς, όλες εύστοχες)
    const fgm = last[9] + last[11], fga = last[10] + last[12];
    if (fga >= 8 && fgm === fga) C.push({ score: 25 + fga * 3, card: { ...base, big: `${fgm}/${fga}`, bigLabel: 'σουτ εντός πεδιάς<br>χωρίς αστοχία', line: `${last[8]} πόντοι κόντρα ${vs(last[2])}, χωρίς να χάσει ούτε ένα σουτ.`, bars: barsOf(G, 8, 5) },
      caption: `${fgm}/${fga} σουτ για τον ${name}: ${last[8]} πόντοι κόντρα ${vs(last[2])} χωρίς ούτε μία αστοχία εντός πεδιάς.` });
    // 4. triple-double
    const reb = last[15] + last[16];
    if ([last[8], reb, last[17]].filter(v => v >= 10).length >= 3) C.push({ score: 90, card: { ...base, big: 'Triple', bigLabel: 'double', line: `${last[8]} πόντοι, ${reb} ριμπάουντ, ${last[17]} ασίστ κόντρα ${vs(last[2])}.`, bars: [['Πόντοι', last[8]], ['Ριμπάουντ', reb], ['Ασίστ', last[17]]] },
      caption: `Triple-double για τον ${name}: ${last[8]} πόντοι, ${reb} ριμπάουντ, ${last[17]} ασίστ κόντρα ${vs(last[2])}.` });
    // 5. μεγάλη βραδιά: 30+ πόντοι
    if (last[8] >= 30) C.push({ score: last[8], card: { ...base, big: String(last[8]), bigLabel: 'πόντοι', line: `Με ${fgm}/${fga} σουτ και ${last[13]}/${last[14]} βολές κόντρα ${vs(last[2])} (${last[25]} PIR).`, bars: barsOf(G, 8, 5) },
      caption: `${last[8]} πόντοι για τον ${name} κόντρα ${vs(last[2])}, με ${fgm}/${fga} σουτ και ${last[25]} PIR.` });
  }
  // 6. σερί νικών ομάδας (6+)
  for (const c of Object.keys(data.teams)) {
    const R = data.league.games.filter(g => g[6] && (g[2] === c || g[3] === c)).sort((a, b) => a[0] - b[0]);
    const lastG = R[R.length - 1]; if (!lastG || athensDay(gDate(lastG[1])) !== D) continue;
    const won = g => (g[2] === c ? g[4] > g[5] : g[5] > g[4]);
    let s = 0; for (const g of [...R].reverse()) { if (won(g)) s++; else break; }
    if (s >= 6) C.push({ score: s * 6, card: { team: team(c), who: `EuroLeague ${SEAS}`.trim(), player: tn(c), big: String(s), bigLabel: 'σερί νίκες', line: `${s} νίκες στη σειρά στην EuroLeague, με διαφορές ${R.slice(-Math.min(s, 6)).map(g => Math.abs(g[4] - g[5])).join(', ')} πόντων.${later(c, `πάει για την ${s + 1}η.`)}`, bars: R.slice(-Math.min(s, 6)).map(g => [`${g[0]}η · ${short(g[2] === c ? g[3] : g[2])}`, Math.abs(g[4] - g[5])]) },
      caption: `${s} σερί νίκες για την ${tn(c)} στην EuroLeague.${later(c, `πάει για την ${s + 1}η.`)}` });
  }
  // εφεδρικό: ο κορυφαίος σε PIR της βραδιάς (υπάρχει πάντα όταν υπήρξαν αγώνες)
  if (!C.length) {
    const top = all.filter(o => o.G[o.G.length - 1][1] === D).sort((a, b) => b.G[b.G.length - 1][25] - a.G[a.G.length - 1][25])[0];
    if (top) { const x = top.G[top.G.length - 1], c = teamOf(top.p); C.push({ score: 1, card: { team: team(c), who: `${tn(c)} · MVP της βραδιάς`, player: grName(top.p.n), big: String(x[25]), bigLabel: 'PIR', line: `${x[8]} πόντοι, ${x[15] + x[16]} ριμπάουντ, ${x[17]} ασίστ κόντρα ${vs(x[2])}.`, bars: barsOf(top.G, 25, 5) }, caption: `MVP της βραδιάς ο ${grName(top.p.n)}: ${x[25]} PIR με ${x[8]} πόντους, ${x[15] + x[16]} ριμπάουντ και ${x[17]} ασίστ.` }); }
  }
  C.sort((a, b) => b.score - a.score);
  if (C[0]) {
    const w = C[0], text = `📊 Στατιστικό της ημέρας\n\n${w.caption}\n\nΌλα τα στατιστικά: basketballstats.eu\n\n#EuroLeague #μπάσκετ #basketball`;
    await fs.mkdir(outDir, { recursive: true });
    const img = path.join(outDir, 'stat.png'), vid = path.join(outDir, 'stat.mp4');
    if (!DRY) await render(statCardHtml(w.card), img, 1080, 1350), await renderVideo(statStoryHtml(w.card), vid);
    plan.items.push({ key: `stat:${D}`, ytTitle: w.caption.split(/(?<=[.!])\s/)[0].replace(/[.!]$/, ''), image: path.relative(ROOT, img), video: path.relative(ROOT, vid), text, short: `📊 ${w.caption.split('\n')[0]} basketballstats.eu`, kinds: ['post', 'reel', 'story'], alt: w.caption.split('\n')[0] });
    console.log(`Στατιστικό της ημέρας (${D}, ${C.length} υποψήφια, βαθμός ${w.score}):\n${w.caption}`);
  }
}

// «Όλα τα σουτ του»: Reel με το shot chart του παίκτη με τους περισσότερους πόντους από σουτ της βραδιάς
// (τουλάχιστον 10 σουτ με θέση). Μόνο Facebook/Instagram Reels· ο κορυφαίος σε κάθε περίπτωση από τα επίσημα δεδομένα σουτ.
if (D && (!ONLY || ONLY === 'shots') && !state.posted.some(k => k.startsWith(`shots:${D}:`))) {
  const sdir = path.join(ROOT, 'data', 'shots', CONF_SEASON);
  const games = [];
  for (const f of await fs.readdir(sdir).catch(() => [])) { const g = await readJ(path.join(sdir, f), null); if (g?.d === D && g.s?.length) games.push(g); }
  const byP = new Map();
  for (const g of games) for (const r of g.s) {
    const [pi, home, q, clk, made, three, x, y] = r, pid = g.ids[pi];
    if (!byP.has(pid)) byP.set(pid, { pid, g, home, shots: [] });
    byP.get(pid).shots.push({ q, clk, made, three, x, y });
  }
  const pts = o => o.shots.reduce((s, x) => s + (x.made ? (x.three ? 3 : 2) : 0), 0);
  const best = [...byP.values()].filter(o => o.shots.filter(s => s.x != null).length >= 10).sort((a, b) => pts(b) - pts(a) || b.shots.length - a.shots.length)[0];
  const pl = best && data.players.find(p => p.c === best.pid), row = pl && played(pl).find(x => x[1] === D);
  if (best && pl && row) {
    const g = best.g, c = best.home ? g.h : g.a, opp = best.home ? g.a : g.h, my = best.home ? g.hs : g.as, ot = best.home ? g.as : g.hs;
    const shots = best.shots.sort(shotOrder), name = grName(pl.n);
    const fgm = row[9] + row[11], fga = row[10] + row[12];
    const res = `${my > ot ? 'Νίκη' : 'Ήττα'} ${my}-${ot}`;
    const line = `${row[8]} πόντοι · ${fgm}/${fga} σουτ εντός παιδιάς, ${row[11]}/${row[12]} τρίποντα, ${row[13]}/${row[14]} βολές.`;
    const html = shotReelHtml({ team: team(c), player: name, who: `${tn(c)} · ${res} κόντρα ${vs(opp)}`, line, shots });
    await fs.mkdir(outDir, { recursive: true });
    const img = path.join(outDir, 'shots.png'), vid = path.join(outDir, 'shots.mp4');
    if (!DRY) { await renderStill(html, img, SHOT_REEL_SECS); await renderVideo(html, vid, SHOT_REEL_SECS); }
    const when2 = D === today ? 'απόψε' : 'χθες', text = `🎯 Όλα τα σουτ του ${name} ${when2}\n\n${row[8]} πόντοι με ${fgm}/${fga} εντός παιδιάς και ${row[11]}/${row[12]} τρίποντα (${res} κόντρα ${vs(opp)}).\n\nΤα shot charts όλων των παικτών: basketballstats.eu\n\n#EuroLeague #μπάσκετ #basketball #shotchart`;
    plan.items.push({ key: `shots:${D}`, image: path.relative(ROOT, img), video: path.relative(ROOT, vid), text, short: `🎯 Όλα τα σουτ του ${name}: ${row[8]} πόντοι, ${fgm}/${fga} · basketballstats.eu`, kinds: ['reel'], nets: ['fb', 'ig', 'yt'], ytTitle: `Όλα τα σουτ του ${name}: ${row[8]} πόντοι, ${fgm}/${fga} εντός παιδιάς`, alt: `Shot chart: ${name}, ${fgm}/${fga}` });
    console.log(`Σουτ της βραδιάς (${D}): ${name}, ${row[8]} πόντοι, ${shots.length} σουτ`);
  } else console.log(`Σουτ της βραδιάς (${D}): δεν βρέθηκε παίκτης με ≥10 σουτ (${games.length} αγώνες στα data/shots)`);
}

// ------------------------------------------------------------------ Reels ανά αγωνιστική
// Ομάδα του μοντέλου (Fantasy): την πρώτη μέρα κάθε αγωνιστικής, πριν από το πρώτο τζάμπολ (ενότητα 4 πιο κάτω).
// Προεπισκόπηση: την πρώτη μέρα κάθε αγωνιστικής, όλοι οι αγώνες με τις πιθανότητες του μοντέλου (data.mp).
// Top 5: τη μέρα μετά (ή το ίδιο βράδυ) του τελευταίου αγώνα μιας αγωνιστικής, οι 5 κορυφαίοι σε PIR.
// Κούρσα σκόρερ: δύο μέρες μετά το τέλος της αγωνιστικής (για να μην πέφτει την ίδια μέρα με το Top 5).
{
  const G = data.league.games, gDay = g => athensDay(gDate(g[1]));
  const rounds = [...new Set(G.map(g => g[0]))].sort((a, b) => a - b);
  const ofR = r => G.filter(g => g[0] === r);
  const done = r => ofR(r).length && ofR(r).every(g => g[6]);
  const lastDay = r => ofR(r).map(gDay).sort().pop(), firstDay = r => ofR(r).map(gDay).sort()[0];
  const dAgo = n => athensDay(new Date(new Date(today + 'T12:00:00Z') - n * 864e5));
  const nm = c => [tn(c), team(c)[1]];
  const rowsOf = r => data.players.flatMap(p => played(p).filter(x => x[0] === r).map(x => ({ p, x })));
  const fullName = n => grName(n);

  // 1. Προεπισκόπηση
  // με DAILY_ONLY=preview (χειροκίνητα): η επόμενη αγωνιστική που δεν έχει ολοκληρωθεί, όποια μέρα κι αν είναι
  for (const r of rounds.filter(r => !done(r) && (firstDay(r) === today || (ONLY === 'preview' && r === rounds.find(q => !done(q)))))) {
    if ((ONLY && ONLY !== 'preview') || state.posted.some(k => k.startsWith(`preview:${r}:`))) continue;
    const byDay = new Map();
    for (const g of ofR(r).filter(g => !g[6]).sort((a, b) => gDate(a[1]) - gDate(b[1]))) {
      const d = gDay(g); if (!byDay.has(d)) byDay.set(d, []);
      const m = data.mp?.[`${g[2]}|${g[3]}`];
      byDay.get(d).push({ h: nm(g[2]), a: nm(g[3]), time: hhmm(gDate(g[1])), ph: m ? m[2] : null, hc: g[2], ac: g[3] });
    }
    const dayLbl = d => new Date(d + 'T12:00:00Z').toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' });
    const o = { round: r, days: [...byDay].map(([d, games]) => ({ label: dayLbl(d), games })) };
    const all = o.days.flatMap(d => d.games); if (!all.length) continue;
    const fav = all.filter(g => g.ph != null).map(g => ({ g, p: Math.max(g.ph, 1 - g.ph), c: g.ph >= .5 ? g.hc : g.ac })).sort((a, b) => b.p - a.p);
    const close = [...fav].sort((a, b) => a.p - b.p)[0];
    const html = previewHtml(o), secs = previewSecs(o);
    await fs.mkdir(outDir, { recursive: true });
    const img = path.join(outDir, 'preview.png'), vid = path.join(outDir, 'preview.mp4');
    if (!DRY) { await renderStill(html, img, secs); await renderVideo(html, vid, secs); }
    const lines = o.days.map(d => `📅 ${d.label}\n` + d.games.map(g => `${g.h[0]} – ${g.a[0]} (${g.time})${g.ph != null ? `: ${Math.round(g.ph * 100)}% – ${100 - Math.round(g.ph * 100)}%` : ''}`).join('\n')).join('\n\n');
    const hl = fav[0] ? `\n\nΜεγαλύτερο φαβορί: ${tn(fav[0].c)} (${Math.round(fav[0].p * 100)}%).${close && close !== fav[0] ? ` Πιο ισορροπημένο: ${close.g.h[0]} – ${close.g.a[0]}.` : ''}` : '';
    const text = `🔮 ${r}η αγωνιστική EuroLeague: ποιος είναι φαβορί;\n\n${lines}${hl}\n\nΠιθανότητες νίκης από το μοντέλο μας, όχι εγγύηση. Όλες οι προβλέψεις: basketballstats.eu\n\n#EuroLeague #μπάσκετ #basketball`;
    plan.items.push({ key: `preview:${r}`, image: path.relative(ROOT, img), video: path.relative(ROOT, vid), text, short: `🔮 ${r}η αγωνιστική EuroLeague: ποιος είναι φαβορί; Οι πιθανότητες όλων των αγώνων · basketballstats.eu`, kinds: ['reel'], nets: ['fb', 'ig', 'yt'], ytTitle: `${r}η αγωνιστική EuroLeague: ποιος είναι φαβορί;`, alt: `Πιθανότητες νίκης ${r}ης αγωνιστικής` });
    console.log(`Προεπισκόπηση ${r}ης αγωνιστικής: ${all.length} αγώνες`);
  }

  // 2. Top 5 (PIR) της αγωνιστικής που μόλις τελείωσε
  const R5 = rounds.filter(r => done(r) && (ONLY === 'top5' || (D && lastDay(r) === D))).pop();
  if (R5 && (!ONLY || ONLY === 'top5') && !state.posted.some(k => k.startsWith(`top5:${R5}:`))) {
    const T = rowsOf(R5).sort((a, b) => b.x[25] - a.x[25] || b.x[8] - a.x[8]).slice(0, 5);
    if (T.length === 5) {
      const players = T.map(({ p, x }) => { const c = p.t.split(';').pop(); return { name: fullName(p.n), team: team(c), pir: x[25], line: `${x[8]} πόντοι · ${x[15] + x[16]} ριμπάουντ · ${x[17]} ασίστ`, opp: vs(x[2]) }; });
      const html = top5Html({ round: R5, players });
      await fs.mkdir(outDir, { recursive: true });
      const img = path.join(outDir, 'top5.png'), vid = path.join(outDir, 'top5.mp4');
      if (!DRY) { await renderStill(html, img, TOP5_SECS); await renderVideo(html, vid, TOP5_SECS); }
      const text = `🏆 Το Top 5 της ${R5}ης αγωνιστικής (PIR)\n\n${players.map((q, i) => `${i + 1}. ${q.name} (${q.team[0]}): ${q.pir} PIR · ${q.line}`).join('\n')}\n\nΌλα τα στατιστικά: basketballstats.eu\n\n#EuroLeague #μπάσκετ #basketball`;
      plan.items.push({ key: `top5:${R5}`, image: path.relative(ROOT, img), video: path.relative(ROOT, vid), text, short: `🏆 Top 5 της ${R5}ης αγωνιστικής: 1. ${players[0].name} ${players[0].pir} PIR · basketballstats.eu`, kinds: ['reel'], nets: ['fb', 'ig', 'yt'], ytTitle: `Το Top 5 της ${R5}ης αγωνιστικής EuroLeague: ${players[0].name} στο Νο1`, alt: `Top 5 ${R5}ης αγωνιστικής` });
      console.log(`Top 5 ${R5}ης αγωνιστικής: ${players.map(q => q.name + ' ' + q.pir).join(', ')}`);
    }
  }

  // 3. Κούρσα σκόρερ (σύνολο πόντων) μέχρι την τελευταία ολοκληρωμένη αγωνιστική
  const RR = rounds.filter(r => done(r)).pop();
  if (RR >= 3 && (!ONLY || ONLY === 'race') && !state.posted.some(k => k.startsWith(`race:${RR}:`)) && (ONLY === 'race' || [dAgo(2), dAgo(3), dAgo(4)].includes(lastDay(RR)))) {
    const tot = new Map(), frames = [];
    for (let r = 1; r <= RR; r++) {
      for (const { p, x } of rowsOf(r)) tot.set(p.c, (tot.get(p.c) || 0) + x[8]);
      if (r >= 3) frames.push({ r, v: Object.fromEntries([...tot].sort((a, b) => b[1] - a[1]).slice(0, 20)) });
    }
    const keys = new Set(frames.flatMap(f => Object.keys(f.v))), byC = new Map(data.players.map(p => [p.c, p]));
    const who = Object.fromEntries([...keys].map(k => { const p = byC.get(k), c = p.t.split(';').pop(); return [k, [fullName(p.n), tn(c), team(c)[1]]]; }));
    const o = { round: RR, label: 'Οι κορυφαίοι σκόρερ', frames, who, top: 10 }, secs = raceSecs(o), html = raceHtml(o);
    const fin = Object.entries(frames.at(-1).v).sort((a, b) => b[1] - a[1]).slice(0, 5);
    await fs.mkdir(outDir, { recursive: true });
    const img = path.join(outDir, 'race.png'), vid = path.join(outDir, 'race.mp4');
    if (!DRY) { await renderStill(html, img, secs); await renderVideo(html, vid, secs); }
    const text = `🏁 Η κούρσα των σκόρερ της EuroLeague μετά από ${RR} αγωνιστικές\n\n${fin.map(([k, v], i) => `${i + 1}. ${who[k][0]} (${who[k][1]}): ${v} πόντοι`).join('\n')}\n\nΠοιος θα τελειώσει πρώτος; 👇\n\nΌλοι οι κορυφαίοι: basketballstats.eu\n\n#EuroLeague #μπάσκετ #basketball`;
    plan.items.push({ key: `race:${RR}`, image: path.relative(ROOT, img), video: path.relative(ROOT, vid), text, short: `🏁 Η κούρσα των σκόρερ της EuroLeague μετά από ${RR} αγωνιστικές: πρώτος ο ${who[fin[0][0]][0]} με ${fin[0][1]} · basketballstats.eu`, kinds: ['reel'], nets: ['fb', 'ig', 'yt'], ytTitle: `Η κούρσα των σκόρερ της EuroLeague: αγωνιστική προς αγωνιστική (1η–${RR}η)`, alt: `Bar race σκόρερ 1η–${RR}η αγωνιστική` });
    console.log(`Κούρσα σκόρερ έως την ${RR}η: πρώτος ${who[fin[0][0]][0]} ${fin[0][1]}`);
  }

  // 4. Η ομάδα του μοντέλου: την πρώτη μέρα της αγωνιστικής (πριν από το πρώτο τζάμπολ), η βέλτιστη σύνθεση του optimizer (balanced)
  //    με τιμές, εκτιμήσεις PIR, αντίπαλο και αρχηγό. Με DAILY_ONLY=team: η επόμενη αγωνιστική όποια μέρα κι αν είναι.
  const RT = rounds.find(r => !done(r));
  if (RT && (!ONLY || ONLY === 'team') && (ONLY === 'team' || firstDay(RT) === today) && !state.posted.some(k => k.startsWith(`team:${RT}:`))) {
    try {
      const opt = process.env.SOCIAL_OPT ? JSON.parse(await fs.readFile(process.env.SOCIAL_OPT, 'utf8')) : await (await fetch(`${SITE}/api/fantasy/optimizer/balanced.json?t=${Date.now()}`)).json();
      const fx = await readJ(path.join(ROOT, 'data', 'fantasy', 'latest.json'), {});
      const first = Math.min(...ofR(RT).map(g => +gDate(g[1])));
      if (opt.round !== RT || fx.round !== RT) throw new Error(`optimizer για την ${opt.round}η, μοντέλο για την ${fx.round}η (θέλω ${RT}η)`);
      if (!ONLY && Date.now() > first) throw new Error('η αγωνιστική άρχισε ήδη');
      const off = Object.fromEntries((await fs.readFile(path.join(ROOT, 'fantasy', 'official', `prices-r${RT}.csv`), 'utf8').catch(() => '')).split('\n').filter(l => /^\d/.test(l)).map(l => { const c = l.split(','); return [c[0], c[c.length - 1].trim()]; }));
      const FP = Object.fromEntries((fx.players || []).map(p => [p.c, p])), DP = Object.fromEntries(data.players.map(p => [p.c, p]));
      const surname = n => { const g = grName(n).split(' '); return g.length > 1 ? g.slice(1).join(' ') : g[0]; };
      const cardOf = c => { const p = FP[c]; if (!p) throw new Error('λείπει ο παίκτης ' + c); const t = p.t.split(';').pop();
        return { name: surname(p.n), full: grName(p.n), team: nm(t), no: DP[c]?.no ?? '', pos: off[c] || { Guard: 'G', Forward: 'F', Center: 'C' }[p.pos] || 'F', price: p.price, proj: p.pp, opp: short(p.opp), oppFull: tn(p.opp), home: !!p.home, cap: c === opt.captain }; };
      const co = (fx.coaches || []).find(x => x.t === opt.coach) || { price: 0, opp: '', home: 0 };
      const o = { round: RT, target: opt.projected.expected, floor: opt.projected.floor, ceil: opt.projected.ceiling, cost: opt.cost, budget: 100,
        five: opt.start.map(cardOf), sixth: opt.sixth && cardOf(opt.sixth), bench: opt.bench.map(cardOf), coach: { team: nm(opt.coach), price: co.price, opp: short(co.opp), home: !!co.home } };
      await fs.mkdir(outDir, { recursive: true });
      const img = path.join(outDir, 'team.png'), vid = path.join(outDir, 'team.mp4'), html = teamHtml(o);
      if (!DRY) { await renderStill(html, img, TEAM_SECS); await renderVideo(html, vid, TEAM_SECS); }
      const capP = o.five.find(p => p.cap), line = p => `${p.full} (${p.team[0]}) ${p.price.toFixed(1)} cr · ≈${Math.round(p.proj)} PIR`;
      const text = `🧠 Η ομάδα του μοντέλου για την ${RT}η αγωνιστική του EuroLeague Fantasy\n\nΠεντάδα:\n${o.five.map(p => `${p.cap ? '©️' : '•'} ${line(p)}`).join('\n')}\n\n6ος: ${o.sixth ? line(o.sixth) : '—'}\nΠάγκος: ${o.bench.map(p => p.full).join(', ')}\nΠροπονητής: ${o.coach.team[0]}\n\nΑρχηγός: ${capP ? capP.full : '—'} · κόστος ${o.cost.toFixed(1)}/100\nΕκτίμηση: ${Math.round(o.target)} πόντοι (εύρος ${Math.round(o.floor)}–${Math.round(o.ceil)})\n\nΜπορεί η δική σου να τη νικήσει; Γράψ' τη στα σχόλια 👇\nΌλη η ανάλυση: basketballstats.eu/fantasy\n\n#EuroLeagueFantasy #EuroLeague #fantasy`;
      plan.items.push({ key: `team:${RT}`, image: path.relative(ROOT, img), video: path.relative(ROOT, vid), text, short: `🧠 Η ομάδα του μοντέλου για την ${RT}η αγωνιστική του EuroLeague Fantasy: αρχηγός ${capP ? capP.full : ''}, εκτίμηση ${Math.round(o.target)} πόντοι · basketballstats.eu`, kinds: ['reel'], nets: ['fb', 'ig', 'yt'], ytTitle: `EuroLeague Fantasy ${RT}η αγωνιστική: η ομάδα του μοντέλου (${Math.round(o.target)} πόντοι;)`, alt: `Ομάδα Fantasy ${RT}ης αγωνιστικής` });
      console.log(`Ομάδα του μοντέλου ${RT}ης: αρχηγός ${capP?.full}, εκτίμηση ${Math.round(o.target)}`);
    } catch (e) { console.error('Ομάδα του μοντέλου: παράλειψη —', e.message); }
  }
}

// «Το είπαμε»: κάρτα αποτελέσματος για κάθε pick του High Fidelity που κρίθηκε χθες (ή σήμερα, για αγώνες που τελείωσαν),
// και όταν βγήκε και όταν δεν βγήκε. Το ιστορικό είναι δημόσιο, άρα δείχνουμε και τα χαμένα. Έως 3 την ημέρα.
if (!ONLY || ONLY === 'result') {
  const R = [yesterday, today].flatMap(d => settledPicks(data, ['high-fidelity'], d))
    .filter(t => !state.posted.some(k => k.startsWith(`result:${t.u}:`))).slice(0, 3);
  for (const [i, t] of R.entries()) {
    const won = t.res === 'W', [hs, as] = String(t.sc || '').split('-'), got = resultLine(t), link = SITE + '/tipsters/';
    await fs.mkdir(outDir, { recursive: true });
    const img = path.join(outDir, `result-${i + 1}.png`), vid = path.join(outDir, `result-${i + 1}.mp4`);
    if (!DRY) { await render(resultCardHtml(t, data), img, 1080, 1350); stillVideo(img, vid); }
    const text = `${won ? '✅ Το είπαμε' : '❌ Δεν βγήκε'} · ${t.n}\n\n🏀 ${tn(t.h)} ${hs}-${as} ${tn(t.a)}\n👉 ${t.l}${t.o ? ` @${Number(t.o).toFixed(2)}` : ''}${got ? `\n📈 ${got}` : ''}\n\n📊 ${recordLine(t)}\nΚάθε επιλογή καταγράφεται πριν από τον αγώνα, μαζί και όσες χάνουν: ${link}\n\n${DISC}\n\n#EuroLeague #μπάσκετ`;
    plan.items.push({ key: `result:${t.u}`, image: path.relative(ROOT, img), video: path.relative(ROOT, vid), text, textIg: text.replace(`: ${link}`, ' στο basketballstats.eu (link στο προφίλ)'),
      short: `${won ? '✅ Το είπαμε' : '❌ Δεν βγήκε'}: ${tn(t.h)} ${hs}-${as} ${tn(t.a)} · ${t.l}${t.o ? ` @${Number(t.o).toFixed(2)}` : ''} · ${recordLine(t)} · basketballstats.eu · 21+`, link, kinds: ['post', 'story'], alt: `${won ? 'Πέτυχε' : 'Δεν βγήκε'}: ${t.l}` });
    console.log(`Αποτέλεσμα pick: ${t.l} → ${won ? 'ΠΕΤΥΧΕ' : 'ΔΕΝ ΒΓΗΚΕ'}`);
  }
}

if ((!ONLY || ONLY === 'pick') && !state.posted.some(k => k.startsWith(`pick:${today}:`))) {
  const rank = Object.fromEntries(data.league.stand.map(s => [s[1], s[0]]));
  const P = upcomingPicks(data, ['high-fidelity']).filter(t => athensDay(t.start) === today)
    .map(t => ({ t, sc: (['OLY', 'PAN'].some(c => c === t.h || c === t.a) ? 100 : 0) - (rank[t.h] || 20) - (rank[t.a] || 20) }))
    .sort((a, b) => b.sc - a.sc);
  if (P[0]) {
    const t = P[0].t, link = SITE + t.u;
    await fs.mkdir(outDir, { recursive: true });
    const img = path.join(outDir, 'pick.png'), vid = path.join(outDir, 'pick.mp4');
    if (!DRY) { await render(cardHtml(t, data), img, 1080, 1350); stillVideo(img, vid); }
    const text = `🎯 Το pick της ημέρας · ${t.n}\n\n🏀 ${tn(t.h)} – ${tn(t.a)}\n🕗 ${when(t.start)}\n\n👉 ${t.l}${t.o ? ` @${Number(t.o).toFixed(2)}` : ''}\n\n📝 Η ανάλυση: ${link}\n\n${DISC}\n\n#EuroLeague #μπάσκετ`;
    plan.items.push({ key: `pick:${today}`, image: path.relative(ROOT, img), video: path.relative(ROOT, vid), text, textIg: text.replace(`📝 Η ανάλυση: ${link}`, '📝 Η ανάλυση στο basketballstats.eu (link στο προφίλ)'),
      short: `🎯 Pick της ημέρας: ${tn(t.h)} – ${tn(t.a)} · ${t.l}${t.o ? ` @${Number(t.o).toFixed(2)}` : ''} · ανάλυση στο basketballstats.eu · 21+ Παίζουμε υπεύθυνα`, link, kinds: ['post', 'story'], gameStart: t.start.toISOString(), pick: true });
    console.log(`Pick της ημέρας: ${tn(t.h)} – ${tn(t.a)} · ${t.l}`);
  }
}
await fs.mkdir(path.dirname(PLAN), { recursive: true });
await fs.writeFile(PLAN, JSON.stringify(plan, null, 1));
if (!plan.items.length) console.log('Social καθημερινά: τίποτα νέο για σήμερα.');
if (DRY) console.log(JSON.stringify(plan, null, 1));

// ------------------------------------------------------------------ helpers
async function render(html, file, w, h) {
  const { chromium } = await import('playwright');
  const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}), pg = await b.newPage({ viewport: { width: w, height: h } });
  await pg.setContent(html); await pg.screenshot({ path: file, type: 'png' }); await b.close();
}
function beat(out, secs) {   // δικό μας beat (kick, snare, hi-hat, μπάσο, χαλί), χωρίς δικαιώματα
  const d = secs;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `aevalsrc='0.9*sin(2*PI*(45+110*exp(-mod(t,1.25)*35))*mod(t,1.25))*exp(-mod(t,1.25)*9)':s=44100:d=${d}`,
    '-f', 'lavfi', '-i', `aevalsrc='0.35*(2*random(0)-1)*exp(-mod(t-0.625,1.25)*22)*gte(t,0.625)':s=44100:d=${d}`,
    '-f', 'lavfi', '-i', `aevalsrc='0.12*(2*random(1)-1)*exp(-mod(t,0.3125)*60)':s=44100:d=${d}`,
    '-f', 'lavfi', '-i', `aevalsrc='0.22*sin(2*PI*if(lt(mod(t,5),2.5),55,if(lt(mod(t,5),3.75),49,41.2))*t)*(0.6+0.4*exp(-mod(t,0.625)*4))':s=44100:d=${d}`,
    '-f', 'lavfi', '-i', `aevalsrc='0.06*(sin(2*PI*220*t)+sin(2*PI*277.2*t)+sin(2*PI*329.6*t))*(0.5+0.5*sin(2*PI*0.4*t))':s=44100:d=${d}`,
    '-filter_complex', `[1:a]highpass=f=1200[s];[2:a]highpass=f=7000[h];[4:a]lowpass=f=1500[p];[0:a][s][h][3:a][p]amix=inputs=5:normalize=0,alimiter=limit=0.9,afade=t=in:d=0.3,afade=t=out:st=${d - 1}:d=1,aformat=channel_layouts=stereo[a]`,
    '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', out]);
}
async function renderStill(html, file, t) {   // το τελικό καρέ ενός κινούμενου HTML ως εικόνα 1080×1920
  const { chromium } = await import('playwright');
  const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}), pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.setContent(html); await pg.evaluate(x => window.setT(x), t); await pg.screenshot({ path: file, type: 'png' }); await b.close();
}
async function renderVideo(html, out, secs = STAT_VIDEO_SECS) {
  const { chromium } = await import('playwright');
  const dir = out + '.frames'; await fs.mkdir(dir, { recursive: true });
  const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}), pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.setContent(html);
  for (let i = 0; i < 30 * secs; i++) { await pg.evaluate(t => window.setT(t), i / 30); await pg.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + '.png') }); }
  await b.close();
  const a = out + '.m4a'; beat(a, secs);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-i', a, '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out]);
  await fs.rm(dir, { recursive: true, force: true }); await fs.rm(a, { force: true });
}
function stillVideo(img, out, secs = 7) {   // κάρτα 4:5 πάνω σε κάθετο φόντο 9:16 (Story), με το ίδιο beat
  const a = out + '.m4a'; beat(a, secs);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', img, '-i', a, '-t', String(secs), '-vf', 'scale=1080:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x1d2331,format=yuv420p', '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out]);
  return fs.rm(a, { force: true });
}

// ------------------------------------------------------------------ post
async function post() {
  const { NETS, postTo, checkNet } = await import('./social-lib.mjs');
  const plan = await readJ(PLAN, { items: [] }), state = await readJ(STATE, { posted: [] });
  const on = Object.entries(NETS).filter(([, v]) => v).map(([k]) => k);
  console.log('Συνδεδεμένα δίκτυα:', on.join(', ') || 'κανένα');
  for (const n of on) { try { console.log(`Έλεγχος ${n}: OK — ${await checkNet(n)}`); } catch (e) { console.error(`Έλεγχος ${n}: ΣΦΑΛΜΑ — ${e.message}`); } }
  let failed = 0;
  for (const it of plan.items) {
    if (it.pick && it.gameStart && new Date(it.gameStart) <= new Date()) { console.log('Pick: ο αγώνας άρχισε, παράλειψη'); continue; }
    const p = { ...it, imageUrl: RAW + it.image, imageFile: path.join(ROOT, it.image), videoFile: it.video && path.join(ROOT, it.video) };
    if (!DRY && !(await fetch(p.imageUrl, { method: 'HEAD' }).then(r => r.ok).catch(() => false))) { console.error('Η εικόνα δεν είναι ακόμη δημόσια:', p.imageUrl); failed++; continue; }
    for (const net of on) {
      const k = `${it.key}:${net}`;
      if (state.posted.includes(k)) continue;
      if (it.nets && !it.nets.includes(net)) continue;   // π.χ. το Reel των σουτ πάει μόνο σε Facebook/Instagram
      if (net === 'telegram' && it.pick) continue;   // τα picks πάνε ήδη όλα στο Telegram από το scripts/telegram.mjs
      if (net === 'yt' && !(it.video && (it.kinds || []).includes('reel'))) continue;   // YouTube: μόνο τα Reels (στατιστικό, σουτ), όχι τα picks
      if (DRY) { console.log(`[δοκιμή] ${k}`); continue; }
      try { await postTo(net, p); state.posted.push(k); console.log('Αναρτήθηκε', k); }
      catch (e) { console.error('Απέτυχε', k, '—', e.message); failed++; }
    }
  }
  state.posted = state.posted.slice(-600);
  if (!DRY) await fs.writeFile(STATE, JSON.stringify(state, null, 1));
  if (failed) { console.error(`${failed} αναρτήσεις απέτυχαν.`); process.exitCode = 1; }
}
