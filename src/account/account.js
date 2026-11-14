// Λογαριασμός χρήστη (browser): σύνδεση με Google/Facebook, συγχρονισμός της ομάδας Fantasy (fmt-v1) με τον
// λογαριασμό, ειδοποιήσεις μέσω Telegram και browser. Server: workers/account. Χωρίς σύνδεση, το site δουλεύει όπως πριν.
const X = JSON.parse(document.getElementById('acctx').textContent);
const API = X.api, LG = X.lg, KEY = 'fmt-v1', TK = 'bsacc', MK = 'bsacc-sync';
const TXT = {
  el: { in: 'Σύνδεση', title: 'Ο λογαριασμός σου', why: 'Συνδέσου για να:', b1: 'έχεις την ομάδα σου Fantasy σε κινητό και υπολογιστή, χωρίς να την ξαναπερνάς', b2: 'παίρνεις ειδοποίηση όταν τραυματιστεί ή είναι αμφίβολος παίκτης σου', b3: 'μαθαίνεις ποιον να βάλεις αρχηγό και ποια αλλαγή αξίζει, πριν κλείσει ο γύρος', g: 'Σύνδεση με Google', f: 'Σύνδεση με Facebook', safe: 'Δεν κρατάμε κωδικούς και δεν αλλάζουμε τίποτα στον λογαριασμό σου στο EuroLeague Fantasy. Οι αλλαγές γίνονται από εσένα, στο επίσημο παιχνίδι.', priv: 'Πολιτική απορρήτου', hi: 'Γεια σου', team: 'Η ομάδα σου', synced: 'αποθηκευμένη στον λογαριασμό σου', noteam: 'Δεν έχεις περάσει ακόμα ομάδα.', addteam: 'Πέρασε την ομάδα σου', shot: 'ή ανέβασε screenshot', notif: 'Ειδοποιήσεις', tg: 'Telegram', tgOn: 'συνδεδεμένο', tgGo: 'Σύνδεση Telegram', tgOff: 'Αποσύνδεση', push: 'Ειδοποιήσεις σε αυτή τη συσκευή', pushOn: 'ενεργές', pushGo: 'Ενεργοποίηση', pushNo: 'Ο browser δεν υποστηρίζει ειδοποιήσεις. Στο iPhone, πρόσθεσε πρώτα το site στην αρχική οθόνη.', pushDenied: 'Οι ειδοποιήσεις είναι μπλοκαρισμένες στις ρυθμίσεις του browser.', what: 'Τι θέλεις να μαθαίνεις', k: { injury: 'Τραυματίες και αμφίβολοι της ομάδας μου', captain: 'Αλλαγή αρχηγού', swap: 'Μία πρόταση αλλαγής την εβδομάδα', lock: 'Υπενθύμιση 3 ώρες πριν κλείσει ο γύρος' }, out: 'Αποσύνδεση', del: 'Διαγραφή λογαριασμού', delQ: 'Να διαγραφεί ο λογαριασμός και όλα τα δεδομένα του; Η ομάδα θα μείνει μόνο σε αυτόν τον browser.', err: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.', close: 'Κλείσιμο', saved: 'Αποθηκεύτηκε' },
  en: { in: 'Sign in', title: 'Your account', why: 'Sign in to:', b1: 'have your Fantasy team on phone and computer, without entering it again', b2: 'get an alert when one of your players is injured or doubtful', b3: 'know whom to captain and which transfer is worth it, before the round locks', g: 'Sign in with Google', f: 'Sign in with Facebook', safe: 'We keep no passwords and change nothing in your EuroLeague Fantasy account. You make the changes yourself, in the official game.', priv: 'Privacy policy', hi: 'Hi', team: 'Your team', synced: 'saved to your account', noteam: 'You have not entered a team yet.', addteam: 'Enter your team', shot: 'or upload a screenshot', notif: 'Alerts', tg: 'Telegram', tgOn: 'connected', tgGo: 'Connect Telegram', tgOff: 'Disconnect', push: 'Alerts on this device', pushOn: 'on', pushGo: 'Turn on', pushNo: 'This browser does not support notifications. On iPhone, add the site to your home screen first.', pushDenied: 'Notifications are blocked in your browser settings.', what: 'What to tell you', k: { injury: 'Injured and doubtful players in my team', captain: 'Captain change', swap: 'One transfer suggestion a week', lock: 'Reminder 3 hours before the round locks' }, out: 'Sign out', del: 'Delete account', delQ: 'Delete your account and all its data? Your team will stay only in this browser.', err: 'Something went wrong. Please try again.', close: 'Close', saved: 'Saved' },
  es: { in: 'Entrar', title: 'Tu cuenta', why: 'Entra para:', b1: 'tener tu equipo Fantasy en el móvil y el ordenador, sin volver a introducirlo', b2: 'recibir un aviso cuando un jugador tuyo se lesione o sea duda', b3: 'saber a quién hacer capitán y qué fichaje vale la pena, antes del cierre', g: 'Entrar con Google', f: 'Entrar con Facebook', safe: 'No guardamos contraseñas ni cambiamos nada en tu cuenta de EuroLeague Fantasy. Los cambios los haces tú, en el juego oficial.', priv: 'Política de privacidad', hi: 'Hola', team: 'Tu equipo', synced: 'guardado en tu cuenta', noteam: 'Aún no has introducido un equipo.', addteam: 'Introduce tu equipo', shot: 'o sube una captura', notif: 'Avisos', tg: 'Telegram', tgOn: 'conectado', tgGo: 'Conectar Telegram', tgOff: 'Desconectar', push: 'Avisos en este dispositivo', pushOn: 'activados', pushGo: 'Activar', pushNo: 'Este navegador no admite notificaciones. En iPhone, añade primero la web a la pantalla de inicio.', pushDenied: 'Las notificaciones están bloqueadas en tu navegador.', what: 'Qué quieres saber', k: { injury: 'Lesionados y dudas de mi equipo', captain: 'Cambio de capitán', swap: 'Una sugerencia de fichaje por semana', lock: 'Recordatorio 3 horas antes del cierre' }, out: 'Salir', del: 'Eliminar cuenta', delQ: '¿Eliminar tu cuenta y todos sus datos? Tu equipo quedará solo en este navegador.', err: 'Algo salió mal. Inténtalo de nuevo.', close: 'Cerrar', saved: 'Guardado' },
  sr: { in: 'Prijava', title: 'Tvoj nalog', why: 'Prijavi se da:', b1: 'imaš svoj Fantasy tim na telefonu i računaru, bez ponovnog unosa', b2: 'dobiješ obaveštenje kad se tvoj igrač povredi ili je upitan', b3: 'znaš koga da staviš za kapitena i koja izmena se isplati, pre zaključavanja kola', g: 'Prijava preko Google-a', f: 'Prijava preko Facebook-a', safe: 'Ne čuvamo lozinke i ne menjamo ništa u tvom EuroLeague Fantasy nalogu. Izmene praviš ti, u zvaničnoj igri.', priv: 'Politika privatnosti', hi: 'Zdravo', team: 'Tvoj tim', synced: 'sačuvan na tvom nalogu', noteam: 'Još nisi uneo tim.', addteam: 'Unesi svoj tim', shot: 'ili pošalji snimak ekrana', notif: 'Obaveštenja', tg: 'Telegram', tgOn: 'povezan', tgGo: 'Poveži Telegram', tgOff: 'Prekini vezu', push: 'Obaveštenja na ovom uređaju', pushOn: 'uključena', pushGo: 'Uključi', pushNo: 'Ovaj pregledač ne podržava obaveštenja. Na iPhone-u prvo dodaj sajt na početni ekran.', pushDenied: 'Obaveštenja su blokirana u podešavanjima pregledača.', what: 'Šta želiš da znaš', k: { injury: 'Povređeni i upitni igrači mog tima', captain: 'Promena kapitena', swap: 'Jedan predlog izmene nedeljno', lock: 'Podsetnik 3 sata pre zaključavanja kola' }, out: 'Odjava', del: 'Obriši nalog', delQ: 'Obrisati nalog i sve podatke? Tim će ostati samo u ovom pregledaču.', err: 'Nešto nije u redu. Pokušaj ponovo.', close: 'Zatvori', saved: 'Sačuvano' },
  tr: { in: 'Giriş', title: 'Hesabın', why: 'Giriş yap ve:', b1: 'Fantasy takımın telefonda ve bilgisayarda hazır olsun, tekrar girmeden', b2: 'oyuncun sakatlandığında veya şüpheli olduğunda bildirim al', b3: 'hafta kapanmadan kimi kaptan yapacağını ve hangi transferin değdiğini öğren', g: 'Google ile giriş', f: 'Facebook ile giriş', safe: 'Şifre saklamıyoruz ve EuroLeague Fantasy hesabında hiçbir şeyi değiştirmiyoruz. Değişiklikleri resmi oyunda sen yaparsın.', priv: 'Gizlilik politikası', hi: 'Merhaba', team: 'Takımın', synced: 'hesabına kaydedildi', noteam: 'Henüz takım girmedin.', addteam: 'Takımını gir', shot: 'veya ekran görüntüsü yükle', notif: 'Bildirimler', tg: 'Telegram', tgOn: 'bağlı', tgGo: 'Telegram’ı bağla', tgOff: 'Bağlantıyı kes', push: 'Bu cihazda bildirimler', pushOn: 'açık', pushGo: 'Aç', pushNo: 'Bu tarayıcı bildirimleri desteklemiyor. iPhone’da önce siteyi ana ekrana ekle.', pushDenied: 'Bildirimler tarayıcı ayarlarında engelli.', what: 'Neleri bilmek istersin', k: { injury: 'Takımımdaki sakat ve şüpheli oyuncular', captain: 'Kaptan değişikliği', swap: 'Haftada bir transfer önerisi', lock: 'Hafta kapanmadan 3 saat önce hatırlatma' }, out: 'Çıkış', del: 'Hesabı sil', delQ: 'Hesabın ve tüm verileri silinsin mi? Takımın yalnızca bu tarayıcıda kalacak.', err: 'Bir şeyler ters gitti. Tekrar dene.', close: 'Kapat', saved: 'Kaydedildi' },
};
const L = TXT[LG] || TXT.en;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { origSet.call(localStorage, k, v); } catch { } }, del: k => { try { localStorage.removeItem(k); } catch { } } };
const origSet = Storage.prototype.setItem;
let token = ls.get(TK), me = null, cfg = null;

