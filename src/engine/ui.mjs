// Intelligence Engine, Φάση 7: HTML για το προφίλ παίκτη και τη σελίδα «Ακρίβεια προβλέψεων».
// Καθαρές συναρτήσεις: όλα τα κείμενα περνούν από το T(el, en, es, sr, tr) του build. Χωρίς δεδομένα δεν βγάζουν τίποτα.

const STAT = T => ({ pts: T('Πόντοι', 'Points', 'Puntos', 'Poeni', 'Sayı'), reb: T('Ριμπάουντ', 'Rebounds', 'Rebotes', 'Skokovi', 'Ribaund'),
  ast: T('Ασίστ', 'Assists', 'Asistencias', 'Asistencije', 'Asist'), fg3: T('Τρίποντα', '3-pointers', 'Triples', 'Trojke', 'Üçlük') });
const pc = x => (x < 0.005 ? '&lt;1%' : x > 0.995 ? '&gt;99%' : `${Math.round(100 * x)}%`);
const n1 = (x, LOC) => (x == null ? '–' : Number(x).toLocaleString(LOC, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

/** ετικέτα ποιότητας δεδομένων */
export function qualityLabel(q, T) {
  return {
    ok: [T('Κανονική', 'Normal', 'Normal', 'Normalan', 'Normal'), 'pos'],
    uncertain: [T('Αβέβαιη: αμφίβολος', 'Uncertain: doubtful', 'Incierta: duda', 'Nesigurno: upitan', 'Belirsiz: şüpheli'), 'neg'],
    experimental: [T('Πειραματική: λίγοι αγώνες', 'Experimental: few games', 'Experimental: pocos partidos', 'Eksperimentalno: malo utakmica', 'Deneysel: az maç'), 'neg'],
    out: [T('Δεν αναμένεται να παίξει', 'Not expected to play', 'No se espera que juegue', 'Ne očekuje se da igra', 'Oynaması beklenmiyor'), 'neg'],
  }[q] || null;
}

/** ενότητα «Πρόβλεψη επόμενου αγώνα» στο προφίλ παίκτη (μόνο αν το engine έχει πρόβλεψη για αυτόν) */
export function playerProjectionSection(x, { file, T, esc, tName, LOC = 'el-GR', perfUrl, analyzerUrl = null }) {
  if (!x || !x.stats || !x.minutes || x.quality === 'insufficient') return '';
  const S = STAT(T), Q = qualityLabel(x.quality, T);
  const opp = x.opp_id ? `${x.home ? T('με', 'vs', 'vs', 'protiv', 'vs') : '@'} ${esc(tName(x.opp_id))}` : '';
  const am = (lab, val, sub = '') => `<div class="am"><span>${lab}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const metrics = [
    am(T('Πιθανότητα να παίξει', 'Chance to play', 'Probabilidad de jugar', 'Šansa da igra', 'Oynama olasılığı'), pc(x.minutes.p_play)),
    am(T('Λεπτά (αν παίξει)', 'Minutes (if he plays)', 'Minutos (si juega)', 'Minuti (ako igra)', 'Dakika (oynarsa)'), `${n1(x.minutes.if_plays, LOC)}′`),
    ...['pts', 'reb', 'ast', 'fg3'].map(s => am(S[s], n1(x.stats[s].mean, LOC), `± ${n1(x.stats[s].sd, LOC)}`)),
    ...(x.pir ? [am('PIR', n1(x.pir.mean, LOC))] : []),
  ].join('');
  const ladder = ['pts', 'reb', 'ast', 'fg3'].map(s => `<tr><td class="l">${S[s]}</td>${Object.entries(x.stats[s].over).map(([L, p]) => `<td><small>${T('πάνω από', 'over', 'más de', 'preko', 'üstü')} ${String(L).replace('.', LOC.startsWith('en') ? '.' : ',')}</small><br><b>${pc(p)}</b></td>`).join('')}</tr>`).join('');
  return `<section class="career engproj"><h2>${T('Πρόβλεψη επόμενου αγώνα', 'Next game projection', 'Proyección del próximo partido', 'Projekcija sledeće utakmice', 'Sonraki maç projeksiyonu')}${opp ? ` · ${opp}` : ''}</h2>
<p class="sub">${T('Αγωνιστική', 'Round', 'Jornada', 'Kolo', 'Hafta')} ${file.round}${Q ? ` · ${T('Ποιότητα δεδομένων', 'Data quality', 'Calidad de datos', 'Kvalitet podataka', 'Veri kalitesi')}: <span class="${Q[1]}">${esc(Q[0])}</span>` : ''}</p>
<div class="anmetrics">${metrics}</div>
<h3>${T('Πιθανότητες (αν παίξει)', 'Probabilities (if he plays)', 'Probabilidades (si juega)', 'Verovatnoće (ako igra)', 'Olasılıklar (oynarsa)')}</h3>
<div class="tbl"><table class="antbl"><tbody>${ladder}</tbody></table></div>
<p class="sub">${T('Στατιστική εκτίμηση του μοντέλου μας από τους προηγούμενους αγώνες του (λεπτά, ρυθμός ανά λεπτό, προηγούμενη σεζόν). Δεν είναι εγγύηση ούτε συμβουλή στοιχήματος.', 'Our model’s statistical estimate from his previous games (minutes, per-minute rate, last season). Not a guarantee and not betting advice.', 'Estimación estadística de nuestro modelo a partir de sus partidos anteriores (minutos, ritmo por minuto, temporada pasada). No es una garantía ni un consejo de apuesta.', 'Statistička procena našeg modela iz njegovih prethodnih utakmica (minuti, učinak po minutu, prošla sezona). Nije garancija ni savet za klađenje.', 'Modelimizin önceki maçlarına dayanan istatistiksel tahmini (dakika, dakika başına üretim, geçen sezon). Garanti veya bahis tavsiyesi değildir.')}
 <a href="${perfUrl}">${T('Πόσο πέφτει μέσα το μοντέλο →', 'How accurate is the model →', '¿Qué tan preciso es el modelo? →', 'Koliko je model tačan →', 'Model ne kadar isabetli →')}</a>${analyzerUrl ? ` · <a href="${analyzerUrl}">Prop Analyzer →</a>` : ''}</p></section>`;
}

/** κύριο περιεχόμενο της σελίδας «Ακρίβεια προβλέψεων» */
export function perfPageMain({ live, summary, gate, file, T, esc, LOC = 'el-GR', urls = {} }) {
  const S = STAT(T);
  const am = (lab, val, sub = '') => `<div class="am"><span>${lab}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const nf = x => Number(x).toLocaleString(LOC);
  const best = (row, k) => Math.min(...Object.values(row).map(v => (typeof v === 'object' ? v[k] : v)));
  const f3 = x => Number(x).toLocaleString(LOC, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const cell3 = (x, row, k = 'mae') => `<td class="${x === best(row, k) ? 'pos' : ''}">${f3(x)}</td>`;
  const H = { engine: T('Μοντέλο', 'Model', 'Modelo', 'Model', 'Model'), props_ew: T('Παλιό μοντέλο', 'Previous model', 'Modelo anterior', 'Prethodni model', 'Önceki model'),
    season_mean: T('Μέσος όρος σεζόν', 'Season average', 'Promedio de temporada', 'Prosek sezone', 'Sezon ortalaması'), last5: T('Μ.Ο. 5 αγώνων', 'Last 5 avg', 'Media 5 partidos', 'Prosek 5 utakmica', 'Son 5 ort.'), last10: T('Μ.Ο. 10 αγώνων', 'Last 10 avg', 'Media 10 partidos', 'Prosek 10 utakmica', 'Son 10 ort.') };
  // 1. σε πραγματικό χρόνο (pregame αρχείο)
  let liveHtml;
  if (live?.n_played) {
    const rows = ['pts', 'reb', 'ast', 'fg3'].map(s => { const R = live.stats[s]; const row = { engine: R.engine_median.mae, season_mean: R.season_mean.mae, last5: R.last5.mae, last10: R.last10.mae };
      return `<tr><td class="l">${S[s]}</td>${['engine', 'season_mean', 'last5', 'last10'].map(k => cell3(row[k], row)).join('')}</tr>`; }).join('');
    liveHtml = `<div class="anmetrics">${am(T('Προβλέψεις που κρίθηκαν', 'Settled predictions', 'Predicciones resueltas', 'Rešene prognoze', 'Sonuçlanan tahminler'), nf(live.n_predictions))}${am(T('Έπαιξαν', 'Played', 'Jugaron', 'Igrali', 'Oynadı'), nf(live.n_played))}${am(T('Αγωνιστικές', 'Rounds', 'Jornadas', 'Kola', 'Haftalar'), live.rounds.join(', '))}${live.minutes?.expected?.n ? am(T('Σφάλμα λεπτών', 'Minutes error', 'Error de minutos', 'Greška minuta', 'Dakika hatası'), `${n1(live.minutes.expected.mae, LOC)}′`) : ''}${live.pir?.if_plays?.n ? am(T('Σφάλμα PIR', 'PIR error', 'Error de PIR', 'Greška PIR', 'PIR hatası'), n1(live.pir.if_plays.mae, LOC)) : ''}</div>
${live.sample_note ? `<p class="sub neg">${T('Μικρό δείγμα ακόμα: τα νούμερα θα σταθεροποιηθούν μετά από 2–3 αγωνιστικές.', 'Small sample so far: the numbers will settle after 2–3 rounds.', 'Muestra pequeña todavía: las cifras se estabilizarán tras 2–3 jornadas.', 'Još mali uzorak: brojevi će se stabilizovati posle 2–3 kola.', 'Henüz küçük örneklem: rakamlar 2–3 haftadan sonra oturacak.')}</p>` : ''}
<div class="tbl"><table class="antbl"><thead><tr><th class="l"></th>${['engine', 'season_mean', 'last5', 'last10'].map(k => `<th>${H[k]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
<p class="sub">${T('Μέσο απόλυτο σφάλμα ανά παίκτη και αγώνα (μικρότερο = καλύτερο), μόνο για όσους έπαιξαν.', 'Mean absolute error per player and game (lower = better), only for players who played.', 'Error absoluto medio por jugador y partido (menor = mejor), solo para quienes jugaron.', 'Prosečna apsolutna greška po igraču i utakmici (manje = bolje), samo za one koji su igrali.', 'Oyuncu ve maç başına ortalama mutlak hata (düşük = iyi), yalnızca oynayanlar için.')}</p>`;
  } else liveHtml = `<p class="sub">${T('Οι πρώτες κλειδωμένες προβλέψεις (από την 14η αγωνιστική) θα κριθούν μόλις τελειώσουν οι αγώνες. Τα αποτελέσματα εμφανίζονται εδώ αυτόματα.', 'The first locked predictions (from round 14) will be settled once the games finish. Results appear here automatically.', 'Las primeras predicciones bloqueadas (desde la jornada 14) se resolverán cuando terminen los partidos. Los resultados aparecen aquí automáticamente.', 'Prve zaključane prognoze (od 14. kola) biće rešene kad se utakmice završe. Rezultati se ovde pojavljuju automatski.', 'Kilitlenen ilk tahminler (14. haftadan itibaren) maçlar bitince sonuçlanacak. Sonuçlar burada otomatik görünür.')}</p>`;
  // 2. backtest 7 σεζόν
  let btHtml = '';
  if (summary?.stats) {
    const rows = ['pts', 'reb', 'ast', 'fg3'].map(s => { const R = summary.stats[s]; return `<tr><td class="l">${S[s]}</td>${['engine', 'props_ew', 'season_mean', 'last5', 'last10'].map(k => cell3(R[k].mae, R)).join('')}</tr>`; }).join('');
    const mE = summary.minutes.expected, mI = summary.minutes.if_plays;
    btHtml = `<div class="tbl"><table class="antbl"><thead><tr><th class="l"></th>${['engine', 'props_ew', 'season_mean', 'last5', 'last10'].map(k => `<th>${H[k]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
<p class="sub">${T(`Μέσο σφάλμα ανά παίκτη και αγώνα (μικρότερο = καλύτερο). Σεζόν 2020-21 έως σήμερα, ${nf(summary.stats.n)} εμφανίσεις. Κάθε πρόβλεψη χρησιμοποιεί μόνο αγώνες πριν από τον αγώνα που προβλέπει.`, `Average error per player and game (lower = better). Seasons 2020-21 to today, ${nf(summary.stats.n)} appearances. Each prediction uses only games before the game it predicts.`, `Error medio por jugador y partido (menor = mejor). Temporadas 2020-21 hasta hoy, ${nf(summary.stats.n)} apariciones. Cada predicción usa solo partidos anteriores.`, `Prosečna greška po igraču i utakmici (manje = bolje). Sezone 2020-21 do danas, ${nf(summary.stats.n)} nastupa. Svaka prognoza koristi samo ranije utakmice.`, `Oyuncu ve maç başına ortalama hata (düşük = iyi). 2020-21 sezonundan bugüne, ${nf(summary.stats.n)} maç. Her tahmin yalnızca önceki maçları kullanır.`)}</p>
<div class="anmetrics">${am(T('Λεπτά: σφάλμα μοντέλου', 'Minutes: model error', 'Minutos: error del modelo', 'Minuti: greška modela', 'Dakika: model hatası'), `${n1(mE.hurdle, LOC)}′`, `${T('μέσος 10 αγώνων', 'last-10 average', 'media de 10', 'prosek 10', 'son 10 ort.')} ${n1(mE.last10, LOC)}′`)}${am(T('Λεπτά αν παίξει', 'Minutes if he plays', 'Minutos si juega', 'Minuti ako igra', 'Oynarsa dakika'), `${n1(mI.hurdle, LOC)}′`, `${T('μέσος 10 αγώνων', 'last-10 average', 'media de 10', 'prosek 10', 'son 10 ort.')} ${n1(mI.last10, LOC)}′`)}${am(T('PIR: σφάλμα μοντέλου', 'PIR: model error', 'PIR: error del modelo', 'PIR: greška modela', 'PIR: model hatası'), n1(summary.pir.engine, LOC), `${T('μέσος 10 αγώνων', 'last-10 average', 'media de 10', 'prosek 10', 'son 10 ort.')} ${n1(summary.pir.last10, LOC)}`)}</div>`;
  }
  // 3. απέναντι στις αποδόσεις
  const ev = gate?.evidence;
  const gateHtml = ev ? `<div class="anmetrics">${am(T('Αγώνες με μετρημένες τιμές', 'Games with measured prices', 'Partidos con cuotas medidas', 'Utakmice sa merenim kvotama', 'Ölçülen oranlı maçlar'), `${ev.games}`)}${am(T('Σφάλμα πιθανοτήτων: μοντέλο', 'Probability error: model', 'Error de probabilidad: modelo', 'Greška verovatnoće: model', 'Olasılık hatası: model'), f3(ev.brier.engine))}${am(T('Σφάλμα πιθανοτήτων: bookmakers', 'Probability error: bookmakers', 'Error de probabilidad: casas', 'Greška verovatnoće: kladionice', 'Olasılık hatası: bahis şirketleri'), f3(ev.brier.market))}${am(T('Προτάσεις αξίας', 'Value picks', 'Picks de valor', 'Value izbori', 'Değer seçimleri'), gate.open ? T('Ενεργές', 'Active', 'Activos', 'Aktivni', 'Aktif') : T('Σε αναμονή', 'On hold', 'En espera', 'Na čekanju', 'Beklemede'))}</div>
<p class="sub">${gate.open ? T('Το μοντέλο έχει δείξει με στατιστική βεβαιότητα ότι προβλέπει τα player props καλύτερα από τις αποδόσεις. Αυτό δεν εγγυάται κέρδος.', 'The model has shown with statistical confidence that it predicts player props better than the odds. This does not guarantee profit.', 'El modelo ha demostrado con confianza estadística que predice los player props mejor que las cuotas. Esto no garantiza ganancias.', 'Model je sa statističkom sigurnošću pokazao da predviđa player props bolje od kvota. To ne garantuje dobit.', 'Model, oyuncu prop’larını oranlardan daha iyi tahmin ettiğini istatistiksel güvenle gösterdi. Bu kazanç garantisi değildir.') : T('Μέχρι στιγμής το μοντέλο προβλέπει περίπου όσο καλά και οι bookmakers, όχι καλύτερα με βεβαιότητα. Γι’ αυτό δεν δείχνουμε προτάσεις «αξίας». Θα εμφανιστούν αυτόματα μόνο αν αυτό αλλάξει (τουλάχιστον 40 αγώνες).', 'So far the model predicts about as well as the bookmakers, not demonstrably better. That is why we show no “value” picks. They will appear automatically only if that changes (at least 40 games).', 'Hasta ahora el modelo predice más o menos igual que las casas, no mejor de forma demostrada. Por eso no mostramos picks de «valor». Aparecerán automáticamente solo si eso cambia (al menos 40 partidos).', 'Za sada model predviđa otprilike kao kladionice, ne dokazano bolje. Zato ne prikazujemo „value” izbore. Pojaviće se automatski samo ako se to promeni (najmanje 40 utakmica).', 'Şimdiye kadar model bahis şirketleri kadar iyi tahmin ediyor, kanıtlanmış şekilde daha iyi değil. Bu yüzden “değer” seçimi göstermiyoruz. Bu değişirse (en az 40 maç) otomatik görünecekler.')}</p>` : '';
  return `<h2>${T('Σε πραγματικό χρόνο: κλειδωμένες προβλέψεις πριν από κάθε αγώνα', 'Live: predictions locked before every game', 'En vivo: predicciones bloqueadas antes de cada partido', 'Uživo: prognoze zaključane pre svake utakmice', 'Canlı: her maçtan önce kilitlenen tahminler')}</h2>
<p class="sub">${T('Κάθε πρόβλεψη αποθηκεύεται πριν από το τζάμπολ και δεν αλλάζει ποτέ μετά. Μετά τον αγώνα συγκρίνεται με το αποτέλεσμα.', 'Every prediction is stored before tip-off and never changed afterwards. After the game it is compared with the result.', 'Cada predicción se guarda antes del salto inicial y nunca se cambia después. Tras el partido se compara con el resultado.', 'Svaka prognoza se čuva pre početka i nikad se kasnije ne menja. Posle utakmice poredi se sa rezultatom.', 'Her tahmin maç başlamadan kaydedilir ve sonra asla değiştirilmez. Maçtan sonra sonuçla karşılaştırılır.')}</p>
${liveHtml}
<h2>${T('Δοκιμή σε 7 σεζόν', 'Tested on 7 seasons', 'Probado en 7 temporadas', 'Testirano na 7 sezona', '7 sezonda test')}</h2>
${btHtml}
<h2>${T('Απέναντι στις αποδόσεις των bookmakers', 'Against the bookmakers’ odds', 'Frente a las cuotas de las casas', 'Naspram kvota kladionica', 'Bahis şirketlerinin oranlarına karşı')}</h2>
${gateHtml}
<p class="sub">${T('Μοντέλο', 'Model', 'Modelo', 'Model', 'Model')}: ${esc(file?.version || '–')} · ${T('λεπτά', 'minutes', 'minutos', 'minuti', 'dakika')} ${esc(file?.models?.minutes?.version || '–')} · ${T('στατιστικά', 'stats', 'estadísticas', 'statistika', 'istatistik')} ${esc(file?.models?.stats || '–')}${urls.analyzer ? ` · <a href="${urls.analyzer}">Prop Analyzer →</a>` : ''}</p>`;
}
