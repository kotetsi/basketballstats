// Ομάδα συζήτησης Telegram (scripts/telegram-group.mjs) και κάρτες «Το είπαμε» (scripts/pick-cards.mjs), χωρίς δίκτυο
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupPlan } from '../scripts/telegram-group.mjs';
import { settledPicks, resultCardHtml, resultLine, recordLine } from '../scripts/pick-cards.mjs';

// κωδικός ημερομηνίας όπως στο data.json: ΜΜΗΗωωλλ + τελευταίο ψηφίο έτους (ώρα UTC)
const teams = { OLY: ['Ολυμπιακός', '#e30613'], PAN: ['Παναθηναϊκός', '#007a3d'], MAD: ['Ρεάλ Μαδρίτης', '#5b3f8c'], RED: ['Ερυθρός Αστέρας', '#d0021b'] };
const day1 = [[12, '120218006', 'OLY', 'PAN', 0, 0, false], [12, '120219456', 'MAD', 'RED', 0, 0, false]];   // 2/12/2026 20:00 και 21:45 Αθήνα
const data = { teams, league: { games: day1.map(g => [...g]) }, mp: { 'OLY|PAN': [85, 80, 0.64, 165], 'MAD|RED': [82, 80, 0.45, 162] } };

test('μέρα αγώνων: ένα μήνυμα με πιθανότητες και μία δημοσκόπηση ανά αγώνα, μόνο πριν από το πρώτο τζάμπολ', () => {
  const st = { mp: {}, done: [] };
  const P = groupPlan(data, st, new Date('2026-12-02T10:10:00Z'));   // 12:10 Αθήνα
  assert.equal(P.length, 1); assert.equal(P[0].kind, 'day');
  assert.match(P[0].text, /Σήμερα στη EuroLeague/); assert.match(P[0].text, /64% – 36%/); assert.match(P[0].text, /21\+/);
  assert.deepEqual(P[0].polls.map(q => q.o), [['Ολυμπιακός', 'Παναθηναϊκός'], ['Ρεάλ Μαδρίτης', 'Ερυθρός Αστέρας']]);
  assert.equal(groupPlan(data, { mp: {}, done: ['day-2026-12-02'] }, new Date('2026-12-02T10:10:00Z')).length, 0, 'μία φορά την ημέρα');
  assert.equal(groupPlan(data, st, new Date('2026-12-02T18:30:00Z')).length, 0, 'όχι μετά το πρώτο τζάμπολ');
  assert.equal(groupPlan(data, st, new Date('2026-12-02T04:00:00Z')).length, 0, 'όχι νύχτα (06:00 Αθήνα)');
});

test('επόμενη μέρα: τελικά σκορ με ✅/❌ για το φαβορί του μοντέλου, μόνο όταν τελείωσαν όλοι οι αγώνες', () => {
  const st = { mp: { '12-OLY-PAN': { day: '2026-12-02', ph: 0.64 }, '12-MAD-RED': { day: '2026-12-02', ph: 0.45 } }, done: ['day-2026-12-02'], tally: { hits: 3, n: 5 } };
  const half = { ...data, league: { games: [[12, '120218006', 'OLY', 'PAN', 88, 80, true], [12, '120219456', 'MAD', 'RED', 0, 0, false]] } };
  assert.equal(groupPlan(half, st, new Date('2026-12-03T10:10:00Z')).length, 0);
  const fin = { ...data, league: { games: [[12, '120218006', 'OLY', 'PAN', 88, 80, true], [12, '120219456', 'MAD', 'RED', 90, 78, true]] } };
  const [r] = groupPlan(fin, st, new Date('2026-12-03T10:10:00Z'));
  assert.equal(r.kind, 'res'); assert.equal(r.hits, 1); assert.equal(r.n, 2);
  assert.match(r.text, /88-80.*✅/); assert.match(r.text, /90-78.*❌.*Ερυθρός Αστέρας 55%/);
  assert.match(r.text, /1 από 2.*4\/7/);
});

const tipsDone = [
  { g: 'OLY-PAN', r: 12, n: 'High Fidelity', s: 'high-fidelity', l: 'Ολυμπιακός -3.5', u: '/tipsters/high-fidelity/12-oly-pan-1/', o: 1.85, res: 'W', sc: '88-80', v: null, st: null, d: '120218006', rec: { W: 8, L: 3, units: 3.26 } },
  { g: 'MAD-RED', r: 12, n: 'High Fidelity', s: 'high-fidelity', l: 'Hezonja πόντοι 15+', u: '/tipsters/high-fidelity/12-mad-red-2/', o: 2.1, res: 'L', sc: '90-78', v: 11, st: 'pts', d: '120219456', rec: { W: 8, L: 3, units: 3.26 } },
  { g: 'MAD-RED', r: 12, n: 'High Fidelity', s: 'high-fidelity', l: 'Under 165.5', u: '/tipsters/high-fidelity/12-mad-red-3/', o: 1.8, res: 'P', sc: '90-78', d: '120219456', rec: { W: 8, L: 3, units: 3.26 } },
];
test('κάρτες «Το είπαμε»: και τα κερδισμένα και τα χαμένα, όχι τα άκυρα· ρεκόρ και τι έφερε ο παίκτης', () => {
  const P = settledPicks({ teams, tipsDone }, ['high-fidelity'], '2026-12-02');
  assert.deepEqual(P.map(t => t.res), ['W', 'L']);
  assert.equal(settledPicks({ teams, tipsDone }, ['high-fidelity'], '2026-12-03').length, 0);
  assert.equal(resultLine(P[1]), 'Έφερε 11 πόντους'); assert.equal(recordLine(P[0]), 'Ρεκόρ High Fidelity: 8-3 · +3,3 μονάδες');
  const w = resultCardHtml(P[0], { teams }), l = resultCardHtml(P[1], { teams });
  assert.match(w, /Το είπαμε\./); assert.match(w, /ΠΕΤΥΧΕ/); assert.match(l, /Δεν βγήκε\./); assert.match(l, /Έφερε 11 πόντους/);
  for (const h of [w, l]) { assert.match(h, /21\+/); assert.match(h, /και τα χαμένα/); }
});
