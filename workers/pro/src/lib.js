// BasketballStats PRO: καθαρές συναρτήσεις (ρόλοι, πακέτα, κρυπτογραφία, Stripe υπογραφές). Χωρίς εξαρτήσεις:
// τρέχουν ίδια στο Cloudflare Worker και στα tests του Node.

/** πακέτα: οι τιμές ΠΕΡΙΛΑΜΒΑΝΟΥΝ ΦΠΑ 24% */
export function plans(env) {
  return {
    monthly: { key: 'monthly', name: 'PRO Μηνιαίο', cents: +(env.PRICE_MONTHLY_CENTS || 1490), mode: 'subscription', interval: 'month', label: 'Μήνας' },
    season_eb: { key: 'season_eb', name: 'PRO Σεζόν (Early Bird)', cents: +(env.PRICE_SEASON_EB_CENTS || 4900), mode: 'payment', until: env.EARLY_BIRD_UNTIL || null, label: 'Σεζόν 2026-27' },
    season: { key: 'season', name: 'PRO Σεζόν', cents: +(env.PRICE_SEASON_CENTS || 5900), mode: 'payment', label: 'Σεζόν 2026-27' },
  };
}
export const VAT_RATE = 0.24;
/** καθαρή αξία και ΦΠΑ από τελική τιμή (λεπτά) */
export const vatSplit = cents => { const net = Math.round(cents / (1 + VAT_RATE)); return { gross: cents, net, vat: cents - net }; };
/** περιγραφή παραστατικού: ΑΚΡΙΒΩΣ όπως ορίστηκε */
export const invoiceDescription = period => `Συνδρομή πρόσβασης σε ψηφιακό περιεχόμενο - BasketballStats PRO - ${period}`;
export const monthLabel = d => new Date(d).toLocaleDateString('el-GR', { month: 'long', year: 'numeric', timeZone: 'Europe/Athens' });

export function planAvailable(plan, now = Date.now()) {
  if (!plan) return false;
  if (plan.until && now > Date.parse(plan.until)) return false;
  return true;
}

/** συνδρομή που δίνει πρόσβαση τώρα: ενεργή/δοκιμαστική ή σε καθυστέρηση πληρωμής, και η περίοδος δεν έχει λήξει */
export const grantsAccess = (s, now = Date.now()) => ['active', 'trialing', 'past_due'].includes(s.status) && s.current_period_end && Date.parse(s.current_period_end) > now;

/** ρόλος: ADMIN | PRO | PRO_EXPIRED | FREE (η λήξη = αυτόματη επιστροφή σε FREE δικαιώματα) */
export function roleOf(user, subs = [], { admins = '', now = Date.now() } = {}) {
  if (!user) return { role: 'FREE', pro: false, sub: null };
  const isAdmin = admins.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(String(user.email).toLowerCase());
  const live = subs.filter(s => grantsAccess(s, now)).sort((a, b) => Date.parse(b.current_period_end) - Date.parse(a.current_period_end));
  const last = [...subs].sort((a, b) => String(b.current_period_end).localeCompare(String(a.current_period_end)))[0] || null;
  if (isAdmin) return { role: 'ADMIN', pro: true, sub: live[0] || last };
  if (live.length) return { role: 'PRO', pro: true, sub: live[0] };
  return { role: subs.length ? 'PRO_EXPIRED' : 'FREE', pro: false, sub: last };
}

export const normEmail = e => {
  const s = String(e || '').trim().toLowerCase();
  return s.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(s) ? s : null;
};

// ---- κρυπτογραφία (Web Crypto: ίδια σε Worker και Node 20+)
const enc = new TextEncoder();
export function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256(s) { const h = await crypto.subtle.digest('SHA-256', enc.encode(s)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

/** επαλήθευση υπογραφής webhook Stripe (header Stripe-Signature: t=…,v1=…), ανοχή 5′ */
export async function verifyStripeSignature(body, header, secret, { tolerance = 300, now = Date.now() } = {}) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries([]), v1 = [];
  for (const kv of String(header).split(',')) { const [k, v] = kv.split('='); if (k === 't') parts.t = v; if (k === 'v1') v1.push(v); }
  if (!parts.t || !v1.length || Math.abs(now / 1000 - +parts.t) > tolerance) return false;
  const exp = await hmacHex(secret, `${parts.t}.${body}`);
  return v1.some(s => safeEq(s, exp));
}
/** για τα tests: υπογραφή όπως τη στέλνει η Stripe */
export async function signStripe(body, secret, t = Math.floor(Date.now() / 1000)) { return `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`; }

/** application/x-www-form-urlencoded με εμφωλευμένα κλειδιά (όπως τα θέλει το API της Stripe) */
export function stripeForm(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') stripeForm(v, key, out); else out.append(key, String(v));
  }
  return out;
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const DISCLAIMER = '21+. Το περιεχόμενο είναι στατιστική ανάλυση και όχι συμβουλή στοιχήματος. Παίζουμε υπεύθυνα, με χρήματα που αντέχουμε να χάσουμε. Κανένα σημείο δεν είναι σίγουρο.';
