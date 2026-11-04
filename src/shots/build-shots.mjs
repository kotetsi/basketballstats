// Φόρτωση data/shots/<σεζόν>/*.json και αθροίσεις για το build (σελίδες + static API).
import fs from 'node:fs/promises';
import path from 'node:path';
import { zoneStats, groupStats, creation, topAssisters, assistNetwork, defensiveProfile, percentile, GROUPS } from './zones.mjs';

export async function loadShots(ROOT) {
  const base = path.join(ROOT, 'data', 'shots');
  const seasons = {};
  let dirs = [];
  try { dirs = await fs.readdir(base); } catch { return null; }
  for (const s of dirs.sort()) {
    let files = [];
    try { files = (await fs.readdir(path.join(base, s))).filter(f => f.endsWith('.json')); } catch { continue; }
    const games = [], shots = [];
    for (const f of files) {
      let g; try { g = JSON.parse(await fs.readFile(path.join(base, s, f), 'utf8')); } catch { continue; }
      const gi = games.length;
      games.push({ gc: g.gc, d: g.d, ph: g.ph || 'RS', h: g.h, a: g.a, hs: g.hs, as: g.as, ref: g.ref || null, att: g.att || null, sc: g.sc || null, ids: g.ids });
      for (const r of g.s) {
        const [p, home, q, clk, made, three, x, y, z, ast, margin, clutch, fb, sc, def] = r;
        shots.push({ season: s, gi, pid: g.ids[p], team: home ? g.h : g.a, opp: home ? g.a : g.h, home, q, clk, made, three, x, y, z, ast: ast >= 0 ? g.ids[ast] : null, margin, clutch, fb, sc, def: def ? def.map(i => g.ids[i]) : null });
      }
    }
    games.sort((a, b) => a.d.localeCompare(b.d));
    seasons[s] = { games, shots };
  }
  return Object.keys(seasons).length ? seasons : null;
}

// Μέσοι όροι λίγκας ανά σεζόν (μόνο σουτ με συντεταγμένες)
export function leagueAverages(SH) {
  const out = {};
  for (const [s, { shots }] of Object.entries(SH)) {
    const XY = shots.filter(x => x.z);
    out[s] = { n: XY.length, zones: zoneStats(XY), groups: groupStats(XY) };
  }
  return out;
}

// Συμπαγής μορφή για τον browser. pov: η ομάδα από τη σκοπιά της οποίας ορίζεται ο «αντίπαλος» κάθε αγώνα.
export function pack(list, games, side = () => 0) {
  const gmap = new Map(), G = [], names = new Set();
  const rows = list.map(s => {
    const key = s.season + '|' + s.gi + '|' + (side(s) ? s.opp : s.team);
    if (!gmap.has(key)) { const g = games[s.season].games[s.gi], tm = side(s) ? s.opp : s.team; gmap.set(key, G.length); G.push({ d: g.d, ph: g.ph, opp: g.h === tm ? g.a : g.h, gc: g.gc }); }
    names.add(s.pid); if (s.ast) names.add(s.ast);
    return [s.season, gmap.get(key), s.team, s.pid, s.q, s.clk, s.made, s.three, s.x, s.y, s.z, s.ast, s.margin, s.clutch, s.fb, s.sc, side(s) ? (s.home ? 0 : 1) : s.home, side(s)];
  });
  return { games: G, shots: rows, ids: [...names] };
}

// Προφίλ παίκτη: ζώνες, δημιουργία, ασίστ, αμυντικό, με εκατοστημόρια ανάμεσα σε όσους έχουν ≥ minN προσπάθειες
export function playerProfiles(SH, season, minN = 15) {
  const S = SH[season]; if (!S) return {};
  const byP = {};
  for (const s of S.shots) (byP[s.pid] ||= []).push(s);
  const LA = groupStats(S.shots.filter(x => x.z));
  const prof = {};
  for (const [pid, L] of Object.entries(byP)) {
    const XY = L.filter(x => x.z);
    prof[pid] = { team: L[L.length - 1].team, n: L.length, groups: groupStats(XY), zones: zoneStats(XY), creation: creation(L), assisters: topAssisters(L, 6) };
  }
  // εκατοστημόρια FG% ανά ομάδα ζωνών
  for (const g of Object.keys(GROUPS)) {
    const vals = Object.values(prof).filter(p => p.groups[g].fga >= minN).map(p => p.groups[g].fg);
    for (const p of Object.values(prof)) p.groups[g].pct = p.groups[g].fga >= minN ? percentile(vals, p.groups[g].fg) : null;
  }
  // αμυντικό: σουτ αντιπάλων με τον παίκτη στο παρκέ
  const onDef = {};
  for (const s of S.shots) if (s.def) for (const d of s.def) (onDef[d] ||= []).push(s);
  for (const [pid, L] of Object.entries(onDef)) if (prof[pid] || L.length >= 30) (prof[pid] ||= { team: null, n: 0 }).defense = defensiveProfile(L.filter(x => x.z), LA);
  return prof;
}

export function teamProfiles(SH, season) {
  const S = SH[season]; if (!S) return {};
  const LA = groupStats(S.shots.filter(x => x.z));
  const own = {}, opp = {};
  for (const s of S.shots) { (own[s.team] ||= []).push(s); (opp[s.opp] ||= []).push(s); }
  const out = {};
  for (const t of Object.keys(own)) {
    const XY = own[t].filter(x => x.z);
    out[t] = { n: own[t].length, groups: groupStats(XY), zones: zoneStats(XY), creation: creation(own[t]), network: assistNetwork(own[t]).slice(0, 12), defense: defensiveProfile((opp[t] || []).filter(x => x.z), LA) };
  }
  return out;
}

export function playerDefShots(SH, season, pid) {
  return (SH[season]?.shots || []).filter(s => s.def && s.def.includes(pid));
}
