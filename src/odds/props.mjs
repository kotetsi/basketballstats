// Player props: στατιστικό μοντέλο (λεπτά × ρυθμός ανά λεπτό, αρνητική διωνυμική κατανομή) και σύγκριση με αποδόσεις
// αδειοδοτημένων bookmakers. Καθαρές συναρτήσεις: ίδιος κώδικας στο build, στα tests και στο backtest.
//   γραμμή αγώνα (data/cache.json players[].g): r[0] αγωνιστική, r[7] δευτερόλεπτα, r[8] πόντοι, r[11] τρίποντα εύστοχα,
//   r[15]+r[16] ριμπάουντ (επιθ.+αμυντ.), r[17] ασίστ, r[18] κλεψίματα, r[20] κοψίματα, r[19] λάθη

export const STATS = {
  pts: r => r[8], reb: r => r[15] + r[16], ast: r => r[17], fg3: r => r[11],
  pr: r => r[8] + r[15] + r[16], pa: r => r[8] + r[17], pra: r => r[8] + r[15] + r[16] + r[17], ar: r => r[15] + r[16] + r[17],
};
// ονόματα αγορών του OddsPapi → δικό μας κλειδί (μόνο ολόκληρος ο αγώνας, με παράταση)
const MARKET = {
  'Points': 'pts', 'Rebounds': 'reb', 'Assists': 'ast', '3 Point FG': 'fg3', 'Points + Rebounds': 'pr', 'Points + Assists': 'pa',
  'Points + Assists + Rebounds': 'pra', 'Assists + Rebounds': 'ar',
};
export function statOfMarket(name) {
  const m = /^Over Under Player (.+) \(incl\. overtime\)$/.exec(String(name || ''));
  return m ? MARKET[m[1]] || null : null;
}

// Παράμετροι μοντέλου (επιλεγμένες με backtest στους αγώνες της σεζόν: scripts/props-backtest.mjs)
export const PARAMS = {
  minHalf: 3,      // λεπτά: εκθετικός μέσος όρος, «μισή ζωή» 3 αγώνες (οι πιο πρόσφατοι μετράνε περισσότερο)
  rateHalf: 8,     // ρυθμός ανά λεπτό: μισή ζωή 8 αγώνες
  prior: 40,       // shrinkage του ρυθμού προς τον μέσο όρο της λίγκας: «ψεύτικα» λεπτά
  minSd: 8,        // αβεβαιότητα λεπτών (λεπτά)
  blend: 0.5,      // τελική πιθανότητα = blend·μοντέλο + (1−blend)·αγορά χωρίς vig (η αγορά ξέρει πράγματα που δεν ξέρουμε)
  share: 0.45,     // ποσοστό των λεπτών μιας νέας απουσίας που πάει στους συμπαίκτες (backtest)
  disp: { pts: 3, reb: 1, ast: 1, fg3: 1.15, pr: 2, pa: 2, pra: 2, ar: 1 },  // υπερδιασπορά (var/mean) για δεδομένα λεπτά
};

const ew = (xs, half) => { let s = 0, w = 0; xs.forEach((x, i) => { const k = Math.pow(0.5, (xs.length - 1 - i) / half); s += k * x; w += k; }); return w ? s / w : null; };

/** πρόβλεψη για έναν παίκτη: rows = αγώνες που έπαιξε (χρονολογικά), prior = ρυθμός ανά λεπτό της λίγκας για το stat
 *  minutes: προαιρετικά δοσμένα λεπτά (π.χ. μετά από ανακατανομή λόγω απουσίας) */
