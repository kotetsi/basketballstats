// Καθημερινή ρουτίνα social του BasketballStats (τρέχει από το GitHub Actions, workflow «Social καθημερινά»).
//   node scripts/daily-social.mjs prepare   βρίσκει το «Στατιστικό της ημέρας» και το pick της ημέρας, φτιάχνει κάρτες και βίντεο
//                                           στο social/daily/<ημερομηνία>/ και γράφει το social/daily/plan.json
//   (το workflow κάνει commit/push, ώστε οι εικόνες να έχουν δημόσιο URL για Instagram/Threads/Viber)
//   node scripts/daily-social.mjs post      ανεβάζει ό,τι λέει το plan.json σε κάθε συνδεδεμένο δίκτυο, μία φορά (data/daily-social.json)
//   SOCIAL_DATA=dist/assets/data.json  τοπικά δεδομένα · SOCIAL_DRY=1 μόνο εμφάνιση · DAILY_ONLY=stat|pick
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
import { upcomingPicks, cardHtml, when, DISC } from './pick-cards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://basketballstats.eu', RAW = 'https://raw.githubusercontent.com/kotetsi/basketballstats/main/';
const MODE = process.argv[2] || 'prepare', DRY = process.env.SOCIAL_DRY === '1', ONLY = process.env.DAILY_ONLY || '';
const PLAN = path.join(ROOT, 'social', 'daily', 'plan.json'), STATE = path.join(ROOT, 'data', 'daily-social.json');
const readJ = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
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

