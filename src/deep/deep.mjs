// «Σε βάθος ανάλυση» κάθε αγώνα της τρέχουσας αγωνιστικής: όλα τα επίπεδα, από τα δεδομένα του site.
// Καθαρά δεδομένα → κείμενο σε 4 γλώσσες (το T έρχεται από το build).
import { sum, rated, groupLineups } from '../analytics/metrics.mjs';
import { groupStats } from '../shots/zones.mjs';

const FF = [ // επίθεση, αντίστοιχη άμυνα αντιπάλου
  ['efg', 'oefg'], ['tov', 'otov'], ['oreb', 'ooreb'], ['ftr', 'oftr'],
];
const ZG = ['rim', 'paint', 'mid', 'corner3', 'wing3', 'top3'];

export function deepFacts(X) {
  const { h, a, C, L, SH, ON, players, playerSummary, MCH, pred, inj, stand, games } = X;
  const team = t => {
    const st = stand.find(s => s[1] === t);
    const last = games.filter(g => g[6] && (g[2] === t || g[3] === t)).sort((x, y) => x[0] - y[0]);
    const form = last.slice(-5).map(g => { const home = g[2] === t, my = home ? g[4] : g[5], op = home ? g[5] : g[4]; return { r: g[0], opp: home ? g[3] : g[2], home, my, op, w: my > op }; });
    const outIds = new Set(inj(t).filter(x => x.m === 1).map(x => x.c));
    const T = C?.byTeam?.[t];
    const cl = T ? rated(sum(T.stints, x => x.c)) : null;
    const luAll = T ? groupLineups(T.stints, 5).filter(x => !x.p.some(id => outIds.has(id))) : [];
    let lu = luAll.filter(x => x.poss >= 30).sort((x, y) => y.net - x.net).slice(0, 2);
    if (!lu.length) lu = luAll.sort((x, y) => y.poss - x.poss).slice(0, 2);
    const oo = (ON || []).filter(x => x.t === t && x.on?.poss >= 80 && x.off?.poss >= 40 && x.diff?.net != null).sort((x, y) => y.diff.net - x.diff.net);
    const roster = players.filter(p => p.t.split(';').pop() === t).map(p => ({ p, s: playerSummary(p) })).filter(x => x.s.G >= 3).sort((x, y) => y.s.pir - x.s.pir);
    // PIR ανά θέση: τι παράγει η ομάδα και τι επιτρέπει στους αντιπάλους (ανά αγώνα)
    const posFor = {}, posAg = {}, gs = new Set(), ga = new Set();
    for (const p of players) for (const r of p.g) {
      if (!(r[7] > 0)) continue;
      const tm = p.t.split(';').pop();
      if (tm === t && !outIds.has(p.c)) { posFor[p.pos] = (posFor[p.pos] || 0) + r[25]; gs.add(r[0]); }
      if (r[2] === t) { posAg[p.pos] = (posAg[p.pos] || 0) + r[25]; ga.add(r[0]); }
    }
    for (const k in posFor) posFor[k] /= gs.size || 1;
    for (const k in posAg) posAg[k] /= ga.size || 1;
    const sh = SH ? SH.shots.filter(s => s.team === t && s.z) : [], sho = SH ? SH.shots.filter(s => s.opp === t && s.z) : [];
    const own = sh.length ? groupStats(sh) : null, def = sho.length ? groupStats(sho) : null;
    const allS = SH ? SH.shots.filter(s => s.team === t) : [];
    const fb = allS.filter(s => s.fb), sc = allS.filter(s => s.sc);
    return { t, st, form, row: L?.rows?.[t], rk: L?.rk?.[t], pct: L?.pct?.[t], cl, lu, oo, roster, posFor, posAg, own, def, nSh: allS.length,
      fbShare: allS.length ? fb.length / allS.length : null, scShare: allS.length ? sc.length / allS.length : null,
      inj: inj(t), outIds };
  };
  const H = team(h), A = team(a);
  const LA = SH ? groupStats(SH.shots.filter(s => s.z)) : null;
  const allPosAg = {}; // κατάταξη «άμυνας ανά θέση» σε όλη τη λίγκα
  const teams = [...new Set(stand.map(s => s[1]))];
  // ζευγάρια four factors
  const ff = side => {
    const O = side === 'h' ? H : A, D = side === 'h' ? A : H;
    return FF.map(([o, d]) => ({ o, d, ov: O.row?.[o], dv: D.row?.[d], or: O.rk?.[o], dr: D.rk?.[d], lav: L?.avg?.[o], edge: (D.rk?.[d] ?? 0) - (O.rk?.[o] ?? 0) }));
  };
  // ζώνες: δύναμη επίθεσης × αδυναμία άμυνας αντιπάλου
  const zones = side => {
    const O = side === 'h' ? H : A, D = side === 'h' ? A : H;
    if (!O.own || !D.def || !LA) return [];
    return ZG.filter(z => O.own[z]?.fga >= 25 && D.def[z]?.fga >= 25).map(z => ({ z, share: O.own[z].share, lshare: LA[z].share, fg: O.own[z].fg, lfg: LA[z].fg, dfg: D.def[z].fg, dshare: D.def[z].share,
      score: O.own[z].share * ((O.own[z].pps - LA[z].pps) + (D.def[z].pps - LA[z].pps)) })).sort((x, y) => y.score - x.score);
  };
  const h2h = Object.values(MCH || {}).flat().filter(g => g.comp === 'E' && ((g.h === h && g.a === a) || (g.h === a && g.a === h)) && g.hs != null).sort((x, y) => String(y.d).localeCompare(String(x.d)));
  return { H, A, LA, ffH: ff('h'), ffA: ff('a'), zH: zones('h'), zA: zones('a'), h2h, pred, nTeams: teams.length };
}