export function project(rows, stat, { prior = 0, minutes = null, P = PARAMS } = {}) {
  const pl = rows.filter(r => r[7] > 0);
  if (pl.length < 3) return null;
  const mins = pl.map(r => r[7] / 60), xs = pl.map(STATS[stat]);
  const m = minutes ?? ew(mins, P.minHalf);
  // ρυθμός: σταθμισμένος (με χρόνο και πρόσφατη φόρμα) λόγος, με shrinkage προς τον ρυθμό της λίγκας
  let sx = 0, sm = 0; pl.forEach((r, i) => { const k = Math.pow(0.5, (pl.length - 1 - i) / P.rateHalf); sx += k * xs[i]; sm += k * mins[i]; });
  const rate = (sx + P.prior * prior) / (sm + P.prior);
  const mu = Math.max(0.05, rate * m);
  const v = (P.disp[stat] || 1.5) * mu + (rate * P.minSd) ** 2;
  return { min: m, rate, mu, var: v, n: pl.length, last: xs.slice(-5), lastMin: mins.slice(-5) };
}

// αρνητική διωνυμική (mean μ, variance v > μ)· Poisson όταν v ≤ μ
function logGamma(z) { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i); const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); }
export function pmf(k, mu, v) {
  if (v <= mu * 1.0001) return Math.exp(k * Math.log(mu) - mu - logGamma(k + 1));
  const r = mu * mu / (v - mu), p = r / (r + mu);
  return Math.exp(logGamma(k + r) - logGamma(r) - logGamma(k + 1) + r * Math.log(p) + k * Math.log(1 - p));
}
/** P(X > line) για μισή γραμμή (π.χ. 13.5 → X ≥ 14) */
export function pOver(mu, v, line) {
  const kmax = Math.floor(line); let c = 0;
  for (let k = 0; k <= kmax; k++) c += pmf(k, mu, v);
  return Math.min(1, Math.max(0, 1 - c));
}

/** πιθανότητα αγοράς χωρίς το περιθώριο του bookmaker (κανονικοποίηση των δύο implied) */
export function noVig(over, under) {
  if (!(over > 1 && under > 1)) return null;
  const a = 1 / over, b = 1 / under;
  return { over: a / (a + b), under: b / (a + b), margin: a + b - 1 };
}
/** αναμενόμενη απόδοση ανά 1 μονάδα: P·απόδοση − 1 */
export const ev = (p, price) => p * price - 1;

/** «Pajola, Alessandro» / «PAJOLA, ALESSANDRO» → ίδιο κλειδί (χωρίς τόνους/σύμβολα) */
export const nameKey = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z, ]/g, '').replace(/\s+/g, ' ').trim();
/** αντιστοίχιση ονόματος του παρόχου με παίκτη της ομάδας: ακριβές «ΕΠΩΝΥΜΟ, ΟΝΟΜΑ», αλλιώς μοναδικό επώνυμο */
export function matchPlayer(name, roster) {
  const k = nameKey(name), last = k.split(',')[0].trim();
  const ex = roster.filter(p => nameKey(p.n) === k); if (ex.length === 1) return ex[0];
  const ln = roster.filter(p => nameKey(p.n).split(',')[0].trim() === last); if (ln.length === 1) return ln[0];
  const ini = (k.split(',')[1] || '').trim()[0];
  const li = ln.filter(p => (nameKey(p.n).split(',')[1] || '').trim()[0] === ini); return li.length === 1 ? li[0] : null;
}

/** ανακατανομή λεπτών όταν λείπουν παίκτες: τα λεπτά του απόντα πάνε στους συμπαίκτες ίδιας θέσης
 *  (Guard/Forward/Center), αναλογικά με τα λεπτά τους, με όριο 36′. Το 25% πάει σε όλη την ομάδα (αλλαγές ρόλων).
 *  outCodes: όλοι οι απόντες (δεν παίρνουν λεπτά)· fromCodes: όσων τα λεπτά μοιράζονται (οι «νέες» απουσίες) */
export function redistribute(team, outCodes, cap = 36, fromCodes = outCodes) {
  const out = new Set(outCodes), from = new Set(fromCodes), M = Object.fromEntries(team.map(p => [p.c, out.has(p.c) ? 0 : p.min]));
  for (const a of team.filter(p => from.has(p.c) && p.min > 0)) {
    const avail = team.filter(p => !out.has(p.c) && p.min > 0);
    const same = avail.filter(p => p.pos === a.pos), pools = [[same.length ? same : avail, 0.75], [avail, 0.25]];
    for (const [pool, share] of pools) {
      let left = a.min * share;
      for (let it = 0; it < 4 && left > 0.01; it++) {
        const open = pool.filter(p => M[p.c] < cap), tot = open.reduce((s, p) => s + M[p.c], 0); if (!tot) break;
        let used = 0; for (const p of open) { const add = Math.min(cap - M[p.c], left * M[p.c] / tot); M[p.c] += add; used += add; }
        left -= used;
      }
    }
  }
  return M;
}

