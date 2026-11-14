// Κατάλογος εργαλείων του site, οργανωμένος με βάση την ερώτηση του επισκέπτη (όχι με βάση το πώς φτιάχτηκαν).
// Τον χρησιμοποιούν: η σελίδα «Όλα τα εργαλεία», η αρχική του Fantasy («Τι θέλεις να κάνεις;») και οι καρτέλες
// των οικογενειών εργαλείων (π.χ. Optimizer · Πλάνο αγωνιστικής · What-If ως ένα εργαλείο με καρτέλες).
//   T(el, en, es, sr, tr)  μετάφραση της τρέχουσας γλώσσας
//   u(key)                 URL (urlFor της τρέχουσας γλώσσας)
//   has                    { fx, mc, ana, ref, daytip, hist, transfers }: ποιες σελίδες υπάρχουν σε αυτό το build

/** οι 4 ερωτήσεις της αρχικής του Fantasy */
export function fxQuestions(T, u) {
  return [
    { k: 'pick', ic: '🧩', q: T('Ποιους να πάρω;', 'Who should I pick?', '¿A quién fichar?', 'Koga da uzmem?', 'Kimi almalıyım?'),
      d: T('Η καλύτερη πεντάδα για τα credits σου, με βάση τις εκτιμήσεις PIR της αγωνιστικής.', 'The best lineup for your credits, based on this round’s PIR projections.', 'La mejor alineación para tus créditos, según las proyecciones de PIR de la jornada.', 'Najbolja postava za tvoje kredite, prema projekcijama PIR-a za kolo.', 'Bu haftanın PIR tahminlerine göre kredine uygun en iyi kadro.'),
      go: [u('fx:optimizer'), T('Φτιάξε σύνθεση', 'Build a lineup', 'Crear alineación', 'Napravi postavu', 'Kadro kur')],
      more: [[u('fx:projections'), T('Εκτιμήσεις PIR', 'PIR projections', 'Proyecciones PIR', 'PIR projekcije', 'PIR tahminleri')], [u('fx:round-planner'), T('Πλάνο αγωνιστικής', 'Round planner', 'Planificador', 'Plan kola', 'Hafta planı')]] },
    { k: 'cap', ic: '👑', q: T('Ποιον να βάλω αρχηγό;', 'Who should I captain?', '¿A quién hago capitán?', 'Koga za kapitena?', 'Kaptan kim olmalı?'),
      d: T('Ο αρχηγός παίρνει διπλούς πόντους. Δες ποιος έχει την καλύτερη εκτίμηση και το μικρότερο ρίσκο.', 'Your captain scores double. See who has the best projection and the lowest risk.', 'El capitán puntúa doble. Mira quién tiene la mejor proyección y menos riesgo.', 'Kapiten donosi duple poene. Pogledaj ko ima najbolju projekciju i najmanji rizik.', 'Kaptan çift puan alır. En iyi tahmine ve en düşük riske sahip oyuncuyu gör.'),
      go: [u('fx:captain-advisor'), T('Διάλεξε αρχηγό', 'Pick a captain', 'Elegir capitán', 'Izaberi kapitena', 'Kaptan seç')], more: [] },
    { k: 'trade', ic: '🔁', q: T('Τι αλλαγές να κάνω;', 'Which transfers should I make?', '¿Qué fichajes hago?', 'Koje izmene da napravim?', 'Hangi transferleri yapmalıyım?'),
      d: T('Ανέβασε screenshot της ομάδας σου και πάρε προτάσεις αλλαγών. Ή δες ποιος αξίζει τα λεφτά του.', 'Upload a screenshot of your team and get transfer suggestions. Or see who is worth the money.', 'Sube una captura de tu equipo y recibe sugerencias. O mira quién vale lo que cuesta.', 'Pošalji snimak svog tima i dobij predloge izmena. Ili pogledaj ko vredi svoju cenu.', 'Takımının ekran görüntüsünü yükle, transfer önerileri al. Ya da kimin parasını hak ettiğini gör.'),
      go: [u('fx:assistant'), T('Προτάσεις για την ομάδα μου', 'Suggestions for my team', 'Sugerencias para mi equipo', 'Predlozi za moj tim', 'Takımım için öneriler')],
      more: [[u('fx:transfer-market'), 'Transfer Market'], [u('fx:value-board'), 'Value Board']] },
    { k: 'team', ic: '📋', q: T('Πώς πάει η ομάδα μου;', 'How is my team doing?', '¿Cómo va mi equipo?', 'Kako ide moj tim?', 'Takımım nasıl gidiyor?'),
      d: T('Πέρασε την ομάδα σου μία φορά και δες πόντους, τραυματίες και τι να αλλάξεις σε κάθε turn.', 'Enter your team once and see points, injuries and what to change each turn.', 'Introduce tu equipo una vez y mira puntos, lesiones y qué cambiar en cada turno.', 'Unesi tim jednom i prati poene, povrede i šta da menjaš u svakom turnu.', 'Takımını bir kez gir; puanları, sakatlıkları ve her turda neyi değiştireceğini gör.'),
      go: [u('fx:manager'), T('Η ομάδα μου', 'My team', 'Mi equipo', 'Moj tim', 'Takımım')],
      more: [[u('fx:live'), 'Live Tracker']] },
  ];
}

