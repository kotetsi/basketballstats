// Post-build generator for the Basketball Intelligence Portal homepage.
// Preserves the former standings homepage under a localized /standings-style URL.
import fs from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://basketballstats.eu';
const L = {
  el:{dir:'',stand:'vathmologia',r:['simera','programma','apodoseis','apodoseis/prop-analyzer','apodoseis/clv','prognostika','ergaleia','fantasy','koryfaioi','analytika','sygkrisi','montelo','tipsters','stoixima','arthra'],lang:'Ενότητες',copy:['Κατανόησε το παιχνίδι μέσα από τα δεδομένα. Αγώνες, στατιστική ανάλυση, προβλέψεις και εικόνα της αγοράς σε ένα σημείο.','Πρόγραμμα, αποτελέσματα και εικόνα των επόμενων αγώνων.','Αποδόσεις, μεταβολές αγοράς, value και ανάλυση player props.','Σύγκριση παικτών, προφίλ, matchups και εργαλεία ανάλυσης.','Προβλέψεις αγώνων, εκτιμήσεις παικτών και έλεγχος ακρίβειας μοντέλου.','Βαθμολογία, στατιστικά ομάδων και παικτών, ιστορικά δεδομένα.','Τα εργαλεία EuroLeague Fantasy παραμένουν διαθέσιμα σε ξεχωριστή ενότητα.','Εξερεύνησε την ενότητα','Γρήγορη πρόσβαση','Οι αγώνες σήμερα','Όλο το πρόγραμμα','Ανάλυση αποδόσεων','Ανάλυση ειδικών αγορών παικτών','Αξία σε σχέση με την τελική απόδοση','Σύγκριση παικτών','Όλα τα εργαλεία','Προγνωστικά αγώνων','Ακρίβεια μοντέλου','Βαθμολογία EuroLeague','Κορυφαίοι παίκτες','Στατιστικά ομάδων','Άνοιξε το Fantasy','Οι αναλύσεις και οι προβλέψεις είναι στατιστικές εκτιμήσεις, όχι εγγύηση αποτελέσματος ή συμβουλή στοιχηματισμού. 21+ · Παίξε υπεύθυνα.','Ανάλυση παικτών']},
  en:{dir:'en/',stand:'standings',r:['today','schedule','odds','odds/prop-analyzer','odds/clv','predictions','tools','fantasy','leaders','team-analytics','compare','model','tipsters','betting','articles'],lang:'Sections',copy:['Understand the game through data. Games, statistical analysis, projections and market context in one place.','Schedule, results and a clear view of upcoming games.','Odds, market movement, value and player prop analysis.','Player comparisons, profiles, matchups and analysis tools.','Game forecasts, player projections and model accuracy tracking.','Standings, team and player statistics, and historical data.','EuroLeague Fantasy tools remain available in their own dedicated section.','Explore section','Quick access','Today’s games','Full schedule','Betting Analysis','Player Props Analyzer','Closing Line Value','Player Comparison','All Tools','Game Predictions','Model Accuracy','EuroLeague Standings','Player Leaders','Team Statistics','Open Fantasy','Our analysis and projections are statistical estimates, not guaranteed outcomes or betting advice. 18+ · Gamble responsibly.','Player analytics']},
  es:{dir:'es/',stand:'clasificacion',r:['hoy','calendario','cuotas','cuotas/prop-analyzer','cuotas/clv','pronosticos','herramientas','fantasy','lideres','analitica','comparar','modelo','tipsters','apuestas','articulos'],lang:'Secciones',copy:['Entiende el juego a través de los datos. Partidos, análisis, proyecciones y contexto del mercado en un solo lugar.','Calendario, resultados y próximos partidos.','Cuotas, movimientos del mercado, value y análisis de props.','Comparación de jugadores, perfiles, enfrentamientos y herramientas.','Pronósticos, proyecciones de jugadores y precisión del modelo.','Clasificación, estadísticas de equipos y jugadores e histórico.','Las herramientas EuroLeague Fantasy siguen disponibles en su propia sección.','Explorar sección','Acceso rápido','Partidos de hoy','Calendario completo','Análisis de cuotas','Analizador de apuestas de jugadores','Valor frente a la cuota de cierre','Comparar jugadores','Todas las herramientas','Pronósticos','Precisión del modelo','Clasificación EuroLeague','Líderes estadísticos','Estadísticas de equipos','Abrir Fantasy','Nuestros análisis son estimaciones estadísticas, no resultados garantizados ni consejos de apuestas. 18+ · Juega con responsabilidad.','Analítica de jugadores']},
  sr:{dir:'sr/',stand:'tabela',r:['danas','raspored','kvote','kvote/prop-analyzer','kvote/clv','prognoze','alati','fantasy','lideri','analitika','poredjenje','model','tipsters','kladjenje','clanci'],lang:'Sekcije',copy:['Razumi igru kroz podatke. Utakmice, statistička analiza, projekcije i kretanje tržišta na jednom mestu.','Raspored, rezultati i pregled narednih utakmica.','Kvote, kretanje tržišta, value i analiza player props ponude.','Poređenje igrača, profili, matchup analiza i alati.','Prognoze utakmica, projekcije igrača i tačnost modela.','Tabela, statistika timova i igrača i istorijski podaci.','EuroLeague Fantasy alati ostaju dostupni u posebnoj sekciji.','Istraži sekciju','Brzi pristup','Današnje utakmice','Kompletan raspored','Analiza kvota','Analiza igračkih granica','Vrednost u odnosu na završnu kvotu','Poređenje igrača','Svi alati','Prognoze utakmica','Tačnost modela','Tabela EuroLeague','Statistički lideri','Statistika timova','Otvori Fantasy','Analize i projekcije su statističke procene, ne garantovani ishodi ili savet za klađenje. 18+ · Igraj odgovorno.','Analitika igrača']},
  tr:{dir:'tr/',stand:'puan-durumu',r:['bugun','fikstur','oranlar','oranlar/prop-analyzer','oranlar/clv','tahminler','araclar','fantasy','liderler','takim-analizi','karsilastir','model','tipsters','bahis','makaleler'],lang:'Bölümler',copy:['Oyunu verilerle anla. Maçlar, istatistiksel analiz, tahminler ve piyasa görünümü tek yerde.','Fikstür, sonuçlar ve yaklaşan maçların görünümü.','Oranlar, piyasa hareketleri, value ve oyuncu prop analizi.','Oyuncu karşılaştırmaları, profiller, eşleşmeler ve analiz araçları.','Maç tahminleri, oyuncu projeksiyonları ve model doğruluğu.','Puan durumu, takım ve oyuncu istatistikleri, tarihsel veriler.','EuroLeague Fantasy araçları kendi bölümünde kullanılmaya devam ediyor.','Bölümü keşfet','Hızlı erişim','Bugünün maçları','Tüm fikstür','Oran Analizi','Oyuncu Bahis Analizi','Kapanış Oranına Göre Değer','Oyuncu Karşılaştırma','Tüm Araçlar','Maç Tahminleri','Model Doğruluğu','EuroLeague Puan Durumu','İstatistik Liderleri','Takım İstatistikleri','Fantasy’yi aç','Analiz ve tahminler istatistiksel değerlendirmelerdir; garanti veya bahis tavsiyesi değildir. 18+ · Sorumlu oyna.','Oyuncu analizi']}
};
const CARD_DESCRIPTIONS = {"el":["Παρακολούθησε τις αποδόσεις και τις μεταβολές της αγοράς πριν από τους αγώνες.","Αξιολόγησε γραμμές πόντων, ριμπάουντ και ασίστ με βάση τις επιδόσεις των παικτών.","Σύγκρινε την απόδοση που βρίσκεις με την τελική τιμή πριν από το τζάμπολ.","Σύγκρινε δύο παίκτες σε βασικούς στατιστικούς δείκτες και αγωνιστικά χαρακτηριστικά.","Εξερεύνησε τα διαθέσιμα εργαλεία ανάλυσης και τις λειτουργίες αναζήτησης παικτών.","Εξέτασε την εικόνα των ομάδων μέσα από ομαδικούς δείκτες και αναλυτικά στατιστικά.","Δες εκτιμήσεις για επερχόμενους αγώνες βάσει διαθέσιμων στατιστικών δεδομένων.","Έλεγξε πόσο κοντά βρίσκονται οι προβλέψεις του μοντέλου στα πραγματικά αποτελέσματα.","Ανακάλυψε προγνωστικά και αξιολόγησε την πορεία των tipsters.","Δες τη βαθμολογία, τις νίκες, τις ήττες και τη θέση κάθε ομάδας.","Αναζήτησε παίκτες και εξέτασε την απόδοσή τους σε βασικές στατιστικές κατηγορίες.","Σύγκρινε την επιθετική και αμυντική παραγωγή των ομάδων.","Δες ποιοι παίκτες ξεχωρίζουν σε πόντους, ριμπάουντ, ασίστ και PIR."],"en":["Track bookmaker prices and market movements ahead of upcoming games.","Assess points, rebounds and assists lines against players’ statistical performances.","Compare the price you take with the market’s closing price before tip-off.","Compare two players across key statistical measures and playing attributes.","Explore the available analysis tools and player research features.","Explore team performance through detailed statistics and team-level metrics.","Review upcoming game projections based on available statistical data.","Measure how closely model predictions match actual game outcomes.","Discover picks and review tipsters’ performance over time.","Check the standings, wins, losses and position of every team.","Explore player performance across key statistical categories and individual metrics.","Compare teams’ offensive and defensive production.","Find the leading players in points, rebounds, assists and PIR."],"es":["Sigue las cuotas y los movimientos del mercado antes de los próximos partidos.","Evalúa las líneas de puntos, rebotes y asistencias según el rendimiento de cada jugador.","Compara la cuota obtenida con la cuota de cierre antes del inicio.","Compara dos jugadores mediante estadísticas clave y características de juego.","Explora las herramientas de análisis y las funciones de búsqueda de jugadores.","Analiza el rendimiento de los equipos mediante indicadores y estadísticas detalladas.","Consulta proyecciones de próximos partidos basadas en datos estadísticos.","Mide cuánto se acercan las predicciones del modelo a los resultados reales.","Descubre pronósticos y consulta el rendimiento de los tipsters.","Consulta la clasificación, victorias, derrotas y posición de cada equipo.","Explora el rendimiento de los jugadores en las principales categorías estadísticas.","Compara la producción ofensiva y defensiva de los equipos.","Encuentra a los líderes en puntos, rebotes, asistencias y PIR."],"sr":["Prati kvote i promene na tržištu pre predstojećih utakmica.","Proceni granice poena, skokova i asistencija na osnovu učinka igrača.","Uporedi odigranu kvotu sa završnom tržišnom kvotom pred početak.","Uporedi dva igrača kroz ključne statističke pokazatelje i karakteristike igre.","Istraži dostupne alate za analizu i funkcije za pronalaženje igrača.","Analiziraj učinak timova kroz detaljnu statistiku i timske pokazatelje.","Pogledaj projekcije predstojećih utakmica zasnovane na dostupnim podacima.","Proveri koliko su prognoze modela blizu stvarnim rezultatima utakmica.","Pronađi prognoze i prati uspešnost tipstera tokom vremena.","Pogledaj tabelu, pobede, poraze i plasman svakog tima.","Istraži učinak igrača kroz glavne statističke kategorije.","Uporedi napadački i odbrambeni učinak timova.","Pronađi lidere po poenima, skokovima, asistencijama i PIR-u."],"tr":["Yaklaşan maçlar öncesinde bahis oranlarını ve piyasa hareketlerini takip et.","Oyuncu istatistiklerine göre sayı, ribaund ve asist bahis çizgilerini değerlendir.","Aldığın oranı maç öncesindeki kapanış oranıyla karşılaştır.","İki oyuncuyu temel istatistikler ve oyun özellikleri üzerinden karşılaştır.","Mevcut analiz araçlarını ve oyuncu araştırma özelliklerini keşfet.","Takım performansını ayrıntılı istatistikler ve takım göstergeleriyle incele.","Mevcut istatistiksel verilere dayalı yaklaşan maç tahminlerini görüntüle.","Model tahminlerinin gerçek maç sonuçlarına ne kadar yaklaştığını ölç.","Tahminleri keşfet ve tipster performansını zaman içinde incele.","Her takımın puan durumunu, galibiyetlerini ve mağlubiyetlerini gör.","Oyuncuların temel istatistik kategorilerindeki performansını incele.","Takımların hücum ve savunma üretimini karşılaştır.","Sayı, ribaund, asist ve PIR liderlerini bul."]};
const PORTAL_LABELS = {
  el:{nav:['Κέντρο αγώνων','Στοιχηματική ανάλυση','Εργαστήριο παικτών','Προγνωστικά','Στατιστικά μπάσκετ','Fantasy'],groups:['Στοιχηματική ανάλυση','Εργαστήριο παικτών','Προβλέψεις','Δεδομένα μπάσκετ'],match:'Κέντρο αγώνων',fantasy:'Ζώνη Fantasy',tips:'Αναλυτές προγνωστικών',kicker:'EUROLEAGUE · ΣΤΑΤΙΣΤΙΚΗ ΑΝΑΛΥΣΗ',hero:'Πύλη Μπασκετικής Ανάλυσης'},
  en:{nav:['Match Center','Betting Intelligence','Player Lab','Predictions','Basketball Data','Fantasy'],groups:['Betting Intelligence','Player Lab','Predictions','Basketball Data'],match:'Match Center',fantasy:'Fantasy Zone',tips:'Tipsters',kicker:'EUROLEAGUE · BASKETBALL INTELLIGENCE',hero:'Basketball Intelligence Portal'},
  es:{nav:['Centro de partidos','Análisis de apuestas','Laboratorio de jugadores','Pronósticos','Datos de baloncesto','Fantasy'],groups:['Análisis de apuestas','Laboratorio de jugadores','Pronósticos','Datos de baloncesto'],match:'Centro de partidos',fantasy:'Zona Fantasy',tips:'Pronosticadores',kicker:'EUROLEAGUE · ANÁLISIS DE BALONCESTO',hero:'Portal de análisis de baloncesto'},
  sr:{nav:['Centar utakmica','Analiza klađenja','Laboratorija igrača','Prognoze','Košarkaški podaci','Fantasy'],groups:['Analiza klađenja','Laboratorija igrača','Prognoze','Košarkaški podaci'],match:'Centar utakmica',fantasy:'Fantasy zona',tips:'Tipsteri',kicker:'EUROLEAGUE · KOŠARKAŠKA ANALITIKA',hero:'Portal košarkaške analitike'},
  tr:{nav:['Maç Merkezi','Bahis Analizi','Oyuncu Laboratuvarı','Tahminler','Basketbol Verileri','Fantasy'],groups:['Bahis Analizi','Oyuncu Laboratuvarı','Tahminler','Basketbol Verileri'],match:'Maç Merkezi',fantasy:'Fantasy Alanı',tips:'Tahmin uzmanları',kicker:'EUROLEAGUE · BASKETBOL ANALİZİ',hero:'Basketbol Analiz Portalı'}
};
const esc = s => String(s).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const routeIndex = {today:0,schedule:1,odds:2,props:3,clv:4,pred:5,tools:6,fantasy:7,leaders:8,analytics:9,compare:10,model:11,tips:12,bet:13,arts:14};
const route = (lang,key) => key==='home' ? '/' + L[lang].dir : '/' + L[lang].dir + (key==='stand' ? L[lang].stand : L[lang].r[routeIndex[key]]) + '/';
const standingsUrl = lang => SITE + '/' + L[lang].dir + L[lang].stand + '/';
const fixStandingsAlternates = html => html.replace(
  /(<link rel="alternate" hreflang=")(el|en|es|sr|tr)("[^>]*href=")[^"]*(")/g,
  (_, before, lang, middle, after) => before + lang + middle + standingsUrl(lang) + after
).replace(
  /(<link rel="alternate" hreflang="x-default"[^>]*href=")[^"]*(")/,
  (_, before, after) => before + standingsUrl('el') + after
);
// Κεντρικό μενού: 5 επιλογές με εικονίδια (πάνω στον υπολογιστή, κάτω στο κινητό)
const NAV5 = {
  el:['Σήμερα','Fantasy','Στοίχημα','Στατιστικά','Άρθρα'], en:['Today','Fantasy','Betting','Stats','Articles'],
  es:['Hoy','Fantasy','Apuestas','Estadísticas','Artículos'], sr:['Danas','Fantasy','Klađenje','Statistika','Članci'], tr:['Bugün','Fantasy','Bahis','İstatistik','Makaleler']
};
const NAVICO = [
  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/>',
  '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'
];
const NAVICO_CAL = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>';
const NAVKEYS = ['home','fantasy','bet','stand','arts'];
const NAVV = ['today','fantasy','odds','stand','articles'];
// ποια ενότητα είναι η τρέχουσα, από τη διαδρομή της σελίδας (χωρίς το πρόθεμα γλώσσας)
const navSection = (lang, rel) => {
  const seg = rel.split('/').filter(Boolean)[0] || '';
  const r = L[lang].r;
  if (!seg) return 'home';
  if (seg === 'fantasy') return 'fantasy';
  if ([r[13], r[2], 'tipsters', r[5], r[0]].includes(seg) || /^(stoixima-tis-imeras|bet-of-the-day|apuesta-del-dia|tip-dana|gunun-bahsi|paroli|parlay|combinada|tiket|kombine)$/.test(seg)) return 'bet';
  if (seg === r[14]) return 'arts';
  return 'stand';
};
// Πρωταθλήματα (μόνο στα ελληνικά): διακόπτης στην κεφαλίδα και ίδιο μενού 5 επιλογών μέσα σε κάθε πρωτάθλημα
const ICO_LG = {
  today: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  sched: NAVICO_CAL,
  pred: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  players: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  teams: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'
};
const LG_NAV = {
  gbl: { name: 'Stoiximan GBL', items: [['Σήμερα', '', 'today'], ['Πρόγραμμα', 'programma/', 'sched'], ['Προγνωστικά', 'prognostika/', 'pred'], ['Παίκτες', 'koryfaioi/', 'players'], ['Ομάδες', 'statistika-omadon/', 'teams']], players: ['koryfaioi', 'provoles', 'thermometro'] },
  nba: { name: 'NBA', items: [['Σήμερα', '', 'today'], ['Πρόγραμμα', 'programma/', 'sched'], ['Προγνωστικά', 'prognostika/', 'pred'], ['Παίκτες', 'koryfaioi/', 'players'], ['Ομάδες', 'statistika-omadon/', 'teams']], players: ['koryfaioi', 'provoles'] }
};
// σε ποιο πρωτάθλημα ανήκει η σελίδα (rel χωρίς πρόθεμα γλώσσας)
const leagueOf = rel => { const s = rel.split('/').filter(Boolean)[0] || ''; return s === 'gbl' || s === 'nba' ? s : s === 'eurocup' ? 'ec' : 'el'; };
const lgSection = (lg, rel) => {
  const seg = rel.split('/').filter(Boolean);
  if (seg.length < 2) return 'today';
  const k = seg[1];
  if (k === 'programma') return 'sched';
  if (k === 'prognostika') return 'pred';
  if (LG_NAV[lg].players.includes(k) || seg.length >= 3) return 'players';
  return 'teams';   // στατιστικά ομάδων και σελίδες ομάδων
};
const lgNav = (lg, rel) => { const cur = lgSection(lg, rel); return '<nav class="nav nav5" aria-label="' + esc(LG_NAV[lg].name) + '">' + LG_NAV[lg].items.map(([n, u, k]) => '<a href="/' + lg + '/' + u + '" data-v="lg-' + k + '"' + (k === cur ? ' aria-current="page"' : '') + '><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO_LG[k] + '</svg><span>' + esc(n) + '</span></a>').join('') + '</nav>'; };
const SWITCH = [['el', 'EuroLeague', '/'], ['ec', 'EuroCup', '/eurocup/'], ['gbl', 'GBL', '/gbl/'], ['nba', 'NBA', '/nba/']];
const BRAND_SUB = { el: null, ec: 'Στατιστικά EuroCup', gbl: 'Στατιστικά Stoiximan GBL', nba: 'Στατιστικά NBA' };
let HAVE = null;   // ποια πρωταθλήματα υπάρχουν στο build
const switcher = cur => '<nav class="lgsw" aria-label="Πρωταθλήματα">' + SWITCH.filter(([k]) => HAVE.has(k)).map(([k, n, u]) => '<a href="' + u + '"' + (k === cur ? ' aria-current="true"' : '') + '>' + n + '</a>').join('') + '</nav>';
const nav = (lang, cur = '') => '<nav class="nav nav5" aria-label="'+L[lang].lang+'">'+NAV5[lang].map((n,i)=>'<a href="'+route(lang,NAVKEYS[i])+'" data-v="'+NAVV[i]+'"'+(NAVKEYS[i]===cur?' aria-current="page"':'')+'><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+NAVICO[i]+'</svg><span>'+esc(n)+'</span></a>').join('')+'</nav>';
const meta = (html,title,desc,canonical) => html
 .replace(/<title>[\s\S]*?<\/title>/i,'<title>'+esc(title)+'</title>')
 .replace(/<meta name="description" content="[^"]*">/i,'<meta name="description" content="'+esc(desc)+'">')
 .replace(/<link rel="canonical" href="[^"]*">/i,'<link rel="canonical" href="'+canonical+'">')
 .replace(/<meta property="og:title" content="[^"]*">/i,'<meta property="og:title" content="'+esc(title)+'">')
 .replace(/<meta property="og:description" content="[^"]*">/i,'<meta property="og:description" content="'+esc(desc)+'">')
 .replace(/<meta property="og:url" content="[^"]*">/i,'<meta property="og:url" content="'+canonical+'">');
const card=(icon,title,desc,href,cta)=>'<a class="portal-card" href="'+href+'"><span class="portal-icon" aria-hidden="true">'+icon+'</span><span class="portal-card-body"><b>'+title+'</b><small>'+desc+'</small><em>'+cta+' →</em></span></a>';

const root=path.resolve('dist');
for (const [lang,cfg] of Object.entries(L)) {
  const folder=path.join(root,cfg.dir), index=path.join(folder,'index.html');
  let old;
  try { old=await fs.readFile(index,'utf8'); } catch { console.warn('Missing '+index); continue; }
  const c=cfg.copy, standUrl=SITE+'/'+cfg.dir+cfg.stand+'/';
  let stand=fixStandingsAlternates(meta(old,lang==='el'?'Βαθμολογία EuroLeague | BasketballStats':'EuroLeague Standings | BasketballStats',lang==='el'?'Βαθμολογία, αποτελέσματα, πρόγραμμα και στατιστικά EuroLeague.':'EuroLeague standings, results, schedule and team and player statistics.',standUrl));
  stand=stand.replace(/<nav class="nav[^"]*"[\s\S]*?<\/nav>/,nav(lang,'stand'));
  const standFile=path.join(folder,cfg.stand,'index.html');
  await fs.mkdir(path.dirname(standFile),{recursive:true});
  await fs.writeFile(standFile,stand);

  const today=old.match(/<section class="todayhome">[\s\S]*?<\/section>/);
  const match=today ? today[0] : '<p><a href="'+route(lang,'today')+'">'+c[9]+' →</a></p>';
  const groups=[
    [PORTAL_LABELS[lang].groups[0],c[2], [card('📉',c[13],CARD_DESCRIPTIONS[lang][2],route(lang,'clv'),c[7]),card('📊',c[12],CARD_DESCRIPTIONS[lang][1],route(lang,'props'),c[7]),card('🎯',c[11],CARD_DESCRIPTIONS[lang][0],route(lang,'odds'),c[7])]],
    [PORTAL_LABELS[lang].groups[1],c[3],[card('🧬',c[14],CARD_DESCRIPTIONS[lang][3],route(lang,'compare'),c[7]),card('🧰',c[15],CARD_DESCRIPTIONS[lang][4],route(lang,'tools'),c[7]),card('📈',c[23],CARD_DESCRIPTIONS[lang][10],route(lang,'leaders'),c[7])]],
    [PORTAL_LABELS[lang].groups[2],c[4],[card('🧠',c[16],CARD_DESCRIPTIONS[lang][6],route(lang,'pred'),c[7]),card('🎯',c[17],CARD_DESCRIPTIONS[lang][7],route(lang,'model'),c[7]),card('✍️',PORTAL_LABELS[lang].tips,CARD_DESCRIPTIONS[lang][8],route(lang,'tips'),c[7])]],
    [PORTAL_LABELS[lang].groups[3],c[5],[card('🏆',c[18],CARD_DESCRIPTIONS[lang][9],route(lang,'stand'),c[7]),card('📊',c[19],CARD_DESCRIPTIONS[lang][12],route(lang,'leaders'),c[7]),card('📈',c[20],CARD_DESCRIPTIONS[lang][11],route(lang,'analytics'),c[7])]]
  ];
  let body='<main class="wrap portal-home">';
  body+='<section class="portal-hero"><div class="portal-kicker">'+PORTAL_LABELS[lang].kicker+'</div><h1>'+PORTAL_LABELS[lang].hero+'</h1><p>'+c[0]+'</p><div class="portal-hero-links"><a href="'+route(lang,'today')+'">'+c[9]+' →</a><a href="'+route(lang,'odds')+'">'+c[11]+' →</a></div><div class="portal-ball" aria-hidden="true">🏀</div></section>';
  body+='<section class="portal-match"><div class="portal-section-head"><div><span class="portal-kicker">'+c[8]+'</span><h2>'+PORTAL_LABELS[lang].match+'</h2><p>'+c[1]+'</p></div><a href="'+route(lang,'schedule')+'">'+c[10]+' →</a></div>'+match+'</section>';
  for(let i=0;i<groups.length;i++) body+='<section class="portal-section"><div class="portal-section-head"><div><span class="portal-kicker">0'+(i+1)+' / 05</span><h2>'+groups[i][0]+'</h2><p>'+groups[i][1]+'</p></div></div><div class="portal-grid">'+groups[i][2].join('')+'</div></section>';
  body+='<section class="portal-fantasy"><div><span class="portal-kicker">05 / 05</span><h2>🏆 '+PORTAL_LABELS[lang].fantasy+'</h2><p>'+c[6]+'</p></div><a href="'+route(lang,'fantasy')+'">'+c[21]+' →</a></section><p class="portal-disclosure">'+c[22]+'</p></main>';
  let frag=null; try { frag=await fs.readFile(path.resolve('.cache','home-'+lang+'.html'),'utf8'); } catch {}
  if (frag) body=frag;
  // η νέα αρχική δεν έχει τις ερωτήσεις της βαθμολογίας: φεύγουν και από τα δομημένα δεδομένα
  const dropFaq = h => !frag ? h : h.replace(/<section class="wrap catfaq">[\s\S]*?<\/section>/, '')
    .replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (m, a, j, b) => { try { const d = JSON.parse(j); const x = Array.isArray(d) ? d.filter(o => o['@type'] !== 'FAQPage') : d['@type'] === 'FAQPage' ? null : d; return x && (!Array.isArray(x) || x.length) ? a + JSON.stringify(x) + b : ''; } catch { return m; } });
  let home=old.replace(/<main class="wrap one">[\s\S]*?<\/main>/,body).replace('data-view="stand"','data-view="portal"');
  home=dropFaq(home).replace(/<nav class="nav[^"]*"[\s\S]*?<\/nav>/,nav(lang,'home'));
  // The source standings header is outside <main>; hide its band on portal homepages.
  home=home.replace('</head>', '<style>body[data-view="portal"] .band:has(.shero){display:none!important}body[data-view="portal"] .shero{display:none!important}</style></head>');
  const HT={el:['EuroLeague σήμερα: αγώνες, Fantasy, στοίχημα και στατιστικά','Οι σημερινοί αγώνες της EuroLeague με το φαβορί του καθενός, τα tips του High Fidelity, στοιχήματα παικτών, Fantasy και στατιστικά.'],en:['EuroLeague today: games, Fantasy, betting and stats','Today’s EuroLeague games with each favourite, High Fidelity tips, player bets, Fantasy and stats.'],es:['EuroLeague hoy: partidos, Fantasy, apuestas y estadísticas','Los partidos de hoy de la EuroLeague con el favorito de cada uno, tips de High Fidelity, apuestas de jugadores, Fantasy y estadísticas.'],sr:['Evroliga danas: utakmice, Fantasy, klađenje i statistika','Današnje utakmice Evrolige sa favoritom svake, tipovi High Fidelity, opklade na igrače, Fantasy i statistika.'],tr:['Bugün EuroLeague: maçlar, Fantasy, bahis ve istatistik','Bugünün EuroLeague maçları, her maçın favorisi, High Fidelity tipleri, oyuncu bahisleri, Fantasy ve istatistikler.']}[lang];
  home=meta(home,frag?HT[0]+' | BasketballStats':(lang==='el'?'Πύλη Στατιστικής Ανάλυσης Μπάσκετ':lang==='es'?'Portal de análisis de baloncesto':lang==='sr'?'Portal košarkaške analitike':lang==='tr'?'Basketbol Analiz Portalı':'Basketball Intelligence Portal')+' | BasketballStats',frag?HT[1]:c[0],SITE+'/'+cfg.dir);
  await fs.writeFile(index,home);

  const sitemap=path.join(root,'sitemap-'+lang+'.xml');
  try {
    let xml=await fs.readFile(sitemap,'utf8'), rootUrl=SITE+'/'+cfg.dir;
    xml=xml.replace('<loc>'+rootUrl+'</loc>','<loc>'+standUrl+'</loc>');
    if(!xml.includes('<loc>'+rootUrl+'</loc>')) xml=xml.replace('</urlset>','<url><loc>'+rootUrl+'</loc><lastmod>'+new Date().toISOString().slice(0,10)+'</lastmod></url>\n</urlset>');
    await fs.writeFile(sitemap,xml);
  } catch(e) { console.warn('Sitemap update skipped for '+lang+': '+e.message); }
}

async function updateNavigation(dir, lang) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await updateNavigation(file, lang); continue; }
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    let html = await fs.readFile(file, 'utf8');
    const rel = path.relative(path.join(root, L[lang].dir), file).replace(/\\/g, '/').replace(/index\.html$/, '');
    if (lang === 'el' && /^(en|es|sr|tr)\//.test(rel)) continue;   // οι άλλες γλώσσες έχουν δικό τους πέρασμα
    const lg = lang === 'el' ? leagueOf(rel) : 'el';
    html = html.replace(/<nav class="nav[^"]*"[\s\S]*?<\/nav>/, LG_NAV[lg] ? lgNav(lg, rel) : nav(lang, lg === 'ec' ? '' : navSection(lang, rel)));
    if (lang === 'el' && HAVE.size > 1) {
      html = html.replace(/<p class="leadnav leagues"[\s\S]*?<\/p>/g, '');   // παλιά γραμμή πρωταθλημάτων μέσα στη σελίδα
      html = html.replace(/(<a class="brand"[^>]*>[\s\S]*?<\/a>)/, (m) => (BRAND_SUB[lg] ? m.replace(/<span>[^<]*<\/span>/, '<span>' + BRAND_SUB[lg] + '</span>') : m) + switcher(lg));
    }
    html = html.replace(/(<nav class="foot">[\s\S]*?<a href=")[^"]*(")/, "$1" + route(lang, "stand") + "$2");
    await fs.writeFile(file, html);
  }
}
HAVE = new Set(['el']);
for (const [k, d] of [['ec', 'eurocup'], ['gbl', 'gbl'], ['nba', 'nba']]) { try { await fs.access(path.join(root, d, 'index.html')); HAVE.add(k); } catch { } }
for (const [lang, cfg] of Object.entries(L)) await updateNavigation(path.join(root, cfg.dir), lang);

console.log('Basketball Intelligence homepage and localized standings pages generated.');