/** λεπτά ομάδας για τον επόμενο αγώνα.
 *  team: [{c, pos, pl: αγώνες που έπαιξε (χρονολογικά)}], out: απόντες, fresh: όσοι από αυτούς έπαιξαν στον τελευταίο αγώνα.
 *  Τα λεπτά μιας νέας απουσίας μοιράζονται στους συμπαίκτες (redistribute). Στο backtest, η μεταφορά του ~45% των λεπτών
 *  του απόντα έδωσε τη μικρότερη απόκλιση (4,87 → 4,63 λεπτά σε αγώνες με απόντα βασικό): το υπόλοιπο «χάνεται» σε
 *  αλλαγές ρόλων, ρυθμό και παίκτες που δεν έπαιζαν. Οι παλιές απουσίες φαίνονται ήδη στα πρόσφατα λεπτά των άλλων. */
export function teamMinutes(team, out, fresh, P = PARAMS) {
  const base = {};
  for (const p of team) base[p.c] = p.pl.length ? ew(p.pl.map(r => r[7] / 60), P.minHalf) : 0;
  const adj = team.map(p => ({ c: p.c, pos: p.pos, min: fresh.has(p.c) ? base[p.c] * P.share : base[p.c] }));
  return { base, M: redistribute(adj, [...out], 36, [...fresh].filter(c => base[c] > 0)) };
}

/** εξαγωγή player props από την απάντηση /odds του OddsPapi για έναν bookmaker (markets = bookmakerOdds[slug].markets) */
export function extractProps(markets, meta) {
  const out = [];
  for (const [mid, mk] of Object.entries(markets || {})) {
    const md = meta.markets?.[mid]; const stat = statOfMarket(md?.name); if (!stat || md.line == null) continue;
    const side = {}; for (const o of md.outcomes || []) side[o.id] = /^over$/i.test(o.name) ? 'over' : /^under$/i.test(o.name) ? 'under' : null;
    const by = {};
    for (const [oid, oc] of Object.entries(mk.outcomes || {})) {
      const s = side[oid]; if (!s) continue;
      for (const [pid, pe] of Object.entries(oc.players || {})) {
        if (pid === '0' || pe.active === false || !(pe.price > 1) || !pe.playerName) continue;
        const x = (by[pid] ||= { name: pe.playerName, stat, line: +md.line });
        x[s] = pe.price; x.upd = [x.upd, pe.changedAt].filter(Boolean).sort().pop() || null;
      }
    }
    for (const x of Object.values(by)) if (x.over || x.under) out.push(x);
  }
  return out;
}

/** ρυθμός ανά λεπτό της λίγκας ανά stat (prior για το shrinkage) */
export function leaguePriors(players) {
  const out = {};
  for (const s of Object.keys(STATS)) { let x = 0, m = 0; for (const p of players) for (const r of p.g || []) if (r[7] > 0) { x += STATS[s](r); m += r[7] / 60; } out[s] = m ? x / m : 0; }
  return out;
}

/** value στα player props ενός αγώνα.
 *  game: { gid, h, a, books: latest.games[gid].books }, players: data/cache.json players, fx: fantasy players (status, pos),
 *  inj: { [code]: {m:1|0} }, teamGames: { [team]: [rounds που έχει παίξει η ομάδα] }, jur: χώρα αδειοδότησης */
