// Σελίδα /fantasy/model-performance/: στατικό HTML + inline SVG από data/fantasy/perf/report.json και optimizer.json.
// Κάθε γράφημα έχει πίνακα δίπλα (table view + CSV), tooltips σε κάθε σημάδι και εμφανίζει πάντα το n.

const SER = ['--s1', '--s2', '--s3', '--s4'];   // σταθερή σειρά χρωμάτων ανά μοντέλο (ορίζεται στο CSS)
const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '–' : (+x).toFixed(d));
const pc = (x, d = 0) => (x == null ? '–' : (100 * x).toFixed(d) + '%');

export function perfHTML(rep, opt, ctx) {
  const { T, esc, csvBase, fx } = ctx;
  const L = T;
  const act = rep.active, A = rep.all, C = rep.current;
  const models = rep.models.map(m => m.id);
  const order = [act, ...models.filter(m => m !== act)];
  const colorOf = Object.fromEntries(order.map((m, i) => [m, SER[i % SER.length]]));
  const mname = m => (m === 'roll10-avg' ? L('Μέσος όρος 10 αγώνων', '10-game average') : m === 'pos-avg' ? L('Μέσος όρος θέσης', 'Positional average') : m);
  const tip = (t) => `<span class="pfi" tabindex="0" title="${esc(t)}" aria-label="${esc(t)}">ⓘ</span>`;
  const nTxt = n => `<small class="pfn">n=${(n ?? 0).toLocaleString('el-GR')}</small>`;
  const hiddenTxt = L(`κρυφό (n < ${rep.min_n})`, `hidden (n < ${rep.min_n})`);
  const table = (id, head, rows) => `<div class="tbl"><table class="antbl pftbl" id="${id}"><thead><tr>${head.map((h, i) => `<th${i ? '' : ' class="l"'}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? '' : ' class="l"'}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="pfcsv"><button type="button" data-csv="${id}">CSV ↓</button></p>`;

  // ---------- KPI cards
  const P = A.pir, FP = A.fp, IV = A.interval, cap = rep.captain, os = opt?.summary?.[act];
  const kpi = (lbl, val, sub, t) => `<div class="pfk"><span>${esc(lbl)} ${tip(t)}</span><b>${val}</b><small>${sub}</small></div>`;
  const kpis = `<div class="pfkpis">