/** οικογένειες εργαλείων: εμφανίζονται ως ένα εργαλείο με καρτέλες (τα URL μένουν ίδια) */
export function families(T, u, has = {}) {
  const odds = T('Αποδόσεις (21+)', 'Odds (18+)', 'Cuotas (18+)', 'Kvote (18+)', 'Oranlar (18+)');
  return [
    { k: 'fxbuild', tabs: [[u('fx:optimizer'), T('Βέλτιστη σύνθεση', 'Lineup optimizer', 'Optimizador', 'Optimizator', 'Kadro optimizasyonu')], [u('fx:round-planner'), T('Πλάνο αγωνιστικής', 'Round planner', 'Planificador', 'Plan kola', 'Hafta planı')], [u('fx:what-if'), 'What-If'], [u('fx:projections'), T('Εκτιμήσεις PIR', 'PIR projections', 'Proyecciones PIR', 'PIR projekcije', 'PIR tahminleri')]] },
    { k: 'fxtrade', tabs: [[u('fx:assistant'), T('Προτάσεις (AI)', 'Suggestions (AI)', 'Sugerencias (IA)', 'Predlozi (AI)', 'Öneriler (AI)')], [u('fx:transfer-market'), 'Transfer Market'], [u('fx:value-board'), 'Value Board'], [u('fx:trade-simulator'), 'Trade Simulator']] },
    { k: 'fxteam', tabs: [[u('fx:manager'), T('Η ομάδα μου', 'My team', 'Mi equipo', 'Moj tim', 'Takımım')], [u('fx:live'), 'Live Tracker']] },
    { k: 'preds', tabs: [[u('preds'), T('Προγνωστικά', 'Predictions', 'Pronósticos', 'Prognoze', 'Tahminler')], [u('tipsters'), 'Tipsters'], ...(has.daytip ? [[u('daytip'), T('Στοίχημα ημέρας', 'Bet of the day', 'Apuesta del día', 'Tip dana', 'Günün bahsi')]] : []), [u('paroli'), T('Παρολί', 'Parlay', 'Combinada', 'Tiket', 'Kombine')], [u('odds'), odds]] },
  ];
}

