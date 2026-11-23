import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyGuide, nextUnlimited, priceChange } from '../src/fantasy/guide.mjs';

const cal = { unlimited_after: [{ round: 13, from: '2026-11-21', to: '2026-11-24' }, { round: 18, from: '2026-12-19', to: '2026-12-22' }] };

test('επόμενο παράθυρο απεριόριστων αλλαγών', () => {
  assert.deepEqual(nextUnlimited(cal, '2026-11-23'), { before: 14, from: '2026-11-21', to: '2026-11-24', open: true });
  assert.deepEqual(nextUnlimited(cal, '2026-11-25'), { before: 19, from: '2026-12-19', to: '2026-12-22', open: false });
  assert.equal(nextUnlimited(cal, '2027-01-01'), null);
});

test('αλλαγή τιμής από το μοντέλο', () => {
  assert.equal(priceChange(20, 10, { slope: 0.036 }), 0.4);
  assert.equal(priceChange(5, 10, { slope: 0.036 }), -0.2);
});

test('ο οδηγός βγαίνει σε el/en, όχι στις άλλες γλώσσες', () => {
  const h = { esc: s => String(s), url: k => '/' + k + '/', name: c => c, team: t => t, slug: c => c.toLowerCase(), FXD: { round: 14, players: [] }, calendar: cal, priceModel: { slope: 0.036, dnp_ratio: -0.012, floor: 4 }, today: '2026-11-23', season: '2026-27' };
  for (const LG of ['el', 'en']) {
    const g = fantasyGuide({ ...h, LG });
    assert.ok(g.main.includes('id="faq"') && g.faq.length >= 8, LG);
    assert.ok(!/undefined|NaN/.test(g.main + JSON.stringify(g.faq)), LG);
  }
  assert.equal(fantasyGuide({ ...h, LG: 'es' }), null);
});
