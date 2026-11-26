// Κάρτα εικόνας για κάθε ανοιχτό pick (Instagram/Facebook): dist/og/picks/<tipster>-<id>.png, 1080×1350 (4:5).
// Τρέχει στο build, πριν από το ανέβασμα του site, ώστε η εικόνα να έχει δημόσιο URL όταν γίνει η ανάρτηση.
//   node scripts/pick-cards.mjs            (χρειάζεται playwright + chromium)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DISC = '21+ | Παίζουμε υπεύθυνα. Στατιστική ανάλυση, όχι συμβουλή στοιχήματος. Κανένα σημείο δεν είναι σίγουρο.';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// ώρα αγώνα από τον κωδικό ημερομηνίας του data.json (ΜΜΗΗωωλλ + τελευταίο ψηφίο έτους)
export const gameDate = w => new Date(Date.UTC(2020 + (+w[8]), +w.slice(0, 2) - 1, +w.slice(2, 4), +w.slice(4, 6), +w.slice(6, 8)));
export const when = d => d.toLocaleString('el-GR', { timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const cardName = t => `${t.s}-${t.u.replace(/\/$/, '').split('/').pop()}.png`;

/** ανοιχτά picks που δεν έχουν αρχίσει, με τα στοιχεία του αγώνα */
export function upcomingPicks(data, tipsters, now = Date.now()) {
  return (data.tips || []).filter(t => tipsters.includes(t.s)).map(t => {
    const [h, a] = t.g.split('-'), g = data.league.games.find(x => x[0] === t.r && x[2] === h && x[3] === a);
    return g && !g[6] && gameDate(g[1]) > now ? { ...t, h, a, start: gameDate(g[1]) } : null;
  }).filter(Boolean);
}

export function cardHtml(t, data) {
  const team = c => data.teams[c] || [c, '#e4572e'];
  const [H, A] = [team(t.h), team(t.a)];
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;background:#1d2331;color:#fff;font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;overflow:hidden;display:flex;flex-direction:column;padding:80px 80px 60px;position:relative}
.bar{position:absolute;left:0;right:0;top:0;height:18px;background:linear-gradient(90deg,${H[1]} 50%,${A[1]} 50%)}
.top{display:flex;justify-content:space-between;align-items:center}.brand{font-size:46px;font-weight:800;letter-spacing:1px}.brand i{font-style:normal;color:#e4572e}
.tag{background:#e4572e;border-radius:40px;padding:12px 26px;font-size:30px;font-weight:700}
.who{margin-top:90px;font-size:34px;color:#aeb6c8}
.match{margin-top:24px;font-size:76px;font-weight:800;line-height:1.08}.match .vs{display:block;font-size:40px;color:#aeb6c8;font-weight:600;margin:12px 0}
.time{margin-top:40px;font-size:36px;color:#cfd5e2}
.pick{margin-top:60px;background:#fff;color:#1d2331;border-radius:28px;padding:40px 48px}
.pick small{display:block;font-size:30px;color:#6b7385;letter-spacing:2px;margin-bottom:12px}
.pick b{display:block;font-size:66px;line-height:1.1}.odds{margin-top:14px;font-size:60px;font-weight:800;color:#e4572e}
.foot{margin-top:auto}.site{font-size:38px;font-weight:700}.disc{margin-top:16px;font-size:26px;color:#aeb6c8;line-height:1.35}
</style></head><body><div class="bar"></div>
<div class="top"><div class="brand">BASKETBALL<i>STATS</i></div><div class="tag">ΝΕΟ PICK</div></div>
<div class="who">${esc(t.n)} · EuroLeague · ${t.r}η αγωνιστική</div>
<div class="match">${esc(H[0])}<span class="vs">εναντίον</span>${esc(A[0])}</div>
<div class="time">🕗 ${esc(when(t.start))}</div>
<div class="pick"><small>Η ΕΠΙΛΟΓΗ</small><b>${esc(t.l)}</b>${t.o ? `<div class="odds">απόδοση @${Number(t.o).toFixed(2)}</div>` : ''}</div>
<div class="foot"><div class="site">basketballstats.eu</div><div class="disc">${esc(DISC)}</div></div></body></html>`;
}

// ---------- Κάρτα αποτελέσματος («Το είπαμε»): για κάθε pick που κρίθηκε, είτε βγήκε είτε όχι ----------
const PROP_EL = { pts: 'πόντους', reb: 'ριμπάουντ', ast: 'ασίστ', '3pm': 'τρίποντα', pir: 'PIR', pr: 'πόντους + ριμπάουντ', pa: 'πόντους + ασίστ' };
const athensDay = d => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
const units = u => `${u > 0 ? '+' : ''}${Number(u).toFixed(1).replace('.', ',')}`;

/** picks των tipsters που κρίθηκαν (W/L) σε αγώνα της μέρας `day` (YYYY-MM-DD, ώρα Αθήνας)· τα άκυρα (P) δεν έχουν κάρτα */
export function settledPicks(data, tipsters, day) {
  return (data.tipsDone || []).filter(t => tipsters.includes(t.s) && (t.res === 'W' || t.res === 'L') && t.d && athensDay(gameDate(t.d)) === day)
    .map(t => { const [h, a] = t.g.split('-'); return { ...t, h, a, start: gameDate(t.d) }; });
}
export const resultCardName = t => `${t.s}-${t.u.replace(/\/$/, '').split('/').pop()}-res.png`;
export const resultLine = t => t.v != null && t.st ? `Έφερε ${t.v} ${PROP_EL[t.st] || ''}`.trim() : '';
export const recordLine = t => t.rec ? `Ρεκόρ ${t.n}: ${t.rec.W}-${t.rec.L} · ${units(t.rec.units)} μονάδες` : '';

export function resultCardHtml(t, data) {
  const team = c => data.teams[c] || [c, '#e4572e'];
  const [H, A] = [team(t.h), team(t.a)], won = t.res === 'W';
  const [hs, as] = String(t.sc || '').split('-');
  const col = won ? '#2fb36b' : '#d64541', got = resultLine(t);
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;background:#1d2331;color:#fff;font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;overflow:hidden;display:flex;flex-direction:column;padding:80px 80px 60px;position:relative}
.bar{position:absolute;left:0;right:0;top:0;height:18px;background:linear-gradient(90deg,${H[1]} 50%,${A[1]} 50%)}
.top{display:flex;justify-content:space-between;align-items:center}.brand{font-size:46px;font-weight:800;letter-spacing:1px}.brand i{font-style:normal;color:#e4572e}
.tag{background:${col};border-radius:40px;padding:12px 26px;font-size:30px;font-weight:800}
.big{margin-top:70px;font-size:96px;font-weight:900;color:${col};line-height:1}
.who{margin-top:26px;font-size:34px;color:#aeb6c8}
.score{margin-top:34px;display:grid;grid-template-columns:1fr auto;row-gap:14px;font-size:58px;font-weight:800;line-height:1.1}.score span:nth-child(even){text-align:right}
.pick{margin-top:50px;background:#fff;color:#1d2331;border-radius:28px;padding:36px 48px;border-left:16px solid ${col}}
.pick small{display:block;font-size:28px;color:#6b7385;letter-spacing:2px;margin-bottom:10px}
.pick b{display:block;font-size:56px;line-height:1.1}.odds{margin-top:12px;font-size:46px;font-weight:800;color:#e4572e}.got{margin-top:12px;font-size:36px;font-weight:700;color:${col}}
.rec{margin-top:36px;font-size:36px;font-weight:700}
.foot{margin-top:auto}.site{font-size:36px;font-weight:700}.disc{margin-top:16px;font-size:26px;color:#aeb6c8;line-height:1.35}
</style></head><body><div class="bar"></div>
<div class="top"><div class="brand">BASKETBALL<i>STATS</i></div><div class="tag">${won ? '✓ ΠΕΤΥΧΕ' : '✗ ΔΕΝ ΒΓΗΚΕ'}</div></div>
<div class="big">${won ? 'Το είπαμε.' : 'Δεν βγήκε.'}</div>
<div class="who">${esc(t.n)} · EuroLeague · ${t.r}η αγωνιστική · τελικό</div>
<div class="score"><span>${esc(H[0])}</span><span>${esc(hs ?? '')}</span><span>${esc(A[0])}</span><span>${esc(as ?? '')}</span></div>
<div class="pick"><small>Η ΕΠΙΛΟΓΗ ΠΡΙΝ ΑΠΟ ΤΟ ΤΖΑΜΠΟΛ</small><b>${esc(t.l)}</b>${t.o ? `<div class="odds">απόδοση @${Number(t.o).toFixed(2)}</div>` : ''}${got ? `<div class="got">${esc(got)}</div>` : ''}</div>
${t.rec ? `<div class="rec">${esc(recordLine(t))}</div>` : ''}
<div class="foot"><div class="site">Όλο το ιστορικό, και τα χαμένα: basketballstats.eu/tipsters</div><div class="disc">${esc(DISC)}</div></div></body></html>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(await fs.readFile(path.join(ROOT, 'dist', 'assets', 'data.json'), 'utf8'));
  const picks = upcomingPicks(data, String(process.env.SOCIAL_TIPSTERS || 'high-fidelity').split(','));
  if (!picks.length) { console.log('Κάρτες picks: κανένα ανοιχτό pick.'); process.exit(0); }
  const { chromium } = await import('playwright');
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  const dir = path.join(ROOT, 'dist', 'og', 'picks'); await fs.mkdir(dir, { recursive: true });
  for (const t of picks) {
    await pg.setContent(cardHtml(t, data)); await pg.screenshot({ path: path.join(dir, cardName(t)), type: 'png' });
    console.log('Κάρτα:', cardName(t));
  }
  await b.close();
}
