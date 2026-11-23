import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPrune } from '../scripts/seo-prune.mjs';

const keep = new Set(['/sr/igrac/marko-guduric/']);

test('ενότητες που φεύγουν από το Google', () => {
  for (const u of ['/sygkrisi/omades/olympiakos-vs-panathinaikos/', '/en/compare/players/a-vs-b/', '/es/comparar/equipos/eurocup/x-vs-y/',
    '/eurocup/maxima-roma/', '/en/eurocup/riga-zelli/toms-skuja/', '/lineups/barcelona/', '/tr/besliler/asvel/', '/en/matchup/eurocup-rtk-lju-7/',
    '/sr/igrac/nicolo-melli/', '/sr/utakmica/asvel-partizan-8/', '/tr/oyuncu/tj-shorts/', '/tr/mac/asvel-besiktas-12/'])
    assert.equal(shouldPrune(u, keep), true, u);
});

test('κεντρικές σελίδες, εξαιρέσεις και ό,τι άλλο μένουν', () => {
  for (const u of ['/', '/sygkrisi/', '/en/compare/', '/eurocup/', '/en/eurocup/', '/matchup/', '/en/lineups/',
    '/eurocup/aris-thessaloniki/', '/en/eurocup/paok-thessaloniki/', '/sr/igrac/marko-guduric/',
    '/en/player/nicolo-melli/', '/es/jugador/chima-moneke/', '/paiktis/thomas-walkup/', '/agonas/olympiakos-ntoumpai-11/',
    '/en/game/panathinaikos-barcelona-11/', '/sr/fantasy/', '/tr/sakatlik-raporu/', '/sr/eurocup/'])
    assert.equal(shouldPrune(u, keep), false, u);
});
