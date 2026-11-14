// Player props: εξαγωγή από το OddsPapi, κατανομή, χωρίς-vig, ανακατανομή λεπτών, αντιστοίχιση ονομάτων, value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { statOfMarket, extractProps, pOver, pmf, noVig, ev, redistribute, matchPlayer, project, gameProps, leaguePriors } from '../src/odds/props.mjs';

const meta = { markets: {
  '1': { name: 'Over Under Player Points (incl. overtime)', line: 13.5, outcomes: [{ id: '2', name: 'Under' }, { id: '1', name: 'Over' }] },
  '3': { name: 'Over Under Player Points + Rebounds (incl. overtime)', line: 13.5, outcomes: [{ id: '3', name: 'Over' }, { id: '4', name: 'Under' }] },
  '5': { name: 'Over Under Player Points First Quarter', line: 3.5, outcomes: [{ id: '5', name: 'Over' }, { id: '6', name: 'Under' }] },
} };

test('αγορές: μόνο ολόκληρος αγώνας, γνωστά stats', () => {
  assert.equal(statOfMarket('Over Under Player Points (incl. overtime)'), 'pts');
  assert.equal(statOfMarket('Over Under Player Points + Assists + Rebounds (incl. overtime)'), 'pra');
  assert.equal(statOfMarket('Over Under Player Points First Quarter'), null);
  assert.equal(statOfMarket('Over Under Player Steals (incl. overtime)'), null);
  assert.equal(statOfMarket(undefined), null);
});

test('εξαγωγή props: over/under από τα ονόματα των outcomes, χωρίς ανενεργά και χωρίς player 0', () => {
  const markets = {
    '1': { outcomes: { '1': { players: { '77': { playerName: 'Tanaskovic, Nikola', price: 1.8, active: true, changedAt: '2026-11-10T10:00:00Z' } } }, '2': { players: { '77': { playerName: 'Tanaskovic, Nikola', price: 1.95 }, '78': { playerName: 'X, Y', price: 1.9, active: false } } } } },
    '3': { outcomes: { '3': { players: { '0': { price: 1.9 } } } } },
    '5': { outcomes: { '5': { players: { '77': { playerName: 'Tanaskovic, Nikola', price: 1.8 } } } } },
  };
  const out = extractProps(markets, meta);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { name: 'Tanaskovic, Nikola', stat: 'pts', line: 13.5, over: 1.8, under: 1.95, upd: '2026-11-10T10:00:00Z' });
});

test('κατανομή: Poisson όταν var = mean, αθροίζει στο 1, P(Over) φθίνει με τη γραμμή', () => {
  let s = 0; for (let k = 0; k < 80; k++) s += pmf(k, 12, 30); assert.ok(Math.abs(s - 1) < 1e-6);
  assert.ok(Math.abs(pmf(2, 3, 3) - Math.exp(-3) * 9 / 2) < 1e-9);
  assert.ok(pOver(12, 30, 10.5) > pOver(12, 30, 13.5));
  assert.ok(Math.abs(pOver(3, 3, 0.5) - (1 - Math.exp(-3))) < 1e-9);
});

test('χωρίς vig και EV', () => {
  const n = noVig(1.9, 1.9); assert.equal(n.over, 0.5); assert.ok(Math.abs(n.margin - (2 / 1.9 - 1)) < 1e-12);
  assert.equal(noVig(1.9, null), null);
  assert.ok(Math.abs(ev(0.6, 1.9) - 0.14) < 1e-12);
});

test('ανακατανομή λεπτών: πάνε κυρίως σε ίδια θέση, σύνολο σταθερό, όριο 36′, οι παλιοί απόντες δεν παίρνουν', () => {
  const team = [{ c: 'A', pos: 'Guard', min: 24 }, { c: 'B', pos: 'Guard', min: 20 }, { c: 'C', pos: 'Guard', min: 10 }, { c: 'D', pos: 'Center', min: 25 }, { c: 'E', pos: 'Guard', min: 18 }];
  const M = redistribute(team, ['A', 'E'], 36, ['A']);
  assert.equal(M.A, 0); assert.equal(M.E, 0);
  assert.ok(Math.abs(M.B + M.C + M.D - (20 + 10 + 25 + 24)) < 1e-6);
  assert.ok(M.B - 20 > M.D - 25);
  assert.ok(M.B - 20 > M.C - 10);
  const M2 = redistribute([{ c: 'A', pos: 'Guard', min: 30 }, { c: 'B', pos: 'Guard', min: 34 }, { c: 'C', pos: 'Forward', min: 20 }], ['A']);
  assert.ok(M2.B <= 36 + 1e-9);
});

test('ονόματα: «Επώνυμο, Όνομα» με ή χωρίς τόνους, μοναδικό επώνυμο, αλλιώς αρχικό', () => {
  const roster = [{ n: 'TANASKOVIC, NIKOLA' }, { n: 'BRIZUELA, DARIO' }, { n: 'HERNANGOMEZ, JUANCHO' }, { n: 'HERNANGOMEZ, WILLY' }];
  assert.equal(matchPlayer('Tanasković, Nikola', roster), roster[0]);
  assert.equal(matchPlayer('Brizuela, D.', roster), roster[1]);
  assert.equal(matchPlayer('Hernangomez, Willy', roster), roster[3]);
  assert.equal(matchPlayer('Hernangomez, Juan', roster), roster[2]);
  assert.equal(matchPlayer('Nobody, X', roster), null);
});