async function call(p, method = 'GET', body) {
  const r = await fetch(API + p, { method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && token) { token = null; ls.del(TK); me = null; paint(); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}

// ---------- συγχρονισμός της ομάδας (fmt-v1)
const meta = () => { try { return JSON.parse(ls.get(MK)) || { updated: 0 }; } catch { return { updated: 0 }; } };
let pushT = null;
function queuePush() {
  if (!token) return;
  clearTimeout(pushT);
  pushT = setTimeout(async () => {
    const raw = ls.get(KEY); if (!raw) return;
    const updated = Date.now();
    try { await call('/state', 'PUT', { data: JSON.parse(raw), updated }); ls.set(MK, JSON.stringify({ updated })); } catch { }
  }, 1500);
}
Storage.prototype.setItem = function (k, v) { origSet.call(this, k, v); if (this === localStorage && k === KEY) queuePush(); };
async function sync() {
  const s = await call('/state'), raw = ls.get(KEY), m = meta();
  const hasTeam = d => d?.teams?.some(t => t.roster?.length);
  if (s.data && hasTeam(s.data) && (!raw || !hasTeam(JSON.parse(raw)) || s.updated > m.updated)) {
    const nv = JSON.stringify(s.data);
    if (nv !== raw) { ls.set(KEY, nv); ls.set(MK, JSON.stringify({ updated: s.updated })); if (document.querySelector('#fmApp, #asApp, #optApp, .livetracker')) location.reload(); }
  } else if (raw && hasTeam(JSON.parse(raw)) && raw !== JSON.stringify(s.data)) queuePush();
}

// ---------- σύνδεση
const loadJS = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
async function afterLogin(tok) {
  token = tok; ls.set(TK, tok);
  me = await call('/me');
  if (me.prefs?.lang !== LG) { try { me.prefs = (await call('/prefs', 'PUT', { ...me.prefs, lang: LG })).prefs; } catch { } }
  await sync().catch(() => { });
  paint(); render();
}
async function google(box) {
  await loadJS('https://accounts.google.com/gsi/client');
  window.google.accounts.id.initialize({ client_id: cfg.google, callback: async r => { try { await afterLogin((await call('/auth/google', 'POST', { credential: r.credential })).token); } catch { msg(L.err); } } });
  window.google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', text: 'signin_with', width: 260, locale: LG });
}
async function facebook() {
  if (!window.FB) { await loadJS(`https://connect.facebook.net/${{ el: 'el_GR', en: 'en_GB', es: 'es_ES', sr: 'sr_RS', tr: 'tr_TR' }[LG] || 'en_GB'}/sdk.js`); window.FB.init({ appId: cfg.facebook, version: 'v21.0', cookie: false, xfbml: false }); }
  window.FB.login(async r => { if (!r.authResponse) return; try { await afterLogin((await call('/auth/facebook', 'POST', { accessToken: r.authResponse.accessToken })).token); } catch { msg(L.err); } }, { scope: 'public_profile' });
}

// ---------- ειδοποιήσεις browser
const pushOK = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function pushSub() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
async function pushOn() {
  if ((await Notification.requestPermission()) !== 'granted') { msg(L.pushDenied); return; }
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(cfg.vapid.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((cfg.vapid.length + 3) % 4)), c => c.charCodeAt(0));
  const s = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await call('/push/sub', 'POST', { endpoint: s.endpoint });
  me = await call('/me'); render();
}
async function pushOff() { const s = await pushSub(); if (s) { await call('/push/sub', 'DELETE', { endpoint: s.endpoint }).catch(() => { }); await s.unsubscribe(); } me = await call('/me'); render(); }

// ---------- UI: κουμπί στην κεφαλίδα + παράθυρο
const btn = document.createElement('button');
btn.type = 'button'; btn.className = 'accbtn';
const srch = document.querySelector('.search');
if (srch && matchMedia('(max-width:640px)').matches) { btn.classList.add('inrow'); srch.after(btn); }   // κινητό: δίπλα στην αναζήτηση
else (document.querySelector('.langs') || document.body).prepend(btn);
const dlg = document.createElement('dialog'); dlg.className = 'accdlg'; document.body.appendChild(dlg);
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
function paint() { const first = (me?.name || '').split(' ')[0]; btn.textContent = me ? `👤 ${first || L.title}` : `👤 ${L.in}`; btn.setAttribute('aria-label', me ? L.title : L.in); }
const msg = t => { const m = dlg.querySelector('.accmsg'); if (m) { m.textContent = t; m.hidden = false; } };
async function render() {
  const head = `<div class="acchead"><h2>${esc(me ? `${L.hi}, ${(me.name || '').split(' ')[0]}` : L.title)}</h2><button type="button" class="accx" aria-label="${esc(L.close)}">×</button></div><p class="accmsg" hidden role="status"></p>`;
  if (!me) {
    dlg.innerHTML = `${head}<p>${esc(L.why)}</p><ul class="accben"><li>📋 ${esc(L.b1)}</li><li>🚑 ${esc(L.b2)}</li><li>👑 ${esc(L.b3)}</li></ul>
<div class="acclog">${cfg.google ? '<div class="accg"></div>' : ''}${cfg.facebook ? `<button type="button" class="accfb">${esc(L.f)}</button>` : ''}</div>
<p class="accsafe">🔒 ${esc(L.safe)} <a href="${X.legal}">${esc(L.priv)}</a></p>`;
    if (cfg.google) google(dlg.querySelector('.accg')).catch(() => msg(L.err));
    dlg.querySelector('.accfb')?.addEventListener('click', () => facebook().catch(() => msg(L.err)));
  } else {
    let st = null; try { st = JSON.parse(ls.get(KEY)); } catch { }
    const t = st?.teams?.[st.active ?? 0], has = t?.roster?.length === 10;
    const sub = pushOK() ? await pushSub().catch(() => null) : null;
    const k = me.prefs?.kinds || {};
    dlg.innerHTML = `${head}
<section><h3>${esc(L.team)}</h3>${has ? `<p>✅ ${esc(t.name || L.team)} · ${esc(L.synced)} · <a href="${X.manager}">${esc(L.team)} →</a></p>` : `<p>${esc(L.noteam)} <a href="${X.manager}">${esc(L.addteam)}</a> · <a href="${X.assistant}">${esc(L.shot)}</a></p>`}</section>
<section><h3>${esc(L.notif)}</h3>
${cfg.telegram ? `<p class="accrow"><span>✈️ ${esc(L.tg)}${me.telegram ? ` · <b>${esc(L.tgOn)}</b>` : ''}</span>${me.telegram ? `<button type="button" data-a="tgoff" class="accsec">${esc(L.tgOff)}</button>` : `<button type="button" data-a="tg">${esc(L.tgGo)}</button>`}</p>` : ''}
<p class="accrow"><span>🔔 ${esc(L.push)}${sub ? ` · <b>${esc(L.pushOn)}</b>` : ''}</span>${!pushOK() ? '' : sub ? `<button type="button" data-a="pushoff" class="accsec">${esc(L.tgOff)}</button>` : `<button type="button" data-a="push">${esc(L.pushGo)}</button>`}</p>
${!pushOK() ? `<p class="accnote">${esc(L.pushNo)}</p>` : ''}
<fieldset class="acckinds"><legend>${esc(L.what)}</legend>${Object.entries(L.k).map(([kk, lab]) => `<label><input type="checkbox" data-k="${kk}"${k[kk] !== false ? ' checked' : ''}> ${esc(lab)}</label>`).join('')}</fieldset></section>
<p class="accsafe">🔒 ${esc(L.safe)} <a href="${X.legal}">${esc(L.priv)}</a></p>
<p class="accfoot"><button type="button" data-a="out" class="accsec">${esc(L.out)}</button> <button type="button" data-a="del" class="accdel">${esc(L.del)}</button></p>`;
  }
  dlg.querySelector('.accx').addEventListener('click', () => dlg.close());
}
dlg.addEventListener('change', async e => {
  const c = e.target.closest('input[data-k]'); if (!c) return;
  const kinds = Object.fromEntries([...dlg.querySelectorAll('input[data-k]')].map(i => [i.dataset.k, i.checked]));
  try { me.prefs = (await call('/prefs', 'PUT', { ...me.prefs, kinds })).prefs; msg(L.saved); } catch { msg(L.err); }
});
dlg.addEventListener('click', async e => {
  const a = e.target.closest('button[data-a]')?.dataset.a; if (!a) return;
  try {
    if (a === 'tg') { const w = window.open('', '_blank'); const { url } = await call('/tg/link', 'POST'); if (w) w.location = url; else location.href = url; const poll = setInterval(async () => { me = await call('/me').catch(() => me); if (me.telegram) { clearInterval(poll); if (dlg.open) render(); } }, 4000); setTimeout(() => clearInterval(poll), 180e3); }
    if (a === 'tgoff') { await call('/tg', 'DELETE'); me = await call('/me'); render(); }
    if (a === 'push') await pushOn();
    if (a === 'pushoff') await pushOff();
    if (a === 'out') { await call('/logout', 'POST').catch(() => { }); token = null; ls.del(TK); ls.del(MK); me = null; paint(); render(); }
    if (a === 'del' && confirm(L.delQ)) { await pushOff().catch(() => { }); await call('/me', 'DELETE'); token = null; ls.del(TK); ls.del(MK); me = null; paint(); render(); }
  } catch { msg(L.err); }
});
btn.addEventListener('click', async () => {
  try { cfg = cfg || await call('/config'); } catch { return; }
  await render(); dlg.showModal();
});

// το κουμπί εμφανίζεται μόνο όταν υπάρχει τρόπος σύνδεσης (Google ή Facebook ενεργό στον worker)
btn.hidden = true;
(async () => {
  try { cfg = JSON.parse(sessionStorage.getItem('bsacc-cfg') || 'null'); } catch { }
  if (!cfg) { try { cfg = await call('/config'); try { sessionStorage.setItem('bsacc-cfg', JSON.stringify(cfg)); } catch { } } catch { return; } }
  if (cfg.google || cfg.facebook || token) btn.hidden = false;
})();
paint();
if (token) call('/me').then(async m => { me = m; paint(); await sync().catch(() => { }); }).catch(() => { });
