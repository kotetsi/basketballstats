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

const PF = new URL('../dist/assets/props/data.json', import.meta.url);
test('αποθηκευμένα props: αμφίβολος → ειδοποίηση· εκτίμηση μοντέλου μία φορά στις τελευταίες 30 ώρες· και χωρίς ομάδα Fantasy', { skip: !HAS || !fs.existsSync(PF) }, () => {
  const D = load(), PR = JSON.parse(fs.readFileSync(PF));
  const R = D.round;
  const ok = PR.players.filter(p => p.pj?.pts && PR.next[p.t]?.r === R && !p.out && p.st !== 'doubtful' && D.players.find(x => x.c === p.c)?.status === 'playing');
  const [a, b] = ok;
  const st = { teams: [], fav: [{ c: a.c, s: 'pts', l: 14.5, side: 'over' }, { c: b.c, s: 'reb', l: 4.5, side: 'under' }] };
  D.players.find(x => x.c === a.c).status = 'doubtful';
  const far = userAlerts(st, { ...D, deadline: new Date(NOW + 72 * 36e5).toISOString() }, [], { now: NOW, props: PR, base: 'https://x' });
  assert.deepEqual(far.map(x => x.key), [`${R}|fav|doubtful|${a.c}`]);
  assert.match(far[0].text, /αμφίβολος/); assert.match(far[0].url, /^https:\/\/x\/apodoseis\/prop-analyzer\/#p=/); assert.equal(far[0].go, 'Άνοιξε στο Prop Analyzer');
  const near = userAlerts(st, { ...D, deadline: new Date(NOW + 10 * 36e5).toISOString() }, [], { now: NOW, props: PR, prefs: { lang: 'en' } });
  assert.ok(near.some(x => x.key === `${R}|favm|${b.c}|reb` && /model projects/.test(x.text)));
  assert.deepEqual(userAlerts(st, D, [], { now: NOW, props: PR, prefs: { kinds: { fav: false } } }), []);
});
