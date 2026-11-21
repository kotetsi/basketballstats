// Data layer των Fantasy Manager Tools: από πού έρχεται κάθε πεδίο, πώς υπολογίζεται και ποιος κανόνας fallback ισχύει.
// Μία πηγή αλήθειας: τη χρησιμοποιούν οι σελίδες («Δεδομένα και κανόνες») και τα αρχεία /api (meta.fields).
// status: real = πραγματικά δεδομένα EuroLeague · calc = υπολογισμός από πραγματικά δεδομένα · estimate = εκτίμηση/κανόνας · user = το δίνει ο χρήστης · empty = δεν υπάρχει πηγή, μένει κενό
export const FIELDS = [
  { k: 'player', status: 'real', el: ['Όνομα, ομάδα, θέση', 'EuroLeague API (people, rosters)', '—'], en: ['Name, team, position', 'EuroLeague API (people, rosters)', '—'] },
  { k: 'box', status: 'real', el: ['PIR, λεπτά, εκκινήσεις ανά αγώνα', 'Επίσημα box scores της EuroLeague', '—'], en: ['PIR, minutes, starts per game', 'Official EuroLeague box scores', '—'] },
  { k: 'fixtures', status: 'real', el: ['Πρόγραμμα, έδρα, μέρα αγώνα (turn)', 'EuroLeague API (games)', 'Αν λείπει ώρα, ο αγώνας μπαίνει στη μέρα της αγωνιστικής'], en: ['Fixtures, venue, game day (turn)', 'EuroLeague API (games)', 'Without a time, the game goes on the round date'] },
  { k: 'l3', status: 'calc', el: ['PIR 3/5/10 τελευταίων, PIR/λεπτό, λεπτά L3/L10', 'Μέσοι όροι από τα box scores (μόνο αγώνες με συμμετοχή)', 'Λιγότεροι από 3 αγώνες: σήμανση «μικρό δείγμα», χωρίς value grade'], en: ['PIR last 3/5/10, PIR/min, minutes L3/L10', 'Averages of box scores (games played only)', 'Fewer than 3 games: “small sample” flag, no value grade'] },
  { k: 'proj', status: 'calc', el: ['Εκτίμηση PIR επόμενου αγώνα και 3 αγωνιστικών', 'Μοντέλο λεπτά × PIR/λεπτό (LightGBM), εκπαίδευση μόνο σε προηγούμενους αγώνες, έλεγχος walk-forward', 'Τραυματίας: 0 στον επόμενο, 35% και 70% στους επόμενους· αμφίβολος: 40%, 85%, 100%'], en: ['Projected PIR next game and next 3 rounds', 'Minutes × PIR/min model (LightGBM), trained on past games only, walk-forward validated', 'Injured: 0 next, 35% and 70% after; doubtful: 40%, 85%, 100%'] },
  { k: 'price', status: 'estimate', el: ['Τιμή σε credits και τάση 3/5/10', 'Οι επίσημες τιμές του Fantasy Challenge δεν δημοσιεύονται ανοιχτά', 'Εκτίμηση 4 + 0,75 × (μ.ό. PIR 10 αγώνων και εκτίμησης), 4–24 credits· αν δοθούν επίσημες τιμές (prices.csv) χρησιμοποιούνται αυτές'], en: ['Price in credits and 3/5/10 trend', 'Official Fantasy Challenge prices are not published openly', 'Estimate 4 + 0.75 × (avg of 10-game PIR and projection), 4–24 credits; official prices (prices.csv) override'] },
  { k: 'vpc', status: 'calc', el: ['PIR per credit, value grade', 'Μέση εκτίμηση 3 αγωνιστικών ÷ τιμή· grade από το εκατοστημόριο (A+ = κορυφαίο 5%)', 'Επειδή η τιμή είναι εκτίμηση, και το PIR per credit είναι εκτίμηση'], en: ['PIR per credit, value grade', 'Average 3-round projection ÷ price; grade from percentile (A+ = top 5%)', 'As the price is an estimate, PIR per credit is too'] },
  { k: 'start', status: 'calc', el: ['Πιθανότητα βασικού', 'Ποσοστό εκκινήσεων στους 5 τελευταίους αγώνες', 'Δεν υπάρχει επίσημη ανακοίνωση πεντάδας πριν από τον αγώνα'], en: ['Starter probability', 'Share of starts in the last 5 games', 'There is no official starting-five announcement before games'] },
  { k: 'status', status: 'estimate', el: ['Κατάσταση (τραυματίας / αμφίβολος)', 'Λίστα τραυματιών του site (χειροκίνητη, με πηγή) + κανόνας', 'Κανόνας: έλειψε από τους 2+ τελευταίους αγώνες ενώ έπαιζε κανονικά → «αμφίβολος»· χωρίς πληροφορία → διαθέσιμος'], en: ['Status (injured / doubtful)', 'Site injury list (manual, sourced) + rule', 'Rule: missed the last 2+ games while a regular → “doubtful”; no information → available'] },
  { k: 'captain', status: 'calc', el: ['Πόντοι ως αρχηγός, captain risk, captain value', '2 × PIR × (1 + 0,10 × πιθανότητα νίκης) για P10/P50/P90· risk 0–100 από κατάσταση, εύρος εκτίμησης, σταθερότητα λεπτών, κακούς αγώνες, back-to-back, δείγμα· value = πόντοι ÷ (1 + risk/50)', '—'], en: ['Captain points, captain risk, captain value', '2 × PIR × (1 + 0.10 × win probability) for P10/P50/P90; risk 0–100 from status, spread, minutes stability, bad games, back-to-back, sample; value = points ÷ (1 + risk/50)', '—'] },
  { k: 'capHist', status: 'estimate', el: ['Ιστορικό ως αρχηγός', 'Δεν ξέρουμε ποιον είχες αρχηγό', '2 × μέσο PIR 10 τελευταίων και ποσοστό αγώνων με PIR ≥ 20'], en: ['Captain history', 'We do not know who you captained', '2 × average PIR of the last 10 and share of games with PIR ≥ 20'] },
  { k: 'whatif', status: 'calc', el: ['What-if: σύνολο, floor/ceiling, ρίσκο', 'Άθροισμα κανονικών κατανομών ανά παίκτη (σ από P10–P90)· αλλαγή λεπτών κλιμακώνει αναλογικά το PIR· αλλαγή κατάστασης: διαθέσιμος 100%, αμφίβολος 40%, εκτός 0% της εκτίμησης «αν παίξει»', 'Αν ένας παίκτης ήταν εκτός, το «αν παίξει» βγαίνει από την εκτίμηση του μοντέλου πριν από τον συντελεστή κατάστασης'], en: ['What-if: total, floor/ceiling, risk', 'Sum of per-player normal distributions (σ from P10–P90); minutes changes scale PIR proportionally; status: available 100%, doubtful 40%, out 0% of the “if he plays” projection', 'For a player who was out, “if he plays” is the model projection before the status factor'] },
  { k: 'difficulty', status: 'calc', el: ['Δυσκολία προγράμματος 1–5', 'PIR που δίνει ο αντίπαλος στη θέση + defensive rating, σε πεντημόρια', '—'], en: ['Fixture difficulty 1–5', 'PIR the opponent allows to the position + defensive rating, in quintiles', '—'] },
  { k: 'b2b', status: 'calc', el: ['Back-to-back', 'Δύο αγώνες της ομάδας σε ≤ 2 μέρες (από το πρόγραμμα)', '—'], en: ['Back-to-back', 'Two team games within ≤ 2 days (from the schedule)', '—'] },
  { k: 'signal', status: 'calc', el: ['Buy-low / sell-high, σύσταση trade', 'Κανόνες πάνω στα παραπάνω (περιγράφονται στη σελίδα)', '—'], en: ['Buy-low / sell-high, trade recommendation', 'Rules on the fields above (described on the page)', '—'] },
  { k: 'coach', status: 'calc', el: ['Πόντοι προπονητή', 'Κανονική κατανομή γύρω από την εκτιμώμενη διαφορά, με τους κανόνες του Fantasy', '—'], en: ['Coach points', 'Normal distribution around the projected margin, with the Fantasy rules', '—'] },
  { k: 'roster', status: 'user', el: ['Σύνθεση, ταμείο, υπόλοιπο transfers, τρέχον turn', 'Τα δίνει ο χρήστης (χειροκίνητα, CSV, copy-paste)· μένουν στον browser', 'Ταμείο κενό → 100 − κόστος σύνθεσης· turn κενό → η σημερινή μέρα'], en: ['Roster, bank, transfers left, current turn', 'Entered by the user (manual, CSV, paste); kept in the browser', 'Empty bank → 100 − roster cost; empty turn → today'] },
  { k: 'played', status: 'estimate', el: ['Ποιοι «έχουν ήδη παίξει» στον γύρο', 'Από το πρόγραμμα και το τρέχον turn', 'Δεν διαβάζουμε τον λογαριασμό σου, άρα δεν ξέρουμε τις αλλαγές που έκανες ήδη στο επίσημο παιχνίδι'], en: ['Who has “already played” in the round', 'From the schedule and the current turn', 'We do not read your account, so changes already made in the official game are unknown'] },
  { k: 'ownership', status: 'empty', el: ['Ownership / % επιλογής', 'Δεν υπάρχει ανοιχτή πηγή', 'Κενό· ο «differential αρχηγός» βγαίνει από το ταβάνι (P90) και όχι από το ownership'], en: ['Ownership / % selected', 'No open source', 'Empty; the “differential captain” uses the ceiling (P90), not ownership'] },
  { k: 'quotes', status: 'empty', el: ['Δηλώσεις προπονητών', 'Δεν υπάρχει ανοιχτή πηγή (χωρίς scraping)', 'Κενό'], en: ['Coach quotes', 'No open source (no scraping)', 'Empty'] },
  { k: 'notify', status: 'empty', el: ['Email / web push', 'Χρειάζονται server (εκτός του δωρεάν GitHub Pages)', 'Ειδοποιήσεις μόνο μέσα στη σελίδα'], en: ['Email / web push', 'Need a server (beyond free GitHub Pages)', 'In-page alerts only'] },
];

