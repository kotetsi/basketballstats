// Ειδοποιήσεις λογαριασμού (src/account/alerts.mjs) με πραγματικά δεδομένα του site (dist/ ή data/ αν δεν υπάρχει build)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { userAlerts, lineupFor, replacement } from '../src/account/alerts.mjs';
import { optimize } from '../src/fantasy/optimizer.mjs';

const F = new URL('../dist/api/fantasy/projections/latest.json', import.meta.url);
const HAS = fs.existsSync(F);
const load = () => JSON.parse(fs.readFileSync(F));
const NOW = Date.parse('2026-11-16T12:00:00Z');

function setup(D) {
  const o = optimize(D.players, D.coaches, { risk: 'ceiling' });
  const roster = o.roster.map(x => x.c ?? x);
  return { st: { teams: [{ roster, coach: o.coach?.t, captain: o.captain?.c ?? o.captain }], active: 0 }, roster };
}

test('τραυματίας βασικός → ειδοποίηση με αντικαταστάτη που χωράει στα credits, μία φορά ανά αγωνιστική', { skip: !HAS }, () => {
  const D = load(); const { st } = setup(D);
  const P = new Map(D.players.map(p => [p.c, p]));
  const lu = lineupFor(st.teams[0], P);
  const victim = lu.start.find(c => c !== lu.captain);
  P.get(victim).status = 'injured';
  const A = userAlerts(st, { ...D, deadline: new Date(NOW + 72 * 36e5).toISOString() }, [], { now: NOW, prefs: { lang: 'el' }, base: 'https://x' });
  const inj = A.filter(a => a.kind === 'injury');
  assert.equal(inj.length, 1);
  assert.equal(inj[0].key, `${D.round}|ruled_out|${victim}`);
  assert.match(inj[0].text, /εκτός/);
  assert.match(inj[0].text, /Πρόταση αντικατάστασης/);
  assert.equal(inj[0].url, 'https://x/fantasy/manager/');
  const rp = replacement(P.get(victim), st.teams[0].roster, D.players, 0);
  assert.ok(rp.price <= P.get(victim).price && rp.pos === P.get(victim).pos && !st.teams[0].roster.includes(rp.c));
});

test('αρχηγός εκτός → πρόταση νέου αρχηγού αμέσως', { skip: !HAS }, () => {
  const D = load(); const { st } = setup(D);
  const P = new Map(D.players.map(p => [p.c, p]));
  const lu = lineupFor(st.teams[0], P);
  st.teams[0].captain = lu.captain;
  P.get(lu.captain).status = 'doubtful';
  const A = userAlerts(st, { ...D, deadline: new Date(NOW + 72 * 36e5).toISOString() }, [], { now: NOW, prefs: { lang: 'en' } });
  assert.ok(A.some(a => a.kind === 'captain' && a.key.includes('capout')), JSON.stringify(A));
});

test('υπενθύμιση 3 ωρών, τίποτα μετά το κλείσιμο, σεβασμός ρυθμίσεων', { skip: !HAS }, () => {
  const D = load(); const { st } = setup(D);
  const soon = { ...D, deadline: new Date(NOW + 2 * 36e5).toISOString() };
  assert.ok(userAlerts(st, soon, [], { now: NOW }).some(a => a.kind === 'lock'));
  assert.ok(!userAlerts(st, soon, [], { now: NOW, prefs: { kinds: { lock: false } } }).some(a => a.kind === 'lock'));
  assert.deepEqual(userAlerts(st, { ...D, deadline: new Date(NOW - 36e5).toISOString() }, [], { now: NOW }), []);
  assert.ok(!userAlerts(st, { ...D, deadline: new Date(NOW + 72 * 36e5).toISOString() }, [], { now: NOW }).some(a => a.kind === 'lock' || a.kind === 'swap'));
});

test('ημιτελής ομάδα ή χωρίς ομάδα → καμία ειδοποίηση', { skip: !HAS }, () => {
  const D = load();
  assert.deepEqual(userAlerts({ teams: [{ roster: ['x'] }], active: 0 }, D, [], { now: NOW }), []);
  assert.deepEqual(userAlerts(null, D), []);
});
