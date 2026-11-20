import test from 'node:test';
import assert from 'node:assert/strict';
import { targetFor } from '../scripts/gone-redirects.mjs';

const live = new Set(['/', '/en/', '/en/game/', '/en/game/partizan-baskonia-11/', '/en/player/', '/en/player/dwayne-bacon/', '/paiktis/kevin-punter/', '/sr/utakmica/olimpijakos-dubai-11/', '/en/matchup/', '/es/eurocup/riga-zelli/']);
test('προεπισκόπηση αγώνα → σελίδα αγώνα', () => {
  assert.equal(targetFor('/en/articles/preview-partizan-baskonia-11/', live), '/en/game/partizan-baskonia-11/');
  assert.equal(targetFor('/sr/clanci/analiza-olimpijakos-dubai-11/', live), '/sr/utakmica/olimpijakos-dubai-11/');
});
test('σύγκριση → σελίδα παίκτη', () => {
  assert.equal(targetFor('/en/compare/players/dwayne-bacon-vs-shavon-shields/', live), '/en/player/dwayne-bacon/');
  assert.equal(targetFor('/sygkrisi/paiktes/kevin-punter-vs-tyler-dorsey/', live), '/paiktis/kevin-punter/');
});
test('αλλιώς ο πλησιέστερος γονέας ή η αρχική της γλώσσας', () => {
  assert.equal(targetFor('/en/matchup/eurocup-trn-bur-7/', live), '/en/matchup/');
  assert.equal(targetFor('/es/eurocup/riga-zelli/isaac-johnson/', live), '/es/eurocup/riga-zelli/');
  assert.equal(targetFor('/app/', live), '/');
});
