// Πιθανότητα νίκης μέσα στον αγώνα (in-game win probability) από το χρονολόγιο των πόντων.
// Μοντέλο: η τελική διαφορά = τρέχουσα διαφορά + μ·(υπόλοιπο χρόνο / 40′) + θόρυβος με σ·√(υπόλοιπο / 40′),
// όπου μ η αναμενόμενη διαφορά πριν από το τζάμπολ (από το Game Predictor) και σ η τυπική απόκλιση της τελικής διαφοράς.
const erf = x => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); };
const ncdf = x => 0.5 * (1 + erf(x / Math.SQRT2));
export const REG = 2400;
// τέλος της τρέχουσας περιόδου (σε δευτερόλεπτα από την αρχή) για χρόνο t
export const periodEnd = t => (t <= REG ? REG : REG + 300 * Math.ceil((t - REG + 1e-9) / 300));

export function winProb(margin, t, mu = 0, sigma = 12) {
  const rem = Math.max(0, periodEnd(t) - t);
  const f = rem / REG;
  if (f <= 0) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  // στην παράταση η αναμενόμενη διαφορά «σβήνει» αναλογικά με τον χρόνο που μένει
  return ncdf((margin + mu * f) / (sigma * Math.sqrt(f)));
}

/**
 * sc: [[t, side(0=γηπεδούχος,1=φιλοξενούμενος), pts, pidIdx, scoreH, scoreA], ...]
 * επιστρέφει σειρά σημείων, κρίσιμες φάσεις και WPA ανά παίκτη
 */
export function wpSeries(sc, { mu = 0, sigma = 12, end = null } = {}) {
  const ev = [...sc].sort((a, b) => a[0] - b[0]);
  const last = ev.length ? ev[ev.length - 1][0] : REG;
  const E = end || Math.max(REG, periodEnd(last));
  const pts = [{ t: 0, p: winProb(0, 0, mu, sigma), h: 0, a: 0 }];
  const moments = [], wpa = {};
  let prev = pts[0].p;
  for (const [t, side, p, pid, h, a] of ev) {
    // λίγο πριν από το καλάθι: η πιθανότητα «κυλάει» με τον χρόνο (για σωστό σχήμα της γραμμής)
    const before = winProb(side === 0 ? h - p - a : h - (a - p), t, mu, sigma);
    const pr = side === 0 ? { h: h - p, a } : { h, a: a - p };
    pts.push({ t, p: before, h: pr.h, a: pr.a });
    const now = winProb(h - a, t, mu, sigma);
    pts.push({ t, p: now, h, a });
    const d = now - before;              // επίδραση του καλαθιού (θετικό = υπέρ γηπεδούχου)
    const forTeam = side === 0 ? d : -d; // πόσο βοήθησε την ομάδα του σκόρερ
    if (pid >= 0) { const k = side + ':' + pid; wpa[k] = (wpa[k] || 0) + forTeam; }
    moments.push({ t, side, pts: p, pid, h, a, d, before, now });
    prev = now;
  }
  const fin = ev.length ? ev[ev.length - 1] : null;
  pts.push({ t: E, p: fin ? (fin[4] > fin[5] ? 1 : fin[4] < fin[5] ? 0 : 0.5) : prev, h: fin ? fin[4] : 0, a: fin ? fin[5] : 0 });
  const key = [...moments].sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 5).sort((x, y) => x.t - y.t);
  const players = Object.entries(wpa).map(([k, v]) => ({ side: +k[0], pid: +k.slice(2), wpa: v })).sort((x, y) => y.wpa - x.wpa);
  // μεγαλύτερη ανατροπή: το χαμηλότερο σημείο του νικητή
  const winner = fin ? (fin[4] > fin[5] ? 0 : 1) : null;
  const low = winner == null ? null : pts.reduce((m, x) => { const v = winner === 0 ? x.p : 1 - x.p; return v < m.v ? { v, t: x.t, h: x.h, a: x.a } : m; }, { v: 1, t: 0 });
  const leadChanges = ev.reduce((s, e, i) => { const m = Math.sign(e[4] - e[5]); const pm = i ? Math.sign(ev[i - 1][4] - ev[i - 1][5]) : 0; return s + (m && pm && m !== pm ? 1 : 0); }, 0);
  return { end: E, pts, key, players, winner, low, leadChanges };
}

