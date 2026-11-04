// Scenario simulator του Matchup Center (στη σελίδα του αγώνα).
import { simulate } from './sim.mjs';

const box = document.getElementById('mcSim');
if (box) {
  const J = JSON.parse(box.querySelector('.mcj').textContent);
  const g = J.g, [H, A] = J.names, L = J.L, lg = document.documentElement.lang || 'el';
  const TX = {
    el: { venue: 'Ανεστραμμένη έδρα', rest: 'Μέρες ξεκούρασης', out: 'Απουσίες (τικ = λείπει)', pace: 'Pace (κατοχές)', def: 'Άμυνα (± πόντοι/100 που δέχεται)', reset: 'Επαναφορά', margin: 'Διαφορά', note: 'Οι αλλαγές βασίζονται σε ευαισθησίες που υπολόγισε το ίδιο το μοντέλο (έδρα, ξεκούραση, απουσίες). Pace και άμυνα εφαρμόζονται αναλυτικά.' },
    en: { venue: 'Swap home court', rest: 'Rest days', out: 'Absences (tick = out)', pace: 'Pace (possessions)', def: 'Defense (± points allowed per 100)', reset: 'Reset', margin: 'Margin', note: 'Changes use sensitivities computed by the model itself (venue, rest, absences). Pace and defense are applied analytically.' },
    es: { venue: 'Invertir la pista', rest: 'Días de descanso', out: 'Bajas (marcado = no juega)', pace: 'Ritmo (posesiones)', def: 'Defensa (± puntos recibidos por 100)', reset: 'Restablecer', margin: 'Diferencia', note: 'Los cambios usan sensibilidades calculadas por el propio modelo (pista, descanso, bajas). Ritmo y defensa se aplican analíticamente.' },
    sr: { venue: 'Zameni domaći teren', rest: 'Dani odmora', out: 'Odsutni (štiklirano = ne igra)', pace: 'Tempo (posedi)', def: 'Odbrana (± primljeni poeni na 100)', reset: 'Resetuj', margin: 'Razlika', note: 'Promene koriste osetljivosti koje je izračunao sam model (teren, odmor, odsustva). Tempo i odbrana se primenjuju analitički.' },
  }[lg] || {};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const pl = g.sim.players || [];
  const plBox = side => pl.filter(p => p.side === side).map(p => `<label class="chk"><input type="checkbox" data-out="${p.id}"${p.out ? ' checked' : ''}> ${esc(J.pn[p.id] || p.id)} <small>${Math.round(p.min)}′</small></label>`).join('');
  box.innerHTML = `<div class="mcsimg">
    <label class="chk"><input type="checkbox" data-k="swap"> ${TX.venue}</label>
    <label>${TX.rest}: ${esc(H)} <input type="number" min="1" max="10" value="${g.h_rest}" data-k="hRest"></label>
    <label>${TX.rest}: ${esc(A)} <input type="number" min="1" max="10" value="${g.a_rest}" data-k="aRest"></label>
    <label>${TX.pace} <input type="range" min="${Math.round(g.pace - 10)}" max="${Math.round(g.pace + 10)}" step="0.5" value="${g.pace}" data-k="pace"> <output data-o="pace">${g.pace.toFixed(1)}</output></label>
    <label>${TX.def}: ${esc(H)} <input type="range" min="-10" max="10" step="0.5" value="0" data-k="hDrtg"> <output data-o="hDrtg">0</output></label>
    <label>${TX.def}: ${esc(A)} <input type="range" min="-10" max="10" step="0.5" value="0" data-k="aDrtg"> <output data-o="aDrtg">0</output></label>
  </div>
  <p class="sub">${TX.out}</p><div class="mates"><b>${esc(H)}:</b> ${plBox('h')}</div><div class="mates"><b>${esc(A)}:</b> ${plBox('a')}</div>
  <div class="mcres" aria-live="polite"></div><button type="button" class="mcreset">${TX.reset}</button><p class="sub">${TX.note}</p>`;
  const res = box.querySelector('.mcres');
  const run = () => {
    const v = k => box.querySelector(`[data-k="${k}"]`);
    const o = { swapVenue: v('swap').checked, hRest: +v('hRest').value, aRest: +v('aRest').value, pace: +v('pace').value, hDrtg: +v('hDrtg').value, aDrtg: +v('aDrtg').value,
      out: new Set([...box.querySelectorAll('[data-out]:checked')].map(x => x.dataset.out)) };
    for (const k of ['pace', 'hDrtg', 'aDrtg']) box.querySelector(`[data-o="${k}"]`).textContent = (+v(k).value).toFixed(1);
    const r = simulate(g, o), ph = Math.round(r.p_home * 100);
    res.innerHTML = `<div class="mcbar"><i style="width:${ph}%"></i></div><p><b>${esc(H)} ${ph}%</b> – <b>${esc(A)} ${100 - ph}%</b> · ${L.score}: <b>${Math.round(r.hs)}-${Math.round(r.as)}</b> · ${TX.margin}: <b>${r.margin > 0 ? '+' : ''}${r.margin.toFixed(1)}</b> · ${L.total}: <b>${r.total.toFixed(1)}</b></p>`;
  };
  box.addEventListener('input', run);
  box.querySelector('.mcreset').addEventListener('click', () => {
    box.querySelector('[data-k="swap"]').checked = false;
    box.querySelector('[data-k="hRest"]').value = g.h_rest; box.querySelector('[data-k="aRest"]').value = g.a_rest;
    box.querySelector('[data-k="pace"]').value = g.pace; box.querySelector('[data-k="hDrtg"]').value = 0; box.querySelector('[data-k="aDrtg"]').value = 0;
    box.querySelectorAll('[data-out]').forEach(x => { x.checked = pl.find(p => p.id === x.dataset.out)?.out || false; });
    run();
  });
  run();
}
