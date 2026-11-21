// Δημόσιες ειδοποιήσεις push (χωρίς λογαριασμό): νέο pick tipster, νέος τραυματίας της ομάδας, τελικό σκορ της ομάδας.
// Οι συνδρομές και οι επιλογές είναι στη βάση του worker (push_subs με user_id 'pub' ή χρήστη + pub_prefs).
// Τρέχει στο GitHub Actions μαζί με τις ειδοποιήσεις λογαριασμών (account-alerts.yml).
//   Κάθε «γεγονός» στέλνεται μόνο σε όσους είχαν γραφτεί πριν εμφανιστεί (config.pub_seen)· την πρώτη φορά
//   απλώς καταγράφονται όσα υπάρχουν ήδη, χωρίς αποστολή. Το πολύ 3 ειδοποιήσεις ανά συνδρομή ανά εκτέλεση.
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID · ALERTS_DRY=1 μόνο εμφάνιση
import crypto from 'node:crypto';

const SITE = process.env.SITE || 'https://basketballstats.eu';
const clean = v => String(v || '').replace(/[\s"']/g, '');
const tok = s => { s = String(s || ''); const b = /Bearer\s+([A-Za-z0-9_-]+)/.exec(s); return b ? b[1] : (s.match(/[A-Za-z0-9_-]+/g) || []).sort((a, c) => c.length - a.length)[0] || ''; };
const CF = tok(process.env.CLOUDFLARE_API_TOKEN), ACC = clean(process.env.CLOUDFLARE_ACCOUNT_ID), DRY = process.env.ALERTS_DRY === '1';

export const LANGS = ['el', 'en', 'es', 'sr', 'tr'];
const PRE = { el: '', en: '/en', es: '/es', sr: '/sr', tr: '/tr' };
const GAME = { el: 'agonas', en: 'game', es: 'partido', sr: 'utakmica', tr: 'mac' };
const PLAYER = { el: 'paiktis', en: 'player', es: 'jugador', sr: 'igrac', tr: 'oyuncu' };
const TX = {
  el: { pick: (n, g, l, o) => `🎯 Νέο pick από τον ${n}: ${g} · ${l}${o ? ` @${o}` : ''}`, inj: (t, p, x) => `🚑 ${t}: ${p} — ${x}`, fin: (h, hs, as, a) => `🏁 Τελικό: ${h} ${hs}–${as} ${a}` },
  en: { pick: (n, g, l, o) => `🎯 New pick from ${n}: ${g} · ${l}${o ? ` @${o}` : ''}`, inj: (t, p, x) => `🚑 ${t}: ${p} — ${x}`, fin: (h, hs, as, a) => `🏁 Final: ${h} ${hs}–${as} ${a}` },
  es: { pick: (n, g, l, o) => `🎯 Nuevo pronóstico de ${n}: ${g} · ${l}${o ? ` @${o}` : ''}`, inj: (t, p, x) => `🚑 ${t}: ${p} — ${x}`, fin: (h, hs, as, a) => `🏁 Final: ${h} ${hs}–${as} ${a}` },
  sr: { pick: (n, g, l, o) => `🎯 Novi tip od ${n}: ${g} · ${l}${o ? ` @${o}` : ''}`, inj: (t, p, x) => `🚑 ${t}: ${p} — ${x}`, fin: (h, hs, as, a) => `🏁 Kraj: ${h} ${hs}–${as} ${a}` },
  tr: { pick: (n, g, l, o) => `🎯 ${n} yeni tahmin: ${g} · ${l}${o ? ` @${o}` : ''}`, inj: (t, p, x) => `🚑 ${t}: ${p} — ${x}`, fin: (h, hs, as, a) => `🏁 Maç sonu: ${h} ${hs}–${as} ${a}` },
};
const nice = n => { const [s, f] = String(n || '').split(', '); return [f, s].filter(Boolean).map(w => w.toLowerCase().replace(/(^|[\s-])\S/g, m => m.toUpperCase())).join(' '); };

/**
 * Όλα τα τρέχοντα γεγονότα από το assets/data.json του site, ανά γλώσσα.
 * Επιστρέφει [{ key, kind: 'pick'|'inj'|'fin', team: [κωδικοί που αφορά] | null, txt: {lang: {text, url}} }]
 */
export function publicEvents(D, site = SITE) {
  const out = [], tn = (c, lg) => { const t = D.teams?.[c]; if (!t) return c; const i = LANGS.indexOf(lg); return (i ? t[1 + 2 * i] : t[0]) || t[0]; };
  const ts = (c, lg) => { const t = D.teams?.[c]; if (!t) return c.toLowerCase(); const i = LANGS.indexOf(lg); return (i ? t[2 + 2 * i] : t[2]) || t[2]; };
  const byC = Object.fromEntries((D.players || []).map(p => [p.c, p]));
  const L = lg => (lg === 'el' ? D : D[lg] || {});
  // picks (εκκρεμή): ένα γεγονός ανά pick
  const picks = {};
  for (const lg of LANGS) for (const x of L(lg).tips || []) {
    const [h, a] = String(x.g).split('-'), key = `pick:${x.s}:${x.r}:${x.g}:${(D.tips || []).find(y => y.s === x.s && y.r === x.r && y.g === x.g)?.l || x.l}`;
    const e = picks[key] ||= { key, kind: 'pick', team: null, txt: {} };
    e.txt[lg] = { text: TX[lg].pick(x.n, `${tn(h, lg)} – ${tn(a, lg)}`, x.l, x.o ? Number(x.o).toFixed(2) : ''), url: new URL(x.u || '/', site).href };
  }
  out.push(...Object.values(picks));
  // τραυματίες / απόντες (m = 1): ένα γεγονός ανά παίκτη και ημερομηνία είδησης
  for (const [c, v] of Object.entries(D.inj || {})) {
    const p = byC[c]; if (!p || v.m !== 1) continue;
    const t = String(p.t).split(';').pop(), e = { key: `inj:${c}:${v.d || ''}`, kind: 'inj', team: [t], txt: {} };
    for (const lg of LANGS) { const w = (L(lg).inj || {})[c] || v; e.txt[lg] = { text: TX[lg].inj(tn(t, lg), nice(p.n), String(w.t || '').slice(0, 140)), url: `${site}${PRE[lg]}/${PLAYER[lg]}/${p.s}/` }; }
    out.push(e);
  }
  // τελικά σκορ (αγώνες που έχουν τελειώσει)
  for (const g of D.league?.games || []) {
    if (!g[6]) continue;
    const [r, , h, a, hs, as] = g, e = { key: `fin:${r}:${h}-${a}`, kind: 'fin', team: [h, a], txt: {} };
    for (const lg of LANGS) e.txt[lg] = { text: TX[lg].fin(tn(h, lg), hs, as, tn(a, lg)), url: `${site}${PRE[lg]}/${GAME[lg]}/${ts(h, lg)}-${ts(a, lg)}-${r}/` };
    out.push(e);
  }
  return out;
}
/** ταιριάζει ένα γεγονός με τις επιλογές μιας συνδρομής; topics = { p, t, i, s } */
export const wants = (e, tp) => e.kind === 'pick' ? !!tp.p : !!tp.t && (e.team || []).includes(tp.t) && (e.kind === 'inj' ? !!tp.i : !!tp.s);

// ------------------------------------------------------------------ εκτέλεση (μόνο όταν τρέχει ως script)
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!CF || !ACC) { console.log('Δημόσιες ειδοποιήσεις: δεν έχει οριστεί λογαριασμός Cloudflare, παράλειψη.'); process.exit(0); }
  const api = async (p, init = {}) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}${p}`, { ...init, headers: { authorization: `Bearer ${CF}`, 'content-type': 'application/json', ...(init.headers || {}) } });
    const j = await r.json(); if (!j.success) throw new Error(`Cloudflare ${p}: ${JSON.stringify(j.errors).slice(0, 200)}`); return j.result;
  };
  const DB = (await api('/d1/database?name=bs-account')).find(d => d.name === 'bs-account');
  if (!DB) { console.log('Δημόσιες ειδοποιήσεις: δεν υπάρχει η βάση bs-account, παράλειψη.'); process.exit(0); }
  const q = async (sql, params = []) => (await api(`/d1/database/${DB.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql, params }) }))[0].results;
  const sec = Math.floor(Date.now() / 1000);
  await q('CREATE TABLE IF NOT EXISTS pub_prefs (sub_id INTEGER PRIMARY KEY, lang TEXT NOT NULL, topics TEXT NOT NULL, created INTEGER NOT NULL)');
  const D = await fetch(`${SITE}/assets/data.json?t=${Date.now()}`).then(r => r.json());
  const E = publicEvents(D);
  const seenRow = (await q("SELECT v FROM config WHERE k = 'pub_seen'"))[0], first = !seenRow, seen = seenRow ? JSON.parse(seenRow.v) : {};
  for (const e of E) if (!(e.key in seen)) seen[e.key] = sec;
  const now = new Set(E.map(e => e.key));   // κρατάμε όσα υπάρχουν ακόμα (αλλιώς θα ξαναφαίνονταν «νέα»)· τα υπόλοιπα σβήνουν μετά από 30 ημέρες
  for (const [k, t] of Object.entries(seen)) if (!now.has(k) && t < sec - 30 * 86400) delete seen[k];
  if (first) console.log(`Δημόσιες ειδοποιήσεις: πρώτη εκτέλεση, καταγράφηκαν ${E.length} υπάρχοντα γεγονότα χωρίς αποστολή.`);
  const subs = first ? [] : await q('SELECT ps.id, ps.endpoint, pp.lang, pp.topics, pp.created FROM push_subs ps JOIN pub_prefs pp ON pp.sub_id = ps.id');
  const sent = new Set((await q("SELECT user_id, key FROM sent WHERE user_id LIKE 'pub:%' AND ts > ?", [sec - 60 * 86400])).map(r => r.user_id + ' ' + r.key));
  const vrow = (await q("SELECT v FROM config WHERE k = 'vapid'"))[0], VP = vrow ? JSON.parse(vrow.v) : null, vkey = VP ? crypto.createPrivateKey({ key: VP.jwk, format: 'jwk' }) : null;
  const b64u = b => Buffer.from(b).toString('base64url');
  const jwt = ep => { const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })), p = b64u(JSON.stringify({ aud: new URL(ep).origin, exp: sec + 12 * 3600, sub: SITE })); return `${h}.${p}.${b64u(crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key: vkey, dsaEncoding: 'ieee-p1363' }))}`; };
  let n = 0, failed = 0;
  for (const s of subs) {
    let tp = {}; try { tp = JSON.parse(s.topics); } catch { continue; }
    const uid = 'pub:' + s.id, lg = LANGS.includes(s.lang) ? s.lang : 'el';
    const todo = E.filter(e => seen[e.key] >= s.created && wants(e, tp) && !sent.has(uid + ' ' + e.key)).slice(0, 3);
    for (const e of todo) {
      const m = e.txt[lg] || e.txt.el;
      if (DRY || !VP) { console.log(`[δοκιμή] ${uid} ${e.key}: ${m.text}`); continue; }
      try {
        await q('INSERT INTO push_queue (sub_id, text, url, created) VALUES (?, ?, ?, ?)', [s.id, m.text, m.url, sec]);
        const r = await fetch(s.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: e.kind === 'fin' ? 'normal' : 'high', Authorization: `vapid t=${jwt(s.endpoint)}, k=${VP.pub}`, 'Content-Length': '0' } });
        if (r.status === 404 || r.status === 410) { await q('DELETE FROM push_queue WHERE sub_id = ?', [s.id]); await q('DELETE FROM pub_prefs WHERE sub_id = ?', [s.id]); await q("DELETE FROM push_subs WHERE id = ? AND user_id = 'pub'", [s.id]); break; }
        if (!r.ok) throw new Error('push ' + r.status);
        await q('INSERT OR IGNORE INTO sent (user_id, key, ts) VALUES (?, ?, ?)', [uid, e.key, sec]); n++;
      } catch (err) { console.error('Δημόσια ειδοποίηση:', err.message); failed++; }
    }
  }
  if (!DRY) await q("INSERT OR REPLACE INTO config (k, v) VALUES ('pub_seen', ?)", [JSON.stringify(seen)]);
  console.log(`Δημόσιες ειδοποιήσεις: ${subs.length} συνδρομές, ${E.length} γεγονότα, ${n} αποστολές${failed ? `, ${failed} αποτυχίες` : ''}.`);
  if (failed) process.exitCode = 1;
}
