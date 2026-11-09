// BasketballStats PRO στον browser: /pro, /checkout, /welcome-pro, /my-account.
// Κανένα PRO περιεχόμενο δεν υπάρχει σε αυτό το αρχείο ή στη σελίδα: όλα έρχονται από το PRO API, μόνο για ενεργό PRO.
const root = document.getElementById('proApp');
const CFG = JSON.parse(root.querySelector('script[type="application/json"]').textContent);
const API = CFG.api;
const page = root.dataset.page;
const $ = s => root.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const eur = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
const dt = s => (s ? new Date(s).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Athens' }) : '–');
const K = 'bs_pro_session';
const store = { get() { try { return localStorage.getItem(K); } catch { return null; } }, set(v) { try { v ? localStorage.setItem(K, v) : localStorage.removeItem(K); } catch { } } };

async function api(path, { method = 'GET', body } = {}) {
  const tok = store.get(), h = { 'content-type': 'application/json' };
  if (tok) h.authorization = `Bearer ${tok}`;
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) store.set(null);
  return { ok: r.ok, status: r.status, ...j };
}
const msg = (t, kind = '') => `<p class="promsg ${kind}" role="${kind === 'err' ? 'alert' : 'status'}">${t}</p>`;

if (!API) {
  // το PRO API δεν έχει ενεργοποιηθεί ακόμη: καμία ψεύτικη φόρμα πληρωμής
  root.querySelectorAll('[data-needs-api]').forEach(e => { e.hidden = true; });
  const n = $('.prooff'); if (n) n.hidden = false;
} else if (page === 'pro') {
  api('/v1/plans').then(r => { if (r.ok) for (const p of r.plans) { const c = root.querySelector(`[data-plan="${p.key}"]`); if (c && !p.available) c.hidden = true; } }).catch(() => { });
} else if (page === 'checkout') {
  const f = $('form.procheckout'), out = $('.proout');
  const want = new URLSearchParams(location.search).get('plan');
  if (want && f.querySelector(`input[value="${CSS.escape(want)}"]`)) f.querySelector(`input[value="${CSS.escape(want)}"]`).checked = true;
  if (new URLSearchParams(location.search).get('canceled')) out.innerHTML = msg('Η πληρωμή ακυρώθηκε. Δεν χρεώθηκες τίποτα.');
  api('/v1/plans').then(r => { if (r.ok) for (const p of r.plans) { const i = f.querySelector(`input[value="${p.key}"]`); if (i && !p.available) { i.disabled = true; i.closest('label').classList.add('prodis'); } } }).catch(() => { });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const plan = f.plan.value;
    if (!f.terms.checked || !f.waive.checked) { out.innerHTML = msg('Για να συνεχίσεις, τσέκαρε και τα δύο κουτάκια.', 'err'); return; }
    const b = f.querySelector('button'); b.disabled = true; out.innerHTML = msg('Μεταφορά στην ασφαλή σελίδα πληρωμής…');
    try {
      const r = await api('/v1/checkout', { method: 'POST', body: { plan, accept_terms: true, waive_withdrawal: true } });
      if (r.url) { location.href = r.url; return; }
      out.innerHTML = msg(r.error === 'already_pro' ? 'Είσαι ήδη PRO. <a href="/my-account/">Δες τον λογαριασμό σου</a>.' : 'Δεν ξεκίνησε η πληρωμή. Δοκίμασε ξανά σε λίγο.', 'err');
    } catch { out.innerHTML = msg('Πρόβλημα σύνδεσης. Δοκίμασε ξανά.', 'err'); }
    b.disabled = false;
  });
} else if (page === 'welcome') {
  const out = $('.proout'), cs = new URLSearchParams(location.search).get('cs');
  (async () => {
    if (!cs) { out.innerHTML = msg('Δεν βρέθηκε πληρωμή. <a href="/my-account/">Μπες στον λογαριασμό σου</a>.'); return; }
    out.innerHTML = msg('Επιβεβαιώνουμε την πληρωμή…');
    let r = null;
    for (let i = 0; i < 5; i++) { r = await api('/v1/checkout/claim', { method: 'POST', body: { session_id: cs } }).catch(() => null); if (r && r.status !== 402) break; await new Promise(z => setTimeout(z, 2000)); }
    if (r?.session) store.set(r.session);
    history.replaceState(null, '', location.pathname);
    if (!r || (!r.session && r.status !== 409)) { out.innerHTML = msg('Η πληρωμή δεν έχει επιβεβαιωθεί ακόμη. Θα λάβεις email μόλις ολοκληρωθεί· μετά μπες στο <a href="/my-account/">My Account</a>.', 'err'); return; }
    const me = await api('/v1/me');
    if (!me.ok) { out.innerHTML = msg('Η πληρωμή ολοκληρώθηκε. Σου στείλαμε email· μπες από το <a href="/my-account/">My Account</a> με το ίδιο email.'); return; }
    out.innerHTML = `<div class="probox ok"><h2>Είσαι PRO</h2><p>Πρόσβαση έως <b>${dt(me.subscription?.until)}</b>${me.subscription?.renews ? ' (ανανεώνεται αυτόματα)' : ''}.</p>
${me.telegram ? `<p><b>1.</b> Μπες στο ιδιωτικό PRO Telegram: εκεί έρχεται κάθε pick αμέσως.</p><p><a class="probtn" href="${esc(me.telegram.link)}" rel="noopener">Άνοιγμα PRO Telegram</a></p><p class="sub">Το link είναι προσωπικό: ισχύει 24 ώρες και για ένα άτομο. Αν λήξει, θα βρεις νέο στο My Account.</p>` : '<p><b>1.</b> Το προσωπικό σου link για το PRO Telegram θα το βρεις στο My Account μόλις ενεργοποιηθεί.</p>'}
<p><b>2.</b> Τα High Fidelity Picks και οι αναλύσεις ανοίγουν αυτόματα στο site όσο είσαι συνδεδεμένος.</p><p><b>3.</b> Σου στείλαμε email με όλα αυτά και link σύνδεσης για άλλη συσκευή.</p><p><a href="/my-account/">My Account →</a></p></div>`;
  })();
} else if (page === 'account') {
  const out = $('.proout');
  const loginForm = (note = '') => {
    out.innerHTML = `${note}<form class="prologin"><label>Email<input type="email" name="email" required autocomplete="email" inputmode="email"></label><button class="probtn" type="submit">Στείλε μου link σύνδεσης</button></form><p class="sub">Χωρίς κωδικό: σου στέλνουμε link που ισχύει 20 λεπτά.</p>`;
    out.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); const em = e.target.email.value.trim();
      const r = await api('/v1/auth/request', { method: 'POST', body: { email: em } }).catch(() => null);
      out.innerHTML = r?.ok ? msg(`Σου στείλαμε link στο <b>${esc(em)}</b>. Άνοιξέ το από αυτή τη συσκευή.`) : msg('Δεν στάλθηκε. Έλεγξε το email και δοκίμασε ξανά.', 'err');
    });
  };
  const show = async () => {
    const me = await api('/v1/me').catch(() => null);
    if (!me?.ok) return loginForm();
    const s = me.subscription, R = me.role;
    const status = { ADMIN: 'Διαχειριστής', PRO: 'PRO ενεργό', PRO_EXPIRED: 'Η συνδρομή έληξε', FREE: 'FREE' }[R];
    out.innerHTML = `<div class="probox"><p class="sub">${esc(me.email)}</p><h2>${status}</h2>
${s ? `<p>${s.plan === 'monthly' ? 'Μηνιαίο' : 'Σεζόν 2026-27'} · ${me.pro ? (s.renews ? 'ανανέωση' : 'πρόσβαση έως') : 'έληξε'} <b>${dt(s.until)}</b>${s.cancel_at_period_end ? ' · ακυρώθηκε: η πρόσβαση μένει ως τότε' : ''}</p>` : ''}
<div class="proacts">${me.pro && s?.plan === 'monthly' && me.can_manage_billing ? `<button class="probtn ghost" data-act="portal">${s.renews ? 'Ακύρωση / κάρτα / αποδείξεις' : 'Ανανέωση / αποδείξεις'}</button>` : ''}${!me.pro ? '<a class="probtn" href="/checkout/">Γίνε PRO</a>' : ''}</div>
${me.telegram ? `<h3>PRO Telegram</h3><p><a class="probtn" href="${esc(me.telegram.link)}" rel="noopener">Άνοιγμα PRO Telegram</a></p><p class="sub">Προσωπικό link, ισχύει έως ${new Date(me.telegram.expires_at).toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}, για ένα άτομο.</p>` : me.pro ? '<h3>PRO Telegram</h3><p class="sub">Το link θα εμφανιστεί εδώ μόλις ενεργοποιηθεί το κανάλι.</p>' : ''}
<h3>Πληρωμές</h3>${me.orders.length ? `<div class="tbl"><table class="antbl"><thead><tr><th class="l">Ημερομηνία</th><th class="l">Περιγραφή</th><th>Ποσό</th><th>Απόδειξη</th></tr></thead><tbody>${me.orders.map(o => `<tr><td class="l">${dt(o.created_at)}</td><td class="l"><small>${esc(o.description)}</small></td><td>${eur(o.amount_cents)}</td><td>${o.receipt_url ? `<a href="${esc(o.receipt_url)}" rel="noopener">Προβολή</a>` : o.receipt_status === 'issued' ? 'εκδόθηκε' : 'σε έκδοση'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Καμία πληρωμή.</p>'}
<p><button class="linkbtn" data-act="logout">Αποσύνδεση</button></p></div>`;
    out.querySelector('[data-act="logout"]').addEventListener('click', async () => { await api('/v1/auth/logout', { method: 'POST' }).catch(() => null); store.set(null); loginForm(); });
    const pb = out.querySelector('[data-act="portal"]');
    if (pb) pb.addEventListener('click', async () => { pb.disabled = true; const r = await api('/v1/portal', { method: 'POST' }).catch(() => null); if (r?.url) location.href = r.url; else { pb.disabled = false; pb.insertAdjacentHTML('afterend', msg('Δεν άνοιξε. Δοκίμασε ξανά.', 'err')); } });
  };
  const fromHash = () => {
    const m = /#login=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return false;
    history.replaceState(null, '', location.pathname);
    out.innerHTML = msg('Σύνδεση…');
    api('/v1/auth/verify', { method: 'POST', body: { token: m[1] } }).then(r => { if (r.session) { store.set(r.session); show(); } else loginForm(msg('Το link έληξε ή χρησιμοποιήθηκε ήδη. Ζήτησε νέο.', 'err')); }).catch(() => loginForm(msg('Πρόβλημα σύνδεσης.', 'err')));
    return true;
  };
  window.addEventListener('hashchange', fromHash);         // link ανοιγμένο ενώ η σελίδα είναι ήδη ανοιχτή
  if (!fromHash()) show();
}