export function gameProps({ h, a, books }, { players, fx = [], inj = {}, teamGames = {}, jur, priors, minEv = 0.08 }) {
  const FX = Object.fromEntries(fx.map(p => [p.c, p]));
  const teams = {}, absences = [];
  for (const t of [h, a]) {
    const lastTeam = Math.max(0, ...(teamGames[t] || []));
    const roster = players.filter(p => p.t.split(';').pop() === t).map(p => {
      const pl = p.g.filter(r => r[7] > 0).sort((x, y) => x[0] - y[0]);
      const st = FX[p.c]?.status || 'playing', isOut = inj[p.c]?.m === 1 || st === 'injured' || st === 'rest';
      // νέα απουσία = έπαιξε στον τελευταίο αγώνα της ομάδας (αλλιώς η απουσία του ήδη «φαίνεται» στα λεπτά των άλλων)
      const fresh = isOut && pl.length > 0 && pl[pl.length - 1][0] === lastTeam;
      return { ...p, pl, pos: FX[p.c]?.pos || 'Forward', st, isOut, fresh };
    });
    const TM = teamMinutes(roster, new Set(roster.filter(p => p.isOut).map(p => p.c)), new Set(roster.filter(p => p.fresh).map(p => p.c)));
    const M = TM.M;
    for (const p of roster) p.min = TM.base[p.c];
    for (const p of roster.filter(p => p.fresh && p.min > 0)) absences.push({ c: p.c, n: p.n, t, min: p.min });
    teams[t] = { roster, M };
  }
  const rows = [];
  for (const [bk, B] of Object.entries(books || {})) {
    if (jur && !(B.lic || []).includes(jur)) continue;
    for (const x of B.props || []) {
      let p = null, t = null;
      for (const tt of [h, a]) { p = matchPlayer(x.name, teams[tt].roster); if (p) { t = tt; break; } }
      if (!p || p.isOut || p.pl.length < 3) continue;
      const min = teams[t].M[p.c]; if (!(min > 0)) continue;
      const pr = project(p.pl, x.stat, { prior: priors[x.stat], minutes: min }); if (!pr) continue;
      const po = pOver(pr.mu, pr.var, x.line), nv = noVig(x.over, x.under);
      const row = { c: p.c, n: p.n, t, stat: x.stat, line: x.line, book: bk, title: B.title, over: x.over || null, under: x.under || null,
        p: +po.toFixed(4), mkt: nv ? +nv.over.toFixed(4) : null, mu: +pr.mu.toFixed(2), sd: +Math.sqrt(pr.var).toFixed(2), min: +min.toFixed(1), base: +p.min.toFixed(1),
        avg: +(p.pl.reduce((s, r) => s + STATS[x.stat](r), 0) / p.pl.length).toFixed(1), last: pr.last, gp: pr.n, st: p.st, upd: x.upd || B.upd || null };
      row.evO = x.over ? +ev(po, x.over).toFixed(4) : null; row.evU = x.under ? +ev(1 - po, x.under).toFixed(4) : null;
      rows.push(row);
    }
  }
  // καλύτερη τιμή ανά (παίκτης, stat, γραμμή, πλευρά) ανάμεσα στους bookmakers
  const best = {};
  for (const r of rows) for (const side of ['over', 'under']) {
    const price = r[side]; if (!price) continue;
    const k = `${r.c}|${r.stat}|${r.line}|${side}`, e = side === 'over' ? r.evO : r.evU;
    if (!best[k] || price > best[k].price) best[k] = { ...r, side, price, evModel: e, pm: side === 'over' ? r.p : 1 - r.p, books: [] };
  }
  for (const r of rows) for (const side of ['over', 'under']) { const b = best[`${r.c}|${r.stat}|${r.line}|${side}`]; if (b && r[side]) b.books.push([r.title, r[side]]); }
  const all = Object.values(best);
  for (const b of all) {
    const pmk = b.mkt == null ? null : b.side === 'over' ? b.mkt : 1 - b.mkt;
    b.pb = pmk == null ? b.pm : PARAMS.blend * b.pm + (1 - PARAMS.blend) * pmk;   // συντηρητική πιθανότητα
    b.ev = +ev(b.pb, b.price).toFixed(4);
    b.flags = [];
    if (b.st === 'doubtful') b.flags.push('doubtful');
    if (b.gp < 5) b.flags.push('sample');
    if (b.mkt != null && Math.abs((b.side === 'over' ? b.mkt : 1 - b.mkt) - b.pm) > 0.2) b.flags.push('gap');   // μεγάλη διαφωνία με την αγορά: πιθανή είδηση που δεν ξέρουμε
    if (Math.abs(b.min - b.base) >= 2) b.flags.push('minutes');
  }
  const value = all.filter(b => b.ev >= minEv && !b.flags.includes('doubtful')).sort((x, y) => y.ev - x.ev);
  const shifts = Object.entries(teams).flatMap(([t, T]) => T.roster.filter(p => !p.isOut && T.M[p.c] - p.min >= 0.5).map(p => ({ c: p.c, n: p.n, t, base: +p.min.toFixed(1), adj: +T.M[p.c].toFixed(1) }))).sort((x, y) => (y.adj - y.base) - (x.adj - x.base));
  return { rows, best: all, value, absences, shifts };
}

