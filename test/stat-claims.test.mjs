import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streakNote, activeStreak } from '../scripts/stat-claims.mjs';

test('streakNote: «ούτε s-1» μόνο όταν κανείς δεν έχει s-1 ή περισσότερα', () => {
  // η περίπτωση της 26/11: Τζόουνς 3, Walker IV και Ράιτ 2
  assert.equal(streakNote(3, [2, 2, 1, 0]), 'Κανείς άλλος στην EuroLeague δεν έχει αυτή τη στιγμή σερί 3 αγώνων.');
  assert.equal(streakNote(3, [1, 0, 1]), 'Κανείς άλλος στην EuroLeague δεν έχει αυτή τη στιγμή σερί ούτε 2 αγώνων.');
  assert.equal(streakNote(4, [3, 1]), 'Κανείς άλλος στην EuroLeague δεν έχει αυτή τη στιγμή σερί 4 αγώνων.');
  assert.equal(streakNote(3, [3, 0]), 'Μόνο ένας ακόμα παίκτης έχει τόσο μεγάλο ενεργό σερί.');
  assert.equal(streakNote(3, [3, 3]), 'Μόνο 2 ακόμα παίκτες έχουν τόσο μεγάλο ενεργό σερί.');
  assert.equal(streakNote(3, [5, 3]), 'Μόνο ένας παίκτης έχει μεγαλύτερο ενεργό σερί.');
  assert.equal(streakNote(3, [5, 4, 2]), '2 παίκτες έχουν μεγαλύτερο ενεργό σερί.');
});

test('streakNote: η φράση ισχύει πάντα για τα δεδομένα', () => {
  for (let s = 3; s <= 7; s++) for (let n = 0; n < 300; n++) {
    const others = Array.from({ length: 6 }, () => Math.floor(Math.random() * 9));
    const t = streakNote(s, others), m = t.match(/ούτε (\d+)/), m2 = t.match(/σερί (\d+) αγώνων/);
    if (m) assert.ok(others.every(k => k < +m[1]), t + ' ' + others);
    else if (m2) assert.ok(others.every(k => k < +m2[1]), t + ' ' + others);
    else if (/τόσο μεγάλο/.test(t)) assert.ok(others.every(k => k <= s) && others.includes(s));
    else assert.ok(others.some(k => k > s));
  }
});

test('activeStreak', () => {
  const g = [[0, 25], [0, 10], [0, 21], [0, 22], [0, 20]].map(([a, p]) => ({ p }));
  assert.equal(activeStreak(g, x => x.p >= 20), 3);
  assert.equal(activeStreak([], x => x.p >= 20), 0);
});
