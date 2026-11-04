// Διαδραστικό shot chart (παίκτης / ομάδα / αγώνας). Διαβάζει static JSON από το /api.
import { COURT, CORNER_Y, ZONES, GROUPS, zoneStats, ptsOf, heat } from './zones.mjs';

const root = document.getElementById('shotApp');
if (root) init(root).catch(e => { root.innerHTML = `<p class="sub">${String(e.message)}</p>`; });

const LGc = (document.documentElement.lang || 'el').slice(0, 2);
const L = {
  el: { shots: 'Σουτ', heat: 'Heat map', eff: 'Αποδοτικότητα ζωνών', freq: 'Συχνότητα', season: 'Σεζόν', phase: 'Φάση', all: 'Όλα', rs: 'Κανονική περίοδος', po: 'Playoffs', venue: 'Έδρα', home: 'Εντός', away: 'Εκτός', opp: 'Αντίπαλος', from: 'Από', to: 'Έως', type: 'Τύπος', ast: 'Δημιουργία', astY: 'Assisted', astN: 'Χωρίς ασίστ', q: 'Περίοδος', clutch: 'Μόνο clutch', minA: 'Ελάχ. προσπάθειες ζώνης', player: 'Παίκτης', team: 'Ομάδα', side: 'Πλευρά', own: 'Επίθεση', def: 'Άμυνα (σουτ αντιπάλων)', made: 'Εύστοχο', miss: 'Άστοχο', png: 'PNG', csv: 'CSV', reset: 'Επαναφορά zoom', n: 'σουτ', avg: 'μ.ό. λίγκας', small: 'μικρό δείγμα', momentum: 'Momentum: πόντοι από το γήπεδο ανά 5 λεπτά', key: 'Κρίσιμα σουτ', assist: 'Ασίστ', none: 'Κανένα σουτ με αυτά τα φίλτρα.', clk: 'χρόνος' },
  en: { shots: 'Shots', heat: 'Heat map', eff: 'Zone efficiency', freq: 'Frequency', season: 'Season', phase: 'Phase', all: 'All', rs: 'Regular season', po: 'Playoffs', venue: 'Venue', home: 'Home', away: 'Away', opp: 'Opponent', from: 'From', to: 'To', type: 'Type', ast: 'Creation', astY: 'Assisted', astN: 'Unassisted', q: 'Quarter', clutch: 'Clutch only', minA: 'Min. zone attempts', player: 'Player', team: 'Team', side: 'Side', own: 'Offense', def: 'Defense (opponent shots)', made: 'Made', miss: 'Missed', png: 'PNG', csv: 'CSV', reset: 'Reset zoom', n: 'shots', avg: 'league avg', small: 'small sample', momentum: 'Momentum: field goal points per 5 minutes', key: 'Key shots', assist: 'Assist', none: 'No shots for these filters.', clk: 'clock' },
  es: { shots: 'Tiros', heat: 'Mapa de calor', eff: 'Eficiencia por zona', freq: 'Frecuencia', season: 'Temporada', phase: 'Fase', all: 'Todo', rs: 'Fase regular', po: 'Playoffs', venue: 'Campo', home: 'Local', away: 'Visitante', opp: 'Rival', from: 'Desde', to: 'Hasta', type: 'Tipo', ast: 'Creación', astY: 'Asistido', astN: 'Sin asistencia', q: 'Cuarto', clutch: 'Solo clutch', minA: 'Intentos mín. por zona', player: 'Jugador', team: 'Equipo', side: 'Lado', own: 'Ataque', def: 'Defensa (tiros rivales)', made: 'Anotado', miss: 'Fallado', png: 'PNG', csv: 'CSV', reset: 'Restablecer zoom', n: 'tiros', avg: 'media liga', small: 'muestra pequeña', momentum: 'Momentum: puntos de campo cada 5 minutos', key: 'Tiros clave', assist: 'Asistencia', none: 'No hay tiros con estos filtros.', clk: 'tiempo' },
  sr: { shots: 'Šutevi', heat: 'Toplotna mapa', eff: 'Efikasnost zona', freq: 'Učestalost', season: 'Sezona', phase: 'Faza', all: 'Sve', rs: 'Regularni deo', po: 'Plej-of', venue: 'Teren', home: 'Kod kuće', away: 'U gostima', opp: 'Protivnik', from: 'Od', to: 'Do', type: 'Tip', ast: 'Kreiranje', astY: 'Posle asistencije', astN: 'Bez asistencije', q: 'Četvrtina', clutch: 'Samo clutch', minA: 'Min. pokušaja po zoni', player: 'Igrač', team: 'Tim', side: 'Strana', own: 'Napad', def: 'Odbrana (šutevi protivnika)', made: 'Pogođen', miss: 'Promašen', png: 'PNG', csv: 'CSV', reset: 'Resetuj zum', n: 'šuteva', avg: 'prosek lige', small: 'mali uzorak', momentum: 'Momentum: poeni iz igre na 5 minuta', key: 'Ključni šutevi', assist: 'Asistencija', none: 'Nema šuteva za ove filtere.', clk: 'vreme' },
}[LGc];
const ZN = { rim: 'Rim', paint: 'Paint', mid: 'Mid-range', c3l: 'Corner 3 L', c3r: 'Corner 3 R', w3l: 'Wing 3 L', w3r: 'Wing 3 R', top3: 'Top 3' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pc = v => (v == null ? '–' : Math.round(100 * v) + '%');

// ---------- γήπεδο (SVG, σε εκατοστά· y προς τα πάνω = προς το κέντρο)
const W = COURT.halfW, Y0 = COURT.baseY, Y1 = 1400 + COURT.baseY;
const sy = y => Y1 - y + Y0; // αναστροφή ώστε το καλάθι να είναι κάτω
function courtSVG() {
  const arcX = COURT.corner, arcY = CORNER_Y;
  return `<g class="court" fill="none">
  <rect x="${-W}" y="${Y0}" width="${2 * W}" height="${Y1 - Y0}"/>
  <rect x="${-COURT.paintW / 2}" y="${sy(COURT.ftY)}" width="${COURT.paintW}" height="${COURT.paintLen}"/>
  <circle cx="0" cy="${sy(COURT.ftY)}" r="180"/>
  <path d="M ${-arcX} ${sy(Y0)} L ${-arcX} ${sy(arcY)} A ${COURT.arc} ${COURT.arc} 0 0 1 ${arcX} ${sy(arcY)} L ${arcX} ${sy(Y0)}"/>
  <path d="M -125 ${sy(0)} A 125 125 0 0 1 125 ${sy(0)}"/>
  <circle cx="0" cy="${sy(0)}" r="22.5" class="rimc"/><line x1="-90" x2="90" y1="${sy(-37.5)}" y2="${sy(-37.5)}" class="board"/>
  <path d="M -180 ${sy(Y1)} A 180 180 0 0 0 180 ${sy(Y1)}"/></g>`;
}
// πολύγωνα ζωνών (για heat / efficiency / frequency)
function zonePath(z) {
  const R = COURT.arc, cy = CORNER_Y, pw = COURT.paintW / 2, ft = COURT.ftY, rr = COURT.rim;
  const P = (x, y) => `${x.toFixed(0)} ${sy(y).toFixed(0)}`;
  const arcPt = deg => { const a = deg * Math.PI / 180; return [R * Math.sin(a), R * Math.cos(a)]; };
  const ang = (Math.atan2(COURT.corner, cy) * 180) / Math.PI; // γωνία στο σημείο όπου ξεκινά το τόξο
  switch (z) {
    case 'rim': return `M ${P(-rr, 0)} A ${rr} ${rr} 0 0 1 ${P(rr, 0)} L ${P(rr, Y0)} L ${P(-rr, Y0)} Z`;
    case 'paint': return `M ${P(-pw, Y0)} L ${P(-pw, ft)} L ${P(pw, ft)} L ${P(pw, Y0)} L ${P(rr, Y0)} L ${P(rr, 0)} A ${rr} ${rr} 0 0 0 ${P(-rr, 0)} L ${P(-rr, Y0)} Z`;
    case 'mid': return `M ${P(-COURT.corner, Y0)} L ${P(-COURT.corner, cy)} A ${R} ${R} 0 0 1 ${P(COURT.corner, cy)} L ${P(COURT.corner, Y0)} L ${P(pw, Y0)} L ${P(pw, ft)} L ${P(-pw, ft)} L ${P(-pw, Y0)} Z`;
    case 'c3l': return `M ${P(-W, Y0)} L ${P(-W, cy + 20)} L ${P(-COURT.corner, cy + 20)} L ${P(-COURT.corner, Y0)} Z`;
    case 'c3r': return `M ${P(W, Y0)} L ${P(W, cy + 20)} L ${P(COURT.corner, cy + 20)} L ${P(COURT.corner, Y0)} Z`;
    case 'w3l': { const [x1, y1] = arcPt(-22.5); return `M ${P(-W, cy + 20)} L ${P(-W, 1000)} L ${P(x1 * 1000 / y1, 1000)} L ${P(x1, y1)} A ${R} ${R} 0 0 0 ${P(-COURT.corner, cy)} L ${P(-COURT.corner, cy + 20)} Z`; }
    case 'w3r': { const [x1, y1] = arcPt(22.5); return `M ${P(W, cy + 20)} L ${P(W, 1000)} L ${P(x1 * 1000 / y1, 1000)} L ${P(x1, y1)} A ${R} ${R} 0 0 1 ${P(COURT.corner, cy)} L ${P(COURT.corner, cy + 20)} Z`; }
    case 'top3': { const [x1, y1] = arcPt(-22.5), [x2, y2] = arcPt(22.5); return `M ${P(x1, y1)} L ${P(x1 * 1000 / y1, 1000)} L ${P(x2 * 1000 / y2, 1000)} L ${P(x2, y2)} A ${R} ${R} 0 0 0 ${P(x1, y1)} Z`; }
  }
  return '';
}
const ZLAB = { rim: [0, 60], paint: [0, 300], mid: [-430, 300], c3l: [-705, 30], c3r: [705, 30], w3l: [-560, 640], w3r: [560, 640], top3: [0, 860] };
const heatColor = h => { if (h == null) return 'var(--sh-none)'; const t = (h + 1) / 2; const c1 = [40, 110, 200], c2 = [190, 190, 190], c3 = [214, 59, 46]; const m = (a, b, u) => Math.round(a + (b - a) * u); const [a, b, u] = t < 0.5 ? [c1, c2, t * 2] : [c2, c3, (t - 0.5) * 2]; return `rgb(${m(a[0], b[0], u)},${m(a[1], b[1], u)},${m(a[2], b[2], u)})`; };

async function init(root) {
  const cfg = JSON.parse(root.querySelector('.shj').textContent);
  const D = await (await fetch(cfg.api)).json();
  const LA = cfg.avg ? await (await fetch(cfg.avg)).json() : null;
  const N = D.names || {}, TN = cfg.teams || {}, G = D.games;
  // σουτ: [σεζόν, αγώνας, ομάδα, σουτέρ, περίοδος, ρολόι, εύστοχο, τρίποντο, x, y, ζώνη, ασίστ, διαφορά, clutch, fb, sc, γηπεδούχος, πλευρά(0=επίθεση,1=άμυνα)]
  const S = D.shots.map(r => ({ season: r[0], g: r[1], team: r[2], pid: r[3], q: r[4], clk: r[5], made: r[6], three: r[7], x: r[8], y: r[9], z: r[10], ast: r[11], margin: r[12], clutch: r[13], fb: r[14], sc: r[15], home: r[16], side: r[17] || 0 }));
  const seasons = [...new Set(S.map(s => s.season))].sort().reverse();
  const st = { mode: 'shots', season: seasons[0] || '', phase: '', venue: '', opp: '', from: '', to: '', type: '', ast: '', q: '', clutch: false, minA: 5, player: '', team: '', side: 0 };
  const opps = [...new Set(G.map(g => g.opp).filter(Boolean))].sort((a, b) => String(TN[a] || a).localeCompare(String(TN[b] || b)));
  const sel = (k, opts, lab) => `<label>${lab}<select data-f="${k}">${opts.map(([v, t]) => `<option value="${esc(v)}"${String(st[k]) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const shooters = [...new Set(S.filter(s => s.side === 0).map(s => s.pid))].sort((a, b) => String(N[a]).localeCompare(String(N[b])));
  root.innerHTML = `<div class="anfilters shf">
   <div class="antabs">${['shots', 'heat', 'eff', 'freq'].map(m => `<button data-mode="${m}">${L[m]}</button>`).join('')}</div>
   ${seasons.length > 1 ? sel('season', seasons.map(s => [s, s.slice(0, 1) === 'U' ? `EuroCup ${s.slice(1)}-${+s.slice(3) + 1}` : `${s.slice(1)}-${+s.slice(3) + 1}`]), L.season) : ''}
   ${cfg.kind === 'game' ? '' : sel('phase', [['', L.all], ['RS', L.rs], ['PO', L.po]], L.phase) + sel('venue', [['', L.all], ['h', L.home], ['a', L.away]], L.venue) + sel('opp', [['', L.all], ...opps.map(o => [o, TN[o] || o])], L.opp) + `<label>${L.from}<input type="date" data-f="from"></label><label>${L.to}<input type="date" data-f="to"></label>`}
   ${cfg.kind !== 'game' && S.some(s => s.side) ? sel('side', [[0, L.own], [1, L.def]], L.side) : ''}
   ${cfg.kind === 'game' ? sel('team', [['', L.all], ...cfg.gameTeams.map(t => [t, TN[t] || t])], L.team) : ''}
   ${cfg.kind !== 'player' ? sel('player', [['', L.all], ...shooters.map(p => [p, N[p] || p])], L.player) : ''}
   ${sel('type', [['', L.all], ['2', '2PT'], ['3', '3PT']], L.type)}${sel('ast', [['', L.all], ['y', L.astY], ['n', L.astN]], L.ast)}
   ${sel('q', [['', L.all], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, 'OT']], L.q)}
   <label class="chk"><input type="checkbox" data-f="clutch"> ${L.clutch}</label>
   ${sel('minA', [[1, '1'], [5, '5'], [10, '10'], [20, '20']], L.minA)}
   <span class="shbtns"><button type="button" data-x="png">⬇ ${L.png}</button><button type="button" data-x="csv">⬇ ${L.csv}</button><button type="button" data-x="zoom">${L.reset}</button></span>
  </div>
  <div class="shwrap"><svg class="shcourt" viewBox="${-W} ${Y0} ${2 * W} ${Y1 - Y0}" role="img" aria-label="shot chart">${courtSVG()}<g class="zl"></g><g class="dots"></g></svg><div class="shtip" hidden></div></div>
  <p class="sub shsum"></p><div class="shz"></div>${cfg.kind === 'game' ? '<div class="shmom"></div><div class="shkey"></div>' : ''}`;
  const svg = root.querySelector('svg'), dots = root.querySelector('.dots'), zl = root.querySelector('.zl'), tip = root.querySelector('.shtip');
  root.querySelectorAll('[data-f]').forEach(el => el.addEventListener('change', () => { const k = el.dataset.f; st[k] = el.type === 'checkbox' ? el.checked : el.value; if (k === 'minA' || k === 'side') st[k] = +st[k]; draw(); }));
  root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.mode; draw(); }));

  const filt = () => S.filter(s => {
    const g = G[s.g] || {};
    if (st.season && s.season !== st.season) return false;
    if (cfg.kind !== 'game' && s.side !== st.side) return false;
    if (cfg.kind === 'player' && st.side === 0 && s.pid !== cfg.player) return false;
    if (st.player && cfg.kind !== 'player' && s.pid !== st.player) return false;
    if (st.team && s.team !== st.team) return false;
    if (st.phase && (st.phase === 'PO' ? g.ph === 'RS' : g.ph !== 'RS')) return false;
    if (st.venue && (st.venue === 'h') !== !!s.home) return false;
    if (st.opp && g.opp !== st.opp) return false;
    if (st.from && g.d < st.from) return false;
    if (st.to && g.d > st.to) return false;
    if (st.type && String(s.three ? 3 : 2) !== st.type) return false;
    if (st.ast === 'y' && !(s.made && s.ast != null)) return false;
    if (st.ast === 'n' && !(s.made && s.ast == null)) return false;
    if (st.q && (st.q === '5' ? s.q < 5 : String(s.q) !== st.q)) return false;
    if (st.clutch && !s.clutch) return false;
    return true;
  });
  const avgFor = season => (LA && LA[season]) || (LA && LA[Object.keys(LA).sort().pop()]) || null;

  function draw() {
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    const F = filt(), XY = F.filter(s => s.x != null);
    const zs = zoneStats(XY), la = avgFor(st.season);
    dots.innerHTML = ''; zl.innerHTML = '';
    if (st.mode === 'shots') {
      dots.innerHTML = XY.map((s, i) => `<circle cx="${s.x}" cy="${sy(s.y)}" r="${s.clutch ? 20 : 13}" class="${s.made ? 'mk' : 'ms'}${s.side ? ' op' : ''}" data-i="${i}"/>`).join('');
      dots._xy = XY;
    } else {
      zl.innerHTML = ZONES.map(z => {
        const v = zs[z], a = la?.zones?.[z];
        let fill = 'var(--sh-none)', label = '';
        if (v.fga >= st.minA) {
          if (st.mode === 'heat') fill = heatColor(heat(v.fg, a?.fg, v.fga, st.minA));
          if (st.mode === 'eff') fill = heatColor(v.pps == null ? null : Math.max(-1, Math.min(1, (v.pps - (a?.pps ?? 1)) / 0.3)));
          if (st.mode === 'freq') fill = `rgba(196,80,31,${(0.15 + 0.85 * Math.min(1, v.share / 0.35)).toFixed(2)})`;
          label = st.mode === 'freq' ? pc(v.share) : st.mode === 'eff' ? (v.pps ?? 0).toFixed(2) : pc(v.fg);
        }
        const [lx, ly] = ZLAB[z];
        return `<path d="${zonePath(z)}" fill="${fill}" class="zp" data-z="${z}"/>${label ? `<text x="${lx}" y="${sy(ly)}" class="zt">${label}</text><text x="${lx}" y="${sy(ly) + 55}" class="zs">${v.fgm}/${v.fga}</text>` : ''}`;
      }).join('');
    }
    // σύνοψη + πίνακας ζωνών
    const tot = F.length, mk = F.filter(s => s.made).length, pts = F.reduce((a, s) => a + ptsOf(s), 0);
    root.querySelector('.shsum').innerHTML = tot ? `${tot} ${L.n} · FG ${pc(mk / tot)} · PPS ${(pts / tot).toFixed(2)}${tot < 50 ? ` <span class="badge small">${L.small}</span>` : ''}${XY.length < tot ? ` · ${tot - XY.length} χωρίς συντεταγμένες` : ''}` : L.none;
    root.querySelector('.shz').innerHTML = `<div class="tbl"><table class="antbl"><thead><tr><th class="l">Zone</th><th>FGM/FGA</th><th>FG%</th><th>${L.avg}</th><th>PPS</th><th>%</th><th>${L.astY}</th></tr></thead><tbody>${ZONES.map(z => { const v = zs[z], a = la?.zones?.[z]; const h = heat(v.fg, a?.fg, v.fga, st.minA); return v.fga ? `<tr${v.fga < st.minA ? ' class="dim"' : ''}><td class="l"><i class="zsw" style="background:${heatColor(h)}"></i>${ZN[z]}</td><td>${v.fgm}/${v.fga}</td><td>${pc(v.fg)}</td><td>${pc(a?.fg)}</td><td>${v.pps?.toFixed(2) ?? '–'}</td><td>${pc(v.share)}</td><td>${pc(v.astPct)}</td></tr>` : ''; }).join('')}</tbody></table></div>`;
    if (cfg.kind === 'game') gameExtras(F);
  }

  function gameExtras(F) {
    const gt = cfg.gameTeams, bins = {}; let mx = 1;
    for (const s of F) { const t0 = (s.q <= 4 ? (s.q - 1) * 600 : 2400 + (s.q - 5) * 300) + ((s.q <= 4 ? 600 : 300) - clockS(s.clk)); const b = Math.min(Math.floor(t0 / 300), 11); (bins[b] ||= [0, 0])[gt.indexOf(s.team)] += ptsOf(s); }
    for (const v of Object.values(bins)) mx = Math.max(mx, v[0], v[1]);
    const nb = Math.max(8, ...Object.keys(bins).map(Number).map(x => x + 1));
    root.querySelector('.shmom').innerHTML = `<h3>${L.momentum}</h3><svg class="mom" viewBox="0 0 ${nb * 40} 120">${Array.from({ length: nb }, (_, i) => { const v = bins[i] || [0, 0]; const h0 = 55 * v[0] / mx, h1 = 55 * v[1] / mx; return `<rect x="${i * 40 + 6}" y="${60 - h0}" width="28" height="${h0}" class="m0"><title>${esc(TN[gt[0]] || gt[0])} ${v[0]}</title></rect><rect x="${i * 40 + 6}" y="60" width="28" height="${h1}" class="m1"><title>${esc(TN[gt[1]] || gt[1])} ${v[1]}</title></rect><text x="${i * 40 + 20}" y="118" class="zs">${i * 5}′</text>`; }).join('')}<line x1="0" x2="${nb * 40}" y1="60" y2="60" class="zero"/></svg><p class="sub"><i class="lg"></i> ${esc(TN[gt[0]] || gt[0])} · <i class="lg avg"></i> ${esc(TN[gt[1]] || gt[1])}</p>`;
    const key = F.filter(s => s.made && s.clutch).slice(-8).reverse();
    root.querySelector('.shkey').innerHTML = key.length ? `<h3>${L.key}</h3><ul>${key.map(s => `<li>Q${s.q > 4 ? 'OT' : s.q} ${esc(s.clk)} · <b>${esc(N[s.pid] || s.pid)}</b> (${esc(TN[s.team] || s.team)}) ${s.three ? '3PT' : '2PT'}${s.ast != null ? ` · ${L.assist}: ${esc(N[s.ast] || s.ast)}` : ''}</li>`).join('')}</ul>` : '';
  }
  const clockS = c => { const m = /^(\d+):(\d+)$/.exec(c || ''); return m ? +m[1] * 60 + +m[2] : 0; };

  // tooltip
  svg.addEventListener('mousemove', e => {
    const c = e.target.closest('circle[data-i]'), zp = e.target.closest('path.zp');
    if (c && dots._xy) {
      const s = dots._xy[+c.dataset.i], g = G[s.g] || {};
      tip.innerHTML = `<b>${esc(N[s.pid] || s.pid)}</b><br>${esc(g.d || '')} · ${s.home ? '' : '@ '}${esc(TN[g.opp] || g.opp || '')}<br>Q${s.q > 4 ? 'OT' + (s.q - 4) : s.q} · ${L.clk} ${esc(s.clk)} · ${s.three ? '3PT' : '2PT'} · ${ZN[s.z] || ''}<br>${s.made ? `<span class="pos">${L.made}</span> · +${ptsOf(s)}` : `<span class="neg">${L.miss}</span>`}${s.ast != null ? `<br>${L.assist}: ${esc(N[s.ast] || s.ast)}` : ''}${s.fb ? '<br>Fastbreak' : ''}${s.sc ? '<br>2nd chance' : ''}${s.clutch ? '<br>Clutch' : ''}`;
    } else if (zp) {
      const F = filt().filter(s => s.x != null), v = zoneStats(F)[zp.dataset.z], a = avgFor(st.season)?.zones?.[zp.dataset.z];
      tip.innerHTML = `<b>${ZN[zp.dataset.z]}</b><br>${v.fgm}/${v.fga} · FG ${pc(v.fg)} (${L.avg} ${pc(a?.fg)})<br>PPS ${v.pps?.toFixed(2) ?? '–'} · ${pc(v.share)} ${L.n}${v.fga < st.minA ? `<br><span class="badge small">${L.small}</span>` : ''}`;
    } else { tip.hidden = true; return; }
    const r = root.querySelector('.shwrap').getBoundingClientRect();
    tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 190) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px'; tip.hidden = false;
  });
  svg.addEventListener('mouseleave', () => (tip.hidden = true));

  // zoom / pan με τροχό και σύρσιμο (και pinch μέσω pointer events)
  let vb = [-W, Y0, 2 * W, Y1 - Y0];
  const setVB = () => svg.setAttribute('viewBox', vb.map(v => v.toFixed(1)).join(' '));
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const k = e.deltaY > 0 ? 1.15 : 1 / 1.15, r = svg.getBoundingClientRect();
    const px = vb[0] + vb[2] * (e.clientX - r.left) / r.width, py = vb[1] + vb[3] * (e.clientY - r.top) / r.height;
    const nw = Math.min(2 * W, Math.max(300, vb[2] * k)), nh = nw * (Y1 - Y0) / (2 * W);
    vb = [px - (px - vb[0]) * nw / vb[2], py - (py - vb[1]) * nh / vb[3], nw, nh]; setVB();
  }, { passive: false });
  let drag = null;
  svg.addEventListener('pointerdown', e => { if (vb[2] < 2 * W) { drag = [e.clientX, e.clientY, vb[0], vb[1]]; svg.setPointerCapture(e.pointerId); } });
  svg.addEventListener('pointermove', e => { if (!drag) return; const r = svg.getBoundingClientRect(); vb[0] = drag[2] - (e.clientX - drag[0]) * vb[2] / r.width; vb[1] = drag[3] - (e.clientY - drag[1]) * vb[3] / r.height; setVB(); });
  svg.addEventListener('pointerup', () => (drag = null));

  // export
  root.querySelector('[data-x="zoom"]').onclick = () => { vb = [-W, Y0, 2 * W, Y1 - Y0]; setVB(); };
  root.querySelector('[data-x="csv"]').onclick = () => {
    const rows = [['season', 'date', 'opponent', 'team', 'player', 'quarter', 'clock', 'type', 'zone', 'x_cm', 'y_cm', 'made', 'points', 'assisted_by', 'clutch', 'fastbreak', 'second_chance']]
      .concat(filt().map(s => { const g = G[s.g] || {}; return [s.season, g.d, g.opp, s.team, N[s.pid] || s.pid, s.q, s.clk, s.three ? '3PT' : '2PT', s.z || '', s.x ?? '', s.y ?? '', s.made, ptsOf(s), s.ast != null ? (N[s.ast] || s.ast) : '', s.clutch, s.fb, s.sc]; }));
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    dl(new Blob(['﻿' + csv], { type: 'text/csv' }), (cfg.file || 'shots') + '.csv');
  };
  root.querySelector('[data-x="png"]').onclick = () => {
    const cs = getComputedStyle(document.documentElement), clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('viewBox', `${-W} ${Y0} ${2 * W} ${Y1 - Y0}`);
    const css = `.court rect,.court path,.court circle,.court line{stroke:${cs.getPropertyValue('--ink')};stroke-width:5;fill:none}.mk{fill:#1f8a4c;fill-opacity:.85}.ms{fill:#c62828;fill-opacity:.6}.zt{font:700 48px sans-serif;text-anchor:middle;fill:#111}.zs{font:32px sans-serif;text-anchor:middle;fill:#333}`;
    clone.insertAdjacentHTML('afterbegin', `<style>${css}</style><rect x="${-W}" y="${Y0}" width="${2 * W}" height="${Y1 - Y0}" fill="${cs.getPropertyValue('--surface') || '#fff'}"/>`);
    clone.querySelectorAll('[fill^="var("]').forEach(p => p.setAttribute('fill', '#ddd'));
    const img = new Image(), url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    img.onload = () => { const c = document.createElement('canvas'); c.width = 1500; c.height = 1400; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 1500, 1400); URL.revokeObjectURL(url); c.toBlob(b => dl(b, (cfg.file || 'shot-chart') + '.png')); };
    img.src = url;
  };
  const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  draw();
}
export { GROUPS };
