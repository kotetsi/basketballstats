// Stoiximan GBL (ελληνική Basket League): ανάγνωση των σελίδων του esake.gr. Καθαρές συναρτήσεις χωρίς εξαρτήσεις.
//   Game Center (όλοι οι αγώνες μιας σεζόν): /el/action/EsakeResults?idchampionship=<ID>&idteam=&idseason=&series=
//   Box score αγώνα:                          /el/action/EsakegameView?idgame=<ID>&mode=3
// Στο box score ο πρώτος πίνακας είναι ο γηπεδούχος· το ελέγχουμε και με το σύνολο πόντων.

export const BASE = 'https://www.esake.gr';
/** σεζόν GBL → idchampionship του esake.gr (από το μενού του Game Center) */
export const SEASONS = Object.freeze({ G2026: '184645B9', G2025: '44B80BEB', G2024: '4820C134', G2023: 'C1AF5EF5' });
/** φάσεις: 00000001 κανονική περίοδος, 00000002 playoffs. Χωρίς series η σελίδα δείχνει μόνο την τρέχουσα αγωνιστική. */
export const PHASES = Object.freeze({ regular: '00000001', playoffs: '00000002' });
export const resultsUrl = (id, phase = '', series = '') => `${BASE}/el/action/EsakeResults?idchampionship=${id}&idteam=&idseason=${phase}&series=${series}`;
export const boxUrl = id => `${BASE}/el/action/EsakegameView?idgame=${id}&mode=3`;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export const decode = s => String(s).replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
/** κείμενο ενός κομματιού HTML: <br> = κενό, χωρίς ετικέτες, ένα κενό ανάμεσα στις λέξεις */
export const text = h => decode(String(h).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const MONTHS = { 'ιαν': 1, 'φεβ': 2, 'μαρ': 3, 'απρ': 4, 'μαι': 5, 'μαΐ': 5, 'ιουν': 6, 'ιουλ': 7, 'αυγ': 8, 'σεπ': 9, 'οκτ': 10, 'νοε': 11, 'δεκ': 12 };
const plain = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** «Σαβ 21 Νοε - 15:00» + σεζόν G2026 → '2026-11-21T15:00' (ώρα Ελλάδας). Σεπ–Δεκ = πρώτο έτος της σεζόν, Ιαν–Αυγ = δεύτερο. */
export function parseDate(s, season) {
  const m = /(\d{1,2})\s+([^\s\d-]+)\s*(?:-\s*(\d{1,2}):(\d{2}))?/.exec(String(s || ''));
  if (!m) return null;
  const k = plain(m[2]), mon = MONTHS[k] ?? MONTHS[k.slice(0, 4)] ?? MONTHS[k.slice(0, 3)];
  if (!mon) return null;
  const y0 = +String(season).slice(1), y = mon >= 9 ? y0 : y0 + 1;
  const p = n => String(n).padStart(2, '0');
  return `${y}-${p(mon)}-${p(+m[1])}` + (m[3] ? `T${p(+m[3])}:${m[4]}` : '');
}

/** οι αγωνιστικές μιας φάσης, όπως τις γεμίζει η σελίδα: $j('#series').append(new Option('QF1', '201')) → [{ value: '201', label: 'QF1' }] */
export function parseSeries(html) {
  const out = [], seen = new Set();
  for (const m of String(html).matchAll(/#series'\)\.append\(new Option\('([^']*)',\s*'([^']*)'\)\)/g)) if (m[2] && !seen.has(m[2])) { seen.add(m[2]); out.push({ value: m[2], label: m[1] }); }
  return out;
}

/** Game Center → [{ id, round, date, venue, home: { logo, name }, away: { logo, name }, hs, as, played, quarters }] */
export function parseResults(html, season) {
  const blocks = String(html).split(/<div class="esake-program-game">/).slice(1);
  const out = [];
  for (const b of blocks) {
    const id = /idgame=([0-9A-F]+)/i.exec(b)?.[1];
    if (!id) continue;
    const h5 = text(/<h5>([\s\S]*?)<\/h5>/.exec(b)?.[1] || '');
    const round = +(/^(\d+)/.exec(h5)?.[1] || 0) || null, stage = round ? null : (h5 || null);   // playoffs: QF1, SF2, F1…
    const info = [...b.matchAll(/<div class="esake-program-game-info[^"]*">([\s\S]*?)<\/div>/g)].map(x => text(x[1]));
    const i0 = b.indexOf('esake-program-game-final-score row'), i1 = b.indexOf('esake-program-game-hidden', i0);
    const fs = i0 < 0 ? '' : b.slice(i0, i1 < 0 ? undefined : i1);
    const cols = fs.split(/<div class="col-/).slice(1).map(c => c.slice(c.indexOf(">") + 1));   // γηπεδούχος, σκορ, φιλοξενούμενος
    const team = h => ({ logo: /esaketeam\/([0-9A-F]+)\//i.exec(h || '')?.[1] || null, name: text(/<span>([\s\S]*?)<\/span>/.exec(h || '')?.[1] || '') });
    const sc = /(\d+)\s*-\s*(\d+)/.exec(text(cols[1] || ''));
    const qs = [...b.matchAll(/<tr><td>([^<]*)<\/td><td>(Q\d|ΟΤ\d|OT\d)<\/td><td>([^<]*)<\/td><\/tr>/g)].map(x => [x[2].replace('ΟΤ', 'OT'), +x[1] || 0, +x[3] || 0]).filter(q => q[1] || q[2]);
    out.push({ id, round, stage, date: parseDate(info[0], season), venue: info[1] || null, home: team(cols[0]), away: team(cols[2]),
      hs: sc ? +sc[1] : null, as: sc ? +sc[2] : null, played: !!sc, quarters: qs });
  }
  return out;
}

const pair = s => { const m = /(\d+)\s*-\s*(\d+)/.exec(s); return m ? [+m[1], +m[2]] : [0, 0]; };
const secs = s => { const m = /(\d+):(\d+):(\d+)/.exec(s); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; };
const num = s => (/^-?\d+$/.test(s) ? +s : 0);

/** μία γραμμή box score (17 κελιά) → αριθμοί, στη σειρά των στηλών του esake.gr */
function line(c) {
  const [f2m, f2a] = pair(c[2]), [f3m, f3a] = pair(c[3]), [ftm, fta] = pair(c[4]);
  return { pts: num(c[1]), f2m, f2a, f3m, f3a, ftm, fta, reb: num(c[5]), dreb: num(c[6]), oreb: num(c[7]), ast: num(c[8]),
    blk: num(c[9]), blka: num(c[10]), fd: num(c[11]), pf: num(c[12]), stl: num(c[13]), tov: num(c[14]), secs: secs(c[15]), pir: num(c[16]) };
}

/** box score → { teams: [{ team, players: [{ pid, name, no, ...line }], team_reb, totals }] } (πρώτη = γηπεδούχος) */
export function parseBox(html) {
  const tables = [...String(html).matchAll(/<table class="table table-esake[^"]*">([\s\S]*?)<\/table>/g)].map(x => x[1]);
  const teams = [];
  for (const t of tables) {
    const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(t)?.[1] || '', foot = /<tfoot>([\s\S]*?)<\/tfoot>/.exec(t)?.[1] || '';
    const players = [];
    let team = null;
    for (const tr of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(x => x[1]);
      if (cells.length < 17) continue;
      const a = cells[0];
      const pid = /idplayer=([0-9A-F]+)/i.exec(a)?.[1];
      if (!pid) continue;
      team ||= /idteam=([0-9A-F]+)/i.exec(a)?.[1] || null;
      const no = /#(\d+)/.exec(text(a))?.[1] ?? null;
      const name = text(a.replace(/#\d+/, ''));
      players.push({ pid, name, no: no == null ? null : +no, ...line(cells.map(text)) });
    }
    const fr = [...foot.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(x => text(x[1])));
    const bench = fr.find(r => /ΟΜΑΔΙΚΑ/.test(r[0] || '')), tot = fr.find(r => /ΣΥΝΟΛΟ/.test(r[0] || ''));
    teams.push({ team, players, team_reb: bench ? { reb: num(bench[5]), dreb: num(bench[6]), oreb: num(bench[7]), tov: num(bench[14]) } : null, totals: tot ? line(tot) : null });
  }
  return { teams };
}

/** έλεγχος συνέπειας: οι πόντοι των παικτών = σύνολο ομάδας = σκορ του Game Center */
export function checkBox(box, game) {
  const errs = [];
  if (box.teams.length !== 2) errs.push(`πίνακες: ${box.teams.length}`);
  box.teams.forEach((t, i) => {
    const s = t.players.reduce((a, p) => a + p.pts, 0);
    if (t.totals && s !== t.totals.pts) errs.push(`ομάδα ${i}: πόντοι παικτών ${s} ≠ σύνολο ${t.totals.pts}`);
  });
  if (game?.played && box.teams.length === 2) {
    const [h, a] = box.teams.map(t => t.totals?.pts);
    if (h !== game.hs || a !== game.as) errs.push(`σκορ ${h}-${a} ≠ Game Center ${game.hs}-${game.as}`);
  }
  return errs;
}