export function renderDeep(F, X) {
  const { T, esc, tName, pName, pUrl, ord, urlFor, LG, r, dt, gameUrl, mcUrl } = X;
  const { H, A, pred } = F;
  const nH = tName(H.t), nA = tName(A.t);
  const n1 = v => (v == null ? '–' : v.toFixed(1)), pc = (v, d = 1) => (v == null ? '–' : (100 * v).toFixed(d) + '%'), sg = v => (v == null ? '–' : (v > 0 ? '+' : '') + v.toFixed(1));
  const rk = v => (v == null ? '' : ` <small>(${ord(v)})</small>`);
  const nm = t => (t === H.t ? nH : nA);
  // ελληνικό άρθρο και κλίση (ο Παναθηναϊκός / του Παναθηναϊκού / τον Παναθηναϊκό, η Ρεάλ / της Ρεάλ / τη Ρεάλ)
  const masc = t => /(ός|ας)$/.test(nm(t).split(' ')[0]);
  const decl = (t, c) => nm(t).split(' ').map(w => (c === 'g' ? w.replace(/ός$/, 'ού').replace(/ας$/, 'α') : w.replace(/ός$/, 'ό').replace(/ας$/, 'α'))).join(' ');
  const gN = t => esc((masc(t) ? 'ο ' : 'η ') + nm(t)), gG = t => esc(masc(t) ? 'του ' + decl(t, 'g') : 'της ' + nm(t)), gA = t => esc(masc(t) ? 'τον ' + decl(t, 'a') : 'τη ' + nm(t));
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  const P = [];
  // ---- 1. η εικόνα
  const rec = O => (O.st ? `${O.st[2]}-${O.st[3]}` : '–');
  const pos = O => (O.st ? O.st[0] : null);
  const formS = O => O.form.map(f => (f.w ? 'W' : 'L')).join('');
  const formTxt = O => O.form.map(f => `${f.w ? T('Ν', 'W', 'V', 'P', 'G') : T('Η', 'L', 'D', 'I', 'M')} ${f.home ? T('με', 'vs', 'vs', 'vs', 'vs') : '@'} ${esc(tName(f.opp))} ${f.my}-${f.op}`).join(' · ');
  const p = pred?.p_home;
  const fav = p == null ? null : p >= 0.5 ? H.t : A.t, pf = p == null ? null : Math.max(p, 1 - p);
  const confT = { high: T('υψηλή', 'high', 'alta', 'visoka', 'yüksek'), medium: T('μέτρια', 'medium', 'media', 'srednja', 'orta'), low: T('χαμηλή', 'low', 'baja', 'niska', 'düşük') }[pred?.conf] || '–';
  P.push(`<section><h2>${T('1. Η εικόνα πριν από το τζάμπολ', '1. The picture before tip-off', '1. El panorama antes del salto', '1. Slika pre početka', '1. Hava atışı öncesi tablo')}</h2>
<div class="tbl"><table class="antbl"><thead><tr><th class="l"></th><th>${esc(nH)}</th><th>${esc(nA)}</th></tr></thead><tbody>
<tr><td class="l">${T('Θέση / ρεκόρ', 'Position / record', 'Posición / balance', 'Pozicija / skor', 'Sıra / derece')}</td><td>${pos(H) ? ord(pos(H)) : '–'} · ${rec(H)}</td><td>${pos(A) ? ord(pos(A)) : '–'} · ${rec(A)}</td></tr>
<tr><td class="l">${T('Εντός / εκτός έδρας', 'Home / away', 'En casa / fuera', 'Kod kuće / u gostima', 'İç saha / deplasman')}</td><td>${H.st?.[6] || '–'} / ${H.st?.[7] || '–'}</td><td>${A.st?.[6] || '–'} / ${A.st?.[7] || '–'}</td></tr>
<tr><td class="l">${T('Φόρμα (5)', 'Form (5)', 'Forma (5)', 'Forma (5)', 'Form (5)')}</td><td>${formS(H)}</td><td>${formS(A)}</td></tr>
<tr><td class="l">${T('Πόντοι υπέρ / κατά', 'Points for / against', 'Puntos a favor / en contra', 'Poeni dati / primljeni', 'Atılan / yenen sayı')}</td><td>${n1(H.row?.pfpg)} / ${n1(H.row?.papg)}</td><td>${n1(A.row?.pfpg)} / ${n1(A.row?.papg)}</td></tr>
<tr><td class="l">Net rating</td><td>${sg(H.row?.net)}${rk(H.rk?.net)}</td><td>${sg(A.row?.net)}${rk(A.rk?.net)}</td></tr>
${pred ? `<tr><td class="l">${T('Μέρες ξεκούρασης', 'Rest days', 'Días de descanso', 'Dani odmora', 'Dinlenme günü')}</td><td>${pred.h_rest ?? '–'}</td><td>${pred.a_rest ?? '–'}</td></tr>` : ''}
</tbody></table></div>
<p><b>${esc(nH)}:</b> ${formTxt(H)}</p><p><b>${esc(nA)}:</b> ${formTxt(A)}</p>
${pred ? `<p>${T(`Το μοντέλο μας δίνει <b>${pc(pf, 0)}</b> σ${gA(fav)}, με εκτιμώμενο σκορ <b>${Math.round(pred.hs)}-${Math.round(pred.as)}</b>, σύνολο περίπου ${Math.round(pred.total)} πόντους και ρυθμό ${n1(pred.pace)} κατοχές. Βεβαιότητα: ${confT}.`, `Our model gives <b>${nm(fav)} ${pc(pf, 0)}</b>, with a projected score of <b>${Math.round(pred.hs)}-${Math.round(pred.as)}</b>, about ${Math.round(pred.total)} total points and a pace of ${n1(pred.pace)} possessions. Confidence: ${confT}.`, `Nuestro modelo da un <b>${pc(pf, 0)}</b> a ${esc(nm(fav))}, con un marcador estimado de <b>${Math.round(pred.hs)}-${Math.round(pred.as)}</b>, unos ${Math.round(pred.total)} puntos totales y un ritmo de ${n1(pred.pace)} posesiones. Confianza: ${confT}.`, `Naš model daje <b>${pc(pf, 0)}</b> timu ${esc(nm(fav))}, uz procenjeni rezultat <b>${Math.round(pred.hs)}-${Math.round(pred.as)}</b>, oko ${Math.round(pred.total)} ukupnih poena i tempo od ${n1(pred.pace)} poseda. Pouzdanost: ${confT}.`, `Modelimiz <b>${nm(fav)} ${pc(pf, 0)}</b> veriyor; tahmini skor <b>${Math.round(pred.hs)}-${Math.round(pred.as)}</b>, toplam yaklaşık ${Math.round(pred.total)} sayı ve ${n1(pred.pace)} hücumluk tempo. Güven: ${confT}.`)}</p>` : ''}
</section>`);

  // ---- 2. τα κλειδιά
  const ffName = { efg: T('το σουτ (eFG%)', 'shooting (eFG%)', 'el tiro (eFG%)', 'šut (eFG%)', 'şut (eFG%)'), tov: T('τα λάθη', 'turnovers', 'las pérdidas', 'izgubljene lopte', 'top kayıpları'), oreb: T('τα επιθετικά ριμπάουντ', 'offensive rebounds', 'el rebote ofensivo', 'skok u napadu', 'hücum ribaundları'), ftr: T('τις βολές', 'free throws', 'los tiros libres', 'slobodna bacanja', 'serbest atışlar') };
  const keys = [];
  for (const [O, D, list] of [[H, A, F.ffH], [A, H, F.ffA]]) for (const x of list) if (x.or && x.dr) keys.push({ O, D, x, mag: Math.abs(x.edge) });
  keys.sort((a, b) => b.mag - a.mag);
  const kl = keys.filter((k, i) => i < 2 || k.mag >= 5).slice(0, 3).map(({ O, D, x }) => {
    const ofav = x.edge > 0;
    return ofav
      ? T(`<b>${esc(nm(O.t))} στην επίθεση, ${ffName[x.o]}:</b> είναι ${ord(x.or)} στη λίγκα και η άμυνα ${gG(D.t)} μόλις ${ord(x.dr)} σε αυτό. Εδώ ${gN(O.t)} έχει καθαρό πλεονέκτημα.`, `<b>${nm(O.t)} on offense, ${ffName[x.o]}:</b> they rank ${ord(x.or)} in the league while ${nm(D.t)}'s defense ranks only ${ord(x.dr)}. A clear edge for ${nm(O.t)}.`, `<b>${esc(nm(O.t))} en ataque, ${ffName[x.o]}:</b> es ${ord(x.or)} de la liga y la defensa de ${esc(nm(D.t))} solo ${ord(x.dr)}. Ventaja clara para ${esc(nm(O.t))}.`, `<b>${esc(nm(O.t))} u napadu, ${ffName[x.o]}:</b> ${ord(x.or)} u ligi, a odbrana tima ${esc(nm(D.t))} tek ${ord(x.dr)}. Jasna prednost za ${esc(nm(O.t))}.`, `<b>${nm(O.t)} hücumda, ${ffName[x.o]}:</b> ligde ${ord(x.or)} sırada; rakip ${nm(D.t)} savunması ise yalnızca ${ord(x.dr)} sırada. Avantaj açıkça ${nm(O.t)} tarafında.`)
      : T(`<b>${esc(nm(D.t))} στην άμυνα, ${ffName[x.o]}:</b> είναι ${ord(x.dr)} στη λίγκα, ενώ η επίθεση ${gG(O.t)} είναι ${ord(x.or)}. ${cap1(gN(D.t))} μπορεί να «κλειδώσει» αυτό το κομμάτι.`, `<b>${nm(D.t)} on defense, ${ffName[x.o]}:</b> they rank ${ord(x.dr)}, while ${nm(O.t)}'s offense is ${ord(x.or)}. ${nm(D.t)} can shut this down.`, `<b>${esc(nm(D.t))} en defensa, ${ffName[x.o]}:</b> es ${ord(x.dr)}, mientras el ataque de ${esc(nm(O.t))} es ${ord(x.or)}. ${esc(nm(D.t))} puede cerrar esta vía.`, `<b>${esc(nm(D.t))} u odbrani, ${ffName[x.o]}:</b> ${ord(x.dr)}, dok je napad tima ${esc(nm(O.t))} ${ord(x.or)}. ${esc(nm(D.t))} može da zatvori ovaj segment.`, `<b>${nm(D.t)} savunmada, ${ffName[x.o]}:</b> ${ord(x.dr)} sırada, ${nm(O.t)} hücumu ise ${ord(x.or)} sırada. ${nm(D.t)} bu alanı kapatabilir.`);
  });
  if (pred && H.row && A.row) {
    const ph = H.row.pace, pa = A.row.pace;
    if (Math.abs(ph - pa) >= 2) { const fast = ph > pa ? H.t : A.t, slow = ph > pa ? A.t : H.t; kl.push(T(`<b>Ο ρυθμός:</b> ${gN(fast)} παίζει γρηγορότερα (${n1(Math.max(ph, pa))} κατοχές) από ${gA(slow)} (${n1(Math.min(ph, pa))}). Όποια ομάδα επιβάλει τον ρυθμό της παίρνει το πρώτο βήμα· το μοντέλο περιμένει ${n1(pred.pace)}.`, `<b>Pace:</b> ${nm(fast)} play faster (${n1(Math.max(ph, pa))} possessions) than ${nm(slow)} (${n1(Math.min(ph, pa))}). Whoever imposes their tempo takes the first step; the model expects ${n1(pred.pace)}.`, `<b>El ritmo:</b> ${esc(nm(fast))} juega más rápido (${n1(Math.max(ph, pa))} posesiones) que ${esc(nm(slow))} (${n1(Math.min(ph, pa))}). Quien imponga su ritmo dará el primer paso; el modelo espera ${n1(pred.pace)}.`, `<b>Tempo:</b> ${esc(nm(fast))} igra brže (${n1(Math.max(ph, pa))} poseda) od tima ${esc(nm(slow))} (${n1(Math.min(ph, pa))}). Ko nametne svoj ritam pravi prvi korak; model očekuje ${n1(pred.pace)}.`, `<b>Tempo:</b> ${nm(fast)} daha hızlı oynuyor (${n1(Math.max(ph, pa))} hücum), rakibi ${nm(slow)} ise daha yavaş (${n1(Math.min(ph, pa))}). Temposunu kabul ettiren ilk adımı atar; model ${n1(pred.pace)} hücum bekliyor.`)); }
  }
  const outs = [...H.inj.map(x => [H, x]), ...A.inj.map(x => [A, x])].filter(([, x]) => x.m === 1);
  if (outs.length) kl.push(T(`<b>Οι απουσίες:</b> ${outs.map(([O, x]) => `${esc(x.n)} (${esc(nm(O.t))})`).join(', ')}.`, `<b>Absences:</b> ${outs.map(([O, x]) => `${esc(x.n)} (${esc(nm(O.t))})`).join(', ')}.`, `<b>Las bajas:</b> ${outs.map(([O, x]) => `${esc(x.n)} (${esc(nm(O.t))})`).join(', ')}.`, `<b>Odsutni:</b> ${outs.map(([O, x]) => `${esc(x.n)} (${esc(nm(O.t))})`).join(', ')}.`, `<b>Eksikler:</b> ${outs.map(([O, x]) => `${esc(x.n)} (${esc(nm(O.t))})`).join(', ')}.`));
  P.push(`<section><h2>${T('2. Τι θα κρίνει τον αγώνα', '2. What will decide the game', '2. Qué decidirá el partido', '2. Šta će odlučiti utakmicu', '2. Maçı ne belirleyecek?')}</h2><ol class="deepkeys">${kl.map(x => `<li>${x}</li>`).join('')}</ol></section>`);

  // ---- 3. επίθεση – άμυνα
  const M = [['ortg', 'Offensive rating', n1], ['drtg', 'Defensive rating', n1], ['pace', T('Ρυθμός (κατοχές)', 'Pace (possessions)', 'Ritmo (posesiones)', 'Tempo (posedi)', 'Tempo (hücum)'), n1], ['efg', 'eFG%', pc], ['ts', 'TS%', pc], ['tp', T('Τρίποντα / σουτ', '3PA rate', 'Triples / tiros', 'Trojke / šutevi', 'Üçlük deneme oranı'), pc], ['ast', T('Ασίστ / καλάθια', 'Assist rate', 'Asistencias / canastas', 'Asistencije / koševi', 'Asist oranı'), pc], ['tov', T('Λάθη / κατοχή', 'Turnover %', 'Pérdidas / posesión', 'Izgubljene / posed', 'Top kaybı %'), pc], ['oreb', 'OREB%', pc], ['dreb', 'DREB%', pc], ['ftr', T('Βολές / σουτ (FTr)', 'Free-throw rate', 'Tiros libres / tiros', 'Bacanja / šutevi', 'Serbest atış oranı'), pc], ['oefg', T('eFG% αντιπάλων', 'Opponent eFG%', 'eFG% rival', 'eFG% protivnika', 'Rakip eFG%'), pc], ['otov', T('Λάθη αντιπάλων', 'Opponent TOV%', 'Pérdidas rivales', 'Izgubljene protivnika', 'Rakip TOV%'), pc], ['oftr', T('Βολές αντιπάλων', 'Opponent FTr', 'Tiros libres rivales', 'Bacanja protivnika', 'Rakip FTr'), pc]];
  const interp = O => X.interpret(O.pct || {}, T);
  P.push(`<section><h2>${T('3. Επίθεση και άμυνα αναλυτικά', '3. Offense and defense in detail', '3. Ataque y defensa en detalle', '3. Napad i odbrana detaljno', '3. Hücum ve savunma detaylı')}</h2><p class="sub">${T(`Ανά 100 κατοχές, από το play-by-play · σε παρένθεση η θέση στη λίγκα (1η = καλύτερη, ${F.nTeams} ομάδες)`, `Per 100 possessions from play-by-play · league rank in brackets (1st = best, ${F.nTeams} teams)`, `Por 100 posesiones, del play-by-play · entre paréntesis el puesto en la liga (1.º = mejor, ${F.nTeams} equipos)`, `Na 100 poseda, iz play-by-play · u zagradi mesto u ligi (1. = najbolji, ${F.nTeams} timova)`, `100 hücum başına, play-by-play verisinden · parantez içinde lig sıralaması (1. = en iyi, ${F.nTeams} takım)`)}</p>
<div class="tbl"><table class="antbl"><thead><tr><th class="l"></th><th>${esc(nH)}</th><th>${esc(nA)}</th><th>${T('Λίγκα', 'League', 'Liga', 'Liga', 'Lig')}</th></tr></thead><tbody>${M.map(([k, l, f]) => { const hv = H.row?.[k], av = A.row?.[k], hr = H.rk?.[k], ar = A.rk?.[k]; const better = hr != null && ar != null ? (hr < ar ? 'h' : ar < hr ? 'a' : '') : ''; return `<tr><td class="l">${l}</td><td>${better === 'h' ? '<b>' : ''}${f(hv)}${better === 'h' ? '</b>' : ''}${rk(hr)}</td><td>${better === 'a' ? '<b>' : ''}${f(av)}${better === 'a' ? '</b>' : ''}${rk(ar)}</td><td>${f(X.avg?.[k])}</td></tr>`; }).join('')}</tbody></table></div>
<p><b>${esc(nH)}:</b> ${esc(interp(H) || '')}</p><p><b>${esc(nA)}:</b> ${esc(interp(A) || '')}</p>
<h3>${T('Four Factors αντικριστά', 'Four Factors head-to-head', 'Four Factors cara a cara', 'Four Factors jedan na jedan', 'Four Factors karşılaştırması')}</h3>
<div class="tbl"><table class="antbl"><thead><tr><th class="l">${T('Παράγοντας', 'Factor', 'Factor', 'Faktor', 'Faktör')}</th><th>${T(`Επίθεση ${esc(nH)}`, `${esc(nH)} offense`, `Ataque ${esc(nH)}`, `Napad ${esc(nH)}`, `${esc(nH)} hücumu`)}</th><th>${T(`Άμυνα ${esc(nA)}`, `${esc(nA)} defense`, `Defensa ${esc(nA)}`, `Odbrana ${esc(nA)}`, `${esc(nA)} savunması`)}</th><th>${T(`Επίθεση ${esc(nA)}`, `${esc(nA)} offense`, `Ataque ${esc(nA)}`, `Napad ${esc(nA)}`, `${esc(nA)} hücumu`)}</th><th>${T(`Άμυνα ${esc(nH)}`, `${esc(nH)} defense`, `Defensa ${esc(nH)}`, `Odbrana ${esc(nH)}`, `${esc(nH)} savunması`)}</th></tr></thead><tbody>
${F.ffH.map((x, i) => { const y = F.ffA[i]; return `<tr><td class="l">${ffName[x.o]}</td><td>${pc(x.ov)}${rk(x.or)}</td><td>${pc(x.dv)}${rk(x.dr)}</td><td>${pc(y.ov)}${rk(y.or)}</td><td>${pc(y.dv)}${rk(y.dr)}</td></tr>`; }).join('')}</tbody></table></div></section>`);

  // ---- 4. σουτ και ζώνες
  const ZL = { rim: T('στο καλάθι', 'at the rim', 'en el aro', 'ispod koša', 'pota altından'), paint: T('στη ρακέτα', 'in the paint', 'en la pintura', 'u reketu', 'boyalı alandan'), mid: T('από μέση απόσταση', 'from mid-range', 'a media distancia', 'sa poludistance', 'orta mesafeden'), corner3: T('τρίποντα από τη γωνία', 'corner threes', 'triples desde la esquina', 'trojke iz ugla', 'köşeden üçlük olarak'), wing3: T('τρίποντα από τα φτερά', 'wing threes', 'triples desde el lateral', 'trojke sa krila', 'kanattan üçlük olarak'), top3: T('τρίποντα από την κορυφή', 'top-of-the-key threes', 'triples frontales', 'trojke sa vrha', 'tepeden üçlük olarak') };
  if (F.LA && H.own && A.own) {
    const zt = (O, D, Z) => {
      const z = Z[0]; if (!z) return '';
      return T(`${cap1(gN(O.t))} παίρνει το ${pc(z.share, 0)} των σουτ ${masc(O.t) ? 'του' : 'της'} ${ZL[z.z]} (λίγκα ${pc(z.lshare, 0)}) με ${pc(z.fg, 0)} (λίγκα ${pc(z.lfg, 0)}), ενώ ${gN(D.t)} αφήνει στους αντιπάλους ${pc(z.dfg, 0)} εκεί. Εκεί βρίσκεται το μεγαλύτερο πλεονέκτημα ${gG(O.t)}.`,
        `${nm(O.t)} take ${pc(z.share, 0)} of their shots ${ZL[z.z]} (league ${pc(z.lshare, 0)}) at ${pc(z.fg, 0)} (league ${pc(z.lfg, 0)}), and ${nm(D.t)} allow ${pc(z.dfg, 0)} there. That is ${nm(O.t)}'s biggest edge.`,
        `${esc(nm(O.t))} lanza el ${pc(z.share, 0)} de sus tiros ${ZL[z.z]} (liga ${pc(z.lshare, 0)}) con un ${pc(z.fg, 0)} (liga ${pc(z.lfg, 0)}), y ${esc(nm(D.t))} concede un ${pc(z.dfg, 0)} ahí. Esa es la mayor ventaja de ${esc(nm(O.t))}.`,
        `${esc(nm(O.t))} upućuje ${pc(z.share, 0)} šuteva ${ZL[z.z]} (liga ${pc(z.lshare, 0)}) sa ${pc(z.fg, 0)} (liga ${pc(z.lfg, 0)}), a ${esc(nm(D.t))} tu dozvoljava ${pc(z.dfg, 0)}. To je najveća prednost tima ${esc(nm(O.t))}.`, `${nm(O.t)} şutlarının ${pc(z.share, 0)} kadarını ${ZL[z.z]} kullanıyor (lig ${pc(z.lshare, 0)}), isabeti ${pc(z.fg, 0)} (lig ${pc(z.lfg, 0)}); rakip ${nm(D.t)} ise orada ${pc(z.dfg, 0)} isabete izin veriyor. En büyük avantaj bu: ${nm(O.t)} için.`);
    };
    const zr = (O) => ZG.map(z => `<td>${O.own?.[z] ? `${pc(O.own[z].share, 0)} · ${pc(O.own[z].fg, 0)}` : '–'}</td>`).join('');
    const zd = (O) => ZG.map(z => `<td>${O.def?.[z] ? `${pc(O.def[z].share, 0)} · ${pc(O.def[z].fg, 0)}` : '–'}</td>`).join('');
    const ZH = { rim: T('Καλάθι', 'Rim', 'Aro', 'Koš', 'Pota altı'), paint: T('Ρακέτα', 'Paint', 'Pintura', 'Reket', 'Boyalı alan'), mid: T('Μέση', 'Mid', 'Media', 'Poludist.', 'Orta'), corner3: T('Γωνία 3', 'Corner 3', 'Esquina 3', 'Ugao 3', 'Köşe 3'), wing3: T('Φτερό 3', 'Wing 3', 'Lateral 3', 'Krilo 3', 'Kanat 3'), top3: T('Κορυφή 3', 'Top 3', 'Frontal 3', 'Vrh 3', 'Tepe 3') };
    const fbT = O => T(`${esc(nm(O.t))}: ${pc(O.fbShare, 0)} των σουτ από αιφνιδιασμό και ${pc(O.scShare, 0)} από δεύτερη ευκαιρία.`, `${nm(O.t)}: ${pc(O.fbShare, 0)} of shots in transition and ${pc(O.scShare, 0)} on second chances.`, `${esc(nm(O.t))}: ${pc(O.fbShare, 0)} de los tiros al contraataque y ${pc(O.scShare, 0)} en segundas oportunidades.`, `${esc(nm(O.t))}: ${pc(O.fbShare, 0)} šuteva iz kontre i ${pc(O.scShare, 0)} iz druge šanse.`, `${nm(O.t)}: şutların ${pc(O.fbShare, 0)} kadarı hızlı hücumdan, ${pc(O.scShare, 0)} kadarı ikinci şanstan.`);
    P.push(`<section><h2>${T('4. Σουτ και ζώνες', '4. Shots and zones', '4. Tiros y zonas', '4. Šutevi i zone', '4. Şutlar ve bölgeler')}</h2>
<p>${zt(H, A, F.zH)}</p><p>${zt(A, H, F.zA)}</p>
<div class="tbl"><table class="antbl"><thead><tr><th class="l">${T('Μερίδιο σουτ · ποσοστό', 'Share of shots · FG%', 'Cuota de tiros · %', 'Udeo šuteva · %', 'Şut payı · isabet %')}</th>${ZG.map(z => `<th>${ZH[z]}</th>`).join('')}</tr></thead><tbody>
<tr><td class="l">${T('Επίθεση', 'Offense', 'Ataque', 'Napad', 'Hücum')} ${esc(nH)}</td>${zr(H)}</tr><tr><td class="l">${T('Άμυνα', 'Defense', 'Defensa', 'Odbrana', 'Savunma')} ${esc(nA)}</td>${zd(A)}</tr>
<tr><td class="l">${T('Επίθεση', 'Offense', 'Ataque', 'Napad', 'Hücum')} ${esc(nA)}</td>${zr(A)}</tr><tr><td class="l">${T('Άμυνα', 'Defense', 'Defensa', 'Odbrana', 'Savunma')} ${esc(nH)}</td>${zd(H)}</tr>
<tr class="avg"><td class="l">${T('Λίγκα', 'League', 'Liga', 'Liga', 'Lig')}</td>${ZG.map(z => `<td>${pc(F.LA[z]?.share, 0)} · ${pc(F.LA[z]?.fg, 0)}</td>`).join('')}</tr></tbody></table></div>
<p class="sub">${fbT(H)} ${fbT(A)} <a href="${X.shtUrl(H.t)}">Shot chart ${esc(nH)}</a> · <a href="${X.shtUrl(A.t)}">Shot chart ${esc(nA)}</a></p></section>`);
  }

  // ---- 5. πεντάδες, on/off, clutch
  const luT = (O) => O.lu.map(l => `<li>${l.p.map(id => esc(pName(id))).join(', ')}: <b>${sg(l.net)}</b> net ${T('σε', 'in', 'en', 'u', 'içinde')} ${Math.round(l.poss)} ${T('κατοχές', 'possessions', 'posesiones', 'poseda', 'hücum')}</li>`).join('');
  const ooT = (O) => [O.oo[0], O.oo[1], O.oo[O.oo.length - 1]].filter((x, i, a) => x && a.indexOf(x) === i).map(x => `<li>${esc(pName(x.id))}${O.outIds.has(x.id) ? ` <small>(${T('εκτός', 'out', 'baja', 'van', 'yok')})</small>` : ''}: ${x.diff.net >= 0 ? T('η ομάδα είναι', 'the team is', 'el equipo es', 'tim je', 'takım') + ` <b>+${x.diff.net.toFixed(1)}</b> ` + T('καλύτερη όταν παίζει (net ανά 100 κατοχές)', 'better with him on court (net per 100 possessions)', 'mejor con él en pista (net por 100 posesiones)', 'bolji kada on igra (net na 100 poseda)', 'o sahadayken daha iyi (100 hücum başına net)') : T('η ομάδα είναι', 'the team is', 'el equipo es', 'tim je', 'takım') + ` <b>${Math.abs(x.diff.net).toFixed(1)}</b> ` + T('καλύτερη όταν κάθεται', 'better with him off the court', 'mejor con él en el banco', 'bolji kada on sedi', 'o kenardayken daha iyi')}</li>`).join('');
  const clT = O => (O.cl && O.cl.poss >= 8 ? T(`${esc(nm(O.t))}: ${sg(O.cl.net)} net σε ${Math.round(O.cl.poss)} κατοχές clutch (τελευταία 5′, διαφορά ≤5), ${O.cl.pts}-${O.cl.ptsA} σε πόντους.`, `${nm(O.t)}: ${sg(O.cl.net)} net in ${Math.round(O.cl.poss)} clutch possessions (last 5′, margin ≤5), ${O.cl.pts}-${O.cl.ptsA} in points.`, `${esc(nm(O.t))}: ${sg(O.cl.net)} net en ${Math.round(O.cl.poss)} posesiones clutch (últimos 5′, diferencia ≤5), ${O.cl.pts}-${O.cl.ptsA} en puntos.`, `${esc(nm(O.t))}: ${sg(O.cl.net)} net u ${Math.round(O.cl.poss)} clutch poseda (poslednjih 5′, razlika ≤5), ${O.cl.pts}-${O.cl.ptsA} u poenima.`, `${nm(O.t)}: ${Math.round(O.cl.poss)} clutch hücumda ${sg(O.cl.net)} net (son 5′, fark ≤5), sayılar ${O.cl.pts}-${O.cl.ptsA}.`) : T(`${esc(nm(O.t))}: ελάχιστα λεπτά clutch φέτος.`, `${nm(O.t)}: very few clutch minutes this season.`, `${esc(nm(O.t))}: muy pocos minutos clutch esta temporada.`, `${esc(nm(O.t))}: vrlo malo clutch minuta ove sezone.`, `${nm(O.t)}: bu sezon çok az clutch dakika.`));
  P.push(`<section><h2>${T('5. Πεντάδες, On/Off και clutch', '5. Lineups, On/Off and clutch', '5. Quintetos, On/Off y clutch', '5. Petorke, On/Off i clutch', '5. Beşliler, On/Off ve clutch')}</h2>
<div class="gcols"><div><h3>${esc(nH)}</h3><p class="sub">${T('Καλύτερες πεντάδες', 'Best lineups', 'Mejores quintetos', 'Najbolje petorke', 'En iyi beşliler')}</p><ul>${luT(H) || '<li>–</li>'}</ul><p class="sub">On/Off</p><ul>${ooT(H) || '<li>–</li>'}</ul><p>${clT(H)}</p></div>
<div><h3>${esc(nA)}</h3><p class="sub">${T('Καλύτερες πεντάδες', 'Best lineups', 'Mejores quintetos', 'Najbolje petorke', 'En iyi beşliler')}</p><ul>${luT(A) || '<li>–</li>'}</ul><p class="sub">On/Off</p><ul>${ooT(A) || '<li>–</li>'}</ul><p>${clT(A)}</p></div></div></section>`);

  // ---- 6. παίκτες και θέσεις
  const POS = ['Guard', 'Forward', 'Center'], PL = { Guard: T('Γκαρντ', 'Guards', 'Bases/escoltas', 'Bekovi', 'Gardlar'), Forward: T('Φόργουορντ', 'Forwards', 'Aleros', 'Krila', 'Forvetler'), Center: T('Σέντερ', 'Centers', 'Pívots', 'Centri', 'Pivotlar') };
  const top = O => O.roster.filter(x => !O.outIds.has(x.p.c)).slice(0, 4).map(({ p, s }) => `<li><a href="${pUrl(p)}">${esc(X.niceName(p.n))}</a> <small>${esc(PL[p.pos] || '')}</small>: ${n1(s.pts)} ${T('π.', 'pts', 'pts', 'p.', 'sayı')}, ${n1(s.reb)} ${T('ριμπ.', 'reb', 'reb', 'sk.', 'rib')}, ${n1(s.ast)} ${T('ασίστ', 'ast', 'asist.', 'as.', 'ast')}, <b>${n1(s.pir)} PIR</b></li>`).join('');
  const posRows = POS.map(k => { const a1 = H.posFor[k], b1 = A.posAg[k], a2 = A.posFor[k], b2 = H.posAg[k]; return `<tr><td class="l">${PL[k]}</td><td>${n1(a1)}</td><td>${n1(b1)}</td><td>${n1(a2)}</td><td>${n1(b2)}</td></tr>`; }).join('');
  let posNote = '';
  const gaps = POS.flatMap(k => [[H, A, k, (H.posFor[k] || 0) + (A.posAg[k] || 0)], [A, H, k, (A.posFor[k] || 0) + (H.posAg[k] || 0)]]).sort((x, y) => y[3] - x[3]);
  if (gaps[0]) { const [O, D, k] = gaps[0]; posNote = T(`Η πιο «ανοιχτή» μονομαχία: οι ${PL[k].toLowerCase()} ${gG(O.t)} (${n1(O.posFor[k])} PIR ανά αγώνα) απέναντι σε άμυνα που δίνει ${n1(D.posAg[k])} PIR στη θέση.`, `The most open matchup: ${nm(O.t)}'s ${PL[k].toLowerCase()} (${n1(O.posFor[k])} PIR per game) against a defense allowing ${n1(D.posAg[k])} PIR at that position.`, `El duelo más abierto: los ${PL[k].toLowerCase()} de ${esc(nm(O.t))} (${n1(O.posFor[k])} PIR por partido) contra una defensa que concede ${n1(D.posAg[k])} PIR en esa posición.`, `Najotvoreniji duel: ${PL[k].toLowerCase()} tima ${esc(nm(O.t))} (${n1(O.posFor[k])} PIR po utakmici) protiv odbrane koja na toj poziciji daje ${n1(D.posAg[k])} PIR.`, `En açık eşleşme: ${nm(O.t)} – ${PL[k].toLowerCase()} (maç başına ${n1(O.posFor[k])} PIR), bu pozisyonda ${n1(D.posAg[k])} PIR veren bir savunmaya karşı.`); }
  P.push(`<section><h2>${T('6. Οι πρωταγωνιστές και οι μονομαχίες ανά θέση', '6. Key players and matchups by position', '6. Protagonistas y duelos por posición', '6. Glavni igrači i dueli po pozicijama', '6. Öne çıkan oyuncular ve pozisyon eşleşmeleri')}</h2>
<div class="gcols"><div><h3>${esc(nH)}</h3><ul>${top(H)}</ul></div><div><h3>${esc(nA)}</h3><ul>${top(A)}</ul></div></div>
<p class="sub">${T('PIR ανά αγώνα ανά θέση · η παραγωγή χωρίς τους τραυματίες', 'PIR per game by position · production excludes injured players', 'PIR por partido y posición · producción sin los lesionados', 'PIR po utakmici po poziciji · bez povređenih', 'Pozisyona göre maç başına PIR · üretime sakat oyuncular dahil değil')}</p><div class="tbl"><table class="antbl"><thead><tr><th class="l">PIR / ${T('αγώνα', 'game', 'partido', 'utakmica', 'maç')}</th><th>${T(`${esc(nH)} παράγει`, `${esc(nH)} produce`, `${esc(nH)} produce`, `${esc(nH)} daje`, `${esc(nH)} üretiyor`)}</th><th>${T(`${esc(nA)} δίνει`, `${esc(nA)} allow`, `${esc(nA)} concede`, `${esc(nA)} prima`, `${esc(nA)} izin veriyor`)}</th><th>${T(`${esc(nA)} παράγει`, `${esc(nA)} produce`, `${esc(nA)} produce`, `${esc(nA)} daje`, `${esc(nA)} üretiyor`)}</th><th>${T(`${esc(nH)} δίνει`, `${esc(nH)} allow`, `${esc(nH)} concede`, `${esc(nH)} prima`, `${esc(nH)} izin veriyor`)}</th></tr></thead><tbody>${posRows}</tbody></table></div>
${posNote ? `<p>${posNote}</p>` : ''}</section>`);

  // ---- 7. απουσίες
  const injL = O => (O.inj.length ? O.inj.map(x => `<li><b>${esc(x.n)}</b>: ${esc(x.t || '')}</li>`).join('') : `<li>${T('Καμία γνωστή απουσία', 'No known absences', 'Sin bajas conocidas', 'Nema poznatih odsustava', 'Bilinen eksik yok')}</li>`);
  const simP = (pred?.sim?.players || []).filter(x => x.out && Math.abs(x.dm) >= 0.3);
  P.push(`<section><h2>${T('7. Απουσίες και επίδραση', '7. Absences and their impact', '7. Bajas y su impacto', '7. Odsustva i njihov uticaj', '7. Eksikler ve etkileri')}</h2>
<div class="gcols"><div><h3>${esc(nH)}</h3><ul>${injL(H)}</ul></div><div><h3>${esc(nA)}</h3><ul>${injL(A)}</ul></div></div>
${pred && (pred.h_absent >= 0.1 || pred.a_absent >= 0.1) ? `<p>${[[H, pred.h_absent], [A, pred.a_absent]].filter(([, v]) => v >= 0.1).map(([O, v]) => T(`${cap1(gN(O.t))} θα παίξει χωρίς παίκτες που είχαν το <b>${pc(v, 0)}</b> των λεπτών ${masc(O.t) ? "του" : "της"} στους τελευταίους αγώνες.`, `${nm(O.t)} will be without players who took <b>${pc(v, 0)}</b> of their recent minutes.`, `${esc(nm(O.t))} jugará sin jugadores que sumaban el <b>${pc(v, 0)}</b> de sus minutos recientes.`, `${esc(nm(O.t))} će igrati bez igrača koji su imali <b>${pc(v, 0)}</b> nedavnih minuta.`, `${nm(O.t)}, son maçlardaki dakikalarının <b>${pc(v, 0)}</b> kadarını alan oyuncular olmadan oynayacak.`)).join(' ')}</p>` : ''}
${simP.length ? `<p>${T('Σύμφωνα με το μοντέλο, κάθε απουσία αλλάζει την αναμενόμενη διαφορά κατά', 'According to the model, each absence shifts the expected margin by', 'Según el modelo, cada baja cambia la diferencia esperada en', 'Prema modelu, svako odsustvo menja očekivanu razliku za', 'Modele göre her eksik, beklenen farkı şu kadar değiştiriyor:')}: ${simP.map(x => `${esc(pName(x.id))} ${Math.abs(x.dm).toFixed(1)} ${T('πόντους', 'points', 'puntos', 'poena', 'sayı')}`).join(' · ')}.</p>` : ''}</section>`);

  // ---- 8. μεταξύ τους
  const hh = F.h2h.slice(0, 8);
  if (hh.length) {
    const wH = F.h2h.filter(g => (g.h === H.t ? g.hs > g.as : g.as > g.hs)).length;
    P.push(`<section><h2>${T('8. Μεταξύ τους', '8. Head-to-head', '8. Enfrentamientos directos', '8. Međusobni dueli', '8. Aralarındaki maçlar')}</h2><p>${T(`Στους ${F.h2h.length} τελευταίους αγώνες τους στην EuroLeague (από το 2023): ${esc(nH)} ${wH}, ${esc(nA)} ${F.h2h.length - wH}.`, `In their last ${F.h2h.length} EuroLeague meetings (since 2023): ${nH} ${wH}, ${nA} ${F.h2h.length - wH}.`, `En sus últimos ${F.h2h.length} duelos de EuroLeague (desde 2023): ${esc(nH)} ${wH}, ${esc(nA)} ${F.h2h.length - wH}.`, `U poslednjih ${F.h2h.length} duela u Evroligi (od 2023): ${esc(nH)} ${wH}, ${esc(nA)} ${F.h2h.length - wH}.`, `EuroLeague’deki son ${F.h2h.length} karşılaşma (2023’ten beri): ${nH} ${wH}, ${nA} ${F.h2h.length - wH}.`)}</p>
<ul>${hh.map(g => `<li>${esc(g.d || '')}: ${esc(tName(g.h))} – ${esc(tName(g.a))} <b>${g.hs}-${g.as}</b></li>`).join('')}</ul></section>`);
  }
  // ---- 9. συμπέρασμα
  if (pred) P.push(`<section><h2>${T('9. Η εκτίμησή μας', '9. Our view', '9. Nuestra valoración', '9. Naša procena', '9. Bizim görüşümüz')}</h2><p>${T(`Όλα τα παραπάνω συνοψίζονται στην πρόβλεψη του μοντέλου: <b>${esc(nH)} ${pc(pred.p_home, 0)} – ${esc(nA)} ${pc(pred.p_away, 0)}</b>, σκορ περίπου ${Math.round(pred.hs)}-${Math.round(pred.as)}. Δοκίμασε τα δικά σου σενάρια (απουσίες, ξεκούραση, έδρα) στο <a href="${mcUrl}">Matchup Center</a> και δες ζωντανά τον αγώνα στη <a href="${gameUrl}">σελίδα του αγώνα</a>.`, `All of the above comes together in the model's projection: <b>${nH} ${pc(pred.p_home, 0)} – ${nA} ${pc(pred.p_away, 0)}</b>, a score of about ${Math.round(pred.hs)}-${Math.round(pred.as)}. Try your own scenarios (absences, rest, venue) in the <a href="${mcUrl}">Matchup Center</a> and follow the game live on the <a href="${gameUrl}">game page</a>.`, `Todo lo anterior se resume en la proyección del modelo: <b>${esc(nH)} ${pc(pred.p_home, 0)} – ${esc(nA)} ${pc(pred.p_away, 0)}</b>, marcador de unos ${Math.round(pred.hs)}-${Math.round(pred.as)}. Prueba tus propios escenarios (bajas, descanso, pista) en el <a href="${mcUrl}">Matchup Center</a> y sigue el partido en directo en la <a href="${gameUrl}">página del partido</a>.`, `Sve navedeno sažima projekcija modela: <b>${esc(nH)} ${pc(pred.p_home, 0)} – ${esc(nA)} ${pc(pred.p_away, 0)}</b>, rezultat oko ${Math.round(pred.hs)}-${Math.round(pred.as)}. Isprobaj svoje scenarije (odsustva, odmor, domaćin) u <a href="${mcUrl}">Matchup Centru</a> i prati utakmicu uživo na <a href="${gameUrl}">stranici utakmice</a>.`, `Yukarıdakilerin hepsi modelin tahmininde birleşiyor: <b>${nH} ${pc(pred.p_home, 0)} – ${nA} ${pc(pred.p_away, 0)}</b>, skor yaklaşık ${Math.round(pred.hs)}-${Math.round(pred.as)}. Kendi senaryolarını (eksikler, dinlenme, salon) <a href="${mcUrl}">Matchup Center</a> üzerinde dene ve maçı <a href="${gameUrl}">maç sayfasından</a> canlı takip et.`)}</p></section>`);
  return P.join('\n');
}
