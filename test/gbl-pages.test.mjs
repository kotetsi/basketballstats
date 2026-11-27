// Stoiximan GBL: σελίδες (src/gbl/pages.mjs) — βαθμολογία, ονόματα, παραγωγή σελίδων.
import test from 'node:test';
import assert from 'node:assert/strict';
import { standings, niceName, shortName, gblPages, playerStats } from '../src/gbl/pages.mjs';

const T = (id, name) => ({ logo: id, name });
const A = T('A', 'ΟΛΥΜΠΙΑΚΟΣ'), B = T('B', 'ΠΑΝΑΘΗΝΑΪΚΟΣ AKTOR'), C = T('C', 'ΜΑΡΟΥΣΙ');
const g = (id, h, a, hs, as, round, date) => ({ id, round, date, home: h, away: a, hs, as, played: hs != null, phase: 'regular' });

test('βαθμολογία: 2 βαθμοί η νίκη, 1 η ήττα, ισοβαθμία με τα μεταξύ τους', () => {
  // A, B, C από 1-1: A νίκησε B, B νίκησε C, C νίκησε A → κυκλική ισοβαθμία, λύνεται με τη διαφορά στα μεταξύ τους
  const st = standings([g('1', A, B, 80, 70, 1), g('2', B, C, 90, 70, 2), g('3', C, A, 75, 74, 3)]);
  assert.deepEqual(st.map(t => [t.id, t.pts, t.w, t.l]), [['B', 3, 1, 1], ['A', 3, 1, 1], ['C', 3, 1, 1]]);
  // διαφορές στα μεταξύ τους: B −10+20 = +10, A +10−1 = +9, C −20+1 = −19
});

test('βαθμολογία: δύο ισόβαθμοι, μετράει η μεταξύ τους νίκη και όχι η συνολική διαφορά', () => {
  const D = T('D', 'ΑΕΚ');
  // A και D από 1-1. Ο D έχει πολύ καλύτερη συνολική διαφορά, αλλά ο A νίκησε τον D.
  const E = T('E', 'ΑΡΗΣ');
  const st = standings([g('1', A, D, 71, 70, 1), g('2', D, C, 120, 60, 2), g('3', A, E, 70, 71, 3), g('4', C, E, 60, 80, 4)]);
  const a = st.findIndex(t => t.id === 'A'), d = st.findIndex(t => t.id === 'D');
  assert.equal(st[a].pts, st[d].pts);
  assert.ok(a < d);
});

test('ονόματα παικτών και ομάδων', () => {
  assert.equal(niceName('VEZENKOV SASHA'), 'Sasha Vezenkov');
  assert.equal(niceName('DE SOUSA SILVIO'), 'Silvio De Sousa');
  assert.equal(niceName('JACKSON K.J.'), 'K.J. Jackson');
  assert.equal(niceName('NOLLEY II LANDERS'), 'Landers Nolley II');
  assert.equal(niceName('BROWN III GREG'), 'Greg Brown III');
  assert.equal(niceName('MCINTYRE CODI MILLER'), 'Codi Miller-McIntyre');
  assert.equal(shortName('ΠΑΝΑΘΗΝΑΪΚΟΣ AKTOR'), 'Παναθηναϊκός');
  assert.equal(shortName('VIKOS ΦALCONS'), 'Vikos Falcons');
});

