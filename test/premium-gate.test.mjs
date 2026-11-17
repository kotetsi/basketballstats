import test from 'node:test';
import assert from 'node:assert/strict';
import { requirePremium } from '../src/account/premium-gate.mjs';

function globals({ token = 'session-token', status = { premium: false, status: 'free' }, billing = true, checkoutUrl } = {}) {
  const old = Object.fromEntries(['document', 'localStorage', 'fetch', 'location'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const calls = [];
  const actions = [];
  const location = { assigned: null, assign(url) { this.assigned = url; }, reload() {} };
  const root = {
    hidden: false, innerHTML: '', listeners: [],
    querySelectorAll: () => actions,
    querySelector: () => null,
  };
  globalThis.document = {
    documentElement: { lang: 'el' },
    getElementById: id => id === 'acctx' ? { textContent: JSON.stringify({ api: 'https://account.example' }) } : null,
    querySelector: () => null,
    createElement: () => ({ setAttribute() {}, textContent: '' }),
  };
  globalThis.localStorage = { getItem: key => key === 'bsacc' ? token : null };
  globalThis.location = location;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/config')) return Response.json({ billing });
    if (String(url).endsWith('/billing/status')) return Response.json(status);
    if (String(url).endsWith('/billing/checkout')) return Response.json({ url: checkoutUrl || 'https://pay.paddle.com/checkout/sandbox' });
    if (String(url).endsWith('/billing/portal')) return Response.json({ url: 'https://customer-portal.paddle.com/session' });
    throw new Error('unexpected request');
  };
  return {
    old, calls, actions, location, root,
    restore() {
      for (const key of Object.keys(old)) {
        if (old[key]) Object.defineProperty(globalThis, key, old[key]);
        else delete globalThis[key];
      }
    },
  };
}

test('active server entitlement reveals Premium tool and its related panel', async () => {
  const g = globals({ status: { premium: true, status: 'active' } });
  try {
    const related = { hidden: false };
    assert.equal(await requirePremium(g.root, [related]), true);
    assert.equal(g.root.hidden, false);
    assert.equal(related.hidden, false);
    assert.deepEqual(g.calls.map(x => x.url), ['https://account.example/config', 'https://account.example/billing/status']);
  } finally { g.restore(); }
});

test('failed payment hides the paid tool and states that access is paused', async () => {
  const g = globals({ status: { premium: false, status: 'past_due' } });
  try {
    const related = { hidden: false };
    assert.equal(await requirePremium(g.root, [related]), false);
    assert.equal(g.root.hidden, false, 'the paywall itself is visible');
    assert.equal(related.hidden, true, 'the paid data panel stays hidden');
    assert.match(g.root.innerHTML, /Η πληρωμή απέτυχε/);
    assert.match(g.root.innerHTML, /Η Premium πρόσβαση έχει διακοπεί/);
  } finally { g.restore(); }
});

test('free account can start only the server-configured checkout', async () => {
  const g = globals({ status: { premium: false, status: 'free' } });
  const action = { dataset: { premiumAction: 'checkout' }, listener: null, addEventListener(_name, fn) { this.listener = fn; } };
  g.actions.push(action);
  try {
    assert.equal(await requirePremium(g.root), false);
    await action.listener({ currentTarget: action });
    assert.equal(g.location.assigned, 'https://pay.paddle.com/checkout/sandbox');
    const request = g.calls.find(x => x.url.endsWith('/billing/checkout'));
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.headers.authorization, 'Bearer session-token');
  } finally { g.restore(); }
});
