// Αξιολόγηση της στήλης «Αξίζει;» του Prop Analyzer σε παλιές αγωνιστικές με πραγματικές αποδόσεις.
//  - Αγωνιστικές με ιστορικό OddsPapi (data/odds/hist/E-*.json): τιμές κλεισίματος Stoiximan / Superbet,
//    πιθανότητα μοντέλου walk-forward (μόνο αγώνες πριν από την αγωνιστική, ίδιο μοντέλο με το site, χωρίς το teamPts).
//    Απόντες για την ανακατανομή λεπτών = όσοι δεν έπαιξαν (στην πράξη γνωστό από τις λίστες τραυματιών, εδώ από το box score).
//  - Αγωνιστικές από το props-track: η πιθανότητα που έβγαζε το site εκείνη την ώρα (πριν τον αγώνα) και οι τελευταίες τιμές.
// Κανόνας «Αξίζει» ίδιος με το src/props/ui.js: EV ≥ 5%, L10 ≥ 50% στην ίδια πλευρά, ≥ 6 αγώνες, |μοντέλο − αγορά| ≤ 25 μονάδες.
// node scripts/props-history-eval.mjs [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { STATS, project, pOver, teamMinutes, statOfMarket } from '../src/odds/props.mjs';

const ROOT = new URL('..', import.meta.url).pathname, OD = path.join(ROOT, 'data/odds');
const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const C = J(path.join(ROOT, 'data/cache.json'));
const players = (C.players || []).filter(p => !String(p.t).includes(';'));
const F = J(path.join(ROOT, 'data/fantasy/latest.json'));
const POS = Object.fromEntries(F.players.map(p => [p.c, p.pos]));
const META = J(path.join(OD, 'oddspapi_meta.json')).markets;
const NAMES = J(path.join(OD, 'status.json')).playerNames || {};
const TRACK = (() => { try { return J(path.join(OD, 'props-track.json')).lines; } catch { return {}; } })();
const stats = Object.keys(STATS), BLEND = 0.5;
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const byCode = Object.fromEntries(players.map(p => [p.c, p]));

// priors λίγκας πριν από κάθε αγωνιστική
const priorBy = new Map(); { const cum = Object.fromEntries(stats.map(s => [s, 0])); let cm = 0;
  const allR = [...new Set(players.flatMap(p => p.g.filter(r => r[7] > 0).map(r => +r[0])))].sort((a, b) => a - b);
  for (const R of [...allR, Math.max(...allR) + 1]) {
    priorBy.set(R, Object.fromEntries(stats.map(s => [s, cm ? cum[s] / cm : 0])));
    for (const p of players) for (const r of p.g) if (+r[0] === R && r[7] > 0) { for (const s of stats) cum[s] += STATS[s](r); cm += r[7] / 60; }
  } }
const hist = (p, R) => p.g.filter(r => r[7] > 0 && +r[0] < R).sort((a, b) => a[0] - b[0]);
const rowOf = (p, R) => p.g.find(r => +r[0] === R && r[7] > 0);
const l10 = (p, R, s, line, side) => { const h = hist(p, R).slice(-10); if (!h.length) return null; const k = h.filter(r => (STATS[s](r) > line) === (side === 'over')).length; return k / h.length; };

// κανόνας ίδιος με το UI
function worth(ev, l, n, gap) {
  if (ev < 0) return 'no';
  return (ev < 0.05 || (l != null && l < 0.5) || n < 6 || (gap != null && Math.abs(gap) > 0.25)) ? 'mid' : 'yes';
}

