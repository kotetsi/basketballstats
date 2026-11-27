// NBA: προβολές παικτών για τους αγώνες των επόμενων 36 ωρών, με τις απουσίες του Rotowire (αν είναι φρέσκες)
//   data/nba/model/projections.json               οι τρέχουσες
//   data/nba/model/proj-archive/<μήνας>.jsonl     κλειδωμένες πριν από τον αγώνα (για τη σύγκριση με τα props)
//   node scripts/nba-proj.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNba, nbaProjections } from '../src/nba/projections.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = await loadNba(ROOT);
let L = null; try { L = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'nba', 'lineups', 'latest.json'), 'utf8')); if (Date.now() - Date.parse(L.at) > 18 * 3600e3) L = null; } catch { }
const P = nbaProjections(N, L);
const dir = path.join(ROOT, 'data', 'nba', 'model');
await fs.mkdir(path.join(dir, 'proj-archive'), { recursive: true });
await fs.writeFile(path.join(dir, 'projections.json'), JSON.stringify(P));
const now = Date.now(), lines = [];
for (const g of P.games) if (Date.parse(g.date) > now) for (const x of g.players) lines.push(JSON.stringify({ gid: g.gid, at: P.generated_at, v: P.version, lu: !!L, pid: x.pid, team: x.team, p_play: x.p_play, min: x.min, pts: x.pts, reb: x.reb, ast: x.ast, fg3: x.fg3, pra: x.pra }));
if (lines.length) await fs.appendFile(path.join(dir, 'proj-archive', `${P.generated_at.slice(0, 7)}.jsonl`), lines.join('\n') + '\n');
console.log(`NBA προβολές: ${P.games.length} αγώνες, ${P.games.reduce((a, g) => a + g.players.length, 0)} παίκτες${L ? ' (με τις απουσίες του Rotowire)' : ' (χωρίς πεντάδες)'} · κλειδώθηκαν ${lines.length}`);
