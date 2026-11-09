// PRO κλείδωμα στον browser. Ο browser ΔΕΝ αποφασίζει τι θα δει ο χρήστης: εμφανίζει ό,τι επιστρέφει το PRO API,
// που στέλνει πλήρη picks/αναλύσεις μόνο σε ενεργό PRO. Για FREE δεν υπάρχει τίποτα κρυφό στη σελίδα για να «ξεκλειδωθεί».
const DISC = '21+. Το περιεχόμενο είναι στατιστική ανάλυση και όχι συμβουλή στοιχήματος. Παίζουμε υπεύθυνα, με χρήματα που αντέχουμε να χάσουμε. Κανένα σημείο δεν είναι σίγουρο.';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// ανάλυση: απλό κείμενο με **έντονα** και παραγράφους (όλα με escaping, κανένα HTML από τη βάση)
const rich = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const when = s => (s ? new Date(s).toLocaleString('el-GR', { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');
const units = x => `${x} ${x === 1 ? 'μονάδα' : 'μονάδες'}`;
let token = null; try { token = localStorage.getItem('bs_pro_session'); } catch { }
const locked = (title, sub = '') => `<a class="prolocked" href="/pro/"><span class="proicon" aria-hidden="true">🔒</span><span><b>${esc(title)}</b>${sub ? `<br><small>${esc(sub)}</small>` : ''}<br><span class="procta">Δες το με PRO →</span></span></a>`;

async function get(api, path) {
  const h = {}; if (token) h.authorization = `Bearer ${token}`;
  const r = await fetch(api + path, { headers: h });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
const RES = { won: ['Κέρδισε', 'pos'], lost: ['Χάθηκε', 'neg'], void: ['Άκυρο', ''] };
function pickCard(p) {
  if (p.locked && p.result === 'pending') return locked('High Fidelity Pick', `${p.match_label} · ${when(p.starts_at)}`);
  const r = RES[p.result];
  return `<div class="propick"><div class="sub">${esc(p.match_label)} · ${when(p.starts_at)}</div>
<div class="propickm">${p.player ? `<b>${esc(p.player)}</b> ` : ''}${esc(p.market)} <b>@${Number(p.odds).toFixed(2)}</b></div>
<div class="sub">Stake: ${units(p.stake)} · Δημοσίευση: ${when(p.published_at)}${r ? ` · <span class="${r[1]}">${r[0]} (${p.profit > 0 ? '+' : ''}${p.profit} μ.)</span>` : ''}</div>
${p.analysis ? `<div class="propicka">${rich(p.analysis)}</div>` : p.locked ? '<div class="sub"><a href="/pro/">Η ανάλυση είναι για PRO →</a></div>' : ''}
<p class="prodisc small">${esc(DISC)}</p></div>`;
}

for (const box of document.querySelectorAll('.prolock')) {
  const api = box.dataset.api;
  (async () => {
    try {
      if (!api) throw 0;
      if (box.dataset.kind === 'picks') {
        const { j } = await get(api, '/v1/picks?status=open');
        const ps = (j.picks || []).filter(p => p.result === 'pending');
        box.innerHTML = ps.length ? `<h3>High Fidelity Picks</h3>${ps.map(pickCard).join('')}` : '';
      } else if (box.dataset.kind === 'analysis') {
        const { status, j } = await get(api, `/v1/analyses/${encodeURIComponent(box.dataset.gid)}`);
        if (status === 404 || !j.exists) { box.innerHTML = ''; return; }
        box.innerHTML = j.locked ? `<section>${locked('Ανάλυση Αγώνα →')}</section>` : `<section class="proanalysis"><h2>Ανάλυση Αγώνα <span class="probadge">PRO</span></h2>${rich(j.body)}<p class="prodisc small">${esc(DISC)}</p></section>`;
      }
    } catch { box.innerHTML = box.dataset.kind === 'picks' ? locked('High Fidelity Picks', 'Οι επιλογές της αγωνιστικής') : ''; }
  })();
}
