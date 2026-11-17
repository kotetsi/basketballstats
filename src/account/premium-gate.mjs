const copy = {
  el: {
    title: 'BasketballStats Premium', locked: 'Αυτό το εργαλείο είναι διαθέσιμο με Premium.',
    signIn: 'Συνδέσου για να συνεχίσεις', checkout: 'Συνδρομή Premium · 9,90 €/μήνα',
    manage: 'Διαχείριση συνδρομής', failed: 'Η πληρωμή απέτυχε. Η Premium πρόσβαση έχει διακοπεί.',
    retry: 'Έλεγξε ξανά την πρόσβαση', unavailable: 'Η συνδρομή δεν είναι διαθέσιμη αυτή τη στιγμή.',
  },
  en: {
    title: 'BasketballStats Premium', locked: 'This tool is part of Premium.',
    signIn: 'Sign in to continue', checkout: 'Subscribe · €9.90/month',
    manage: 'Manage subscription', failed: 'Payment failed. Premium access is paused.',
    retry: 'Check access again', unavailable: 'Subscriptions are not available right now.',
  },
  es: {
    title: 'BasketballStats Premium', locked: 'Esta herramienta forma parte de Premium.',
    signIn: 'Inicia sesión para continuar', checkout: 'Suscribirse · 9,90 €/mes',
    manage: 'Gestionar suscripción', failed: 'El pago falló. El acceso Premium está pausado.',
    retry: 'Volver a comprobar el acceso', unavailable: 'Las suscripciones no están disponibles ahora.',
  },
  sr: {
    title: 'BasketballStats Premium', locked: 'Ova alatka je deo Premium paketa.',
    signIn: 'Prijavi se za nastavak', checkout: 'Pretplata · 9,90 €/mesec',
    manage: 'Upravljaj pretplatom', failed: 'Plaćanje nije uspelo. Premium pristup je pauziran.',
    retry: 'Ponovo proveri pristup', unavailable: 'Pretplate trenutno nisu dostupne.',
  },
  tr: {
    title: 'BasketballStats Premium', locked: 'Bu araç Premium aboneliğine dahildir.',
    signIn: 'Devam etmek için giriş yap', checkout: 'Abone ol · Ayda 9,90 €',
    manage: 'Aboneliği yönet', failed: 'Ödeme başarısız. Premium erişimi duraklatıldı.',
    retry: 'Erişimi yeniden kontrol et', unavailable: 'Abonelikler şu anda kullanılamıyor.',
  },
};
const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const accCtx = () => { try { return JSON.parse(document.getElementById('acctx')?.textContent || '{}'); } catch { return {}; } };
// Premium ανοιχτό μόνο όταν το site χτίστηκε με premium.enabled: αλλιώς τα δεδομένα είναι δημόσια και κανένα εργαλείο δεν κλειδώνει
export const premiumEnabled = () => accCtx().premium === true;
const publicUrl = (key, base = '/') => base + (key === 'props/data.json' ? 'assets/' : 'api/') + key;

export async function fetchPremiumData(key) {
  if (!/^(props\/data\.json|compare\/(?:players\/(?:metrics\.json|similar\/[A-Za-z0-9_-]+\.json)|teams\/metrics\.json))$/.test(key)) {
    throw new Error('Invalid Premium data key');
  }
  const ctx = accCtx();
  if (ctx.premium !== true) {
    const res = await fetch(publicUrl(key, ctx.base || '/'));
    if (!res.ok) throw new Error('Data unavailable.');
    return res.json();
  }
  const api = ctx.api;
  const token = localStorage.getItem('bsacc');
  if (!api || !token) throw new Error('Sign in to load Premium data.');
  const res = await fetch(api.replace(/\/$/, '') + '/premium/data/' + key, {
    headers: { authorization: 'Bearer ' + token },
  });
  if (!res.ok) throw new Error(res.status === 403 ? 'Premium access required.' : 'Premium data unavailable.');
  return res.json();
}

export async function requirePremium(root, related = []) {
  if (!root || !premiumEnabled()) return true;
  const elements = [root, ...related].filter(Boolean);
  elements.forEach(el => { el.hidden = true; });
  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const L = copy[lang] || copy.en;
  let api = null, billing = false, token = null, status = { premium: false, status: 'free' };
  try {
    api = JSON.parse(document.getElementById('acctx')?.textContent || '{}').api;
    token = localStorage.getItem('bsacc');
    if (api) {
      const cfg = await fetch(api + '/config').then(r => r.json());
      billing = !!cfg.billing;
    }
    if (api && token) {
      const res = await fetch(api + '/billing/status', { headers: { authorization: 'Bearer ' + token } });
      if (res.ok) status = await res.json();
      else if (res.status === 401) { token = null; status.status = 'free'; }
    }
  } catch { /* Show a retryable locked state when account services are unavailable. */ }

  if (status.premium === true && status.status === 'active') {
    elements.forEach(el => { el.hidden = false; });
    return true;
  }

  root.hidden = false;
  const message = status.status === 'past_due' ? L.failed : L.locked;
  const action = !token
    ? `<button type="button" data-premium-action="signin">${esc(L.signIn)}</button>`
    : status.status === 'free' && billing
      ? `<button type="button" data-premium-action="checkout">${esc(L.checkout)}</button>`
      : status.status !== 'free' && billing
        ? `<button type="button" data-premium-action="portal">${esc(L.manage)}</button>`
        : `<p role="status">${esc(L.unavailable)}</p>`;
  root.innerHTML = `<section class="premium-lock" aria-labelledby="premiumLockTitle">
    <h2 id="premiumLockTitle">${esc(L.title)}</h2><p>${esc(message)}</p>${action}
    <button type="button" class="accsec" data-premium-action="retry">${esc(L.retry)}</button>
  </section>`;
  root.querySelectorAll('[data-premium-action]').forEach(button => button.addEventListener('click', async e => {
    const action = e.currentTarget.dataset.premiumAction;
    if (action === 'signin') { document.querySelector('.accbtn')?.click(); return; }
    if (action === 'retry') { location.reload(); return; }
    try {
      const endpoint = action === 'checkout' ? '/billing/checkout' : '/billing/portal';
      const res = await fetch(api + endpoint, { method: 'POST', headers: { authorization: 'Bearer ' + token } });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'billing');
      location.assign(data.url);
    } catch {
      root.querySelector('[role="status"]')?.remove();
      const note = document.createElement('p'); note.setAttribute('role', 'status'); note.textContent = L.unavailable; root.querySelector('.premium-lock')?.append(note);
    }
  }));
  return false;
}
