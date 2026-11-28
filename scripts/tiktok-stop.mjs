// TikTok «Σταμάτα το βίντεο: η πεντάδα σου» — ένα κάθετο βίντεο την ημέρα (1080×1920, 30 fps, ~19΄΄, ΧΩΡΙΣ ήχο:
// τον ήχο τον διαλέγει η ρουτίνα από τη βιβλιοθήκη του TikTok). Ύφος για 15–20 ετών, χωρίς στοίχημα, χωρίς σήματα/πρόσωπα.
// Σε 5 θέσεις (2 γκαρντ, 2 φόργουορντ, σέντερ) οι 10 κορυφαίοι σε PIR ανά θέση αλλάζουν κάθε 0,1΄΄. Ο θεατής κάνει pause
// και «του πέφτει» η πεντάδα του· στο τέλος τη γράφει στα σχόλια (η καλύτερη σε PIR καρφιτσώνεται).
//   node scripts/tiktok-stop.mjs          → social/tiktok/<ημερομηνία>/stop-<el|gbl>.mp4 + caption.txt + meta.json
//   TS_TODAY=2026-11-29 · TS_THEME=el|gbl (προεπιλογή: εναλλάξ ανά ημέρα) · TS_DATA=dist/assets/data.json · TS_FRAMES=1 μόνο δοκιμαστικά καρέ
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadGbl, displayName, shortName, seasonLabel } from '../src/gbl/pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), E = process.env;
const today = E.TS_TODAY || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
const dayN = Math.round(new Date(today + 'T12:00:00Z') / 864e5);
const THEME = E.TS_THEME || (dayN % 2 ? 'gbl' : 'el');
const outDir = path.join(ROOT, 'social', 'tiktok', today), outMp4 = path.join(outDir, `stop-${THEME}.mp4`);
if (fs.existsSync(outMp4) && !E.TS_FRAMES) { console.log(`υπάρχει ήδη: ${path.relative(ROOT, outMp4)}`); process.exit(0); }

// ------------------------------------------------------------------ παίκτες ανά θέση (10 κορυφαίοι σε μ.ό. PIR)
const POS = { Guard: 'G', Forward: 'F', Center: 'C', PG: 'G', SG: 'G', SF: 'F', PF: 'F', C: 'C' };
let pool, LEAGUE, SEAS;
if (THEME === 'el') {
  const data = E.TS_DATA ? JSON.parse(fs.readFileSync(E.TS_DATA, 'utf8')) : await (await fetch(`https://basketballstats.eu/assets/data.json?t=${Date.now()}`)).json();
  const GRN = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'greek-names.json'), 'utf8'));
  const nice = n => { const [s, f] = String(n).split(', '); return [f, s].filter(Boolean).map(w => w.toLowerCase().replace(/(^|[\s-])\S/g, m => m.toUpperCase())).join(' '); };
  const split = n => { const g = GRN[n]; if (g) { const m = g.match(/^\S+\s+\(([^)]+)\)\s+(.+)$/); if (m) return [m[1], m[2]]; const w = g.split(' '); return w.length > 1 ? [w[0], w.slice(1).join(' ')] : ['', g]; } const w = nice(n).split(' '); return [w[0], w.slice(1).join(' ') || w[0]]; };
  const R = Math.max(...data.players.flatMap(p => p.g.map(x => x[0])));
  pool = data.players.map(p => { const G = p.g.filter(x => x[7] > 0), t = p.t.split(';').pop(), [f, s] = split(p.n); return { f, s, team: data.teams[t]?.[0] || t, col: data.teams[t]?.[1] || '#5b6478', no: p.no, pos: POS[p.pos], n: G.length, pir: G.reduce((a, x) => a + x[25], 0) / (G.length || 1) }; }).filter(o => o.pos && o.n >= Math.ceil(R * 0.6));
  LEAGUE = 'EuroLeague'; SEAS = `${String(data.season || 'E2026').replace(/\D/g, '')}-${String(+String(data.season || 'E2026').replace(/\D/g, '') + 1).slice(2)}`;
} else {
  const G = await loadGbl(ROOT), S = G.cur, games = G.seasons[S].filter(g => g.played && G.box[g.id]);
  const COL = { 'Παναθηναϊκός': '#1f8a3b', 'Ολυμπιακός': '#c8102e', 'ΑΕΚ': '#f2c200', 'Άρης': '#f2c200', 'ΠΑΟΚ': '#9aa3b5', 'Περιστέρι': '#1f5fbf', 'Προμηθέας': '#e4572e', 'Κολοσσός': '#1f5fbf', 'Μαρούσι': '#ffcc00', 'Καρδίτσα': '#2a9df4', 'Μύκονος': '#2a9df4', 'Ηρακλής': '#4a7bd0', 'Δόξα Λευκάδας': '#3ecf8e', 'Vikos Falcons': '#e4572e' };
  const P = {}, R = Math.max(...games.map(g => g.round || 0));
  for (const g of games) G.box[g.id].teams.forEach((t, i) => { const tm = shortName((i ? g.away : g.home).name); for (const p of t.players) { if (!(p.secs > 0)) continue; const o = (P[p.pid] ||= { pid: p.pid, raw: p.name, no: p.no, n: 0, pir: 0, team: tm }); o.n++; o.pir += p.pir; o.team = tm; o.no = p.no; } });
  pool = Object.values(P).filter(o => o.n >= Math.ceil(R * 0.6)).map(o => { // για τα βίντεο, όσοι υπάρχουν στα ελληνικά ονόματα της EuroLeague (π.χ. Βεζένκοφ) γράφονται στα ελληνικά
    const w = String(o.raw).trim().split(/\s+/), elg = w.length === 2 ? G.el?.[`${w[0]}, ${w[1]}`] : null;
    const nm = (elg ? elg.replace(/^\S+\s+\(([^)]+)\)/, '$1') : displayName(o.pid, o.raw, G)).split(' '); return { f: nm.length > 1 ? nm[0] : '', s: nm.length > 1 ? nm.slice(1).join(' ') : nm[0], team: o.team, col: COL[o.team] || '#5b6478', no: String(o.no ?? ''), pos: POS[G.players[o.pid]?.pos], pir: o.pir / o.n }; }).filter(o => o.pos);
  LEAGUE = 'Stoiximan GBL'; SEAS = seasonLabel(S);
}
const top = k => pool.filter(o => o.pos === k).sort((a, b) => b.pir - a.pir).slice(0, 10).map(o => ({ ...o, pir: o.pir.toFixed(1) }));
const POOL = { G: top('G'), F: top('F'), C: top('C') };
if (Object.values(POOL).some(L => L.length < 6)) { console.log('λίγοι παίκτες σε κάποια θέση, δεν φτιάχνεται βίντεο'); process.exit(0); }

