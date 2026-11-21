// Δημόσιες ειδοποιήσεις (scripts/public-alerts.mjs): γεγονότα από το data.json και επιλογές συνδρομής
import test from 'node:test';
import assert from 'node:assert/strict';
import { publicEvents, wants } from '../scripts/public-alerts.mjs';

const teams = { OLY: ['Ολυμπιακός', '#c', 'olympiakos', 'Olympiacos', 'olympiacos', 'Olympiacos', 'olympiacos', 'Olimpijakos', 'olimpijakos', 'Olympiakos', 'olympiakos'], PAN: ['Παναθηναϊκός', '#0', 'panathinaikos', 'Panathinaikos', 'panathinaikos', 'Panathinaikos', 'panathinaikos', 'Panatinaikos', 'panatinaikos', 'Panathinaikos', 'panathinaikos'] };
const D = {
  teams, players: [{ c: '001', n: 'FOURNIER, EVAN', t: 'OLY', s: 'evan-fournier' }, { c: '002', n: 'NUNN, KENDRICK', t: 'MAD;PAN', s: 'kendrick-nunn' }],
  tips: [{ g: 'OLY-PAN', r: 14, n: 'High Fidelity', s: 'high-fidelity', l: 'Ολυμπιακός -3.5', u: '/tipsters/high-fidelity/', o: 1.85 }],
  inj: { '001': { m: 1, t: 'Τραυματίας: αστράγαλος', d: '2026-11-20' }, '002': { m: 0, t: 'Αμφίβολος', d: '2026-11-20' } },
  league: { games: [[13, 'x', 'OLY', 'PAN', 85, 79, 1], [14, 'y', 'PAN', 'OLY', 0, 0, 0]] },
  en: { tips: [{ g: 'OLY-PAN', r: 14, n: 'High Fidelity', s: 'high-fidelity', l: 'Olympiacos -3.5', u: '/en/tipsters/high-fidelity/', o: 1.85 }], inj: { '001': { m: 1, t: 'Injured: ankle', d: '2026-11-20' } } },
};

test('γεγονότα: pick, τραυματίας (μόνο εκτός), τελικό σκορ (μόνο αγώνες που τελείωσαν), σε κάθε γλώσσα', () => {
  const E = publicEvents(D, 'https://bs.test');
  assert.deepEqual(E.map(e => e.kind).sort(), ['fin', 'inj', 'pick']);
  const pick = E.find(e => e.kind === 'pick'), inj = E.find(e => e.kind === 'inj'), fin = E.find(e => e.kind === 'fin');
  assert.match(pick.txt.el.text, /High Fidelity: Ολυμπιακός – Παναθηναϊκός · Ολυμπιακός -3.5 @1.85/);
  assert.match(pick.txt.en.text, /Olympiacos – Panathinaikos · Olympiacos -3.5/); assert.equal(pick.txt.en.url, 'https://bs.test/en/tipsters/high-fidelity/');
  assert.equal(inj.txt.en.text, '🚑 Olympiacos: Evan Fournier — Injured: ankle'); assert.equal(inj.txt.tr.url, 'https://bs.test/tr/oyuncu/evan-fournier/');
  assert.equal(fin.txt.el.text, '🏁 Τελικό: Ολυμπιακός 85–79 Παναθηναϊκός'); assert.equal(fin.txt.sr.url, 'https://bs.test/sr/utakmica/olimpijakos-panatinaikos-13/');
  assert.equal(fin.key, 'fin:13:OLY-PAN');
});

test('επιλογές: picks για όλους όσοι τα θέλουν, τραυματίες/σκορ μόνο για την ομάδα που διάλεξαν', () => {
  const E = publicEvents(D), k = tp => E.filter(e => wants(e, tp)).map(e => e.kind).sort();
  assert.deepEqual(k({ p: 1 }), ['pick']);
  assert.deepEqual(k({ p: 0, t: 'PAN', i: 1, s: 1 }), ['fin']);
  assert.deepEqual(k({ p: 1, t: 'OLY', i: 1, s: 0 }), ['inj', 'pick']);
  assert.deepEqual(k({ p: 0, t: 'OLY', i: 0, s: 0 }), []);
});