const bets = [];   // { src, book, round, gid, c, s, line, side, price, pm, mk, pb, ev, w, y }
const minutesCache = new Map();
function modelFor(p, R, gid, s) {
  const key = gid + '|' + p.t;
  if (!minutesCache.has(key)) {
    const team = players.filter(x => x.t === p.t);
    const tm = team.map(x => ({ c: x.c, pos: POS[x.c] || 'Forward', pl: hist(x, R) }));
    const teamRounds = [...new Set(team.flatMap(x => x.g.filter(r => r[7] > 0).map(r => +r[0])))];
    const prevR = Math.max(0, ...teamRounds.filter(r => r < R));
    // ABS=known (προεπιλογή): απόντες όσοι δεν έπαιξαν. ABS=prior: μόνο όσοι έλειπαν ήδη και στον προηγούμενο αγώνα
    // (συντηρητικό: χωρίς τις απουσίες της τελευταίας στιγμής που δεν ήξερε η αγορά στο άνοιγμα)
    const out = new Set(team.filter(x => !rowOf(x, R) && (process.env.ABS !== 'prior' || !rowOf(x, prevR))).map(x => x.c));
    const fresh = new Set(tm.filter(x => out.has(x.c) && x.pl.length && +x.pl[x.pl.length - 1][0] === prevR).map(x => x.c));
    minutesCache.set(key, teamMinutes(tm, out, fresh).M);
  }
  const min = minutesCache.get(key)[p.c]; const h = hist(p, R);
  if (!(min > 0) || h.length < 3) return null;
  const pr = project(h, s, { prior: priorBy.get(R)[s], minutes: min });
  return pr ? { mu: pr.mu, v: pr.var, n: h.length, min } : null;
}
function push(src, book, R, gid, p, s, line, po, pu, pmOver, close = null) {
  const row = rowOf(p, R); if (!row) return;                 // δεν αγωνίστηκε: άκυρο
  const y = STATS[s](row); if (y === line) return;
  const mkO = (1 / po) / (1 / po + 1 / pu), n = hist(p, R).length;
  for (const side of ['over', 'under']) {
    const pm = side === 'over' ? pmOver : 1 - pmOver, mk = side === 'over' ? mkO : 1 - mkO, pb = BLEND * pm + (1 - BLEND) * mk;
    const price = side === 'over' ? po : pu, ev = pb * price - 1;
    // CLV: πόσο άλλαξε η πιθανότητα της αγοράς (χωρίς vig) από την τιμή που «παίξαμε» ως το κλείσιμο, για την ίδια πλευρά
    const cO = close ? (1 / close[0]) / (1 / close[0] + 1 / close[1]) : null, clv = cO == null ? null : (side === 'over' ? cO : 1 - cO) - mk;
    bets.push({ src, book, round: R, gid, c: p.c, s, line, side, price, pm, mk, pb, ev, clv, w: worth(ev, l10(p, R, s, line, side), n, pm - mk), win: (y > line) === (side === 'over') });
  }
}

// ---- 1. ιστορικό OddsPapi
const unmatched = new Map(); let noName = 0;
for (const f of fs.readdirSync(path.join(OD, 'hist')).filter(f => /^E-\d+-/.test(f))) {
  const H = J(path.join(OD, 'hist', f)); const [, R, h, a] = H.gid.match(/^E-(\d+)-(\w+)-(\w+)$/); const round = +R;
  const roster = players.filter(p => p.t === h || p.t === a);
  const find = pid => { const nm = NAMES[pid]; if (!nm) { noName++; return null; }
    const [last, first = ''] = nm.split(',').map(fold); const c = roster.filter(p => { const x = fold(p.n); return x.includes(last) && (!first || x.includes(first.split(' ')[0])); });
    if (c.length === 1) return c[0]; unmatched.set(pid, nm); return null; };
  for (const [book, mkts] of Object.entries(H.books)) {
    if (book === 'bet365') continue;                           // μόνο κλίμακες «X+», όχι over/under
    for (const [mid, outs] of Object.entries(mkts)) {
      const M = META[mid]; const s = statOfMarket(M?.name); if (!s || !stats.includes(s)) continue;
      const oId = M.outcomes.find(o => o.name === 'Over')?.id, uId = M.outcomes.find(o => o.name === 'Under')?.id;
      const O = outs[oId] || {}, U = outs[uId] || {};
      for (const pid of Object.keys(O)) {
        const po = O[pid]?.close, pu = U[pid]?.close; if (!(po > 1 && pu > 1)) continue;
        const p = find(pid); if (!p) continue;
        const m = modelFor(p, round, H.gid, s); if (!m) continue;
        const bk = book === 'superbet' ? 'Superbet' : book === 'stoiximan' ? 'Stoiximan' : book, pmO = pOver(m.mu, m.v, M.line);
        push('hist', bk, round, H.gid, p, s, M.line, po, pu, pmO);
        // ίδια γραμμή με τις τιμές ανοίγματος: απόφαση και τιμή στο άνοιγμα, CLV ως το κλείσιμο
        const oo = O[pid]?.open, uo = U[pid]?.open;
        if (oo > 1 && uo > 1) push('open', bk, round, H.gid, p, s, M.line, oo, uo, pmO, [po, pu]);
      }
    }
  }
}
const histRounds = [...new Set(bets.map(b => b.round))];
// ---- 2. props-track (καταγραφή του site), μόνο για αγωνιστικές χωρίς ιστορικό
for (const r of Object.values(TRACK)) {
  const [gid, R, c, s, line, po, pu, pm, , , , res] = r;
  if (histRounds.includes(R) || typeof res !== 'number' || !(po > 1 && pu > 1) || pm == null) continue;
  const p = byCode[c]; if (!p || !stats.includes(s)) continue;
  push('track', 'Stoiximan (καταγραφή site)', R, gid, p, s, line, po, pu, pm);
}

