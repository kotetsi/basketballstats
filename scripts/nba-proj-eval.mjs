// NBA: ακρίβεια των προβολών παικτών (src/nba/projections.mjs), walk-forward χωρίς διαρροή: κάθε εμφάνιση
// προβλέπεται μόνο με τους αγώνες πριν από αυτήν (και την προηγούμενη σεζόν ως prior), και συγκρίνεται με
// μέσο όρο σεζόν και 5 τελευταίων. Όσοι δεν έπαιξαν δεν μετράνε (όπως στα props: void).
//   node scripts/nba-proj-eval.mjs → data/nba/model/projections-eval.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNba, nbaAppearances, leagueAcc, NKEYS, NBA_PROJ_VERSION } from '../src/nba/projections.mjs';
import { projectOne, val } from '../src/gbl/projections.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = await loadNba(ROOT), A = nbaAppearances(N), seasons = Object.keys(N.seasons).sort();
const err = { model: {}, avg: {}, last5: {} }, add = (w, k, e) => (err[w][k] ||= []).push(Math.abs(e));
const by = {};
for (const S of seasons) {
  const cur = A.filter(x => x.season === S), prevS = seasons[seasons.indexOf(S) - 1];
  const prevBy = new Map(); for (const x of A.filter(x => x.season === prevS)) (prevBy.get(x.pid) || prevBy.set(x.pid, []).get(x.pid)).push(x);
  const L = leagueAcc(), hist = new Map(), tg = new Map(); let n = 0, rows = 0;
  const idx = [...new Set(cur.map(x => x.i))];
  let k0 = 0;
  for (const i of idx) {
    const now = []; while (k0 < cur.length && cur[k0].i === i) now.push(cur[k0++]);
    if (rows >= 2000) {                                     // λίγα δεδομένα για ρυθμό λίγκας στην αρχή της σεζόν
      const league = L.get();
      for (const y of now) {
        const h = hist.get(y.pid) || []; if (h.length < 3) continue;
        const pr = projectOne({ hist: h, prev: prevBy.get(y.pid) || [], teamGames: tg.get(y.team) || [], league, pos: y.pos, keys: NKEYS });
        if (!pr) continue;
        n++; const l5 = h.slice(-5);
        add('model', 'min', pr.min - y.secs / 60); add('avg', 'min', h.reduce((a, x) => a + x.secs, 0) / h.length / 60 - y.secs / 60); add('last5', 'min', l5.reduce((a, x) => a + x.secs, 0) / l5.length / 60 - y.secs / 60);
        for (const k of NKEYS) { add('model', k, pr[k] - val[k](y)); add('avg', k, h.reduce((a, x) => a + val[k](x), 0) / h.length - val[k](y)); add('last5', k, l5.reduce((a, x) => a + val[k](x), 0) / l5.length - val[k](y)); }
      }
    }
    for (const y of now) { L.add(y); rows++; (hist.get(y.pid) || hist.set(y.pid, []).get(y.pid)).push(y); const l = tg.get(y.team) || []; if (l.at(-1) !== y.gid) l.push(y.gid); tg.set(y.team, l); }
  }
  by[S] = n;
}
const mae = a => +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(3);
const out = { version: NBA_PROJ_VERSION, generated_at: new Date().toISOString(), n: err.model.pts?.length || 0, by_season: by,
  mae: Object.fromEntries(Object.entries(err).map(([w, o]) => [w, Object.fromEntries(Object.entries(o).map(([k, a]) => [k, mae(a)]))])) };
await fs.mkdir(path.join(ROOT, 'data', 'nba', 'model'), { recursive: true });
await fs.writeFile(path.join(ROOT, 'data', 'nba', 'model', 'projections-eval.json'), JSON.stringify(out, null, 1));
console.log(`NBA προβολές: ${out.n} εμφανίσεις (${JSON.stringify(by)})`);
for (const k of ['min', ...NKEYS]) console.log(`  ${k.padEnd(4)} MAE μοντέλο ${out.mae.model[k]} · μ.ο. σεζόν ${out.mae.avg[k]} · 5 τελευταίοι ${out.mae.last5[k]}`);