// ------------------------------------------------------------------ σελίδα
const font = f => fs.readFileSync(path.join(ROOT, 'scripts', 'fonts', f)).toString('base64');
const ff = (fam, w, base) => ['greek', 'latin'].map(s => `@font-face{font-family:${fam};font-weight:${w};src:url(data:font/woff2;base64,${font(`${base}-${s}-${w}-normal.woff2`)}) format('woff2');${s === 'greek' ? 'unicode-range:U+0370-03FF,U+1F00-1FFF' : ''}}`).join('');
const DUR = 19, FPS = 30, W = 1080, H = 1920;
const html = `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>
${ff('X', 900, 'fira-sans-extra-condensed')}${ff('F', 700, 'fira-sans')}${ff('F', 500, 'fira-sans')}
*{box-sizing:border-box;margin:0}body{width:${W}px;height:${H}px;overflow:hidden;background:#07080c;color:#fff;font-family:F,'Noto Color Emoji',sans-serif;position:relative}
#stage{position:absolute;inset:0}#glow{position:absolute;left:50%;top:42%;width:1500px;height:1500px;margin:-750px;border-radius:50%}
#court{position:absolute;inset:0;opacity:.12}.l{position:absolute;left:50px;right:50px;text-align:center}
.X{font-family:X;font-weight:900;text-transform:uppercase;letter-spacing:-1px;line-height:.92}
.cap{display:inline-block;background:#fff;color:#07080c;padding:10px 26px 14px;border-radius:14px;font-weight:700;font-size:50px;line-height:1.15}
.acc{color:#c6ff3d}#flash{position:absolute;inset:0;background:#fff;opacity:0}
#grain{position:absolute;inset:0;opacity:.06;background-image:repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 4px)}#bar{position:absolute;top:0;left:0;height:14px;background:#c6ff3d}
</style></head><body><div id="stage"><div id="glow"></div>
<svg id="court" width="1080" height="1920" viewBox="0 0 1080 1920"><g fill="none" stroke="#fff" stroke-width="6"><rect x="40" y="200" width="1000" height="1520"/><path d="M40 960H1040"/><circle cx="540" cy="960" r="180"/><path d="M340 200V560H740V200M340 1720V1360H740V1720"/></g></svg>
<svg id="jersey" width="560" height="596" viewBox="0 0 310 330" style="position:absolute;left:260px;top:640px">
 <defs><linearGradient id="jg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs>
 <path id="jbody" d="M95 12 Q155 46 215 12 L300 52 L272 122 L240 108 L240 322 L70 322 L70 108 L38 122 L10 52 Z" fill="#333" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linejoin="round"/>
 <path d="M95 12 Q155 46 215 12 L300 52 L272 122 L240 108 L240 322 L70 322 L70 108 L38 122 L10 52 Z" fill="url(#jg)"/>
 <text id="jnum" x="155" y="245" text-anchor="middle" font-size="150" fill="#fff" font-family="X" font-weight="900"></text></svg>
<div id="hook" class="l" style="top:300px"><div style="font-size:44px;color:#9aa3b5;letter-spacing:6px;font-weight:700">${LEAGUE.toUpperCase()}</div><div class="X" style="margin-top:20px;font-size:180px">Σταμάτα<br>το βίντεο<br><span class="acc">5 φορές</span></div><div style="margin-top:44px"><span class="cap">όποιοι σου πέσουν = η πεντάδα σου</span></div></div>
<div id="stop" class="l" style="top:120px"></div><div id="who" class="l" style="top:1250px"></div><div id="lineup" class="l" style="top:1690px"></div><div id="cta" class="l" style="top:300px"></div>
<div id="hud" style="position:absolute;left:60px;right:60px;top:1780px;display:flex;justify-content:space-between;align-items:center;font-size:34px;color:#9aa3b5"><span>μ.ό. PIR · ${LEAGUE} ${SEAS}</span><span style="color:#fff;font-weight:700">@basketballstats.eu</span></div>
</div><div id="grain"></div><div id="bar"></div><div id="flash"></div>
<script>
const P=${JSON.stringify(POOL)};
const SLOTS=[['ΓΚΑΡΝΤ','G'],['ΓΚΑΡΝΤ','G'],['ΦΟΡΓΟΥΟΡΝΤ','F'],['ΦΟΡΓΟΥΟΡΝΤ','F'],['ΣΕΝΤΕΡ','C']];
let seed=${dayN % 2147483646 + 1}; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const ORD=SLOTS.map(s=>{const L=P[s[1]].slice();for(let k=L.length-1;k>0;k--){const j=Math.floor(rnd()*(k+1));[L[k],L[j]]=[L[j],L[k]];}return L;});
const $=id=>document.getElementById(id);
const vis=c=>{const m=/^#?([0-9a-f]{6})$/i.exec(c||'');if(!m)return '#5b6478';const n=parseInt(m[1],16),r=n>>16,g=(n>>8)&255,b=n&255,L=0.2126*r+0.7152*g+0.0722*b;if(L<22)return '#5b6478';if(L>=35)return '#'+m[1];const k=.35,f=x=>Math.round(x+(255-x)*k);return 'rgb('+f(r)+','+f(g)+','+f(b)+')'};
const T0=1.8,SL=2.4,GAP=.35,END=T0+5*(SL+GAP);
window.setT=t=>{
 $('bar').style.width=(100*t/${DUR})+'%';
 $('hook').style.opacity=t<T0?1:0; $('hook').style.transform='scale('+(1+.15*Math.exp(-t*8))+')';
 const s=Math.floor((t-T0)/(SL+GAP)),u=t-T0-s*(SL+GAP),inSlot=t>=T0&&t<END&&u<SL;
 if(t>=T0&&t<END){const L=ORD[s],f=Math.floor(u*${FPS}/3),pl=inSlot?L[f%L.length]:L[Math.floor(SL*${FPS}/3-1)%L.length];
  $('stop').innerHTML='<div style="font-size:42px;color:#9aa3b5;letter-spacing:6px;font-weight:700">ΘΕΣΗ '+(s+1)+'/5 · '+SLOTS[s][0]+'</div><div class="X" style="margin-top:14px;font-size:116px;white-space:nowrap;color:'+(inSlot?'#c6ff3d':'#fff')+'">'+(inSlot?'✋ Σταμάτα τώρα':'Κλείδωσε')+'</div>';
  $('jbody').setAttribute('fill',vis(pl.col)); $('jnum').textContent=pl.no;
  $('who').innerHTML='<div style="font-size:46px;color:#9aa3b5;font-weight:500">'+(pl.f?pl.f+' · ':'')+pl.team+'</div><div class="X" style="font-size:'+(pl.s.length>12?118:150)+'px;margin-top:8px;white-space:nowrap">'+pl.s+'</div><div style="margin-top:14px"><span class="cap" style="background:#c6ff3d">'+String(pl.pir).replace('.',',')+' PIR</span></div>';
  $('glow').style.background='radial-gradient(circle,'+vis(pl.col)+',transparent 62%)';$('glow').style.opacity=.35;
  ['jersey','who','stop'].forEach(k=>$(k).style.opacity=1); $('jersey').style.transform=inSlot?'none':'scale('+(1+.08*Math.exp(-(u-SL)*14))+')';
 } else { ['jersey','who','stop'].forEach(k=>$(k).style.opacity=0); $('glow').style.background='radial-gradient(circle,rgba(198,255,61,.5),transparent 60%)';$('glow').style.opacity=.35; }
 const done=t<T0?0:Math.min(5,s+(u>=SL?1:0));
 $('lineup').innerHTML=t>=T0&&t<END?'<div style="display:flex;gap:18px;justify-content:center">'+SLOTS.map((x,i)=>'<div style="width:150px;height:16px;border-radius:8px;background:'+(i<done?'#c6ff3d':i===s?'#fff':'#2a2f3d')+'"></div>').join('')+'</div>':'';
 $('flash').style.opacity=t>=T0&&t<END&&u>=SL?Math.max(0,.35-(u-SL)*2.5):t>=END?Math.max(0,.6-(t-END)*3):0;
 if(t>=END){const v=t-END;
  $('cta').innerHTML='<div class="X" style="font-size:150px">Ποια πεντάδα<br><span class="acc">σου έπεσε;</span></div><div style="margin-top:50px;font-size:46px;line-height:1.35;font-weight:700">γράψε τους 5 στα σχόλια</div><div style="margin-top:30px"><span class="cap" style="background:#c6ff3d">📌 η πεντάδα με τα περισσότερα PIR μπαίνει καρφιτσωμένη</span></div><div style="margin-top:70px;display:flex;justify-content:center;gap:16px"><div style="font-size:80px">🔁</div><div style="font-size:40px;color:#9aa3b5;font-weight:500;max-width:700px;text-align:left;line-height:1.3">ξαναπροσπάθησε · στείλ\\' το σε φίλο να δεις ποιος βγάζει καλύτερη</div></div>';
  $('cta').style.opacity=1; $('cta').style.transform='scale('+(1+.2*Math.exp(-v*8))+')';
 } else $('cta').style.opacity=0;
};
setT(0);
</script></body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const { chromium } = await import('playwright');
const br = await chromium.launch(E.PW_CHROME ? { executablePath: E.PW_CHROME } : {}), pg = await br.newPage({ viewport: { width: W, height: H } });
await pg.setContent(html); await pg.evaluate(() => document.fonts.ready);
if (E.TS_FRAMES) {
  for (const t of [0.8, 2.5, 7.5, 13.6, 16.5]) { await pg.evaluate(x => setT(x), t); await pg.screenshot({ path: path.join(outDir, `frame-${THEME}-${t}.jpg`), type: 'jpeg', quality: 80 }); }
} else {
  const tmp = outMp4.replace(/\.mp4$/, '.tmp.mp4');
  const f = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < DUR * FPS; i++) { await pg.evaluate(x => setT(x), i / FPS); const buf = await pg.screenshot({ type: 'jpeg', quality: 92 }); if (!f.stdin.write(buf)) await new Promise(r => f.stdin.once('drain', r)); }
  f.stdin.end(); const code = await new Promise(r => f.on('close', r));
  if (code !== 0) { console.error('ffmpeg απέτυχε'); process.exit(1); }
  fs.renameSync(tmp, outMp4);
  const tag = THEME === 'el' ? '#euroleague' : '#gbl #basketleague';
  const caption = `Σταμάτα το βίντεο 5 φορές ✋ ποια πεντάδα σου έπεσε; γράψ' την στα σχόλια 👇 η καλύτερη σε PIR μπαίνει καρφιτσωμένη 📌 ${tag} #μπάσκετ #basketball #fyp`;
  fs.writeFileSync(path.join(outDir, 'caption.txt'), caption + '\n');
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ date: today, theme: THEME, league: LEAGUE, video: path.relative(ROOT, outMp4), caption, sound: 'να διαλεχτεί στο TikTok (βιβλιοθήκη/Commercial Music Library)', pool: POOL }, null, 1));
  console.log(`→ ${path.relative(ROOT, outMp4)} (${(fs.statSync(outMp4).size / 1e6).toFixed(1)} MB)`);
}
await br.close();