// ---- παρακολούθηση: κάθε γραμμή που είδαμε (τελευταία τιμή πριν από τον αγώνα) και το αποτέλεσμα μετά τον αγώνα.
// Έτσι μετράμε ποιος είχε δίκιο, το μοντέλο ή η αγορά, και πόσο θα είχαν αποδώσει οι επιλογές value.
// γραμμή: [gid, round, code, stat, line, overPrice, underPrice, pModelOver, pMarketOver, firstSeen, lastSeen, actual|null|'void']
export function trackUpdate(track, gid, round, best, ts) {
  const L = (track.lines ||= {});
  for (const b of best) {
    const k = `${gid}|${b.c}|${b.stat}|${b.line}`, x = (L[k] ||= [gid, round, b.c, b.stat, b.line, null, null, null, null, ts, ts, null]);
    if (b.side === 'over') x[5] = b.price; else x[6] = b.price;
    x[7] = +(b.side === 'over' ? b.pm : 1 - b.pm).toFixed(4); x[8] = b.mkt; x[10] = ts;
  }
  return track;
}
/** αποτέλεσμα: η τιμή του stat στον αγώνα της αγωνιστικής (void αν δεν έπαιξε) */
export function trackSettle(track, players, doneRounds) {
  const P = Object.fromEntries(players.map(p => [p.c, p]));
  for (const x of Object.values(track.lines || {})) {
    if (x[11] != null || !doneRounds.has(x[1])) continue;
    const row = P[x[2]]?.g.find(r => r[0] === x[1]);
    x[11] = row && row[7] > 0 ? STATS[x[3]](row) : 'void';
  }
  return track;
}
/** σύνοψη: βαθμονόμηση μοντέλου/αγοράς και απόδοση των επιλογών value (1 μονάδα ανά επιλογή) */
export function trackSummary(track, P = PARAMS, minEv = 0.08) {
  const S = { lines: 0, overRate: 0, model: 0, market: 0, brierModel: 0, brierMarket: 0, picks: 0, won: 0, profit: 0, pending: 0 };
  for (const x of Object.values(track.lines || {})) {
    const [, , , , line, po, pu, pm, mk, , , y] = x;
    const pb = mk == null ? pm : P.blend * pm + (1 - P.blend) * mk;
    const side = po && pb * po - 1 >= minEv ? 'over' : pu && (1 - pb) * pu - 1 >= minEv ? 'under' : null;
    if (y == null) { if (side) S.pending++; continue; }
    if (y === 'void') continue;
    const o = y > line ? 1 : 0;
    if (mk != null) { S.lines++; S.overRate += o; S.model += pm; S.market += mk; S.brierModel += (pm - o) ** 2; S.brierMarket += (mk - o) ** 2; }
    if (side) { S.picks++; const w = side === 'over' ? o : 1 - o; S.won += w; S.profit += w ? (side === 'over' ? po : pu) - 1 : -1; }
  }
  if (S.lines) for (const k of ['overRate', 'model', 'market', 'brierModel', 'brierMarket']) S[k] /= S.lines;
  S.roi = S.picks ? S.profit / S.picks : null;
  return S;
}
