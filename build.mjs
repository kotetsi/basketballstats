// BasketballStats — ενημέρωση δεδομένων και παραγωγή στατικών σελίδων.
// Χρήση:  node build.mjs            (τραβάει νέα δεδομένα από την Ευρωλίγκα)
//         node build.mjs --offline  (χρησιμοποιεί τα αποθηκευμένα δεδομένα)
// Ρυθμίσεις (μεταβλητές περιβάλλοντος):
//   SITE_URL   η διεύθυνση του site, π.χ. https://basketballstats.eu   (για sitemap/canonical)
//   SITE_BASE  αν το site μπει σε υποφάκελο, π.χ. /stats/      (προεπιλογή /)
//   SEASON     κωδικός σεζόν της Ευρωλίγκας                    (προεπιλογή E2026)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translate, APP_CODE, SHELL_CODE } from './src/en.mjs';
import * as ES from './src/es.mjs';
import * as SR from './src/sr.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONF = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8').catch(() => '{}'));
const SITE_URL = (process.env.SITE_URL || CONF.siteUrl || 'https://example.gr').replace(/\/$/, '');
let BASE = process.env.SITE_BASE || CONF.base || '/';
if (!BASE.endsWith('/')) BASE += '/';
const SEASON = process.env.SEASON || CONF.season || 'E2026';
const SITE_NAME = CONF.siteName || 'BasketballStats';
const AD_CLIENT = (process.env.ADSENSE_CLIENT || CONF.adsenseClient || '').trim();
const AD_SLOT = (process.env.ADSENSE_SLOT || CONF.adsenseSlot || '').trim();
const SEASON_LABEL = `${+SEASON.slice(1)}-${String(+SEASON.slice(1) + 1).slice(2)}`;
const OFFLINE = process.argv.includes('--offline');
const OUT = path.join(ROOT, 'dist');
const CACHE = path.join(ROOT, 'data', 'cache.json');
const FEED = 'https://feeds.incrowdsports.com/provider/euroleague-feeds';

// Ομάδες: κωδικός Ευρωλίγκας → [ελληνικό όνομα, χρώμα, slug, αγγλικό όνομα, αγγλικό slug, ισπανικό όνομα, ισπανικό slug, σερβικό όνομα, σερβικό slug]
const TEAMS = {
  OLY: ['Ολυμπιακός', '#c8102e', 'olympiakos', 'Olympiacos', 'olympiacos', 'Olympiacos', 'olympiacos', 'Olimpijakos', 'olimpijakos'], PAN: ['Παναθηναϊκός', '#007a3d', 'panathinaikos', 'Panathinaikos', 'panathinaikos', 'Panathinaikos', 'panathinaikos', 'Panatinaikos', 'panatinaikos'],
  MAD: ['Ρεάλ Μαδρίτης', '#5b4a9b', 'real-madrite', 'Real Madrid', 'real-madrid', 'Real Madrid', 'real-madrid', 'Real Madrid', 'real-madrid'], ULK: ['Φενέρμπαχτσε', '#1d3c8f', 'fenerbahce', 'Fenerbahce', 'fenerbahce', 'Fenerbahçe', 'fenerbahce', 'Fenerbahče', 'fenerbahce'],
  PAR: ['Παρτιζάν', '#3b3b3b', 'partizan', 'Partizan', 'partizan', 'Partizan', 'partizan', 'Partizan', 'partizan'], RED: ['Ερυθρός Αστέρας', '#b3122e', 'erythros-asteras', 'Crvena Zvezda', 'crvena-zvezda', 'Estrella Roja', 'estrella-roja', 'Crvena zvezda', 'crvena-zvezda'],
  BAR: ['Μπαρτσελόνα', '#a50044', 'barcelona', 'Barcelona', 'barcelona', 'Barça', 'barcelona', 'Barselona', 'barselona'], ASV: ['Βιλερμπάν', '#1a1a1a', 'villeurbanne', 'ASVEL', 'asvel', 'ASVEL', 'asvel', 'Asvel', 'asvel'],
  ZAL: ['Ζαλγκίρις', '#00703c', 'zalgiris', 'Zalgiris', 'zalgiris', 'Zalgiris', 'zalgiris', 'Žalgiris', 'zalgiris'], HTA: ['Χάποελ Τελ Αβίβ', '#d71920', 'hapoel-tel-aviv', 'Hapoel Tel Aviv', 'hapoel-tel-aviv', 'Hapoel Tel Aviv', 'hapoel-tel-aviv', 'Hapoel Tel Aviv', 'hapoel-tel-aviv'],
  VIR: ['Βίρτους Μπολόνια', '#222222', 'virtus-bolonia', 'Virtus Bologna', 'virtus-bologna', 'Virtus Bolonia', 'virtus-bolonia', 'Virtus Bolonja', 'virtus-bolonja'], BES: ['Μπεσίκτας', '#2a2a2a', 'besiktas', 'Besiktas', 'besiktas', 'Besiktas', 'besiktas', 'Bešiktaš', 'besiktas'],
  BAS: ['Μπασκόνια', '#1b3a6b', 'baskonia', 'Baskonia', 'baskonia', 'Baskonia', 'baskonia', 'Baskonija', 'baskonija'], MIL: ['Αρμάνι Μιλάνο', '#c8102e', 'armani-milano', 'Olimpia Milano', 'olimpia-milano', 'Olimpia Milán', 'olimpia-milan', 'Olimpija Milano', 'olimpija-milano'],
  DUB: ['Ντουμπάι', '#0a6e8a', 'ntoumpai', 'Dubai Basketball', 'dubai', 'Dubái', 'dubai', 'Dubai', 'dubai'], PAM: ['Βαλένθια', '#e46b11', 'valenthia', 'Valencia Basket', 'valencia', 'Valencia Basket', 'valencia-basket', 'Valensija', 'valensija'],
  TEL: ['Μακάμπι Τελ Αβίβ', '#d9a400', 'makampi-tel-aviv', 'Maccabi Tel Aviv', 'maccabi-tel-aviv', 'Maccabi Tel Aviv', 'maccabi-tel-aviv', 'Makabi Tel Aviv', 'makabi-tel-aviv'], IST: ['Αναντολού Εφές', '#003b7a', 'anadolou-efes', 'Anadolu Efes', 'anadolu-efes', 'Anadolu Efes', 'anadolu-efes', 'Anadolu Efes', 'anadolu-efes'],
  PRS: ['Παρί', '#2b2b2b', 'pari', 'Paris Basketball', 'paris', 'París Basketball', 'paris', 'Pariz', 'pariz'], MUN: ['Μπάγερν', '#c8102e', 'bayern', 'Bayern Munich', 'bayern-munich', 'Bayern Múnich', 'bayern-munich', 'Bajern Minhen', 'bajern-minhen'],
};

// Γλώσσες: τα ελληνικά στη ρίζα του site, τα αγγλικά στο /en/, τα ισπανικά στο /es/, τα σερβικά (λατινικά) στο /sr/
const LANGS = ['el', 'en', 'es', 'sr'];
const TEAM_IDX = { el: [0, 2], en: [3, 4], es: [5, 6], sr: [7, 8] }; // θέση ονόματος και slug στο TEAMS
const PATHS = {
  el: { team: 'omada', player: 'paiktis', form: 'thermometro', fantasy: 'fantasy', preds: 'prognostika', articles: 'arthra', tipsters: 'tipsters', legal: 'politiki-aporritou', app: 'efarmogi', game: 'agonas', widgets: 'widget' },
  en: { team: 'team', player: 'player', form: 'thermometer', fantasy: 'fantasy', preds: 'predictions', articles: 'articles', tipsters: 'tipsters', legal: 'privacy', app: 'app', game: 'game', widgets: 'widget' },
  es: { team: 'equipo', player: 'jugador', form: 'termometro', fantasy: 'fantasy', preds: 'pronosticos', articles: 'articulos', tipsters: 'tipsters', legal: 'privacidad', app: 'app', game: 'partido', widgets: 'widget' },
  sr: { team: 'tim', player: 'igrac', form: 'termometar', fantasy: 'fantasy', preds: 'prognoze', articles: 'clanci', tipsters: 'tipsters', legal: 'privatnost', app: 'aplikacija', game: 'utakmica', widgets: 'widget' },
};
// κείμενα των νέων ενοτήτων του app (γραμμές, με/χωρίς, σελίδες αγώνων) ανά γλώσσα
const UI = {
  el: {
    gpath: 'agonas', rd: '{n}η αγωνιστική', final: 'τελικό', est: 'εκτίμηση σκορ', fav: 'Φαβορί: <b>{t}</b> ({p}%)', total: 'Σύνολο ~{n} πόντοι',
    gameLink: 'Ανάλυση αγώνα →', soon: 'προσεχώς', recHome: 'Έδρα', recAway: 'Εκτός', heat: 'Θερμόμετρο', W: 'Ν', L: 'Η',
    noInj: 'Δεν υπάρχουν γνωστές απουσίες.', player: 'Παίκτης', min: 'Λεπ.', pts: 'Πόντ.', reb: 'Ριμπ.', ast: 'Ασίστ',
    ovr: 'Γραμμή πόντων', ovrT: 'Πόσες φορές πέρασε το όριο πόντων κοντά στον μέσο όρο του', h2hNone: 'Δεν έχουν άλλο αγώνα μεταξύ τους φέτος.', readPred: 'Διάβασε το προγνωστικό μας →',
    ff: { ppg: 'Πόντοι ανά αγώνα', oppg: 'Πόντοι κατά', ortg: 'Επιθετική απόδοση', drtg: 'Αμυντική απόδοση', net: 'Καθαρή απόδοση', pace: 'Ρυθμός (κατοχές)', efg: 'Ευστοχία (eFG%)', tovp: 'Λάθη ανά κατοχή', orbp: 'Επιθ. ριμπάουντ %', ftr: 'Βολές ανά σουτ', p3: 'Τρίποντα %' },
    pTitle: 'Γραμμές παίκτη', pSub: 'Πόσες φορές πέρασε το όριο σε κάθε κατηγορία. Αλλάξτε το όριο με − και +.',
    pk: { pts: 'Πόντοι', reb: 'Ριμπάουντ', ast: 'Ασίστ', pra: 'Π+Ρ+Α', m3: 'Τρίποντα', pir: 'PIR' }, pLine: 'Όριο',
    pAll: 'Όλη η σεζόν', pLast: 'Τελευταίοι {n}', pHome: 'Εντός έδρας', pAway: 'Εκτός έδρας', pVs: 'Με {t}',
    pAvg: 'Μέσος όρος {a} · διάμεσος {m}', pNext: 'Επόμενος αγώνας: {g}',
    pNote: 'Μετράνε μόνο οι αγώνες που αγωνίστηκε. Στατιστική πληροφορία, όχι συμβουλή στοιχήματος. Το στοίχημα επιτρέπεται μόνο σε άτομα άνω των 21 ετών. Παίξτε υπεύθυνα.',
    wTitle: 'Με και χωρίς αυτόν', wSub: 'Η ομάδα στους αγώνες που έπαιξε και σε αυτούς που έλειψε (από την πρώτη του εμφάνιση)',
    wWith: 'Με αυτόν', wWithout: 'Χωρίς αυτόν', wMar: 'Διαφορά', wPF: 'Υπέρ', wPA: 'Κατά', wGames: '{n} αγώνες',
    wMinT: 'Ποιος παίρνει τα λεπτά του', wMinSub: 'Μέσα λεπτά και PIR των συμπαικτών όταν παίζει και όταν λείπει',
    wMinW: 'Λεπτά με', wMinWo: 'Λεπτά χωρίς', wPirW: 'PIR με', wPirWo: 'PIR χωρίς',
    wSmall: 'Μικρό δείγμα ({n} αγώνες χωρίς αυτόν): τα νούμερα αλλάζουν εύκολα.',
    wTeamT: 'Με και χωρίς', wTeamSub: 'Ρεκόρ της ομάδας με και χωρίς κάθε βασικό παίκτη (σε παρένθεση η μέση διαφορά πόντων)', wMissed: 'Απουσίες',
    wNone: 'Όλοι οι βασικοί παίκτες έχουν αγωνιστεί σε κάθε αγώνα από την πρώτη τους εμφάνιση.',
    pd: { title: 'Άμυνα ανά θέση', sub: 'PIR που δέχεται κάθε ομάδα ανά αγώνα από γκαρντ, φόργουορντ και σέντερ (και οι πόντοι). Πράσινο: δίνει πολλά, καλό για Fantasy. Κόκκινο: σφιχτή άμυνα. Πατήστε μια στήλη για ταξινόμηση.', team: 'Ομάδα', Guard: 'Γκαρντ', Forward: 'Φόργουορντ', Center: 'Σέντερ', ptsS: 'π.', cellT: 'PIR ανά αγώνα (πόντοι)', gives: 'δίνει', note: 'Οι εκτιμήσεις PIR στο «Ποιους να βάλεις» λαμβάνουν υπόψη και πόσο δίνει ο αντίπαλος στη θέση του παίκτη.' },
    po: { title: 'Πιθανότητες τελικής θέσης', sub: '{n} προσομοιώσεις των {g} αγώνων που απομένουν, με το μοντέλο των προγνωστικών. Πατήστε μια στήλη για ταξινόμηση.', team: 'Ομάδα', rec: 'Αναμ. ρεκόρ', recT: 'Μέσο τελικό ρεκόρ στις προσομοιώσεις', top4: 'Top 4', top4T: 'Πλεονέκτημα έδρας στα playoffs', top6: 'Playoffs', pin: 'Play-in', out: 'Εκτός', best: 'Πιθανότερη θέση', note: 'Playoffs: θέσεις 1-6 · Play-in: 7-10 · Εκτός: 11-20. Κάθε αγώνας κρίνεται με βάση τις αποδόσεις των ομάδων ανά 100 κατοχές και την έδρα, με τυχαιότητα στην απόδοση κάθε ομάδας. Οι ισοβαθμίες λύνονται με τη διαφορά πόντων και όχι με τα επίσημα κριτήρια. Στατιστική εκτίμηση, όχι πρόβλεψη.', teamT: 'Πιθανότητες', teamSub: 'Αναμενόμενο ρεκόρ {r} · πιθανότερη θέση: {b}', dist: 'Πιθανότητα για κάθε θέση από 1 έως 20', all: 'Όλες οι ομάδες →' },
    vid: { title: 'Βίντεο', hl: 'Highlights αγώνων (EuroLeague)', team: 'Από το κανάλι της ομάδας', yt: 'Όλα τα βίντεο στο YouTube →', play: 'Αναπαραγωγή', note: 'Τα βίντεο φορτώνουν από το YouTube μόνο όταν πατήσεις αναπαραγωγή.' },
  },
  en: {
    gpath: 'game', rd: 'Round {n}', final: 'final', est: 'projected score', fav: 'Favourite: <b>{t}</b> ({p}%)', total: 'Total ~{n} points',
    gameLink: 'Game preview →', soon: 'upcoming', recHome: 'Home', recAway: 'Away', heat: 'Thermometer', W: 'W', L: 'L',
    noInj: 'No known absences.', player: 'Player', min: 'Min', pts: 'Pts', reb: 'Reb', ast: 'Ast',
    ovr: 'Points line', ovrT: 'How often he went over the points line closest to his average', h2hNone: 'No other meeting between them this season.', readPred: 'Read our prediction →',
    ff: { ppg: 'Points per game', oppg: 'Points allowed', ortg: 'Offensive rating', drtg: 'Defensive rating', net: 'Net rating', pace: 'Pace (possessions)', efg: 'Shooting (eFG%)', tovp: 'Turnovers per possession', orbp: 'Offensive rebound %', ftr: 'Free throws per shot', p3: '3-point %' },
    pTitle: 'Player lines', pSub: 'How often he went over the line in each category. Change the line with − and +.',
    pk: { pts: 'Points', reb: 'Rebounds', ast: 'Assists', pra: 'P+R+A', m3: 'Threes', pir: 'PIR' }, pLine: 'Line',
    pAll: 'Whole season', pLast: 'Last {n}', pHome: 'Home', pAway: 'Away', pVs: 'Vs {t}',
    pAvg: 'Average {a} · median {m}', pNext: 'Next game: {g}',
    pNote: 'Only games he played count. Statistical information, not betting advice. Betting is for adults only (21+ in Greece, 18+ in most countries). Please gamble responsibly.',
    wTitle: 'With and without him', wSub: 'The team in the games he played and in the ones he missed (since his first appearance)',
    wWith: 'With him', wWithout: 'Without him', wMar: 'Margin', wPF: 'For', wPA: 'Against', wGames: '{n} games',
    wMinT: 'Who takes his minutes', wMinSub: 'Teammates’ average minutes and PIR when he plays and when he is out',
    wMinW: 'Min with', wMinWo: 'Min without', wPirW: 'PIR with', wPirWo: 'PIR without',
    wSmall: 'Small sample ({n} games without him): the numbers can swing easily.',
    wTeamT: 'With and without', wTeamSub: 'The team’s record with and without each key player (average point margin in brackets)', wMissed: 'Missed',
    wNone: 'Every key player has played in every game since his first appearance.',
    pd: { title: 'Defense by position', sub: 'PIR each team allows per game to guards, forwards and centers (and points). Green: gives up a lot, good for Fantasy. Red: tight defense. Click a column to sort.', team: 'Team', Guard: 'Guards', Forward: 'Forwards', Center: 'Centers', ptsS: 'pts', cellT: 'PIR per game (points)', gives: 'allows', note: 'The PIR projections in “Who to pick” also take into account what the opponent allows at the player’s position.' },
    po: { title: 'Final standings odds', sub: '{n} simulations of the {g} remaining games, using the predictions model. Click a column to sort.', team: 'Team', rec: 'Proj. record', recT: 'Average final record in the simulations', top4: 'Top 4', top4T: 'Home-court advantage in the playoffs', top6: 'Playoffs', pin: 'Play-in', out: 'Out', best: 'Most likely place', note: 'Playoffs: places 1-6 · Play-in: 7-10 · Out: 11-20. Each game is decided from the teams’ ratings per 100 possessions and home court, with randomness in each team’s level. Ties are broken by point difference, not the official criteria. A statistical estimate, not a prediction.', teamT: 'Odds', teamSub: 'Projected record {r} · most likely place: {b}', dist: 'Chance of each place from 1 to 20', all: 'All teams →' },
    vid: { title: 'Videos', hl: 'Game highlights (EuroLeague)', team: 'From the team’s channel', yt: 'All videos on YouTube →', play: 'Play', note: 'Videos load from YouTube only when you press play.' },
  },
  es: {
    gpath: 'partido', rd: 'Jornada {n}', final: 'final', est: 'marcador estimado', fav: 'Favorito: <b>{t}</b> ({p}%)', total: 'Total ~{n} puntos',
    gameLink: 'Previa del partido →', soon: 'próximamente', recHome: 'Local', recAway: 'Visitante', heat: 'Termómetro', W: 'V', L: 'D',
    noInj: 'No hay bajas conocidas.', player: 'Jugador', min: 'Min', pts: 'Pts', reb: 'Reb', ast: 'Asis',
    ovr: 'Línea de puntos', ovrT: 'Cuántas veces superó la línea de puntos más cercana a su promedio', h2hNone: 'No tienen otro partido entre ellos esta temporada.', readPred: 'Lee nuestro pronóstico →',
    ff: { ppg: 'Puntos por partido', oppg: 'Puntos en contra', ortg: 'Rating ofensivo', drtg: 'Rating defensivo', net: 'Rating neto', pace: 'Ritmo (posesiones)', efg: 'Acierto (eFG%)', tovp: 'Pérdidas por posesión', orbp: 'Rebote ofensivo %', ftr: 'Tiros libres por tiro', p3: 'Triples %' },
    pTitle: 'Líneas del jugador', pSub: 'Cuántas veces superó la línea en cada categoría. Cambia la línea con − y +.',
    pk: { pts: 'Puntos', reb: 'Rebotes', ast: 'Asistencias', pra: 'P+R+A', m3: 'Triples', pir: 'PIR' }, pLine: 'Línea',
    pAll: 'Toda la temporada', pLast: 'Últimos {n}', pHome: 'En casa', pAway: 'Fuera', pVs: 'Contra {t}',
    pAvg: 'Promedio {a} · mediana {m}', pNext: 'Próximo partido: {g}',
    pNote: 'Solo cuentan los partidos que jugó. Información estadística, no un consejo de apuestas. Las apuestas son solo para adultos (+21 en Grecia, +18 en España y la mayoría de países). Juega con responsabilidad.',
    wTitle: 'Con y sin él', wSub: 'El equipo en los partidos que jugó y en los que se perdió (desde su primera aparición)',
    wWith: 'Con él', wWithout: 'Sin él', wMar: 'Diferencia', wPF: 'A favor', wPA: 'En contra', wGames: '{n} partidos',
    wMinT: 'Quién se queda con sus minutos', wMinSub: 'Minutos y PIR medios de sus compañeros cuando juega y cuando no está',
    wMinW: 'Min con', wMinWo: 'Min sin', wPirW: 'PIR con', wPirWo: 'PIR sin',
    wSmall: 'Muestra pequeña ({n} partidos sin él): las cifras pueden cambiar fácilmente.',
    wTeamT: 'Con y sin', wTeamSub: 'Balance del equipo con y sin cada jugador clave (entre paréntesis, la diferencia media de puntos)', wMissed: 'Ausencias',
    wNone: 'Todos los jugadores clave han jugado todos los partidos desde su primera aparición.',
    pd: { title: 'Defensa por posición', sub: 'PIR que recibe cada equipo por partido de bases/escoltas, aleros y pívots (y los puntos). Verde: concede mucho, bueno para el Fantasy. Rojo: defensa sólida. Haz clic en una columna para ordenar.', team: 'Equipo', Guard: 'Bases', Forward: 'Aleros', Center: 'Pívots', ptsS: 'pts', cellT: 'PIR por partido (puntos)', gives: 'concede', note: 'Las estimaciones de PIR de «A quién fichar» también tienen en cuenta lo que concede el rival en la posición del jugador.' },
    po: { title: 'Probabilidades de la clasificación final', sub: '{n} simulaciones de los {g} partidos que quedan, con el modelo de los pronósticos. Haz clic en una columna para ordenar.', team: 'Equipo', rec: 'Balance prev.', recT: 'Balance final medio en las simulaciones', top4: 'Top 4', top4T: 'Factor cancha en los playoffs', top6: 'Playoffs', pin: 'Play-in', out: 'Fuera', best: 'Puesto más probable', note: 'Playoffs: puestos 1-6 · Play-in: 7-10 · Fuera: 11-20. Cada partido se decide con los ratings de los equipos por 100 posesiones y el factor cancha, con aleatoriedad en el nivel de cada equipo. Los empates se resuelven por diferencia de puntos, no con los criterios oficiales. Una estimación estadística, no un pronóstico.', teamT: 'Probabilidades', teamSub: 'Balance previsto {r} · puesto más probable: {b}', dist: 'Probabilidad de cada puesto del 1 al 20', all: 'Todos los equipos →' },
    vid: { title: 'Vídeos', hl: 'Highlights de los partidos (EuroLeague)', team: 'Del canal del equipo', yt: 'Todos los vídeos en YouTube →', play: 'Reproducir', note: 'Los vídeos se cargan desde YouTube solo cuando pulsas reproducir.' },
  },
  sr: {
    gpath: 'utakmica', rd: '{n}. kolo', final: 'konačno', est: 'procenjeni rezultat', fav: 'Favorit: <b>{t}</b> ({p}%)', total: 'Ukupno ~{n} poena',
    gameLink: 'Najava utakmice →', soon: 'uskoro', recHome: 'Kod kuće', recAway: 'U gostima', heat: 'Termometar', W: 'P', L: 'I',
    noInj: 'Nema poznatih odsustava.', player: 'Igrač', min: 'Min', pts: 'Poeni', reb: 'Skok', ast: 'Asist',
    ovr: 'Linija poena', ovrT: 'Koliko puta je prešao liniju poena najbližu svom proseku', h2hNone: 'Nemaju drugu međusobnu utakmicu ove sezone.', readPred: 'Pročitaj našu prognozu →',
    ff: { ppg: 'Poeni po utakmici', oppg: 'Primljeni poeni', ortg: 'Napadački rejting', drtg: 'Odbrambeni rejting', net: 'Neto rejting', pace: 'Ritam (posedi)', efg: 'Šut (eFG%)', tovp: 'Izgubljene lopte po posedu', orbp: 'Skok u napadu %', ftr: 'Slobodna bacanja po šutu', p3: 'Trojke %' },
    pTitle: 'Linije igrača', pSub: 'Koliko puta je prešao liniju u svakoj kategoriji. Promeni liniju sa − i +.',
    pk: { pts: 'Poeni', reb: 'Skokovi', ast: 'Asistencije', pra: 'P+S+A', m3: 'Trojke', pir: 'PIR' }, pLine: 'Linija',
    pAll: 'Cela sezona', pLast: 'Poslednjih {n}', pHome: 'Kod kuće', pAway: 'U gostima', pVs: 'Protiv: {t}',
    pAvg: 'Prosek {a} · medijana {m}', pNext: 'Sledeća utakmica: {g}',
    pNote: 'Računaju se samo utakmice koje je odigrao. Statistička informacija, a ne savet za klađenje. Klađenje je dozvoljeno samo punoletnim osobama (21+ u Grčkoj, 18+ u Srbiji i većini zemalja). Igrajte odgovorno.',
    wTitle: 'Sa njim i bez njega', wSub: 'Tim na utakmicama koje je igrao i na onima koje je propustio (od njegovog prvog nastupa)',
    wWith: 'Sa njim', wWithout: 'Bez njega', wMar: 'Razlika', wPF: 'Dati', wPA: 'Primljeni', wGames: 'Utakmica: {n}',
    wMinT: 'Ko preuzima njegove minute', wMinSub: 'Prosečni minuti i PIR saigrača kada igra i kada ga nema',
    wMinW: 'Min sa', wMinWo: 'Min bez', wPirW: 'PIR sa', wPirWo: 'PIR bez',
    wSmall: 'Mali uzorak (utakmica bez njega: {n}): brojke se lako menjaju.',
    wTeamT: 'Sa njim i bez njega', wTeamSub: 'Skor tima sa i bez svakog ključnog igrača (u zagradi prosečna razlika u poenima)', wMissed: 'Odsustva',
    wNone: 'Svi ključni igrači su igrali na svakoj utakmici od svog prvog nastupa.',
    pd: { title: 'Odbrana po pozicijama', sub: 'PIR koji svaki tim prima po utakmici od bekova, krila i centara (i poeni). Zeleno: prima mnogo, dobro za Fantasy. Crveno: čvrsta odbrana. Klikni na kolonu za sortiranje.', team: 'Tim', Guard: 'Bekovi', Forward: 'Krila', Center: 'Centri', ptsS: 'p.', cellT: 'PIR po utakmici (poeni)', gives: 'prima', note: 'Procene PIR-a u „Koga izabrati” uzimaju u obzir i koliko protivnik prima na poziciji igrača.' },
    po: { title: 'Šanse za konačni plasman', sub: '{n} simulacija preostalih {g} utakmica, sa modelom prognoza. Klikni na kolonu za sortiranje.', team: 'Tim', rec: 'Proc. skor', recT: 'Prosečan konačni skor u simulacijama', top4: 'Top 4', top4T: 'Prednost domaćeg terena u plej-ofu', top6: 'Plej-of', pin: 'Plej-in', out: 'Ispadanje', best: 'Najverovatnije mesto', note: 'Plej-of: mesta 1-6 · Plej-in: 7-10 · Ispadanje: 11-20. Svaka utakmica se odlučuje prema rejtinzima timova na 100 poseda i domaćem terenu, uz slučajnost u nivou svakog tima. Nerešeni odnosi se rešavaju razlikom poena, a ne zvaničnim kriterijumima. Statistička procena, a ne prognoza.', teamT: 'Šanse', teamSub: 'Procenjeni skor {r} · najverovatnije mesto: {b}', dist: 'Šansa za svako mesto od 1 do 20', all: 'Svi timovi →' },
    vid: { title: 'Video', hl: 'Hajlajti utakmica (Evroliga)', team: 'Sa kanala tima', yt: 'Svi video snimci na YouTube-u →', play: 'Pusti', note: 'Video se učitava sa YouTube-a tek kada pritisneš pusti.' },
  },
};
const ordEn = n => { const t = n % 100; return n + (t > 10 && t < 14 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th')); };

// ---------- βοηθητικά
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch (e) { /* retry */ }
    await sleep(1500 * (i + 1));
  }
  throw new Error('Αποτυχία λήψης: ' + url);
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const GR = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
const slugify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[α-ω]/g, c => GR[c] || '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function niceName(n) {
  const [a, b] = n.split(',').map(s => s.trim());
  const cap = s => s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
  return b ? cap(b) + ' ' + cap(a) : cap(a);
}
const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : '–');
const teamName = c => c.split(';').map(x => (TEAMS[x] || [x])[0]).join(' / ');