export const STATUS_L = {
  el: { real: 'Πραγματικά δεδομένα', calc: 'Υπολογισμός', estimate: 'Εκτίμηση / κανόνας', user: 'Από τον χρήστη', empty: 'Κενό (χωρίς πηγή)' },
  en: { real: 'Real data', calc: 'Calculated', estimate: 'Estimate / rule', user: 'User input', empty: 'Empty (no source)' },
  es: { real: 'Datos reales', calc: 'Calculado', estimate: 'Estimación / regla', user: 'Del usuario', empty: 'Vacío (sin fuente)' },
  sr: { real: 'Stvarni podaci', calc: 'Izračunato', estimate: 'Procena / pravilo', user: 'Unos korisnika', empty: 'Prazno (bez izvora)' },
  tr: { real: 'Gerçek veri', calc: 'Hesaplanan', estimate: 'Tahmin / kural', user: 'Kullanıcı girdisi', empty: 'Boş (kaynak yok)' },
};
const HEAD = {
  el: ['Δεδομένα και κανόνες fallback', 'Πεδίο', 'Τύπος', 'Πηγή / υπολογισμός', 'Fallback'],
  en: ['Data and fallback rules', 'Field', 'Type', 'Source / calculation', 'Fallback'],
  es: ['Datos y reglas de respaldo', 'Campo', 'Tipo', 'Fuente / cálculo', 'Respaldo'],
  sr: ['Podaci i pravila za rezervu', 'Polje', 'Tip', 'Izvor / izračunavanje', 'Rezerva'],
  tr: ['Veriler ve yedek kurallar', 'Alan', 'Tür', 'Kaynak / hesaplama', 'Yedek kural'],
};
// Μεταφράσεις του πίνακα για es / sr / tr (ίδια σειρά: πεδίο, πηγή / υπολογισμός, fallback).
const TR3 = {
  es: {
    player: ['Nombre, equipo, posición', 'API de la Euroliga (people, rosters)', '—'],
    box: ['PIR, minutos, titularidades por partido', 'Box scores oficiales de la Euroliga', '—'],
    fixtures: ['Calendario, pista, día de partido (turno)', 'API de la Euroliga (games)', 'Sin hora, el partido va en la fecha de la jornada'],
    l3: ['PIR últimos 3/5/10, PIR/min, minutos L3/L10', 'Medias de los box scores (solo partidos jugados)', 'Menos de 3 partidos: aviso de «muestra pequeña», sin nota de valor'],
    proj: ['PIR proyectado próximo partido y próximas 3 jornadas', 'Modelo minutos × PIR/min (LightGBM), entrenado solo con partidos pasados, validado walk-forward', 'Lesionado: 0 en el próximo, 35% y 70% después; duda: 40%, 85%, 100%'],
    price: ['Precio en créditos y tendencia 3/5/10', 'Los precios oficiales del Fantasy Challenge no se publican abiertamente', 'Estimación 4 + 0,75 × (media del PIR de 10 partidos y la proyección), 4–24 créditos; los precios oficiales (prices.csv) tienen prioridad'],
    vpc: ['PIR por crédito, nota de valor', 'Proyección media de 3 jornadas ÷ precio; nota según percentil (A+ = 5% superior)', 'Como el precio es una estimación, el PIR por crédito también'],
    start: ['Probabilidad de ser titular', 'Porcentaje de titularidades en los últimos 5 partidos', 'No hay anuncio oficial del quinteto antes de los partidos'],
    status: ['Estado (lesionado / duda)', 'Lista de lesionados del sitio (manual, con fuente) + regla', 'Regla: se perdió los últimos 2+ partidos siendo habitual → «duda»; sin información → disponible'],
    captain: ['Puntos como capitán, riesgo y valor del capitán', '2 × PIR × (1 + 0,10 × probabilidad de victoria) para P10/P50/P90; riesgo 0–100 según estado, dispersión, estabilidad de minutos, malos partidos, back-to-back, muestra; valor = puntos ÷ (1 + riesgo/50)', '—'],
    capHist: ['Historial como capitán', 'No sabemos a quién elegiste capitán', '2 × PIR medio de los últimos 10 y porcentaje de partidos con PIR ≥ 20'],
    whatif: ['What-if: total, suelo/techo, riesgo', 'Suma de distribuciones normales por jugador (σ a partir de P10–P90); los cambios de minutos ajustan el PIR proporcionalmente; estado: disponible 100%, duda 40%, fuera 0% de la proyección «si juega»', 'Para un jugador que estaba fuera, «si juega» es la proyección del modelo antes del factor de estado'],
    difficulty: ['Dificultad del calendario 1–5', 'PIR que el rival concede a la posición + rating defensivo, en quintiles', '—'],
    b2b: ['Back-to-back', 'Dos partidos del equipo en ≤ 2 días (según el calendario)', '—'],
    signal: ['Comprar barato / vender caro, recomendación de cambio', 'Reglas sobre los campos anteriores (descritas en la página)', '—'],
    coach: ['Puntos del entrenador', 'Distribución normal alrededor de la diferencia proyectada, con las reglas del Fantasy', '—'],
    roster: ['Plantilla, banco, cambios restantes, turno actual', 'Los introduce el usuario (a mano, CSV, pegar); se guardan en el navegador', 'Banco vacío → 100 − coste de la plantilla; turno vacío → hoy'],
    played: ['Quién «ya ha jugado» en la jornada', 'Según el calendario y el turno actual', 'No leemos tu cuenta, así que no conocemos los cambios ya hechos en el juego oficial'],
    ownership: ['Propiedad / % de selección', 'No hay fuente abierta', 'Vacío; el «capitán diferencial» usa el techo (P90), no la propiedad'],
    quotes: ['Declaraciones de entrenadores', 'No hay fuente abierta (sin scraping)', 'Vacío'],
    notify: ['Email / web push', 'Requieren un servidor (más allá de GitHub Pages gratuito)', 'Solo alertas dentro de la página'],
  },
  sr: {
    player: ['Ime, tim, pozicija', 'EuroLeague API (people, rosters)', '—'],
    box: ['PIR, minuti, starti po utakmici', 'Zvanični box score-ovi Evrolige', '—'],
    fixtures: ['Raspored, teren, dan utakmice (krug)', 'EuroLeague API (games)', 'Bez vremena, utakmica ide na datum kola'],
    l3: ['PIR poslednje 3/5/10, PIR/min, minuti L3/L10', 'Proseci iz box score-ova (samo odigrane utakmice)', 'Manje od 3 utakmice: oznaka „mali uzorak”, bez ocene vrednosti'],
    proj: ['Projektovani PIR za sledeću utakmicu i naredna 3 kola', 'Model minuti × PIR/min (LightGBM), treniran samo na prošlim utakmicama, walk-forward validacija', 'Povređen: 0 sledeće, 35% i 70% posle; upitan: 40%, 85%, 100%'],
    price: ['Cena u kreditima i trend 3/5/10', 'Zvanične cene Fantasy Challenge-a se ne objavljuju javno', 'Procena 4 + 0,75 × (prosek PIR-a u 10 utakmica i projekcije), 4–24 kredita; zvanične cene (prices.csv) imaju prednost'],
    vpc: ['PIR po kreditu, ocena vrednosti', 'Prosečna projekcija 3 kola ÷ cena; ocena iz percentila (A+ = gornjih 5%)', 'Pošto je cena procena, i PIR po kreditu je procena'],
    start: ['Verovatnoća starta', 'Udeo starta u poslednjih 5 utakmica', 'Ne postoji zvanična najava prve petorke pre utakmica'],
    status: ['Status (povređen / upitan)', 'Lista povređenih na sajtu (ručno, sa izvorom) + pravilo', 'Pravilo: propustio poslednje 2+ utakmice kao standardni igrač → „upitan”; bez informacija → dostupan'],
    captain: ['Poeni kao kapiten, rizik i vrednost kapitena', '2 × PIR × (1 + 0,10 × verovatnoća pobede) za P10/P50/P90; rizik 0–100 iz statusa, raspona, stabilnosti minuta, loših utakmica, back-to-back, uzorka; vrednost = poeni ÷ (1 + rizik/50)', '—'],
    capHist: ['Istorija kao kapiten', 'Ne znamo koga si birao za kapitena', '2 × prosečan PIR u poslednjih 10 i udeo utakmica sa PIR ≥ 20'],
    whatif: ['What-if: ukupno, pod/plafon, rizik', 'Zbir normalnih raspodela po igraču (σ iz P10–P90); promene minuta srazmerno menjaju PIR; status: dostupan 100%, upitan 40%, ne igra 0% projekcije „ako igra”', 'Za igrača koji je bio van tima, „ako igra” je projekcija modela pre faktora statusa'],
    difficulty: ['Težina rasporeda 1–5', 'PIR koji protivnik dozvoljava poziciji + defanzivni rejting, u kvintilima', '—'],
    b2b: ['Back-to-back', 'Dve utakmice tima u ≤ 2 dana (iz rasporeda)', '—'],
    signal: ['Kupi jeftino / prodaj skupo, preporuka izmene', 'Pravila na osnovu gornjih polja (opisana na stranici)', '—'],
    coach: ['Poeni trenera', 'Normalna raspodela oko projektovane razlike, uz pravila Fantasyja', '—'],
    roster: ['Sastav, banka, preostale izmene, trenutni krug', 'Unosi korisnik (ručno, CSV, nalepi); čuva se u pregledaču', 'Prazna banka → 100 − cena sastava; prazan krug → danas'],
    played: ['Ko je „već odigrao” u kolu', 'Iz rasporeda i trenutnog kruga', 'Ne čitamo tvoj nalog, pa izmene već napravljene u zvaničnoj igri nisu poznate'],
    ownership: ['Vlasništvo / % izbora', 'Nema otvorenog izvora', 'Prazno; „diferencijalni kapiten” koristi plafon (P90), ne vlasništvo'],
    quotes: ['Izjave trenera', 'Nema otvorenog izvora (bez scrapinga)', 'Prazno'],
    notify: ['Email / web push', 'Potreban je server (izvan besplatnog GitHub Pagesa)', 'Samo obaveštenja na stranici'],
  },
  tr: {
    player: ['Ad, takım, pozisyon', 'EuroLeague API (people, rosters)', '—'],
    box: ['Maç başına PIR, süre, ilk beşte başlama', 'Resmî EuroLeague box score\'ları', '—'],
    fixtures: ['Fikstür, saha, maç günü (tur)', 'EuroLeague API (games)', 'Saat yoksa maç hafta tarihine konur'],
    l3: ['Son 3/5/10 PIR, PIR/dk, süre L3/L10', 'Box score ortalamaları (yalnızca oynanan maçlar)', '3\'ten az maç: “küçük örneklem” işareti, değer notu yok'],
    proj: ['Sonraki maç ve sonraki 3 hafta PIR projeksiyonu', 'Süre × PIR/dk modeli (LightGBM), yalnızca geçmiş maçlarla eğitildi, walk-forward doğrulandı', 'Sakat: sonraki maç 0, sonra %35 ve %70; şüpheli: %40, %85, %100'],
    price: ['Kredi cinsinden fiyat ve 3/5/10 trendi', 'Resmî Fantasy Challenge fiyatları açıkça yayımlanmıyor', 'Tahmin 4 + 0,75 × (10 maçlık PIR ortalaması ve projeksiyonun ortalaması), 4–24 kredi; resmî fiyatlar (prices.csv) önceliklidir'],
    vpc: ['Kredi başına PIR, değer notu', '3 haftalık ortalama projeksiyon ÷ fiyat; not yüzdeliğe göre (A+ = en iyi %5)', 'Fiyat tahmin olduğu için kredi başına PIR de tahmindir'],
    start: ['İlk beş olasılığı', 'Son 5 maçta ilk beşte başlama oranı', 'Maçlardan önce resmî ilk beş açıklaması yok'],
    status: ['Durum (sakat / şüpheli)', 'Sitenin sakatlık listesi (elle, kaynaklı) + kural', 'Kural: düzenli oyuncuyken son 2+ maçı kaçırdı → “şüpheli”; bilgi yok → hazır'],
    captain: ['Kaptan puanı, kaptanlık riski, kaptanlık değeri', 'P10/P50/P90 için 2 × PIR × (1 + 0,10 × galibiyet olasılığı); risk 0–100 durum, dağılım, süre istikrarı, kötü maçlar, art arda maç ve örneklemden; değer = puan ÷ (1 + risk/50)', '—'],
    capHist: ['Kaptanlık geçmişi', 'Kimi kaptan yaptığını bilmiyoruz', '2 × son 10 maçın ortalama PIR\'ı ve PIR ≥ 20 olan maçların oranı'],
    whatif: ['What-if: toplam, taban/tavan, risk', 'Oyuncu başına normal dağılımların toplamı (σ P10–P90\'dan); süre değişiklikleri PIR\'ı orantılı değiştirir; durum: hazır %100, şüpheli %40, oynamıyor “oynarsa” projeksiyonunun %0\'ı', 'Oynamayan bir oyuncu için “oynarsa”, durum katsayısından önceki model projeksiyonudur'],
    difficulty: ['Fikstür zorluğu 1–5', 'Rakibin pozisyona verdiği PIR + savunma reytingi, beşte birlik dilimlerle', '—'],
    b2b: ['Art arda maç', 'Takımın ≤ 2 gün içinde iki maçı (fikstürden)', '—'],
    signal: ['Ucuza al / pahalıya sat, transfer önerisi', 'Yukarıdaki alanlar üzerine kurallar (sayfada açıklanıyor)', '—'],
    coach: ['Koç puanı', 'Fantasy kurallarıyla, projeksiyon farkı etrafında normal dağılım', '—'],
    roster: ['Kadro, banka, kalan transfer, mevcut tur', 'Kullanıcı girer (elle, CSV, yapıştır); tarayıcıda saklanır', 'Boş banka → 100 − kadro maliyeti; boş tur → bugün'],
    played: ['Haftada kimler “zaten oynadı”', 'Fikstürden ve mevcut turdan', 'Hesabını okumuyoruz, bu yüzden resmî oyunda yaptığın değişiklikleri bilmiyoruz'],
    ownership: ['Sahiplik / seçilme %', 'Açık kaynak yok', 'Boş; “farklı kaptan” sahiplik değil tavan (P90) kullanır'],
    quotes: ['Koç açıklamaları', 'Açık kaynak yok (scraping yok)', 'Boş'],
    notify: ['E-posta / web push', 'Sunucu gerekir (ücretsiz GitHub Pages dışında)', 'Yalnızca sayfa içi uyarılar'],
  },
};


export function fieldsTable(lg, esc) {
  const L = HEAD[lg] ? lg : 'en', S = STATUS_L[L], [SUM, ...H] = HEAD[L];
  const row = f => f[L] || TR3[L]?.[f.k] || f.en;
  return `<details class="fmdata"><summary>${SUM}</summary><div class="tbl"><table class="antbl"><thead><tr>${H.map((h, i) => `<th${i !== 1 ? ' class="l"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${FIELDS.map(f => `<tr><td class="l"><b>${esc(row(f)[0])}</b></td><td><span class="fds fds-${f.status}">${esc(S[f.status])}</span></td><td class="l">${esc(row(f)[1])}</td><td class="l">${esc(row(f)[2])}</td></tr>`).join('')}</tbody></table></div></details>`;
}
export const fieldsMeta = () => FIELDS.map(f => ({ field: f.k, status: f.status, source: f.en[1], fallback: f.en[2] }));