${kpi(L('PIR MAE', 'PIR MAE'), f(P.mae), `${L('απλός μ.ό.', 'simple avg')} ${f(rep.compare.all.find(x => x.model === 'roll10-avg')?.mae)} · n=${P.n}`, L('Μέσο απόλυτο σφάλμα της εκτίμησης PIR: κατά πόσο απέχει κατά μέσο όρο η εκτίμηση από το πραγματικό PIR. Μικρότερο = καλύτερο.', 'Mean absolute error of the PIR projection. Lower is better.'))}
${kpi(L('Fantasy points MAE', 'Fantasy points MAE'), f(FP.mae), `n=${FP.n}`, L('Το ίδιο για τους fantasy πόντους (PIR × 1,1 στη νίκη), με την εκτίμηση να περιέχει την πιθανότητα νίκης.', 'Same for fantasy points (PIR × 1.1 on a win).'))}
${kpi(L('Correlation', 'Correlation'), f(P.corr), `R² ${f(P.r2)}`, L('Συσχέτιση εκτίμησης και πραγματικού (1 = τέλεια, 0 = καμία). Το R² δείχνει τι ποσοστό της διακύμανσης εξηγεί το μοντέλο.', 'Correlation between projection and actual; R² = share of variance explained.'))}
${kpi(L('Hit rate over/under', 'Over/under hit rate'), pc(P.ou_hit, 1), `${L('σε', 'on')} ${P.ou_n} ${L('επιλογές', 'picks')}`, L('Εσωτερική γραμμή = μέσος όρος PIR 10 αγώνων του παίκτη (στο x,5). Μετράμε μόνο όπου το μοντέλο διαφέρει ≥ 1 PIR από τη γραμμή: πόσες φορές βρήκε σωστά «πάνω» ή «κάτω».', 'Internal line = player’s 10-game PIR average (at x.5); only where the model differs by ≥1 PIR.'))}
${kpi(L('Κάλυψη P10–P90', 'P10–P90 coverage'), pc(IV.coverage_80, 1), L('στόχος 80%', 'target 80%'), L('Πόσα πραγματικά αποτελέσματα έπεσαν μέσα στο εύρος P10–P90. Αν το μοντέλο είναι σωστά βαθμονομημένο, περίπου 80%.', 'Share of actual results inside P10–P90; ~80% if calibrated.'))}
${os ? kpi(L('Optimizer percentile', 'Optimizer percentile'), pc(os.median_pct), `top 25%: ${pc(os.top25)} · n=${os.n}`, L('Θέση της σύνθεσης του optimizer ανάμεσα σε 2.000 τυχαίες έγκυρες συνθέσεις κάθε αγωνιστικής (διάμεσος). 50% = όσο μια τυχαία, 100% = καλύτερη από όλες.', 'Median rank of the optimizer lineup among 2,000 random valid lineups per round.')) : ''}
${kpi(L('Αρχηγός στο top 10', 'Captain in top 10'), cap.hidden ? '–' : pc(cap.top10_rate), `n=${cap.n}${cap.hidden ? ' · ' + hiddenTxt : ''}`, L('Πόσες φορές η πρόταση αρχηγού (Captain Advisor) ήταν μέσα στους 10 καλύτερους παίκτες της αγωνιστικής σε πραγματικούς πόντους.', 'How often the Captain Advisor pick was among the round’s top 10.'))}
</div>`;

  // ---------- γραφήματα
  const W = 640, H = 240, M = { l: 44, r: 12, t: 12, b: 34 };
  const svg = (inner, w = W, h = H, label = '') => `<svg class="pfsvg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${inner}</svg>`;
  const yAxis = (lo, hi, h, w, ticks = 4, fmt = v => f(v, 1)) => { let s = ''; for (let i = 0; i <= ticks; i++) { const v = lo + ((hi - lo) * i) / ticks, y = h - M.b - ((h - M.t - M.b) * i) / ticks; s += `<line class="pfg" x1="${M.l}" x2="${w - M.r}" y1="${y}" y2="${y}"/><text class="pft" x="${M.l - 6}" y="${y + 4}" text-anchor="end">${fmt(v)}</text>`; } return s; };

  function calibChart(cal) {
    const pts = cal.filter(x => !x.hidden);
    if (!pts.length) return '';
    const hi = Math.max(...pts.map(x => Math.max(x.proj, x.actual))) * 1.1, lo = Math.min(0, ...pts.map(x => Math.min(x.proj, x.actual)));
    const X = v => M.l + ((W - M.l - M.r) * (v - lo)) / (hi - lo), Y = v => H - M.b - ((H - M.t - M.b) * (v - lo)) / (hi - lo);
    let s = yAxis(lo, hi, H, W);
    s += `<line class="pfdiag" x1="${X(lo)}" y1="${Y(lo)}" x2="${X(hi)}" y2="${Y(hi)}"/>`;
    s += `<polyline class="pfline" style="stroke:var(${colorOf[act]})" points="${pts.map(p => `${X(p.proj)},${Y(p.actual)}`).join(' ')}"/>`;
    s += pts.map(p => `<circle class="pfdot" cx="${X(p.proj)}" cy="${Y(p.actual)}" r="5" style="fill:var(${colorOf[act]})"><title>${esc(L(`Εκτίμηση ${p.bucket}: μέση εκτίμηση ${f(p.proj)}, μέσο πραγματικό ${f(p.actual)} (n=${p.n})`, `Projection ${p.bucket}: mean projection ${f(p.proj)}, mean actual ${f(p.actual)} (n=${p.n})`))}</title></circle>`).join('');
    s += `<text class="pft" x="${(W + M.l) / 2}" y="${H - 6}" text-anchor="middle">${esc(L('μέση εκτίμηση PIR', 'mean projected PIR'))}</text><text class="pft" x="${W - M.r}" y="${Y(hi) + 12}" text-anchor="end">${esc(L('διαγώνιος = τέλειο', 'diagonal = perfect'))}</text>`;
    return svg(s, W, H, L('Calibration εκτίμησης PIR', 'PIR calibration'));
  }
  function qCurve(qc, label) {
    if (!qc || qc.hidden) return '';
    const X = v => M.l + (W - M.l - M.r) * v, Y = v => H - M.b - (H - M.t - M.b) * v;
    let s = yAxis(0, 1, H, W, 4, v => Math.round(v * 100) + '%');
    s += `<line class="pfdiag" x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}"/>`;
    s += `<polyline class="pfline" style="stroke:var(${colorOf[act]})" points="${qc.curve.map(c => `${X(c.q)},${Y(c.observed)}`).join(' ')}"/>`;
    s += qc.curve.map(c => `<circle class="pfdot" cx="${X(c.q)}" cy="${Y(c.observed)}" r="5" style="fill:var(${colorOf[act]})"><title>${esc(L(`Quantile ${Math.round(c.q * 100)}%: πραγματικά κάτω από αυτό ${pc(c.observed, 1)}`, `Quantile ${Math.round(c.q * 100)}%: observed below ${pc(c.observed, 1)}`))}</title></circle>`).join('');
    for (const q of [0.1, 0.5, 0.9]) s += `<text class="pft" x="${X(q)}" y="${H - M.b + 16}" text-anchor="middle">${Math.round(q * 100)}%</text>`;
    s += `<text class="pft" x="${(W + M.l) / 2}" y="${H - 4}" text-anchor="middle">${esc(L('quantile της εκτίμησης', 'predicted quantile'))}</text>`;
    return svg(s, W, H, label);
  }
  function hist(h) {
    const mx = Math.max(...h.map(x => x.n)), bw = (W - M.l - M.r) / h.length;
    let s = yAxis(0, mx, H, W, 4, v => Math.round(v));
    s += h.map((b, i) => { const hh = ((H - M.t - M.b) * b.n) / mx, x = M.l + i * bw; return `<rect class="pfbar" x="${x + 1}" y="${H - M.b - hh}" width="${bw - 2}" height="${hh}" rx="2" style="fill:var(${colorOf[act]})"><title>${esc(`${f(b.from, 1)} … ${f(b.to, 1)}: ${b.n}`)}</title></rect>`; }).join('');
    for (const v of [-30, -15, 0, 15, 30]) { const i = (v + 30) / 2.5; s += `<text class="pft" x="${M.l + i * bw}" y="${H - M.b + 16}" text-anchor="middle">${v > 0 ? '+' : ''}${v}</text>`; }
    s += `<line class="pfzero" x1="${M.l + 12 * bw}" x2="${M.l + 12 * bw}" y1="${M.t}" y2="${H - M.b}"/><text class="pft" x="${(W + M.l) / 2}" y="${H - 4}" text-anchor="middle">${esc(L('σφάλμα = πραγματικό − εκτίμηση (PIR)', 'error = actual − projected (PIR)'))}</text>`;
    return svg(s, W, H, L('Κατανομή σφαλμάτων', 'Error distribution'));
  }
  function barsH(groups, lblOf, key = 'mae', BW = W) {
    const g = groups.filter(x => !x.hidden && x[key] != null);
    if (!g.length) return '';
    const rowH = 30, h = M.t + rowH * groups.length + 8, mx = Math.max(...g.map(x => x[key])) * 1.12, LW = BW < W ? 112 : 130;
    let s = '';
    groups.forEach((x, i) => {
      const y = M.t + i * rowH;
      s += `<text class="pft pfl" x="${LW - 8}" y="${y + 18}" text-anchor="end">${esc(lblOf(x.group))}</text>`;
      if (x.hidden || x[key] == null) { s += `<text class="pft" x="${LW}" y="${y + 18}">${esc(hiddenTxt)} · n=${x.n}</text>`; return; }
      const w = ((BW - LW - 90) * x[key]) / mx;
      s += `<rect class="pfbar" x="${LW}" y="${y + 6}" width="${w}" height="${rowH - 12}" rx="3" style="fill:var(${colorOf[act]})"><title>${esc(`${lblOf(x.group)}: MAE ${f(x.mae)}, RMSE ${f(x.rmse)}, bias ${f(x.bias)}, n=${x.n}`)}</title></rect><text class="pft pfv" x="${LW + w + 6}" y="${y + 18}">${f(x[key])} <tspan class="pfnn">n=${x.n}</tspan></text>`;
    });
    return svg(s, BW, h, 'MAE');
  }
  function lines(seriesBy, key = 'mae', label = '') {
    // x = κοινή σειρά (σεζόν, αγωνιστική)· ένα κενό ανάμεσα στις σεζόν
    const keys = [...new Set(Object.values(seriesBy).flat().map(x => `${x.season}|${x.round}`))].sort((a, b) => { const [sa, ra] = a.split('|'), [sb, rb] = b.split('|'); return sa.localeCompare(sb) || ra - rb; });
    if (keys.length < 2) return '';
    const vals = Object.values(seriesBy).flat().map(x => x[key]).filter(v => v != null);
    const lo = Math.floor(Math.min(...vals) * 0.95), hi = Math.ceil(Math.max(...vals) * 1.05);
    const X = k => M.l + ((W - M.l - M.r) * keys.indexOf(k)) / (keys.length - 1), Y = v => H - M.b - ((H - M.t - M.b) * (v - lo)) / (hi - lo || 1);
    let s = yAxis(lo, hi, H, W);
    let prevS = null; keys.forEach(k => { const S = k.split('|')[0]; if (S !== prevS) { s += `<text class="pft" x="${Math.min(X(k), W - M.r)}" y="${H - M.b + 16}"${X(k) > W - 70 ? ' text-anchor="end"' : ''}>${S.slice(1)}-${String(+S.slice(1) + 1).slice(2)}</text>`; if (prevS) s += `<line class="pfg" x1="${X(k)}" x2="${X(k)}" y1="${M.t}" y2="${H - M.b}"/>`; prevS = S; } });
    for (const [m, ser] of Object.entries(seriesBy)) {
      const pts = ser.filter(x => x[key] != null).sort((a, b) => a.season.localeCompare(b.season) || a.round - b.round);
      // διακοπή γραμμής ανάμεσα στις σεζόν
      const segs = []; let cur = [];
      pts.forEach((p, i) => { if (i && p.season !== pts[i - 1].season) { segs.push(cur); cur = []; } cur.push(p); }); segs.push(cur);
      s += segs.map(sg => `<polyline class="pfline" style="stroke:var(${colorOf[m]})" points="${sg.map(p => `${X(p.season + '|' + p.round)},${Y(p[key])}`).join(' ')}"/>`).join('');
      s += pts.map(p => `<circle class="pfhit" cx="${X(p.season + '|' + p.round)}" cy="${Y(p[key])}" r="7"><title>${esc(`${mname(m)} · ${p.season} ${L('αγωνιστική', 'round')} ${p.round}: ${f(p[key])} (n=${p.n})`)}</title></circle>`).join('');
    }
    return svg(s, W, H, label);
  }
  const legend = ms => ms.length < 2 ? '' : `<p class="pfleg">${ms.map(m => `<span><i style="background:var(${colorOf[m]})"></i>${esc(mname(m))}</span>`).join('')}</p>`;

  // ---------- ετικέτες ομάδων
  const G = {
    Guard: L('Γκαρντ', 'Guard'), Forward: L('Φόργουορντ', 'Forward'), Center: L('Σέντερ', 'Center'), starter: L('Πιθανός βασικός', 'Likely starter'), bench: L('Από τον πάγκο', 'Bench'),
    home: L('Έδρα', 'Home'), away: L('Εκτός', 'Away'), rest: L('Ξεκούραση', 'Rested'), b2b: 'Back-to-back', regular: L('Σταθερός ρόλος', 'Stable role'), new: L('Νέος (<3 αγώνες)', 'New (<3 games)'),
    after_absence: L('Μετά από απουσία', 'After absence'), role_change: L('Αλλαγή ρόλου', 'Role change'),
  };
  const gl = g => G[g] || (/^E\d{4}$/.test(g) ? `${g.slice(1)}-${String(+g.slice(1) + 1).slice(2)}` : String(g));
  const grpTable = (id, rows) => table(id, [L('Ομάδα', 'Group'), 'n', 'MAE', 'RMSE', 'Bias', 'Corr', L('Κατεύθυνση', 'Directional'), 'FP MAE', 'P10–P90'],
    rows.map(x => x.hidden ? [esc(gl(x.group)), x.n, hiddenTxt, '', '', '', '', '', ''] : [esc(gl(x.group)), x.n, f(x.mae), f(x.rmse), f(x.bias), f(x.corr), pc(x.directional), f(x.fp_mae), pc(x.coverage_80)]));
  const grpSec = (id, h, t, rows, narrow = false) => `<section class="pfsec"><h3>${esc(h)} ${tip(t)}</h3>${barsH(rows, gl, 'mae', narrow ? 400 : W)}<details><summary>${esc(L('Πίνακας', 'Table'))}</summary>${grpTable(id, rows)}</details></section>`;

  // ---------- σύγκριση εκδόσεων
  const optS = opt?.summary || {};
  const cmpRows = (rep.compare.all || []).map(x => [`${x.best ? '★ ' : ''}${esc(mname(x.model))}${x.model === act ? ` <span class="pfact">${esc(L('ενεργό', 'active'))}</span>` : ''}`, x.n, f(x.mae), f(x.rmse), f(x.corr), f(x.r2), pc(x.ou_hit), pc(x.coverage_80), f(x.ece, 3), optS[x.model] ? pc(optS[x.model].median_pct) : '–', x.captain_top10 == null ? `<span title="n=${x.captain_n}">–</span>` : pc(x.captain_top10)]);
  const verTable = table('pf-versions', [L('Μοντέλο', 'Model'), 'n', 'MAE', 'RMSE', 'Corr', 'R²', 'Hit O/U', 'P10–P90', 'ECE', L('Optimizer pct', 'Optimizer pct'), L('Αρχηγός top 10', 'Captain top 10')], cmpRows);
  const reg = rep.registry || {};
  const regRows = (reg.versions || []).map(v => [esc(v.id), esc(v.engine || ''), esc(v.status || ''), esc(v.created || ''), esc(v.description || '')]);

  // ---------- optimizer
  let optSec = '';
  if (opt?.rounds?.length) {
    const rr = opt.rounds.filter(r => r.models?.[act]?.points != null);
    const bw = (W - M.l - M.r) / Math.max(rr.length, 1);
    let s = yAxis(0, 1, H, W, 4, v => Math.round(v * 100) + '%');
    s += `<line class="pfzero" x1="${M.l}" x2="${W - M.r}" y1="${H - M.b - (H - M.t - M.b) * 0.5}" y2="${H - M.b - (H - M.t - M.b) * 0.5}"/>`;
    s += rr.map((r, i) => { const m = r.models[act], hh = (H - M.t - M.b) * m.pct; return `<rect class="pfbar" x="${M.l + i * bw + 1}" y="${H - M.b - hh}" width="${Math.max(bw - 2, 1)}" height="${hh}" rx="2" style="fill:var(${colorOf[act]})"><title>${esc(`${r.season} ${L('αγωνιστική', 'round')} ${r.round}: ${L('optimizer', 'optimizer')} ${f(m.points, 1)} · ${L('τυχαίες (μ.ό.)', 'random (mean)')} ${f(r.random.mean, 1)} · ${L('τέλεια', 'perfect')} ${f(r.best, 1)} · percentile ${pc(m.pct)}`)}</title></rect>`; }).join('');
    s += `<text class="pft" x="${(W + M.l) / 2}" y="${H - 6}" text-anchor="middle">${esc(L('κάθε στήλη = μία αγωνιστική · γραμμή = 50% (όσο μια τυχαία σύνθεση)', 'each bar = one round · line = 50% (a random lineup)'))}</text>`;
    const oRows = Object.entries(optS).map(([m, x]) => [esc(mname(m)), x.n, x.n ? pc(x.median_pct) : '–', pc(x.avg_pct), pc(x.top10), pc(x.top25), f(x.avg_rank, 0), f(x.points, 1), (x.above_random > 0 ? '+' : '') + f(x.above_random, 1), '−' + f(x.below_best, 1), pc(x.captain_acc), pc(x.arrangement_opt)]);
    optSec = `<section class="pfsec" id="optimizer"><h2>${esc(L('Optimizer backtest', 'Optimizer backtest'))} ${tip(L('Για κάθε αγωνιστική τρέχει ο ίδιος solver του site με τις εκτιμήσεις που υπήρχαν πριν από αυτή. Συγκρίνουμε τους πραγματικούς πόντους της σύνθεσης με 2.000 τυχαίες έγκυρες συνθέσεις, την τέλεια και τη χειρότερη (με γνώση των αποτελεσμάτων), και με τον ίδιο optimizer πάνω σε απλά μοντέλα (baseline).', 'For each round the site’s solver runs on the projections available before it, compared with 2,000 random valid lineups, the perfect and worst lineups, and the same optimizer on simple baselines.'))}</h2>
${svg(s, W, H, 'Optimizer percentile')}
${table('pf-optimizer', [L('Projections', 'Projections'), L('Αγωνιστικές', 'Rounds'), L('Διάμεσο pct', 'Median pct'), L('Μέσο pct', 'Mean pct'), 'Top 10%', 'Top 25%', L('Μέση θέση /2000', 'Avg rank /2000'), L('Πόντοι', 'Points'), L('vs τυχαίες', 'vs random'), L('vs τέλεια', 'vs perfect'), L('Αρχηγός σωστός', 'Captain right'), L('Πάγκος βέλτιστος', 'Bench optimal')], oRows)}
<p class="note">${esc(L(`Απλοποιήσεις: ένα turn ανά αγωνιστική (χωρίς αλλαγές μέσα στον γύρο), χωρίς προπονητή, budget ${opt.params.budget}, mode ${opt.params.mode}, εκτιμώμενες τιμές παικτών από τον μέσο όρο PIR 10 αγώνων (δεν υπάρχουν δημόσιες ιστορικές τιμές). «Βασική σύνθεση χρήστη» δεν υπάρχει για τις προηγούμενες σεζόν· ως baseline χρησιμοποιείται ο ίδιος optimizer με τον απλό μέσο όρο 10 αγώνων. «Αρχηγός σωστός» = ήταν ο καλύτερος βασικός της σύνθεσης. «Πάγκος βέλτιστος» = με τους ίδιους 10 δεν υπήρχε καλύτερη τοποθέτηση.`, `Simplifications: one turn per round, no coach, budget ${opt.params.budget}, mode ${opt.params.mode}, estimated prices from the 10-game PIR average (no public historical prices). There is no historical user lineup; the baseline is the same optimizer on the 10-game average. “Captain right” = best starter of the lineup. “Bench optimal” = no better placement of the same 10.`))}</p></section>`;
  }

  // ---------- αρχηγός
  const capRisk = (cap.risk || []).map(x => [esc({ low: L('Χαμηλό ρίσκο', 'Low risk'), medium: L('Μέτριο', 'Medium'), high: L('Υψηλό', 'High') }[x.group]), x.n, x.hidden ? hiddenTxt : f(x.width, 1), x.hidden ? '' : pc(x.coverage_80), x.hidden ? '' : f(x.sd_actual, 1), x.hidden ? '' : f(x.mae, 1)]);
  const picks = rep.captain_picks || [];
  let capChart = '';
  if (picks.length) {
    const bw = (W - M.l - M.r) / picks.length;
    let s = yAxis(0, 1, H, W, 4, v => Math.round(v * 100) + '%');
    s += picks.map((p, i) => { const hh = (H - M.t - M.b) * p.pct; return `<rect class="pfbar" x="${M.l + i * bw + 1}" y="${H - M.b - hh}" width="${Math.max(bw - 2, 1)}" height="${hh}" rx="2" style="fill:var(${colorOf[act]})"><title>${esc(`${p.season} ${L('αγωνιστική', 'round')} ${p.round}: ${ctx.name(p.c)} · ${f(p.actual, 1)} ${L('πόντοι ως αρχηγός', 'captain points')} · ${L('θέση', 'rank')} ${p.rank}/${p.n}`)}</title></rect>`; }).join('');
    capChart = svg(s, W, H, L('Captain percentile ανά αγωνιστική', 'Captain percentile by round'));
  }
  const capSec = `<section class="pfsec" id="captain"><h2>${esc(L('Αξιολόγηση αρχηγού', 'Captain evaluation'))} ${tip(L('Πρόταση = ο παίκτης με τους περισσότερους αναμενόμενους πόντους ως αρχηγός (×2, με την πιθανότητα νίκης), ανάμεσα σε πιθανούς βασικούς με τουλάχιστον 3 αγώνες. Τη συγκρίνουμε με όλους τους παίκτες της αγωνιστικής.', 'Pick = highest expected captain points among likely starters with ≥3 games, compared with every player of the round.'))}</h2>
${cap.hidden ? `<p class="fmwarn">${esc(L(`Μόνο ${cap.n} αγωνιστικές μέχρι τώρα: τα ποσοστά δεν εμφανίζονται μέχρι να υπάρξουν ${rep.min_n}.`, `Only ${cap.n} rounds so far: rates are hidden until there are ${rep.min_n}.`))}</p>` : ''}
<ul class="fmkpi"><li>${esc(L('Καλύτερος της αγωνιστικής', 'Best of the round'))} <b>${cap.hidden ? '–' : pc(cap.best_rate)}</b></li><li>Top 5 <b>${cap.hidden ? '–' : pc(cap.top5_rate)}</b></li><li>Top 10 <b>${cap.hidden ? '–' : pc(cap.top10_rate)}</b></li><li>${esc(L('Διάμεσο percentile', 'Median percentile'))} <b>${cap.hidden ? '–' : pc(cap.median_pct)}</b></li><li>${esc(L('Μέση θέση', 'Average rank'))} <b>${cap.hidden ? '–' : f(cap.avg_rank, 1)}</b></li><li>${esc(L('Χαμένοι πόντοι vs καλύτερου', 'Points missed vs best'))} <b>${cap.hidden ? '–' : f(cap.avg_missed, 1)}</b></li><li>${esc(L('Σφάλμα εκτίμησης', 'Projection error'))} <b>${cap.hidden ? '–' : f(cap.mae, 1)}</b></li><li>n <b>${cap.n}</b></li></ul>
${capChart}
<h3>${esc(L('Calibration ρίσκου αρχηγού', 'Captain risk calibration'))} ${tip(L('Οι προτάσεις χωρισμένες σε τρία ίσα μέρη κατά το εύρος P10–P90. Αν το ρίσκο είναι σωστό, οι «ρισκαδόρικες» έχουν μεγαλύτερη διασπορά αποτελεσμάτων και όλες έχουν κάλυψη ~80%.', 'Picks split in thirds by P10–P90 width; riskier picks should have wider outcomes and all ~80% coverage.'))}</h3>
${table('pf-caprisk', [L('Ρίσκο', 'Risk'), 'n', L('Εύρος P10–P90', 'P10–P90 width'), 'P10–P90', L('Διασπορά πραγματικού', 'Actual SD'), 'MAE'], capRisk)}
</section>`;

  // ---------- drift
  const alerts = rep.alerts || [];
  const ALK = { mae_up: L('Το rolling MAE των 5 τελευταίων αγωνιστικών ανέβηκε σημαντικά σε σχέση με τις 10 προηγούμενες.', 'Rolling 5-round MAE rose significantly vs the previous 10.'), calibration: L('Η κάλυψη P10–P90 των 5 τελευταίων αγωνιστικών βγήκε έξω από το 70–90%.', 'P10–P90 coverage of the last 5 rounds left 70–90%.'), position: L('Μία θέση αποδίδει πολύ χειρότερα από τις υπόλοιπες.', 'One position performs much worse.'), new_worse: L('Η ενεργή έκδοση είναι χειρότερη από την προηγούμενη: προτείνεται rollback.', 'The active version is worse than the previous one: rollback recommended.') };
  const alH = alerts.length ? `<ul class="fmalerts">${alerts.map(a => `<li class="sev-${a.severity}"><span class="sev">${esc(a.severity)}</span><div><b>${esc(ALK[a.k] || a.k)}</b><p class="sub">${a.group ? esc(gl(a.group)) + ' · ' : ''}${esc(L('τιμή', 'value'))} ${f(a.value)} · ${esc(L('αναφορά', 'reference'))} ${f(a.ref)}${a.season ? ' · ' + esc(a.season) : ''}</p></div></li>`).join('')}</ul>` : `<p class="sub">✓ ${esc(L('Κανένα alert: το μοντέλο δεν δείχνει σημάδια χειροτέρευσης.', 'No alerts: no signs of model degradation.'))}</p>`;
  const r5 = { [act]: rep.rolling5 }, r10 = { [act + '·10']: rep.rolling10 };
  colorOf[act + '·10'] = SER[1];
  const driftSec = `<section class="pfsec" id="drift"><h2>${esc(L('Model drift', 'Model drift'))} ${tip(L('Rolling MAE 5 και 10 αγωνιστικών μέσα σε κάθε σεζόν, και κανόνες που ανάβουν alert όταν το μοντέλο χειροτερεύει.', 'Rolling 5/10-round MAE within each season and rules that raise alerts when the model degrades.'))}</h2>${alH}
${lines({ ...r5, ...r10 }, 'mae', 'Rolling MAE')}<p class="pfleg"><span><i style="background:var(${colorOf[act]})"></i>${esc(L('Rolling MAE 5 αγωνιστικών', 'Rolling MAE, 5 rounds'))}</span><span><i style="background:var(${SER[1]})"></i>${esc(L('Rolling MAE 10 αγωνιστικών', 'Rolling MAE, 10 rounds'))}</span></p>
${table('pf-rolling', [L('Σεζόν', 'Season'), L('Αγωνιστική', 'Round'), 'n', 'MAE', 'RMSE', 'Corr', 'P10–P90', L('MAE 5', 'MAE 5'), L('MAE 10', 'MAE 10')], rep.series.map((x, i) => [x.season, x.round, x.n, f(x.mae), f(x.rmse), f(x.corr), pc(x.coverage_80), f(rep.rolling5[i]?.mae), f(rep.rolling10[i]?.mae)]))}
${grpSec('pf-ptype', L('Σφάλμα ανά τύπο παίκτη', 'Error by player type'), L('Νέοι παίκτες (<3 αγώνες), πρώτος αγώνας μετά από απουσία 2+ αγώνων, αλλαγή ρόλου (λεπτά 5 vs 10 αγώνων διαφέρουν ≥ 6).', 'New players, first game after 2+ missed, role change.'), A.by.ptype)}
${grpSec('pf-team', L('Σφάλμα ανά ομάδα (τρέχουσα σεζόν)', 'Error by team (current season)'), L('Για ποιες ομάδες το μοντέλο πέφτει πιο έξω.', 'Where the model misses most, by team.'), rep.teams_current || [])}
</section>`;

  const histT = rep.history || {};
  const trendSec = `<section class="pfsec" id="trend"><h2>${esc(L('Ιστορική εξέλιξη', 'Historical trend'))} ${tip(L('MAE ανά αγωνιστική για κάθε μοντέλο, στις ίδιες γραμμές.', 'MAE per round for each model.'))}</h2>${lines(histT, 'mae', 'MAE per round')}${legend(order)}</section>`;

  const seasonsTxt = rep.seasons.map(s => `${s.season.slice(1)}-${String(+s.season.slice(1) + 1).slice(2)}: ${s.rounds} ${L('αγωνιστικές', 'rounds')} (${s.from}–${s.to}), ${s.rows.toLocaleString('el-GR')} ${L('προβλέψεις', 'predictions')}`).join(' · ');
  const csvLinks = rep.seasons.map(s => `<a href="${csvBase}${s.season}.csv" download>${s.season}.csv</a>`).join(' · ');

  return `<p class="pfmeta">${esc(L('Ενεργό μοντέλο', 'Active model'))} <b>${esc(act)}</b> · ${esc(L('ενημέρωση', 'updated'))} ${esc(new Date(rep.generated).toLocaleString(ctx.loc, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' }))} · ${rep.n.toLocaleString('el-GR')} ${esc(L('προβλέψεις', 'predictions'))}</p>
<p class="sub">${esc(seasonsTxt)}</p>
${kpis}
<p class="note">${esc(L('Τα αποτελέσματα βασίζονται σε backtests σε ιστορικά δεδομένα και σε μελλοντικές ανανεώσεις μετά το τέλος κάθε γύρου.', 'Results are based on backtests on historical data and are refreshed after every round.'))} ${esc(L(`Κάθε πρόβλεψη γίνεται με μοντέλο εκπαιδευμένο ΜΟΝΟ στις προηγούμενες αγωνιστικές της ίδιας σεζόν (time-based split, χωρίς μελλοντική πληροφορία), από την ${4}η αγωνιστική και μετά, όπως ακριβώς στην παραγωγή. Ομάδες με λιγότερες από ${rep.min_n} παρατηρήσεις δεν εμφανίζονται.`, `Every prediction uses a model trained ONLY on earlier rounds of the same season (time-based split), from round 4 on, exactly as in production. Groups with fewer than ${rep.min_n} observations are hidden.`))}</p>
<section class="pfsec"><h2>${esc(L('Calibration', 'Calibration'))} ${tip(L('Αριστερά: για κάθε επίπεδο εκτίμησης, το μέσο πραγματικό PIR (πάνω στη διαγώνιο = σωστό). Δεξιά: πόσα αποτελέσματα πέφτουν κάτω από κάθε quantile της εκτίμησης (πάνω στη διαγώνιο = σωστά εύρη P10/P50/P90).', 'Left: mean actual PIR for each projection level. Right: share of results below each predicted quantile.'))}</h2>
<div class="pfgrid2"><div><h3>${esc(L('Εκτίμηση vs πραγματικό', 'Projected vs actual'))}</h3>${calibChart(A.calibration)}</div><div><h3>${esc(L('Quantiles P10/P50/P90', 'Quantiles P10/P50/P90'))}</h3>${qCurve(A.quantiles, 'Quantile calibration')}<p class="sub">${esc(L('κάτω από P10', 'below P10'))} ${pc(A.quantiles.below_p10, 1)} · ${esc(L('κάτω από P50', 'below P50'))} ${pc(A.quantiles.below_p50, 1)} · ${esc(L('κάτω από P90', 'below P90'))} ${pc(A.quantiles.below_p90, 1)} · ECE ${f(A.quantiles.ece, 3)}</p></div></div>
${table('pf-calib', [L('Εκτίμηση PIR', 'Projected PIR'), 'n', L('Μέση εκτίμηση', 'Mean projection'), L('Μέσο πραγματικό', 'Mean actual'), L('Διαφορά', 'Gap')], A.calibration.map(x => [esc(x.bucket), x.n, x.hidden ? hiddenTxt : f(x.proj), x.hidden ? '' : f(x.actual), x.hidden ? '' : f(x.gap)]))}
<h3>${esc(L('Fantasy points: floor / ceiling', 'Fantasy points: floor / ceiling'))} ${tip(L('Floor hit = πραγματικό ≥ P10 (στόχος 90%). Ceiling hit = πραγματικό ≥ P90 (στόχος 10%).', 'Floor hit = actual ≥ P10 (target 90%); ceiling hit = actual ≥ P90 (target 10%).'))}</h3>
<ul class="fmkpi"><li>MAE <b>${f(FP.mae)}</b></li><li>RMSE <b>${f(FP.rmse)}</b></li><li>P10–P90 <b>${pc(FP.coverage_80, 1)}</b></li><li>Floor hit <b>${pc(FP.floor_hit, 1)}</b></li><li>Ceiling hit <b>${pc(FP.ceiling_hit, 1)}</b></li><li>n <b>${FP.n}</b></li></ul></section>
<section class="pfsec"><h2>${esc(L('Κατανομή σφαλμάτων', 'Error distribution'))} ${tip(L('Πόσες προβλέψεις έπεσαν έξω και προς ποια κατεύθυνση. Δεξιά του 0 = ο παίκτης έφερε περισσότερο από την εκτίμηση.', 'How far off and in which direction; right of 0 = player beat the projection.'))}</h2>${hist(A.histogram)}
<ul class="fmkpi"><li>MAE <b>${f(P.mae)}</b></li><li>RMSE <b>${f(P.rmse)}</b></li><li>Median AE <b>${f(P.medae)}</b></li><li>MAPE <b title="${esc(L('μόνο όπου |πραγματικό| ≥ 5 PIR', 'only where |actual| ≥ 5 PIR'))}">${P.mape == null ? '–' : f(P.mape, 1) + '%'}</b></li><li>Bias <b>${f(P.bias)}</b></li><li>${esc(L('Κατεύθυνση', 'Directional'))} <b>${pc(P.directional, 1)}</b></li><li>${esc(L('Λεπτά MAE', 'Minutes MAE'))} <b>${f(A.minutes.mae)}</b></li></ul></section>
<h2>${esc(L('Ακρίβεια ανά ομάδα', 'Accuracy by group'))}</h2>
<div class="pfgrid2">
${grpSec('pf-pos', L('Ανά θέση', 'By position'), L('MAE ανά θέση παίκτη.', 'MAE by position.'), A.by.position, true)}
${grpSec('pf-price', L('Ανά τιμή', 'By price'), L('Εκτιμώμενη τιμή από τον μέσο όρο PIR 10 αγώνων (credits). Ακριβότεροι παίκτες έχουν μεγαλύτερο PIR, άρα και μεγαλύτερο απόλυτο σφάλμα.', 'Estimated price (credits).'), A.by.price, true)}
${grpSec('pf-min', L('Ανά λεπτά', 'By minutes'), L('Μέσος όρος λεπτών των 5 τελευταίων αγώνων πριν από τον αγώνα.', 'Average minutes over the previous 5 games.'), A.by.minutes, true)}
${grpSec('pf-proj', L('Ανά εκτίμηση PIR', 'By projected PIR'), L('Bucket της εκτίμησης PIR.', 'Projected PIR bucket.'), A.by.proj_pir, true)}
${grpSec('pf-role', L('Βασικός / πάγκος', 'Starter / bench'), L('Πιθανός βασικός = ξεκίνησε στους μισούς από τους 5 τελευταίους αγώνες (γνωστό πριν από τον αγώνα).', 'Likely starter = started in half of the last 5 games.'), A.by.role, true)}
${grpSec('pf-venue', L('Έδρα / εκτός', 'Home / away'), L('Έδρα ή εκτός έδρας.', 'Home or away.'), A.by.venue, true)}
${grpSec('pf-b2b', 'Back-to-back', L('Αγώνας την επόμενη μέρα από τον προηγούμενο (διπλή αγωνιστική).', 'Game on consecutive days.'), A.by.b2b, true)}
${grpSec('pf-season', L('Ανά σεζόν', 'By season'), L('Ίδιο μοντέλο, κάθε σεζόν χωριστά.', 'Same model, each season.'), A.by.season, true)}
</div>
${grpSec('pf-round', L('Ανά αγωνιστική (τρέχουσα σεζόν)', 'By round (current season)'), L('Σφάλμα σε κάθε αγωνιστική της σεζόν.', 'Error by round.'), rep.rounds_current || [])}
${optSec}
${capSec}
<section class="pfsec" id="versions"><h2>${esc(L('Σύγκριση μοντέλων', 'Model comparison'))} ${tip(L('Όλα τα μοντέλα στις ίδιες ακριβώς γραμμές. ★ = μικρότερο MAE. ECE = μέση απόκλιση της καμπύλης calibration από τη διαγώνιο (0 = τέλεια).', 'All models on exactly the same rows. ★ = lowest MAE. ECE = mean calibration error (0 = perfect).'))}</h2>
${verTable}${legend(order)}
<h3>${esc(L('Εκδόσεις και rollback', 'Versions and rollback'))}</h3>
${table('pf-registry', [L('Έκδοση', 'Version'), 'Engine', 'Status', L('Από', 'Since'), L('Περιγραφή', 'Description')], regRows)}
<p class="sub">${esc(L(`Η ενεργή έκδοση ορίζεται στο data/fantasy/models.json. Αν μια νέα έκδοση βγει χειρότερη από την προηγούμενη (MAE > 3% μεγαλύτερο στις ίδιες γραμμές) ανάβει alert με πρόταση rollback, που γίνεται με python fantasy/perf_run.py --rollback <έκδοση> ή από το workflow του GitHub (επιλογή rollback_to).`, 'The active version is set in data/fantasy/models.json. If a new version is worse than the previous one, an alert recommends a rollback (python fantasy/perf_run.py --rollback <version> or the GitHub workflow input rollback_to).'))}${rep.previous ? ' ' + esc(L('Προηγούμενη έκδοση', 'Previous version')) + ': ' + esc(rep.previous) + '.' : ' ' + esc(L('Δεν υπάρχει ακόμη προηγούμενη έκδοση σε παραγωγή.', 'There is no previous production version yet.'))}${models.includes('pir-lgbm-v1') ? '' : ' ' + esc(L('Το pir-lgbm-v1 (LightGBM) εμφανίζεται όταν η βιβλιοθήκη είναι διαθέσιμη στο περιβάλλον που τρέχει το backtest.', 'pir-lgbm-v1 (LightGBM) appears when the library is available where the backtest runs.'))}</p></section>
${(() => {
    const E = rep.early || {}, BP = rep.by_prev || [], CR = rep.captain_rules || {};
    const eRows = (E.models || []).map(x => [esc(mname(x.model)), x.n, x.hidden ? hiddenTxt : f(x.mae), x.hidden ? '' : f(x.corr)]);
    const bpRows = BP.map(g => [esc(g.group === 'returning' ? L('Είχε παίξει την προηγούμενη σεζόν', 'Played the previous season') : L('Χωρίς ιστορικό προηγούμενης σεζόν', 'No previous-season history')), g.n, ...order.map(m => f(g.models[m]))]);
    const crRows = order.filter(m => CR[m]).map(m => [esc(mname(m)), CR[m].mean?.n ?? 0, f(CR[m].mean?.avg_points, 1), pc(CR[m].mean?.top10_rate), f(CR[m].upside?.avg_points, 1), pc(CR[m].upside?.top10_rate)]);
    return `<section class="pfsec" id="v2"><h2>${esc(L('Τι προσθέτει το v2', 'What v2 adds'))} ${tip(L('pir-2stage-v2: προηγούμενη σεζόν του παίκτη ως αφετηρία, εκπαίδευση και στις 2 προηγούμενες σεζόν, ταξίδι (χλμ από τον προηγούμενο αγώνα), φάουλ ανά 36 λεπτά, λεπτά συμπαικτών που έλειψαν στον προηγούμενο αγώνα. Οι διαιτητές δεν μπαίνουν: ανακοινώνονται τη μέρα του αγώνα, μετά τις εκτιμήσεις.', 'pir-2stage-v2: previous season as prior, training on 2 previous seasons, travel, fouls per 36, minutes of missing teammates. Referees are not used: they are announced on game day.'))}</h2>
