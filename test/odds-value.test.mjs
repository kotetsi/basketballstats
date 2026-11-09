// EuroLeague Odds & Value Bets (Ελλάδα): μητρώο, φίλτρο ελληνικών feeds, EV, διαφορές τιμών, παλιές τιμές, αξιοπιστία.
// Χρησιμοποιεί πραγματικό απόσπασμα του data/odds/latest.json (OddsPapi, 9/11/2026): test/fixtures/odds-latest-sample.json
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { confirmedFeeds, applyGrRegistry, registryStatus, modelProb, fairOdds, evPct, valueBoard, reliability } from '../src/odds/value.mjs';
import { jurisdictions } from '../scripts/odds.mjs';

const REG = JSON.parse(fs.readFileSync(new URL('../data/odds/bookmakers-gr.json', import.meta.url)));
const LIC = JSON.parse(fs.readFileSync(new URL('../data/odds/licensed.json', import.meta.url)));
const sample = () => JSON.parse(fs.readFileSync(new URL('./fixtures/odds-latest-sample.json', import.meta.url)));
const NOW = Date.parse('2026-11-09T18:00:00Z');
const pred = (r, h, a, p_home, margin, total, t, conf = 'high') => ({ comp: 'E', r, h, a, p_home, margin, total, t, conf });

test('μητρώο: όλες οι 15 μάρκες, κανένας αριθμός άδειας από υπόθεση, μόνο ακριβή .gr feeds επιβεβαιωμένα', () => {
  assert.equal(Object.keys(REG.brands).length, 15);
  for (const b of Object.values(REG.brands)) {
    assert.match(b.domain, /\.gr$/);
    assert.ok(['confirmed', 'unconfirmed', 'none'].includes(b.greek_prices));
    if (b.license_no == null) assert.equal(b.license_status, 'unverified');
    if (b.greek_prices !== 'confirmed') assert.deepEqual(b.feeds, []);
  }
  assert.deepEqual([...confirmedFeeds(REG).keys()].sort(), ['bet365.gr', 'pamestoixima.gr', 'stoiximan']);
});

test('πραγματικά δεδομένα: το γενικό bet365 έχει άλλες τιμές από το bet365 GR (γι’ αυτό δεν μετράει)', () => {
  const B = sample().games['E-11-MAD-RED'].books;
  assert.notDeepEqual(B.bet365.ml, B['bet365.gr'].ml);
});

test('ingestion: «gr» μόνο για επιβεβαιωμένα ελληνικά feeds· bet365 NJ ποτέ ευρωπαϊκό', () => {
  assert.deepEqual(jurisdictions('stoiximan', 'Stoiximan', LIC, REG), ['gr']);
  assert.deepEqual(jurisdictions('bet365.gr', 'bet365 GR', LIC, REG), ['gr']);
  assert.ok(!jurisdictions('bet365', 'bet365', LIC, REG).includes('gr'));
  assert.deepEqual(jurisdictions('bet365-nj', 'bet365 NJ', LIC, REG), []);
  for (const k of ['superbet', 'betsson', 'bwin', 'sportingbet', 'fonbet', 'netbet']) assert.ok(!jurisdictions(k, k, LIC, REG).includes('gr'), k);
});

test('build: το μητρώο ορίζει την άδεια «gr» και στα ήδη αποθηκευμένα δεδομένα', () => {
  const L = applyGrRegistry(sample(), REG), B = L.games['E-11-MAD-RED'].books;
  assert.ok(B.stoiximan.lic.includes('gr') && B['bet365.gr'].lic.includes('gr'));
  for (const k of ['bet365', 'bet365-nj', 'superbet', 'betsson']) assert.ok(!B[k].lic.includes('gr'), k);
  assert.ok(B.bet365.lic.includes('uk'), 'οι άλλες χώρες μένουν ως είχαν');
});

test('κατάσταση δεδομένων ανά μάρκα', () => {
  const S = Object.fromEntries(registryStatus(REG, sample(), NOW).map(b => [b.key, b.data_status]));
  assert.equal(S.stoiximan, 'available'); assert.equal(S.bet365, 'available');
  assert.equal(S.pamestoixima, 'no_current_odds');
  assert.equal(S.superbet, 'excluded_unconfirmed'); assert.equal(S.novibet, 'no_feed');
});

test('τύποι: δίκαιη απόδοση, EV%, πιθανότητες χάντικαπ/συνόλου', () => {
  assert.equal(fairOdds(0.5), 2); assert.equal(fairOdds(0), null);
  assert.ok(Math.abs(evPct(0.6, 1.9) - 14) < 1e-9);
  assert.equal(evPct(null, 1.9), null); assert.equal(evPct(0.6, null), null);
  const [h] = modelProb({ margin: 6.5 }, 'spread', -6.5, { margin: 12 }); assert.ok(Math.abs(h - 0.5) < 1e-6);
  const [o] = modelProb({ total: 170 }, 'total', 160.5, { total: 17 }); assert.ok(o > 0.65);
  assert.equal(modelProb(null, 'ml'), null);
});

