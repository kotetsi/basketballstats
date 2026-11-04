// Διαιτητές: φάουλ, βολές, ποσοστό νικών γηπεδούχου και συνολικοί πόντοι στους αγώνες που σφύριξαν.
// Πηγές: data/shots/<σεζόν>/<gc>.json (ref, σκορ) + data/pbp/<σεζόν>/<gc>.json (box: φάουλ, βολές ανά ομάδα).
import fs from 'node:fs/promises';
import path from 'node:path';

const cap = s => s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
// «LASTNAME, FIRSTNAME» → «Firstname Lastname»· αφαιρεί κωδικό χώρας σε παρένθεση
export function cleanName(s) {
  let x = String(s || '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  if (!x) return '';
  if (x.includes(',')) { const [l, f] = x.split(',').map(t => t.trim()); x = `${f} ${l}`.trim(); }
  return cap(x);
}
// το πεδίο Referees του boxscore: «A; B; C» ή «Name1, Name2, Name3» ή «LAST, FIRST; LAST, FIRST»
export function parseRefs(s) {
  const str = String(s || '').trim();
  if (!str) return [];
  let parts;
  if (/[;\/|]/.test(str)) parts = str.split(/\s*[;\/|]\s*/);
  else {
    const c = str.split(/\s*,\s*/);
    // «LAST, FIRST, LAST, FIRST, …» (ζυγός αριθμός και τα πρώτα μέρη κεφαλαία μονολεκτικά)
    const pairs = c.length % 2 === 0 && c.length >= 4 && c.every((p, i) => i % 2 || p === p.toUpperCase());
    parts = pairs ? c.reduce((a, p, i) => (i % 2 ? (a[a.length - 1] += ', ' + p, a) : (a.push(p), a)), []) : c;
  }
  return parts.map(cleanName).filter(n => n.length > 3);
}
export const refSlug = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function loadRefs(ROOT, seasons) {
  const rows = [];
  for (const s of seasons) {
    let files = [];
    try { files = (await fs.readdir(path.join(ROOT, 'data', 'shots', s))).filter(f => f.endsWith('.json')); } catch { continue; }
    for (const f of files) {
      let g, p = null;
      try { g = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'shots', s, f), 'utf8')); } catch { continue; }
      const refs = parseRefs(g.ref);
      if (!refs.length || g.hs == null) continue;
      try { p = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'pbp', s, f), 'utf8')); } catch { }
      const bh = p?.box?.[g.h], ba = p?.box?.[g.a];
      rows.push({ season: s, gc: g.gc, r: p?.r ?? null, d: g.d, ph: g.ph || 'RS', h: g.h, a: g.a, hs: g.hs, as: g.as, refs, att: g.att || null,
        pfH: bh ? bh[13] : null, pfA: ba ? ba[13] : null, ftaH: bh ? bh[6] : null, ftaA: ba ? ba[6] : null });
    }
  }
  return rows.sort((x, y) => String(x.d).localeCompare(String(y.d)));
}

const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export function agg(games) {
  const fx = games.filter(g => g.pfH != null);
  return {
    n: games.length,
    homeWin: avg(games.map(g => (g.hs > g.as ? 1 : 0))),
    total: avg(games.map(g => g.hs + g.as)),
    pf: avg(fx.map(g => g.pfH + g.pfA)), fta: avg(fx.map(g => g.ftaH + g.ftaA)),
    pfDiff: avg(fx.map(g => g.pfA - g.pfH)),       // θετικό = περισσότερα φάουλ στους φιλοξενούμενους
    ftaDiff: avg(fx.map(g => g.ftaH - g.ftaA)),    // θετικό = περισσότερες βολές στους γηπεδούχους
    nBox: fx.length,
  };
}
// πίνακας ανά διαιτητή
export function refTable(rows, minN = 1) {
  const by = {};
  for (const g of rows) for (const r of g.refs) (by[r] ||= []).push(g);
  return Object.entries(by).map(([name, gs]) => ({ name, slug: refSlug(name), games: gs, ...agg(gs) })).filter(x => x.n >= minN).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
