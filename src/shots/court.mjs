// Σχέδιο γηπέδου και ζωνών σε SVG (κοινό για browser και build).
import { COURT, CORNER_Y } from './zones.mjs';

// ---------- γήπεδο (SVG, σε εκατοστά· y προς τα πάνω = προς το κέντρο)
export const W = COURT.halfW, Y0 = COURT.baseY, Y1 = 1400 + COURT.baseY;
export const sy = y => Y1 - y + Y0; // αναστροφή ώστε το καλάθι να είναι κάτω
export function courtSVG() {
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
export function zonePath(z) {
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
export const ZLAB = { rim: [0, 60], paint: [0, 300], mid: [-430, 300], c3l: [-705, 30], c3r: [705, 30], w3l: [-560, 640], w3r: [560, 640], top3: [0, 860] };
export const heatColor = h => { if (h == null) return 'var(--sh-none)'; const t = (h + 1) / 2; const c1 = [40, 110, 200], c2 = [190, 190, 190], c3 = [214, 59, 46]; const m = (a, b, u) => Math.round(a + (b - a) * u); const [a, b, u] = t < 0.5 ? [c1, c2, t * 2] : [c2, c3, (t - 0.5) * 2]; return `rgb(${m(a[0], b[0], u)},${m(a[1], b[1], u)},${m(a[2], b[2], u)})`; };


// Στατική μικρογραφία: heat map ζωνών (FG% σε σχέση με τη λίγκα) για κάρτες και σελίδες
export function miniHeat(zs, la, { minA = 8, label = true } = {}) {
  const hc = (v, a) => (v.fga >= minA && v.fg != null && a?.fg != null ? heatColor(Math.max(-1, Math.min(1, (v.fg - a.fg) / 0.12))) : 'rgba(128,128,128,.12)');
  const zones = Object.keys(ZLAB);
  return `<svg class="shmini" viewBox="${-W} ${Y0 + 350} ${2 * W} ${Y1 - Y0 - 350}" role="img" aria-label="heat map">${zones.map(z => `<path d="${zonePath(z)}" fill="${hc(zs[z] || { fga: 0 }, la?.[z])}" class="zp"/>`).join('')}${courtSVG()}${label ? zones.map(z => { const v = zs[z]; if (!v || v.fga < minA) return ''; const [x, y] = ZLAB[z]; return `<text x="${x}" y="${sy(y) + 15}" class="zt">${Math.round(100 * v.fg)}%</text>`; }).join('') : ''}</svg>`;
}