/** όλα τα εργαλεία, σε ομάδες: [{ h, items: [{ url, t, d }] }] */
export function catalog(T, u, has = {}) {
  const i = (url, t, d) => ({ url, t, d });
  const G = [];
  if (has.fx) G.push({ h: 'EuroLeague Fantasy', items: [
    i(u('fx:assistant'), T('Προτάσεις για την ομάδα σου (AI)', 'Suggestions for your team (AI)', 'Sugerencias para tu equipo (IA)', 'Predlozi za tvoj tim (AI)', 'Takımın için öneriler (AI)'), T('Ανεβάζεις screenshot της ομάδας σου και παίρνεις προτάσεις αλλαγών.', 'Upload a team screenshot and get transfer suggestions.', 'Sube una captura y recibe sugerencias de fichajes.', 'Pošalji snimak tima i dobij predloge izmena.', 'Takım ekran görüntüsünü yükle, transfer önerileri al.')),
    i(u('fx:optimizer'), T('Βέλτιστη σύνθεση', 'Lineup optimizer', 'Optimizador de alineación', 'Optimizator postave', 'Kadro optimizasyonu'), T('Η καλύτερη πεντάδα που χωράει στα credits σου.', 'The best lineup that fits your credits.', 'La mejor alineación que cabe en tus créditos.', 'Najbolja postava koja staje u tvoje kredite.', 'Kredine sığan en iyi kadro.')),
    i(u('fx:captain-advisor'), 'Captain Advisor', T('Ποιον να βάλεις αρχηγό (διπλοί πόντοι).', 'Who to captain (double points).', 'A quién hacer capitán (puntos dobles).', 'Koga za kapitena (dupli poeni).', 'Kimi kaptan yapmalı (çift puan).')),
    i(u('fx:manager'), 'Fantasy Manager', T('Η ομάδα σου, ειδοποιήσεις και πλάνο ανά turn.', 'Your team, alerts and a plan for each turn.', 'Tu equipo, alertas y plan por turno.', 'Tvoj tim, upozorenja i plan po turnu.', 'Takımın, uyarılar ve tur planı.')),
    i(u('fx:projections'), T('Εκτιμήσεις PIR', 'PIR projections', 'Proyecciones de PIR', 'PIR projekcije', 'PIR tahminleri'), T('Πόσο PIR αναμένεται να γράψει κάθε παίκτης.', 'How much PIR each player is expected to score.', 'Cuánto PIR se espera de cada jugador.', 'Koliko PIR-a se očekuje od svakog igrača.', 'Her oyuncudan beklenen PIR.')),
    i(u('fx:transfer-market'), 'Transfer Market', T('Ποιον να φέρεις και ποιον να πουλήσεις.', 'Who to buy and who to sell.', 'A quién comprar y a quién vender.', 'Koga kupiti, a koga prodati.', 'Kimi alıp kimi satmalı.')),
    i(u('fx:value-board'), 'Value Board', T('Πόντοι ανά credit για κάθε θέση.', 'Points per credit by position.', 'Puntos por crédito por posición.', 'Poeni po kreditu po poziciji.', 'Pozisyona göre kredi başına puan.')),
    i(u('fx:round-planner'), T('Πλάνο αγωνιστικής', 'Round planner', 'Planificador de jornada', 'Plan kola', 'Hafta planı'), T('Αρχηγός και αλλαγές για κάθε turn της εβδομάδας.', 'Captain and swaps for every turn of the week.', 'Capitán y cambios para cada turno.', 'Kapiten i izmene za svaki turn.', 'Haftanın her turu için kaptan ve değişiklikler.')),
    i(u('fx:what-if'), 'What-If', T('Δοκίμασε μια αλλαγή πριν την κάνεις.', 'Test a change before you make it.', 'Prueba un cambio antes de hacerlo.', 'Isprobaj izmenu pre nego što je napraviš.', 'Bir değişikliği yapmadan önce dene.')),
    i(u('fx:trade-simulator'), 'Trade Simulator', T('Αξίζει η ανταλλαγή που σκέφτεσαι;', 'Is the trade you have in mind worth it?', '¿Vale la pena el cambio que piensas?', 'Da li se isplati izmena koju planiraš?', 'Düşündüğün takas değer mi?')),
    i(u('fx:live'), 'Live Tracker', T('Οι πόντοι της σύνθεσής σου όσο παίζονται οι αγώνες.', 'Your lineup’s points while games are on.', 'Los puntos de tu alineación en directo.', 'Poeni tvoje postave uživo.', 'Maçlar sürerken kadronun puanları.')),
    i(u('fxcmp'), T('Σύγκριση παικτών Fantasy', 'Compare Fantasy players', 'Comparar jugadores Fantasy', 'Poređenje Fantasy igrača', 'Fantasy oyuncu karşılaştırma'), T('Δύο παίκτες δίπλα δίπλα: τιμή, PIR, πρόγραμμα.', 'Two players side by side: price, PIR, schedule.', 'Dos jugadores lado a lado: precio, PIR, calendario.', 'Dva igrača jedan pored drugog: cena, PIR, raspored.', 'İki oyuncu yan yana: fiyat, PIR, fikstür.')),
    i(u('fxcal'), T('Ημερολόγιο Fantasy', 'Fantasy calendar', 'Calendario Fantasy', 'Fantasy kalendar', 'Fantasy takvimi'), T('Διπλές εβδομάδες και δυσκολία προγράμματος.', 'Double weeks and schedule difficulty.', 'Semanas dobles y dificultad del calendario.', 'Duple nedelje i težina rasporeda.', 'Çift maç haftaları ve fikstür zorluğu.')),
    i(u('fx:news'), T('Ειδήσεις Fantasy', 'Fantasy news', 'Noticias Fantasy', 'Fantasy vesti', 'Fantasy haberleri'), T('Τραυματισμοί, λεπτά συμμετοχής, βασικοί.', 'Injuries, minutes, starters.', 'Lesiones, minutos, titulares.', 'Povrede, minuti, starteri.', 'Sakatlıklar, süreler, ilk beşler.')),
    i(u('fx:model-performance'), 'Model Performance', T('Πόσο σωστές βγήκαν οι εκτιμήσεις μας.', 'How accurate our projections have been.', 'Qué tan precisas fueron nuestras proyecciones.', 'Koliko su tačne bile naše projekcije.', 'Tahminlerimiz ne kadar isabetli oldu.')),
    i(u('fxleague'), T('Λίγκα Sportarena.gr', 'Sportarena.gr league', 'Liga Sportarena.gr', 'Liga Sportarena.gr', 'Sportarena.gr ligi'), T('Η δημόσια λίγκα μας: κατάταξη και πώς μπαίνεις.', 'Our public league: standings and how to join.', 'Nuestra liga pública: clasificación y cómo unirte.', 'Naša javna liga: tabela i kako da se pridružiš.', 'Herkese açık ligimiz: sıralama ve katılım.')),
    i(u('fxrules'), T('Οδηγός: πώς παίζεται', 'Guide: how to play', 'Guía: cómo se juega', 'Vodič: kako se igra', 'Rehber: nasıl oynanır'), T('Κανόνες, PIR και πώς διαλέγεις παίκτες.', 'Rules, PIR and how to pick players.', 'Reglas, PIR y cómo elegir jugadores.', 'Pravila, PIR i kako birati igrače.', 'Kurallar, PIR ve oyuncu seçimi.')),
  ] });
  G.push({ h: T('Αγώνες και προγνωστικά', 'Games and predictions', 'Partidos y pronósticos', 'Utakmice i prognoze', 'Maçlar ve tahminler'), items: [
    i(u('today'), T('Οι αγώνες σήμερα', 'Today’s games', 'Partidos de hoy', 'Današnje utakmice', 'Bugünün maçları'), T('Ώρες, κανάλια και live σκορ.', 'Times, TV and live scores.', 'Horarios, TV y marcadores en directo.', 'Satnice, TV i rezultati uživo.', 'Saatler, yayın ve canlı skorlar.')),
    i(u('sched'), T('Πρόγραμμα και αποτελέσματα', 'Schedule and results', 'Calendario y resultados', 'Raspored i rezultati', 'Fikstür ve sonuçlar'), T('Όλες οι αγωνιστικές της σεζόν.', 'Every round of the season.', 'Todas las jornadas de la temporada.', 'Sva kola sezone.', 'Sezonun tüm haftaları.')),
    i(u('preds'), T('Προγνωστικά αγώνων', 'Game predictions', 'Pronósticos de partidos', 'Prognoze utakmica', 'Maç tahminleri'), T('Εκτίμηση σκορ και πιθανότητα νίκης από στατιστικό μοντέλο.', 'Projected score and win probability from a statistical model.', 'Marcador estimado y probabilidad de victoria de un modelo estadístico.', 'Procenjeni rezultat i šansa za pobedu iz statističkog modela.', 'İstatistik modelden tahmini skor ve kazanma olasılığı.')),
    i(u('tipsters'), 'Tipsters', T('Τα picks των tipsters μας με ανοιχτό ιστορικό επιτυχίας.', 'Our tipsters’ picks with an open track record.', 'Los picks de nuestros tipsters con historial público.', 'Tipovi naših tipstera sa javnom istorijom.', 'Tipsterlarımızın seçimleri ve açık başarı geçmişi.')),
    ...(has.daytip ? [i(u('daytip'), T('Στοίχημα της ημέρας', 'Bet of the day', 'Apuesta del día', 'Tip dana', 'Günün bahsi'), T('Μία επιλογή κάθε μέρα που υπάρχουν αγώνες.', 'One pick on every game day.', 'Una selección cada día de partido.', 'Jedan tip svakog dana sa utakmicama.', 'Her maç günü bir seçim.'))] : []),
    i(u('paroli'), T('Παρολί του μοντέλου', 'The model’s parlay', 'La combinada del modelo', 'Tiket modela', 'Modelin kombinesi'), T('Τα πιο πιθανά φαβορί της αγωνιστικής σε ένα δελτίο.', 'The round’s most likely favourites in one slip.', 'Los favoritos más probables de la jornada.', 'Najverovatniji favoriti kola na jednom tiketu.', 'Haftanın en olası favorileri tek kuponda.')),
    i(u('odds'), T('Betting Insights (21+)', 'Betting Insights (18+)', 'Betting Insights (18+)', 'Betting Insights (18+)', 'Betting Insights (18+)'), T('Αποδόσεις, value και γραμμές PIR, με την πιθανότητα του μοντέλου δίπλα.', 'Odds, value and PIR lines next to the model’s probability.', 'Cuotas, value y líneas de PIR junto a la probabilidad del modelo.', 'Kvote, value i PIR linije pored verovatnoće modela.', 'Oranlar, value ve PIR çizgileri, model olasılığıyla birlikte.')),
    ...(has.mc ? [i(u('mc'), 'Matchup Center', T('Πώς ταιριάζουν οι δύο ομάδες ενός αγώνα, θέση προς θέση.', 'How two teams match up, position by position.', 'Cómo se emparejan dos equipos, posición por posición.', 'Kako se dva tima uparuju, pozicija po pozicija.', 'İki takım pozisyon pozisyon nasıl eşleşiyor.'))] : []),
    i(u('model'), T('Πόσο πέφτει μέσα το μοντέλο', 'Model accuracy', 'Acierto del modelo', 'Tačnost modela', 'Model isabeti'), T('Το ιστορικό των προβλέψεών μας, αγώνα προς αγώνα.', 'Our prediction record, game by game.', 'Nuestro historial de pronósticos, partido a partido.', 'Istorija naših prognoza, utakmica po utakmica.', 'Maç maç tahmin geçmişimiz.')),
  ] });
  G.push({ h: T('Στατιστικά', 'Stats', 'Estadísticas', 'Statistika', 'İstatistikler'), items: [
    i(u('home'), T('Βαθμολογία', 'Standings', 'Clasificación', 'Tabela', 'Puan durumu'), T('Η κατάταξη και οι πιθανότητες για playoffs.', 'The table and playoff chances.', 'La clasificación y las opciones de playoffs.', 'Tabela i šanse za plej-of.', 'Puan durumu ve playoff şansları.')),
    i(u('form'), T('Θερμόμετρο φόρμας', 'Form thermometer', 'Termómetro de forma', 'Termometar forme', 'Form termometresi'), T('Ποιος ανεβαίνει και ποιος πέφτει στους τελευταίους αγώνες.', 'Who is trending up or down lately.', 'Quién sube y quién baja últimamente.', 'Ko je u usponu, a ko u padu.', 'Son dönemde kim yükselişte, kim düşüşte.')),
    i(u('inj'), 'Injury Report', T('Ποιος είναι τραυματίας και ποιος αμφίβολος.', 'Who is injured and who is doubtful.', 'Quién está lesionado y quién es duda.', 'Ko je povređen, a ko je upitan.', 'Kim sakat, kim şüpheli.')),
    i(u('shots'), 'Shot Charts', T('Από πού σουτάρει και πόσο ευστοχεί κάθε παίκτης και ομάδα.', 'Where every player and team shoots from, and how well.', 'Desde dónde tira cada jugador y equipo, y con qué acierto.', 'Odakle šutira svaki igrač i tim, i koliko precizno.', 'Her oyuncu ve takımın nereden, ne isabetle şut attığı.')),
    i(u('compare'), T('Σύγκριση παικτών και ομάδων', 'Compare players and teams', 'Comparar jugadores y equipos', 'Poređenje igrača i timova', 'Oyuncu ve takım karşılaştırma'), T('Δύο παίκτες ή δύο ομάδες δίπλα δίπλα.', 'Two players or two teams side by side.', 'Dos jugadores o equipos lado a lado.', 'Dva igrača ili dva tima jedan pored drugog.', 'İki oyuncu veya iki takım yan yana.')),
    i(u('lead'), T('Κορυφαίοι και ρεκόρ', 'Leaders and records', 'Líderes y récords', 'Lideri i rekordi', 'Liderler ve rekorlar'), T('Οι πρώτοι σε κάθε κατηγορία στατιστικών.', 'The leaders in every stat category.', 'Los líderes de cada categoría.', 'Lideri u svakoj kategoriji.', 'Her istatistik kategorisinin liderleri.')),
    ...(has.ana ? [i(u('ana'), 'Team Analytics', T('Ρυθμός, επιθετική και αμυντική απόδοση κάθε ομάδας.', 'Pace, offensive and defensive efficiency of every team.', 'Ritmo y eficiencia ofensiva y defensiva de cada equipo.', 'Tempo, napadačka i odbrambena efikasnost svakog tima.', 'Her takımın tempo ile hücum ve savunma verimliliği.')), i(u('onoff'), 'On/Off', T('Πώς παίζει η ομάδα με και χωρίς κάθε παίκτη.', 'How a team plays with and without each player.', 'Cómo juega el equipo con y sin cada jugador.', 'Kako tim igra sa i bez svakog igrača.', 'Takımın her oyuncuyla ve onsuz performansı.'))] : []),
    ...(has.transfers ? [i(u('transfers'), T('Μεταγραφές', 'Transfers', 'Fichajes', 'Transferi', 'Transferler'), T('Ποιος ήρθε και ποιος έφυγε από κάθε ομάδα.', 'Who joined and who left each team.', 'Quién llegó y quién se fue de cada equipo.', 'Ko je došao, a ko otišao iz svakog tima.', 'Her takıma kim geldi, kim gitti.'))] : []),
    ...(has.ref ? [i(u('ref'), T('Διαιτητές', 'Referees', 'Árbitros', 'Sudije', 'Hakemler'), T('Φάουλ και βολές ανά διαιτητή.', 'Fouls and free throws by referee.', 'Faltas y tiros libres por árbitro.', 'Faulovi i slobodna bacanja po sudiji.', 'Hakeme göre faul ve serbest atış.'))] : []),
    ...(has.hist ? [i(u('hist'), T('Ιστορικό', 'History', 'Historia', 'Istorija', 'Tarihçe'), T('Οι προηγούμενες σεζόν της EuroLeague.', 'Past EuroLeague seasons.', 'Temporadas anteriores de la EuroLeague.', 'Prethodne sezone Evrolige.', 'Geçmiş EuroLeague sezonları.'))] : []),
    i(u('awards'), T('Βραβεία', 'Awards', 'Premios', 'Nagrade', 'Ödüller'), T('MVP αγωνιστικής και μήνα.', 'Round and monthly MVPs.', 'MVP de la jornada y del mes.', 'MVP kola i meseca.', 'Haftanın ve ayın MVP’leri.')),
    i(u('mvp'), T('MVP ανά χρονιά', 'MVP by year', 'MVP por año', 'MVP po godinama', 'Yıllara göre MVP'), T('Όλοι οι MVP της σεζόν και του Final Four.', 'Every season and Final Four MVP.', 'Todos los MVP de temporada y de la Final Four.', 'Svi MVP-jevi sezone i Fajnal-fora.', 'Tüm sezon ve Final Four MVP’leri.')),
    i(u('nat'), T('Εθνικότητες', 'Nationalities', 'Nacionalidades', 'Nacionalnosti', 'Uyruklar'), T('Οι παίκτες της EuroLeague ανά χώρα.', 'EuroLeague players by country.', 'Jugadores de la EuroLeague por país.', 'Igrači Evrolige po zemljama.', 'Ülkelere göre EuroLeague oyuncuları.')),
    i(u('ec'), 'EuroCup', T('Βαθμολογία, ομάδες και αγώνες του EuroCup.', 'EuroCup standings, teams and games.', 'Clasificación, equipos y partidos de la EuroCup.', 'Tabela, timovi i utakmice EuroCup-a.', 'EuroCup puan durumu, takımlar ve maçlar.')),
  ] });
  G.push({ h: T('Παιχνίδια και άλλα', 'Games and more', 'Juegos y más', 'Igre i ostalo', 'Oyunlar ve diğerleri'), items: [
    i(u('guess'), T('Μάντεψε τον παίκτη', 'Guess the player', 'Adivina el jugador', 'Pogodi igrača', 'Oyuncuyu tahmin et'), T('Ένας παίκτης της EuroLeague κάθε μέρα.', 'A EuroLeague player every day.', 'Un jugador de la EuroLeague cada día.', 'Jedan igrač Evrolige svaki dan.', 'Her gün bir EuroLeague oyuncusu.')),
    i(u('quiz'), T('Κουίζ EuroLeague', 'EuroLeague quiz', 'Quiz de la EuroLeague', 'Kviz Evrolige', 'EuroLeague bilgi yarışması'), T('Πόσα ξέρεις για τη φετινή σεζόν;', 'How much do you know about this season?', '¿Cuánto sabes de esta temporada?', 'Koliko znaš o ovoj sezoni?', 'Bu sezonu ne kadar biliyorsun?')),
    i(u('app'), T('Εφαρμογή', 'App', 'App', 'Aplikacija', 'Uygulama'), T('Βάλε το site στην αρχική οθόνη του κινητού σου.', 'Add the site to your phone’s home screen.', 'Añade la web a la pantalla de inicio.', 'Dodaj sajt na početni ekran telefona.', 'Siteyi telefonunun ana ekranına ekle.')),
    i(u('widgets'), T('Widget για το site σου', 'Widgets for your site', 'Widgets para tu web', 'Vidžeti za tvoj sajt', 'Siten için widget’lar'), T('Βαθμολογία και αγώνες της EuroLeague στη δική σου σελίδα.', 'EuroLeague standings and games on your own page.', 'Clasificación y partidos en tu propia web.', 'Tabela i utakmice na tvojoj stranici.', 'Kendi sayfanda puan durumu ve maçlar.')),
  ] });
  return G;
}

/** καρτέλες οικογένειας για τη σελίδα με URL cur (ή '' αν η σελίδα δεν ανήκει σε οικογένεια) */
export function familyTabs(fams, cur, esc) {
  const f = fams.find(x => x.tabs.some(([url]) => url === cur));
  if (!f) return '';
  return `<nav class="famtabs" aria-label="${esc(f.tabs[0][1])}">${f.tabs.map(([url, l]) => `<a href="${url}"${url === cur ? ' aria-current="page"' : ''}>${esc(l)}</a>`).join('')}</nav>`;
}
