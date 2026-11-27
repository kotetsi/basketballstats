// Stoiximan GBL: πόσο πέφτουν μέσα οι προβολές παικτών (src/gbl/projections.mjs), walk-forward χωρίς διαρροή.
// Για κάθε αγώνα, κάθε παίκτης με ≥3 εμφανίσεις στη σεζόν προβλέπεται ΜΟΝΟ με τους αγώνες πριν από αυτόν
// και συγκρίνεται με ό,τι έκανε (όσοι έπαιξαν). Βάσεις σύγκρισης: μέσος όρος σεζόν και μέσος όρος 5 τελευταίων.
//   node scripts/gbl-proj-eval.mjs  → data/gbl/model/projections-eval.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGbl } from '../src/gbl/pages.mjs';
import { appearances, projectOne, rates, KEYS, GBL_PROJ_VERSION } from '../src/gbl/projections.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = await loadGbl(ROOT);
const A = appearances(G), seasons = Object.keys(G.seasons).sort();
const posOf = pid => G.players?.[pid]?.pos || '';
const val = { pts: x => x.pts, reb: x => x.reb, ast: x => x.ast, fg3: x => x.f3m, pir: x => x.pir };
const err = {}, add = (who, k, e) => { (err[who] ||= {}); (err[who][k] ||= []).push(Math.abs(e)); };
const bySeason = {};
for (const S of seasons.slice(1)) {          // η πρώτη σεζόν δίνει μόνο το prior της επόμενης
  const cur = A.filter(x => x.season === S), prevS = seasons[seasons.indexOf(S) - 1];
  const prevBy = new Map(); for (const x of A.filter(x => x.season === prevS)) { if (!prevBy.has(x.pid)) prevBy.set(x.pid, []); prevBy.get(x.pid).push(x); }
  const idx = [...new Set(cur.map(x => x.i))].sort((a, b) => a - b);
  let n = 0;
  for (const i of idx) {
    const before = cur.filter(x => x.i < i), now = cur.filter(x => x.i === i && x.secs > 0);
    if (before.length < 200) continue;          // λίγα δεδομένα για ρυθμό λίγκας στην αρχή της σεζόν
    const league = rates(before, posOf);
    for (const y of now) {
      const hist = before.filter(x => x.pid === y.pid);
      const tg = [...new Set(before.filter(x => x.team === y.team).map(x => x.gid))];
      const pr = projectOne({ hist, prev: prevBy.get(y.pid) || [], teamGames: tg, league, pos: posOf(y.pid) });
      if (!pr) continue;
      const pl = hist.filter(x => x.secs > 0), l5 = pl.slice(-5);
      n++;
      add('model', 'min', pr.min - y.secs / 60); add('avg', 'min', pl.reduce((a, x) => a + x.secs, 0) / pl.length / 60 - y.secs / 60); add('last5', 'min', l5.reduce((a, x) => a + x.secs, 0) / l5.length / 60 - y.secs / 60);
      for (const k of KEYS) {
        add('model', k, pr[k] - val[k](y));
        add('avg', k, pl.reduce((a, x) => a + val[k](x), 0) / pl.length - val[k](y));
        add('last5', k, l5.reduce((a, x) => a + val[k](x), 0) / l5.length - val[k](y));
      }
    }
  }
  bySeason[S] = n;
}
const mae = a => +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(3);
const out = { version: GBL_PROJ_VERSION, generated_at: new Date().toISOString(), n: err.model?.pts?.length || 0, by_season: bySeason,
  mae: Object.fromEntries(Object.entries(err).map(([w, o]) => [w, Object.fromEntries(Object.entries(o).map(([k, a]) => [k, mae(a)]))])) };
await fs.mkdir(path.join(ROOT, 'data', 'gbl', 'model'), { recursive: true });
await fs.writeFile(path.join(ROOT, 'data', 'gbl', 'model', 'projections-eval.json'), JSON.stringify(out, null, 1));
console.log(`GBL προβολές: ${out.n} εμφανίσεις (${JSON.stringify(bySeason)})`);
for (const k of ['min', ...KEYS]) console.log(`  ${k.padEnd(4)} MAE μοντέλο ${out.mae.model[k]} · μ.ο. σεζόν ${out.mae.avg[k]} · 5 τελευταίοι ${out.mae.last5[k]}`);
