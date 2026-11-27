import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOdds } from '../src/nba/espn-odds.mjs';

test('parseOdds: κλείσιμο/άνοιγμα νικητή, χάντικαπ γηπεδούχου, σύνολο (ESPN BET)', () => {
  const j = { items: [{ provider: { id: '58', name: 'ESPN BET' }, overUnder: 228.5,
    homeTeamOdds: { moneyLine: 100, open: { moneyLine: { decimal: 1.588 } }, close: { moneyLine: { decimal: 2 }, pointSpread: { american: '+1.5' } } },
    awayTeamOdds: { moneyLine: -120, open: { moneyLine: { decimal: 2.45 } }, close: { moneyLine: { decimal: 1.833 } } } }] };
  assert.deepEqual(parseOdds(j), [2, 1.833, 1.588, 2.45, 1.5, 228.5]);
  assert.deepEqual(parseOdds({ items: [{ provider: { id: '1' }, homeTeamOdds: { moneyLine: -200 }, awayTeamOdds: { moneyLine: 170 } }] }), [1.5, 2.7, null, null, null, null], 'μόνο αμερικάνικες');
  assert.equal(parseOdds({ items: [] }), null);
});
