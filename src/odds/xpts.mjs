// xPTS: αναμενόμενοι πόντοι από σουτ, από το πού σούταρε ο παίκτης (ζώνες shot chart) — μόνο για το build και τα backtests (Node).
//   σουτ στα data/shots/<σεζόν>/<αγώνας>.json: s = [παίκτης, γηπεδούχος, περίοδος, ρολόι, εύστοχο, τρίποντο, x, y, ζώνη, …]
import fs from 'node:fs';
import path from 'node:path';

/** ευστοχία λίγκας ανά ζώνη (όλες οι σεζόν EuroLeague στο data/shots) + γενικά δίποντα/τρίποντα για σουτ χωρίς ζώνη */
export function leagueZonePct(base) {
  const T = {};
  const add = (k, made) => { const t = T[k] || (T[k] = [0, 0]); t[0] += made ? 1 : 0; t[1]++; };
  for (const s of fs.existsSync(base) ? fs.readdirSync(base).filter(d => d.startsWith('E')) : []) {
    for (const f of fs.readdirSync(path.join(base, s)).filter(f => f.endsWith('.json'))) {
      let g; try { g = JSON.parse(fs.readFileSync(path.join(base, s, f), 'utf8')); } catch { continue; }
      for (const r of g.s || []) { const made = r[4], three = r[5], z = r[8]; add(three ? 'three' : 'two', made); if (z) add(z, made); }
    }
  }
  return Object.fromEntries(Object.entries(T).map(([k, [m, a]]) => [k, a ? m / a : 0]));
}

/** «παίκτης|αγωνιστική» → σουτ [ζώνη ή null, τρίποντο, εύστοχο] για μία σεζόν (αγωνιστική από το league.games: [r, date, h, a, …]) */
export function loadShotIndex(dir, leagueGames) {
  const roundOf = Object.fromEntries((leagueGames || []).map(g => [g[2] + '|' + g[3], g[0]]));
  const idx = new Map();
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : []) {
    let g; try { g = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    const R = roundOf[g.h + '|' + g.a]; if (R == null) continue;
    for (const r of g.s || []) {
      const k = g.ids[r[0]] + '|' + R; let L = idx.get(k); if (!L) idx.set(k, L = []);
      L.push([r[8] || null, r[5] ? 1 : 0, r[4] ? 1 : 0]);
    }
  }
  return idx;
}

/**
 * Αντίγραφα των γραμμών αγώνων του παίκτη με πόντους (r[8]) και εύστοχα τρίποντα (r[11]) «διορθωμένα για τύχη»:
 * r[8] − λ·(πόντοι από σουτ − xPTS), r[11] − λ·(εύστοχα τρίποντα − αναμενόμενα).
 * Αναμενόμενη ευστοχία ζώνης = (εύστοχα παίκτη + k·λίγκα) / (προσπάθειες παίκτη + k), από τις ίδιες γραμμές (ποτέ από τον αγώνα-στόχο).
 * Γραμμές χωρίς δεδομένα σουτ μένουν ίδιες.
 */
export function xptsRows(rows, pid, idx, LZ, { lam = 0.5, k = Infinity } = {}) {
  if (!lam || !idx) return rows;
  const S = rows.map(r => idx.get(pid + '|' + r[0]) || null), Z = {};
  for (const L of S) if (L) for (const [z, t, m] of L) { const key = z || (t ? 'three' : 'two'); const a = Z[key] || (Z[key] = [0, 0]); a[0] += m; a[1]++; }
  const pz = key => { const lg = LZ[key] ?? 0, a = Z[key]; return !a || !isFinite(k) ? lg : (a[0] + k * lg) / (a[1] + k); };
  return rows.map((r, i) => {
    const L = S[i]; if (!L || !L.length) return r;
    let act = 0, x = 0, m3 = 0, x3 = 0;
    for (const [z, t, m] of L) { const p = pz(z || (t ? 'three' : 'two')), v = t ? 3 : 2; act += m * v; x += p * v; if (t) { m3 += m; x3 += p; } }
    const o = r.slice(); o[8] = Math.max(0, r[8] - lam * (act - x)); o[11] = Math.max(0, r[11] - lam * (m3 - x3));
    return o;
  });
}
