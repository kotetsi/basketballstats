// Post-build generator for the Basketball Intelligence Portal homepage.
// Preserves the former standings homepage under a localized /standings-style URL.
import fs from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://basketballstats.eu';
const L = {
  el:{dir:'',stand:'vathmologia',r:['simera','programma','apodoseis','apodoseis/prop-analyzer','apodoseis/clv','prognostika','ergaleia','fantasy','koryfaioi','analytika','sygkrisi','montelo','tipsters'],lang:'Ενότητες',copy:['Κατανόησε το παιχνίδι μέσα από τα δεδομένα. Αγώνες, στατιστική ανάλυση, προβλέψεις και εικόνα της αγοράς σε ένα σημείο.','Πρόγραμμα, αποτελέσματα και εικόνα των επόμενων αγώνων.','Αποδόσεις, μεταβολές αγοράς, value και ανάλυση player props.','Σύγκριση παικτών, προφίλ, matchups και εργαλεία ανάλυσης.','Προβλέψεις αγώνων, εκτιμήσεις παικτών και έλεγχος ακρίβειας μοντέλου.','Βαθμολογία, στατιστικά ομάδων και παικτών, ιστορικά δεδομένα.','Τα εργαλεία EuroLeague Fantasy παραμένουν διαθέσιμα σε ξεχωριστή ενότητα.','Εξερεύνησε την ενότητα','Γρήγορη πρόσβαση','Οι αγώνες σήμερα','Όλο το πρόγραμμα','Betting Insights','Prop Analyzer','Closing Line Value','Σύγκριση παικτών','Όλα τα εργαλεία','Προγνωστικά αγώνων','Ακρίβεια μοντέλου','Βαθμολογία EuroLeague','Κορυφαίοι παίκτες','Ομαδικά στατιστικά','Άνοιξε το Fantasy','Οι αναλύσεις και οι προβλέψεις είναι στατιστικές εκτιμήσεις, όχι εγγύηση αποτελέσματος ή συμβουλή στοιχηματισμού. 21+ · Παίξε υπεύθυνα.','Ανάλυση παικτών']},
  en:{dir:'en/',stand:'standings',r:['today','schedule','odds','odds/prop-analyzer','odds/clv','predictions','tools','fantasy','leaders','team-analytics','compare','model','tipsters'],lang:'Sections',copy:['Understand the game through data. Games, statistical analysis, projections and market context in one place.','Schedule, results and a clear view of upcoming games.','Odds, market movement, value and player prop analysis.','Player comparisons, profiles, matchups and analysis tools.','Game forecasts, player projections and model accuracy tracking.','Standings, team and player statistics, and historical data.','EuroLeague Fantasy tools remain available in their own dedicated section.','Explore section','Quick access','Today’s games','Full schedule','Betting Insights','Prop Analyzer','Closing Line Value','Player comparison','All tools','Game predictions','Model accuracy','EuroLeague standings','Player leaders','Team statistics','Open Fantasy','Our analysis and projections are statistical estimates, not guaranteed outcomes or betting advice. 18+ · Gamble responsibly.','Player analytics']},
  es:{dir:'es/',stand:'clasificacion',r:['hoy','calendario','cuotas','cuotas/prop-analyzer','cuotas/clv','pronosticos','herramientas','fantasy','lideres','analitica','comparar','modelo','tipsters'],lang:'Secciones',copy:['Entiende el juego a través de los datos. Partidos, análisis, proyecciones y contexto del mercado en un solo lugar.','Calendario, resultados y próximos partidos.','Cuotas, movimientos del mercado, value y análisis de props.','Comparación de jugadores, perfiles, enfrentamientos y herramientas.','Pronósticos, proyecciones de jugadores y precisión del modelo.','Clasificación, estadísticas de equipos y jugadores e histórico.','Las herramientas EuroLeague Fantasy siguen disponibles en su propia sección.','Explorar sección','Acceso rápido','Partidos de hoy','Calendario completo','Betting Insights','Prop Analyzer','Closing Line Value','Comparar jugadores','Todas las herramientas','Pronósticos','Precisión del modelo','Clasificación EuroLeague','Líderes de jugadores','Estadísticas de equipos','Abrir Fantasy','Nuestros análisis son estimaciones estadísticas, no resultados garantizados ni consejos de apuestas. 18+ · Juega con responsabilidad.','Analítica de jugadores']},
  sr:{dir:'sr/',stand:'tabela',r:['danas','raspored','kvote','kvote/prop-analyzer','kvote/clv','prognoze','alati','fantasy','lideri','analitika','poredjenje','model','tipsters'],lang:'Sekcije',copy:['Razumi igru kroz podatke. Utakmice, statistička analiza, projekcije i kretanje tržišta na jednom mestu.','Raspored, rezultati i pregled narednih utakmica.','Kvote, kretanje tržišta, value i analiza player props ponude.','Poređenje igrača, profili, matchup analiza i alati.','Prognoze utakmica, projekcije igrača i tačnost modela.','Tabela, statistika timova i igrača i istorijski podaci.','EuroLeague Fantasy alati ostaju dostupni u posebnoj sekciji.','Istraži sekciju','Brzi pristup','Današnje utakmice','Kompletan raspored','Betting Insights','Prop Analyzer','Closing Line Value','Poređenje igrača','Svi alati','Prognoze utakmica','Tačnost modela','Tabela EuroLeague','Lideri igrača','Statistika timova','Otvori Fantasy','Analize i projekcije su statističke procene, ne garantovani ishodi ili savet za klađenje. 18+ · Igraj odgovorno.','Analitika igrača']},
  tr:{dir:'tr/',stand:'puan-durumu',r:['bugun','fikstur','oranlar','oranlar/prop-analyzer','oranlar/clv','tahminler','araclar','fantasy','liderler','takim-analizi','karsilastir','model','tipsters'],lang:'Bölümler',copy:['Oyunu verilerle anla. Maçlar, istatistiksel analiz, tahminler ve piyasa görünümü tek yerde.','Fikstür, sonuçlar ve yaklaşan maçların görünümü.','Oranlar, piyasa hareketleri, value ve oyuncu prop analizi.','Oyuncu karşılaştırmaları, profiller, eşleşmeler ve analiz araçları.','Maç tahminleri, oyuncu projeksiyonları ve model doğruluğu.','Puan durumu, takım ve oyuncu istatistikleri, tarihsel veriler.','EuroLeague Fantasy araçları kendi bölümünde kullanılmaya devam ediyor.','Bölümü keşfet','Hızlı erişim','Bugünün maçları','Tüm fikstür','Betting Insights','Prop Analyzer','Closing Line Value','Oyuncu karşılaştırma','Tüm araçlar','Maç tahminleri','Model doğruluğu','EuroLeague puan durumu','Oyuncu liderleri','Takım istatistikleri','Fantasy’yi aç','Analiz ve tahminler istatistiksel değerlendirmelerdir; garanti veya bahis tavsiyesi değildir. 18+ · Sorumlu oyna.','Oyuncu analizi']}
};
const CARD_DESCRIPTIONS = {"el":["Παρακολούθησε τις αποδόσεις και τις μεταβολές της αγοράς πριν από τους αγώνες.","Αξιολόγησε γραμμές πόντων, ριμπάουντ και ασίστ με βάση τις επιδόσεις των παικτών.","Σύγκρινε την απόδοση που βρίσκεις με την τελική τιμή πριν από το τζάμπολ.","Σύγκρινε δύο παίκτες σε βασικούς στατιστικούς δείκτες και αγωνιστικά χαρακτηριστικά.","Εξερεύνησε τα διαθέσιμα εργαλεία ανάλυσης και τις λειτουργίες αναζήτησης παικτών.","Εξέτασε την εικόνα των ομάδων μέσα από ομαδικούς δείκτες και αναλυτικά στατιστικά.","Δες εκτιμήσεις για επερχόμενους αγώνες βάσει διαθέσιμων στατιστικών δεδομένων.","Έλεγξε πόσο κοντά βρίσκονται οι προβλέψεις του μοντέλου στα πραγματικά αποτελέσματα.","Ανακάλυψε προγνωστικά και αξιολόγησε την πορεία των tipsters.","Δες τη βαθμολογία, τις νίκες, τις ήττες και τη θέση κάθε ομάδας.","Εντόπισε τους κορυφαίους παίκτες ανά στατιστική κατηγορία.","Σύγκρινε την επιθετική και αμυντική παραγωγή των ομάδων."],"en":["Track bookmaker prices and market movements ahead of upcoming games.","Assess points, rebounds and assists lines against players’ statistical performances.","Compare the price you take with the market’s closing price before tip-off.","Compare two players across key statistical measures and playing attributes.","Explore the available analysis tools and player research features.","Explore team performance through detailed statistics and team-level metrics.","Review upcoming game projections based on available statistical data.","Measure how closely model predictions match actual game outcomes.","Discover picks and review tipsters’ performance over time.","Check the standings, wins, losses and position of every team.","Find the leading players in each statistical category.","Compare teams’ offensive and defensive production."],"es":["Sigue las cuotas y los movimientos del mercado antes de los próximos partidos.","Evalúa las líneas de puntos, rebotes y asistencias según el rendimiento de cada jugador.","Compara la cuota obtenida con la cuota de cierre antes del inicio.","Compara dos jugadores mediante estadísticas clave y características de juego.","Explora las herramientas de análisis y las funciones de búsqueda de jugadores.","Analiza el rendimiento de los equipos mediante indicadores y estadísticas detalladas.","Consulta proyecciones de próximos partidos basadas en datos estadísticos.","Mide cuánto se acercan las predicciones del modelo a los resultados reales.","Descubre pronósticos y consulta el rendimiento de los tipsters.","Consulta la clasificación, victorias, derrotas y posición de cada equipo.","Encuentra a los jugadores líderes en cada categoría estadística.","Compara la producción ofensiva y defensiva de los equipos."],"sr":["Prati kvote i promene na tržištu pre predstojećih utakmica.","Proceni granice poena, skokova i asistencija na osnovu učinka igrača.","Uporedi odigranu kvotu sa završnom tržišnom kvotom pred početak.","Uporedi dva igrača kroz ključne statističke pokazatelje i karakteristike igre.","Istraži dostupne alate za analizu i funkcije za pronalaženje igrača.","Analiziraj učinak timova kroz detaljnu statistiku i timske pokazatelje.","Pogledaj projekcije predstojećih utakmica zasnovane na dostupnim podacima.","Proveri koliko su prognoze modela blizu stvarnim rezultatima utakmica.","Pronađi prognoze i prati uspešnost tipstera tokom vremena.","Pogledaj tabelu, pobede, poraze i plasman svakog tima.","Pronađi vodeće igrače u svakoj statističkoj kategoriji.","Uporedi napadački i odbrambeni učinak timova."],"tr":["Yaklaşan maçlar öncesinde bahis oranlarını ve piyasa hareketlerini takip et.","Oyuncu istatistiklerine göre sayı, ribaund ve asist bahis çizgilerini değerlendir.","Aldığın oranı maç öncesindeki kapanış oranıyla karşılaştır.","İki oyuncuyu temel istatistikler ve oyun özellikleri üzerinden karşılaştır.","Mevcut analiz araçlarını ve oyuncu araştırma özelliklerini keşfet.","Takım performansını ayrıntılı istatistikler ve takım göstergeleriyle incele.","Mevcut istatistiksel verilere dayalı yaklaşan maç tahminlerini görüntüle.","Model tahminlerinin gerçek maç sonuçlarına ne kadar yaklaştığını ölç.","Tahminleri keşfet ve tipster performansını zaman içinde incele.","Her takımın puan durumunu, galibiyetlerini ve mağlubiyetlerini gör.","Her istatistik kategorisindeki lider oyuncuları keşfet.","Takımların hücum ve savunma üretimini karşılaştır."]};
const PORTAL_LABELS = {
  el:{nav:['Κέντρο αγώνων','Στοιχηματική ανάλυση','Εργαστήριο παικτών','Προγνωστικά','Στατιστικά μπάσκετ','Fantasy'],groups:['Στοιχηματική ανάλυση','Εργαστήριο παικτών','Προβλέψεις','Δεδομένα μπάσκετ'],match:'Κέντρο αγώνων',fantasy:'Ζώνη Fantasy'},
  en:{nav:['Match Center','Betting Intelligence','Player Lab','Predictions','Basketball Data','Fantasy'],groups:['Betting Intelligence','Player Lab','Predictions','Basketball Data'],match:'Match Center',fantasy:'Fantasy Zone'},
  es:{nav:['Centro de partidos','Análisis de apuestas','Laboratorio de jugadores','Pronósticos','Datos de baloncesto','Fantasy'],groups:['Análisis de apuestas','Laboratorio de jugadores','Pronósticos','Datos de baloncesto'],match:'Centro de partidos',fantasy:'Zona Fantasy'},
  sr:{nav:['Centar utakmica','Analiza klađenja','Laboratorija igrača','Prognoze','Košarkaški podaci','Fantasy'],groups:['Analiza klađenja','Laboratorija igrača','Prognoze','Košarkaški podaci'],match:'Centar utakmica',fantasy:'Fantasy zona'},
  tr:{nav:['Maç Merkezi','Bahis Analizi','Oyuncu Laboratuvarı','Tahminler','Basketbol Verileri','Fantasy'],groups:['Bahis Analizi','Oyuncu Laboratuvarı','Tahminler','Basketbol Verileri'],match:'Maç Merkezi',fantasy:'Fantasy Alanı'}
};
const esc = s => String(s).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const routeIndex = {today:0,schedule:1,odds:2,props:3,clv:4,pred:5,tools:6,fantasy:7,leaders:8,analytics:9,compare:10,model:11,tips:12};
const route = (lang,key) => '/' + L[lang].dir + (key==='stand' ? L[lang].stand : L[lang].r[routeIndex[key]]) + '/';
const standingsUrl = lang => SITE + '/' + L[lang].dir + L[lang].stand + '/';
const fixStandingsAlternates = html => html.replace(
  /(<link rel="alternate" hreflang=")(el|en|es|sr|tr)("[^>]*href=")[^"]*(")/g,
  (_, before, lang, middle, after) => before + lang + middle + standingsUrl(lang) + after
).replace(
  /(<link rel="alternate" hreflang="x-default"[^>]*href=")[^"]*(")/,
  (_, before, after) => before + standingsUrl('el') + after
);
const nav = lang => {
  const names=PORTAL_LABELS[lang].nav;
  const icons=['🏀','🎯','📊','🧠','📈','🏆'];
  const keys=['today','odds','tools','pred','stand','fantasy'];
  const views=['today','odds','tools','preds','stand','fantasy'];
  return '<nav class="nav" aria-label="'+L[lang].lang+'">'+names.map((n,i)=>'<a href="'+route(lang,keys[i])+'" data-v="'+views[i]+'"><span aria-hidden="true">'+icons[i]+'</span> '+n+'</a>').join('')+'</nav>';
};
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
  let stand=fixStandingsAlternates(meta(old,lang==='el'?'Βαθμολογία EuroLeague | Basketball Stats':'EuroLeague Standings | Basketball Stats',lang==='el'?'Βαθμολογία, αποτελέσματα, πρόγραμμα και στατιστικά EuroLeague.':'EuroLeague standings, results, schedule and team and player statistics.',standUrl));
  stand=stand.replace(/<nav class="nav"[\s\S]*?<\/nav>/,nav(lang));
  const standFile=path.join(folder,cfg.stand,'index.html');
  await fs.mkdir(path.dirname(standFile),{recursive:true});
  await fs.writeFile(standFile,stand);

  const today=old.match(/<section class="todayhome">[\s\S]*?<\/section>/);
  const match=today ? today[0] : '<p><a href="'+route(lang,'today')+'">'+c[9]+' →</a></p>';
  const groups=[
    [PORTAL_LABELS[lang].groups[0],c[2], [card('📉',c[13],CARD_DESCRIPTIONS[lang][0],route(lang,'clv'),c[7]),card('📊',c[12],CARD_DESCRIPTIONS[lang][1],route(lang,'props'),c[7]),card('🎯',c[11],CARD_DESCRIPTIONS[lang][2],route(lang,'odds'),c[7])]],
    [PORTAL_LABELS[lang].groups[1],c[3],[card('🧬',c[14],CARD_DESCRIPTIONS[lang][3],route(lang,'compare'),c[7]),card('🧰',c[15],CARD_DESCRIPTIONS[lang][4],route(lang,'tools'),c[7]),card('📈',c[23],CARD_DESCRIPTIONS[lang][5],route(lang,'analytics'),c[7])]],
    [PORTAL_LABELS[lang].groups[2],c[4],[card('🧠',c[16],CARD_DESCRIPTIONS[lang][6],route(lang,'pred'),c[7]),card('🎯',c[17],CARD_DESCRIPTIONS[lang][7],route(lang,'model'),c[7]),card('✍️','Tipsters',CARD_DESCRIPTIONS[lang][8],route(lang,'tips'),c[7])]],
    [PORTAL_LABELS[lang].groups[3],c[5],[card('🏆',c[18],CARD_DESCRIPTIONS[lang][9],route(lang,'stand'),c[7]),card('📊',c[19],CARD_DESCRIPTIONS[lang][10],route(lang,'leaders'),c[7]),card('📈',c[20],CARD_DESCRIPTIONS[lang][11],route(lang,'analytics'),c[7])]]
  ];
  let body='<main class="wrap portal-home">';
  body+='<section class="portal-hero"><div class="portal-kicker">EUROLEAGUE · BASKETBALL INTELLIGENCE</div><h1>Basketball Intelligence Portal</h1><p>'+c[0]+'</p><div class="portal-hero-links"><a href="'+route(lang,'today')+'">'+c[9]+' →</a><a href="'+route(lang,'odds')+'">'+c[11]+' →</a></div><div class="portal-ball" aria-hidden="true">🏀</div></section>';
  body+='<section class="portal-match"><div class="portal-section-head"><div><span class="portal-kicker">'+c[8]+'</span><h2>'+PORTAL_LABELS[lang].match+'</h2><p>'+c[1]+'</p></div><a href="'+route(lang,'schedule')+'">'+c[10]+' →</a></div>'+match+'</section>';
  for(let i=0;i<groups.length;i++) body+='<section class="portal-section"><div class="portal-section-head"><div><span class="portal-kicker">0'+(i+1)+' / 04</span><h2>'+groups[i][0]+'</h2><p>'+groups[i][1]+'</p></div></div><div class="portal-grid">'+groups[i][2].join('')+'</div></section>';
  body+='<section class="portal-fantasy"><div><span class="portal-kicker">05 / 05</span><h2>🏆 '+PORTAL_LABELS[lang].fantasy+'</h2><p>'+c[6]+'</p></div><a href="'+route(lang,'fantasy')+'">'+c[21]+' →</a></section><p class="portal-disclosure">'+c[22]+'</p></main>';
  let home=old.replace(/<main class="wrap one">[\s\S]*?<\/main>/,body).replace('data-view="stand"','data-view="portal"');
  home=home.replace(/<nav class="nav"[\s\S]*?<\/nav>/,nav(lang));
  // The source standings header is outside <main>; hide its band on portal homepages.
  home=home.replace('</head>', '<style>body[data-view="portal"] .band:has(.shero){display:none!important}body[data-view="portal"] .shero{display:none!important}</style></head>');
  home=meta(home,'Basketball Intelligence Portal | Basketball Stats',c[0],SITE+'/'+cfg.dir);
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
    html = html.replace(/<nav class="nav"[\s\S]*?<\/nav>/, nav(lang));
    html = html.replace(/(<nav class="foot">[\s\S]*?<a href=")[^"]*(")/, "$1" + route(lang, "stand") + "$2");
    await fs.writeFile(file, html);
  }
}
for (const [lang, cfg] of Object.entries(L)) await updateNavigation(path.join(root, cfg.dir), lang);

console.log('Basketball Intelligence homepage and localized standings pages generated.');
