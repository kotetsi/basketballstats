// «Ρώτα το BasketballStats»: σύνδεση του κουτιού με τη λογική του ask.mjs (γραπτά ή με φωνή, από τον browser)
import { buildIndex, answer, texts } from './ask.mjs?v=2';

const athensToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const SPEECH = { el: 'el-GR', en: 'en-GB', es: 'es-ES', sr: 'sr-RS', tr: 'tr-TR' };
let dataP = null;

for (const box of document.querySelectorAll('.askbox')) {
  if (box.dataset.ready) continue; box.dataset.ready = '1';
  let ctx; try { ctx = JSON.parse(box.querySelector('.askctx').textContent); } catch { continue; }
  const X = texts(ctx.lg), form = box.querySelector('form'), inp = form.q, out = box.querySelector('.aska'), mic = box.querySelector('.askmic');
  const load = () => (dataP ||= fetch(ctx.api, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(D => ({ D, idx: buildIndex(D) })));
  inp.addEventListener('focus', () => { load().catch(() => {}); }, { once: true });
  const ask = async q => {
    q = (q || '').trim(); if (!q) return;
    out.innerHTML = '<p class="sub">…</p>';
    try { const { D, idx } = await load(); out.innerHTML = answer(q, D, idx, athensToday(), ctx.lg).html; }
    catch { out.innerHTML = '<p class="sub">⚠️</p>'; }
    try { window.gtag?.('event', 'ask_question', { q: q.slice(0, 100) }); } catch { }
  };
  form.addEventListener('submit', e => { e.preventDefault(); ask(inp.value); });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && mic) {
    mic.hidden = false;
    mic.addEventListener('click', () => {
      const r = new SR(); r.lang = SPEECH[ctx.lg] || 'el-GR'; r.interimResults = false; r.maxAlternatives = 1;
      const ph = inp.placeholder; inp.placeholder = X.listen; mic.classList.add('on');
      r.onresult = e => { const t = e.results[0][0].transcript; inp.value = t; ask(t); };
      r.onend = () => { inp.placeholder = ph; mic.classList.remove('on'); };
      r.onerror = r.onend;
      try { r.start(); } catch { r.onend(); }
    });
  }
}