// ---- σύνοψη
const agg = xs => { const n = xs.length, w = xs.filter(b => b.win).length, pl = xs.reduce((t, b) => t + (b.win ? b.price - 1 : -1), 0), C = xs.filter(b => b.clv != null); return { n, hit: n ? w / n : null, roi: n ? pl / n : null, evAvg: n ? xs.reduce((t, b) => t + b.ev, 0) / n : null, clv: C.length ? C.reduce((t, b) => t + b.clv, 0) / C.length : null, clvPos: C.length ? C.filter(b => b.clv > 0).length / C.length : null }; };
const pc = v => v == null ? '–' : (v * 100).toFixed(1) + '%';
const line = (lab, xs) => { const a = agg(xs); return `${lab.padEnd(34)} n=${String(a.n).padStart(4)}  επιτυχία ${pc(a.hit).padStart(6)}  ROI ${(a.roi == null ? '–' : (a.roi > 0 ? '+' : '') + (a.roi * 100).toFixed(1) + '%').padStart(7)}  μέσο EV ${pc(a.evAvg)}${a.clv != null ? `  CLV ${(a.clv * 100).toFixed(2)} μον. (θετικό ${pc(a.clvPos)})` : ''}`; };
const W = { yes: 'Αξίζει', mid: 'Οριακό', no: 'Δεν αξίζει' };
const out = [];
const rounds = [...new Set(bets.map(b => b.round))].sort((a, b) => a - b);
out.push(`Αγωνιστικές: ${rounds.join(', ')} · ${bets.filter(b => b.src !== 'open').length / 2} γραμμές με αποτέλεσμα (${bets.length} πλευρές) · χωρίς όνομα παίκτη: ${noName} · ονόματα χωρίς αντιστοίχιση: ${unmatched.size}`);
for (const src of ['hist', 'open', 'track']) {
  const B = bets.filter(b => b.src === src); if (!B.length) continue;
  out.push(`\n=== ${src === 'open' ? 'Ιστορικό OddsPapi, απόφαση και τιμή στο ΑΝΟΙΓΜΑ, CLV ως το κλείσιμο (αγων. ' + [...new Set(B.map(b => b.round))].join(', ') + ')' : src === 'hist' ? 'Ιστορικό OddsPapi, κλείσιμο, μοντέλο walk-forward (αγων. ' + [...new Set(B.map(b => b.round))].join(', ') + ')' : 'Καταγραφή του site (αγων. ' + [...new Set(B.map(b => b.round))].join(', ') + ')'}`);
  for (const k of ['yes', 'mid', 'no']) {
    const X = B.filter(b => b.w === k); out.push(line(W[k], X));
    for (const side of ['over', 'under']) out.push(line(`   ${side}`, X.filter(b => b.side === side)));
    if (k !== 'no') for (const bk of [...new Set(B.map(b => b.book))]) out.push(line(`   ${bk}`, X.filter(b => b.book === bk)));
  }
  const Y = B.filter(b => b.w === 'yes');
  out.push('   «Αξίζει» ανά στατιστικό:'); for (const s of stats) { const X = Y.filter(b => b.s === s); if (X.length) out.push(line(`     ${s}`, X)); }
  // βαθμονόμηση (μία πλευρά ανά γραμμή: over)
  const O = B.filter(b => b.side === 'over');
  const brier = k => O.reduce((t, b) => t + (b[k] - (b.win ? 1 : 0)) ** 2, 0) / O.length;
  out.push(`   Brier (over): μοντέλο ${brier('pm').toFixed(4)} · αγορά ${brier('mk').toFixed(4)} · μείξη 50/50 ${brier('pb').toFixed(4)}  (μικρότερο = καλύτερο)`);
  const bins = [[0, .35], [.35, .45], [.45, .55], [.55, .65], [.65, 1.01]];
  out.push('   Βαθμονόμηση μείξης (πλευρά με μεγαλύτερη πιθανότητα): ' + bins.map(([lo, hi]) => { const X = B.filter(b => b.pb >= Math.max(lo, .5) && b.pb < hi); return X.length ? `${(lo * 100).toFixed(0)}-${Math.min(100, hi * 100).toFixed(0)}%: πρόβλ. ${pc(X.reduce((t, b) => t + b.pb, 0) / X.length)} / πραγμ. ${pc(X.filter(b => b.win).length / X.length)} (n=${X.length})` : null; }).filter(Boolean).join(' · '));
}
if (unmatched.size) out.push(`\nΧωρίς αντιστοίχιση: ${[...unmatched.values()].slice(0, 15).join('; ')}`);
console.log(out.join('\n'));
const jf = process.argv.indexOf('--json'); if (jf > 0) fs.writeFileSync(process.argv[jf + 1], JSON.stringify({ rounds, bets }, null, 0));
