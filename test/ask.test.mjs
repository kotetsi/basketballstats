// «Ρώτα το BasketballStats»: αναγνώριση παικτών και ερωτήσεων (χωρίς δίκτυο, με μικρά δεδομένα-δείγμα)
import test from 'node:test';
import assert from 'node:assert/strict';
import { pkey, buildIndex, findPlayers, intent, answer } from '../src/fantasy/ask.mjs';

const D = {
  round: 11, days: ['2026-11-11', '2026-11-12', '2026-11-13'], loc: 'el-GR', caps: '/fantasy/agonistiki-11/arxigoi/',
  teams: { PRS: { n: 'Παρί', alt: ['Paris', 'Παρί'], pa: 92.6, dr: 18 }, ULK: { n: 'Φενέρμπαχτσε', alt: ['Fenerbahce', 'Φενέρμπαχτσε'], pa: 75.4, dr: 2 }, OLY: { n: 'Ολυμπιακός', alt: ['Olympiacos'], pa: 80, dr: 8 }, DUB: { n: 'Ντουμπάι', alt: ['Dubai'], pa: 84, dr: 11 }, PAR: { n: 'Παρτιζάν', alt: ['Partizan'], pa: 78, dr: 6 }, BAS: { n: 'Μπασκόνια', alt: ['Baskonia'], pa: 93.1, dr: 19 } },
  games: { PRS: { opp: 'ULK', home: 1, at: '2026-11-11T19:45:00.000Z', day: 0 }, ULK: { opp: 'PRS', home: 0, at: '2026-11-11T19:45:00.000Z', day: 0 }, OLY: { opp: 'DUB', home: 1, at: '2026-11-12T19:15:00.000Z', day: 1 }, DUB: { opp: 'OLY', home: 0, at: '2026-11-12T19:15:00.000Z', day: 1 }, PAR: { opp: 'BAS', home: 1, at: '2026-11-11T19:45:00.000Z', day: 0 }, BAS: { opp: 'PAR', home: 0, at: '2026-11-11T19:45:00.000Z', day: 0 } },
  players: [
    { c: '1', n: 'Ναντίρ Ιφί', alt: ['Nadir Hifi', 'Ναντίρ Ιφί'], t: 'PRS', st: 'playing', pp: 14.9, p10: 4.8, p90: 27.7, day: 0, avg: 20.6, l3: [17, 30, 39], u: '/paiktis/nadir-hifi/' },
    { c: '2', n: 'Αλέξανδρος (Σάσα) Βεζένκοφ', alt: ['Sasha Vezenkov', 'Αλέξανδρος (Σάσα) Βεζένκοφ'], t: 'OLY', st: 'playing', pp: 23.7, p10: 12, p90: 36, day: 1, avg: 22.9, l3: [19, 22, 28], u: '/paiktis/sasha-vezenkov/' },
    { c: '3', n: 'Κάρλικ Τζόουνς', alt: ['Carlik Jones', 'Κάρλικ Τζόουνς'], t: 'PAR', st: 'playing', pp: 14.7, p10: 3.8, p90: 27, day: 0, avg: 15, l3: [5, 7, 6], u: '/paiktis/carlik-jones/' },
    { c: '4', n: 'Kevarrius Hayes', alt: ['Kevarrius Hayes'], t: 'PAR', st: 'injured', why: 'Ώμος', pp: null, day: 0, avg: 9, l3: [20, 21, 5], u: '/paiktis/kevarrius-hayes/' },
    { c: '5', n: 'Νάιτζελ Χέις-Ντέιβις', alt: ['Nigel Hayes-Davis', 'Νάιτζελ Χέις-Ντέιβις'], t: 'ULK', st: 'playing', pp: 10.4, p10: 0, p90: 22, day: 0, avg: 10, l3: [4, 14, 0], u: '/paiktis/nigel-hayes-davis/' },
    { c: '6', n: 'Γουέιντ Μπόλντουιν', alt: ['Wade Baldwin IV', 'Γουέιντ Μπόλντουιν'], t: 'ULK', st: 'playing', pp: 13.7, p10: 3, p90: 26, day: 0, avg: 14, l3: [10, 12, 14], u: '/paiktis/wade-baldwin/' },
  ],
};
const idx = buildIndex(D), today = '2026-11-11';
const ask = (q, lg = 'el') => answer(q, D, idx, today, lg);
const names = q => findPlayers(q, idx).map(h => h.p.c);

test('ελληνική και λατινική γραφή δίνουν το ίδιο κλειδί', () => {
  assert.equal(pkey('Ιφή'), pkey('Hifi'));
  assert.equal(pkey('Βεζένκοφ'), pkey('Vezenkov'));
  assert.equal(pkey('Χέις'), pkey('Hayes'));
});
test('βρίσκει τον παίκτη με λάθη, κλίσεις και ομάδες στην ίδια φράση', () => {
  assert.deepEqual(names('Παιδιά, να βάλω σήμερα τον Ιφή; Παίζει με τη Φενέρ.'), ['1']);
  assert.deepEqual(names('βεζενκωφ'), ['2']);
  assert.deepEqual(names('da li da stavim Hifija danas?'), ['1']);
  assert.deepEqual(names('παίζει ο Χέις;'), ['4']);
  assert.deepEqual(names('Χέις Ντέιβις'), ['5']);
  assert.deepEqual(names('τι καιρό κάνει'), []);
});
test('καταλαβαίνει το είδος της ερώτησης', () => {
  assert.equal(ask('να βάλω τον Ιφί;').kind, 'start');
  assert.equal(ask('Βεζένκοφ αρχηγός;').kind, 'captain');
  assert.equal(ask('Ιφί ή Τζόουνς;').kind, 'compare');
  assert.equal(ask('είναι τραυματίας ο Χέις;').kind, 'injury');
  assert.equal(ask('πότε παίζει ο Ιφί').kind, 'when');
  assert.equal(ask('ποιον αρχηγό σήμερα;').kind, 'bestcap');
  assert.equal(ask('ποιοι είναι οι καλύτεροι αύριο;').kind, 'best');
  assert.equal(ask('γεια').kind, 'unknown');
});
test('οι απαντήσεις βγαίνουν από τα δεδομένα', () => {
  const a = ask('να βάλω σήμερα τον Ιφή;').html;
  assert.match(a, /14,9 PIR/); assert.match(a, /σήμερα/); assert.match(a, /21:45/); assert.match(a, /2η καλύτερη άμυνα/); assert.match(a, /αντίπαλος: Φενέρμπαχτσε/);
  assert.match(ask('Ιφί ή Χέις').html, /εκτός/);
  assert.match(ask('παίζει ο Χέις;').html, /εκτός/);
  assert.match(ask('Βεζένκοφ αρχηγός;').html, /κορυφαία επιλογή αρχηγού/);
  assert.match(ask('ποιοι είναι οι καλύτεροι αύριο').html, /Βεζένκοφ/);
  assert.match(ask('should I start Hifi tonight?', 'en').html, /2nd best defense/);
});