// συνθετικοί αγώνες: [r, date, opp, home, ts, os, start, secs, pts, m2, a2, m3, a3, ftm, fta, oreb, dreb, ast, ...]
const g = (r, min, pts, reb = 3, ast = 2) => { const x = new Array(26).fill(0); x[0] = r; x[1] = `2026-10-${String(r).padStart(2, '0')}`; x[7] = min * 60; x[8] = pts; x[16] = reb; x[17] = ast; return x; };

test('πρόβλεψη: λεπτά με βάρος στα πρόσφατα, ρυθμός ανά λεπτό, δοσμένα λεπτά', () => {
  const rows = [g(1, 20, 10), g(2, 20, 10), g(3, 20, 10), g(4, 30, 15), g(5, 30, 15)];
  const p = project(rows, 'pts', { prior: 0.5 });
  assert.ok(p.min > 25 && p.min < 30);
  assert.ok(Math.abs(p.rate - 0.5) < 1e-9);
  assert.ok(Math.abs(project(rows, 'pts', { prior: 0.5, minutes: 32 }).mu - 16) < 1e-9);
  assert.equal(project(rows.slice(0, 2), 'pts'), null);
});

test('value αγώνα: απουσία ανεβάζει τα λεπτά του συμπαίκτη, μόνο αδειοδοτημένοι για τη χώρα, απόντες εκτός', () => {
  const players = [
    { c: 'P1', n: 'PUNTER, KEVIN', t: 'BAR', g: [1, 2, 3, 4, 5].map(r => g(r, 25, 15)) },
    { c: 'P2', n: 'BRIZUELA, DARIO', t: 'BAR', g: [1, 2, 3, 4, 5].map(r => g(r, 16, 8)) },
    { c: 'P3', n: 'PARRA, JOEL', t: 'BAR', g: [1, 2, 3, 4, 5].map(r => g(r, 20, 6)) },
    { c: 'Q1', n: 'SLOUKAS, KOSTAS', t: 'PAN', g: [1, 2, 3, 4, 5].map(r => g(r, 26, 11)) },
  ];
  const fx = [{ c: 'P1', pos: 'Guard', status: 'injured' }, { c: 'P2', pos: 'Guard', status: 'playing' }, { c: 'P3', pos: 'Forward', status: 'playing' }, { c: 'Q1', pos: 'Guard', status: 'playing' }];
  const books = {
    stoiximan: { title: 'Stoiximan', lic: ['gr'], props: [{ name: 'Brizuela, Dario', stat: 'pts', line: 8.5, over: 2.2, under: 1.6 }, { name: 'Punter, Kevin', stat: 'pts', line: 14.5, over: 1.8, under: 1.9 }] },
    unlicensed: { title: 'X', lic: [], props: [{ name: 'Brizuela, Dario', stat: 'pts', line: 8.5, over: 5, under: 1.1 }] },
  };
  const teamGames = { BAR: [1, 2, 3, 4, 5], PAN: [1, 2, 3, 4, 5] };
  const R = gameProps({ h: 'PAN', a: 'BAR', books }, { players, fx, inj: {}, teamGames, jur: 'gr', priors: leaguePriors(players) });
  assert.deepEqual(R.absences.map(x => x.c), ['P1']);
  const bz = R.best.find(b => b.c === 'P2' && b.side === 'over');
  assert.ok(bz.min > bz.base + 3, 'ο Brizuela παίρνει λεπτά');
  assert.equal(bz.price, 2.2); assert.deepEqual(bz.books, [['Stoiximan', 2.2]]);
  assert.ok(bz.flags.includes('minutes'));
  assert.ok(!R.best.some(b => b.c === 'P1'), 'ο τραυματίας δεν έχει γραμμές');
  assert.ok(bz.ev > 0.08 && R.value.includes(bz));
  // χωρίς την απουσία ο Brizuela είναι κοντά στη γραμμή: λιγότερο EV
  const R0 = gameProps({ h: 'PAN', a: 'BAR', books }, { players, fx: fx.map(x => ({ ...x, status: 'playing' })), inj: {}, teamGames, jur: 'gr', priors: leaguePriors(players) });
  assert.ok(R0.best.find(b => b.c === 'P2' && b.side === 'over').ev < bz.ev);
});

test('πλαίσιο αγώνα: περισσότεροι προβλεπόμενοι πόντοι ομάδας → πιο ψηλά οι πόντοι, όχι τα ριμπάουντ', () => {
  const row = (r, pts, reb) => { const x = Array(26).fill(0); x[0] = r; x[4] = 80; x[7] = 1500; x[8] = pts; x[15] = 1; x[16] = reb - 1; return x; };
  const rows = [row(1, 12, 5), row(2, 14, 6), row(3, 10, 4), row(4, 12, 5)];
  const b = project(rows, 'pts', { prior: 0.4 }), up = project(rows, 'pts', { prior: 0.4, teamPts: 90 }), dn = project(rows, 'pts', { prior: 0.4, teamPts: 70 });
  assert.ok(up.mu > b.mu && dn.mu < b.mu);
  assert.ok(up.mu / b.mu <= Math.sqrt(1.15) + 1e-9);   // όριο ±15% στον λόγο
  assert.equal(project(rows, 'reb', { prior: 0.2, teamPts: 90 }).mu, project(rows, 'reb', { prior: 0.2 }).mu);
});