// SVG της γραμμής (0..100% για τον γηπεδούχο)
export function wpSVG(S, { W = 760, H = 240, home = 'H', away = 'A', clock = t => '', colH = 'var(--accent,#e4572e)', colA = '#3b6fd8' } = {}) {
  const L = 34, R = 8, T = 12, B = 24, iw = W - L - R, ih = H - T - B;
  const x = t => L + (iw * t) / S.end, y = p => T + ih * (1 - p);
  const line = S.pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.t).toFixed(1)},${y(q.p).toFixed(1)}`).join('');
  const area = `${line}L${x(S.end).toFixed(1)},${y(0.5)}L${x(0)},${y(0.5)}Z`;
  const grid = [];
  for (let t = 600; t < S.end; t += t < REG ? 600 : 300) grid.push(`<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${T + ih}" class="wpg"/>`);
  const qs = []; for (let i = 0, t = 0; t < S.end; i++) { const d = t < REG ? 600 : 300; qs.push(`<text x="${x(t + d / 2)}" y="${H - 6}" text-anchor="middle" class="wpt">${t < REG ? 'Q' + (i + 1) : 'OT' + (i - 3)}</text>`); t += d; }
  const keys = S.key.map((k, i) => `<g class="wpk"><circle cx="${x(k.t).toFixed(1)}" cy="${y(k.now).toFixed(1)}" r="9"/><text x="${x(k.t).toFixed(1)}" y="${(y(k.now) + 3.5).toFixed(1)}" text-anchor="middle">${i + 1}</text><title>${clock(k.t)} ${k.h}-${k.a}</title></g>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="wpsvg" role="img" aria-label="Win probability">
<defs><clipPath id="wpTop"><rect x="${L}" y="${T}" width="${iw}" height="${ih / 2}"/></clipPath><clipPath id="wpBot"><rect x="${L}" y="${T + ih / 2}" width="${iw}" height="${ih / 2}"/></clipPath></defs>
<rect x="${L}" y="${T}" width="${iw}" height="${ih}" class="wpbg"/>${grid.join('')}
<path d="${area}" fill="${colH}" opacity=".18" clip-path="url(#wpTop)"/><path d="${area}" fill="${colA}" opacity=".18" clip-path="url(#wpBot)"/>
<line x1="${L}" x2="${L + iw}" y1="${y(0.5)}" y2="${y(0.5)}" class="wpm"/>
<path d="${line}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>${keys}
<text x="${L - 4}" y="${T + 9}" text-anchor="end" class="wpt">100%</text><text x="${L - 4}" y="${y(0.5) + 4}" text-anchor="end" class="wpt">50%</text><text x="${L - 4}" y="${T + ih}" text-anchor="end" class="wpt">100%</text>
<text x="${L + 6}" y="${T + 14}" class="wpn" fill="${colH}">${home}</text><text x="${L + 6}" y="${T + ih - 6}" class="wpn" fill="${colA}">${away}</text>${qs.join('')}</svg>`;
}

// ρολόι αγώνα από τα δευτερόλεπτα: «Q4 2:14»
export function clockOf(t) {
  const per = t < REG ? Math.min(3, Math.floor(t / 600)) : 4 + Math.floor((t - REG - 1e-9) / 300);
  const pe = per < 4 ? (per + 1) * 600 : REG + (per - 3) * 300;
  const rem = Math.max(0, Math.round(pe - t));
  return `${per < 4 ? 'Q' + (per + 1) : 'OT' + (per - 3)} ${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
}