// ---------- άρθρα (Markdown στον φάκελο articles/)
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${u.replace(/"/g, '%22')}">${t}</a>`);
}
function markdown(md) {
  const out = []; let list = null, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } if (list) { out.push(`<${list.t}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.t}>`); list = null; } };
  for (const raw of md.split(/\r?\n/)) {
    const l = raw.trimEnd();
    let m;
    if (!l.trim()) { flush(); continue; }
    if ((m = l.match(/^(#{2,3})\s+(.*)/))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = l.match(/^>\s?(.*)/))) { flush(); out.push(`<blockquote><p>${inline(m[1])}</p></blockquote>`); continue; }
    if ((m = l.match(/^[-*]\s+(.*)/)) || (m = l.match(/^\d+[.)]\s+(.*)/))) {
      const t = /^\d/.test(l) ? 'ol' : 'ul';
      if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
      if (!list || list.t !== t) { if (list) flush(); list = { t, items: [] }; }
      list.items.push(m[1]); continue;
    }
    if (list) flush();
    para.push(l.trim());
  }
  flush();
  return out.join('\n');
}

// ---------- Tipsters (ένα αρχείο .md ανά tipster στον φάκελο tipsters/)
// Γραμμή επιλογής:  αγωνιστική | ΓΗΠ-ΦΙΛ | επιλογή | απόδοση (προαιρετική)
// Επιλογές: 1, 2, 1 -5.5, 2 +7.5, over 160.5, under 160.5
const PROP_STATS = { 'πόντοι': 'pts', 'ποντοι': 'pts', 'πόντους': 'pts', 'pts': 'pts', 'points': 'pts', 'ριμπάουντ': 'reb', 'ριμπαουντ': 'reb', 'reb': 'reb', 'rebounds': 'reb',
  'ασίστ': 'ast', 'ασιστ': 'ast', 'ast': 'ast', 'assists': 'ast', 'τρίποντα': '3pm', 'τριποντα': '3pm', '3pm': '3pm', 'pir': 'pir' };
const PROP_LABEL = { el: { pts: 'πόντοι', reb: 'ριμπάουντ', ast: 'ασίστ', '3pm': 'τρίποντα', pir: 'PIR' }, en: { pts: 'points', reb: 'rebounds', ast: 'assists', '3pm': '3-pointers', pir: 'PIR' }, es: { pts: 'puntos', reb: 'rebotes', ast: 'asistencias', '3pm': 'triples', pir: 'PIR' }, sr: { pts: 'poena', reb: 'skokova', ast: 'asistencija', '3pm': 'trojki', pir: 'PIR' } };
const propValue = (stat, r) => stat === 'pts' ? r[8] : stat === 'reb' ? r[15] + r[16] : stat === 'ast' ? r[17] : stat === '3pm' ? r[11] : r[25];
function parsePick(sel) {
  const s = sel.trim().toLowerCase().replace(',', '.');
  let m;
  // ατομικά: "Norris πόντοι 10+", "Norris πόντοι over 9.5", "Miles Norris ριμπάουντ under 4.5"
  if ((m = s.match(/^(.+?)\s+(\S+)\s+(\d+)\s*\+$/)) && PROP_STATS[m[2]]) return { kind: 'prop', who: m[1], stat: PROP_STATS[m[2]], min: +m[3] };
  if ((m = s.match(/^(.+?)\s+(\S+)\s+(over|under|o|u|πάνω|πανω|κάτω|κατω)\s*(\d+(?:\.\d+)?)$/)) && PROP_STATS[m[2]])
    return { kind: 'prop', who: m[1], stat: PROP_STATS[m[2]], over: /^(over|o|πάνω|πανω)$/.test(m[3]), line: parseFloat(m[4]) };
  if (/^[12]$/.test(s)) return { kind: 'ml', side: +s };
  if ((m = s.match(/^([12])\s*([+-]\s*\d+(?:\.\d+)?)$/))) return { kind: 'hc', side: +m[1], line: parseFloat(m[2].replace(/\s/g, '')) };
  if ((m = s.match(/^(over|under|o|u|πάνω|πανω|κάτω|κατω)\s*(\d+(?:\.\d+)?)$/))) return { kind: 'tot', over: /^(over|o|πάνω|πανω)$/.test(m[1]), line: parseFloat(m[2]) };
  return null;
}
function pickLabel(p, h, a, lg) {
  const tn = c => (TEAMS[c] ? TEAMS[c][TEAM_IDX[lg][0]] : c), L = PROP_LABEL[lg];
  if (p.kind === 'prop') return p.min != null ? `${p.name} ${p.min}+ ${L[p.stat]}` : `${p.name} ${p.over ? 'over' : 'under'} ${p.line} ${L[p.stat]}`;
  if (p.kind === 'ml') return { el: `Νίκη ${tn(p.side === 1 ? h : a)}`, en: `${tn(p.side === 1 ? h : a)} to win`, es: `Gana ${tn(p.side === 1 ? h : a)}`, sr: `Pobeda: ${tn(p.side === 1 ? h : a)}` }[lg];
  if (p.kind === 'hc') return `${tn(p.side === 1 ? h : a)} ${p.line > 0 ? '+' : ''}${p.line}`;
  return `${p.over ? 'Over' : 'Under'} ${p.line} ${{ el: 'πόντοι', en: 'points', es: 'puntos', sr: 'poena' }[lg]}`;
}
function gradePick(p, hs, as) {
  let v;
  if (p.kind === 'ml') v = p.side === 1 ? hs - as : as - hs;
  else if (p.kind === 'hc') v = (p.side === 1 ? hs - as : as - hs) + p.line;
  else v = p.over ? hs + as - p.line : p.line - (hs + as);
  return v > 0 ? 'W' : v < 0 ? 'L' : 'P';
}
// ---- Τραυματίες: χειροκίνητη λίστα (traumaties.md) + αυτόματος εντοπισμός απουσιών
async function loadInjuries(players, games) {
  const out = { el: {}, en: {}, es: {}, sr: {} };
  const done = games.filter(g => g[6]);
  // αυτόματα: έλειψε από τους 2+ τελευταίους αγώνες της ομάδας του, ενώ έπαιζε κανονικά
  for (const p of players) {
    if (p.t.includes(';')) continue;
    const pl = p.g.filter(r => r[7] > 0);
    if (pl.length < 3 || pl.reduce((s, r) => s + r[7], 0) / pl.length < 600) continue;
    const have = new Set(pl.map(r => r[0]));
    const tg = done.filter(g => g[2] === p.t || g[3] === p.t).sort((a, b) => a[0] - b[0]);
    let miss = 0; for (let i = tg.length - 1; i >= 0 && !have.has(tg[i][0]); i--) miss++;
    if (miss < 2) continue;
    const srN = miss >= 5 ? `poslednjih ${miss} utakmica` : `poslednje ${miss} utakmice`;
    out.el[p.c] = { m: 0, t: `Δεν έχει αγωνιστεί στους τελευταίους ${miss} αγώνες της ομάδας του` };
    out.en[p.c] = { m: 0, t: `Has missed his team's last ${miss} games` };
    out.es[p.c] = { m: 0, t: `Se ha perdido los últimos ${miss} partidos de su equipo` };
    out.sr[p.c] = { m: 0, t: `Propustio je ${srN} svog tima` };
  }
  // χειροκίνητα: ημερομηνία | παίκτης | ομάδα | επιστροφή | ελληνικά | english | español | srpski
  let txt = '';
  try { txt = await fs.readFile(path.join(ROOT, 'traumaties.md'), 'utf8'); } catch { }
  const today = new Date().toISOString().slice(0, 10);
  const MON = { el: 'el-GR', en: 'en-GB', es: 'es-ES', sr: 'sr-Latn-RS' };
  const fmtRet = (r, lg) => {
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(r)) return r;
    const d = new Date(r.length === 7 ? r + '-15' : r);
    return d.toLocaleDateString(MON[lg], r.length === 7 ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' });
  };
  const LBL = { el: ['Τραυματίας', 'Επιστροφή'], en: ['Injured', 'Expected back'], es: ['Lesionado', 'Regreso previsto'], sr: ['Povređen', 'Očekivani povratak'] };
  for (const line of txt.split(/\r?\n/)) {
    if (!/^\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line)) continue;
    const [date, who, team, ret, ...notes] = line.split('|').map(s => s.trim());
    const key = who.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const p = players.find(x => x.t.split(';').pop() === team.toUpperCase() && x.n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().includes(key));
    if (!p) { console.warn('Τραυματίες: δεν βρέθηκε ο παίκτης', who, team); continue; }
    if (p.g.some(r => r[7] > 0 && r[1] > date)) { console.log('Τραυματίες: ο', who, 'έχει ξαναπαίξει, αγνοείται'); continue; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(ret) && ret < today && !out.el[p.c]) continue;
    ['el', 'en', 'es', 'sr'].forEach((lg, i) => {
      const note = notes[i] || '';
      const r = ret && ret !== '-' ? ` · ${LBL[lg][1]}: ${fmtRet(ret, lg)}` : '';
      out[lg][p.c] = { m: 1, t: `${LBL[lg][0]}${note ? ': ' + note : ''}${r}` };
    });
  }
  console.log('Τραυματίες/απόντες:', Object.keys(out.el).length);
  return out;
}

