// Σύγκριση παικτών για το Fantasy (2–4 παίκτες δίπλα-δίπλα). Το ίδιο render τρέχει στο build (αρχική εικόνα) και στον browser.
// Παίκτης (συμπαγής μορφή): [c, όνομα, ομάδα, θέση, κατάσταση, τιμή, πρόβλ. αλλαγή τιμής, % επιλογής, "PIR ≥ τιμή" (π.χ. "6/10"),
//   εκτίμηση PIR, p10, p90, επόμενες 3, επόμενες 5, L3, L5, L10, λεπτά (10), βαθμός αξίας, πρόγραμμα [[αγ, αντίπαλος, έδρα, PIR, δυσκολία]], slug]
export const K = { c: 0, n: 1, t: 2, pos: 3, st: 4, pr: 5, pch: 6, own: 7, ge: 8, pp: 9, p10: 10, p90: 11, p3: 12, p5: 13, l3: 14, l5: 15, l10: 16, m10: 17, gr: 18, nx: 19, s: 20 };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f1 = v => (v == null || Number.isNaN(v) ? '–' : (+v).toFixed(1));
const geN = g => { if (!g) return null; const [a, b] = g.split('/').map(Number); return b ? a / b : null; };
const vpc = (p, k) => (p[K.pr] ? p[k] / p[K.pr] : null);

// γραμμές: [label, τιμή για σύγκριση (μεγαλύτερο = καλύτερο, null = χωρίς highlight), εμφάνιση]
function rows(L, ps, teams, base) {
  const sg = v => (v == null ? '–' : v > 0 ? `<span class="pos">+${v.toFixed(1)}</span>` : v < 0 ? `<span class="neg">${v.toFixed(1)}</span>` : '0.0');
  const sched = p => (p[K.nx] || []).map(x => `<span class="cmpd d${x[4]}" title="${esc(L.rd)} ${x[0]} · ${esc(L.diff)} ${x[4]}/5 · ${f1(x[3])} PIR">${x[2] ? '' : '@'}${esc(x[1])}</span>`).join(' ') || '–';
  const avgD = p => { const n = (p[K.nx] || []); return n.length ? n.reduce((s, x) => s + x[4], 0) / n.length : null; };
  return [
    [L.price, null, p => `<b>${f1(p[K.pr])}</b>`],
    [L.pch, p => p[K.pch], p => sg(p[K.pch])],
    [L.own, null, p => (p[K.own] == null ? '–' : (p[K.own] < 1 ? p[K.own].toFixed(1) : Math.round(p[K.own])) + '%')],
    [L.next, p => p[K.pp], p => `<b>${f1(p[K.pp])}</b>`],
    [L.range, p => p[K.p90], p => `${f1(p[K.p10])}–${f1(p[K.p90])}`],
    [L.n3, p => p[K.p3], p => f1(p[K.p3])],
    [L.n5, p => p[K.p5], p => f1(p[K.p5])],
    [L.vpc, p => vpc(p, K.p3), p => { const v = vpc(p, K.p3); return v == null ? '–' : (v / 3).toFixed(2); }],
    [L.ge, p => geN(p[K.ge]), p => esc(p[K.ge] || '–')],
    [L.form, p => p[K.l5], p => `${f1(p[K.l3])} / ${f1(p[K.l5])} / ${f1(p[K.l10])}`],
    [L.min, p => p[K.m10], p => f1(p[K.m10])],
    [L.sched, p => { const d = avgD(p); return d == null ? null : -d; }, sched],
    [L.grade, null, p => esc(p[K.gr] || '–')],
  ];
}

export function verdict(L, ps) {
  if (ps.length < 2) return '';
  const best = f => ps.slice().sort((a, b) => (f(b) ?? -1e9) - (f(a) ?? -1e9))[0];
  const nm = p => `<b>${esc(p[K.n])}</b>`;
  const a = best(p => p[K.pp]), b = best(p => p[K.p5]), c = best(p => vpc(p, K.p3)), d = best(p => p[K.pch]);
  return `<ul class="cmpv"><li>${esc(L.vNext)}: ${nm(a)} (${f1(a[K.pp])})</li><li>${esc(L.v5)}: ${nm(b)} (${f1(b[K.p5])})</li><li>${esc(L.vVal)}: ${nm(c)}</li>${d[K.pch] != null ? `<li>${esc(L.vRise)}: ${nm(d)} (${d[K.pch] > 0 ? '+' : ''}${f1(d[K.pch])})</li>` : ''}</ul>`;
}

export function table(L, ps, teams, base) {
  if (!ps.length) return `<p class="sub">${esc(L.empty)}</p>`;
  const R = rows(L, ps, teams, base);
  const head = `<tr><th class="l"></th>${ps.map(p => `<th><a href="${esc(base + p[K.s] + '/')}">${esc(p[K.n])}</a><br><small>${esc(teams[p[K.t]] || p[K.t])} · ${esc(L.pos[p[K.pos]] || p[K.pos])}${p[K.st] && p[K.st] !== 'playing' ? ` · <span class="neg">${esc(L.st[p[K.st]] || p[K.st])}</span>` : ''}</small></th>`).join('')}</tr>`;
  const body = R.map(([lab, cmp, show]) => {
    let top = null;
    if (cmp && ps.length > 1) { const v = ps.map(cmp); const mx = Math.max(...v.filter(x => x != null)); if (Number.isFinite(mx) && v.filter(x => x === mx).length < ps.length) top = mx; }
    return `<tr><th class="l" scope="row">${esc(lab)}</th>${ps.map(p => `<td${top != null && cmp(p) === top ? ' class="cmpbest"' : ''}>${show(p)}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="tbl"><table class="cmpfx"><thead>${head}</thead><tbody>${body}</tbody></table></div>${verdict(L, ps)}`;
}