test('σελίδες: αρχική, ομάδες, παίκτες, πρόβλεψη επόμενου αγώνα', () => {
  const games = [g('1', A, B, 80, 70, 1, '2026-10-03T17:00'), { ...g('2', B, A, null, null, 2, '2026-10-10T18:00'), played: false }];
  const pl = (pid, name, pts, secs) => ({ pid, name, pts, reb: 1, ast: 2, stl: 0, blk: 0, tov: 1, pir: pts, f2m: 1, f2a: 2, f3m: 1, f3a: 3, ftm: 0, fta: 0, secs });
  const box = { 1: { teams: [{ players: [pl('P1', 'VEZENKOV SASHA', 30, 1800), pl('P2', 'BENCH NOONE', 0, 0)] }, { players: [pl('P3', 'SLOUKAS KOSTAS', 20, 1700)] }] } };
  assert.equal(playerStats(games, box).length, 2);   // όποιος δεν έπαιξε δεν μετράει
  const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9α-ω]+/g, '-').replace(/^-|-$/g, '');
  const P = gblPages({ cur: 'G2026', seasons: { G2026: games }, box, model: { predictions: [{ id: '2', p_home: 0.61, margin: 4, total: 160 }] } },
    { esc: s => String(s), slugify, url: k => '/' + k.replace(':', '/') + '/', siteUrl: 'https://x', siteName: 'BS', home: '/' });
  assert.equal(P[0].key, 'gbl');
  assert.match(P[0].main, /Stoiximan GBL 2026-27/);
  assert.match(P[0].main, /61%/);                    // πρόβλεψη στην επόμενη αγωνιστική
  assert.match(P[0].main, /εκτίμηση 82-78/);
  assert.equal(P.filter(p => /μπάσκετ:/.test(p.title)).length, 2);   // 2 ομάδες
  for (const k of ['gbl:programma', 'gbl:prognostika', 'gbl:koryfaioi', 'gbl:thermometro', 'gbl:statistika-omadon']) assert.ok(P.some(p => p.key === k), k);
  assert.match(P[0].main, /gblnav/);                 // μενού της GBL
  const v = P.find(p => /Sasha Vezenkov/.test(p.title));
  assert.ok(v && v.noindex);                         // λιγότεροι από 3 αγώνες → noindex
});

test('Έλληνες παίκτες στα ελληνικά, οι υπόλοιποι με λατινικά', async () => {
  const { displayName } = await import('../src/gbl/pages.mjs');
  const G = { gn: { P1: 'Κώστας Μήτογλου' }, players: { P1: { country: 'ΕΛΛΑΔΑ' }, P2: { country: 'ΕΛΛΑΔΑ' }, P3: { country: 'ΗΠΑ' } }, el: { 'DORSEY, TYLER': 'Τάιλερ Ντόρσεϊ' } };
  assert.equal(displayName('P1', 'MITOGLOU KOSTAS', G), 'Κώστας Μήτογλου');
  assert.equal(displayName('P2', 'DORSEY TYLER', G), 'Τάιλερ Ντόρσεϊ');     // από το αρχείο της EuroLeague
  assert.equal(displayName('P3', 'WALKER JORDAN', G), 'Jordan Walker');
});

test('σελίδα παίκτη του esake.gr: χώρα, θέση, γέννηση, ύψος', async () => {
  const { parsePlayer } = await import('../src/gbl/esake.mjs');
  assert.deepEqual(parsePlayer('<td>ΘΕΣΗ</td><td>PF</td> ΗΜ. ΓΕΝΝΗΣΗΣ 06-08-1995 <b>ΧΩΡΑ</b> ΚΥΠΡΟΣ ΥΨΟΣ 2,06 μ.'), { country: 'ΚΥΠΡΟΣ', pos: 'PF', born: '1995-08-06', height: 2.06 });
});

test('προβολές παικτών: μόνο με το παρελθόν, πιθανότητα να παίξει, εκτός όποιος λείπει 3 αγώνες', async () => {
  const { projectOne } = await import('../src/gbl/projections.mjs');
  const ap = (gid, secs, pts) => ({ gid, secs, pts, reb: 4, ast: 2, f3m: 1, pir: pts });
  const league = { all: { pts: 0.4, reb: 0.15, ast: 0.08, fg3: 0.03, pir: 0.4 }, byPos: {} };
  const hist = [ap('a', 1200, 10), ap('b', 1200, 12), ap('c', 1200, 14), ap('d', 0, 0), ap('e', 1200, 12)];
  const pr = projectOne({ hist, teamGames: ['a', 'b', 'c', 'd', 'e'], league });
  assert.ok(pr.pts > 9 && pr.pts < 14, String(pr.pts));
  assert.equal(pr.p_play, 0.8);                       // έπαιξε στους 4 από τους 5
  assert.equal(projectOne({ hist: hist.slice(0, 3), teamGames: ['a', 'b', 'c', 'x', 'y', 'z'], league }), null);   // λείπει 3 αγώνες
  assert.equal(projectOne({ hist: hist.slice(0, 2), teamGames: ['a', 'b'], league }), null);                       // λιγότεροι από 3 αγώνες
});