async function loadTipsters(games, players) {
  const dir = path.join(ROOT, 'tipsters');
  let files = [];
  try { files = (await fs.readdir(dir)).filter(f => f.endsWith('.md') && !f.startsWith('_')); } catch { return []; }
  const out = [];
  for (const f of files) {
    const txt = await fs.readFile(path.join(dir, f), 'utf8');
    const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const meta = {}; let body = txt;
    if (m) { body = m[2]; for (const line of m[1].split(/\r?\n/)) { const k = line.match(/^(\w+):\s*(.*)$/); if (k) meta[k[1]] = k[2].replace(/^["']|["']$/g, '').trim(); } }
    const name = meta.name || f.replace(/\.md$/, '');
    const slug = meta.slug || slugify(name) || slugify(f.replace(/\.md$/, ''));
    const picks = [], errors = [];
    let cur = null; // η τελευταία επιλογή: οι γραμμές κειμένου από κάτω της είναι η ανάλυσή της
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith('#')) continue;
      // «EN:» ή «ES:» σε δική του γραμμή (ή στην αρχή γραμμής): από εκεί και κάτω η ανάλυση σε αυτή τη γλώσσα
      const lm = line.match(/^(EN|English|ES|Español|Espanol|SR|Srpski)\s*:\s*(.*)$/i);
      if (lm && cur) { cur.lang = /^e(n|nglish)$/i.test(lm[1]) ? 'en' : /^s(r|rpski)$/i.test(lm[1]) ? 'sr' : 'es'; if (lm[2]) cur.text[cur.lang].push(lm[2]); continue; }
      if (!line.includes('|')) { if (cur) cur.text[cur.lang].push(line); continue; }
      cur = null;
      const parts = line.split('|').map(x => x.trim());
      const round = parseInt(parts[0], 10);
      const gm = (parts[1] || '').toUpperCase().match(/^([A-Z]{3})\s*-\s*([A-Z]{3})$/);
      const p = parsePick(parts[2] || '');
      const odds = parts[3] ? parseFloat(parts[3].replace(',', '.')) : null;
      if (!round || !gm || !p) { errors.push(line + '  (δεν διαβάστηκε: έλεγξε τη μορφή)'); continue; }
      const [, h, a] = gm;
      const g = games.find(x => x[0] === round && x[2] === h && x[3] === a);
      let res = 'pending';
      if (p.kind === 'prop') {
        const words = p.who.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/);
        const cands = players.filter(x => [h, a].includes(x.t.split(';').pop()) || x.t.split(';').some(t => t === h || t === a))
          .filter(x => { const nm = x.n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return words.every(w => nm.includes(w)); });
        if (cands.length !== 1) { errors.push(line + (cands.length ? '  (βρέθηκαν πολλοί παίκτες με αυτό το όνομα: γράψε και το μικρό όνομα)' : '  (δεν βρέθηκε παίκτης με αυτό το όνομα στις δύο ομάδες)')); continue; }
        p.player = cands[0]; p.name = niceName(cands[0].n);
      }
      if (!g) { res = 'unknown'; errors.push(line + '  (δεν βρέθηκε αυτός ο αγώνας σε αυτή την αγωνιστική: έλεγξε ποιος είναι γηπεδούχος)'); }
      else if (g[6] && p.kind === 'prop') {
        const row = p.player.g.find(r => r[0] === round && r[7] > 0);
        if (!row) res = 'P'; // δεν αγωνίστηκε: η επιλογή ακυρώνεται
        else { const v = propValue(p.stat, row); const d = p.min != null ? v - p.min + 0.5 : (p.over ? v - p.line : p.line - v); res = d > 0 ? 'W' : d < 0 ? 'L' : 'P'; p.val = v; }
      }
      else if (g[6]) res = gradePick(p, g[4], g[5]);
      cur = { round, h, a, text: { el: [], en: [], es: [], sr: [] }, lang: 'el', label: Object.fromEntries(LANGS.map(lg => [lg, pickLabel(p, h, a, lg)])), odds: odds && odds > 1 ? odds : null, res,
        score: g && g[6] ? `${g[4]}-${g[5]}` : '', val: p.kind === 'prop' && p.val != null ? p.val : null, stat: p.stat, date: g ? g[1] : '' };
      picks.push(cur);
    }
    picks.forEach((x, i) => {
      x.id = `${x.round}-${x.h}-${x.a}-${i + 1}`.toLowerCase();
      x.url = Object.fromEntries(LANGS.map(lg => [lg, BASE + (lg === 'el' ? '' : lg + '/') + 'tipsters/' + slug + '/' + x.id + '/']));
      x.html = {}; x.excerpt = {};
      for (const lg of LANGS) {
        const tx = x.text[lg];
        x.html[lg] = tx.join('\n').trim() ? markdown(tx.join('\n')) : '';
        x.excerpt[lg] = tx.filter(Boolean).join(' ').replace(/[*#>\[\]]/g, '').slice(0, 155);
      }
      delete x.text; delete x.lang;
    });
    if (errors.length) console.warn(`Tipster ${name}: ${errors.length} γραμμές με πρόβλημα:`, errors);
    const settled = picks.filter(x => x.res === 'W' || x.res === 'L');
    const W = settled.filter(x => x.res === 'W').length, L = settled.length - W;
    const withOdds = picks.filter(x => x.odds && (x.res === 'W' || x.res === 'L' || x.res === 'P'));
    const units = withOdds.reduce((s, x) => s + (x.res === 'W' ? x.odds - 1 : x.res === 'L' ? -1 : 0), 0);
    const staked = withOdds.filter(x => x.res !== 'P').length;
    picks.sort((x, y) => y.round - x.round || (y.date || '').localeCompare(x.date || ''));
    out.push({ name, slug, bio: meta.bio || '', bioEn: meta.bio_en || '', bioEs: meta.bio_es || '', bioSr: meta.bio_sr || '', picks, W, L, P: picks.filter(x => x.res === 'P').length,
      pending: picks.filter(x => x.res === 'pending').length, pct: settled.length ? W / settled.length : null,
      units, roi: staked ? units / staked : null, form: picks.filter(x => x.res === 'W' || x.res === 'L').slice(0, 5).map(x => x.res).join('') });
  }
  return out.sort((x, y) => (y.units - x.units) || ((y.pct ?? -1) - (x.pct ?? -1)));
}

async function loadArticles() {
  const dir = path.join(ROOT, 'articles');
  let files = [];
  try { files = (await fs.readdir(dir)).filter(f => f.endsWith('.md') && !f.startsWith('_')); } catch { return []; }
  const list = [];
  for (const f of files) {
    const txt = await fs.readFile(path.join(dir, f), 'utf8');
    const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const meta = {}; let body = txt;
    if (m) { body = m[2]; for (const line of m[1].split(/\r?\n/)) { const k = line.match(/^(\w+):\s*(.*)$/); if (k) meta[k[1]] = k[2].replace(/^["']|["']$/g, '').trim(); } }
    if (!meta.title || meta.draft === 'true') continue;
    // οι μεταφράσεις (προαιρετικές) μπαίνουν κάτω από τις γραμμές === English ===, === Español === και === Srpski ===
    const parts = body.split(/^\s*={3,}\s*(english|en|español|espanol|es|srpski|sr)\s*={3,}\s*$/im);
    const bodyEl = parts[0], bodies = {};
    for (let k = 1; k < parts.length; k += 2) bodies[/^e(n|nglish)$/i.test(parts[k]) ? 'en' : /^s(r|rpski)$/i.test(parts[k]) ? 'sr' : 'es'] = parts[k + 1];
    const bodyEn = bodies.en;
    const slug = meta.slug || slugify(meta.title) || slugify(f.replace(/\.md$/, ''));
    const date = meta.date || '';
    const dateOf = loc => (date ? new Date(date + 'T12:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
    const a = { type: meta.type === 'prognostiko' ? 'prognostiko' : 'arthro', round: meta.round ? +meta.round : null, game: (meta.game || '').toUpperCase(), author: meta.author || '', date,
      el: { title: meta.title, desc: meta.description || '', slug, dateText: dateOf('el-GR'), url: BASE + 'arthra/' + slug + '/', html: markdown(bodyEl) } };
    if (meta.title_en && bodyEn && bodyEn.trim()) {
      const se = meta.slug_en || slugify(meta.title_en) || slug;
      a.en = { title: meta.title_en, desc: meta.description_en || '', slug: se, dateText: dateOf('en-GB'), url: BASE + 'en/articles/' + se + '/', html: markdown(bodyEn) };
    }
    if (meta.title_es && bodies.es && bodies.es.trim()) {
      const ss = meta.slug_es || slugify(meta.title_es) || slug;
      a.es = { title: meta.title_es, desc: meta.description_es || '', slug: ss, dateText: dateOf('es-ES'), url: BASE + 'es/articulos/' + ss + '/', html: markdown(bodies.es) };
    }
    if (meta.title_sr && bodies.sr && bodies.sr.trim()) {
      const sv = meta.slug_sr || slugify(meta.title_sr) || slug;
      a.sr = { title: meta.title_sr, desc: meta.description_sr || '', slug: sv, dateText: dateOf('sr-Latn-RS'), url: BASE + 'sr/clanci/' + sv + '/', html: markdown(bodies.sr) };
    }
    list.push(a);
  }
  return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// ---------- λήψη δεδομένων από τα δημόσια feeds της Ευρωλίγκας
async function fetchAll() {
  const q = `seasonMode=Single&seasonCode=${SEASON}&limit=500`;
  const [trad, adv, misc, gamesRes] = await Promise.all([
    get(`${FEED}/v3/competitions/E/statistics/players/traditional?${q}&statisticMode=PerGame`),
    get(`${FEED}/v3/competitions/E/statistics/players/advanced?${q}&statisticMode=PerGame`),
    get(`${FEED}/v3/competitions/E/statistics/players/misc?${q}&statisticMode=PerGame`),
    get(`${FEED}/v2/competitions/E/seasons/${SEASON}/games?limit=500`),
  ]);
  const advM = Object.fromEntries((adv?.players || []).map(p => [p.player.code, p]));
  const miscM = Object.fromEntries((misc?.players || []).map(p => [p.player.code, p]));
  const list = trad?.players || [];
  console.log(`Παίκτες: ${list.length}. Λήψη αγώνων ανά παίκτη…`);

  const players = (await pool(list, 8, async p => {
    const c = p.player.code, tc = p.player.team.code;
    const [bio, st] = await Promise.all([
      get(`${FEED}/v2/competitions/E/seasons/${SEASON}/people/${c}`).catch(() => null),
      get(`${FEED}/v2/competitions/E/seasons/${SEASON}/people/${c}/stats`),
    ]);
    if (!st) return null;
    const b = bio?.data?.find(x => x.type === 'J') || bio?.data?.[0];
    const per = b?.person || {};
    const g = (st.games || []).filter(x => x.game.played).map(x => {
      const G = x.game, s = x.stats;
      const home = G.local.club.code === tc; const me = home ? G.local : G.road, op = home ? G.road : G.local;
      return [G.round, G.utcDate.slice(0, 10), op.club.code, home ? 1 : 0, me.score, op.score, s.startFive ? 1 : 0, Math.round(s.timePlayed || 0),
        s.points, s.fieldGoalsMade2, s.fieldGoalsAttempted2, s.fieldGoalsMade3, s.fieldGoalsAttempted3, s.freeThrowsMade, s.freeThrowsAttempted,
        s.offensiveRebounds, s.defensiveRebounds, s.assistances, s.steals, s.turnovers, s.blocksFavour, s.blocksAgainst,
        s.foulsCommited, s.foulsReceived, s.plusMinus, s.valuation].map(v => (v == null ? 0 : v));
    });
    const a = advM[c] || {}, m = miscM[c] || {};
    return { c, n: p.player.name, t: tc, age: p.player.age, h: per.height || null, w: per.weight || null,
      bd: (per.birthDate || '').slice(0, 10), ct: per.country?.name || '', pos: b?.positionName || '', no: b?.dorsal || '',
      poss: a.possesions || 0, dd: m.doubleDoubles || 0, td: m.tripleDoubles || 0, g };
  })).filter(Boolean);

  const games = (gamesRes?.data || []).map(x => {
    const d = x.date; // 2026-11-04T19:45:00.000Z
    const enc = d.slice(5, 7) + d.slice(8, 10) + d.slice(11, 13) + d.slice(14, 16) + d.slice(3, 4);
    return [x.round.round, enc, x.home.code, x.away.code, x.home.score, x.away.score, x.status === 'result' ? 1 : 0];
  }).sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));

  const playedRounds = games.filter(g => g[6]).map(g => g[0]);
  const lastRound = playedRounds.length ? Math.max(...playedRounds) : 0;
  let stand = [];
  if (lastRound) {
    const st = await get(`${FEED}/v3/competitions/E/seasons/${SEASON}/rounds/${lastRound}/basicstandings`);
    stand = (st?.teams || []).map(t => [t.position, t.club.code, t.gamesWon, t.gamesLost, t.pointsFor, t.pointsAgainst,
      t.homeRecord, t.awayRecord, (t.last5Form || []).join(''), t.positionChange]);
  }
  return { players, league: { stand, games }, lastRound, fetchedAt: new Date().toISOString() };
}

// ---------- σελίδες
// μοντέλο ομάδων (ίδιο με του app): αποδόσεις ανά 100 κατοχές από τα ατομικά στατιστικά, μόνο αγώνες πριν από την αγωνιστική maxRound
function teamModel(players, maxRound = Infinity) {
  const TG = {};
  for (const p of players) {
    if (p.t.includes(';')) continue;
    for (const r of p.g) {
      if (!(r[7] > 0) || r[0] >= maxRound) continue;
      const k = p.t + '|' + r[0], a = TG[k] || (TG[k] = { team: p.t, opp: r[2], round: r[0], s: new Array(26).fill(0) });
      for (let i = 7; i < 26; i++) a.s[i] += r[i];
    }
  }
  const TS = {};
  for (const g of Object.values(TG)) {
    const T = TS[g.team] || (TS[g.team] = { g: 0, s: new Array(26).fill(0), o: new Array(26).fill(0) });
    T.g++; for (let i = 7; i < 26; i++) T.s[i] += g.s[i];
    const O = TG[g.opp + '|' + g.round]; if (O) for (let i = 7; i < 26; i++) T.o[i] += O.s[i];
  }
  for (const T of Object.values(TS)) {
    const s = T.s, o = T.o, fga = s[10] + s[12], ofga = o[10] + o[12];
    const poss = fga - s[15] + s[19] + 0.44 * s[14], oposs = ofga - o[15] + o[19] + 0.44 * o[14], pp = (poss + oposs) / 2 || 1;
    Object.assign(T, { ortg: s[8] / pp * 100, drtg: o[8] / pp * 100, pace: pp / (T.g || 1) });
  }
  const ncdf = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2); const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - q : q; };
  const predict = (h, a) => { const H = TS[h], A = TS[a]; if (!H || !A || H.g < 2 || A.g < 2) return null; const pace = (H.pace + A.pace) / 2;
    const ph = pace * ((H.ortg + A.drtg) / 2) / 100 + 1.5, pa = pace * ((A.ortg + H.drtg) / 2) / 100 - 1.5; return { ph, pa, prob: ncdf((ph - pa) / 11) }; };
  return { TS, predict };
}

// ---------- βίντεο YouTube: επίσημα highlights της EuroLeague και βίντεο από τα κανάλια των ομάδων
// Τα κανάλια των ομάδων: κωδικός ομάδας → channel id (άδειο = χωρίς κανάλι)
const YT_EL = 'UCGr3nR_XH9r6E5b09ZJAT9w';
const YT_TEAMS = {
  OLY: 'UCbv8oofgvLZ1B24N6uJ9q6g', PAN: 'UCbGAOY8tnarNw6T0pHghleg', MAD: 'UC9V4YMznqy74Ve2cW0KCg6w', RED: 'UC6_AhH45NQbI_xrOja3tvTw',
  ZAL: 'UCTonHhrZgVHg8HCMFcQvtEA', PAR: 'UCin-zbw5U0ctNtJCZ96XmFQ', DUB: 'UC5JolBYuLAhWVwL9S6Yen7A', HTA: 'UC_NezmJH4nzURv6TSvOarEA',
  TEL: 'UCqxNoI856R_vgs7aQolQhlg', MIL: 'UC-74Lw-UoS1UG7MLsA5VcTQ', MUN: 'UCqxyVk5fkD0YAUegb9RM-8A', VIR: 'UClnH9ZiMMlFT87VJ-u6QnuQ',
  ASV: 'UCI1Q8wU2aWLmy0yaPWwx48w', BAS: 'UCrkn0dyOSygXOzTwiOKBs8Q', BES: 'UC_8yYXxUvUC42NAsSmmAtjg', PAM: 'UCZ-tD6rRgBIzasAjC5tf9oA',
  IST: 'UCNgZ4KBDtA7Z-Jgf-geLLVg', BAR: '', ULK: '', PRS: '',
};
const VIDEO_ALIAS = {
  OLY: ['olympiacos', 'olympiakos', 'olimpijakos', 'ολυμπιακ'], PAN: ['panathinaikos', 'παναθηναικ'], MAD: ['real madrid', 'ρεαλ'], BAR: ['barcelona', 'barca', 'μπαρτσελον'],
  ULK: ['fenerbahce', 'φενερ'], IST: ['anadolu efes', 'efes', 'εφες'], RED: ['crvena zvezda', 'zvezda', 'ερυθρ'], PAR: ['partizan', 'παρτιζαν'],
  ZAL: ['zalgiris', 'ζαλγκιρ'], TEL: ['maccabi', 'makabi', 'μακαμπι', 'מכבי'], HTA: ['hapoel', 'χαποελ', 'הפועל'], DUB: ['dubai', 'ντουμπαι'],
  MUN: ['bayern', 'μπαγερν'], MIL: ['olimpia milan', 'milano', 'milan', 'μιλανο'], VIR: ['virtus', 'bologna', 'μπολονι'], PAM: ['valencia', 'βαλενθια'],
  BAS: ['baskonia', 'μπασκονι'], ASV: ['asvel', 'villeurbanne', 'βιλερμπαν'], PRS: ['paris basketball', 'paris', 'παρι'], BES: ['besiktas', 'μπεσικτα'],
};
const normTxt = x => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ').replace(/ş/g, 's').replace(/ç/g, 'c');
const decXml = x => x.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const gameDate = w => new Date(Date.UTC(2020 + (+w[8]), +w.slice(0, 2) - 1, +w.slice(2, 4), +w.slice(4, 6), +w.slice(6, 8)));
async function ytFetch(url) {
  try {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 15000);
    const r = await fetch(url, { signal: c.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; BasketballStatsBot/1.0)', 'accept-language': 'en' } });
    clearTimeout(t); return r.ok ? await r.text() : null;
  } catch { return null; }
}
const parseFeed = xml => [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => ({ id: (m[1].match(/<yt:videoId>([^<]+)/) || [])[1], t: decXml((m[1].match(/<title>([^<]*)/) || [])[1] || ''), d: (m[1].match(/<published>([^<]+)/) || [])[1] || '' })).filter(v => v.id);
function parseSearch(html) {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s); if (!m) return [];
  let d; try { d = JSON.parse(m[1]); } catch { return []; }
  const out = []; (function w(o) { if (!o || typeof o !== 'object') return; if (o.videoRenderer) { out.push({ id: o.videoRenderer.videoId, t: (o.videoRenderer.title.runs || []).map(x => x.text).join('') }); return; } for (const k in o) w(o[k]); })(d);
  return out;
}
function teamOfText(part) { const n = normTxt(part); let best = null, bl = 0; for (const [c, al] of Object.entries(VIDEO_ALIAS)) for (const a of al) if (n.includes(a) && a.length > bl) { best = c; bl = a.length; } return best; }
// «Olympiacos - Armani Olimpia Milan | R9 Basketball Highlights 2026-27» → «9|OLY|MIL»
function matchHighlight(title, games) {
  const p = title.split('|').map(x => x.trim()), i = p.findIndex(x => /^R\d+\b.*highlights/i.test(x) && x.includes(SEASON_LABEL));
  if (i < 1) return null;
  const r = +p[i].match(/^R(\d+)/)[1], [hp, ap] = p[i - 1].split(/\s[-–]\s/);
  if (!ap) return null;
  const h = teamOfText(hp), a = teamOfText(ap);
  return games.some(g => g[0] === r && g[2] === h && g[3] === a) ? `${r}|${h}|${a}` : null;
}
async function updateVideos(V, games, online) {
  V.hl = V.hl || {}; V.team = V.team || {};
  try { const seed = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'videos.json'), 'utf8')); for (const [k, v] of Object.entries(seed.hl || {})) if (!V.hl[k]) V.hl[k] = v; } catch { }
  if (!online) return;
  const cand = [], feed = await ytFetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${YT_EL}`);
  if (feed) cand.push(...parseFeed(feed));
  const last = Math.max(0, ...games.filter(g => g[6]).map(g => g[0]));
  for (const r of [last, last - 1].filter(x => x > 0)) {
    const html = await ytFetch(`https://www.youtube.com/@euroleague/search?query=${encodeURIComponent(`R${r} Basketball Highlights ${SEASON_LABEL}`)}`);
    if (html) cand.push(...parseSearch(html));
  }
  let n = 0;
  for (const v of cand) { const k = matchHighlight(v.t, games); if (k && !V.hl[k]) { V.hl[k] = { id: v.id, t: v.t }; n++; } }
  let tn = 0;
  for (const [c, id] of Object.entries(YT_TEAMS)) {
    if (!id) continue;
    const x = await ytFetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`); if (!x) continue;
    const list = parseFeed(x), have = new Set(list.map(v => v.id));
    V.team[c] = list.concat((V.team[c] || []).filter(v => !have.has(v.id))).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 40); tn++;
  }
  console.log(`Βίντεο: ${Object.keys(V.hl).length} highlights (${n} νέα), κανάλια ομάδων: ${tn}`);
}
// βίντεο από τα κανάλια των δύο ομάδων για έναν αγώνα: δημοσιευμένα από την ώρα του αγώνα έως 3 μέρες μετά και με τον αντίπαλο στον τίτλο
function teamVideosFor(V, g) {
  const start = gameDate(g[1]).getTime(), out = [];
  for (const [c, o] of [[g[2], g[3]], [g[3], g[2]]]) {
    const al = VIDEO_ALIAS[o] || [];
    const vs = (V.team[c] || []).filter(v => { const t = Date.parse(v.d); return t >= start - 3 * 3600e3 && t <= start + 72 * 3600e3 && al.some(a => normTxt(v.t).includes(a)); });
    vs.sort((a, b) => (/highlight|στιγμιοτυπ|resumen|sintesi|tarifa|תקציר|snimak|najbolji/i.test(b.t) ? 1 : 0) - (/highlight|στιγμιοτυπ|resumen|sintesi|tarifa|תקציר|snimak|najbolji/i.test(a.t) ? 1 : 0));
    out.push(...vs.slice(0, 2).map(v => ({ ...v, c })));
  }
  return out;
}

function playerSummary(p) {
  const g = p.g.filter(r => r[7] > 0); const G = g.length || 1;
  const sum = i => g.reduce((s, r) => s + r[i], 0);
  return { G: g.length, pts: sum(8) / G, reb: (sum(15) + sum(16)) / G, ast: sum(17) / G, pir: sum(25) / G };
}

async function main() {
  let data;
  if (!OFFLINE) {
    try { data = await fetchAll(); }
    catch (e) { console.error('Η λήψη απέτυχε, χρησιμοποιώ τα αποθηκευμένα δεδομένα.', e.message); }
  }
  const fresh = !!(data && data.players.length);
  let oldVideos = null;
  try { oldVideos = JSON.parse(await fs.readFile(CACHE, 'utf8')).videos || null; } catch { }
  if (!fresh) {
    data = JSON.parse(await fs.readFile(CACHE, 'utf8'));
    console.log('Χρήση αποθηκευμένων δεδομένων από', data.fetchedAt);
  }
  data.videos = data.videos || oldVideos || { hl: {}, team: {} };
  await updateVideos(data.videos, data.league.games, !OFFLINE);
  await fs.mkdir(path.dirname(CACHE), { recursive: true });
  await fs.writeFile(CACHE, JSON.stringify(data));
  const VIDS = data.videos;
  const { players, league } = data;
  const lastRound = data.lastRound || Math.max(0, ...league.games.filter(g => g[6]).map(g => g[0]));

  // slugs παικτών (μοναδικά, ίδια και στις δύο γλώσσες)
  const used = new Set();
  for (const p of players) {
    let s = slugify(niceName(p.n)) || p.c;
    if (used.has(s)) s += '-' + p.c;
    used.add(s); p.s = s;
  }
  const athens = new Date(data.fetchedAt).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'numeric', year: 'numeric' });
  const athensEn = new Date(data.fetchedAt).toLocaleDateString('en-GB', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', year: 'numeric' });
  const athensEs = new Date(data.fetchedAt).toLocaleDateString('es-ES', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', year: 'numeric' });
  const athensSr = new Date(data.fetchedAt).toLocaleDateString('sr-Latn-RS', { timeZone: 'Europe/Athens', day: 'numeric', month: 'numeric', year: 'numeric' });
  const UPD = { el: `${athens} · έως και την ${lastRound}η αγωνιστική`, en: `${athensEn} · through Round ${lastRound}`, es: `${athensEs} · hasta la jornada ${lastRound}`, sr: `${athensSr} · zaključno sa ${lastRound}. kolom` };

  // καθαρισμός και αρχεία
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, 'assets'), { recursive: true });
  const articles = await loadArticles();
  const tipsters = await loadTipsters(league.games, players);
  const INJ = await loadInjuries(players, league.games);
  const INJL = { el: 'Εκτός (τραυματίες ή απόντες):', en: 'Out (injured or absent):', es: 'Bajas (lesionados o ausentes):', sr: 'Van terena (povređeni ili odsutni):' };
  const pendingTips = lg => tipsters.flatMap(t => t.picks.filter(p => p.res === 'pending').map(p => ({ g: p.h + '-' + p.a, r: p.round, n: t.name, s: t.slug, l: p.label[lg], u: p.url[lg] })));
  const artList = lg => articles.filter(a => a[lg]).map(a => ({ title: a[lg].title, desc: a[lg].desc, type: a.type, round: a.round, game: a.game, author: a.author, date: a.date, dateText: a[lg].dateText, slug: a[lg].slug, url: a[lg].url }));
  await fs.writeFile(path.join(OUT, 'assets', 'data.json'), JSON.stringify({ updated: UPD.el, teams: TEAMS, players, league,
    vid: { hl: Object.fromEntries(Object.entries(VIDS.hl).map(([k, v]) => [k, v.id])), team: Object.fromEntries(Object.entries(VIDS.team).map(([c, l]) => [c, l.slice(0, 6).map(v => ({ id: v.id, t: v.t }))])), ch: YT_TEAMS },
    articles: artList('el'), tips: pendingTips('el'), inj: INJ.el, injL: INJL.el, ui: UI.el,
    en: { updated: UPD.en, articles: artList('en'), tips: pendingTips('en'), inj: INJ.en, injL: INJL.en, ui: UI.en },
    es: { updated: UPD.es, articles: artList('es'), tips: pendingTips('es'), inj: INJ.es, injL: INJL.es, ui: UI.es },
    sr: { updated: UPD.sr, articles: artList('sr'), tips: pendingTips('sr'), inj: INJ.sr, injL: INJL.sr, ui: UI.sr } }));
  const appSrc = await fs.readFile(path.join(ROOT, 'src', 'app.js'), 'utf8');
  await fs.writeFile(path.join(OUT, 'assets', 'app.js'), appSrc);
  await fs.writeFile(path.join(OUT, 'assets', 'app.en.js'), translate(appSrc, APP_CODE, 'app.js (en)'));
  await fs.writeFile(path.join(OUT, 'assets', 'app.es.js'), translate(appSrc, ES.APP_CODE, 'app.js (es)', ES.PHRASES));
  await fs.writeFile(path.join(OUT, 'assets', 'app.sr.js'), translate(appSrc, SR.APP_CODE, 'app.js (sr)', SR.PHRASES));
  await fs.copyFile(path.join(ROOT, 'src', 'app.css'), path.join(OUT, 'assets', 'app.css'));
  const shellSrc = await fs.readFile(path.join(ROOT, 'src', 'shell.html'), 'utf8');
  const SHELL = { el: shellSrc, en: translate(shellSrc, SHELL_CODE, 'shell.html (en)'), es: translate(shellSrc, ES.SHELL_CODE, 'shell.html (es)', ES.PHRASES), sr: translate(shellSrc, SR.SHELL_CODE, 'shell.html (sr)', SR.PHRASES) };
  const ver = Date.now().toString(36);

  // ---- διευθύνσεις: κάθε σελίδα έχει ένα κλειδί και μία διεύθυνση ανά γλώσσα
  const B = lg => (lg === 'el' ? BASE : BASE + lg + '/');
  const artBySlug = Object.fromEntries(articles.map(a => [a.el.slug, a]));
  function urlFor(lg, key) {
    const [k, v] = key.split(':');
    const P = PATHS[lg];
    if (k === 'home') return B(lg);
    if (k === 'team') return B(lg) + P.team + '/' + TEAMS[v][TEAM_IDX[lg][1]] + '/';
    if (k === 'player') return B(lg) + P.player + '/' + v + '/';
    if (k === 'article') { const a = artBySlug[v]; return a && a[lg] ? a[lg].url : null; }
    if (k === 'tipster') return B(lg) + 'tipsters/' + v + '/';
    if (k === 'recap') return B(lg) + P.articles + '/' + ({ el: `agonistiki-${v}-se-arithmous`, en: `round-${v}-in-numbers`, es: `jornada-${v}-en-cifras`, sr: `${v}-kolo-u-brojkama` })[lg] + '/';
    if (k === 'widget') return B(lg) + 'widget/' + ({ el: { st: 'vathmologia', rd: 'agonistiki' }, en: { st: 'standings', rd: 'round' }, es: { st: 'clasificacion', rd: 'jornada' }, sr: { st: 'tabela', rd: 'kolo' } })[lg][v] + '/';
    if (k === 'game') { const [r, h, a] = v.split('|'); const si = TEAM_IDX[lg][1]; return B(lg) + P.game + '/' + TEAMS[h][si] + '-' + TEAMS[a][si] + '-' + r + '/'; }
    if (k === 'pick') return B(lg) + 'tipsters/' + v + '/';
    return B(lg) + P[k] + '/';
  }

  const urls = [];
  const adUnit = lg => (AD_CLIENT && AD_SLOT)
    ? `<div class="wrap adwrap"><span class="adlabel">${{ el: 'Διαφήμιση', en: 'Advertisement', es: 'Publicidad', sr: 'Reklama' }[lg]}</span><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(AD_CLIENT)}" data-ad-slot="${esc(AD_SLOT)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`
    : '';
  const adHead = AD_CLIENT ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(AD_CLIENT)}" crossorigin="anonymous"></script>\n` : '';

  // ---- εφαρμογή (PWA): εικονίδια, manifest ανά γλώσσα, service worker
  for (const f of await fs.readdir(path.join(ROOT, 'src'))) if (/\.(png|svg)$/.test(f) || /^google[0-9a-f]+\.html$/.test(f)) await fs.copyFile(path.join(ROOT, 'src', f), path.join(OUT, f));
  for (const lg of LANGS) {
    const T = (el, en, es, sr) => ({ el, en, es, sr })[lg];
    await fs.mkdir(path.join(OUT, lg === 'el' ? '' : lg), { recursive: true });
    await fs.writeFile(path.join(OUT, lg === 'el' ? '' : lg, 'manifest.webmanifest'), JSON.stringify({
      name: T(`${SITE_NAME}: στατιστικά EuroLeague`, `${SITE_NAME}: EuroLeague stats`, `${SITE_NAME}: estadísticas de la EuroLeague`, `${SITE_NAME}: statistika Evrolige`), short_name: SITE_NAME, lang: lg, dir: 'ltr',
      description: T('Βαθμολογία, στατιστικά παικτών και ομάδων, Θερμόμετρο φόρμας, Fantasy και προγνωστικά EuroLeague στα ελληνικά.',
        'EuroLeague standings, player and team stats, form thermometer, Fantasy tips and predictions.', 'Clasificación, estadísticas de jugadores y equipos, termómetro de forma, consejos de Fantasy y pronósticos de la EuroLeague.', 'Tabela Evrolige, statistika igrača i timova, termometar forme, Fantasy saveti i prognoze.'),
      id: B(lg), start_url: B(lg) + '?source=app', scope: B(lg), display: 'standalone', orientation: 'portrait',
      background_color: '#1d2330', theme_color: '#1d2330', categories: ['sports'],
      icons: [
        { src: BASE + 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: BASE + 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: BASE + 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
      shortcuts: [
        { name: T('Βαθμολογία', 'Standings', 'Clasificación', 'Tabela'), url: B(lg) },
        { name: 'Fantasy', url: urlFor(lg, 'fantasy') },
        { name: T('Προγνωστικά', 'Predictions', 'Pronósticos', 'Prognoze'), url: urlFor(lg, 'preds') },
        { name: 'Tipsters', url: urlFor(lg, 'tipsters') }],
    }, null, 1));
  }
  // service worker: πρώτα δίκτυο (για φρέσκα στατιστικά), αν δεν υπάρχει σύνδεση η αποθηκευμένη έκδοση
  await fs.writeFile(path.join(OUT, 'sw.js'), `const C='bs-${ver}', OFF='${urlFor('el', 'app')}', OFF_EN='${urlFor('en', 'app')}', OFF_ES='${urlFor('es', 'app')}', OFF_SR='${urlFor('sr', 'app')}';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['${BASE}','${BASE}en/','${BASE}es/','${BASE}sr/',OFF,OFF_EN,OFF_ES,OFF_SR,'${BASE}assets/data.json','${BASE}icon-192.png'])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));}return res;})
    .catch(()=>caches.match(r,{ignoreSearch:u.pathname.endsWith('.css')||u.pathname.endsWith('.js')}).then(m=>m||(r.mode==='navigate'?caches.match(u.pathname.startsWith('${BASE}en/')?OFF_EN:u.pathname.startsWith('${BASE}es/')?OFF_ES:u.pathname.startsWith('${BASE}sr/')?OFF_SR:OFF):Response.error()))));});
`);
  const pwaStyle = `<style>.only-install{display:none}.can-install .only-install{display:inline-flex}
.appbox{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin:18px 0}
.appbox>div{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px}
.appbox h3{margin:0 0 8px;font-family:var(--display);font-size:20px}
.appbox ol{margin:0;padding-left:20px}.appbox li{margin:4px 0}
.appbtn{align-items:center;gap:8px;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:12px 18px;font:600 16px var(--body);cursor:pointer}
.ioshint{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:50;display:flex;gap:12px;align-items:center;background:#1d2330;color:#f3f1ec;border-radius:12px;padding:12px 10px 12px 12px;box-shadow:0 8px 28px rgba(0,0,0,.35);font-size:14px;line-height:1.35}
.ioshint img{width:42px;height:42px;border-radius:10px;flex:none;box-shadow:0 0 0 1px rgba(255,255,255,.2)}.ioshint span{flex:1}.ioshint b{display:block;font-size:15px}
.ioshint svg{width:15px;height:18px;vertical-align:-3px;color:#e9773f}.ioshint button{background:none;border:0;color:inherit;font-size:26px;line-height:1;padding:4px 8px;cursor:pointer;opacity:.8}
.apphero{display:flex;flex-wrap:wrap;gap:18px;align-items:center}.apphero>div{flex:1 1 260px;min-width:0}.apphero h1{font-size:clamp(26px,7vw,40px);margin:0 0 6px}.apphero img{width:96px;height:96px;border-radius:22px}
.top{position:relative}.brand{padding-right:132px;max-width:100%;box-sizing:border-box}@media (max-width:640px){.brand{flex-wrap:wrap;row-gap:2px}.brand span{flex-basis:100%}}.langs{position:absolute;right:16px;top:16px;display:flex;gap:6px}.langsw{color:var(--band-ink);text-decoration:none;font:600 13px var(--body);letter-spacing:.5px;border:1px solid #3a4152;border-radius:6px;padding:4px 8px;opacity:.85}.langsw:hover{opacity:1;border-color:var(--accent)}@media (min-width:641px){.brand{padding-right:0}.langs{position:static;order:9;margin-left:auto}}@media (max-width:440px){.brand b{font-size:23px}.langs{gap:4px;right:12px}.langsw{padding:3px 6px;font-size:12px}.brand{padding-right:110px}}</style>
`;
  const pwaHead = lg => {
    const T = (el, en, es, sr) => ({ el, en, es, sr })[lg];
    return `<script>
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('${BASE}sw.js'));
addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.bsInstall=e;document.documentElement.classList.add('can-install');});
addEventListener('load',()=>{const ua=navigator.userAgent,ios=/iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
  if(!ios||!/Safari/.test(ua)||/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\\//.test(ua)||navigator.standalone||location.pathname.indexOf('/${PATHS[lg].app}/')>-1)return;
  try{if(localStorage.getItem('bsIosHint'))return;}catch(e){}
  setTimeout(()=>{const d=document.createElement('div');d.className='ioshint';d.innerHTML='<img src="${BASE}icon-192.png" alt=""><span><b>${T(`Βάλε το ${esc(SITE_NAME)} στην οθόνη σου`, `Add ${esc(SITE_NAME)} to your Home Screen`, `Añade ${esc(SITE_NAME)} a tu pantalla de inicio`, `Dodaj ${esc(SITE_NAME)} na početni ekran`)}</b>${T('Πάτα', 'Tap', 'Toca', 'Dodirni')} <svg viewBox="0 0 20 24" aria-label="${T('κοινοποίηση', 'share', 'compartir', 'deli')}"><path d="M10 2v13M5 7l5-5 5 5M3 11v10h14V11" fill="none" stroke="currentColor" stroke-width="2"/></svg> ${T('και «Προσθήκη στην οθόνη Αφετηρίας»', 'and then “Add to Home Screen”', 'y luego «Añadir a pantalla de inicio»', 'pa „Dodaj na početni ekran”')}</span><button type="button" aria-label="${T('Κλείσιμο', 'Close', 'Cerrar', 'Zatvori')}">×</button>';
    d.querySelector('button').onclick=()=>{d.remove();try{localStorage.setItem('bsIosHint','1');}catch(e){}};document.body.appendChild(d);},2500);});
addEventListener('click',e=>{const b=e.target.closest('[data-install]');if(b&&window.bsInstall){window.bsInstall.prompt();window.bsInstall.userChoice.then(()=>{window.bsInstall=null;document.documentElement.classList.remove('can-install');});}});
</script>
${pwaStyle}`;
  };

  for (const LG of LANGS) {
    const T = (el, en, es, sr) => ({ el, en, es, sr })[LG];
    const OTHERS = LANGS.filter(x => x !== LG);
    const BL = B(LG);
    const ord = n => T(n + 'η', ordEn(n), n + '.º', n + '.');
    const tName = c => (TEAMS[c] ? TEAMS[c][TEAM_IDX[LG][0]] : c);
    const teamNameL = c => c.split(';').map(tName).join(' / ');
    const updated = UPD[LG];
    const PRIV = T('Πολιτική απορρήτου</a>', 'Privacy policy</a>', 'Política de privacidad</a>', 'Politika privatnosti</a>');
    const shellB = SHELL[LG].replace(PRIV, `${PRIV}<a href="${urlFor(LG, 'app')}">${T('Εφαρμογή', 'App', 'App', 'Aplikacija')}</a><a href="${urlFor(LG, 'widgets')}">${T('Widget για το site σου', 'Widgets for your site', 'Widgets para tu web', 'Vidžeti za tvoj sajt')}</a>`).replaceAll('{{BASE}}', BL).replaceAll('{{UPDATED}}', esc(updated)).replaceAll('{{SEASON}}', SEASON_LABEL)
      .replace('<div class="search">', '{{LANGSW}}<div class="search">');
    const topband = shellB.slice(0, shellB.indexOf('\n<div id="v'));
    const footer = shellB.slice(shellB.lastIndexOf('{{AD}}<footer')).replace('{{AD}}', adUnit(LG));
    const LNAME = { el: ['ΕΛ', 'Ελληνικά'], en: ['EN', 'English'], es: ['ES', 'Español'], sr: ['SR', 'Srpski'] };
    const langSw = alts => `<span class="langs">${OTHERS.map(o => `<a class="langsw" href="${alts[o] || B(o)}" hreflang="${o}" lang="${o}" title="${LNAME[o][1]}">${LNAME[o][0]}</a>`).join('')}</span>`;
    const script = `<script src="${BASE}assets/${LG === 'el' ? 'app.js' : 'app.' + LG + '.js'}?v=${ver}" defer></script>`;
    const bodyAttrs = (view, id) => `data-view="${view}"${id ? ` data-id="${esc(id)}"` : ''} data-base="${BL}" data-root="${BASE}"`;

    function head(title, desc, url, altsMap) {
      // hreflang: όλες οι γλώσσες στις οποίες υπάρχει η σελίδα (και η τρέχουσα)
      const all = { ...altsMap, [LG]: url };
      const have = LANGS.filter(l => all[l]);
      const alts = have.length > 1 ? have.map(l => `<link rel="alternate" hreflang="${l}" href="${esc(SITE_URL + all[l])}">\n`).join('') +
        `<link rel="alternate" hreflang="x-default" href="${esc(SITE_URL + (all.el || all.en || url))}">\n` : '';
      return `<!doctype html>
<html lang="${LG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(SITE_URL + url)}">
${alts}<meta property="og:type" content="website">
<meta property="og:locale" content="${{ el: 'el_GR', en: 'en_GB', es: 'es_ES', sr: 'sr_RS' }[LG]}">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(SITE_URL + url)}">
<meta name="theme-color" content="#1d2330">
<link rel="manifest" href="${BL}manifest.webmanifest">
<link rel="icon" href="${BASE}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${BASE}favicon-48.png" sizes="48x48" type="image/png">
<link rel="apple-touch-icon" href="${BASE}apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(SITE_NAME)}">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Sans+Extra+Condensed:wght@600;800&family=Fira+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="${BASE}assets/app.css?v=${ver}">
${adHead}${pwaHead(LG)}</head>`;
    }
    async function write(url, html) {
      const file = path.join(OUT, url.slice(BASE.length), 'index.html');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, html);
    }
    // απλή σελίδα (άρθρα, tipsters, πολιτική απορρήτου): ίδια κεφαλίδα και υποσέλιδο
    async function simplePage(key, { title, desc, view, main, id = '' }) {
      const url = urlFor(LG, key), alt = Object.fromEntries(OTHERS.map(o => [o, urlFor(o, key)])); urls.push(SITE_URL + url);
      await write(url, `${head(title, desc, url, alt)}
<body ${bodyAttrs(view, id)}>
${topband.replace('{{LANGSW}}', langSw(alt))}
${adUnit(LG)}<main class="wrap one">${main}</main>
${footer}
${script}
</body>
</html>
`);
    }
    async function page(key, { title, desc, view, id = '', h1p = '', ledep = '', h1t = '', ledet = '' }) {
      const url = urlFor(LG, key), alt = Object.fromEntries(OTHERS.map(o => [o, urlFor(o, key)])); urls.push(SITE_URL + url);
      let body = shellB.replace('{{LANGSW}}', langSw(alt))
        .replace('{{PLAYER_H1}}', esc(h1p)).replace('{{PLAYER_LEDE}}', ledep ? `<p class="lede">${esc(ledep)}</p>` : '')
        .replace('{{TEAM_H1}}', esc(h1t)).replace('{{TEAM_LEDE}}', ledet ? `<p class="lede">${esc(ledet)}</p>` : '');
      const map = { stand: 'vStand', team: 'vTeam', player: 'vPlayer', form: 'vForm', fantasy: 'vFantasy', preds: 'vPreds' };
      for (const [v, el] of Object.entries(map)) body = body.replace(`{{HIDDEN_${el}}}`, v === view ? '' : ' hidden');
      // μία διαφήμιση στην ορατή ενότητα + μία πριν από το υποσέλιδο
      const at = body.indexOf(`<div id="${map[view]}"`);
      const k = body.indexOf('{{AD}}', at);
      if (k > -1) body = body.slice(0, k) + adUnit(LG) + body.slice(k + 6);
      body = body.replace('{{AD}}<footer', adUnit(LG) + '<footer').replaceAll('{{AD}}', '');
      await write(url, `${head(title, desc, url, alt)}
<body ${bodyAttrs(view, id)}>
${body}
${script}
</body>
</html>
`);
    }

    const S = `EuroLeague ${SEASON_LABEL}`;
    const rdTxt0 = r => T(`${r}η αγωνιστική`, `Round ${r}`, `Jornada ${r}`, `${r}. kolo`);
    const nextR = Math.min(...league.games.filter(g => !g[6]).map(g => g[0]));
    const doneRounds = [...new Set(league.games.map(g => g[0]))].filter(r => league.games.filter(g => g[0] === r).every(g => g[6])).sort((a, b) => b - a);
    const recapTitle = r => T(`Η ${r}η αγωνιστική της EuroLeague σε αριθμούς`, `EuroLeague Round ${r} in numbers`, `La jornada ${r} de la EuroLeague en cifras`, `${r}. kolo Evrolige u brojkama`);
    await page('home', { view: 'stand',
      title: T(`EuroLeague βαθμολογία ${SEASON_LABEL}: πρόγραμμα, στατιστικά ομάδων και παικτών | ${SITE_NAME}`, `EuroLeague standings ${SEASON_LABEL}: schedule, team and player stats | ${SITE_NAME}`, `Clasificación de la EuroLeague ${SEASON_LABEL}: calendario y estadísticas de equipos y jugadores | ${SITE_NAME}`, `Tabela Evrolige ${SEASON_LABEL}: raspored, statistika timova i igrača | ${SITE_NAME}`),
      desc: T(`Η βαθμολογία της ${S} μετά την ${lastRound}η αγωνιστική, το πρόγραμμα, στατιστικά ομάδων και παικτών στα ελληνικά.`,
        `The ${S} standings after Round ${lastRound}, the schedule, team ratings and player stats.`, `La clasificación de la ${S} tras la jornada ${lastRound}, el calendario, los ratings de los equipos y las estadísticas de los jugadores.`, `Tabela ${S} posle ${lastRound}. kola, raspored, rejtinzi timova i statistika igrača.`) });
    await page('form', { view: 'form',
      title: T(`Θερμόμετρο φόρμας ${S}: ποιος ανεβαίνει, ποιος πέφτει | ${SITE_NAME}`, `${S} form guide: who is heating up, who is cooling down | ${SITE_NAME}`, `Estado de forma ${S}: quién se calienta y quién se enfría | ${SITE_NAME}`, `Forma u ${S}: ko je u usponu, a ko u padu | ${SITE_NAME}`),
      desc: T(`Οι παίκτες και οι ομάδες της EuroLeague σε φόρμα: οι 3 τελευταίοι αγώνες σε σύγκριση με τους προηγούμενους.`,
        `EuroLeague players and teams in form: the last 3 games compared with the earlier ones.`, `Jugadores y equipos de la EuroLeague en forma: los últimos 3 partidos frente a los anteriores.`, `Igrači i timovi Evrolige u formi: poslednje 3 utakmice u poređenju sa prethodnima.`) });
    await page('fantasy', { view: 'fantasy',
      title: T(`EuroLeague Fantasy: ποιους να βάλεις στην ${lastRound + 1}η αγωνιστική | ${SITE_NAME}`, `EuroLeague Fantasy picks for Round ${lastRound + 1} | ${SITE_NAME}`, `EuroLeague Fantasy: a quién fichar en la jornada ${lastRound + 1} | ${SITE_NAME}`, `EuroLeague Fantasy: koga izabrati za ${lastRound + 1}. kolo | ${SITE_NAME}`),
      desc: T(`Εκτιμήσεις PIR ανά θέση, δυσκολία προγράμματος, διπλές εβδομάδες και η πεντάδα της αγωνιστικής για το EuroLeague Fantasy.`,
        `Projected PIR by position, schedule difficulty, double weeks and the team of the round for EuroLeague Fantasy.`, `PIR estimado por posición, dificultad del calendario, semanas dobles y el quinteto de la jornada para el EuroLeague Fantasy.`, `Procena PIR-a po poziciji, težina rasporeda, duple nedelje i idealna petorka kola za EuroLeague Fantasy.`) });
    await page('preds', { view: 'preds',
      title: T(`EuroLeague προγνωστικά ${lastRound + 1}ης αγωνιστικής: εκτιμήσεις και ανάλυση | ${SITE_NAME}`, `EuroLeague predictions Round ${lastRound + 1}: projected scores and analysis | ${SITE_NAME}`, `Pronósticos EuroLeague jornada ${lastRound + 1}: marcadores estimados y análisis | ${SITE_NAME}`, `Prognoze Evrolige za ${lastRound + 1}. kolo: procenjeni rezultati i analiza | ${SITE_NAME}`),
      desc: T(`Προγνωστικά για την ${lastRound + 1}η αγωνιστική της ${S}: εκτίμηση σκορ, πιθανότητα νίκης, σύνολο πόντων, φόρμα και η ανάλυσή μας.`,
        `Predictions for Round ${lastRound + 1} of the ${S}: projected score, win probability, total points, form and our analysis.`, `Pronósticos para la jornada ${lastRound + 1} de la ${S}: marcador estimado, probabilidad de victoria, puntos totales, forma y nuestro análisis.`, `Prognoze za ${lastRound + 1}. kolo ${S}: procenjeni rezultat, verovatnoća pobede, ukupno poena, forma i naša analiza.`) });

    // άρθρα
    const typeLabel = t => (t === 'prognostiko' ? T('Προγνωστικό', 'Prediction', 'Pronóstico', 'Prognoza') : T('Άρθρο', 'Article', 'Artículo', 'Članak'));
    const arts = articles.filter(a => a[LG]);
    await simplePage('articles', { view: 'articles', title: T(`Άρθρα και προγνωστικά EuroLeague | ${SITE_NAME}`, `EuroLeague articles and predictions | ${SITE_NAME}`, `Artículos y pronósticos de la EuroLeague | ${SITE_NAME}`, `Članci i prognoze Evrolige | ${SITE_NAME}`),
      desc: T(`Αναλύσεις, προεπισκοπήσεις αγωνιστικών και προγνωστικά για την ${S}.`, `Analysis, round previews and predictions for the ${S}.`, `Análisis, previas de cada jornada y pronósticos de la ${S}.`, `Analize, najave kola i prognoze za ${S}.`),
      main: `<section class="article"><h1>${T('Άρθρα', 'Articles', 'Artículos', 'Članci')}</h1><p class="sub">${T('Αναλύσεις, προεπισκοπήσεις και προγνωστικά για την', 'Analysis, previews and predictions for the', 'Análisis, previas y pronósticos de la', 'Analize, najave i prognoze za')} ${esc(S)}</p>` +
        (doneRounds.length ? `<h2>${T('Η αγωνιστική σε αριθμούς', 'The round in numbers', 'La jornada en cifras', 'Kolo u brojkama')}</h2><div class="alist recaps">${doneRounds.map(r => `<a class="acard" href="${urlFor(LG, 'recap:' + r)}"><time>${esc(rdTxt0(r))}</time><h2>${esc(recapTitle(r))}</h2></a>`).join('')}</div><h2>${T('Αναλύσεις και προγνωστικά', 'Analysis and predictions', 'Análisis y pronósticos', 'Analize i prognoze')}</h2>` : '') +
        (arts.length ? `<div class="alist">${arts.map(a => `<a class="acard" href="${a[LG].url}"><time>${esc(typeLabel(a.type))} · ${esc(a[LG].dateText)}</time><h2>${esc(a[LG].title)}</h2><p>${esc(a[LG].desc)}</p></a>`).join('')}</div>`
          : `<p class="sub">${T('Τα πρώτα άρθρα έρχονται σύντομα.', 'The first articles are coming soon.', 'Los primeros artículos llegarán pronto.', 'Prvi članci stižu uskoro.')}</p>`) + `</section>` });
    for (const a of arts) {
      const x = a[LG];
      await simplePage('article:' + a.el.slug, { view: 'articles', title: `${x.title} | ${SITE_NAME}`, desc: x.desc || x.title,
        main: `<article class="article"><p class="sub"><a href="${urlFor(LG, 'articles')}">${T('Άρθρα', 'Articles', 'Artículos', 'Članci')}</a> · ${esc(typeLabel(a.type))}</p><h1>${esc(x.title)}</h1>
<div class="byline">${esc([x.dateText, a.author].filter(Boolean).join(' · '))}</div>
<div class="prose">${x.html}</div>
${a.type === 'prognostiko' ? `<p class="note">${T('Τα προγνωστικά αποτελούν προσωπική άποψη και όχι συμβουλή. Το στοίχημα επιτρέπεται μόνο σε άτομα άνω των 21 ετών. Παίξτε υπεύθυνα.', 'Predictions are personal opinion, not advice. Betting is for adults only (21+ in Greece, 18+ in most other countries). Gamble responsibly.', 'Los pronósticos son una opinión personal, no un consejo. Las apuestas son solo para adultos (+21 en Grecia, +18 en España y la mayoría de países). Juega con responsabilidad.', 'Prognoze su lično mišljenje, a ne savet. Klađenje je dozvoljeno samo punoletnim osobama (21+ u Grčkoj, 18+ u Srbiji i većini zemalja). Igrajte odgovorno.')} <a href="${urlFor(LG, 'preds')}">${T('Δείτε τις εκτιμήσεις της αγωνιστικής', 'See the projections for the round', 'Ver las estimaciones de la jornada', 'Pogledaj procene za kolo')}</a>.</p>` : ''}
</article>` });
    }

    // Tipsters
    const pctTxt = v => (v == null ? '–' : Math.round(v * 100) + '%');
    const unitsTxt = v => (v > 0 ? '+' : '') + v.toFixed(2);
    const resChip = r => r === 'W' ? `<span class="res w">${T('Ν', 'W', 'V', 'P')}</span>` : r === 'L' ? `<span class="res l">${T('Η', 'L', 'D', 'I')}</span>` : r === 'P' ? '<span class="res p">=</span>' : '<span class="res q">…</span>';
    const gameTxt = p => `${esc(tName(p.h))} – ${esc(tName(p.a))}`;
    const scoreTxt = p => p.score ? p.score + (p.val != null ? ` · ${p.val} ${PROP_LABEL[LG][p.stat]}` : '') : '';
    const disclaimer = `<p class="note">${T('Οι επιλογές των tipsters είναι προσωπικές απόψεις και όχι συμβουλή. Οι μονάδες υπολογίζονται με 1 μονάδα ποντάρισμα ανά επιλογή και μόνο όπου δηλώθηκε απόδοση. Το στοίχημα επιτρέπεται μόνο σε άτομα άνω των 21 ετών. Παίξτε υπεύθυνα.',
      'Tipster picks are personal opinions, not advice. Units assume a 1-unit stake per pick and only count picks with odds. Betting is for adults only (21+ in Greece, 18+ in most other countries). Gamble responsibly.', 'Las apuestas de los tipsters son opiniones personales, no consejos. Las unidades se calculan con 1 unidad apostada por pronóstico y solo cuentan los que tienen cuota. Las apuestas son solo para adultos (+21 en Grecia, +18 en España y la mayoría de países). Juega con responsabilidad.', 'Tipovi tipstera su lično mišljenje, a ne savet. Jedinice se računaju sa ulogom od 1 jedinice po tipu i samo za tipove sa kvotom. Klađenje je dozvoljeno samo punoletnim osobama (21+ u Grčkoj, 18+ u Srbiji i većini zemalja). Igrajte odgovorno.')}</p>`;
    const upcoming = tipsters.flatMap(t => t.picks.filter(p => p.res === 'pending').map(p => ({ ...p, t })));
    const byGame = {};
    for (const p of upcoming) (byGame[`${p.round}|${p.h}|${p.a}`] ||= []).push(p);
    const roundTxt = r => T(`${r}η αγωνιστική`, `Round ${r}`, `Jornada ${r}`, `${r}. kolo`);
    await simplePage('tipsters', { view: 'tipsters',
      title: T(`Tipsters EuroLeague: βαθμολογία και επιλογές ${nextR}ης αγωνιστικής | ${SITE_NAME}`, `EuroLeague tipsters: leaderboard and Round ${nextR} picks | ${SITE_NAME}`, `Tipsters de la EuroLeague: clasificación y apuestas de la jornada ${nextR} | ${SITE_NAME}`, `Tipsteri Evrolige: tabela i tipovi za ${nextR}. kolo | ${SITE_NAME}`),
      desc: T(`Οι tipsters του ${SITE_NAME}: ποσοστό επιτυχίας, μονάδες κέρδους και οι επιλογές τους για την ${nextR}η αγωνιστική της ${S}.`,
        `The ${SITE_NAME} tipsters: hit rate, units won and their picks for Round ${nextR} of the ${S}.`, `Los tipsters de ${SITE_NAME}: porcentaje de acierto, unidades ganadas y sus apuestas para la jornada ${nextR} de la ${S}.`, `Tipsteri sajta ${SITE_NAME}: procenat pogodaka, osvojene jedinice i njihovi tipovi za ${nextR}. kolo ${S}.`),
      main: `<section class="article wide"><h1>Tipsters</h1><p class="sub">${T('Η βαθμολογία ενημερώνεται αυτόματα με τα τελικά σκορ κάθε αγώνα', 'The leaderboard updates automatically with the final score of every game', 'La clasificación se actualiza automáticamente con el resultado final de cada partido', 'Tabela se automatski ažurira konačnim rezultatom svake utakmice')}</p>
${tipsters.length ? `<div class="tbl"><table class="tiptbl"><thead><tr><th>#</th><th>Tipster</th><th>${T('Επιλογές', 'Picks', 'Apuestas', 'Tipovi')}</th><th>${T('Ν-Η', 'W-L', 'V-D', 'P-I')}</th><th>${T('Επιτυχία', 'Hit rate', 'Acierto', 'Uspešnost')}</th><th>${T('Μονάδες', 'Units', 'Unidades', 'Jedinice')}</th><th>ROI</th><th>${T('Φόρμα', 'Form', 'Forma', 'Forma')}</th></tr></thead><tbody>
${tipsters.map((t, i) => `<tr><td>${i + 1}</td><td class="l"><a class="tlink" href="${urlFor(LG, 'tipster:' + t.slug)}"><span>${esc(t.name)}</span></a></td><td>${t.W + t.L + t.P}</td><td>${t.W}-${t.L}${t.P ? `-${t.P}` : ''}</td><td>${pctTxt(t.pct)}</td><td class="${t.units > 0 ? 'up' : t.units < 0 ? 'down' : ''}">${unitsTxt(t.units)}</td><td>${t.roi == null ? '–' : (t.roi > 0 ? '+' : '') + Math.round(t.roi * 100) + '%'}</td><td>${t.form.split('').map(resChip).join(' ') || '–'}</td></tr>`).join('')}
</tbody></table></div>` : `<p class="sub">${T('Δεν υπάρχουν ακόμη tipsters.', 'No tipsters yet.', 'Todavía no hay tipsters.', 'Još nema tipstera.')}</p>`}
</section>
<section class="article wide"><h2>${T('Οι επιλογές για τους επόμενους αγώνες', 'Picks for the upcoming games', 'Apuestas para los próximos partidos', 'Tipovi za naredne utakmice')}</h2>
${Object.keys(byGame).length ? `<div class="tipgames">${Object.values(byGame).map(ps => `<div class="fx"><span class="when">${roundTxt(ps[0].round)}</span><div class="row"><b>${gameTxt(ps[0])}</b></div>${ps.map(p => `<a class="row tippick" href="${p.url[LG]}"><span class="tn">${esc(p.t.name)}</span><span class="tl">${esc(p.label[LG])}${p.odds ? ` @ ${p.odds.toFixed(2)}` : ''}${p.html[LG] ? ` <i>${T('Ανάλυση', 'Analysis', 'Análisis', 'Analiza')} →</i>` : ''}</span></a>`).join('')}</div>`).join('')}</div>` : `<p class="sub">${T('Δεν έχουν δηλωθεί ακόμη επιλογές για τους επόμενους αγώνες.', 'No picks for the upcoming games yet.', 'Todavía no hay apuestas para los próximos partidos.', 'Još nema tipova za naredne utakmice.')}</p>`}
${disclaimer}</section>` });
    for (const t of tipsters) {
      const bio = T(t.bio, t.bioEn, t.bioEs, t.bioSr);
      await simplePage('tipster:' + t.slug, { view: 'tipsters',
        title: T(`${t.name}: επιλογές και βαθμολογία tipster EuroLeague | ${SITE_NAME}`, `${t.name}: EuroLeague tipster picks and record | ${SITE_NAME}`, `${t.name}: apuestas y balance del tipster en la EuroLeague | ${SITE_NAME}`, `${t.name}: tipovi i učinak tipstera u Evroligi | ${SITE_NAME}`),
        desc: T(`${t.name}: ${t.W}-${t.L} στις επιλογές EuroLeague, ποσοστό επιτυχίας ${pctTxt(t.pct)}, ${unitsTxt(t.units)} μονάδες.`,
          `${t.name}: ${t.W}-${t.L} on EuroLeague picks, ${pctTxt(t.pct)} hit rate, ${unitsTxt(t.units)} units.`, `${t.name}: ${t.W}-${t.L} en sus apuestas de la EuroLeague, ${pctTxt(t.pct)} de acierto, ${unitsTxt(t.units)} unidades.`, `${t.name}: ${t.W}-${t.L} na tipovima za Evroligu, uspešnost ${pctTxt(t.pct)}, ${unitsTxt(t.units)} jedinica.`),
        main: `<section class="article wide"><p class="sub"><a href="${urlFor(LG, 'tipsters')}">Tipsters</a></p><h1>${esc(t.name)}</h1>${bio ? `<p class="lede2">${esc(bio)}</p>` : ''}
<div class="adv tipstats"><div><span>${T('Επιλογές', 'Picks', 'Apuestas', 'Tipovi')}</span><b>${t.W + t.L + t.P}</b></div><div><span>${T('Ν-Η', 'W-L', 'V-D', 'P-I')}</span><b>${t.W}-${t.L}</b></div><div><span>${T('Επιτυχία', 'Hit rate', 'Acierto', 'Uspešnost')}</span><b>${pctTxt(t.pct)}</b></div><div><span>${T('Μονάδες', 'Units', 'Unidades', 'Jedinice')}</span><b>${unitsTxt(t.units)}</b></div></div>
<div class="tbl"><table class="tiptbl"><thead><tr><th>${T('Αγ.', 'Rd', 'Jor.', 'Kolo')}</th><th>${T('Αγώνας', 'Game', 'Partido', 'Utakmica')}</th><th>${T('Επιλογή', 'Pick', 'Apuesta', 'Tip')}</th><th>${T('Απόδοση', 'Odds', 'Cuota', 'Kvota')}</th><th>${T('Σκορ', 'Score', 'Marcador', 'Rezultat')}</th><th>${T('Αποτέλεσμα', 'Result', 'Resultado', 'Ishod')}</th></tr></thead><tbody>
${t.picks.map(p => `<tr><td>${p.round}</td><td class="l">${gameTxt(p)}</td><td class="l"><a class="pklink" href="${p.url[LG]}">${esc(p.label[LG])}</a>${p.html[LG] ? ` <span class="rk">· ${T('ανάλυση', 'analysis', 'análisis', 'analiza')}</span>` : ''}</td><td>${p.odds ? p.odds.toFixed(2) : '–'}</td><td>${scoreTxt(p) || '–'}</td><td>${p.res === 'unknown' ? `<span class="res q" title="${T('Δεν βρέθηκε ο αγώνας', 'Game not found', 'Partido no encontrado', 'Utakmica nije pronađena')}">?</span>` : resChip(p.res === 'pending' ? 'Q' : p.res)}</td></tr>`).join('')}
</tbody></table></div>${disclaimer}</section>` });
      for (const p of t.picks) {
        const game = `${tName(p.h)} – ${tName(p.a)}`;
        const status = p.res === 'W' ? T('Κερδισμένο', 'Won', 'Ganada', 'Dobitan') : p.res === 'L' ? T('Χαμένο', 'Lost', 'Perdida', 'Gubitan') : p.res === 'P' ? T('Ακυρώθηκε', 'Void', 'Anulada', 'Poništen') : p.res === 'unknown' ? T('Δεν βρέθηκε ο αγώνας', 'Game not found', 'Partido no encontrado', 'Utakmica nije pronađena') : T('Σε εξέλιξη', 'Pending', 'Pendiente', 'Na čekanju');
        const when = p.date ? (() => { const s = p.date; const d = new Date(Date.UTC(2020 + +s[8], +s.slice(0, 2) - 1, +s.slice(2, 4), +s.slice(4, 6), +s.slice(6, 8)));
          return d.toLocaleString(T('el-GR', 'en-GB', 'es-ES', 'sr-Latn-RS'), { timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) + T('', ' (Athens time)', ' (hora de Atenas)', ' (po atinskom vremenu)'); })() : '';
        const html = p.html[LG], label = p.label[LG];
        await simplePage('pick:' + t.slug + '/' + p.id, { view: 'tipsters',
          title: T(`${game} προγνωστικό: ${label} | ${t.name} | ${SITE_NAME}`, `${game} prediction: ${label} | ${t.name} | ${SITE_NAME}`, `Pronóstico ${game}: ${label} | ${t.name} | ${SITE_NAME}`, `${game} prognoza: ${label} | ${t.name} | ${SITE_NAME}`),
          desc: p.excerpt[LG] || T(`${t.name}: ${label}${p.odds ? ' @ ' + p.odds.toFixed(2) : ''} για το ${game}, ${p.round}η αγωνιστική EuroLeague.`,
            `${t.name}: ${label}${p.odds ? ' @ ' + p.odds.toFixed(2) : ''} for ${game}, EuroLeague Round ${p.round}.`, `${t.name}: ${label}${p.odds ? ' @ ' + p.odds.toFixed(2) : ''} para el ${game}, jornada ${p.round} de la EuroLeague.`, `${t.name}: ${label}${p.odds ? ' @ ' + p.odds.toFixed(2) : ''} za utakmicu ${game}, ${p.round}. kolo Evrolige.`),
          main: `<article class="article"><p class="sub"><a href="${urlFor(LG, 'tipsters')}">Tipsters</a> · <a href="${urlFor(LG, 'tipster:' + t.slug)}">${esc(t.name)}</a></p>
<h1>${esc(game)}</h1>
<div class="byline">${T(`${p.round}η αγωνιστική EuroLeague`, `EuroLeague Round ${p.round}`, `EuroLeague, jornada ${p.round}`, `Evroliga, ${p.round}. kolo`)}${when ? ' · ' + esc(when) : ''}</div>
<div class="pickbox ${p.res}"><div><span>${T('Επιλογή', 'Pick', 'Apuesta', 'Tip')}</span><b>${esc(label)}</b></div><div><span>${T('Απόδοση', 'Odds', 'Cuota', 'Kvota')}</span><b>${p.odds ? p.odds.toFixed(2) : '–'}</b></div><div><span>${T('Αποτέλεσμα', 'Result', 'Resultado', 'Ishod')}</span><b>${esc(status)}</b>${p.score ? `<small>${esc(scoreTxt(p))}</small>` : ''}</div></div>
${html ? `<div class="prose">${html}</div>` : `<p class="sub">${T(`Ο ${esc(t.name)} δεν έχει γράψει ανάλυση για αυτή την επιλογή.`, `${esc(t.name)} has not written an analysis for this pick${p.html.el ? ' in English (it is available in Greek)' : ''}.`, `${esc(t.name)} no ha escrito un análisis de esta apuesta${p.html.el ? ' en español (está disponible en griego' + (p.html.en ? ' y en inglés' : '') + ')' : ''}.`, `${esc(t.name)} nije napisao analizu ovog tipa${p.html.el ? ' na srpskom (dostupna je na grčkom' + (p.html.en ? ' i engleskom' : '') + ')' : ''}.`)}</p>`}
<p><a class="pread" href="${urlFor(LG, 'team:' + p.h)}">${esc(tName(p.h))}: ${T('στατιστικά', 'stats', 'estadísticas', 'statistika')} →</a> &nbsp; <a class="pread" href="${urlFor(LG, 'team:' + p.a)}">${esc(tName(p.a))}: ${T('στατιστικά', 'stats', 'estadísticas', 'statistika')} →</a> &nbsp; <a class="pread" href="${urlFor(LG, 'preds')}">${T('Εκτιμήσεις αγωνιστικής', 'Round projections', 'Estimaciones de la jornada', 'Procene za kolo')} →</a></p>
${disclaimer}</article>` });
      }
    }

    // σελίδα εφαρμογής (και σελίδα εκτός σύνδεσης)
    await simplePage('app', { view: 'app',
      title: T(`Εφαρμογή ${SITE_NAME} για κινητό: EuroLeague στατιστικά στην οθόνη σου`, `${SITE_NAME} mobile app: EuroLeague stats on your Home Screen`, `App de ${SITE_NAME} para el móvil: estadísticas de la EuroLeague en tu pantalla de inicio`, `${SITE_NAME} aplikacija za telefon: statistika Evrolige na početnom ekranu`),
      desc: T(`Βάλε το ${SITE_NAME} στην αρχική οθόνη του κινητού σου, σε Android και iPhone. Δωρεάν, χωρίς λήψη από store.`, `Add ${SITE_NAME} to your phone’s Home Screen on Android and iPhone. Free, no app store download.`, `Añade ${SITE_NAME} a la pantalla de inicio de tu móvil, en Android y iPhone. Gratis, sin descargar nada de la tienda de apps.`, `Dodaj ${SITE_NAME} na početni ekran telefona, na Androidu i iPhoneu. Besplatno, bez preuzimanja iz prodavnice aplikacija.`),
      main: `<div class="article"><div class="apphero"><img src="${BASE}icon-192.png" alt="" width="96" height="96"><div><h1>${T(`Το ${esc(SITE_NAME)} στο κινητό σου`, `${esc(SITE_NAME)} on your phone`, `${esc(SITE_NAME)} en tu móvil`, `${esc(SITE_NAME)} na tvom telefonu`)}</h1><p class="sub">${T('Δωρεάν, χωρίς εγγραφή και χωρίς λήψη από store. Ανοίγει σε πλήρη οθόνη σαν κανονική εφαρμογή και δείχνει τα τελευταία στατιστικά που είδες ακόμη και χωρίς σύνδεση.', 'Free, no sign-up and no app store download. It opens full screen like a regular app and shows the latest stats you viewed even when you are offline.', 'Gratis, sin registro y sin descargar nada de la tienda de apps. Se abre a pantalla completa como una app normal y muestra las últimas estadísticas que viste incluso sin conexión.', 'Besplatno, bez registracije i bez preuzimanja iz prodavnice aplikacija. Otvara se preko celog ekrana kao obična aplikacija i prikazuje poslednju statistiku koju si gledao čak i bez interneta.')}</p></div></div>
<p><button class="appbtn only-install" data-install type="button">${T('Εγκατάσταση εφαρμογής', 'Install app', 'Instalar la app', 'Instaliraj aplikaciju')}</button></p>
<div class="appbox">
<div><h3>Android (Chrome)</h3><ol>${T('<li>Πάτησε το κουμπί «Εγκατάσταση εφαρμογής» πιο πάνω.</li><li>Αν δεν εμφανίζεται, άνοιξε το μενού ⋮ πάνω δεξιά.</li><li>Διάλεξε «Εγκατάσταση εφαρμογής» ή «Προσθήκη στην αρχική οθόνη».</li>', '<li>Tap the “Install app” button above.</li><li>If it does not appear, open the ⋮ menu at the top right.</li><li>Choose “Install app” or “Add to Home screen”.</li>', '<li>Toca el botón «Instalar la app» de arriba.</li><li>Si no aparece, abre el menú ⋮ arriba a la derecha.</li><li>Elige «Instalar aplicación» o «Añadir a pantalla de inicio».</li>', '<li>Dodirni dugme „Instaliraj aplikaciju” iznad.</li><li>Ako se ne pojavi, otvori meni ⋮ gore desno.</li><li>Izaberi „Instaliraj aplikaciju” ili „Dodaj na početni ekran”.</li>')}</ol></div>
<div><h3>iPhone (Safari)</h3><ol>${T(`<li>Άνοιξε το ${esc(SITE_NAME)} στο Safari.</li><li>Πάτησε το κουμπί κοινοποίησης (τετράγωνο με βέλος προς τα πάνω).</li><li>Διάλεξε «Προσθήκη στην οθόνη Αφετηρίας» και μετά «Προσθήκη».</li>`, `<li>Open ${esc(SITE_NAME)} in Safari.</li><li>Tap the Share button (the square with an arrow pointing up).</li><li>Choose “Add to Home Screen”, then “Add”.</li>`, `<li>Abre ${esc(SITE_NAME)} en Safari.</li><li>Toca el botón de compartir (el cuadrado con una flecha hacia arriba).</li><li>Elige «Añadir a pantalla de inicio» y luego «Añadir».</li>`, `<li>Otvori ${esc(SITE_NAME)} u Safariju.</li><li>Dodirni dugme za deljenje (kvadrat sa strelicom nagore).</li><li>Izaberi „Dodaj na početni ekran”, pa „Dodaj”.</li>`)}</ol></div>
<div><h3>${T('Υπολογιστής', 'Computer', 'Ordenador', 'Računar')}</h3><ol>${T('<li>Άνοιξε το site σε Chrome ή Edge.</li><li>Πάτησε το εικονίδιο εγκατάστασης στη γραμμή διεύθυνσης ή το κουμπί πιο πάνω.</li>', '<li>Open the site in Chrome or Edge.</li><li>Click the install icon in the address bar or the button above.</li>', '<li>Abre la web en Chrome o Edge.</li><li>Haz clic en el icono de instalación de la barra de direcciones o en el botón de arriba.</li>', '<li>Otvori sajt u Chromeu ili Edgeu.</li><li>Klikni na ikonu za instalaciju u traci za adresu ili na dugme iznad.</li>')}</ol></div>
</div>
<p class="note">${T('Αν βλέπεις αυτή τη σελίδα χωρίς να την άνοιξες εσύ, μάλλον δεν έχεις σύνδεση στο ίντερνετ. Οι σελίδες που άνοιξες πρόσφατα είναι διαθέσιμες και εκτός σύνδεσης.', 'If you see this page without opening it yourself, you are probably offline. Pages you opened recently are available offline.', 'Si ves esta página sin haberla abierto tú, probablemente no tienes conexión. Las páginas que abriste hace poco están disponibles sin conexión.', 'Ako vidiš ovu stranicu, a nisi je sam otvorio, verovatno nemaš internet. Stranice koje si nedavno otvorio dostupne su i bez interneta.')}</p></div>` });

    // πολιτική απορρήτου
    const owner = CONF.owner || T('[Επωνυμία ιδιοκτήτη]', '[Owner name]', '[Nombre del titular]', '[Naziv vlasnika]'), email = CONF.email || T('[email επικοινωνίας]', '[contact email]', '[email de contacto]', '[email za kontakt]');
    const LEGAL_ES = `<div class="legal"><h1>Política de privacidad</h1>
<p>${esc(SITE_NAME)} (${esc(SITE_URL)}) pertenece a ${esc(owner)}. Para cualquier cuestión sobre tus datos, escribe a ${esc(email)}.</p>
<h2>Qué datos recogemos</h2>
<p>No pedimos registro y no recogemos nombres ni datos de contacto. El servidor registra datos técnicos (como la dirección IP y el tipo de dispositivo) por motivos de seguridad y funcionamiento.</p>
<h2>Cookies y publicidad</h2>
<p>Usamos Google AdSense para mostrar anuncios. Google y sus socios pueden usar cookies para mostrar anuncios basados en tus visitas anteriores a esta y a otras webs. En tu primera visita te pedimos el consentimiento mediante el aviso de cookies, y puedes cambiarlo en cualquier momento. También puedes desactivar los anuncios personalizados en la <a href="https://adssettings.google.com">configuración de anuncios de Google</a>. Más información sobre <a href="https://policies.google.com/technologies/partner-sites">cómo usa Google los datos</a>.</p>
<h2>Fuentes tipográficas</h2>
<p>Las fuentes se cargan desde Google Fonts, por lo que tu dirección IP se envía a Google al cargar la página.</p>
<p>Los vídeos de YouTube se muestran como imagen y solo se cargan desde YouTube (youtube-nocookie.com) cuando pulsas reproducir; a partir de ese momento se aplica la política de privacidad de Google.</p>
<h2>Tus derechos</h2>
<p>Según el Reglamento General de Protección de Datos (RGPD) tienes derecho a acceder a tus datos, rectificarlos, suprimirlos y oponerte a su tratamiento, así como a presentar una reclamación ante la Autoridad Helénica de Protección de Datos (www.dpa.gr) o ante la autoridad de tu país (en España, la AEPD).</p>
<h2>Origen de las estadísticas</h2>
<p>Las estadísticas proceden de los datos públicos oficiales de la EuroLeague. ${esc(SITE_NAME)} no está vinculado a la EuroLeague.</p>
<p class="sub">Última actualización: ${esc(athensEs)}</p></div>`;
    const LEGAL_SR = `<div class="legal"><h1>Politika privatnosti</h1>
<p>${esc(SITE_NAME)} (${esc(SITE_URL)}) je u vlasništvu: ${esc(owner)}. Za sva pitanja u vezi sa vašim podacima pišite na ${esc(email)}.</p>
<h2>Koje podatke prikupljamo</h2>
<p>Ne tražimo registraciju i ne prikupljamo imena ni kontakt podatke. Server beleži tehničke podatke (kao što su IP adresa i tip uređaja) radi bezbednosti i rada sajta.</p>
<h2>Kolačići i oglasi</h2>
<p>Za prikazivanje oglasa koristimo Google AdSense. Google i njegovi partneri mogu da koriste kolačiće kako bi prikazivali oglase na osnovu vaših prethodnih poseta ovom i drugim sajtovima. Pri prvoj poseti tražimo vašu saglasnost putem obaveštenja o kolačićima i možete je promeniti u bilo kom trenutku. Personalizovane oglase možete isključiti u <a href="https://adssettings.google.com">Google podešavanjima oglasa</a>. Više o tome <a href="https://policies.google.com/technologies/partner-sites">kako Google koristi podatke</a>.</p>
<h2>Fontovi</h2>
<p>Fontovi se učitavaju sa usluge Google Fonts, pa se vaša IP adresa prilikom učitavanja stranice šalje Googleu.</p>
<p>YouTube video snimci se prikazuju kao slika i učitavaju se sa YouTube-a (youtube-nocookie.com) tek kada pritisnete pusti; od tog trenutka važi Google-ova politika privatnosti.</p>
<h2>Vaša prava</h2>
<p>Prema Opštoj uredbi o zaštiti podataka (GDPR) imate pravo na pristup, ispravku i brisanje svojih podataka i na prigovor na njihovu obradu, kao i pravo da podnesete pritužbu grčkom organu za zaštitu podataka (www.dpa.gr) ili nadležnom organu u svojoj zemlji (u Srbiji: Poverenik za informacije od javnog značaja i zaštitu podataka o ličnosti).</p>
<h2>Izvor statistike</h2>
<p>Statistika potiče iz zvaničnih javnih podataka Evrolige. ${esc(SITE_NAME)} nije povezan sa Evroligom.</p>
<p class="sub">Poslednje ažuriranje: ${esc(athensSr)}</p></div>`;
    await simplePage('legal', { view: 'legal', title: T(`Πολιτική απορρήτου | ${SITE_NAME}`, `Privacy policy | ${SITE_NAME}`, `Política de privacidad | ${SITE_NAME}`, `Politika privatnosti | ${SITE_NAME}`),
      desc: T(`Πώς το ${SITE_NAME} χρησιμοποιεί cookies και προσωπικά δεδομένα.`, `How ${SITE_NAME} uses cookies and personal data.`, `Cómo usa ${SITE_NAME} las cookies y los datos personales.`, `Kako ${SITE_NAME} koristi kolačiće i lične podatke.`),
      main: LG === 'sr' ? LEGAL_SR : LG === 'es' ? LEGAL_ES : LG === 'el' ? `<div class="legal"><h1>Πολιτική απορρήτου</h1>
<p>Το ${esc(SITE_NAME)} (${esc(SITE_URL)}) ανήκει στην/στον ${esc(owner)}. Για κάθε θέμα σχετικά με τα δεδομένα σας επικοινωνήστε στο ${esc(email)}.</p>
<h2>Τι δεδομένα συλλέγουμε</h2>
<p>Δεν ζητάμε εγγραφή και δεν συλλέγουμε ονόματα ή στοιχεία επικοινωνίας. Ο διακομιστής καταγράφει τεχνικά στοιχεία (όπως διεύθυνση IP και τύπο συσκευής) για λόγους ασφάλειας και λειτουργίας.</p>
<h2>Cookies και διαφημίσεις</h2>
<p>Χρησιμοποιούμε την υπηρεσία Google AdSense για την προβολή διαφημίσεων. Η Google και οι συνεργάτες της μπορεί να χρησιμοποιούν cookies για να προβάλλουν διαφημίσεις με βάση τις προηγούμενες επισκέψεις σας σε αυτόν και σε άλλους ιστότοπους. Στην πρώτη σας επίσκεψη σας ζητάμε συγκατάθεση μέσω του μηνύματος cookies και μπορείτε να την αλλάξετε ανά πάσα στιγμή. Μπορείτε επίσης να απενεργοποιήσετε τις εξατομικευμένες διαφημίσεις από τις <a href="https://adssettings.google.com">Ρυθμίσεις διαφημίσεων της Google</a>. Περισσότερα για το <a href="https://policies.google.com/technologies/partner-sites">πώς η Google χρησιμοποιεί τα δεδομένα</a>.</p>
<h2>Γραμματοσειρές</h2>
<p>Οι γραμματοσειρές φορτώνονται από την υπηρεσία Google Fonts, οπότε η διεύθυνση IP σας διαβιβάζεται στην Google κατά τη φόρτωση της σελίδας.</p>
<p>Τα βίντεο του YouTube εμφανίζονται ως εικόνα και φορτώνουν από το YouTube (youtube-nocookie.com) μόνο όταν πατήσετε αναπαραγωγή· από εκείνη τη στιγμή ισχύει η πολιτική απορρήτου της Google.</p>
<h2>Τα δικαιώματά σας</h2>
<p>Σύμφωνα με τον Γενικό Κανονισμό Προστασίας Δεδομένων (ΓΚΠΔ) έχετε δικαίωμα πρόσβασης, διόρθωσης, διαγραφής και εναντίωσης στην επεξεργασία των δεδομένων σας, καθώς και δικαίωμα καταγγελίας στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (www.dpa.gr).</p>
<h2>Πηγή στατιστικών</h2>
<p>Τα στατιστικά προέρχονται από τα επίσημα δημόσια δεδομένα της EuroLeague. Το ${esc(SITE_NAME)} δεν συνδέεται με την EuroLeague.</p>
<p class="sub">Τελευταία ενημέρωση: ${esc(athens)}</p></div>` : `<div class="legal"><h1>Privacy policy</h1>
<p>${esc(SITE_NAME)} (${esc(SITE_URL)}) is owned by ${esc(owner)}. For any question about your data, contact ${esc(email)}.</p>
<h2>What data we collect</h2>
<p>We do not ask you to register and we do not collect names or contact details. The server logs technical data (such as IP address and device type) for security and operation.</p>
<h2>Cookies and advertising</h2>
<p>We use Google AdSense to show ads. Google and its partners may use cookies to show ads based on your previous visits to this and other websites. On your first visit we ask for your consent through the cookie message, and you can change it at any time. You can also turn off personalised ads in <a href="https://adssettings.google.com">Google Ad Settings</a>. Read more about <a href="https://policies.google.com/technologies/partner-sites">how Google uses data</a>.</p>
<h2>Fonts</h2>
<p>Fonts are loaded from Google Fonts, so your IP address is sent to Google when the page loads.</p>
<p>YouTube videos are shown as an image and only load from YouTube (youtube-nocookie.com) when you press play; from then on Google’s privacy policy applies.</p>
<h2>Your rights</h2>
<p>Under the General Data Protection Regulation (GDPR) you have the right to access, correct and delete your data and to object to its processing, as well as the right to lodge a complaint with the Hellenic Data Protection Authority (www.dpa.gr) or your local data protection authority.</p>
<h2>Source of the stats</h2>
<p>The stats come from the official public EuroLeague data. ${esc(SITE_NAME)} is not affiliated with the EuroLeague.</p>
<p class="sub">Last updated: ${esc(athensEn)}</p></div>` });

    const srow = Object.fromEntries(league.stand.map(s => [s[1], s]));
    for (const c of Object.keys(TEAMS)) {
      const s = srow[c], name = tName(c);
      const lede = s ? T(`${name}: ${s[0]}η θέση στην ${S} με ρεκόρ ${s[2]}-${s[3]} και ${s[4]}-${s[5]} πόντους υπέρ/κατά.`, `${name}: ${ordEn(s[0])} in the ${S} with a ${s[2]}-${s[3]} record and ${s[4]}-${s[5]} points for/against.`, `${name}: ${s[0]}.º en la ${S} con un balance de ${s[2]}-${s[3]} y ${s[4]}-${s[5]} puntos a favor/en contra.`, `${name}: ${s[0]}. mesto u ${S}, skor ${s[2]}-${s[3]} i ${s[4]}-${s[5]} poena datih/primljenih.`)
        : T(`${name} στην ${S}.`, `${name} in the ${S}.`, `${name} en la ${S}.`, `${name} u ${S}.`);
      await page('team:' + c, { view: 'team', id: c, h1t: name, ledet: lede,
        title: T(`${name} ${S}: ρόστερ, πρόγραμμα, στατιστικά | ${SITE_NAME}`, `${name} ${S}: roster, schedule, stats | ${SITE_NAME}`, `${name} ${S}: plantilla, calendario y estadísticas | ${SITE_NAME}`, `${name} ${S}: roster, raspored, statistika | ${SITE_NAME}`),
        desc: lede + T(' Ρόστερ, πρόγραμμα, τέσσερις παράγοντες και φόρμα παικτών.', ' Roster, schedule, four factors and player form.', ' Plantilla, calendario, los cuatro factores y la forma de los jugadores.', ' Roster, raspored, četiri faktora i forma igrača.') });
    }
    for (const p of players) {
      const n = niceName(p.n), s = playerSummary(p), tn = teamNameL(p.t);
      const lede = T(`${n} (${tn}) στην ${S}: ${s.G} αγώνες, ${f1(s.pts)} πόντοι, ${f1(s.reb)} ριμπάουντ, ${f1(s.ast)} ασίστ και ${f1(s.pir)} PIR ανά αγώνα.`,
        `${n} (${tn}) in the ${S}: ${s.G} games, ${f1(s.pts)} points, ${f1(s.reb)} rebounds, ${f1(s.ast)} assists and ${f1(s.pir)} PIR per game.`, `${n} (${tn}) en la ${S}: ${s.G} partidos, ${f1(s.pts)} puntos, ${f1(s.reb)} rebotes, ${f1(s.ast)} asistencias y ${f1(s.pir)} de PIR por partido.`, `${n} (${tn}) u ${S}: ${s.G} utakmica, ${f1(s.pts)} poena, ${f1(s.reb)} skokova, ${f1(s.ast)} asistencija i ${f1(s.pir)} PIR po utakmici.`);
      await page('player:' + p.s, { view: 'player', id: p.c, h1p: n, ledep: lede,
        title: T(`${n} στατιστικά ${S} (${tn}) | ${SITE_NAME}`, `${n} stats ${S} (${tn}) | ${SITE_NAME}`, `Estadísticas de ${n} en la ${S} (${tn}) | ${SITE_NAME}`, `${n} statistika ${S} (${tn}) | ${SITE_NAME}`), desc: lede });
    }

    // σελίδες αγώνων: μία για κάθε αγώνα της σεζόν
    const LOC = { el: 'el-GR', en: 'en-GB', es: 'es-ES', sr: 'sr-Latn-RS' }[LG];
    const gDateB = s => new Date(Date.UTC(2020 + (+s[8]), +s.slice(0, 2) - 1, +s.slice(2, 4), +s.slice(4, 6), +s.slice(6, 8)));
    const rdTxt = r => T(`${r}η αγωνιστική`, `Round ${r}`, `Jornada ${r}`, `${r}. kolo`);
    for (const g of league.games) {
      const [r, w, h, a, hs, as, pl] = g;
      if (!TEAMS[h] || !TEAMS[a]) continue;
      const H = tName(h), A = tName(a), d = gDateB(w);
      const dt = d.toLocaleString(LOC, { timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const vs = T(`${H} - ${A}`, `${H} vs ${A}`, `${H} - ${A}`, `${H} - ${A}`);
      const sc = LG === 'sr' ? `${hs}:${as}` : `${hs}-${as}`;
      const title = pl
        ? T(`${vs} ${sc}: στατιστικά αγώνα (${rdTxt(r)} EuroLeague)`, `${vs} ${sc}: game stats (EuroLeague ${rdTxt(r)})`, `${vs} ${sc}: estadísticas del partido (${rdTxt(r).toLowerCase()} de la EuroLeague)`, `${vs} ${sc}: statistika utakmice (${rdTxt(r)} Evrolige)`)
        : T(`${vs}: πρόβλεψη, στατιστικά και απουσίες (${rdTxt(r)} EuroLeague)`, `${vs}: prediction, stats and injuries (EuroLeague ${rdTxt(r)})`, `${vs}: pronóstico, estadísticas y bajas (${rdTxt(r).toLowerCase()} de la EuroLeague)`, `${vs}: prognoza, statistika i povrede (${rdTxt(r)} Evrolige)`);
      const desc = pl
        ? T(`${vs} ${sc} στην ${rdTxt(r)} της ${S}: οι κορυφαίοι του αγώνα, η φόρμα, οι τέσσερις παράγοντες και τα μεταξύ τους.`, `${vs} ${sc} in ${rdTxt(r)} of the ${S}: top performers, form, four factors and head-to-head.`, `${vs} ${sc} en la ${rdTxt(r).toLowerCase()} de la ${S}: los mejores del partido, la forma, los cuatro factores y los enfrentamientos.`, `${vs} ${sc} u ${rdTxt(r)} ${S}: najbolji igrači utakmice, forma, četiri faktora i međusobni dueli.`)
        : T(`${vs} (${dt}): εκτίμηση σκορ, πιθανότητα νίκης, φόρμα, τέσσερις παράγοντες, απουσίες και βασικοί παίκτες με τις γραμμές τους.`, `${vs} (${dt}): projected score, win probability, form, four factors, injuries and key players with their lines.`, `${vs} (${dt}): marcador estimado, probabilidad de victoria, forma, cuatro factores, bajas y jugadores clave con sus líneas.`, `${vs} (${dt}): procenjeni rezultat, verovatnoća pobede, forma, četiri faktora, povrede i ključni igrači sa linijama.`);
      const ld = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: vs, sport: 'Basketball', startDate: d.toISOString(),
        eventStatus: 'https://schema.org/EventScheduled', homeTeam: { '@type': 'SportsTeam', name: H }, awayTeam: { '@type': 'SportsTeam', name: A },
        superEvent: { '@type': 'SportsEvent', name: S }, url: SITE_URL + urlFor(LG, `game:${r}|${h}|${a}`) };
      const hlv = VIDS.hl[`${r}|${h}|${a}`], tvs = pl ? teamVideosFor(VIDS, g) : [];
      const ytBox = (id, ttl, big) => `<div class="yt${big ? ' big' : ''}"><button type="button" class="ytb" data-yt="${esc(id)}" aria-label="${esc(T('Αναπαραγωγή', 'Play', 'Reproducir', 'Pusti') + ': ' + ttl)}"><img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="ytp" aria-hidden="true"></span></button></div>`;
      const vidSec = (hlv || tvs.length) ? `<section class="gvid"><h2>${T('Βίντεο', 'Video', 'Vídeo', 'Video')}</h2>${hlv ? `<p class="sub">${T('Τα επίσημα highlights της EuroLeague', 'Official EuroLeague highlights', 'Los highlights oficiales de la EuroLeague', 'Zvanični hajlajti Evrolige')}</p>${ytBox(hlv.id, hlv.t, 1)}` : ''}${tvs.length ? `<h3>${T('Από τα κανάλια των ομάδων', 'From the teams’ channels', 'De los canales de los equipos', 'Sa kanala timova')}</h3><div class="ytgrid">${tvs.map(v => `<figure>${ytBox(v.id, v.t)}<figcaption><span class="crest" style="background:${TEAMS[v.c][1]}">${v.c}</span> ${esc(v.t)}</figcaption></figure>`).join('')}</div>` : ''}<p class="note">${T('Τα βίντεο φορτώνουν από το YouTube μόνο όταν πατήσεις αναπαραγωγή.', 'Videos load from YouTube only when you press play.', 'Los vídeos se cargan desde YouTube solo cuando pulsas reproducir.', 'Video se učitava sa YouTube-a tek kada pritisneš pusti.')}</p></section>\n` : '';
      const main = `<article class="game">
<p class="kicker">EuroLeague · ${esc(rdTxt(r))}</p>
<h1>${esc(H)} – ${esc(A)}</h1>
<p class="lede">${esc(dt)} ${T('(ώρα Ελλάδας)', '(Athens time)', '(hora de Atenas)', '(po atinskom vremenu)')}${pl ? ` · ${T('Τελικό', 'Final', 'Final', 'Konačan rezultat')} ${sc}` : ''}</p>
<section class="gtop" id="gTop"></section>
${vidSec}<div class="gcols2">
<section><h2>${T('Φόρμα', 'Form', 'Forma', 'Forma')}</h2><p class="sub">${T('Οι 5 τελευταίοι αγώνες κάθε ομάδας', 'Each team’s last 5 games', 'Los últimos 5 partidos de cada equipo', 'Poslednjih 5 utakmica svakog tima')}</p><div class="gcols" id="gForm"></div></section>
<section><h2>${T('Απουσίες', 'Injuries and absences', 'Bajas', 'Odsutni igrači')}</h2><p class="sub">${T('✚ κόκκινο: τραυματίας · ✚ πορτοκαλί: έχει χάσει τους τελευταίους αγώνες', '✚ red: injured · ✚ orange: has missed the latest games', '✚ rojo: lesionado · ✚ naranja: se ha perdido los últimos partidos', '✚ crveno: povređen · ✚ narandžasto: propustio je poslednje utakmice')}</p><div class="gcols" id="gInj"></div></section>
</div>
<section><h2>${pl ? T('Οι κορυφαίοι του αγώνα', 'Top performers', 'Los mejores del partido', 'Najbolji igrači utakmice') : T('Βασικοί παίκτες', 'Key players', 'Jugadores clave', 'Ključni igrači')}</h2><p class="sub">${pl ? T('Κατά PIR στον αγώνα', 'By PIR in the game', 'Por PIR en el partido', 'Po PIR-u na utakmici') : T('Μέσοι όροι σεζόν και πόσες φορές πέρασαν τη γραμμή πόντων τους', 'Season averages and how often they went over their points line', 'Promedios de la temporada y cuántas veces superaron su línea de puntos', 'Proseci u sezoni i koliko puta su prešli svoju liniju poena')}</p><div class="gcols" id="gKey"></div></section>
<section><h2>${T('Σύγκριση ομάδων', 'Team comparison', 'Comparativa de equipos', 'Poređenje timova')}</h2><p class="sub">${T('Ανά αγώνα και ανά 100 κατοχές · σε παρένθεση η θέση στη λίγκα · με έντονα το καλύτερο', 'Per game and per 100 possessions · league rank in brackets · better value in bold', 'Por partido y por 100 posesiones · entre paréntesis, el puesto en la liga · en negrita, el mejor', 'Po utakmici i na 100 poseda · u zagradi mesto u ligi · podebljano bolje')}</p><div class="tbl"><table id="gFactors"></table></div></section>
<section><h2>${T('Άμυνα ανά θέση', 'Defense by position', 'Defensa por posición', 'Odbrana po pozicijama')}</h2><p class="sub">${T('PIR που δίνει κάθε ομάδα ανά αγώνα σε κάθε θέση · σε παρένθεση η θέση στη λίγκα (1η = δίνει τα περισσότερα)', 'PIR each team allows per game at each position · league rank in brackets (1st = allows the most)', 'PIR que concede cada equipo por partido en cada posición · entre paréntesis, el puesto en la liga (1.º = el que más concede)', 'PIR koji svaki tim prima po utakmici na svakoj poziciji · u zagradi mesto u ligi (1. = prima najviše)')}</p><div class="tbl"><table id="gPos"></table></div></section>
<section><h2>${T('Μεταξύ τους φέτος', 'Head-to-head this season', 'Enfrentamientos esta temporada', 'Međusobni dueli ove sezone')}</h2><div id="gH2H"></div></section>
<section id="gTipsSec" hidden><h2>${T('Τα προγνωστικά μας', 'Our predictions', 'Nuestros pronósticos', 'Naše prognoze')}</h2><div id="gTips"></div></section>
<p class="note">${T('Οι εκτιμήσεις είναι στατιστικές και δεν αποτελούν συμβουλή στοιχήματος. Το στοίχημα επιτρέπεται μόνο σε άτομα άνω των 21 ετών. Παίξτε υπεύθυνα.', 'The projections are statistical and are not betting advice. Betting is for adults only (21+ in Greece, 18+ in most countries). Please gamble responsibly.', 'Las estimaciones son estadísticas y no son un consejo de apuestas. Las apuestas son solo para adultos (+21 en Grecia, +18 en España y la mayoría de países). Juega con responsabilidad.', 'Procene su statističke i nisu savet za klađenje. Klađenje je dozvoljeno samo punoletnim osobama (21+ u Grčkoj, 18+ u Srbiji i većini zemalja). Igrajte odgovorno.')}</p>
${doneRounds.includes(r) ? `<p><a class="pread" href="${urlFor(LG, 'recap:' + r)}">${esc(recapTitle(r))} →</a></p>` : ''}<p><a class="pread" href="${urlFor(LG, 'preds')}">${T('Όλα τα προγνωστικά της αγωνιστικής →', 'All predictions for the round →', 'Todos los pronósticos de la jornada →', 'Sve prognoze za kolo →')}</a></p>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</article>`;
      await simplePage(`game:${r}|${h}|${a}`, { view: 'game', id: `${r}|${h}|${a}`, title: `${title} | ${SITE_NAME}`, desc, main });
    }

    // ---- αυτόματο άρθρο «Η αγωνιστική σε αριθμούς» για κάθε ολοκληρωμένη αγωνιστική
    const pUrlB = p => urlFor(LG, 'player:' + p.s), gUrlB = g => urlFor(LG, `game:${g[0]}|${g[2]}|${g[3]}`);
    const nm = p => esc(niceName(p.n));
    const curTeam = (p, r) => { const ts = p.t.split(';'); return ts.length === 1 ? ts[0] : null; };
    for (const r of doneRounds) {
      const gs = league.games.filter(g => g[0] === r && TEAMS[g[2]] && TEAMS[g[3]]);
      const M = teamModel(players, r);
      const perf = [];
      for (const p of players) for (const row of p.g) if (row[0] === r && row[7] > 0) {
        const prev = p.g.filter(x => x[0] < r && x[7] > 0), avg = prev.length ? prev.reduce((a, x) => a + x[25], 0) / prev.length : null;
        const mins = prev.length ? prev.reduce((a, x) => a + x[7], 0) / prev.length / 60 : 0;
        const g = gs.find(z => z[2] === row[2] || z[3] === row[2]); const team = g ? (g[2] === row[2] ? g[3] : g[2]) : curTeam(p);
        perf.push({ p, row, avg, prevN: prev.length, mins, team });
      }
      perf.sort((a, b) => b.row[25] - a.row[25]);
      const homeW = gs.filter(g => g[4] > g[5]).length, totPts = gs.reduce((a, g) => a + g[4] + g[5], 0);
      const picks = gs.map(g => ({ g, x: M.predict(g[2], g[3]) })).filter(o => o.x);
      const hits = picks.filter(o => (o.x.prob >= 0.5) === (o.g[4] > o.g[5])).length;
      const ups = picks.map(o => ({ ...o, wp: o.g[4] > o.g[5] ? o.x.prob : 1 - o.x.prob })).filter(o => o.wp < 0.4).sort((a, b) => a.wp - b.wp);
      const over = perf.filter(o => o.prevN >= 3 && o.mins >= 10 && o.avg !== null).map(o => ({ ...o, d: o.row[25] - o.avg })).sort((a, b) => b.d - a.d).slice(0, 5);
      const best = (f) => perf.slice().sort((a, b) => f(b.row) - f(a.row))[0];
      const bigW = gs.slice().sort((a, b) => Math.abs(b[4] - b[5]) - Math.abs(a[4] - a[5]))[0], close = gs.slice().sort((a, b) => Math.abs(a[4] - a[5]) - Math.abs(b[4] - b[5]))[0], high = gs.slice().sort((a, b) => (b[4] + b[5]) - (a[4] + a[5]))[0];
      const mvp = perf[0];
      const sc = g => LG === 'sr' ? `${g[4]}:${g[5]}` : `${g[4]}-${g[5]}`;
      const gname = g => `${esc(tName(g[2]))} – ${esc(tName(g[3]))}`;
      const plink = o => `<a href="${pUrlB(o.p)}">${nm(o.p)}</a>`;
      const intro = T(`Οι γηπεδούχοι κέρδισαν ${homeW} από τους ${gs.length} αγώνες της ${r}ης αγωνιστικής, με μέσο όρο ${f1(totPts / gs.length)} πόντους ανά αγώνα.`, `Home teams won ${homeW} of the ${gs.length} games in Round ${r}, with an average of ${f1(totPts / gs.length)} points per game.`, `Los locales ganaron ${homeW} de los ${gs.length} partidos de la jornada ${r}, con una media de ${f1(totPts / gs.length)} puntos por partido.`, `Domaćini su dobili ${homeW} od ${gs.length} utakmica ${r}. kola, uz prosek od ${f1(totPts / gs.length)} poena po utakmici.`)
        + (mvp ? ' ' + T(`Ο κορυφαίος σε PIR ήταν ο ${plink(mvp)} με ${mvp.row[25]}.`, `The top performer by PIR was ${plink(mvp)} with ${mvp.row[25]}.`, `El mejor por PIR fue ${plink(mvp)}, con ${mvp.row[25]}.`, `Najbolji po PIR-u bio je ${plink(mvp)} sa ${mvp.row[25]}.`) : '')
        + (picks.length ? ' ' + T(`Το μοντέλο μας βρήκε τον νικητή σε ${hits} από τους ${picks.length} αγώνες.`, `Our model picked the winner in ${hits} of ${picks.length} games.`, `Nuestro modelo acertó el ganador en ${hits} de ${picks.length} partidos.`, `Naš model je pogodio pobednika na ${hits} od ${picks.length} utakmica.`) : '');
      const resRows = gs.map(g => { const o = picks.find(z => z.g === g); const fav = o ? (o.x.prob >= 0.5 ? g[2] : g[3]) : null, ok = o ? fav === (g[4] > g[5] ? g[2] : g[3]) : null;
        return `<a href="${gUrlB(g)}"><span class="res ${ok === null ? 'q' : ok ? 'w' : 'l'}" title="${esc(T('Πρόβλεψη μοντέλου', 'Model pick', 'Pronóstico del modelo', 'Prognoza modela'))}">${ok === null ? '–' : ok ? '✓' : '✗'}</span>${gname(g)}${VIDS.hl[`${g[0]}|${g[2]}|${g[3]}`] ? `<span class="vmark" title="${esc(T('Με βίντεο', 'With video', 'Con vídeo', 'Sa videom'))}">▶</span>` : ''}<small>${sc(g)}</small></a>`; }).join('');
      const topRows = perf.slice(0, 10).map(o => `<tr><td class="l"><a class="tlink" href="${pUrlB(o.p)}"><span>${nm(o.p)}</span></a></td><td class="l">${esc(o.team ? tName(o.team) : '')}</td><td>${o.row[8]}</td><td>${o.row[15] + o.row[16]}</td><td>${o.row[17]}</td><td><b>${o.row[25]}</b></td></tr>`).join('');
      const upsHtml = ups.length ? `<ul>${ups.map(o => { const w = o.g[4] > o.g[5] ? o.g[2] : o.g[3], l = w === o.g[2] ? o.g[3] : o.g[2];
          const gl = `<a href="${gUrlB(o.g)}">${gname(o.g)} ${sc(o.g)}</a>`, pc = Math.round(o.wp * 100);
          return `<li>${T(`${gl}: το μοντέλο έδινε μόνο ${pc}% στον νικητή (<b>${esc(tName(w))}</b>).`, `${gl}: the model gave the winner (<b>${esc(tName(w))}</b>) only ${pc}%.`, `${gl}: el modelo solo le daba un ${pc}% al ganador (<b>${esc(tName(w))}</b>).`, `${gl}: model je pobedniku (<b>${esc(tName(w))}</b>) davao samo ${pc}%.`)}</li>`; }).join('')}</ul>`
        : `<p>${picks.length ? T('Καμία μεγάλη έκπληξη: κανένας νικητής δεν είχε πιθανότητα κάτω από 40% στο μοντέλο.', 'No big upsets: no winner had less than a 40% chance in the model.', 'Ninguna gran sorpresa: ningún ganador tenía menos de un 40% en el modelo.', 'Nema velikih iznenađenja: nijedan pobednik nije imao šansu manju od 40% u modelu.') : T('Χρειάζονται τουλάχιστον 2 αγωνιστικές για το μοντέλο.', 'The model needs at least 2 rounds of data.', 'El modelo necesita al menos 2 jornadas de datos.', 'Modelu su potrebna najmanje 2 kola podataka.')}</p>`;
      const overHtml = over.length ? `<ul>${over.map(o => `<li>${plink(o)} (${esc(o.team ? tName(o.team) : '')}): <b>${o.row[25]}</b> PIR, ${T('ενώ ο μέσος όρος του ήταν', 'against a previous average of', 'frente a un promedio previo de', 'naspram prethodnog proseka od')} ${f1(o.avg)} (+${f1(o.d)})</li>`).join('')}</ul>` : '';
      const rec = [];
      const bp = best(x => x[8]), br = best(x => x[15] + x[16]), ba = best(x => x[17]), b3 = best(x => x[11]);
      if (bp) rec.push([T('Περισσότεροι πόντοι', 'Most points', 'Más puntos', 'Najviše poena'), `${plink(bp)} · ${bp.row[8]}`]);
      if (br) rec.push([T('Περισσότερα ριμπάουντ', 'Most rebounds', 'Más rebotes', 'Najviše skokova'), `${plink(br)} · ${br.row[15] + br.row[16]}`]);
      if (ba) rec.push([T('Περισσότερες ασίστ', 'Most assists', 'Más asistencias', 'Najviše asistencija'), `${plink(ba)} · ${ba.row[17]}`]);
      if (b3 && b3.row[11] > 0) rec.push([T('Περισσότερα τρίποντα', 'Most threes', 'Más triples', 'Najviše trojki'), `${plink(b3)} · ${b3.row[11]}`]);
      if (bigW) rec.push([T('Μεγαλύτερη διαφορά', 'Biggest margin', 'Mayor diferencia', 'Najveća razlika'), `<a href="${gUrlB(bigW)}">${gname(bigW)} ${sc(bigW)}</a>`]);
      if (close) rec.push([T('Πιο αμφίρροπος αγώνας', 'Closest game', 'Partido más igualado', 'Najneizvesnija utakmica'), `<a href="${gUrlB(close)}">${gname(close)} ${sc(close)}</a>`]);
      if (high) rec.push([T('Περισσότεροι πόντοι σε αγώνα', 'Highest-scoring game', 'Partido con más puntos', 'Utakmica sa najviše poena'), `<a href="${gUrlB(high)}">${gname(high)} ${sc(high)}</a> (${high[4] + high[5]})`]);
      const nx = league.games.some(g => g[0] === r + 1);
      const main = `<article class="article recap">
<p class="sub"><a href="${urlFor(LG, 'articles')}">${T('Άρθρα', 'Articles', 'Artículos', 'Članci')}</a> · ${esc(rdTxt0(r))}</p>
<h1>${esc(recapTitle(r))}</h1>
<p class="lede2">${intro}</p>
<h2>${T('Τα αποτελέσματα', 'The results', 'Los resultados', 'Rezultati')}</h2>
<p class="sub">${T('✓ / ✗: αν το μοντέλο μας είχε βρει τον νικητή πριν από την αγωνιστική', '✓ / ✗: whether our model had picked the winner before the round', '✓ / ✗: si nuestro modelo había acertado el ganador antes de la jornada', '✓ / ✗: da li je naš model pre kola pogodio pobednika')}</p>
<div class="glist">${resRows}</div>
<h2>${T('Οι κορυφαίοι της αγωνιστικής', 'Top performers of the round', 'Los mejores de la jornada', 'Najbolji igrači kola')}</h2>
<div class="tbl"><table><thead><tr><th>${T('Παίκτης', 'Player', 'Jugador', 'Igrač')}</th><th>${T('Ομάδα', 'Team', 'Equipo', 'Tim')}</th><th>${T('Πόντ.', 'Pts', 'Pts', 'Poeni')}</th><th>${T('Ριμπ.', 'Reb', 'Reb', 'Skok')}</th><th>${T('Ασίστ', 'Ast', 'Asis', 'Asist')}</th><th>PIR</th></tr></thead><tbody>${topRows}</tbody></table></div>
<h2>${T('Οι εκπλήξεις', 'The upsets', 'Las sorpresas', 'Iznenađenja')}</h2>
${upsHtml}
${overHtml ? `<h2>${T('Πάνω από τον εαυτό τους', 'Above their usual level', 'Por encima de su nivel', 'Iznad svog proseka')}</h2><p class="sub">${T('Η μεγαλύτερη διαφορά PIR σε σχέση με τον μέσο όρο τους πριν από την αγωνιστική', 'The biggest PIR jump compared with their average before the round', 'La mayor subida de PIR respecto a su promedio antes de la jornada', 'Najveći skok PIR-a u odnosu na prosek pre kola')}</p>${overHtml}` : ''}
<h2>${T('Τα ρεκόρ της αγωνιστικής', 'Round records', 'Los récords de la jornada', 'Rekordi kola')}</h2>
<div class="tbl"><table><tbody>${rec.map(([l, v]) => `<tr><td class="l">${l}</td><td class="l">${v}</td></tr>`).join('')}</tbody></table></div>
<p><a class="pread" href="${urlFor(LG, 'home')}">${T('Η βαθμολογία και οι πιθανότητες για playoffs →', 'Standings and playoff odds →', 'La clasificación y las probabilidades de playoffs →', 'Tabela i šanse za plej-of →')}</a></p>
${nx ? `<p><a class="pread" href="${urlFor(LG, 'preds')}">${T('Τα προγνωστικά της επόμενης αγωνιστικής →', 'Predictions for the next round →', 'Pronósticos de la próxima jornada →', 'Prognoze za sledeće kolo →')}</a></p>` : ''}
<p class="note">${T('Το άρθρο γράφεται αυτόματα από τα επίσημα στατιστικά της EuroLeague.', 'This article is generated automatically from official EuroLeague stats.', 'Este artículo se genera automáticamente con las estadísticas oficiales de la EuroLeague.', 'Ovaj članak se automatski generiše iz zvaničnih statistika Evrolige.')}</p>
</article>`;
      const desc = T(`Αποτελέσματα, κορυφαίοι παίκτες, εκπλήξεις και ρεκόρ της ${r}ης αγωνιστικής της ${S}.`, `Results, top performers, upsets and records from Round ${r} of the ${S}.`, `Resultados, mejores jugadores, sorpresas y récords de la jornada ${r} de la ${S}.`, `Rezultati, najbolji igrači, iznenađenja i rekordi ${r}. kola ${S}.`);
      await simplePage('recap:' + r, { view: 'articles', title: `${recapTitle(r)} | ${SITE_NAME}`, desc, main });
    }

    // ---- widgets για άλλα sites (δεν μπαίνουν στη Google) και σελίδα με τον κώδικα
    const wCss = `<style>:root{--bg:#fffdf9;--ink:#1d2330;--mut:#5f6573;--line:#dcd7cc;--acc:#c4501f;--good:#2f7d55;--mid:#c79a2a;--low:#b9473a}@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#1b1f28;--ink:#ebe7df;--mut:#a2a6b0;--line:#2f3440;--acc:#e9773f;--good:#4fb383;--mid:#d9ae45;--low:#e06a5c}}:root[data-theme=dark]{--bg:#1b1f28;--ink:#ebe7df;--mut:#a2a6b0;--line:#2f3440;--acc:#e9773f;--good:#4fb383;--mid:#d9ae45;--low:#e06a5c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.35 "Fira Sans","Segoe UI",Roboto,Arial,sans-serif}a{color:inherit;text-decoration:none}a:hover{color:var(--acc)}
.w{padding:10px 12px}.wh{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px}.wh b{font-weight:800;text-transform:uppercase;letter-spacing:.3px}.wh b i{font-style:normal;color:var(--acc)}.wh span{color:var(--mut);font-size:12px}
table{width:100%;border-collapse:collapse}td,th{padding:5px 4px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th{font-size:11px;color:var(--mut);font-weight:600;text-transform:uppercase}td.l,th.l{text-align:left}td.t{width:100%;overflow:hidden;text-overflow:ellipsis;max-width:0}
.c{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;color:#fff;font-size:8px;font-weight:800;vertical-align:middle;margin-right:6px}.z{display:inline-block;width:3px;height:14px;border-radius:2px;margin-right:5px;vertical-align:middle}.z1{background:var(--good)}.z2{background:var(--mid)}.z0{background:transparent}
.f b{display:inline-block;width:14px;height:14px;line-height:14px;text-align:center;border-radius:3px;font-size:9px;color:#fff;margin-left:1px}.f .W{background:var(--good)}.f .L{background:var(--low)}
.g{border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:6px;display:grid;gap:4px}.g .r{display:flex;justify-content:space-between;gap:8px}.g small{color:var(--mut)}.bar{display:flex;height:5px;border-radius:3px;overflow:hidden;background:var(--line)}.bar i{display:block}
.wf{margin-top:8px;font-size:11px;color:var(--mut);display:flex;justify-content:space-between;gap:8px}.wf a{color:var(--acc);font-weight:600}</style>
<script>try{var t=new URLSearchParams(location.search).get('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}</script>`;
    const wHead = (title) => `<!doctype html><html lang="${LG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>${wCss}</head><body>`;
    const crestW = c => `<span class="c" style="background:${TEAMS[c] ? TEAMS[c][1] : '#555'}">${c}</span>`;
    const brand = `<b>Basketball<i>Stats</i></b>`;
    const foot = `<div class="wf"><span>${esc(UPD[LG])}</span><a href="${SITE_URL}${B(LG)}" target="_blank" rel="noopener">basketballstats.eu</a></div>`;
    const ext = u => `${SITE_URL}${u}" target="_blank" rel="noopener`;
    const stRows = league.stand.filter(s => TEAMS[s[1]]).map(s => { const [pos, c, w, l, pf, pa, , , f] = s; const z = pos <= 6 ? 'z1' : pos <= 10 ? 'z2' : 'z0';
      return `<tr><td><span class="z ${z}"></span>${pos}</td><td class="l t"><a href="${ext(urlFor(LG, 'team:' + c))}">${crestW(c)}${esc(tName(c))}</a></td><td>${w}-${l}</td><td>${pf - pa > 0 ? '+' : ''}${pf - pa}</td><td class="f">${String(f || '').split('').map(x => `<b class="${x}">${x === 'W' ? T('Ν', 'W', 'V', 'P') : T('Η', 'L', 'D', 'I')}</b>`).join('')}</td></tr>`; }).join('');
    await write(urlFor(LG, 'widget:st'), `${wHead(T('Βαθμολογία EuroLeague', 'EuroLeague standings', 'Clasificación de la EuroLeague', 'Tabela Evrolige'))}<div class="w"><div class="wh">${brand}<span>${esc(T('Βαθμολογία', 'Standings', 'Clasificación', 'Tabela'))} ${esc(SEASON_LABEL)}</span></div>
<table><thead><tr><th>#</th><th class="l">${T('Ομάδα', 'Team', 'Equipo', 'Tim')}</th><th>${T('Ν-Η', 'W-L', 'V-D', 'P-I')}</th><th>+/−</th><th>${T('Φόρμα', 'Form', 'Forma', 'Forma')}</th></tr></thead><tbody>${stRows}</tbody></table>${foot}</div></body></html>`);
    const Mnow = teamModel(players);
    const nxt = league.games.filter(g => g[0] === nextR && TEAMS[g[2]] && TEAMS[g[3]]);
    const rdRows = nxt.map(g => { const x = Mnow.predict(g[2], g[3]); const d = gDateB(g[1]);
      const dt = d.toLocaleString(LOC, { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      return `<a class="g" href="${ext(urlFor(LG, `game:${g[0]}|${g[2]}|${g[3]}`))}"><small>${esc(dt)}</small><div class="r"><span>${crestW(g[2])}${esc(tName(g[2]))}</span><b>${x ? Math.round(x.ph) : ''}</b></div><div class="r"><span>${crestW(g[3])}${esc(tName(g[3]))}</span><b>${x ? Math.round(x.pa) : ''}</b></div>${x ? `<div class="bar"><i style="width:${Math.round(x.prob * 100)}%;background:${TEAMS[g[2]][1]}"></i><i style="width:${100 - Math.round(x.prob * 100)}%;background:${TEAMS[g[3]][1]}"></i></div><small>${esc(T('Εκτίμηση', 'Projection', 'Estimación', 'Procena'))}: ${esc(tName(x.prob >= 0.5 ? g[2] : g[3]))} ${Math.round(Math.max(x.prob, 1 - x.prob) * 100)}%</small>` : ''}</a>`; }).join('');
    await write(urlFor(LG, 'widget:rd'), `${wHead(T('Προγνωστικά EuroLeague', 'EuroLeague predictions', 'Pronósticos de la EuroLeague', 'Prognoze Evrolige'))}<div class="w"><div class="wh">${brand}<span>${esc(rdTxt0(nextR))} · ${esc(T('εκτιμήσεις', 'projections', 'estimaciones', 'procene'))}</span></div>${rdRows || `<p>${T('Δεν υπάρχουν προγραμματισμένοι αγώνες.', 'No scheduled games.', 'No hay partidos programados.', 'Nema zakazanih utakmica.')}</p>`}
<div class="wf"><span>${esc(T('Στατιστική εκτίμηση, όχι συμβουλή στοιχήματος · 21+', 'Statistical estimate, not betting advice · 18+', 'Estimación estadística, no un consejo de apuestas · +18', 'Statistička procena, a ne savet za klađenje · 18+'))}</span><a href="${SITE_URL}${B(LG)}" target="_blank" rel="noopener">basketballstats.eu</a></div></div></body></html>`);
    const code = (u, h, label) => `<iframe src="${SITE_URL}${u}" width="100%" height="${h}" style="border:0;max-width:460px;display:block" loading="lazy" title="${label}"></iframe>\n<p style="font:12px sans-serif;margin:4px 0 0">${label} ${T('από', 'by', 'por', 'od')} <a href="${SITE_URL}${B(LG)}">BasketballStats</a></p>`;
    const wBlock = (key, h, label, desc) => `<section class="wbox"><h2>${label}</h2><p class="sub">${desc}</p><div class="wprev"><iframe src="${urlFor(LG, key)}" height="${h}" loading="lazy" title="${esc(label)}"></iframe></div><p class="sub">${T('Αντέγραψε τον κώδικα και βάλε τον στη σελίδα σου:', 'Copy the code and paste it into your page:', 'Copia el código y pégalo en tu página:', 'Kopiraj kod i nalepi ga na svoju stranicu:')}</p><textarea readonly rows="5" onclick="this.select()">${esc(code(urlFor(LG, key), h, label))}</textarea><button type="button" class="wcopy">${T('Αντιγραφή κώδικα', 'Copy code', 'Copiar código', 'Kopiraj kod')}</button></section>`;
    await simplePage('widgets', { view: 'widgets', title: T(`Widget EuroLeague για το site σου: βαθμολογία και προγνωστικά | ${SITE_NAME}`, `Free EuroLeague widgets for your site: standings and predictions | ${SITE_NAME}`, `Widgets gratis de la EuroLeague para tu web: clasificación y pronósticos | ${SITE_NAME}`, `Besplatni vidžeti Evrolige za tvoj sajt: tabela i prognoze | ${SITE_NAME}`),
      desc: T('Βάλε δωρεάν στο site ή στο blog σου τη βαθμολογία της EuroLeague και τις εκτιμήσεις της αγωνιστικής, με αυτόματη ενημέρωση.', 'Add the EuroLeague standings and round projections to your site or blog for free, updated automatically.', 'Añade gratis a tu web o blog la clasificación de la EuroLeague y las estimaciones de la jornada, con actualización automática.', 'Dodaj besplatno na svoj sajt ili blog tabelu Evrolige i procene kola, uz automatsko ažuriranje.'),
      main: `<section class="article"><h1>${T('Widget για το site σου', 'Widgets for your site', 'Widgets para tu web', 'Vidžeti za tvoj sajt')}</h1><p class="lede2">${T('Δωρεάν, χωρίς εγγραφή. Ενημερώνονται αυτόματα μετά από κάθε αγωνιστική και προσαρμόζονται σε φωτεινό ή σκούρο θέμα. Για σταθερό θέμα, πρόσθεσε ?theme=light ή ?theme=dark στο τέλος της διεύθυνσης.', 'Free, no sign-up. They update automatically after every round and follow light or dark mode. For a fixed theme, add ?theme=light or ?theme=dark to the end of the address.', 'Gratis y sin registro. Se actualizan automáticamente después de cada jornada y se adaptan al modo claro u oscuro. Para un tema fijo, añade ?theme=light o ?theme=dark al final de la dirección.', 'Besplatno, bez registracije. Automatski se ažuriraju posle svakog kola i prilagođavaju svetloj ili tamnoj temi. Za fiksnu temu dodaj ?theme=light ili ?theme=dark na kraj adrese.')}</p></section>
${wBlock('widget:st', 730, T('Βαθμολογία EuroLeague', 'EuroLeague standings', 'Clasificación de la EuroLeague', 'Tabela Evrolige'), T('Η βαθμολογία με ρεκόρ, διαφορά πόντων και φόρμα. Οι ομάδες οδηγούν στη σελίδα τους.', 'The standings with record, point difference and form. Teams link to their page.', 'La clasificación con balance, diferencia de puntos y forma. Los equipos enlazan a su página.', 'Tabela sa skorom, razlikom poena i formom. Timovi vode na svoju stranicu.'))}
${wBlock('widget:rd', 1230, T('Προγνωστικά EuroLeague', 'EuroLeague predictions', 'Pronósticos de la EuroLeague', 'Prognoze Evrolige'), T('Οι αγώνες της επόμενης αγωνιστικής με εκτίμηση σκορ και πιθανότητα νίκης. Κάθε αγώνας οδηγεί στην ανάλυσή του.', 'Next round’s games with projected score and win probability. Each game links to its preview.', 'Los partidos de la próxima jornada con marcador estimado y probabilidad de victoria. Cada partido enlaza a su previa.', 'Utakmice sledećeg kola sa procenjenim rezultatom i verovatnoćom pobede. Svaka utakmica vodi na svoju najavu.'))}
<script>document.querySelectorAll('.wcopy').forEach(function(b){b.addEventListener('click',function(){var t=b.previousElementSibling;t.select();var lab=b.textContent;var done=function(){b.textContent='✓';setTimeout(function(){b.textContent=lab;},1500);};if(navigator.clipboard)navigator.clipboard.writeText(t.value).then(done,function(){document.execCommand('copy');done();});else{document.execCommand('copy');done();}});});</script>` });
  }

  const today = new Date().toISOString().slice(0, 10);
  await fs.writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`).join('\n')}
</urlset>
`);
  if (AD_CLIENT) await fs.writeFile(path.join(OUT, 'ads.txt'), `google.com, ${AD_CLIENT.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}${BASE}sitemap.xml\n`);
  await fs.writeFile(path.join(OUT, '404.html'), `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Η σελίδα δεν βρέθηκε · Page not found | ${SITE_NAME}</title><link rel="stylesheet" href="${BASE}assets/app.css"></head><body><main class="wrap one" style="padding-block:60px"><section><h2>Η σελίδα δεν βρέθηκε</h2><p class="sub">Ίσως ο παίκτης άλλαξε ομάδα ή η διεύθυνση γράφτηκε λάθος.</p><p><a href="${BASE}">Πίσω στη βαθμολογία</a></p></section><section lang="en"><h2>Page not found</h2><p class="sub">The player may have changed teams or the address may be wrong.</p><p><a href="${BASE}en/">Back to the standings</a></p></section></main></body></html>\n`);
  console.log(`Έτοιμο: ${urls.length} σελίδες στον φάκελο dist/ (${UPD.el}).`);
}

main().catch(e => { console.error(e); process.exit(1); });
