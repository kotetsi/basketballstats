// Ειδοποιήσεις push χωρίς λογαριασμό (κουμπί 🔔 στην κεφαλίδα): νέα picks του High Fidelity, τραυματίες/απουσίες
// και τελικό σκορ της ομάδας του επισκέπτη. Server: workers/account (/push/public), αποστολή: scripts/public-alerts.mjs.
const X = JSON.parse(document.getElementById('acctx').textContent);
const API = X.api, LG = X.lg, BASE = X.base || '/';
const TXT = {
  el: { btn: 'Ειδοποιήσεις', title: 'Ειδοποιήσεις στο κινητό', intro: 'Δωρεάν και χωρίς λογαριασμό. Διάλεξε τι θέλεις να μαθαίνεις:', picks: 'Νέα picks του High Fidelity', team: 'Η ομάδα μου', inj: 'Τραυματίες και απουσίες της', score: 'Τελικό σκορ των αγώνων της', on: 'Ενεργοποίηση', save: 'Αποθήκευση', off: 'Απενεργοποίηση', ok: 'Έτοιμο! Θα λαμβάνεις ειδοποιήσεις σε αυτή τη συσκευή.', offd: 'Οι ειδοποιήσεις απενεργοποιήθηκαν.', denied: 'Ο browser μπλόκαρε τις ειδοποιήσεις. Επίτρεψέ τες από τις ρυθμίσεις του site και δοκίμασε ξανά.', ios: 'Στο iPhone: πρόσθεσε πρώτα το site στην αρχική οθόνη (Κοινοποίηση → «Προσθήκη στην αρχική οθόνη») και άνοιξέ το από εκεί.', nosup: 'Αυτός ο browser δεν υποστηρίζει ειδοποιήσεις.', none: 'Διάλεξε τουλάχιστον ένα: picks ή ομάδα με τραυματίες/σκορ.', pick: '— διάλεξε ομάδα —', err: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.', close: 'Κλείσιμο' },
  en: { btn: 'Alerts', title: 'Phone alerts', intro: 'Free, no account needed. Choose what you want to hear about:', picks: 'New High Fidelity picks', team: 'My team', inj: 'Its injuries and absences', score: 'Final scores of its games', on: 'Turn on', save: 'Save', off: 'Turn off', ok: 'Done! You will get alerts on this device.', offd: 'Alerts turned off.', denied: 'Your browser blocked notifications. Allow them in the site settings and try again.', ios: 'On iPhone: first add the site to your Home Screen (Share → “Add to Home Screen”) and open it from there.', nosup: 'This browser does not support notifications.', none: 'Pick at least one: picks, or a team with injuries/scores.', pick: '— choose a team —', err: 'Something went wrong. Please try again.', close: 'Close' },
  es: { btn: 'Avisos', title: 'Avisos en el móvil', intro: 'Gratis y sin cuenta. Elige qué quieres saber:', picks: 'Nuevos pronósticos de High Fidelity', team: 'Mi equipo', inj: 'Sus lesiones y bajas', score: 'Resultado final de sus partidos', on: 'Activar', save: 'Guardar', off: 'Desactivar', ok: '¡Listo! Recibirás avisos en este dispositivo.', offd: 'Avisos desactivados.', denied: 'Tu navegador bloqueó las notificaciones. Permítelas en los ajustes del sitio y vuelve a intentarlo.', ios: 'En iPhone: primero añade el sitio a la pantalla de inicio (Compartir → «Añadir a pantalla de inicio») y ábrelo desde allí.', nosup: 'Este navegador no admite notificaciones.', none: 'Elige al menos una opción: pronósticos, o un equipo con lesiones/resultados.', pick: '— elige equipo —', err: 'Algo salió mal. Inténtalo de nuevo.', close: 'Cerrar' },
  sr: { btn: 'Obaveštenja', title: 'Obaveštenja na telefonu', intro: 'Besplatno i bez naloga. Izaberi šta želiš da saznaješ:', picks: 'Novi tipovi od High Fidelity', team: 'Moj tim', inj: 'Njegove povrede i odsustva', score: 'Konačni rezultati njegovih utakmica', on: 'Uključi', save: 'Sačuvaj', off: 'Isključi', ok: 'Gotovo! Dobijaćeš obaveštenja na ovom uređaju.', offd: 'Obaveštenja su isključena.', denied: 'Pregledač je blokirao obaveštenja. Dozvoli ih u podešavanjima sajta i pokušaj ponovo.', ios: 'Na iPhone-u: prvo dodaj sajt na početni ekran (Deli → „Dodaj na početni ekran”) i otvori ga odatle.', nosup: 'Ovaj pregledač ne podržava obaveštenja.', none: 'Izaberi bar jedno: tipove, ili tim sa povredama/rezultatima.', pick: '— izaberi tim —', err: 'Nešto nije u redu. Pokušaj ponovo.', close: 'Zatvori' },
  tr: { btn: 'Bildirimler', title: 'Telefona bildirimler', intro: 'Ücretsiz ve hesap gerektirmez. Neyi öğrenmek istediğini seç:', picks: 'High Fidelity’nin yeni tahminleri', team: 'Takımım', inj: 'Sakatlıkları ve eksikleri', score: 'Maçlarının sonuçları', on: 'Aç', save: 'Kaydet', off: 'Kapat', ok: 'Tamam! Bu cihazda bildirim alacaksın.', offd: 'Bildirimler kapatıldı.', denied: 'Tarayıcın bildirimleri engelledi. Site ayarlarından izin verip tekrar dene.', ios: 'iPhone’da: önce siteyi ana ekrana ekle (Paylaş → “Ana Ekrana Ekle”) ve oradan aç.', nosup: 'Bu tarayıcı bildirimleri desteklemiyor.', none: 'En az birini seç: tahminler ya da sakatlık/sonuç için bir takım.', pick: '— takım seç —', err: 'Bir şeyler ters gitti. Tekrar dene.', close: 'Kapat' },
};
const L = TXT[LG] || TXT.en, IDX = { el: 0, en: 3, es: 5, sr: 7, tr: 9 }[LG] ?? 3;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone;
const myTeam = () => { try { return localStorage.getItem('bsMyTeam') || ''; } catch { return ''; } };
const j = async (p, method = 'GET', body) => { const r = await fetch(API + p, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || r.status); return x; };

const btn = document.createElement('button');
btn.type = 'button'; btn.className = 'accbtn bellbtn'; btn.textContent = '🔔'; btn.title = L.btn; btn.setAttribute('aria-label', L.btn);
(document.querySelector('.langs') || document.body).prepend(btn);
const dlg = document.createElement('dialog'); dlg.className = 'accdlg'; document.body.appendChild(dlg);
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

let teams = null, cur = null;
async function sub() { if (!ok) return null; const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); }
async function open() {
  if (!teams) teams = await fetch(BASE + 'assets/data.json').then(r => r.json()).then(d => Object.entries(d.teams || {}).map(([c, t]) => [c, t[IDX] || t[0]]).sort((a, b) => a[1].localeCompare(b[1]))).catch(() => []);
  const s = await sub().catch(() => null);
  cur = s ? (await j('/push/public?ep=' + encodeURIComponent(s.endpoint)).catch(() => ({}))).topics || null : null;
  const t = cur || { p: 1, t: myTeam() || null, i: 1, s: 1 };
  dlg.innerHTML = `<h3>🔔 ${esc(L.title)}</h3>${!ok ? `<p>${esc(L.nosup)}</p>${ios ? `<p class="sub">${esc(L.ios)}</p>` : ''}` : `<p class="sub">${esc(L.intro)}</p>
<p><label><input type="checkbox" data-k="p"${t.p ? ' checked' : ''}> ${esc(L.picks)}</label></p>
<p><label>${esc(L.team)}: <select data-k="t"><option value="">${esc(L.pick)}</option>${teams.map(([c, n]) => `<option value="${c}"${c === t.t ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label></p>
<p style="margin-left:14px"><label><input type="checkbox" data-k="i"${t.i ? ' checked' : ''}> ${esc(L.inj)}</label><br><label><input type="checkbox" data-k="s"${t.s ? ' checked' : ''}> ${esc(L.score)}</label></p>
<p class="accmsg" role="status"></p>
<p><button type="button" data-a="on">${esc(cur ? L.save : L.on)}</button> ${cur ? `<button type="button" data-a="off" class="accsec">${esc(L.off)}</button>` : ''}</p>`}
<p><button type="button" data-a="close" class="accsec">${esc(L.close)}</button></p>`;
  dlg.showModal();
}
const msg = m => { const e = dlg.querySelector('.accmsg'); if (e) e.textContent = m; };
dlg.addEventListener('click', async e => {
  const a = e.target.closest('button[data-a]')?.dataset.a; if (!a) return;
  if (a === 'close') return dlg.close();
  try {
    if (a === 'off') { const s = await sub(); if (s) { await j('/push/public', 'DELETE', { endpoint: s.endpoint }); } cur = null; msg(L.offd); return; }
    const v = k => dlg.querySelector(`[data-k="${k}"]`), topics = { p: v('p').checked ? 1 : 0, t: v('t').value || null, i: v('i').checked ? 1 : 0, s: v('s').checked ? 1 : 0 };
    if (!topics.p && !(topics.t && (topics.i || topics.s))) return msg(L.none);
    if (ios) return msg(L.ios);
    if ((await Notification.requestPermission()) !== 'granted') return msg(L.denied);
    const cfg = await j('/config'), key = Uint8Array.from(atob(cfg.vapid.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((cfg.vapid.length + 3) % 4)), c => c.charCodeAt(0));
    const reg = await navigator.serviceWorker.ready;
    const s = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await j('/push/public', 'POST', { endpoint: s.endpoint, lang: LG, topics });
    if (topics.t) try { localStorage.setItem('bsMyTeam', topics.t); } catch { }
    cur = topics; msg(L.ok);
  } catch (err) { msg(L.err); }
});
btn.addEventListener('click', () => open().catch(() => { }));