if (D && ONLY !== 'pick' && !state.posted.some(k => k.startsWith(`stat:${D}:`))) {
  const C = [];   // υποψήφια: { score, card, caption }
  const all = data.players.map(p => ({ p, G: played(p) })).filter(o => o.G.length);
  const teamOf = p => p.t.split(';').pop();
  const nextToday = c => data.league.games.find(g => !g[6] && (g[2] === c || g[3] === c) && athensDay(gDate(g[1])) === today);
  const later = (c, what) => { const g = nextToday(c); if (!g) return ''; const opp = g[2] === c ? g[3] : g[2]; return ` Απόψε (${hhmm(gDate(g[1]))}) με ${withT(opp)} ${what}`; };
  const barsOf = (G, k, n, f = x => x[k]) => G.slice(-n).map(x => [`${x[0]}η · ${short(x[2])}`, f(x)]);
  const maxOf = (k, f = x => x[k]) => Math.max(...all.flatMap(o => o.G.filter(x => x[1] !== D).map(f)), 0);
  for (const { p, G } of all) {
    const last = G[G.length - 1]; if (last[1] !== D) continue;
    const c = teamOf(p), who = `${tn(c)} · EuroLeague ${SEAS}`.replace(/\s·\s$/, ''), name = grName(p.n);
    const base = { team: team(c), who, player: name };
    // 1. σερί αγώνων με 20+ πόντους
    let s = 0; for (const x of [...G].reverse()) { if (x[8] >= 20) s++; else break; }
    if (s >= 3) {
      const others = all.filter(o => o.p !== p).map(o => { let k = 0; for (const x of [...o.G].reverse()) { if (x[8] >= 20) k++; else break; } return k; });
      const alone = others.every(k => k < s), best = Math.max(...all.map(o => { let b = 0, k = 0; for (const x of o.G) { k = x[8] >= 20 ? k + 1 : 0; b = Math.max(b, k); } return b; }));
      const extra = alone ? `Κανείς άλλος στην EuroLeague δεν έχει αυτή τη στιγμή σερί ούτε ${s - 1} αγώνων.` : `Από τα μεγαλύτερα ενεργά σερί της σεζόν.`;
      C.push({ score: s * 12 + (alone ? 10 : 0) + (s >= best ? 15 : 0), card: { ...base, big: String(s), bigLabel: 'σερί αγώνες<br>με 20+ πόντους', line: `${extra}${later(c, `κυνηγά τον ${s + 1}ο.`)}`, bars: barsOf(G, 8, Math.min(s, 6)) },
        caption: `Ο ${name} έχει ${s} σερί αγώνες με 20+ πόντους: ${G.slice(-s).map(x => x[8]).join(' – ')}.\n${extra}${later(c, `κυνηγά τον ${s + 1}ο στη σειρά. Θα τα καταφέρει; 👇`)}` });
    }
    // 2. ρεκόρ σεζόν σε πόντους / PIR / ασίστ / ριμπάουντ / τρίποντα (σε έναν αγώνα)
    for (const [k, min, lab, f, w] of [[8, 25, 'πόντοι', null, 1.1], [25, 32, 'PIR', null, 1], [17, 11, 'ασίστ', null, 3], ['reb', 14, 'ριμπάουντ', x => x[15] + x[16], 2.5], [11, 7, 'τρίποντα', null, 5]]) {
      const v = f ? f(last) : last[k];
      if (v >= min && v > maxOf(k, f || (x => x[k]))) C.push({ score: 30 + v * w, card: { ...base, big: String(v), bigLabel: `${lab}<br>— ρεκόρ σεζόν`, line: `Κανείς δεν είχε φέτος περισσότερα ${lab === 'PIR' ? 'PIR' : lab} σε αγώνα EuroLeague. Έγινε κόντρα ${vs(last[2])}.`, bars: barsOf(G, k, 5, f || undefined) },
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
    plan.items.push({ key: `stat:${D}`, image: path.relative(ROOT, img), video: path.relative(ROOT, vid), text, short: `📊 ${w.caption.split('\n')[0]} basketballstats.eu`, kinds: ['post', 'reel', 'story'], alt: w.caption.split('\n')[0] });
    console.log(`Στατιστικό της ημέρας (${D}, ${C.length} υποψήφια, βαθμός ${w.score}):\n${w.caption}`);
  }
}

if (ONLY !== 'stat' && !state.posted.some(k => k.startsWith(`pick:${today}:`))) {
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
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: w, height: h } });
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
async function renderVideo(html, out) {
  const { chromium } = await import('playwright');
  const dir = out + '.frames'; await fs.mkdir(dir, { recursive: true });
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.setContent(html);
  for (let i = 0; i < 30 * STAT_VIDEO_SECS; i++) { await pg.evaluate(t => window.setT(t), i / 30); await pg.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + '.png') }); }
  await b.close();
  const a = out + '.m4a'; beat(a, STAT_VIDEO_SECS);
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
  if (DRY) for (const n of on) { try { console.log(`Έλεγχος ${n}: OK — ${await checkNet(n)}`); } catch (e) { console.error(`Έλεγχος ${n}: ΣΦΑΛΜΑ — ${e.message}`); } }
  let failed = 0;
  for (const it of plan.items) {
    if (it.pick && it.gameStart && new Date(it.gameStart) <= new Date()) { console.log('Pick: ο αγώνας άρχισε, παράλειψη'); continue; }
    const p = { ...it, imageUrl: RAW + it.image, imageFile: path.join(ROOT, it.image), videoFile: it.video && path.join(ROOT, it.video) };
    if (!DRY && !(await fetch(p.imageUrl, { method: 'HEAD' }).then(r => r.ok).catch(() => false))) { console.error('Η εικόνα δεν είναι ακόμη δημόσια:', p.imageUrl); failed++; continue; }
    for (const net of on) {
      const k = `${it.key}:${net}`;
      if (state.posted.includes(k)) continue;
      if (net === 'telegram' && it.pick) continue;   // τα picks πάνε ήδη όλα στο Telegram από το scripts/telegram.mjs
      if (DRY) { console.log(`[δοκιμή] ${k}`); continue; }
      try { await postTo(net, p); state.posted.push(k); console.log('Αναρτήθηκε', k); }
      catch (e) { console.error('Απέτυχε', k, '—', e.message); failed++; }
    }
  }
  state.posted = state.posted.slice(-600);
  if (!DRY) await fs.writeFile(STATE, JSON.stringify(state, null, 1));
  if (failed) { console.error(`${failed} αναρτήσεις απέτυχαν.`); process.exitCode = 1; }
}