${eRows.length ? `<h3>${esc(L('Αρχή της σεζόν (2η–3η αγωνιστική)', 'Start of season (rounds 2–3)'))}</h3><p class="sub">${esc(L('Το v1 δεν βγάζει εκτιμήσεις πριν από την 4η αγωνιστική· το v2 ναι, γιατί ξέρει τις προηγούμενες σεζόν.', 'v1 cannot project before round 4; v2 can, thanks to previous seasons.'))}</p>${table('pf-early', [L('Μοντέλο', 'Model'), 'n', 'MAE', 'Corr'], eRows)}` : ''}
${bpRows.length ? `<h3>${esc(L('Παίκτες με και χωρίς ιστορικό', 'Players with and without history'))} (MAE)</h3>${table('pf-prev', [L('Ομάδα', 'Group'), 'n', ...order.map(m => esc(mname(m)))], bpRows)}` : ''}
${crRows.length ? `<h3>${esc(L('Κανόνας αρχηγού: αναμενόμενο ή upside', 'Captain rule: expected or upside'))} ${tip(L('Αναμενόμενο = ο παίκτης με τους περισσότερους αναμενόμενους πόντους. Upside = αναμενόμενο + 1 τυπική απόκλιση (ο αρχηγός διπλασιάζεται, άρα μετράει το ταβάνι). Ο Captain Advisor χρησιμοποιεί πλέον το upside.', 'Expected = most expected points. Upside = expected + 1 standard deviation. The Captain Advisor now uses upside.'))}</h3>${table('pf-caprule', [L('Μοντέλο', 'Model'), 'n', L('Πόντοι (αναμενόμενο)', 'Points (expected)'), 'Top 10', L('Πόντοι (upside)', 'Points (upside)'), 'Top 10'], crRows)}` : ''}
</section>`;
  })()}
${trendSec}
${driftSec}
<section class="pfsec"><h2>${esc(L('Δεδομένα', 'Data'))}</h2><p>${esc(L('Όλες οι προβλέψεις του backtest (μία γραμμή ανά παίκτη και αγώνα: features πριν από τον αγώνα, εκτίμηση κάθε μοντέλου, πραγματικό αποτέλεσμα):', 'All backtest predictions (one row per player-game: pre-game features, each model’s projection, actual):'))} ${csvLinks}</p>
<p class="sub">API: <a href="${ctx.api}performance.json">performance</a> · <a href="${ctx.api}performance/history.json">history</a> · <a href="${ctx.api}performance/by-position.json">by-position</a> · <a href="${ctx.api}performance/by-price.json">by-price</a> · <a href="${ctx.api}performance/by-minutes.json">by-minutes</a> · <a href="${ctx.api}versions.json">versions</a> · <a href="${ctx.api}optimizer.json">optimizer</a></p></section>
<p class="note">${esc(L('Τα αποτελέσματα των backtests δεν εγγυώνται μελλοντική απόδοση. Οι προβλέψεις βασίζονται σε ιστορικά δεδομένα και μπορεί να επηρεαστούν από τραυματισμούς, αλλαγές ροτέισν και άλλους απρόβλεπτους παράγοντες.', 'Backtest results do not guarantee future performance. Projections are based on historical data and can be affected by injuries, rotation changes and other unpredictable factors.'))}</p>
<script>document.addEventListener('click',e=>{const b=e.target.closest('[data-csv]');if(!b)return;const t=document.getElementById(b.dataset.csv);const rows=[...t.querySelectorAll('tr')].map(r=>[...r.children].map(c=>'"'+c.textContent.trim().replace(/"/g,'""')+'"').join(','));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\\ufeff'+rows.join('\\n')],{type:'text/csv'}));a.download=b.dataset.csv+'.csv';a.click();});</script>`;
}