test('πίνακας: μόνο ελληνικά feeds, καλύτερη τιμή, EV μοντέλου, διαφορά τιμών χωριστά', () => {
  const L = sample();
  const B = valueBoard({ games: [pred(11, 'MAD', 'RED', 0.6, 4, 165, '2026-11-12T20:00:00Z')], latest: L, reg: REG, sig: { margin: 12.5, total: 17.5 }, now: NOW });
  assert.equal(B.length, 1);
  const ml = B[0].markets.ml[0];
  assert.deepEqual(ml.rows.map(r => r.brand).sort(), ['bet365', 'stoiximan']);
  assert.ok(ml.rows.every(r => /\.gr$/.test(r.domain)));
  // καλύτερη τιμή φιλοξενούμενου: 3.1 (bet365 GR) — όχι 3.25 του γενικού Betsson
  assert.equal(ml.sel[1].best.price, 3.1); assert.equal(ml.sel[1].best.brand, 'bet365');
  assert.ok(Math.abs(ml.sel[1].ev - 100 * (0.4 * 3.1 - 1)) < 1e-3);
  assert.equal(ml.sel[1].fair, 2.5);
  assert.ok(ml.sel[1].disc != null && ml.sel[1].disc !== ml.sel[1].ev, 'διαφορά τιμής ≠ EV μοντέλου');
  assert.deepEqual(B[0].missing, ['pamestoixima']);
});

test('χωρίς μοντέλο: τιμές ναι, EV όχι· χωρίς αποδόσεις: αγώνας χωρίς τιμές', () => {
  const B = valueBoard({ games: [{ comp: 'E', r: 11, h: 'MAD', a: 'RED', t: '2026-11-12T20:00:00Z' }, pred(11, 'PAN', 'BAR', 0.55, 2, 160, '2026-11-13T19:15:00Z')], latest: sample(), reg: REG, now: NOW });
  const mad = B.find(g => g.h === 'MAD'), pan = B.find(g => g.h === 'PAN');
  assert.equal(mad.hasPred, false); assert.ok(mad.markets.ml[0].sel.every(s => s.ev == null && s.model == null)); assert.deepEqual(mad.value, []);
  assert.deepEqual(pan.markets.ml, []);
});

test('ποτέ παλιές τιμές ως τρέχουσες: λήψη > 12 ώρες → χωρίς EV· αγώνας που ξεκίνησε → εκτός', () => {
  const late = valueBoard({ games: [pred(11, 'MAD', 'RED', 0.6, 4, 165, '2026-11-12T20:00:00Z')], latest: sample(), reg: REG, now: Date.parse('2026-11-10T12:00:00Z') });
  assert.equal(late[0].stale, true); assert.ok(late[0].markets.ml[0].sel.every(s => s.ev == null && s.disc == null));
  const started = valueBoard({ games: [pred(11, 'MAD', 'RED', 0.6, 4, 165, '2026-11-12T20:00:00Z')], latest: sample(), reg: REG, now: Date.parse('2026-11-12T20:01:00Z') });
  assert.equal(started.length, 0);
});

test('σήμανση: μεγάλη διαφωνία με την αγορά και χαμηλή βεβαιότητα (πραγματικό: Παρτίζαν – Φενέρμπαχτσε)', () => {
  const B = valueBoard({ games: [pred(11, 'PRS', 'ULK', 0.44, -1.4, 160, '2026-11-11T19:45:00Z', 'low')], latest: sample(), reg: REG, sig: { margin: 12.5 }, now: NOW });
  const s = B[0].markets.ml[0].sel[0];
  assert.ok(s.ev > 30); assert.ok(s.flags.includes('gap')); assert.ok(s.flags.includes('low_conf'));
});

test('αξιοπιστία: «υπό αξιολόγηση» μέχρι να υπάρχει αρκετό θετικό CLV', () => {
  const bt = { summary: { n: 1207, ece: 0.035, brier: 0.22 } };
  assert.equal(reliability(bt, { all: { n: 7, mean: 8 } }).status, 'evaluating');
  assert.equal(reliability(bt, { all: { n: 150, mean: -1 } }).status, 'evaluating');
  assert.equal(reliability(bt, { all: { n: 150, mean: 1.2 } }).status, 'reliable');
  assert.equal(reliability({ summary: { n: 1207, ece: 0.08 } }, { all: { n: 150, mean: 1.2 } }).status, 'evaluating');
  assert.equal(reliability(null, null).status, 'evaluating');
});
