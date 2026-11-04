// «Μάντεψε τον παίκτη»: καθημερινό παιχνίδι. Ο ίδιος κρυφός παίκτης για όλους κάθε μέρα (ώρα Ελλάδας).

export function dayKey(d = new Date()) { return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Athens' }); }
export function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export const dailyIndex = (n, day) => hash('bbs-' + day) % n;
// σύγκριση μιας απάντησης με τον στόχο: ok / near / no και κατεύθυνση
export function compare(g, t) {
  const num = (a, b, near) => (a == null || b == null ? { s: 'no', d: '' } : a === b ? { s: 'ok', d: '' } : { s: Math.abs(a - b) <= near ? 'near' : 'no', d: a < b ? '↑' : '↓' });
  return {
    team: { s: g.t === t.t ? 'ok' : 'no' },
    pos: { s: g.pos === t.pos ? 'ok' : 'no' },
    nat: { s: g.nat === t.nat ? 'ok' : 'no' },
    h: num(g.h, t.h, 5), age: num(g.age, t.age, 2), no: num(g.no, t.no, 2), pir: num(g.pir, t.pir, 3),
  };
}

function init(root) {
  const C = JSON.parse(root.querySelector('.gj').textContent);
  const L = C.L, P = C.pool.map(([id, n, t, pos, h, age, nat, no, pir, url]) => ({ id, n, t, pos, h, age, nat, no: no === '' || no == null ? null : +no, pir, url }));
  const MAX = 8, day = dayKey();
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  let practice = false, target, guesses;
  const start = (pr = false) => {
    practice = pr;
    target = pr ? P[Math.floor(Math.random() * P.length)] : P[dailyIndex(P.length, day)];
    guesses = pr ? [] : store.get('guess-' + day, []).map(id => P.find(p => p.id === id)).filter(Boolean);
    render();
  };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const done = () => guesses.some(g => g.id === target.id) || guesses.length >= MAX;
  const won = () => guesses.some(g => g.id === target.id);

  function render() {
    const cell = (c, v) => `<td class="gc ${c.s}">${esc(v)}${c.d ? ` <b>${c.d}</b>` : ''}</td>`;
    const rows = guesses.map(g => { const c = compare(g, target); return `<tr><td class="l"><b>${esc(g.n)}</b></td>${cell(c.team, C.teams[g.t] || g.t)}${cell(c.pos, L.pos[g.pos] || g.pos)}${cell(c.h, g.h ? g.h + ' cm' : '–')}${cell(c.age, g.age ?? '–')}${cell(c.nat, g.nat || '–')}${cell(c.no, g.no ?? '–')}${cell(c.pir, g.pir)}</tr>`; }).join('');
    const st = store.get('guess-stats', { played: 0, wins: 0, streak: 0, best: 0, dist: {} });
    const fin = done();
    root.innerHTML = `<div class="ghead"><span>${practice ? L.practice : `${L.daily} · ${day}`}</span><span>${guesses.length}/${MAX}</span></div>
      ${fin ? '' : `<input type="search" list="gList" class="cmpq gq" placeholder="${L.ph}" aria-label="${L.ph}" autocomplete="off"><datalist id="gList">${P.filter(p => !guesses.includes(p)).map(p => `<option value="${esc(p.n)}">`).join('')}</datalist>`}
      <div class="tbl"><table class="antbl gtbl"><thead><tr><th class="l">${L.player}</th><th>${L.team}</th><th>${L.position}</th><th>${L.height}</th><th>${L.age}</th><th>${L.nat}</th><th>#</th><th>PIR</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="sub">${L.legend}</p>
      ${fin ? `<div class="gres ${won() ? 'win' : 'lose'}"><h3>${won() ? L.win : L.lose}</h3><p>${L.answer}: <a href="${target.url}"><b>${esc(target.n)}</b></a> (${esc(C.teams[target.t] || target.t)})</p>
        ${practice ? '' : `<p class="sub">${L.stats}: ${st.played} ${L.played} · ${st.played ? Math.round(100 * st.wins / st.played) : 0}% ${L.wins} · ${L.streak} ${st.streak} · ${L.best} ${st.best}</p><button type="button" class="btnsm gshare">${L.share}</button>`}
        <button type="button" class="btnsm gprac">${L.again}</button></div>` : ''}`;
    const q = root.querySelector('.gq');
    if (q) {
      q.focus();
      q.addEventListener('change', () => {
        const p = P.find(x => x.n.toLowerCase() === q.value.trim().toLowerCase());
        if (!p || guesses.includes(p)) return;
        guesses.push(p);
        if (!practice) {
          store.set('guess-' + day, guesses.map(g => g.id));
          if (done()) {
            const s = store.get('guess-stats', { played: 0, wins: 0, streak: 0, best: 0, dist: {}, last: null });
            if (s.last !== day) { s.played++; s.last = day; if (won()) { s.wins++; s.streak = s.lastWin === prevDay(day) ? s.streak + 1 : 1; s.lastWin = day; s.best = Math.max(s.best, s.streak); s.dist[guesses.length] = (s.dist[guesses.length] || 0) + 1; } else s.streak = 0; store.set('guess-stats', s); }
          }
        }
        render();
      });
    }
    root.querySelector('.gprac')?.addEventListener('click', () => start(true));
    root.querySelector('.gshare')?.addEventListener('click', async e => {
      const em = guesses.map(g => { const c = compare(g, target); return ['team', 'pos', 'h', 'age', 'nat', 'no', 'pir'].map(k => (c[k].s === 'ok' ? '🟩' : c[k].s === 'near' ? '🟨' : '⬜')).join(''); }).join('\n');
      const txt = `${L.title} ${day} ${won() ? guesses.length : 'X'}/${MAX}\n${em}\n${location.origin + location.pathname}`;
      try { if (navigator.share) await navigator.share({ text: txt }); else { await navigator.clipboard.writeText(txt); e.target.textContent = L.copied; } } catch { }
    });
  }
  const prevDay = d => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
  start(false);
}

const root = typeof document !== 'undefined' && document.getElementById('guessApp');
if (root) init(root);
