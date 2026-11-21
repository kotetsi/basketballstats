import test from 'node:test';
import assert from 'node:assert/strict';
import { saneTwoWay, saneMarkets } from '../scripts/odds.mjs';

test('saneTwoWay: κανονικές τιμές περνούν, «σκουπίδια» exchange απορρίπτονται', () => {
  assert.equal(saneTwoWay(1.91, 1.91), true);
  assert.equal(saneTwoWay(1.29, 3.4), true);
  assert.equal(saneTwoWay(2.02, 1.98), true);   // exchange με ρευστότητα (overround ~1,0)
  assert.equal(saneTwoWay(1.01, 1.01), false);  // Betfair Exchange χωρίς ρευστότητα
  assert.equal(saneTwoWay(1.52, 1.02), false);
  assert.equal(saneTwoWay(3.0, 3.0), false);    // άθροισμα αντίστροφων < 0,98: αδύνατο για έναν bookmaker
  assert.equal(saneTwoWay(null, 1.9), false);
});

test('saneMarkets: κρατά μόνο τις έγκυρες αγορές και αφήνει τα props', () => {
  const m = saneMarkets({ ml: [1.01, 1.01], spread: { line: -3.5, h: 1.9, a: 1.9 }, total: { line: 170.5, over: 1.02, under: 1.5 }, props: [{ stat: 'pts' }] });
  assert.deepEqual(Object.keys(m).sort(), ['props', 'spread']);
  assert.deepEqual(saneMarkets({ ml: [1.01, 1.01] }), {});
});
