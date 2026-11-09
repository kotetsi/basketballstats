// Email λογαριασμού (Brevo transactional API). ΠΟΤΕ picks μέσω email.
// Χωρίς BREVO_API_KEY (τοπικά/tests) δεν στέλνεται τίποτα: καταγράφεται μόνο στο email_log.
import { esc, DISCLAIMER } from './lib.js';

const wrap = (title, body) => `<!doctype html><html lang="el"><body style="margin:0;background:#f4f2ee;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1b1f2a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="font-weight:800;font-size:20px;letter-spacing:.5px">BASKETBALL<span style="color:#e4572e">STATS</span> PRO</div>
<div style="background:#fff;border-radius:12px;padding:20px;margin-top:14px;line-height:1.55"><h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${body}</div>
<p style="font-size:12px;color:#666;margin-top:14px">${esc(DISCLAIMER)}</p></div></body></html>`;
const btn = (href, label) => `<p><a href="${esc(href)}" style="display:inline-block;background:#e4572e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">${esc(label)}</a></p>`;

export const templates = {
  login: ({ link }) => ({ subject: 'Σύνδεση στο BasketballStats PRO', html: wrap('Σύνδεση', `<p>Πάτησε το κουμπί για να μπεις στον λογαριασμό σου. Το link ισχύει 20 λεπτά και μία φορά.</p>${btn(link, 'Σύνδεση')}<p style="font-size:13px;color:#666">Αν δεν το ζήτησες εσύ, αγνόησέ το.</p>`) }),
  welcome_pro: ({ telegram, account, plan, until }) => ({ subject: 'Καλώς ήρθες στο BasketballStats PRO', html: wrap('Καλώς ήρθες στο PRO', `<p>Το πακέτο σου: <b>${esc(plan)}</b>${until ? `, με πρόσβαση έως <b>${esc(until)}</b>` : ''}.</p>
${telegram ? `<p><b>Ιδιωτικό PRO Telegram:</b> εκεί στέλνουμε κάθε pick αμέσως μόλις βγει. Το link ισχύει 24 ώρες και για ένα άτομο.</p>${btn(telegram, 'Μπες στο PRO Telegram')}` : '<p><b>PRO Telegram:</b> το προσωπικό σου link θα το βρεις στο My Account.</p>'}
<p><b>Πώς βλέπεις τις αναλύσεις:</b> μπες στο site με το ίδιο email (My Account → Σύνδεση). Τα High Fidelity Picks και οι αναλύσεις ανοίγουν αυτόματα όσο η συνδρομή είναι ενεργή.</p>${btn(account, 'My Account')}
<p style="font-size:13px;color:#666">Τα picks δεν στέλνονται ποτέ με email: οι αποδόσεις αλλάζουν γρήγορα, γι’ αυτό πάνε μόνο στο Telegram.</p>`) }),
  payment_success: ({ amount, description, account }) => ({ subject: 'Η πληρωμή σου ολοκληρώθηκε', html: wrap('Η πληρωμή σου ολοκληρώθηκε', `<p>${esc(description)}</p><p>Ποσό: <b>${esc(amount)}</b> (περιλαμβάνει ΦΠΑ 24%).</p><p>Η απόδειξη θα εμφανιστεί στο ιστορικό πληρωμών του λογαριασμού σου.</p>${btn(account, 'My Account')}`) }),
  payment_failed: ({ account }) => ({ subject: 'Η πληρωμή της συνδρομής σου δεν ολοκληρώθηκε', html: wrap('Η πληρωμή δεν ολοκληρώθηκε', `<p>Η ανανέωση της συνδρομής PRO δεν πέρασε. Η κάρτα θα ξαναχρεωθεί αυτόματα τις επόμενες μέρες· μπορείς να αλλάξεις κάρτα από τον λογαριασμό σου.</p>${btn(account, 'Ενημέρωση πληρωμής')}`) }),
};

export async function sendEmail(env, db, to, tpl, data) {
  const { subject, html } = templates[tpl](data);
  let status = 'logged', err = null;
  if (env.BREVO_API_KEY) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { email: env.MAIL_FROM || 'pro@basketballstats.eu', name: 'BasketballStats PRO' }, to: [{ email: to }], subject, htmlContent: html }) });
      status = r.ok ? 'sent' : 'failed'; if (!r.ok) err = `brevo ${r.status}`;
    } catch (e) { status = 'failed'; err = String(e.message || e).slice(0, 200); }
  }
  await db.prepare('INSERT INTO email_log (to_email, template, subject, status, error, created_at) VALUES (?,?,?,?,?,?)').bind(to, tpl, subject, status, err, new Date().toISOString()).run();
  return status;
}
