// Intelligence Engine, Φάση 7: HTML προφίλ παίκτη και σελίδας ακρίβειας.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playerProjectionSection, perfPageMain, qualityLabel } from '../src/engine/ui.mjs';

const LANGS = ['el', 'en', 'es', 'sr', 'tr'];
const Tof = lg => (...a) => a[LANGS.indexOf(lg)];
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const st = (m, sd, over) => ({ mean: m, sd, median: Math.round(m), over });
const X = { player_id: '1', opp_id: 'PAN', home: 1, quality: 'ok', minutes: { p_play: 0.97, if_plays: 28.2, expected: 27.3 }, pir: { mean: 21.9 },
  stats: { pts: st(20.2, 8.3, { '10.5': 0.9, '20.5': 0.44 }), reb: st(6.3, 2.8, { '4.5': 0.71 }), ast: st(1.1, 1.1, { '5.5': 0.0015 }), fg3: st(2, 1.6, { '1.5': 0.56 }) } };

test('προφίλ παίκτη: όλες οι γλώσσες, τιμές, σκάλα, ποιότητα, σύνδεσμοι', () => {
  for (const lg of LANGS) {
    const h = playerProjectionSection(X, { file: { round: 14 }, T: Tof(lg), esc, tName: t => t, LOC: lg === 'en' ? 'en-GB' : 'el-GR', perfUrl: '/perf/', analyzerUrl: '/pa/#p=x' });
    assert.match(h, /class="career engproj"/);
    assert.match(h, /97%/);
    assert.match(h, /44%/);
    assert.match(h, /&lt;1%/, 'πολύ μικρή πιθανότητα = <1%, όχι 0%');
    assert.match(h, /href="\/perf\/"/);
    assert.doesNotMatch(h, /undefined|NaN/);
  }
  assert.equal(playerProjectionSection({ ...X, quality: 'insufficient', stats: null }, { file: {}, T: Tof('el'), esc, tName: t => t, perfUrl: '' }), '');
  assert.equal(playerProjectionSection(undefined, { file: {}, T: Tof('el'), esc, tName: t => t, perfUrl: '' }), '');
  assert.equal(qualityLabel('out', Tof('en'))[0], 'Not expected to play');
});

test('σελίδα ακρίβειας: χωρίς αποτελέσματα ακόμα, με αποτελέσματα, πύλη', () => {
  const summary = { stats: { n: 37391, ...Object.fromEntries(['pts', 'reb', 'ast', 'fg3'].map(s => [s, Object.fromEntries(['engine', 'props_ew', 'season_mean', 'last5', 'last10'].map((m, i) => [m, { mae: 1 + i / 10 }]))])) },
    minutes: { expected: { hurdle: 5.588, last10: 5.997 }, if_plays: { hurdle: 4.599, last10: 4.699 } }, pir: { engine: 4.505, last10: 4.643 } };
  const gate = { open: false, evidence: { games: 20, brier: { engine: 0.2424, market: 0.2439, blend: 0.2407 } } };
  for (const lg of LANGS) {
    const h = perfPageMain({ live: null, summary, gate, file: { version: 'engine-proj-1', models: { minutes: { version: 'min-hurdle-x2' }, stats: 'engine-stats-x1' } }, T: Tof(lg), esc, LOC: 'el-GR' });
    assert.doesNotMatch(h, /undefined|NaN/);
    assert.match(h, /engine-stats-x1/);
  }
  const R = s => ({ engine_median: { mae: 3.9 }, season_mean: { mae: 4.1 }, last5: { mae: 4.3 }, last10: { mae: 4.2 } });
  const live = { n_predictions: 280, n_played: 215, rounds: [14], sample_note: 'x', minutes: { expected: { n: 280, mae: 5.2 } }, pir: { if_plays: { n: 215, mae: 5.1 } }, stats: { pts: R(), reb: R(), ast: R(), fg3: R() } };
  const h = perfPageMain({ live, summary, gate, file: {}, T: Tof('en'), esc, LOC: 'en-GB' });
  assert.match(h, /Small sample/);
  assert.match(h, /<td class="pos">3\.900<\/td>/, 'το καλύτερο σημειώνεται');
  assert.match(h, /On hold/);
});
