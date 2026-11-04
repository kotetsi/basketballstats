// ETL: σουτ με συντεταγμένες (επίσημο /api/Points) + play-by-play (ασίστ, πεντάδες, clutch) για κάθε αγώνα που υπάρχει στο data/pbp.
//   node scripts/shots.mjs                    τρέχουσα σεζόν (EuroLeague + EuroCup), μόνο νέοι αγώνες
//   node scripts/shots.mjs --season E2025     backfill μιας σεζόν
//   node scripts/shots.mjs --secs 600         όριο χρόνου ανά εκτέλεση
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStints } from '../src/analytics/pbp-core.mjs';
import { normalize, zoneOf } from '../src/shots/zones.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONF = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8').catch(() => '{}'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const cur = process.env.SEASON || CONF.season || 'E2026';
const SEASONS = arg('--season') ? [arg('--season')] : [cur, 'U' + cur.slice(1)];
const FORCE = process.argv.includes('--force');
const VER = 3; // αυξάνεται όταν αλλάζει ο αλγόριθμος· παλαιότερα αρχεία ξαναϋπολογίζονται αυτόματα
const DEADLINE = Date.now() + 1000 * +arg('--secs', 600);
const LIVE = 'https://live.euroleague.net/api';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = s => String(s ?? '').trim();

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      if (r.ok) { const t = await r.text(); return t ? JSON.parse(t) : null; }
      if (r.status === 404) return null;
    } catch { /* ξανά */ }
    await sleep(1200 * (i + 1));
  }
  return null;
}

export function mergeShots(pbpShots, rows, home) {
  // αντιστοίχιση με τον αριθμό φάσης (NUM_ANOT = NUMBEROFPLAY)· εναλλακτικά με παίκτη + ρολόι
  const byN = new Map(), byPC = new Map();
  for (const r of rows || []) {
    if (!/^[23]FG[MA]$/.test(T(r.ID_ACTION))) continue;
    byN.set(+r.NUM_ANOT, r);
    byPC.set(T(r.ID_PLAYER) + '|' + T(r.CONSOLE) + '|' + T(r.ID_ACTION), r);
  }
  let matched = 0;
  const out = pbpShots.map(s => {
    const act = (s.three ? '3FG' : '2FG') + (s.made ? 'M' : 'A');
    let r = byN.get(+s.n);
    if (!r || T(r.ID_PLAYER) !== s.pid) r = byPC.get(s.pid + '|' + s.clk + '|' + act);
    const c = r ? normalize(r.COORD_X, r.COORD_Y) : null;
    if (c) matched++;
    return { ...s, x: c ? Math.round(c.x) : null, y: c ? Math.round(c.y) : null, z: c ? zoneOf(c.x, c.y, !!s.three) : null,
      fb: r && T(r.FASTBREAK) === '1' ? 1 : 0, sc: r && T(r.SECOND_CHANCE) === '1' ? 1 : 0, home: s.team === home ? 1 : 0 };
  });
  return { shots: out, matched };
}

async function season(code) {
  const src = path.join(ROOT, 'data', 'pbp', code), dir = path.join(ROOT, 'data', 'shots', code);
  let files = [];
  try { files = (await fs.readdir(src)).filter(f => f.endsWith('.json')); } catch { console.log(`${code}: δεν υπάρχει data/pbp`); return; }
  await fs.mkdir(dir, { recursive: true });
  const have = new Set(await fs.readdir(dir));
  let done = 0, coords = 0, total = 0, astF = 0, astBox = 0;
  for (const f of files.sort((a, b) => parseInt(a) - parseInt(b))) {
    if (have.has(f) && !FORCE) { try { if ((JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')).v || 1) >= VER) continue; } catch { } }
    if (Date.now() > DEADLINE) { console.log(`${code}: όριο χρόνου, συνέχεια στην επόμενη εκτέλεση`); break; }
    const g = JSON.parse(await fs.readFile(path.join(src, f), 'utf8'));
    const [pbp, pts, box] = await Promise.all([get(`${LIVE}/PlayByPlay?gamecode=${g.gc}&seasoncode=${code}`), get(`${LIVE}/Points?gamecode=${g.gc}&seasoncode=${code}`), get(`${LIVE}/Boxscore?gamecode=${g.gc}&seasoncode=${code}`)]);
    await sleep(200);
    if (!pbp) continue;
    const starters = {};
    for (const [id, v] of Object.entries(g.pl || {})) if (v[3]) (starters[v[1]] ||= []).push(id.trim());
    const r = buildStints(pbp, starters);
    const { shots, matched } = mergeShots(r.shots, pts?.Rows, g.h);
    const ids = [...new Set(shots.flatMap(s => [s.pid, s.ast, ...(s.def || [])]).filter(Boolean))], ix = Object.fromEntries(ids.map((id, i) => [id, i]));
    // συμπαγής μορφή: [σουτέρ, γηπεδούχος, περίοδος, ρολόι, εύστοχο, τρίποντο, x, y, ζώνη, ασίστ, διαφορά, clutch, fastbreak, 2η ευκαιρία, άμυνα(5)]
    const S = shots.map(s => [ix[s.pid], s.home, s.q, s.clk, s.made, s.three, s.x, s.y, s.z, s.ast ? ix[s.ast] : -1, s.margin, s.clutch, s.fb, s.sc, s.def ? s.def.map(d => ix[d]) : null]);
    await fs.writeFile(path.join(dir, f), JSON.stringify({ v: VER, ref: T(box?.Referees), att: +String(box?.Attendance ?? '').replace(/\D/g, '') || null, sc: r.scoring.map(([tt, side, p, pid, a, b]) => [tt, side, p, pid ? (ix[pid] ?? (ids.push(pid), ix[pid] = ids.length - 1)) : -1, a, b]), gc: g.gc, d: g.d, ph: g.ph, h: g.h, a: g.a, hs: g.hs, as: g.as, ids: ids.map(id => id.replace(/^P/, '')), s: S, chk: { shots: shots.length, coords: matched } }));
    done++; coords += matched; total += shots.length;
    astF += shots.filter(s => s.ast).length; astBox += (g.box?.[g.h]?.[10] || 0) + (g.box?.[g.a]?.[10] || 0);
    if (done % 20 === 0) console.log(`${code}: ${done}…`);
  }
  console.log(`${code}: ${done} νέοι αγώνες, ${total} σουτ, ${total ? Math.round(100 * coords / total) : 0}% με συντεταγμένες, ασίστ ${astF}/${astBox} του box score`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) for (const s of SEASONS) await season(s).catch(e => console.log(s, 'σφάλμα:', e.message));
