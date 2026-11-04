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
import * as OPT from './src/fantasy/optimizer.mjs';
import * as OPTR from './src/fantasy/render.mjs';
import * as AB from './src/analytics/build-analytics.mjs';
import { impliedProbs } from './src/matchup/sim.mjs';
import * as OBM from './src/odds/build-odds.mjs';
import { devig, classify, pirOverProb, internalLine, hitRate, minutesRisk } from './src/odds/core.mjs';
import * as SB from './src/shots/build-shots.mjs';
import { describe as shDescribe } from './src/shots/zones.mjs';
import { miniHeat } from './src/shots/court.mjs';
import * as CB from './src/compare/build-compare.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONF = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8').catch(() => '{}'));
const SITE_URL = (process.env.SITE_URL || CONF.siteUrl || 'https://example.gr').replace(/\/$/, '');
let BASE = process.env.SITE_BASE || CONF.base || '/';
if (!BASE.endsWith('/')) BASE += '/';
const SEASON = process.env.SEASON || CONF.season || 'E2026';
const SITE_NAME = CONF.siteName || 'BasketballStats';
const AD_CLIENT = (process.env.ADSENSE_CLIENT || CONF.adsenseClient || '').trim();
const AD_SLOT = (process.env.ADSENSE_SLOT || CONF.adsenseSlot || '').trim();
const GA_ID = (process.env.GA_ID || CONF.gaId || '').trim();
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
  el: { odds: 'apodoseis', shots: 'shot-charts', mc: 'matchup', ana: 'analytika', onoff: 'on-off', lu: 'lineups', hist: 'istoriko', lead: 'koryfaioi', team: 'omada', player: 'paiktis', form: 'thermometro', fantasy: 'fantasy', preds: 'prognostika', articles: 'arthra', tipsters: 'tipsters', legal: 'politiki-aporritou', app: 'efarmogi', game: 'agonas', widgets: 'widget', compare: 'sygkrisi', model: 'montelo' },
  en: { odds: 'odds', shots: 'shot-charts', mc: 'matchup', ana: 'team-analytics', onoff: 'on-off', lu: 'lineups', hist: 'history', lead: 'leaders', team: 'team', player: 'player', form: 'thermometer', fantasy: 'fantasy', preds: 'predictions', articles: 'articles', tipsters: 'tipsters', legal: 'privacy', app: 'app', game: 'game', widgets: 'widget', compare: 'compare', model: 'model' },
  es: { odds: 'cuotas', shots: 'shot-charts', mc: 'matchup', ana: 'analitica', onoff: 'on-off', lu: 'quintetos', hist: 'historico', lead: 'lideres', team: 'equipo', player: 'jugador', form: 'termometro', fantasy: 'fantasy', preds: 'pronosticos', articles: 'articulos', tipsters: 'tipsters', legal: 'privacidad', app: 'app', game: 'partido', widgets: 'widget', compare: 'comparar', model: 'modelo' },
  sr: { odds: 'kvote', shots: 'shot-charts', mc: 'matchup', ana: 'analitika', onoff: 'on-off', lu: 'postave', hist: 'istorija', lead: 'lideri', team: 'tim', player: 'igrac', form: 'termometar', fantasy: 'fantasy', preds: 'prognoze', articles: 'clanci', tipsters: 'tipsters', legal: 'privatnost', app: 'aplikacija', game: 'utakmica', widgets: 'widget', compare: 'poredjenje', model: 'model' },
};
const LEAD_SUB = {
  el: { pts: 'pontoi', reb: 'ribaount', ast: 'asist', pir: 'pir', tpm: 'triponta', stl: 'klepsimata', blk: 'kopsimata', rec: 'rekor-agona', gr: 'ellines-paiktes', yg: 'neoteroi-paiktes' },
  en: { pts: 'points', reb: 'rebounds', ast: 'assists', pir: 'pir', tpm: 'three-pointers', stl: 'steals', blk: 'blocks', rec: 'single-game-records', gr: 'greek-players', yg: 'youngest-players' },
  es: { pts: 'puntos', reb: 'rebotes', ast: 'asistencias', pir: 'pir', tpm: 'triples', stl: 'robos', blk: 'tapones', rec: 'records-partido', gr: 'jugadores-griegos', yg: 'jugadores-mas-jovenes' },
  sr: { pts: 'poeni', reb: 'skokovi', ast: 'asistencije', pir: 'pir', tpm: 'trojke', stl: 'ukradene-lopte', blk: 'blokade', rec: 'rekordi-utakmice', gr: 'grcki-igraci', yg: 'najmladji-igraci' },
};
const natSlug = (lg, iso) => { try { return slugify(new Intl.DisplayNames([{ el: 'el', en: 'en', es: 'es', sr: 'sr-Latn' }[lg]], { type: 'region' }).of(iso.toUpperCase())) || iso; } catch { return iso; } };
const monthSlug = (lg, ym) => slugify(new Date(ym + '-15T12:00:00Z').toLocaleDateString({ el: 'el-GR', en: 'en-GB', es: 'es-ES', sr: 'sr-Latn-RS' }[lg], { month: 'long', timeZone: 'UTC' })) + '-' + ym.slice(0, 4);
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
    live: { live: 'LIVE', final: 'Τελικό', q: '{n}ο δεκάλεπτο', ot: 'Παράταση', ht: 'Ημίχρονο', soon: 'Ξεκινά σύντομα', leaders: 'Πρωταγωνιστές', auto: 'Ζωντανή ενημέρωση κάθε 30 δευτερόλεπτα από τα επίσημα στοιχεία της EuroLeague', pts: 'π.', reb: 'ρ.', ast: 'ασ.' },
    my: { title: 'Η ομάδα μου', set: '☆ Κάνε την «ομάδα μου»', unset: '★ Η ομάδα μου', pick: 'Διάλεξε την ομάδα σου για να βλέπεις πρώτα τον επόμενο αγώνα της', choose: 'Επίλεξε ομάδα…', next: 'Επόμενος αγώνας', last: 'Τελευταίος αγώνας', odds: 'Playoffs', inj: 'Απουσίες', none: 'καμία', change: 'αλλαγή', cal: '📅 Πρόγραμμα στο ημερολόγιο', calI: 'iPhone / Mac / Outlook', calG: 'Google Calendar', calF: 'Αρχείο .ics', calHelp: 'Οι αγώνες μπαίνουν στο ημερολόγιό σου και ενημερώνονται μόνοι τους (ώρα, αποτέλεσμα).' },
    cmp: { link: 'Σύγκρινε με άλλον παίκτη →', a: 'Πρώτος παίκτης', b: 'Δεύτερος παίκτης', ph: 'Γράψε όνομα παίκτη…', swap: '⇄', per: 'Ανά αγώνα', shoot: 'Ευστοχία', form: 'Φόρμα', rank: 'Κατάταξη στη λίγκα (εκατοστημόριο)', pick: 'Διάλεξε δύο παίκτες για σύγκριση.', games: 'Αγώνες', min: 'Λεπτά', pts: 'Πόντοι', reb: 'Ριμπάουντ', ast: 'Ασίστ', stl: 'Κλεψίματα', blk: 'Κοψίματα', tov: 'Λάθη', pir: 'PIR', pm: '+/−', p2: '2π%', p3: '3π%', ft: 'Βολές %', ts: 'True Shooting', l5: 'PIR τελευταίων 5', heat: 'Θερμόμετρο', share: 'Το link της σύγκρισης μπορείς να το μοιραστείς.' },
    modelLink: 'Πόσο πέφτει μέσα το μοντέλο μας →',
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
    live: { live: 'LIVE', final: 'Final', q: 'Q{n}', ot: 'Overtime', ht: 'Half-time', soon: 'Starting soon', leaders: 'Leaders', auto: 'Live updates every 30 seconds from official EuroLeague data', pts: 'pts', reb: 'reb', ast: 'ast' },
    my: { title: 'My team', set: '☆ Make it “my team”', unset: '★ My team', pick: 'Pick your team to see its next game first', choose: 'Choose a team…', next: 'Next game', last: 'Last game', odds: 'Playoffs', inj: 'Absences', none: 'none', change: 'change', cal: '📅 Schedule in your calendar', calI: 'iPhone / Mac / Outlook', calG: 'Google Calendar', calF: '.ics file', calHelp: 'The games go into your calendar and update by themselves (time, result).' },
    cmp: { link: 'Compare with another player →', a: 'First player', b: 'Second player', ph: 'Type a player’s name…', swap: '⇄', per: 'Per game', shoot: 'Shooting', form: 'Form', rank: 'League rank (percentile)', pick: 'Pick two players to compare.', games: 'Games', min: 'Minutes', pts: 'Points', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks', tov: 'Turnovers', pir: 'PIR', pm: '+/−', p2: '2P%', p3: '3P%', ft: 'FT%', ts: 'True Shooting', l5: 'PIR last 5', heat: 'Thermometer', share: 'You can share the link of this comparison.' },
    modelLink: 'How accurate is our model →',
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
    live: { live: 'EN VIVO', final: 'Final', q: '{n}.º cuarto', ot: 'Prórroga', ht: 'Descanso', soon: 'Empieza pronto', leaders: 'Destacados', auto: 'Actualización en vivo cada 30 segundos con los datos oficiales de la EuroLeague', pts: 'pts', reb: 'reb', ast: 'asis' },
    my: { title: 'Mi equipo', set: '☆ Hacerlo «mi equipo»', unset: '★ Mi equipo', pick: 'Elige tu equipo para ver primero su próximo partido', choose: 'Elige un equipo…', next: 'Próximo partido', last: 'Último partido', odds: 'Playoffs', inj: 'Bajas', none: 'ninguna', change: 'cambiar', cal: '📅 Calendario en tu agenda', calI: 'iPhone / Mac / Outlook', calG: 'Google Calendar', calF: 'Archivo .ics', calHelp: 'Los partidos se añaden a tu calendario y se actualizan solos (hora, resultado).' },
    cmp: { link: 'Comparar con otro jugador →', a: 'Primer jugador', b: 'Segundo jugador', ph: 'Escribe el nombre de un jugador…', swap: '⇄', per: 'Por partido', shoot: 'Acierto', form: 'Forma', rank: 'Puesto en la liga (percentil)', pick: 'Elige dos jugadores para compararlos.', games: 'Partidos', min: 'Minutos', pts: 'Puntos', reb: 'Rebotes', ast: 'Asistencias', stl: 'Robos', blk: 'Tapones', tov: 'Pérdidas', pir: 'PIR', pm: '+/−', p2: 'T2%', p3: 'T3%', ft: 'TL%', ts: 'True Shooting', l5: 'PIR últimos 5', heat: 'Termómetro', share: 'Puedes compartir el enlace de esta comparación.' },
    modelLink: '¿Cuánto acierta nuestro modelo? →',
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
    live: { live: 'UŽIVO', final: 'Kraj', q: '{n}. četvrtina', ot: 'Produžetak', ht: 'Poluvreme', soon: 'Uskoro počinje', leaders: 'Najbolji', auto: 'Ažuriranje uživo na svakih 30 sekundi iz zvaničnih podataka Evrolige', pts: 'p.', reb: 'sk.', ast: 'as.' },
    my: { title: 'Moj tim', set: '☆ Postavi kao „moj tim”', unset: '★ Moj tim', pick: 'Izaberi svoj tim da prvo vidiš njegovu sledeću utakmicu', choose: 'Izaberi tim…', next: 'Sledeća utakmica', last: 'Poslednja utakmica', odds: 'Plej-of', inj: 'Odsutni', none: 'nema', change: 'promeni', cal: '📅 Raspored u kalendaru', calI: 'iPhone / Mac / Outlook', calG: 'Google Calendar', calF: '.ics fajl', calHelp: 'Utakmice ulaze u tvoj kalendar i same se ažuriraju (vreme, rezultat).' },
    cmp: { link: 'Uporedi sa drugim igračem →', a: 'Prvi igrač', b: 'Drugi igrač', ph: 'Upiši ime igrača…', swap: '⇄', per: 'Po utakmici', shoot: 'Šut', form: 'Forma', rank: 'Mesto u ligi (percentil)', pick: 'Izaberi dva igrača za poređenje.', games: 'Utakmice', min: 'Minuti', pts: 'Poeni', reb: 'Skokovi', ast: 'Asistencije', stl: 'Ukradene', blk: 'Blokade', tov: 'Izgubljene', pir: 'PIR', pm: '+/−', p2: '2P%', p3: '3P%', ft: 'SB%', ts: 'True Shooting', l5: 'PIR poslednjih 5', heat: 'Termometar', share: 'Link ovog poređenja možeš da podeliš.' },
    modelLink: 'Koliko je tačan naš model →',
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
  const venue = Object.fromEntries((gamesRes?.data || []).filter(x => x.venue?.name).map(x => [`${x.round.round}|${x.home.code}|${x.away.code}`, x.venue.name.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (m, p, c) => p + c.toUpperCase())]));

  const playedRounds = games.filter(g => g[6]).map(g => g[0]);
  const lastRound = playedRounds.length ? Math.max(...playedRounds) : 0;
  let stand = [];
  if (lastRound) {
    const st = await get(`${FEED}/v3/competitions/E/seasons/${SEASON}/rounds/${lastRound}/basicstandings`);
    stand = (st?.teams || []).map(t => [t.position, t.club.code, t.gamesWon, t.gamesLost, t.pointsFor, t.pointsAgainst,
      t.homeRecord, t.awayRecord, (t.last5Form || []).join(''), t.positionChange]);
  }
  return { players, league: { stand, games }, venue, lastRound, fetchedAt: new Date().toISOString() };
}

// ---------- ιστορικό: προηγούμενες σεζόν της EuroLeague (κατεβαίνουν μία φορά και μένουν στο cache)
const HIST_FROM = 2016;
async function fetchSeasonHist(code) {
  const q = `seasonMode=Single&seasonCode=${code}&limit=1000`;
  const [tr, gr] = await Promise.all([
    get(`${FEED}/v3/competitions/E/statistics/players/traditional?${q}&statisticMode=PerGame`),
    get(`${FEED}/v2/competitions/E/seasons/${code}/games?limit=500`),
  ]);
  const games = gr?.data || [];
  if (!games.length || !(tr?.players || []).length) return null;
  const rs = games.filter(x => x.phaseType?.code === 'RS');
  const rsMax = rs.length ? Math.max(...rs.map(x => x.round.round)) : 0;
  let stand = [];
  if (rsMax) { const st = await get(`${FEED}/v3/competitions/E/seasons/${code}/rounds/${rsMax}/basicstandings`); stand = (st?.teams || []).map(t => [t.position, t.club.code, t.club.name, t.gamesWon, t.gamesLost, t.pointsFor, t.pointsAgainst]); }
  const ff = games.filter(x => x.phaseType?.code === 'FF' && x.status === 'result');
  let final = null;
  if (ff.length) {
    const mx = Math.max(...ff.map(x => x.round.round));
    const sfW = new Set(ff.filter(x => x.round.round < mx).map(x => (x.home.score > x.away.score ? x.home.code : x.away.code)));
    const f = ff.filter(x => x.round.round === mx).find(x => sfW.has(x.home.code) && sfW.has(x.away.code)) || ff.filter(x => x.round.round === mx).pop();
    if (f) final = [f.home.code, f.home.name, f.home.score, f.away.code, f.away.name, f.away.score, f.date.slice(0, 10)];
  }
  const r1 = x => Math.round((x || 0) * 10) / 10;
  const rows = tr.players.map(p => [p.player.code, p.player.name, p.player.team.code, p.player.team.name, p.gamesPlayed || 0, r1(p.minutesPlayed), r1(p.pointsScored), r1(p.totalRebounds), r1(p.assists), r1(p.pir)]);
  return { code, rsMax, stand, final, rows };
}
async function fetchHistory(old) {
  const H = { ...(old || {}) };
  const cur = +SEASON.slice(1);
  for (let y = HIST_FROM; y < cur; y++) {
    const code = 'E' + y;
    if (H[code] && H[code].rows?.length) continue;
    try { const s = await fetchSeasonHist(code); if (s) { H[code] = s; console.log(`Ιστορικό ${code}: ${s.rows.length} παίκτες, ${s.stand.length} ομάδες`); } }
    catch (e) { console.error('Ιστορικό: αποτυχία', code, e.message); }
  }
  return H;
}

// ---------- EuroCup: ίδια επίσημη πηγή, μόνο βαθμολογία ομίλων, αγώνες και μέσοι όροι παικτών
const EC_SEASON = 'U' + SEASON.slice(1);
async function fetchEurocup() {
  const q = `seasonMode=Single&seasonCode=${EC_SEASON}&limit=500`;
  const [gr, tr] = await Promise.all([
    get(`${FEED}/v2/competitions/U/seasons/${EC_SEASON}/games?limit=500`),
    get(`${FEED}/v3/competitions/U/statistics/players/traditional?${q}&statisticMode=PerGame`),
  ]);
  const teams = {};
  const games = (gr?.data || []).map(x => {
    for (const t of [x.home, x.away]) teams[t.code] = [t.name, (t.editorialName || t.name).trim(), t.tla || t.code, (x.group?.name || '').replace(/^Group\s*/i, '')];
    return [x.round.round, x.date, x.home.code, x.away.code, x.home.score, x.away.score, x.status === 'result' ? 1 : 0];
  }).sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  if (!games.length) throw new Error('EuroCup: χωρίς αγώνες');
  const played = games.filter(g => g[6]).map(g => g[0]);
  const lastRound = played.length ? Math.max(...played) : 0;
  let stand = [];
  if (lastRound) {
    const st = await get(`${FEED}/v3/competitions/U/seasons/${EC_SEASON}/rounds/${lastRound}/basicstandings`);
    stand = (st?.teams || []).map(t => [t.groupName || '', t.position, t.club.code, t.gamesWon, t.gamesLost, t.pointsFor, t.pointsAgainst, t.homeRecord, t.awayRecord, (t.last5Form || []).join('')]);
  }
  const r1 = x => Math.round((x || 0) * 10) / 10;
  const players = (tr?.players || []).map(p => ({ c: p.player.code, n: niceName(p.player.name), t: p.player.team.code, age: p.player.age || null, gp: p.gamesPlayed || 0,
    min: r1(p.minutesPlayed), pts: r1(p.pointsScored), reb: r1(p.totalRebounds), ast: r1(p.assists), stl: r1(p.steals), blk: r1(p.blocks), tov: r1(p.turnovers), pir: r1(p.pir),
    m3: r1(p.threePointersMade), a3: r1(p.threePointersAttempted), m2: r1(p.twoPointersMade), a2: r1(p.twoPointersAttempted), ftm: r1(p.freeThrowsMade), fta: r1(p.freeThrowsAttempted) }));
  return { teams, games, stand, players, lastRound, fetchedAt: new Date().toISOString() };
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
  let oldEc = null;
  try { oldEc = JSON.parse(await fs.readFile(CACHE, 'utf8')).ec || null; } catch { }
  if (!OFFLINE) { try { data.ec = await fetchEurocup(); console.log(`EuroCup: ${Object.keys(data.ec.teams).length} ομάδες, ${data.ec.players.length} παίκτες, έως την ${data.ec.lastRound}η αγωνιστική`); } catch (e) { console.error('EuroCup: η λήψη απέτυχε, κρατάω τα αποθηκευμένα.', e.message); } }
  data.ec = data.ec || oldEc;
  let oldHist = null;
  try { oldHist = JSON.parse(await fs.readFile(CACHE, 'utf8')).hist || null; } catch { }
  data.hist = OFFLINE ? (data.hist || oldHist || {}) : await fetchHistory(data.hist || oldHist);
  await updateVideos(data.videos, data.league.games, !OFFLINE);
  await fs.mkdir(path.dirname(CACHE), { recursive: true });
  await fs.writeFile(CACHE, JSON.stringify(data));
  const VIDS = data.videos;
  const { players, league } = data;
  const VENUE = data.venue || {};
  const lastRound = data.lastRound || Math.max(0, ...league.games.filter(g => g[6]).map(g => g[0]));
  // ---- Team Analytics / On-Off / Lineups (από data/pbp, όσο έχει κατέβει)
  const AN = { E: await AB.loadComp(ROOT, SEASON), U: await AB.loadComp(ROOT, 'U' + SEASON.slice(1)) };
  const ANL = Object.fromEntries(Object.entries(AN).filter(([, C]) => C).map(([k, C]) => [k, AB.leagueTable(C)]));
  const ANOO = Object.fromEntries(Object.entries(AN).filter(([, C]) => C).map(([k, C]) => [k, AB.allOnOff(C)]));
  if (AN.E) console.log(`Analytics: ${AN.E.games.length} αγώνες EuroLeague${AN.U ? `, ${AN.U.games.length} EuroCup` : ''} με play-by-play`);
  const MCH = await AB.loadHeaders(ROOT);
  let MPRED = null;
  try { MPRED = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'matchups', 'latest.json'), 'utf8')); } catch { }
  const MPK = Object.fromEntries((MPRED?.games || []).map(g => [`${g.comp}|${g.r}|${g.h}|${g.a}`, g]));
  // αποδόσεις μόνο από αδειοδοτημένο πάροχο: data/odds/latest.json = { provider, updated, games: { '<comp>-<r>-<h>-<a>': { ml:[h,a], spread:{line,h,a}, total:{line,over,under}, history:[[iso,h,a]] } } }
  const OB = await OBM.loadOdds(ROOT);
  const ODDS = OB.latest;
  const SH = await SB.loadShots(ROOT);
  const SHLA = SH ? SB.leagueAverages(SH) : null;
  const ECS = 'U' + SEASON.slice(1);
  const SHP = SH?.[SEASON] ? SB.playerProfiles(SH, SEASON) : {}, SHPU = SH?.[ECS] ? SB.playerProfiles(SH, ECS) : {};
  const SHT = SH?.[SEASON] ? SB.teamProfiles(SH, SEASON) : {}, SHTU = SH?.[ECS] ? SB.teamProfiles(SH, ECS) : {};
  if (SH) console.log('Shot charts:', Object.entries(SH).map(([s, v]) => `${s} ${v.shots.length} σουτ`).join(', '));
  // ---- Comparison Tool: μετρικές παικτών ανά σεζόν
  const CMP = (() => {
    const histSeasons = Object.entries(data.hist || {}).filter(([, h]) => h.rows?.length);
    const expC = {};
    for (const [, h] of histSeasons) for (const r of h.rows) expC[r[0]] = (expC[r[0]] || 0) + 1;
    const ooMap = Object.fromEntries((ANOO.E || []).map(x => [x.id + '|' + x.t, x]));
    const played = c => league.games.filter(g => g[6] && (g[2] === c || g[3] === c)).length;
    const stand = league.stand.map(s => s[1]);
    const enName = c => (TEAMS[c] ? TEAMS[c][3] : c);
    const posOf = Object.fromEntries(players.map(p => [p.c, p.pos]));
    const ctx = { niceName, teamName: enName, posLabel: p => p || '', nat: p => p.ct || '', oo: ooMap, teamGames: played, top4: stand.slice(0, 4), bottom4: stand.slice(-4), expOf: id => (expC[id] || 0) + 1, rsMax: 38, posOf: id => posOf[id] };
    const seasons = {};
    const lab = c => `${+c.slice(1)}-${String(+c.slice(1) + 1).slice(2)}`;
    seasons[SEASON] = { label: `EuroLeague ${SEASON_LABEL}`, qual: '≥3 αγ., ≥10′', ...CB.currentSeason(players, ctx) };
    if (data.ec?.players?.length) seasons['U' + SEASON.slice(1)] = { label: `EuroCup ${SEASON_LABEL}`, qual: '≥3 αγ., ≥10′', ...CB.eurocupSeason(data.ec.players, { teamName: c => data.ec.teams[c]?.[1] || c }) };
    for (const [code, h] of histSeasons) seasons[code] = { label: `EuroLeague ${lab(code)}`, qual: '≥5 αγ., ≥10′', ...CB.histSeason(h.rows, ctx) };
    const similar = { [SEASON]: CB.similarAll(seasons[SEASON]) };
    return { seasons, similar };
  })();
  let MBT = null;
  try { MBT = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'matchups', 'backtest.json'), 'utf8')); } catch { }
  const SIG = { margin: MBT?.summary?.margin_rmse || 12, total: MBT?.summary?.total_rmse || 17 };
  const OBI = Object.fromEntries(Object.keys(OB.latest?.games || {}).map(gid => { const [c, r, h, a] = gid.split('-'); return [gid, OBM.gameIntel(OB, gid, MPK[`${c}|${r}|${h}|${a}`], SIG)]; }));
  const OCLV = OB.hist.length ? OBM.clvReport(OB) : null;
  let FXD = null;
  try { FXD = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'fantasy', 'latest.json'), 'utf8')); if (FXD.round <= lastRound) FXD = null; } catch { FXD = null; }

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
  // για τον Game Predictor (Python): απουσίες και επερχόμενοι αγώνες με ISO ημερομηνία
  {
    const yr = +SEASON.slice(1), iso = e => { const dg = +e[8], y = Math.floor(yr / 10) * 10 + dg + (dg < yr % 10 ? 10 : 0); return `${y}-${e.slice(0, 2)}-${e.slice(2, 4)}T${e.slice(4, 6)}:${e.slice(6, 8)}:00Z`; };
    const fx = league.games.filter(g => !g[6]).map(g => ({ comp: 'E', r: g[0], h: g[2], a: g[3], t: iso(g[1]) }));
    for (const g of (data.ec?.games || []).filter(g => !g[6])) fx.push({ comp: 'U', r: g[0], h: g[2], a: g[3], t: g[1] });
    await fs.mkdir(path.join(ROOT, 'data', 'matchups'), { recursive: true });
    await fs.writeFile(path.join(ROOT, 'data', 'matchups', 'fixtures.json'), JSON.stringify({ season: SEASON, avail: Object.fromEntries(Object.entries(INJ.el).map(([c, v]) => [c, v.m])), fixtures: fx }));
  }
  const INJL = { el: 'Εκτός (τραυματίες ή απόντες):', en: 'Out (injured or absent):', es: 'Bajas (lesionados o ausentes):', sr: 'Van terena (povređeni ili odsutni):' };
  const pendingTips = lg => tipsters.flatMap(t => t.picks.filter(p => p.res === 'pending').map(p => ({ g: p.h + '-' + p.a, r: p.round, n: t.name, s: t.slug, l: p.label[lg], u: p.url[lg] })));
  const artList = lg => articles.filter(a => a[lg]).map(a => ({ title: a[lg].title, desc: a[lg].desc, type: a.type, round: a.round, game: a.game, author: a.author, date: a.date, dateText: a[lg].dateText, slug: a[lg].slug, url: a[lg].url }));
  await fs.writeFile(path.join(OUT, 'assets', 'data.json'), JSON.stringify({ updated: UPD.el, teams: TEAMS, players, league, season: SEASON,
    vid: { hl: Object.fromEntries(Object.entries(VIDS.hl).map(([k, v]) => [k, v.id])), team: Object.fromEntries(Object.entries(VIDS.team).map(([c, l]) => [c, l.slice(0, 6).map(v => ({ id: v.id, t: v.t }))])), ch: YT_TEAMS },
    articles: artList('el'), tips: pendingTips('el'), inj: INJ.el, injL: INJL.el, ui: { ...UI.el, calBase: BASE + 'cal/', cmpUrl: BASE + PATHS.el.compare + '/', modelUrl: BASE + PATHS.el.model + '/' },
    en: { updated: UPD.en, articles: artList('en'), tips: pendingTips('en'), inj: INJ.en, injL: INJL.en, ui: { ...UI.en, calBase: BASE + 'en/' + 'cal/', cmpUrl: BASE + 'en/' + PATHS.en.compare + '/', modelUrl: BASE + 'en/' + PATHS.en.model + '/' } },
    es: { updated: UPD.es, articles: artList('es'), tips: pendingTips('es'), inj: INJ.es, injL: INJL.es, ui: { ...UI.es, calBase: BASE + 'es/' + 'cal/', cmpUrl: BASE + 'es/' + PATHS.es.compare + '/', modelUrl: BASE + 'es/' + PATHS.es.model + '/' } },
    sr: { updated: UPD.sr, articles: artList('sr'), tips: pendingTips('sr'), inj: INJ.sr, injL: INJL.sr, ui: { ...UI.sr, calBase: BASE + 'sr/' + 'cal/', cmpUrl: BASE + 'sr/' + PATHS.sr.compare + '/', modelUrl: BASE + 'sr/' + PATHS.sr.model + '/' } } }));
  const appSrc = await fs.readFile(path.join(ROOT, 'src', 'app.js'), 'utf8');
  await fs.writeFile(path.join(OUT, 'assets', 'app.js'), appSrc);
  await fs.writeFile(path.join(OUT, 'assets', 'app.en.js'), translate(appSrc, APP_CODE, 'app.js (en)'));
  await fs.writeFile(path.join(OUT, 'assets', 'app.es.js'), translate(appSrc, ES.APP_CODE, 'app.js (es)', ES.PHRASES));
  await fs.writeFile(path.join(OUT, 'assets', 'app.sr.js'), translate(appSrc, SR.APP_CODE, 'app.js (sr)', SR.PHRASES));
  await fs.copyFile(path.join(ROOT, 'src', 'app.css'), path.join(OUT, 'assets', 'app.css'));
  await fs.mkdir(path.join(OUT, 'assets', 'fantasy'), { recursive: true });
  for (const f of ['optimizer.mjs', 'render.mjs', 'fx.js']) await fs.copyFile(path.join(ROOT, 'src', 'fantasy', f), path.join(OUT, 'assets', 'fantasy', f));
  await fs.mkdir(path.join(OUT, 'assets', 'analytics'), { recursive: true });
  for (const f of ['metrics.mjs', 'ui.js']) await fs.copyFile(path.join(ROOT, 'src', 'analytics', f), path.join(OUT, 'assets', 'analytics', f));
  await fs.mkdir(path.join(OUT, 'assets', 'matchup'), { recursive: true });
  for (const f of ['sim.mjs', 'ui.js']) await fs.copyFile(path.join(ROOT, 'src', 'matchup', f), path.join(OUT, 'assets', 'matchup', f));
  if (MPRED) {
    const api = (p, o) => fs.mkdir(path.dirname(path.join(OUT, 'api', p)), { recursive: true }).then(() => fs.writeFile(path.join(OUT, 'api', p), JSON.stringify(o)));
    const meta = { model_version: MPRED.model_version, engine: MPRED.engine, generated_at: MPRED.generated_at };
    const gid = x => `${x.comp}-${x.r}-${x.h}-${x.a}`;
    const days = {};
    for (const x of MPRED.games) (days[new Date(x.t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Athens' })] ||= []).push({ id: gid(x), comp: x.comp, r: x.r, h: x.h, a: x.a, t: x.t, p_home: x.p_home, hs: x.hs, as: x.as, total: x.total, pace: x.pace, conf: x.conf });
    for (const [d, L] of Object.entries(days)) await api(`matchups/${d}.json`, { ...meta, date: d, games: L });
    await api('matchups/index.json', { ...meta, dates: Object.keys(days).sort() });
    for (const x of MPRED.games) {
      const id = gid(x), { sim, ...pred } = x;
      const H = [];
      for (const L of Object.values(MCH)) for (const g of L) if (g.comp === x.comp && ((g.h === x.h && g.a === x.a) || (g.h === x.a && g.a === x.h))) H.push(g);
      const roster = c => x.comp === 'E' ? players.filter(p => p.t.split(';').pop() === c).map(p => { const s = playerSummary(p); return { id: p.c, n: niceName(p.n), pos: p.pos, g: s.G, pts: +s.pts.toFixed(1), reb: +s.reb.toFixed(1), ast: +s.ast.toFixed(1), pir: +s.pir.toFixed(1), out: !!INJ.el[p.c] }; }) : (data.ec?.players || []).filter(p => p.t === c).map(p => ({ id: p.c, n: p.n, g: p.gp, pts: p.pts, reb: p.reb, ast: p.ast, pir: p.pir }));
      await api(`matchups/${id}.json`, { ...meta, id, ...pred });
      await api(`matchups/${id}/prediction.json`, { ...meta, id, ...pred, sim });
      await api(`matchups/${id}/players.json`, { ...meta, id, home: roster(x.h), away: roster(x.a) });
      await api(`matchups/${id}/history.json`, { ...meta, id, games: H.sort((u, v) => v.d.localeCompare(u.d)).slice(0, 10) });
    }
  }
  await fs.mkdir(path.join(OUT, 'assets', 'shots'), { recursive: true });
  for (const f of ['zones.mjs', 'court.mjs', 'ui.js']) await fs.copyFile(path.join(ROOT, 'src', 'shots', f), path.join(OUT, 'assets', 'shots', f));
  if (SH) {
    const api = (p, o) => fs.mkdir(path.dirname(path.join(OUT, 'api', p)), { recursive: true }).then(() => fs.writeFile(path.join(OUT, 'api', p), JSON.stringify(o)));
    const nm = {};
    for (const p of players) nm[p.c] = niceName(p.n);
    for (const p of data.ec?.players || []) nm[p.c] ||= p.n;
    const names = ids => Object.fromEntries(ids.map(id => [id, nm[id] || id]));
    await api('shot-zones/league-averages.json', SHLA);
    // ομάδες (επίθεση + άμυνα), όλες οι σεζόν που υπάρχουν
    const byTeam = {};
    for (const [s, S] of Object.entries(SH)) for (const x of S.shots) { (byTeam[s[0] + '|' + x.team] ||= { own: [], opp: [] }).own.push(x); (byTeam[s[0] + '|' + x.opp] ||= { own: [], opp: [] }).opp.push(x); }
    for (const [k, v] of Object.entries(byTeam)) {
      const [cp, t] = k.split('|'), pre = cp === 'U' ? 'eurocup/' : '';
      const P = SB.pack([...v.own, ...v.opp], SH, s => (s.team === t ? 0 : 1));
      await api(`${pre}teams/${t}/shot-chart.json`, { team: t, names: names(P.ids), games: P.games, shots: P.shots });
      const prof = (cp === 'U' ? SHTU : SHT)[t]; if (prof) await api(`${pre}teams/${t}/zones.json`, prof);
    }
    // παίκτες: επίθεση (όλες οι σεζόν) + άμυνα (τρέχουσα σεζόν)
    const byP = {};
    for (const S of Object.values(SH)) for (const x of S.shots) (byP[x.pid] ||= []).push(x);
    const defBy = {};
    for (const s of [SEASON, ECS]) for (const x of SH[s]?.shots || []) if (x.def) for (const d of x.def) (defBy[d] ||= []).push(x);
    for (const [pid, L] of Object.entries(byP)) {
      const D = defBy[pid] || [];
      const P = SB.pack([...L, ...D.map(x => ({ ...x, _d: 1 }))], SH, s => (s._d ? 1 : 0));
      await api(`players/${pid}/shot-chart.json`, { player: pid, names: names(P.ids), games: P.games, shots: P.shots });
      const pr = SHP[pid] || SHPU[pid];
      if (pr) {
        await api(`players/${pid}/zones.json`, { player: pid, groups: pr.groups, zones: pr.zones, creation: pr.creation, assisters: pr.assisters });
        if (pr.defense) await api(`players/${pid}/defensive-shot-chart.json`, { player: pid, profile: pr.defense, shots: SB.pack(D, SH, () => 1).shots });
        await api(`players/${pid}/assists-network.json`, { player: pid, receivedFrom: pr.assisters, givenTo: Object.entries(L.length ? Object.values(SH).flatMap(S => S.shots.filter(x => x.ast === pid)).reduce((m, x) => (m[x.pid] = (m[x.pid] || 0) + 1, m), {}) : {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => ({ id, n })), names: names([...new Set([...pr.assisters.map(x => x.id), ...Object.values(SH).flatMap(S => S.shots.filter(x => x.ast === pid).map(x => x.pid))])]) });
      }
    }
    for (const [s, S] of Object.entries(SH)) for (const [gi, g] of S.games.entries()) {
      const L = S.shots.filter(x => x.gi === gi), P = SB.pack(L, SH, () => 0);
      await api(`games/${s}-${g.gc}/shot-chart.json`, { season: s, ...g, names: names(P.ids), games: P.games, shots: P.shots });
    }
  }
  {
    const api = (p, o) => fs.mkdir(path.dirname(path.join(OUT, 'api', p)), { recursive: true }).then(() => fs.writeFile(path.join(OUT, 'api', p), JSON.stringify(o)));
    await fs.mkdir(path.join(OUT, 'assets', 'compare'), { recursive: true });
    for (const f of ['metrics.mjs', 'ui.js']) await fs.copyFile(path.join(ROOT, 'src', 'compare', f), path.join(OUT, 'assets', 'compare', f));
    await api('compare/players/metrics.json', { current: SEASON, defaultKeys: CB.DEFAULT_KEYS, allKeys: CB.ALL_KEYS, per36: CB.PER36, per100: CB.PER100, seasons: CMP.seasons, similar: CMP.similar });
    for (const [id, L] of Object.entries(CMP.similar[SEASON])) await api(`compare/players/similar/${id}.json`, { player: id, season: SEASON, similar: L });
    // ομάδες
    const comps = {};
    for (const cp of ['E', 'U']) {
      const LT = ANL[cp], C = AN[cp]; if (!LT || !C) continue;
      const ecT = data.ec?.teams || {}, nm = c => (cp === 'E' ? (TEAMS[c] ? TEAMS[c][3] : c) : ecT[c]?.[1] || c);
      const teams = {};
      for (const c of LT.teams) {
        if (cp === 'E' && !TEAMS[c]) continue;
        const r = LT.rows[c], gs = AB.teamGames(C, c), last10 = gs.slice(-10);
        const roster = cp === 'E' ? players.filter(p => p.t.split(';').pop() === c) : [];
        const benchPts = roster.reduce((s, p) => s + p.g.filter(x => x[7] > 0 && !x[6]).reduce((a, x) => a + x[8], 0), 0) / (gs.length || 1);
        const sh = AB.teamSeason(C, c, g => g.home), sa = AB.teamSeason(C, c, g => !g.home);
        const lineups = AB.groupLineups(C.byTeam[c]?.stints || [], 5).filter(x => x.poss >= 25).sort((a, b) => b.net - a.net).slice(0, 3).map(x => ({ p: x.p.map(id => niceName(C.names[id] || id)), net: x.net, poss: x.poss }));
        const key = cp === 'E' ? roster.map(p => [niceName(p.n), playerSummary(p).pir, playerSummary(p).G]).filter(x => x[2] >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3) : (data.ec?.players || []).filter(p => p.t === c && p.gp >= 2).sort((a, b) => b.pir - a.pir).slice(0, 3).map(p => [p.n, p.pir]);
        teams[c] = { n: nm(c), m: { gp: r.gp, w: r.w, wpct: r.gp ? r.w / r.gp : null, pfpg: r.pfpg, papg: r.papg, ortg: r.ortg, drtg: r.drtg, net: r.net, pace: r.pace, efg: r.efg, ts: r.ts, ast: r.ast, tov: r.tov, oreb: r.oreb, dreb: r.dreb, ftr: r.ftr, reb: r.reb, oefg: r.oefg, otov: r.otov, bench: cp === 'E' ? benchPts : null, form10: last10.length ? last10.filter(g => g.pf > g.pa).length / last10.length : null },
          form: last10.map(g => (g.pf > g.pa ? 'W' : 'L')).join(''), home: `${sh.w}-${sh.gp - sh.w}`, away: `${sa.w}-${sa.gp - sa.w}`, lineups, key };
      }
      const avg = {}; for (const k of Object.keys(Object.values(teams)[0]?.m || {})) { const v = Object.values(teams).map(t => t.m[k]).filter(x => x != null); avg[k] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
      const h2h = Object.values(MCH).flat().filter(g => g.comp === cp).sort((a, b) => b.d.localeCompare(a.d)).map(g => ({ d: g.d, h: g.h, a: g.a, hs: g.hs, as: g.as }));
      const next = (MPRED?.games || []).filter(g => g.comp === cp).map(g => ({ h: g.h, a: g.a, p: g.p_home, hs: g.hs, as: g.as, r: g.r }));
      comps[cp] = { label: (cp === 'E' ? 'EuroLeague ' : 'EuroCup ') + SEASON_LABEL, teams, avg, h2h, next };
    }
    await api('compare/teams/metrics.json', { season: SEASON, keys: ['wpct', 'pfpg', 'papg', 'ortg', 'drtg', 'net', 'pace', 'efg', 'ts', 'ast', 'tov', 'oreb', 'dreb', 'ftr', 'reb', 'oefg', 'otov', 'bench', 'form10'], comps });
  }
  {
    const api = (p, o) => fs.mkdir(path.dirname(path.join(OUT, 'api', p)), { recursive: true }).then(() => fs.writeFile(path.join(OUT, 'api', p), JSON.stringify(o)));
    const meta = { provider: OB.latest?.provider || null, updated: OB.latest?.updated || null, disclaimer: 'Οι αποδόσεις ενδέχεται να έχουν αλλάξει. Οι προβλέψεις είναι στατιστικές εκτιμήσεις και δεν αποτελούν εγγύηση κέρδους. 21+' };
    const books = {};
    for (const G of Object.values(OB.latest?.games || {})) for (const [k, b] of Object.entries(G.books || {})) books[k] = { key: k, title: b.title };
    await api('odds/bookmakers.json', { ...meta, bookmakers: Object.values(books) });
    const byDay = {};
    for (const [gid, I] of Object.entries(OBI)) {
      if (!I) continue;
      const G = OB.latest.games[gid], d = new Date(G.t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Athens' });
      (byDay[d] ||= []).push({ id: gid, t: G.t, ml: I.ml ? { best: I.ml.best, fair: I.ml.consensusFair, model: I.ml.model, edge: I.ml.edge } : null });
      await api(`odds/games/${gid}.json`, { ...meta, id: gid, t: G.t, books: I.books });
      await api(`odds/games/${gid}/markets.json`, { ...meta, id: gid, ml: I.ml && { best: I.ml.best, bestBook: I.ml.bestBook, avg: I.ml.avg, fair: I.ml.consensusFair, margin: I.ml.avgMargin }, spread: I.spread, total: I.total });
      await api(`odds/games/${gid}/movement.json`, { ...meta, id: gid, ml: I.ml && { home: { series: I.ml.series[0], ...I.ml.move[0] }, away: { series: I.ml.series[1], ...I.ml.move[1] } }, spread: I.spread?.move?.[0] || null, total: I.total?.move?.[0] || null });
      await api(`odds/games/${gid}/model-edge.json`, { ...meta, id: gid, ml: I.ml && { model: I.ml.model, fair: I.ml.consensusFair, edge_pp: I.ml.edge, class: I.ml.cls, tier: I.ml.tier }, spread: I.spread && { line: I.spread.line, model: I.spread.model, fair: I.spread.consensusFair, edge_pp: I.spread.edge }, total: I.total && { line: I.total.line, model: I.total.model, fair: I.total.consensusFair, edge_pp: I.total.edge } });
    }
    for (const [d, L] of Object.entries(byDay)) await api(`odds/games/${d}.json`, { ...meta, date: d, games: L });
    await api('odds/closing-line-value.json', { ...meta, ...(OCLV || { rows: [], total: {}, byMonth: {}, byTeam: {} }) });
    if (FXD) for (const p of FXD.players) {
      const line = internalLine(p.pp), over = pirOverProb(line, p.p10, p.p50, p.p90);
      await api(`odds/players/${p.c}/props.json`, { ...meta, player: p.c, round: FXD.round, provider_props: null, internal: { projected_pir: p.pp, line, p_over: over, p_under: 1 - over, p10: p.p10, p50: p.p50, p90: p.p90, hit_rate_last10: hitRate((p.h || []).slice(-10).map(x => x[2]), line), minutes_risk: minutesRisk((p.h || []).slice(-6).map(x => x[1]), p.status), status: p.status } });
    }
  }
  // static API (ίδιο για όλες τις γλώσσες)
  for (const [cp, C] of Object.entries(AN)) {
    if (!C) continue;
    const api = (p, o) => fs.mkdir(path.dirname(path.join(OUT, 'api', p)), { recursive: true }).then(() => fs.writeFile(path.join(OUT, 'api', p), JSON.stringify(o)));
    const pre = cp === 'U' ? 'eurocup/' : '';
    const LT = ANL[cp];
    await api(`${pre}teams/analytics.json`, { season: C.code, avg: LT.avg, teams: Object.fromEntries(LT.teams.map(t => [t, { season: LT.rows[t], pct: LT.pct[t], rank: LT.rk[t], games: AB.teamGames(C, t) }])) });
    for (const t of Object.keys(C.byTeam)) {
      await api(`${pre}lineups/${t}.json`, AB.teamPack(C, t));
      await api(`${pre}onoff/team/${t}.json`, ANOO[cp].filter(x => x.t === t));
    }
    for (const x of ANOO[cp]) await api(`${pre}onoff/player/${x.id}.json`, x);
  }
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
    if (k === 'fpick') return B(lg) + P.articles + '/' + ({ el: `fantasy-agonistiki-${v}`, en: `fantasy-picks-round-${v}`, es: `fantasy-jornada-${v}`, sr: `fantasy-${v}-kolo` })[lg] + '/';
    if (k === 'recap') return B(lg) + P.articles + '/' + ({ el: `agonistiki-${v}-se-arithmous`, en: `round-${v}-in-numbers`, es: `jornada-${v}-en-cifras`, sr: `${v}-kolo-u-brojkama` })[lg] + '/';
    if (k === 'widget') return B(lg) + 'widget/' + ({ el: { st: 'vathmologia', rd: 'agonistiki' }, en: { st: 'standings', rd: 'round' }, es: { st: 'clasificacion', rd: 'jornada' }, sr: { st: 'tabela', rd: 'kolo' } })[lg][v] + '/';
    if (k === 'game') { const [r, h, a] = v.split('|'); const si = TEAM_IDX[lg][1]; return B(lg) + P.game + '/' + TEAMS[h][si] + '-' + TEAMS[a][si] + '-' + r + '/'; }
    if (k === 'pick') return B(lg) + 'tipsters/' + v + '/';
    if (k === 'nat') return B(lg) + ({ el: 'ethnikotites', en: 'nationalities', es: 'nacionalidades', sr: 'nacionalnosti' })[lg] + '/' + (v ? natSlug(lg, v) + '/' : '');
    if (k === 'awards') return B(lg) + ({ el: 'vraveia', en: 'awards', es: 'premios', sr: 'nagrade' })[lg] + '/' + (v ? monthSlug(lg, v) + '/' : '');
    if (k === 'paroli') return B(lg) + ({ el: 'paroli', en: 'parlay', es: 'combinada', sr: 'tiket' })[lg] + '/' + (v ? ({ el: `agonistiki-${v}`, en: `round-${v}`, es: `jornada-${v}`, sr: `${v}-kolo` })[lg] + '/' : '');
    if (k === 'fx') return B(lg) + P.fantasy + '/' + v + '/';
    if (k === 'hist') return B(lg) + P.hist + '/' + (v ? v + '/' : '');
    if (k === 'lead') return B(lg) + P.lead + '/' + (v ? LEAD_SUB[lg][v] + '/' : '');
    if (k === 'ec') return B(lg) + 'eurocup/' + (v ? v + '/' : '');
    if (k === 'oddsclv') return B(lg) + P.odds + '/clv/';
    if (k === 'oddspir') return B(lg) + P.odds + '/pir/';
    if (k === 'cmpt') return B(lg) + P.compare + '/' + ({ el: 'omades', en: 'teams', es: 'equipos', sr: 'timovi' })[lg] + '/';
    if (k === 'cmpe') return B(lg) + P.compare + '/embed/';
    if (k === 'shp') return urlFor(lg, 'player:' + v) + 'shot-chart/';
    if (k === 'sht') return urlFor(lg, 'team:' + v) + 'shot-chart/';
    if (k === 'shtu') return B(lg) + 'eurocup/' + v + '/shot-chart/';
    if (k === 'shg') return urlFor(lg, 'game:' + v) + 'shot-chart/';
    if (k === 'mcu') { const [r, h, a] = v.split('|'); return B(lg) + P.mc + '/eurocup-' + h.toLowerCase() + '-' + a.toLowerCase() + '-' + r + '/'; }
    if (k === 'lu') { const [cp, c] = v.split('-'); return B(lg) + P.lu + '/' + (cp === 'U' ? 'eurocup-' + c.toLowerCase() : TEAMS[c][TEAM_IDX[lg][1]]) + '/'; }
    return B(lg) + P[k] + '/';
  }

  const urls = [];
  const adUnit = lg => (AD_CLIENT && AD_SLOT)
    ? `<div class="wrap adwrap"><span class="adlabel">${{ el: 'Διαφήμιση', en: 'Advertisement', es: 'Publicidad', sr: 'Reklama' }[lg]}</span><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(AD_CLIENT)}" data-ad-slot="${esc(AD_SLOT)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`
    : '';
  const adHead = AD_CLIENT ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(AD_CLIENT)}" crossorigin="anonymous"></script>\n` : '';

  // ---- Google Analytics with Consent Mode: nothing is stored until the visitor accepts
  const CC = {
    el: ['Χρησιμοποιούμε cookies του Google Analytics για να μετράμε την επισκεψιμότητα, μόνο αν το δεχτείς.', 'Αποδοχή', 'Όχι, ευχαριστώ', 'Περισσότερα', 'Cookies'],
    en: ['We use Google Analytics cookies to measure traffic, only if you accept.', 'Accept', 'No, thanks', 'Learn more', 'Cookies'],
    es: ['Usamos cookies de Google Analytics para medir las visitas, solo si las aceptas.', 'Aceptar', 'No, gracias', 'Más información', 'Cookies'],
    sr: ['Koristimo Google Analytics kolačiće za merenje poseta, samo ako ih prihvatite.', 'Prihvatam', 'Ne, hvala', 'Više', 'Kolačići'],
  };
  const gaHead = (lg, legalUrl) => GA_ID ? `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
(function(){var c=null;try{c=localStorage.getItem('bsConsent');}catch(e){}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:c==='y'?'granted':'denied',wait_for_update:500});
gtag('js',new Date());gtag('config','${GA_ID}');
var T=${JSON.stringify(CC[lg])};
function set(v){try{localStorage.setItem('bsConsent',v);}catch(e){}gtag('consent','update',{analytics_storage:v==='y'?'granted':'denied'});var b=document.getElementById('ccb');if(b)b.remove();}
function show(){if(document.getElementById('ccb'))return;var d=document.createElement('div');d.id='ccb';d.setAttribute('role','dialog');d.setAttribute('aria-label',T[4]);
d.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto;background:#1d2330;color:#fff;border-radius:12px;padding:14px 16px;box-shadow:0 6px 24px rgba(0,0,0,.35);font:14px/1.45 Fira Sans,system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:10px;align-items:center';
d.innerHTML='<span style="flex:1 1 260px">'+T[0]+' <a href="${legalUrl}" style="color:#9fc3ff">'+T[3]+'</a></span><span style="display:flex;gap:8px"><button type="button" data-v="n" style="background:transparent;color:#fff;border:1px solid #8a93a6;border-radius:8px;padding:7px 12px;font:inherit;cursor:pointer">'+T[2]+'</button><button type="button" data-v="y" style="background:#e8562a;color:#fff;border:0;border-radius:8px;padding:7px 14px;font:inherit;font-weight:600;cursor:pointer">'+T[1]+'</button></span>';
d.addEventListener('click',function(e){var v=e.target.getAttribute&&e.target.getAttribute('data-v');if(v)set(v);});document.body.appendChild(d);}
window.bsCookies=show;
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-cc]');if(a){e.preventDefault();show();}});
if(c!=='y'&&c!=='n')document.addEventListener('DOMContentLoaded',show);})();
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
` : '';

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
    const shellB = SHELL[LG].replace(PRIV, `${PRIV}${Object.values(data.hist || {}).some(h => h.rows?.length) ? `<a href="${urlFor(LG, 'hist')}">${T('Ιστορικό', 'History', 'Historia', 'Istorija')}</a>` : ''}<a href="${urlFor(LG, 'lead')}">${T('Κορυφαίοι και ρεκόρ', 'Leaders and records', 'Líderes y récords', 'Lideri i rekordi')}</a>${MPRED?.games?.length ? `<a href="${urlFor(LG, 'mc')}">Matchup Center</a>` : ''}<a href="${urlFor(LG, 'odds')}">Betting Insights (21+)</a>${AN.E ? `<a href="${urlFor(LG, 'ana')}">Team Analytics</a><a href="${urlFor(LG, 'onoff')}">On/Off</a>` : ''}<a href="${urlFor(LG, 'awards')}">${T('Βραβεία', 'Awards', 'Premios', 'Nagrade')}</a><a href="${urlFor(LG, 'nat')}">${T('Εθνικότητες', 'Nationalities', 'Nacionalidades', 'Nacionalnosti')}</a><a href="${urlFor(LG, 'app')}">${T('Εφαρμογή', 'App', 'App', 'Aplikacija')}</a><a href="${urlFor(LG, 'compare')}">${T('Σύγκριση παικτών', 'Compare players', 'Comparar jugadores', 'Poređenje igrača')}</a><a href="${urlFor(LG, 'model')}">${T('Πόσο πέφτει μέσα το μοντέλο', 'Model accuracy', 'Acierto del modelo', 'Tačnost modela')}</a><a href="${urlFor(LG, 'widgets')}">${T('Widget για το site σου', 'Widgets for your site', 'Widgets para tu web', 'Vidžeti za tvoj sajt')}</a>${GA_ID ? `<a href="#" data-cc>${T('Ρυθμίσεις cookies', 'Cookie settings', 'Configurar cookies', 'Podešavanja kolačića')}</a>` : ''}`).replaceAll('{{BASE}}', BL).replaceAll('{{UPDATED}}', esc(updated)).replaceAll('{{SEASON}}', SEASON_LABEL)
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
${gaHead(LG, urlFor(LG, 'legal'))}${adHead}${pwaHead(LG)}</head>`;
    }
    async function write(url, html) {
      const file = path.join(OUT, url.slice(BASE.length), 'index.html');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, html);
    }
    // απλή σελίδα (άρθρα, tipsters, πολιτική απορρήτου): ίδια κεφαλίδα και υποσέλιδο
    // ---- περιγραφές κατηγοριών: σύντομο κείμενο πάνω και «Συχνές ερωτήσεις» κάτω (και FAQPage για το Google)
    const PIRQ = [T('Τι είναι το PIR;', 'What is PIR?', '¿Qué es el PIR?', 'Šta je PIR?'), T('Το PIR (Performance Index Rating) είναι ο δείκτης αξιολόγησης της EuroLeague: πόντοι + ριμπάουντ + ασίστ + κλεψίματα + κοψίματα + κερδισμένα φάουλ, μείον άστοχα σουτ, άστοχες βολές, λάθη, κοψίματα που δέχτηκε και φάουλ.', 'PIR (Performance Index Rating) is the EuroLeague efficiency index: points + rebounds + assists + steals + blocks + fouls drawn, minus missed shots, missed free throws, turnovers, shots blocked and fouls committed.', 'El PIR (Performance Index Rating) es la valoración de la EuroLeague: puntos + rebotes + asistencias + robos + tapones + faltas recibidas, menos tiros fallados, tiros libres fallados, pérdidas, tapones recibidos y faltas cometidas.', 'PIR (Performance Index Rating) je indeks korisnosti Evrolige: poeni + skokovi + asistencije + ukradene lopte + blokade + iznuđeni faulovi, minus promašeni šutevi, promašena slobodna bacanja, izgubljene lopte, primljene blokade i napravljeni faulovi.')];
    const SRCQ = [T('Πόσο συχνά ενημερώνονται τα στοιχεία;', 'How often is the data updated?', '¿Cada cuánto se actualizan los datos?', 'Koliko često se podaci ažuriraju?'), T('Κάθε βράδυ αυτόματα από τα επίσημα στατιστικά της EuroLeague, και επιπλέον Τρίτη έως Παρασκευή το απόγευμα, πριν από τους αγώνες.', 'Every night, automatically, from the official EuroLeague stats, plus Tuesday to Friday afternoons before the games.', 'Cada noche, automáticamente, con las estadísticas oficiales de la EuroLeague, y además de martes a viernes por la tarde, antes de los partidos.', 'Svake noći automatski iz zvanične statistike Evrolige, i dodatno od utorka do petka popodne, pre utakmica.')];
    const RGQ = [T('Είναι συμβουλές στοιχήματος;', 'Is this betting advice?', '¿Son consejos de apuestas?', 'Da li je ovo savet za klađenje?'), T('Όχι. Είναι στατιστικές εκτιμήσεις. Το στοίχημα επιτρέπεται μόνο σε άτομα άνω των 21 ετών στην Ελλάδα· παίξτε υπεύθυνα.', 'No. These are statistical estimates. Betting is for adults only (21+ in Greece, 18+ in most countries); please gamble responsibly.', 'No. Son estimaciones estadísticas. Las apuestas son solo para adultos (+21 en Grecia, +18 en España y la mayoría de países); juega con responsabilidad.', 'Ne. Ovo su statističke procene. Klađenje je samo za punoletne (21+ u Grčkoj, 18+ u većini zemalja); igrajte odgovorno.')];
    const CATS = {
      home: { top: T('Η βαθμολογία της EuroLeague με τις πιθανότητες κάθε ομάδας για playoffs και play-in, το πρόγραμμα και τα στατιστικά ομάδων ανά 100 κατοχές.', 'The EuroLeague standings with every team’s playoff and play-in odds, the schedule and team stats per 100 possessions.', 'La clasificación de la EuroLeague con las probabilidades de playoffs y play-in de cada equipo, el calendario y las estadísticas por 100 posesiones.', 'Tabela Evrolige sa šansama svakog tima za plej-of i plej-in, raspored i timska statistika na 100 poseda.'),
        faq: [[T('Πώς υπολογίζονται οι πιθανότητες για playoffs;', 'How are the playoff odds calculated?', '¿Cómo se calculan las probabilidades de playoffs?', 'Kako se računaju šanse za plej-of?'), T('Παίζουμε 5.000 φορές τους υπόλοιπους αγώνες της κανονικής περιόδου με βάση τη δύναμη κάθε ομάδας (επίθεση και άμυνα ανά 100 κατοχές, έδρα) και μετράμε πόσες φορές τερματίζει κάθε ομάδα στην 1-6 και στην 7-10.', 'We simulate the rest of the regular season 5,000 times based on each team’s strength (offense and defense per 100 possessions, home court) and count how often each team finishes 1-6 and 7-10.', 'Simulamos 5.000 veces el resto de la fase regular según la fuerza de cada equipo (ataque y defensa por 100 posesiones, factor cancha) y contamos cuántas veces termina 1-6 y 7-10.', 'Simuliramo ostatak regularnog dela 5.000 puta na osnovu snage svakog tima (napad i odbrana na 100 poseda, domaći teren) i brojimo koliko puta završava 1-6 i 7-10.')],
          [T('Ποιοι πάνε στα playoffs και ποιοι στο play-in;', 'Who goes to the playoffs and who to the play-in?', '¿Quién va a playoffs y quién al play-in?', 'Ko ide u plej-of, a ko u plej-in?'), T('Οι 6 πρώτοι πάνε κατευθείαν στα playoffs. Οι 7οι έως 10οι παίζουν play-in για τις δύο τελευταίες θέσεις.', 'The top 6 go straight to the playoffs. Teams 7 to 10 play the play-in for the last two spots.', 'Los 6 primeros van directamente a playoffs. Del 7.º al 10.º juegan el play-in por las dos últimas plazas.', 'Prvih 6 ide direktno u plej-of. Timovi od 7. do 10. mesta igraju plej-in za poslednja dva mesta.')], SRCQ] },
      form: { faq: [[T('Πώς βγαίνει το Θερμόμετρο;', 'How is the Thermometer calculated?', '¿Cómo se calcula el Termómetro?', 'Kako se računa Termometar?'), T('Για κάθε παίκτη συγκρίνουμε τον μέσο PIR των 3 τελευταίων αγώνων του με τον μέσο PIR όλων των προηγούμενων. Η διαφορά δείχνει ποιος «ανεβαίνει» και ποιος «πέφτει».', 'For each player we compare his average PIR over the last 3 games with his average in all earlier games. The difference shows who is heating up and who is cooling down.', 'Para cada jugador comparamos su PIR medio de los 3 últimos partidos con el de todos los anteriores. La diferencia muestra quién sube y quién baja.', 'Za svakog igrača poredimo prosečan PIR u poslednje 3 utakmice sa prosekom svih prethodnih. Razlika pokazuje ko je u usponu, a ko u padu.')],
          [T('Ποιοι παίκτες μετράνε;', 'Which players are included?', '¿Qué jugadores cuentan?', 'Koji igrači se računaju?'), T('Όσοι έχουν τουλάχιστον 3 αγώνες και 10 λεπτά μέσο όρο, για να μη μετράνε τυχαίες εμφανίσεις.', 'Players with at least 3 games and 10 minutes per game, so that one-off appearances do not count.', 'Los que tienen al menos 3 partidos y 10 minutos de media, para que no cuenten apariciones sueltas.', 'Igrači sa najmanje 3 utakmice i 10 minuta u proseku, da se ne bi računali slučajni nastupi.')], PIRQ] },
      fantasy: { top: T('Όλα για το EuroLeague Fantasy: εκτιμήσεις PIR για κάθε παίκτη, η καλύτερη σύνθεση με 100 credits, πλάνο για κάθε μέρα της αγωνιστικής και πόσο εύκολο είναι το πρόγραμμα κάθε ομάδας.', 'Everything for EuroLeague Fantasy: projected PIR for every player, the best lineup for 100 credits, a plan for every day of the round and how easy each team’s schedule is.', 'Todo para el EuroLeague Fantasy: PIR estimado de cada jugador, la mejor alineación con 100 créditos, un plan para cada día de la jornada y la dificultad del calendario de cada equipo.', 'Sve za EuroLeague Fantasy: procenjeni PIR svakog igrača, najbolja postava za 100 kredita, plan za svaki dan kola i koliko je lak raspored svakog tima.'),
        faq: [[T('Πώς βγαίνει η εκτίμηση PIR;', 'How is the projected PIR calculated?', '¿Cómo se calcula el PIR estimado?', 'Kako se računa procenjeni PIR?'), T('Σε δύο στάδια: πρώτα εκτιμάμε πόσα λεπτά θα παίξει ο παίκτης και μετά πόσο PIR φέρνει ανά λεπτό, με βάση τη φόρμα, τον ρόλο του, τον αντίπαλο, την έδρα και την ξεκούραση. Το εύρος P10–P90 δείχνει το χαμηλό και το υψηλό σενάριο.', 'In two stages: first how many minutes the player will play, then how much PIR he produces per minute, based on form, role, opponent, home court and rest. The P10–P90 range shows the low and high scenario.', 'En dos fases: primero cuántos minutos jugará y después cuánto PIR produce por minuto, según forma, rol, rival, cancha y descanso. El rango P10–P90 muestra el escenario bajo y el alto.', 'U dve faze: prvo koliko minuta će igrač igrati, pa koliko PIR-a donosi po minutu, na osnovu forme, uloge, protivnika, domaćeg terena i odmora. Opseg P10–P90 pokazuje nizak i visok scenario.')],
          [T('Είναι οι επίσημες τιμές του Fantasy;', 'Are these the official Fantasy prices?', '¿Son los precios oficiales del Fantasy?', 'Da li su ovo zvanične Fantasy cene?'), T('Όχι, οι τιμές είναι δικές μας εκτιμήσεις από το PIR, γιατί οι επίσημες δεν είναι ανοιχτές. Στο optimizer μπορείς να αλλάξεις τον προϋπολογισμό.', 'No, the prices are our own estimates based on PIR, because the official ones are not public. You can change the budget in the optimizer.', 'No, son estimaciones propias según el PIR, porque los oficiales no son públicos. En el optimizador puedes cambiar el presupuesto.', 'Ne, cene su naše procene na osnovu PIR-a, jer zvanične nisu javne. U optimizatoru možeš da promeniš budžet.')],
          [T('Τι σημαίνουν τα χρώματα στο πρόγραμμα;', 'What do the schedule colors mean?', '¿Qué significan los colores del calendario?', 'Šta znače boje u rasporedu?'), T('Πράσινο: αντίπαλος που δέχεται πολύ PIR (εύκολο ματς για Fantasy). Κόκκινο: σφιχτή άμυνα. Το ×2 σημαίνει διπλή αγωνιστική.', 'Green: an opponent that allows a lot of PIR (an easy Fantasy matchup). Red: a tight defense. ×2 means a double round.', 'Verde: rival que concede mucho PIR (partido fácil para el Fantasy). Rojo: defensa dura. ×2 significa jornada doble.', 'Zeleno: protivnik koji prima mnogo PIR-a (lak meč za Fantasy). Crveno: čvrsta odbrana. ×2 znači dvostruko kolo.')], PIRQ] },
      preds: { top: T('Οι προβλέψεις μας για κάθε αγώνα της επόμενης αγωνιστικής: εκτιμώμενο σκορ, πιθανότητα νίκης, σύνολο πόντων, απουσίες και βασικοί παίκτες.', 'Our predictions for every game of the next round: projected score, win probability, total points, injuries and key players.', 'Nuestros pronósticos para cada partido de la próxima jornada: marcador estimado, probabilidad de victoria, puntos totales, bajas y jugadores clave.', 'Naše prognoze za svaku utakmicu sledećeg kola: procenjeni rezultat, verovatnoća pobede, ukupno poena, povrede i ključni igrači.'),
        faq: [[T('Πώς βγαίνει η πρόβλεψη κάθε αγώνα;', 'How is each game predicted?', '¿Cómo se pronostica cada partido?', 'Kako se prognozira svaka utakmica?'), T('Από την επιθετική και αμυντική απόδοση κάθε ομάδας ανά 100 κατοχές, τον ρυθμό τους και την έδρα. Το μοντέλο δεν ξέρει για τραυματισμούς της τελευταίας στιγμής, γι’ αυτό δείχνουμε και τις απουσίες.', 'From each team’s offensive and defensive rating per 100 possessions, their pace and home court. The model does not know about last-minute injuries, so we also show the absences.', 'Con el rendimiento ofensivo y defensivo de cada equipo por 100 posesiones, su ritmo y el factor cancha. El modelo no conoce lesiones de última hora, por eso mostramos también las bajas.', 'Na osnovu napada i odbrane svakog tima na 100 poseda, tempa i domaćeg terena. Model ne zna za povrede u poslednjem trenutku, zato prikazujemo i odsutne.')],
          [T('Πόσο πέφτουν μέσα οι προβλέψεις;', 'How accurate are the predictions?', '¿Cuánto aciertan los pronósticos?', 'Koliko su tačne prognoze?'), T('Το ελέγχουμε δημόσια, αγώνα προς αγώνα, στη σελίδα «Πόσο πέφτει μέσα το μοντέλο».', 'We check it publicly, game by game, on the “Model accuracy” page.', 'Lo comprobamos públicamente, partido a partido, en la página «Acierto del modelo».', 'Proveravamo javno, utakmicu po utakmicu, na stranici „Tačnost modela”.')], RGQ] },
      tipsters: { faq: [[T('Πώς βαθμολογούνται οι tipsters;', 'How are the tipsters scored?', '¿Cómo se puntúa a los tipsters?', 'Kako se ocenjuju tipsteri?'), T('Κάθε επιλογή καταγράφεται πριν από τον αγώνα και βαθμολογείται αυτόματα από το τελικό αποτέλεσμα. Το ρεκόρ, το ποσοστό επιτυχίας και το κέρδος ή η ζημιά ανά μονάδα δεν αλλάζουν εκ των υστέρων.', 'Every pick is recorded before the game and graded automatically from the final result. The record, hit rate and profit or loss per unit cannot be changed afterwards.', 'Cada apuesta se registra antes del partido y se puntúa automáticamente con el resultado final. El historial, el porcentaje de aciertos y el beneficio o pérdida por unidad no se cambian después.', 'Svaki tip se beleži pre utakmice i automatski ocenjuje prema konačnom rezultatu. Učinak, procenat pogodaka i dobitak ili gubitak po jedinici ne menjaju se naknadno.')], RGQ] },
      articles: { faq: [[T('Ποια άρθρα γράφονται αυτόματα;', 'Which articles are written automatically?', '¿Qué artículos se escriben automáticamente?', 'Koji članci se pišu automatski?'), T('«Η αγωνιστική σε αριθμούς», το παρολί της αγωνιστικής και οι προτάσεις για το Fantasy βγαίνουν αυτόματα από τα στατιστικά. Τα υπόλοιπα άρθρα και οι αναλύσεις γράφονται από ανθρώπους.', '“The round in numbers”, the round parlay and the Fantasy picks are generated from the stats. The other articles and analyses are written by people.', '«La jornada en cifras», la combinada de la jornada y las recomendaciones de Fantasy se generan con las estadísticas. Los demás artículos y análisis los escriben personas.', '„Kolo u brojkama”, tiket kola i Fantasy predlozi generišu se iz statistike. Ostale članke i analize pišu ljudi.')], SRCQ] },
      paroli: { faq: [[T('Πώς διαλέγονται οι επιλογές του παρολί;', 'How are the parlay picks chosen?', '¿Cómo se eligen las selecciones de la combinada?', 'Kako se biraju parovi za tiket?'), T('Το μοντέλο παίρνει τις 2-3 νίκες με τη μεγαλύτερη πιθανότητα (τουλάχιστον 60%) της αγωνιστικής, μόνο με τα δεδομένα πριν από αυτήν.', 'The model takes the 2-3 wins with the highest probability (at least 60%) of the round, using only data from before it.', 'El modelo toma las 2-3 victorias más probables (al menos 60%) de la jornada, solo con datos anteriores a ella.', 'Model uzima 2-3 pobede sa najvećom verovatnoćom (najmanje 60%) u kolu, samo sa podacima pre kola.')],
          [T('Τι είναι η «δίκαιη απόδοση»;', 'What are “fair odds”?', '¿Qué es la «cuota justa»?', 'Šta je „fer kvota”?'), T('Είναι 1 διά την πιθανότητα του μοντέλου. Για 80% πιθανότητα, η δίκαιη απόδοση είναι 1,25. Αν μια στοιχηματική δίνει περισσότερο, το μοντέλο θεωρεί ότι η επιλογή έχει αξία.', 'It is 1 divided by the model’s probability. For an 80% chance, fair odds are 1.25. If a bookmaker offers more, the model sees value in the pick.', 'Es 1 dividido por la probabilidad del modelo. Con un 80%, la cuota justa es 1,25. Si una casa ofrece más, el modelo ve valor.', 'To je 1 podeljeno verovatnoćom modela. Za 80% šanse fer kvota je 1,25. Ako kladionica nudi više, model vidi vrednost.')], RGQ] },
      ec: { faq: [[T('Πώς προκρίνονται οι ομάδες στην EuroCup;', 'How do teams qualify in the EuroCup?', '¿Cómo se clasifican los equipos en la EuroCup?', 'Kako se timovi plasiraju u Evrokupu?'), T('Οι 32 ομάδες παίζουν σε 4 ομίλους των 8, με 14 αγωνιστικές (εντός και εκτός με όλους του ομίλου). Οι 4 πρώτοι κάθε ομίλου περνούν στα playoffs: «16», προημιτελικά, ημιτελικά και τελικός, όλα σε σειρές στις δύο νίκες.', 'The 32 teams play in 4 groups of 8 over 14 rounds (home and away against every group rival). The top 4 of each group reach the playoffs: Round of 16, quarterfinals, semifinals and finals, all best-of-three.', 'Los 32 equipos juegan en 4 grupos de 8, en 14 jornadas (ida y vuelta contra cada rival del grupo). Los 4 primeros de cada grupo pasan a los playoffs: octavos, cuartos, semifinales y final, todo al mejor de tres.', '32 tima igra u 4 grupe po 8, kroz 14 kola (kod kuće i u gostima protiv svakog iz grupe). Prva 4 iz svake grupe idu u plej-of: osmina finala, četvrtfinale, polufinale i finale, sve na dve pobede.')], SRCQ] },
      lead: { faq: [[T('Ποιοι παίκτες μετράνε στους κορυφαίους;', 'Which players count in the leaders?', '¿Qué jugadores cuentan en los líderes?', 'Koji igrači se računaju među liderima?'), T('Όσοι έχουν τουλάχιστον 3 αγώνες και 10 λεπτά μέσο όρο. Οι λίστες είναι μέσοι όροι ανά αγώνα· τα ρεκόρ αγώνα είναι οι καλύτερες ατομικές εμφανίσεις σε ένα ματς.', 'Players with at least 3 games and 10 minutes per game. The lists are per-game averages; single-game records are the best individual performances in one game.', 'Los que tienen al menos 3 partidos y 10 minutos de media. Las listas son promedios por partido; los récords son las mejores actuaciones en un solo partido.', 'Igrači sa najmanje 3 utakmice i 10 minuta u proseku. Liste su proseci po utakmici; rekordi su najbolji pojedinačni učinci na jednoj utakmici.')], PIRQ, SRCQ] },
      awards: { faq: [[T('Είναι τα επίσημα βραβεία της EuroLeague;', 'Are these the official EuroLeague awards?', '¿Son los premios oficiales de la EuroLeague?', 'Da li su ovo zvanične nagrade Evrolige?'), T('Όχι. Βγαίνουν αυτόματα από τα στατιστικά: MVP της αγωνιστικής είναι όποιος είχε το μεγαλύτερο PIR, και του μήνα όποιος είχε τον καλύτερο μέσο PIR με αρκετούς αγώνες.', 'No. They are computed from the stats: the round MVP is the player with the highest PIR, and the monthly MVP has the best average PIR with enough games.', 'No. Se calculan con las estadísticas: el MVP de la jornada es quien tuvo más PIR y el del mes quien tuvo mejor PIR medio con suficientes partidos.', 'Ne. Računaju se iz statistike: MVP kola je igrač sa najvećim PIR-om, a MVP meseca ima najbolji prosečan PIR uz dovoljno utakmica.')],
          [T('Ποιος είναι «νεοφερμένος»;', 'Who is a “newcomer”?', '¿Quién es «novato»?', 'Ko je „novajlija”?'), T('Παίκτης χωρίς αγώνα στην EuroLeague από το 2016-17 ως την προηγούμενη σεζόν.', 'A player with no EuroLeague games from 2016-17 to last season.', 'Un jugador sin partidos en la EuroLeague desde la 2016-17 hasta la temporada pasada.', 'Igrač bez utakmica u Evroligi od 2016-17. do prošle sezone.')], PIRQ] },
      nat: { faq: [[T('Από πού είναι η εθνικότητα των παικτών;', 'Where does the players’ nationality come from?', '¿De dónde sale la nacionalidad de los jugadores?', 'Odakle je nacionalnost igrača?'), T('Από τα επίσημα στοιχεία της EuroLeague. Παίκτες με δύο υπηκοότητες εμφανίζονται με αυτή που δηλώνει η EuroLeague.', 'From the official EuroLeague data. Players with two nationalities appear under the one the EuroLeague lists.', 'De los datos oficiales de la EuroLeague. Los jugadores con dos nacionalidades aparecen con la que indica la EuroLeague.', 'Iz zvaničnih podataka Evrolige. Igrači sa dva državljanstva prikazani su pod onim koje navodi Evroliga.')], SRCQ] },
      hist: { faq: [[T('Από ποια σεζόν ξεκινά το ιστορικό;', 'Which season does the history start from?', '¿Desde qué temporada empieza la historia?', 'Od koje sezone počinje istorija?'), T('Από το 2016-17, όταν η EuroLeague έγινε ενιαίος όμιλος. Για κάθε σεζόν δείχνουμε πρωταθλητή, τελικό, βαθμολογία και κορυφαίους παίκτες.', 'From 2016-17, when the EuroLeague became a single league table. For every season we show the champion, final, standings and top players.', 'Desde la 2016-17, cuando la EuroLeague pasó a liga única. Para cada temporada mostramos campeón, final, clasificación y mejores jugadores.', 'Od 2016-17, kada je Evroliga postala jedinstvena liga. Za svaku sezonu prikazujemo šampiona, finale, tabelu i najbolje igrače.')],
          [T('Γιατί το 2019-20 δεν έχει πρωταθλητή;', 'Why does 2019-20 have no champion?', '¿Por qué la 2019-20 no tiene campeón?', 'Zašto 2019-20. nema šampiona?'), T('Η σεζόν ακυρώθηκε τον Μάιο του 2020 λόγω της πανδημίας COVID-19.', 'The season was cancelled in May 2020 because of the COVID-19 pandemic.', 'La temporada se canceló en mayo de 2020 por la pandemia de COVID-19.', 'Sezona je otkazana u maju 2020. zbog pandemije COVID-19.')]] },
      compare: { faq: [[T('Τι δείχνει η σύγκριση;', 'What does the comparison show?', '¿Qué muestra la comparativa?', 'Šta prikazuje poređenje?'), T('Τους μέσους όρους των δύο παικτών δίπλα-δίπλα, με το καλύτερο τονισμένο, και σε ποιο ποσοστό της λίγκας βρίσκεται ο καθένας. Ο σύνδεσμος της σελίδας κρατάει τους παίκτες, οπότε μπορείς να τον στείλεις.', 'Both players’ averages side by side, with the better value highlighted, and each one’s league percentile. The page link keeps the players, so you can share it.', 'Los promedios de ambos jugadores lado a lado, con el mejor resaltado, y el percentil de cada uno en la liga. El enlace guarda los jugadores para compartirlo.', 'Proseke oba igrača jedan pored drugog, sa boljom vrednošću istaknutom, i percentil svakog u ligi. Link čuva igrače, pa možeš da ga podeliš.')], PIRQ] },
      model: { faq: [[T('Πώς ελέγχεται το μοντέλο;', 'How is the model tested?', '¿Cómo se pone a prueba el modelo?', 'Kako se model proverava?'), T('Για κάθε αγώνα που έχει παιχτεί ξαναφτιάχνουμε την πρόβλεψη μόνο με τα δεδομένα πριν από την αγωνιστική και τη συγκρίνουμε με το αποτέλεσμα. Δεν υπάρχει «κρυφό» ιστορικό: φαίνονται και οι αστοχίες.', 'For every game played we rebuild the prediction using only the data from before the round and compare it with the result. There is no hidden record: the misses are shown too.', 'Para cada partido jugado rehacemos el pronóstico solo con los datos previos a la jornada y lo comparamos con el resultado. No hay historial oculto: también se muestran los fallos.', 'Za svaku odigranu utakmicu ponovo pravimo prognozu samo sa podacima pre kola i poredimo je sa rezultatom. Nema skrivenog učinka: prikazani su i promašaji.')], RGQ] },
    };
    const catTop = k => (CATS[k] && CATS[k].top ? `<p class="catdesc">${esc(CATS[k].top)}</p>` : '');
    const catFaq = k => (CATS[k] && CATS[k].faq ? `<section class="wrap catfaq"><h2>${T('Συχνές ερωτήσεις', 'Frequently asked questions', 'Preguntas frecuentes', 'Česta pitanja')}</h2>${CATS[k].faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>` : '');
    const catLd = k => (CATS[k] && CATS[k].faq ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: CATS[k].faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) } : null);
    const withLd = (ld, k) => { const f = catLd(k); if (!f) return ld; return ld ? (Array.isArray(ld) ? [...ld, f] : [ld, f]) : f; };

    const ldTag = ld => ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n` : '';
    const crumbs = list => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE_URL + u })) });
    async function simplePage(key, { title, desc, view, main, id = '', ld = null }) {
      if (CATS[key]) { main = main + catFaq(key).replace('<section class="wrap catfaq">', '<section class="catfaq">'); ld = withLd(ld, key); }
      const url = urlFor(LG, key), alt = Object.fromEntries(OTHERS.map(o => [o, urlFor(o, key)])); urls.push(SITE_URL + url);
      await write(url, `${head(title, desc, url, alt)}
<body ${bodyAttrs(view, id)}>
${topband.replace('{{LANGSW}}', langSw(alt))}
${adUnit(LG)}<main class="wrap one">${main}</main>
${footer}
${ldTag(ld)}${script}
</body>
</html>
`);
    }
    async function page(key, { title, desc, view, id = '', h1p = '', ledep = '', h1t = '', ledet = '', ld = null, extra = '', top = '' }) {
      const url = urlFor(LG, key), alt = Object.fromEntries(OTHERS.map(o => [o, urlFor(o, key)])); urls.push(SITE_URL + url);
      let body = shellB.replace('{{LANGSW}}', langSw(alt))
        .replace('{{PLAYER_H1}}', esc(h1p)).replace('{{PLAYER_LEDE}}', ledep ? `<p class="lede">${esc(ledep)}</p>` : '')
        .replace('{{TEAM_H1}}', esc(h1t)).replace('{{TEAM_LEDE}}', ledet ? `<p class="lede">${esc(ledet)}</p>` : '');
      if (top) { const vid = { stand: 'vStand', team: 'vTeam', player: 'vPlayer' }[view]; const vp = vid ? body.indexOf(`<div id="${vid}"`) : -1, ms = vp > -1 ? body.indexOf('<main class="wrap', vp) : -1; if (ms > -1) { const k = body.indexOf('>', ms) + 1; body = body.slice(0, k) + (view === 'stand' ? top : `<div class="shtopw">${top}</div>`) + body.slice(k); } }
      if (extra && view === 'team') { const vp = body.indexOf('<div id="vTeam"'), me = body.indexOf('</main>', vp); if (vp > -1 && me > -1) body = body.slice(0, me) + extra + body.slice(me); }
      if (extra && view === 'player') { const vp = body.indexOf('<div id="vPlayer"'), me = body.indexOf('</main>', vp); if (vp > -1 && me > -1) body = body.slice(0, me) + extra + body.slice(me); }
      if (extra && view === 'fantasy') { const vp = body.indexOf('<div id="vFantasy"'), ms = body.indexOf('<main class="wrap one">', vp); if (vp > -1 && ms > -1) { const k = ms + '<main class="wrap one">'.length; body = body.slice(0, k) + extra + body.slice(k); } }
      if (CATS[key]) {
        const vid = { stand: 'vStand', form: 'vForm', fantasy: 'vFantasy', preds: 'vPreds' }[view];
        const vp = vid ? body.indexOf(`<div id="${vid}"`) : -1, he = vp > -1 ? body.indexOf('</h1>', vp) : -1;
        if (he > -1 && catTop(key)) body = body.slice(0, he + 5) + catTop(key) + body.slice(he + 5);
        const ft = body.lastIndexOf('{{AD}}<footer');
        if (ft > -1) body = body.slice(0, ft) + catFaq(key) + body.slice(ft);
        ld = withLd(ld, key);
      }
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
${ldTag(ld)}${script}
</body>
</html>
`);
    }

    const S = `EuroLeague ${SEASON_LABEL}`;
    const rdTxt0 = r => T(`${r}η αγωνιστική`, `Round ${r}`, `Jornada ${r}`, `${r}. kolo`);
    const nextR = Math.min(...league.games.filter(g => !g[6]).map(g => g[0]));
    // ---- προβολή των Shot Charts (κάρτες με μικρό heat map) σε αρχική, ομάδες, παίκτες
    const pcP = v => (v == null ? '–' : Math.round(100 * v) + '%');
    const shPromo = (href, zones, la, title, text, big = false) => `<a class="shpromo${big ? ' big' : ''}" href="${href}">${miniHeat(zones, la, { label: big })}<span class="shpt"><span class="kicker">Shot chart</span><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}<span class="shcta">${T('Δες το shot chart', 'Open the shot chart', 'Ver el mapa de tiro', 'Otvori mapu šuteva')} →</span></span></a>`;
    const teamShotLine = (pr, la) => {
      const gs = Object.entries(pr.groups).filter(([, v]) => v.fga >= 30 && v.fg != null && la?.[0] !== null).map(([k, v]) => [k, v.fg - (la?.[k]?.fg ?? v.fg)]).sort((a, b) => b[1] - a[1]);
      const GNs = { rim: 'Rim', paint: 'Paint', mid: 'Mid-range', corner3: T('γωνίες', 'corners', 'esquinas', 'uglovi'), wing3: 'wings', top3: 'top of the key' };
      const sh3 = ['corner3', 'wing3', 'top3'].reduce((s, k) => s + pr.groups[k].share, 0);
      return T(`${pcP(sh3)} τρίποντα, ${pcP(pr.groups.rim.share)} στο καλάθι${gs.length ? ` · καλύτερη ζώνη: ${GNs[gs[0][0]]}` : ''}`, `${pcP(sh3)} threes, ${pcP(pr.groups.rim.share)} at the rim${gs.length ? ` · best zone: ${GNs[gs[0][0]]}` : ''}`, `${pcP(sh3)} triples, ${pcP(pr.groups.rim.share)} en el aro${gs.length ? ` · mejor zona: ${GNs[gs[0][0]]}` : ''}`, `${pcP(sh3)} trojke, ${pcP(pr.groups.rim.share)} ispod koša${gs.length ? ` · najbolja zona: ${GNs[gs[0][0]]}` : ''}`);
    };
    const doneRounds = [...new Set(league.games.map(g => g[0]))].filter(r => league.games.filter(g => g[0] === r).every(g => g[6])).sort((a, b) => b - a);
    const recapTitle = r => T(`Η ${r}η αγωνιστική της EuroLeague σε αριθμούς`, `EuroLeague Round ${r} in numbers`, `La jornada ${r} de la EuroLeague en cifras`, `${r}. kolo Evrolige u brojkama`);
    const homeShots = (() => {
      const tops = league.stand.slice(0, 20).map(s => s[1]).filter(c => SHT[c] && TEAMS[c]).slice(0, 3);
      if (!tops.length) return '';
      return `<section class="shstrip"><div class="shsh"><h2>Shot Charts</h2><p class="sub">${T('Από πού σουτάρει κάθε ομάδα και κάθε παίκτης, με hot/cold ζώνες σε σχέση με τη λίγκα.', 'Where every team and player shoots from, with hot/cold zones against the league.', 'Desde dónde tira cada equipo y cada jugador, con zonas calientes y frías frente a la liga.', 'Odakle šutira svaki tim i igrač, sa vrućim i hladnim zonama u odnosu na ligu.')}</p><a class="pread" href="${urlFor(LG, 'shots')}">${T('Όλα τα shot charts', 'All shot charts', 'Todos los mapas de tiro', 'Sve mape šuteva')} →</a></div><div class="shgrid">${tops.map(c => shPromo(urlFor(LG, 'sht:' + c), SHT[c].zones, SHLA?.[SEASON]?.zones, tName(c), teamShotLine(SHT[c], SHLA?.[SEASON]?.groups))).join('')}</div></section>`;
    })();
    await page('home', { view: 'stand', top: homeShots, ld: { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: SITE_URL + B(LG), inLanguage: LG, description: T('Στατιστικά EuroLeague και EuroCup στα ελληνικά', 'EuroLeague and EuroCup stats', 'Estadísticas de la EuroLeague y la EuroCup', 'Statistika Evrolige i Evrokupa') },
      title: T(`EuroLeague βαθμολογία ${SEASON_LABEL}: πρόγραμμα, στατιστικά ομάδων και παικτών | ${SITE_NAME}`, `EuroLeague standings ${SEASON_LABEL}: schedule, team and player stats | ${SITE_NAME}`, `Clasificación de la EuroLeague ${SEASON_LABEL}: calendario y estadísticas de equipos y jugadores | ${SITE_NAME}`, `Tabela Evrolige ${SEASON_LABEL}: raspored, statistika timova i igrača | ${SITE_NAME}`),
      desc: T(`Η βαθμολογία της ${S} μετά την ${lastRound}η αγωνιστική, το πρόγραμμα, στατιστικά ομάδων και παικτών στα ελληνικά.`,
        `The ${S} standings after Round ${lastRound}, the schedule, team ratings and player stats.`, `La clasificación de la ${S} tras la jornada ${lastRound}, el calendario, los ratings de los equipos y las estadísticas de los jugadores.`, `Tabela ${S} posle ${lastRound}. kola, raspored, rejtinzi timova i statistika igrača.`) });
    await page('form', { view: 'form',
      title: T(`Θερμόμετρο φόρμας ${S}: ποιος ανεβαίνει, ποιος πέφτει | ${SITE_NAME}`, `${S} form guide: who is heating up, who is cooling down | ${SITE_NAME}`, `Estado de forma ${S}: quién se calienta y quién se enfría | ${SITE_NAME}`, `Forma u ${S}: ko je u usponu, a ko u padu | ${SITE_NAME}`),
      desc: T(`Οι παίκτες και οι ομάδες της EuroLeague σε φόρμα: οι 3 τελευταίοι αγώνες σε σύγκριση με τους προηγούμενους.`,
        `EuroLeague players and teams in form: the last 3 games compared with the earlier ones.`, `Jugadores y equipos de la EuroLeague en forma: los últimos 3 partidos frente a los anteriores.`, `Igrači i timovi Evrolige u formi: poslednje 3 utakmice u poređenju sa prethodnima.`) });
    // ---- Fantasy PIR Projections: dashboard, projections, optimizer, round planner, player pages
    let FXDASH = '';
    if (FXD && FXD.players?.length) {
      const pBy = Object.fromEntries(players.map(p => [p.c, p]));
      const FXP = FXD.players.filter(x => pBy[x.c]);
      const dn = c => niceName(pBy[c]?.n || c);
      const LOCF = { el: 'el-GR', en: 'en-GB', es: 'es-ES', sr: 'sr-Latn-RS' }[LG];
      const dayLbl = i => (i == null ? '–' : new Date(FXD.days[i] + 'T12:00:00Z').toLocaleDateString(LOCF, { weekday: 'long', day: 'numeric', month: 'numeric' }));
      const POSL = { Guard: T('Γκαρντ', 'Guard', 'Base/escolta', 'Bek'), Forward: T('Φόργουορντ', 'Forward', 'Alero', 'Krilo'), Center: T('Σέντερ', 'Center', 'Pívot', 'Centar') };
      const STL = { playing: T('Παίζει', 'Playing', 'Juega', 'Igra'), doubtful: T('Αμφίβολος', 'Doubtful', 'Duda', 'Neizvestan'), injured: T('Τραυματίας', 'Injured', 'Lesionado', 'Povređen'), rest: T('Ξεκούραση', 'Rest', 'Descanso', 'Odmor') };
      const FACT = { opponent: T('Αντίπαλος', 'Opponent', 'Rival', 'Protivnik'), home: T('Έδρα', 'Home court', 'Cancha', 'Domaći teren'), rest: T('Ξεκούραση / πρόγραμμα', 'Rest / schedule', 'Descanso / calendario', 'Odmor / raspored'), form: T('Φόρμα', 'Form', 'Forma', 'Forma'), role: T('Ρόλος (βασικός, usage)', 'Role (starter, usage)', 'Rol (titular, uso)', 'Uloga (starter, upotreba)') };
      const DISC = T('Οι προβλέψεις είναι στατιστικές εκτιμήσεις και δεν αποτελούν εγγύηση απόδοσης.', 'Projections are statistical estimates and do not guarantee performance.', 'Las proyecciones son estimaciones estadísticas y no garantizan el rendimiento.', 'Projekcije su statističke procene i ne garantuju učinak.');
      const PRICE_NOTE = T('Οι τιμές είναι δικές μας εκτιμήσεις (από το PIR) και όχι οι επίσημες του EuroLeague Fantasy· στο optimizer μπορείς να αλλάξεις τον προϋπολογισμό.', 'Prices are our own estimates (based on PIR), not the official EuroLeague Fantasy prices; you can change the budget in the optimizer.', 'Los precios son estimaciones propias (según el PIR), no los oficiales del EuroLeague Fantasy; puedes cambiar el presupuesto en el optimizador.', 'Cene su naše procene (na osnovu PIR-a), a ne zvanične cene Evroliga Fantasy igre; budžet možeš da promeniš u optimizatoru.');
      const fxu = sub => urlFor(LG, 'fx:' + sub), fxp = c => (pBy[c] ? fxu('player/' + pBy[c].s) : '#');
      const U = {
        round: T('Αγωνιστική', 'Round', 'Jornada', 'Kolo'), noRes: T('Δεν βρέθηκε σύνθεση με αυτούς τους περιορισμούς.', 'No lineup fits these constraints.', 'Ninguna alineación cumple estas condiciones.', 'Nijedna postava ne odgovara ovim uslovima.'),
        slot: { start: T('Πεντάδα', 'Starter', 'Titular', 'Starter'), sixth: T('6ος', '6th man', 'Sexto', '6. igrač'), bench: T('Πάγκος', 'Bench', 'Banquillo', 'Klupa'), coach: T('Προπονητής', 'Coach', 'Entrenador', 'Trener') },
        slotH: T('Θέση', 'Slot', 'Puesto', 'Mesto'), player: T('Παίκτης', 'Player', 'Jugador', 'Igrač'), teamH: T('Ομάδα', 'Team', 'Equipo', 'Tim'), posH: T('Ρόλος', 'Position', 'Posición', 'Pozicija'), price: T('Τιμή', 'Price', 'Precio', 'Cena'), proj: T('Εκτ. PIR', 'Proj. PIR', 'PIR est.', 'Proc. PIR'), dayH: T('Ημέρα', 'Day', 'Día', 'Dan'),
        coachOf: T('Προπονητής:', 'Coach:', 'Entrenador:', 'Trener:'), tExp: T('Αναμενόμενοι πόντοι', 'Expected points', 'Puntos esperados', 'Očekivani poeni'), tFloor: T('Κάτω όριο (P10)', 'Floor (P10)', 'Suelo (P10)', 'Donja granica (P10)'), tMed: T('Διάμεσος (P50)', 'Median (P50)', 'Mediana (P50)', 'Medijana (P50)'), tCeil: T('Ταβάνι (P90)', 'Ceiling (P90)', 'Techo (P90)', 'Plafon (P90)'), credits: 'Credits', formation: T('Σχηματισμός', 'Formation', 'Formación', 'Formacija'),
        noneDay: T('Κανείς από τη σύνθεση δεν παίζει αυτή τη μέρα.', 'Nobody in the lineup plays that day.', 'Nadie de la alineación juega ese día.', 'Niko iz postave ne igra tog dana.'), steps: T('Τι να κάνεις σε κάθε turn', 'What to do in each turn', 'Qué hacer en cada turno', 'Šta raditi u svakom krugu'),
        stCaptain: T('Αρχηγός: ο {p}, που παίζει {d}.', 'Captain: {p}, who plays on {d}.', 'Capitán: {p}, que juega el {d}.', 'Kapiten: {p}, koji igra {d}.'),
        stSwitch: T('Αν ο {p} φέρει λιγότερο από {x} PIR ({d}), μετάφερε την αρχηγία στον {q} πριν παίξει.', 'If {p} scores less than {x} PIR ({d}), move the captaincy to {q} before he plays.', 'Si {p} hace menos de {x} de PIR ({d}), pasa la capitanía a {q} antes de que juegue.', 'Ako {p} ostvari manje od {x} PIR-a ({d}), prebaci kapitensku traku na {q} pre nego što zaigra.'),
        stBackup: T('Αν ο {p} δεν είναι στη 12άδα ({d}), βάλε στη θέση του τον {q} από τον πάγκο.', 'If {p} is not in the 12-man squad ({d}), put {q} in his place from the bench.', 'Si {p} no entra en la convocatoria ({d}), pon a {q} en su lugar desde el banquillo.', 'Ako {p} nije u sastavu ({d}), stavi {q} umesto njega sa klupe.'),
        stDoubt: T('Ο {p} είναι αμφίβολος: κράτα έτοιμο τον {q}.', '{p} is doubtful: keep {q} ready.', '{p} es duda: ten preparado a {q}.', '{p} je neizvestan: drži spremnog {q}.'),
        stLocked: T('Όποιος έχει ήδη παίξει δεν μπορεί να ξαναμπεί σε ενεργή θέση στην ίδια αγωνιστική.', 'A player who has already played cannot be moved into an active slot again in the same round.', 'Un jugador que ya ha jugado no puede volver a un puesto activo en la misma jornada.', 'Igrač koji je već igrao ne može ponovo u aktivni deo postave u istom kolu.'),
        planMine: T('Το πλάνο είναι για τη σύνθεση που έβγαλες τελευταία στο optimizer.', 'This plan is for the lineup you last built in the optimizer.', 'El plan es para la última alineación que creaste en el optimizador.', 'Plan je za poslednju postavu koju si napravio u optimizatoru.'),
        copy: T('Αντιγραφή', 'Copy', 'Copiar', 'Kopiraj'), copied: T('Αντιγράφηκε', 'Copied', 'Copiado', 'Kopirano'),
      };
      const teamsJ = Object.fromEntries(Object.keys(TEAMS).map(c => [c, tName(c)]));
      const ctxJ = sub => `<script type="application/json" id="fxctx">${JSON.stringify({ U, base: urlFor(LG, 'fx:player'), teams: teamsJ, pos: POSL, days: FXD.days.map((d, i) => dayLbl(i)), api: BASE + 'api/fantasy/projections/latest.json', page: sub }).replace(/</g, '\\u003c')}</script><script type="module" src="${BASE}assets/fantasy/fx.js?v=${ver}"></script>`;
      const ctxS = { U, name: dn, team: tName, purl: fxp, pos: p => POSL[p] || p, day: dayLbl };
      const nav = cur => `<p class="leadnav fxnav">${[['', T('Fantasy', 'Fantasy', 'Fantasy', 'Fantasy')], ['projections', T('Προβλέψεις PIR', 'PIR projections', 'Proyecciones PIR', 'PIR projekcije')], ['optimizer', T('Βέλτιστη σύνθεση', 'Lineup optimizer', 'Optimizador', 'Optimizator')], ['round-planner', T('Πλάνο αγωνιστικής', 'Round planner', 'Planificador', 'Plan kola')]].map(([k, l]) => `<a href="${k ? fxu(k) : urlFor(LG, 'fantasy')}"${k === cur ? ' aria-current="page"' : ''}>${esc(l)}</a>`).join('')}</p>`;
      const bt = FXD.backtest || {};
      const btTxt = bt.mae ? T(`Έλεγχος σε ${bt.n} αγώνες παικτών των προηγούμενων αγωνιστικών: μέσο λάθος ${f1(bt.mae)} PIR (απλός μέσος όρος 10 αγώνων: ${f1(bt.mae_base)}), και το εύρος P10–P90 περιείχε το ${Math.round(bt.coverage_80 * 100)}% των αποτελεσμάτων.`, `Backtest on ${bt.n} player-games of past rounds: mean error ${f1(bt.mae)} PIR (simple 10-game average: ${f1(bt.mae_base)}); the P10–P90 range contained ${Math.round(bt.coverage_80 * 100)}% of outcomes.`, `Prueba sobre ${bt.n} actuaciones de jornadas anteriores: error medio de ${f1(bt.mae)} de PIR (media simple de 10 partidos: ${f1(bt.mae_base)}); el rango P10–P90 contuvo el ${Math.round(bt.coverage_80 * 100)}% de los resultados.`, `Provera na ${bt.n} učinaka iz prethodnih kola: prosečna greška ${f1(bt.mae)} PIR-a (prosek 10 utakmica: ${f1(bt.mae_base)}); opseg P10–P90 obuhvatio je ${Math.round(bt.coverage_80 * 100)}% ishoda.`) : '';
      const notes = `<p class="note">${esc(DISC)} ${esc(PRICE_NOTE)}</p>${btTxt ? `<p class="note">${esc(btTxt)}</p>` : ''}`;
      const stB = s => `<span class="fxst fxst-${s}">${esc(STL[s] || s)}</span>`;
      const vsTxt = x => x.opp ? `${x.home ? 'vs' : '@'} ${esc(tName(x.opp))}` : '–';
      // dashboard block on top of the existing Fantasy page
      const top10 = FXP.filter(x => x.status === 'playing').slice(0, 10);
      FXDASH = `<section class="fxdash"><h2>EuroLeague Fantasy PIR Projections · ${esc(rdTxt0(FXD.round))}</h2>${nav('')}<div class="tbl"><table><thead><tr><th class="l">${esc(U.player)}</th><th class="l">${esc(U.teamH)}</th><th>${esc(U.price)}</th><th>${T('Λεπτά', 'Min', 'Min', 'Min')}</th><th>${esc(U.proj)}</th><th>P10–P90</th></tr></thead><tbody>${top10.map(x => `<tr><td class="l"><a href="${fxp(x.c)}">${esc(dn(x.c))}</a></td><td class="l">${esc(tName(x.t))} <small>${vsTxt(x)}</small></td><td>${f1(x.price)}</td><td>${f1(x.pm)}</td><td><b>${f1(x.pp)}</b></td><td>${f1(x.p10)}–${f1(x.p90)}</td></tr>`).join('')}</tbody></table></div><p><a class="pread" href="${fxu('projections')}">${T('Όλες οι προβλέψεις →', 'All projections →', 'Todas las proyecciones →', 'Sve projekcije →')}</a> <a class="pread" href="${fxu('optimizer')}">${T('Βγάλε τη σύνθεσή σου →', 'Build your lineup →', 'Crea tu alineación →', 'Napravi postavu →')}</a></p></section>`;

      // projections
      const tms = [...new Set(FXP.map(x => x.t))].sort((a, b) => tName(a).localeCompare(tName(b)));
      const th = (k, l, cls = '') => `<th data-k="${k}" class="sth ${cls}">${esc(l)}</th>`;
      const projMain = `<article class="article lead wide fx">
<h1>EuroLeague Fantasy PIR Projections</h1>
<p class="lede2">${esc(T(`Η εκτίμηση PIR κάθε παίκτη για την ${rdTxt0(FXD.round)}: λεπτά × PIR ανά λεπτό, με εύρος P10–P90 και βαθμό σιγουριάς.`, `Every player's projected PIR for ${rdTxt0(FXD.round)}: minutes × PIR per minute, with a P10–P90 range and a confidence score.`, `El PIR estimado de cada jugador para la ${rdTxt0(FXD.round).toLowerCase()}: minutos × PIR por minuto, con rango P10–P90 y nivel de confianza.`, `Procenjeni PIR svakog igrača za ${rdTxt0(FXD.round)}: minuti × PIR po minutu, sa opsegom P10–P90 i stepenom pouzdanosti.`))}</p>
${nav('projections')}
<form id="fxFilters" class="fxfilters" onsubmit="return false">
<label>${esc(U.posH)} <select name="pos"><option value="">–</option>${Object.entries(POSL).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
<label>${esc(U.teamH)} <select name="team"><option value="">–</option>${tms.map(t => `<option value="${t}">${esc(tName(t))}</option>`).join('')}</select></label>
<label>${esc(U.price)} ≥ <input name="pmin" type="number" step="0.5" min="0" inputmode="decimal"></label>
<label>${esc(U.price)} ≤ <input name="pmax" type="number" step="0.5" min="0" inputmode="decimal"></label>
<label>${esc(U.proj)} ≥ <input name="ppmin" type="number" step="1" min="0" inputmode="decimal"></label>
<label>PIR/${T('λεπτό', 'min', 'min', 'min')} ≥ <input name="pmmin" type="number" step="0.05" min="0" inputmode="decimal"></label>
<label class="chk"><input name="onlyPlaying" type="checkbox"> ${esc(T('Μόνο όσοι παίζουν', 'Only available players', 'Solo disponibles', 'Samo dostupni'))}</label>
<span class="sub"><b id="fxCount">${FXP.length}</b> ${esc(T('παίκτες', 'players', 'jugadores', 'igrača'))}</span>
</form>
<div class="tbl"><table id="fxProj" class="fxproj"><thead><tr>${th('n', U.player, 'l')}<th class="l">${esc(U.teamH)}</th><th class="l">${esc(U.posH)}</th>${th('price', U.price)}${th('l5', 'L5')}${th('l10', 'L10')}${th('pm', 'PIR/' + T('λεπ.', 'min', 'min', 'min'))}${th('min', T('Εκτ. λεπτά', 'Proj. min', 'Min est.', 'Proc. min'))}${th('pp', U.proj)}${th('p10', 'P10')}${th('p50', 'P50')}${th('p90', 'P90')}${th('conf', T('Σιγουριά', 'Confidence', 'Confianza', 'Pouzdanost'))}<th class="l">Status</th></tr></thead><tbody>
${FXP.map(x => `<tr data-n="${esc(dn(x.c))}" data-pos="${x.pos}" data-team="${x.t}" data-price="${x.price}" data-l5="${x.l5}" data-l10="${x.l10}" data-pm="${x.pirpm}" data-min="${x.pm}" data-pp="${x.pp}" data-p10="${x.p10}" data-p50="${x.p50}" data-p90="${x.p90}" data-conf="${x.conf}" data-status="${x.status}"><td class="l"><a href="${fxp(x.c)}">${esc(dn(x.c))}</a></td><td class="l">${esc(tName(x.t))} <small>${vsTxt(x)}</small></td><td class="l">${esc(POSL[x.pos] || x.pos)}</td><td>${f1(x.price)}</td><td>${f1(x.l5)}</td><td>${f1(x.l10)}</td><td>${x.pirpm.toFixed(2)}</td><td>${f1(x.pm)}</td><td><b>${f1(x.pp)}</b></td><td>${f1(x.p10)}</td><td>${f1(x.p50)}</td><td>${f1(x.p90)}</td><td>${x.conf}</td><td class="l">${stB(x.status)}</td></tr>`).join('')}
</tbody></table></div>
<p class="note">${esc(T('Το ownership των παικτών δεν είναι διαθέσιμο ανοιχτά, οπότε δεν υπάρχει αυτό το φίλτρο.', 'Player ownership is not publicly available, so there is no filter for it.', 'La propiedad (ownership) de los jugadores no es pública, así que no hay filtro.', 'Procenat posedovanja igrača nije javno dostupan, pa ne postoji taj filter.'))}</p>
${notes}</article>${ctxJ('projections')}`;
      await simplePage('fx:projections', { view: 'fx', title: T(`EuroLeague Fantasy PIR Projections ${rdTxt0(FXD.round)}: εκτιμήσεις PIR όλων των παικτών | ${SITE_NAME}`, `EuroLeague Fantasy PIR Projections ${rdTxt0(FXD.round)} | ${SITE_NAME}`, `Proyecciones PIR EuroLeague Fantasy, ${rdTxt0(FXD.round).toLowerCase()} | ${SITE_NAME}`, `EuroLeague Fantasy PIR projekcije, ${rdTxt0(FXD.round)} | ${SITE_NAME}`),
        desc: T(`Εκτιμήσεις PIR, λεπτών και εύρος P10–P90 για κάθε παίκτη της EuroLeague στην ${rdTxt0(FXD.round)}, με φίλτρα ανά θέση, ομάδα και τιμή.`, `Projected PIR, minutes and P10–P90 range for every EuroLeague player in ${rdTxt0(FXD.round)}, with filters by position, team and price.`, `PIR estimado, minutos y rango P10–P90 de cada jugador de la EuroLeague en la ${rdTxt0(FXD.round).toLowerCase()}, con filtros por posición, equipo y precio.`, `Procenjeni PIR, minuti i opseg P10–P90 za svakog igrača Evrolige u ${rdTxt0(FXD.round)}, sa filterima po poziciji, timu i ceni.`), main: projMain });

      // optimizer (default result pre-computed, the form runs it again in the browser)
      const defRes = OPT.optimize(FXP, FXD.coaches, { risk: 'ceiling' });
      const optMain = `<article class="article lead wide fx">
<h1>${esc(T('Βέλτιστη σύνθεση Fantasy', 'Fantasy lineup optimizer', 'Optimizador de alineación Fantasy', 'Optimizator Fantasy postave'))}</h1>
<p class="lede2">${esc(T('10 παίκτες (4 γκαρντ, 4 φόργουορντ, 2 σέντερ) και προπονητής με 100 credits, έως 6 παίκτες από κάθε ομάδα. Πεντάδα και 6ος μετράνε 100%, ο πάγκος 50%, ο αρχηγός διπλά και κάθε νίκη της ομάδας δίνει +10%.', '10 players (4 guards, 4 forwards, 2 centers) and a coach for 100 credits, at most 6 players per team. Starters and the 6th man count 100%, the bench 50%, the captain double and every team win adds 10%.', '10 jugadores (4 bases/escoltas, 4 aleros, 2 pívots) y un entrenador por 100 créditos, máximo 6 por equipo. Titulares y sexto cuentan al 100%, el banquillo al 50%, el capitán doble y cada victoria suma un 10%.', '10 igrača (4 beka, 4 krila, 2 centra) i trener za 100 kredita, najviše 6 iz jednog tima. Starteri i 6. igrač se računaju 100%, klupa 50%, kapiten duplo, a svaka pobeda tima donosi +10%.'))}</p>
${nav('optimizer')}
<form id="fxOpt" class="fxfilters">
<label>${esc(T('Προϋπολογισμός', 'Budget', 'Presupuesto', 'Budžet'))} <input name="budget" type="number" value="100" min="40" max="200" step="0.5" inputmode="decimal"></label>
<label>${esc(T('Έως ανά ομάδα', 'Max per team', 'Máx. por equipo', 'Najviše po timu'))} <input name="maxPerTeam" type="number" value="6" min="1" max="10"></label>
<label>${esc(T('Στρατηγική', 'Mode', 'Modo', 'Režim'))} <select name="risk"><option value="ceiling">Ceiling — ${esc(T('μέγιστοι αναμενόμενοι πόντοι', 'most expected points', 'máximos puntos esperados', 'najviše očekivanih poena'))}</option><option value="safe">Safe — ${esc(T('σταθερή διάμεσος, μικρό ρίσκο', 'steady median, low variance', 'mediana estable, poco riesgo', 'stabilna medijana, mali rizik'))}</option></select></label>
<input type="hidden" name="formation" value="auto">
<span class="fxforms">${['auto', ...Object.keys(OPT.FORMATIONS)].map(f => `<button type="button" data-form="${f}"${f === 'auto' ? ' class="on"' : ''}>${f === 'auto' ? esc(T('Καλύτερος', 'Best', 'Mejor', 'Najbolja')) : f}</button>`).join('')}</span>
<button type="submit" class="fxrun">${esc(T('Υπολογισμός', 'Optimize', 'Calcular', 'Izračunaj'))}</button>
</form>
<div id="fxOptOut">${OPT.bestLineup && defRes ? OPTR.renderLineup(defRes, ctxS) : ''}</div>
<p class="fxbtns"><button type="button" id="fxCsv">CSV</button> <button type="button" id="fxCopy">${esc(U.copy)}</button> <a class="pread" href="${fxu('round-planner')}">${esc(T('Πλάνο αγωνιστικής για αυτή τη σύνθεση →', 'Round plan for this lineup →', 'Plan de jornada para esta alineación →', 'Plan kola za ovu postavu →'))}</a></p>
<p class="note">${esc(T('Coach: νίκη 1-10 ή παράταση +10, 11-20 +20, 21+ +25· ήττα 1-10 ή παράταση -5, 11-20 -10, 21+ -20. Ο σχηματισμός είναι γκαρντ-φόργουορντ-σέντερ στην πεντάδα.', 'Coach: win by 1-10 or in overtime +10, 11-20 +20, 21+ +25; loss by 1-10 or in overtime -5, 11-20 -10, 21+ -20. Formations are guards-forwards-centers in the starting five.', 'Entrenador: victoria por 1-10 o en prórroga +10, 11-20 +20, 21+ +25; derrota por 1-10 o en prórroga -5, 11-20 -10, 21+ -20. Las formaciones son bases-aleros-pívots en el quinteto.', 'Trener: pobeda 1-10 ili u produžetku +10, 11-20 +20, 21+ +25; poraz 1-10 ili u produžetku -5, 11-20 -10, 21+ -20. Formacije su bekovi-krila-centri u startnoj petorci.'))}</p>
${notes}</article>${ctxJ('optimizer')}`;
      await simplePage('fx:optimizer', { view: 'fx', title: T(`EuroLeague Fantasy optimizer: η καλύτερη σύνθεση για την ${rdTxt0(FXD.round)} | ${SITE_NAME}`, `EuroLeague Fantasy optimizer: best lineup for ${rdTxt0(FXD.round)} | ${SITE_NAME}`, `Optimizador EuroLeague Fantasy: la mejor alineación de la ${rdTxt0(FXD.round).toLowerCase()} | ${SITE_NAME}`, `EuroLeague Fantasy optimizator: najbolja postava za ${rdTxt0(FXD.round)} | ${SITE_NAME}`),
        desc: T('Βγάλε αυτόματα την καλύτερη σύνθεση EuroLeague Fantasy με 100 credits: πεντάδα, 6ος, πάγκος, αρχηγός και προπονητής, σε Ceiling ή Safe mode.', 'Build the best EuroLeague Fantasy lineup with 100 credits automatically: starting five, sixth man, bench, captain and coach, in Ceiling or Safe mode.', 'Crea automáticamente la mejor alineación del EuroLeague Fantasy con 100 créditos: quinteto, sexto, banquillo, capitán y entrenador, en modo Ceiling o Safe.', 'Automatski napravi najbolju EuroLeague Fantasy postavu sa 100 kredita: petorka, 6. igrač, klupa, kapiten i trener, u Ceiling ili Safe režimu.'), main: optMain });

      // round planner
      const plan = OPT.roundPlan(defRes, FXD.days);
      const planMain = `<article class="article lead wide fx">
<h1>${esc(T('Πλάνο αγωνιστικής', 'Round planner', 'Planificador de jornada', 'Plan kola'))} · ${esc(rdTxt0(FXD.round))}</h1>
<p class="lede2">${esc(T(`Η αγωνιστική παίζεται σε ${FXD.days.length} μέρες. Ποιος ξεκινά, ποιος περιμένει στον πάγκο, ποιος είναι αρχηγός και πότε να μεταφέρεις την αρχηγία σε παίκτη που δεν έχει παίξει ακόμη.`, `The round is played over ${FXD.days.length} days. Who starts, who waits on the bench, who is captain and when to move the captaincy to a player who has not played yet.`, `La jornada se juega en ${FXD.days.length} días. Quién empieza, quién espera en el banquillo, quién es capitán y cuándo pasar la capitanía a un jugador que aún no ha jugado.`, `Kolo se igra u ${FXD.days.length} dana. Ko počinje, ko čeka na klupi, ko je kapiten i kada prebaciti kapitensku traku na igrača koji još nije igrao.`))}</p>
${nav('round-planner')}
<p class="sub" id="fxPlanNote">${esc(T('Το πλάνο είναι για την προτεινόμενη σύνθεση (Ceiling). Αν βγάλεις δική σου στο optimizer, εμφανίζεται εδώ.', 'This plan is for the suggested lineup (Ceiling). If you build your own in the optimizer, it shows up here.', 'El plan es para la alineación sugerida (Ceiling). Si creas la tuya en el optimizador, aparece aquí.', 'Plan je za predloženu postavu (Ceiling). Ako napraviš svoju u optimizatoru, pojaviće se ovde.'))}</p>
<div id="fxPlan">${OPTR.renderPlan(plan, defRes, ctxS)}</div>
${notes}</article>${ctxJ('planner')}`;
      await simplePage('fx:round-planner', { view: 'fx', title: T(`EuroLeague Fantasy: πλάνο ${FXD.round}ης αγωνιστικής, αρχηγός και αλλαγές | ${SITE_NAME}`, `EuroLeague Fantasy round planner: ${rdTxt0(FXD.round)}, captain and swaps | ${SITE_NAME}`, `Planificador EuroLeague Fantasy: ${rdTxt0(FXD.round).toLowerCase()}, capitán y cambios | ${SITE_NAME}`, `EuroLeague Fantasy plan: ${rdTxt0(FXD.round)}, kapiten i izmene | ${SITE_NAME}`),
        desc: T('Πλάνο ανά ημέρα για το EuroLeague Fantasy: ποιοι παίζουν πρώτοι, ποιοι μένουν στον πάγκο, ποιος αρχηγός και πότε να αλλάξεις αρχηγό.', 'Day-by-day EuroLeague Fantasy plan: who plays first, who waits on the bench, who is captain and when to switch captain.', 'Plan día a día para el EuroLeague Fantasy: quién juega primero, quién espera en el banquillo, quién es capitán y cuándo cambiarlo.', 'Plan po danima za EuroLeague Fantasy: ko igra prvi, ko čeka na klupi, ko je kapiten i kada ga promeniti.'), main: planMain });

      // one page per player
      for (const x of FXP) {
        const p = pBy[x.c], n = dn(x.c), tc = x.t;
        const med = FXD.pos_median[x.pos] || 0;
        const h = x.h || [];
        const mx = Math.max(10, ...h.map(r => r[2]), x.p90 || 0), W = 640, H = 180, bw = W / Math.max(h.length + 1, 6);
        const yy = v => H - 20 - Math.max(0, v) / mx * (H - 40);
        const svg = `<svg class="fxchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('PIR ανά αγώνα', 'PIR per game', 'PIR por partido', 'PIR po utakmici'))}">${h.map((r, i) => `<rect x="${(i * bw + 4).toFixed(1)}" y="${yy(r[2]).toFixed(1)}" width="${(bw - 8).toFixed(1)}" height="${(H - 20 - yy(r[2])).toFixed(1)}" rx="3" class="b"><title>${esc(rdTxt0(r[0]))}: ${r[2]} PIR, ${f1(r[1])}'</title></rect><text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${r[0]}</text>`).join('')}<rect x="${(h.length * bw + 4).toFixed(1)}" y="${yy(x.p90).toFixed(1)}" width="${(bw - 8).toFixed(1)}" height="${(yy(x.p10) - yy(x.p90)).toFixed(1)}" rx="3" class="r"/><line x1="${(h.length * bw + 2).toFixed(1)}" x2="${(h.length * bw + bw - 2).toFixed(1)}" y1="${yy(x.pp).toFixed(1)}" y2="${yy(x.pp).toFixed(1)}" class="p"/><text x="${(h.length * bw + bw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${FXD.round}</text><line x1="0" x2="${W}" y1="${yy(med).toFixed(1)}" y2="${yy(med).toFixed(1)}" class="m"/></svg>`;
        const fl = (x.f || []).filter(f => Math.abs(f[1]) >= 0.1);
        const pmain = `<article class="article lead fx fxplayer">
<p class="crumbs"><a href="${fxu('projections')}">EuroLeague Fantasy PIR Projections</a></p>
<h1>${esc(n)}</h1>
<p class="lede2">${esc(T(`${n} (${tName(tc)}, ${POSL[x.pos] || x.pos}) στην ${rdTxt0(FXD.round)}: εκτίμηση ${f1(x.pp)} PIR σε ${f1(x.pm)} λεπτά, με εύρος ${f1(x.p10)}–${f1(x.p90)}.`, `${n} (${tName(tc)}, ${POSL[x.pos] || x.pos}) in ${rdTxt0(FXD.round)}: projected ${f1(x.pp)} PIR in ${f1(x.pm)} minutes, range ${f1(x.p10)}–${f1(x.p90)}.`, `${n} (${tName(tc)}, ${POSL[x.pos] || x.pos}) en la ${rdTxt0(FXD.round).toLowerCase()}: ${f1(x.pp)} de PIR estimado en ${f1(x.pm)} minutos, rango ${f1(x.p10)}–${f1(x.p90)}.`, `${n} (${tName(tc)}, ${POSL[x.pos] || x.pos}) u ${rdTxt0(FXD.round)}: procena ${f1(x.pp)} PIR-a za ${f1(x.pm)} minuta, opseg ${f1(x.p10)}–${f1(x.p90)}.`))}</p>
<div class="otiles ectiles fxtiles"><div><b>${f1(x.pp)}</b><span>${esc(U.proj)}</span></div><div><b>${f1(x.p10)} / ${f1(x.p50)} / ${f1(x.p90)}</b><span>P10 / P50 / P90</span></div><div><b>${f1(x.pm)}</b><span>${T('Εκτ. λεπτά', 'Proj. minutes', 'Min estimados', 'Proc. minuti')}</span></div><div><b>${x.ppm.toFixed(2)}</b><span>${T('Εκτ. PIR/λεπτό', 'Proj. PIR/min', 'PIR/min est.', 'Proc. PIR/min')}</span></div><div><b>${x.conf}</b><span>${T('Σιγουριά', 'Confidence', 'Confianza', 'Pouzdanost')}</span></div><div><b>${f1(x.price)}</b><span>${esc(U.price)}</span></div></div>
<p>${stB(x.status)} · ${esc(T('Επόμενος αγώνας', 'Next game', 'Próximo partido', 'Sledeća utakmica'))}: <b>${vsTxt(x)}</b>, ${esc(dayLbl(x.day))}${x.pwin != null ? ` · ${esc(T('Πιθανότητα νίκης ομάδας', 'Team win probability', 'Probabilidad de victoria del equipo', 'Šansa za pobedu tima'))} ${Math.round(x.pwin * 100)}%` : ''}</p>
<h2>${esc(T('Τι επηρεάζει την πρόβλεψη', 'What drives the projection', 'Qué influye en la proyección', 'Šta utiče na projekciju'))}</h2>
<ul class="fxfac"><li>${esc(T('Βάση', 'Baseline', 'Base', 'Osnova'))}: ${f1(x.pm)} ${esc(T('λεπτά', 'minutes', 'minutos', 'minuta'))} × ${x.ppm.toFixed(2)} PIR/${esc(T('λεπτό', 'min', 'min', 'min'))} (${esc(T('τελευταίοι 10', 'last 10', 'últimos 10', 'poslednjih 10'))}: ${x.pirpm.toFixed(2)})</li>${fl.map(f => `<li>${esc(FACT[f[0]] || f[0])}: <b class="${f[1] >= 0 ? 'pos' : 'neg'}">${f[1] >= 0 ? '+' : ''}${f1(f[1])} PIR</b></li>`).join('')}</ul>
<p>${esc(T('Σύγκριση με τη διάμεσο της θέσης', 'Compared with the position median', 'Comparado con la mediana de su posición', 'Poređenje sa medijanom pozicije'))} (${esc(POSL[x.pos] || x.pos)}: ${f1(med)} PIR): <b class="${x.pp >= med ? 'pos' : 'neg'}">${x.pp >= med ? '+' : ''}${f1(x.pp - med)}</b></p>
<h2>${esc(T('Ιστορικό PIR', 'PIR history', 'Historial de PIR', 'Istorija PIR-a'))}</h2>
${svg}
<p class="sub">${esc(T('Στήλες: PIR ανά αγωνιστική · τελευταία στήλη: εύρος P10–P90 και εκτίμηση · γραμμή: διάμεσος της θέσης.', 'Bars: PIR by round · last bar: P10–P90 range and projection · line: position median.', 'Barras: PIR por jornada · última barra: rango P10–P90 y proyección · línea: mediana de la posición.', 'Stubići: PIR po kolu · poslednji: opseg P10–P90 i projekcija · linija: medijana pozicije.'))} L5 ${f1(x.l5)} · L10 ${f1(x.l10)}</p>
<p><a class="pread" href="${urlFor(LG, 'player:' + p.s)}">${esc(T('Όλα τα στατιστικά του παίκτη →', 'All player stats →', 'Todas las estadísticas del jugador →', 'Sva statistika igrača →'))}</a></p>
${notes}</article>`;
        await simplePage('fx:player/' + p.s, { view: 'fx', title: T(`${n} Fantasy: εκτίμηση PIR ${FXD.round}ης αγωνιστικής | ${SITE_NAME}`, `${n} Fantasy PIR projection, ${rdTxt0(FXD.round)} | ${SITE_NAME}`, `${n} Fantasy: PIR estimado, ${rdTxt0(FXD.round).toLowerCase()} | ${SITE_NAME}`, `${n} Fantasy PIR projekcija, ${rdTxt0(FXD.round)} | ${SITE_NAME}`),
          desc: T(`Εκτίμηση PIR, λεπτών και εύρος P10–P90 του ${n} για το EuroLeague Fantasy στην ${rdTxt0(FXD.round)}, με τους παράγοντες της πρόβλεψης.`, `${n}'s projected PIR, minutes and P10–P90 range for EuroLeague Fantasy in ${rdTxt0(FXD.round)}, with the factors behind it.`, `PIR estimado, minutos y rango P10–P90 de ${n} para el EuroLeague Fantasy en la ${rdTxt0(FXD.round).toLowerCase()}, con los factores de la proyección.`, `Procenjeni PIR, minuti i opseg P10–P90 za ${n} u EuroLeague Fantasy, ${rdTxt0(FXD.round)}, sa faktorima projekcije.`), main: pmain });
      }

      // static "API" (same for every language, written once)
      if (LG === 'el') {
        const api = path.join(OUT, 'api', 'fantasy');
        for (const d of ['players', 'projections', 'optimizer', 'round-planner', 'player']) await fs.mkdir(path.join(api, d), { recursive: true });
        const pub = FXP.map(x => ({ ...x, dn: dn(x.c), s: pBy[x.c].s }));
        const meta = { round: FXD.round, generated: FXD.generated, model: FXD.model, days: FXD.days, disclaimer: 'Projections are statistical estimates and do not guarantee performance.' };
        const wj = (f, o) => fs.writeFile(path.join(api, f), JSON.stringify(o));
        await wj(`players/r${FXD.round}.json`, { ...meta, players: pub.map(x => ({ c: x.c, dn: x.dn, s: x.s, t: x.t, pos: x.pos, price: x.price, status: x.status, l5: x.l5, l10: x.l10, pirpm: x.pirpm })) });
        await wj('players/latest.json', { ...meta, players: pub.map(x => ({ c: x.c, dn: x.dn, s: x.s, t: x.t, pos: x.pos, price: x.price, status: x.status, l5: x.l5, l10: x.l10, pirpm: x.pirpm })) });
        const proj = { ...meta, pos_median: FXD.pos_median, backtest: FXD.backtest, players: pub.map(({ h, ...r }) => r), coaches: FXD.coaches };
        await wj(`projections/r${FXD.round}.json`, proj); await wj('projections/latest.json', proj);
        for (const risk of ['ceiling', 'safe']) {
          const r = OPT.optimize(FXP, FXD.coaches, { risk });
          const slim = r && { formation: r.formation, cost: r.cost, budget: r.budget, risk, totals: r.totals, captain: r.captain.c, start: r.start.map(p => p.c), sixth: r.sixth?.c, bench: r.bench.map(p => p.c), coach: r.coach?.t };
          await wj(`optimizer/r${FXD.round}-${risk}.json`, { ...meta, ...slim }); await wj(`optimizer/latest-${risk}.json`, { ...meta, ...slim });
          if (risk === 'ceiling') { const pl = OPT.roundPlan(r, FXD.days); await wj(`round-planner/r${FXD.round}.json`, { ...meta, ...pl }); await wj('round-planner/latest.json', { ...meta, ...pl }); }
        }
        for (const x of pub) await wj(`player/${x.c}.json`, { ...meta, ...x });
      }
    }

    await page('fantasy', { view: 'fantasy', extra: FXDASH,
      title: T(`EuroLeague Fantasy: ποιους να βάλεις στην ${lastRound + 1}η αγωνιστική | ${SITE_NAME}`, `EuroLeague Fantasy picks for Round ${lastRound + 1} | ${SITE_NAME}`, `EuroLeague Fantasy: a quién fichar en la jornada ${lastRound + 1} | ${SITE_NAME}`, `EuroLeague Fantasy: koga izabrati za ${lastRound + 1}. kolo | ${SITE_NAME}`),
      desc: T(`Εκτιμήσεις PIR ανά θέση, δυσκολία προγράμματος, διπλές εβδομάδες και η πεντάδα της αγωνιστικής για το EuroLeague Fantasy.`,
        `Projected PIR by position, schedule difficulty, double weeks and the team of the round for EuroLeague Fantasy.`, `PIR estimado por posición, dificultad del calendario, semanas dobles y el quinteto de la jornada para el EuroLeague Fantasy.`, `Procena PIR-a po poziciji, težina rasporeda, duple nedelje i idealna petorka kola za EuroLeague Fantasy.`) });
    await page('preds', { view: 'preds',
      title: T(`EuroLeague προγνωστικά ${lastRound + 1}ης αγωνιστικής: εκτιμήσεις και ανάλυση | ${SITE_NAME}`, `EuroLeague predictions Round ${lastRound + 1}: projected scores and analysis | ${SITE_NAME}`, `Pronósticos EuroLeague jornada ${lastRound + 1}: marcadores estimados y análisis | ${SITE_NAME}`, `Prognoze Evrolige za ${lastRound + 1}. kolo: procenjeni rezultati i analiza | ${SITE_NAME}`),
      desc: T(`Προγνωστικά για την ${lastRound + 1}η αγωνιστική της ${S}: εκτίμηση σκορ, πιθανότητα νίκης, σύνολο πόντων, φόρμα και η ανάλυσή μας.`,
        `Predictions for Round ${lastRound + 1} of the ${S}: projected score, win probability, total points, form and our analysis.`, `Pronósticos para la jornada ${lastRound + 1} de la ${S}: marcador estimado, probabilidad de victoria, puntos totales, forma y nuestro análisis.`, `Prognoze za ${lastRound + 1}. kolo ${S}: procenjeni rezultat, verovatnoća pobede, ukupno poena, forma i naša analiza.`) });

    // ---- «Fantasy: ποιους να πάρεις» για κάθε αγωνιστική (με τα δεδομένα πριν από αυτήν) και απολογισμός μετά
    const nextRoundF = (league.games.find(g => !g[6]) || [0])[0];
    let fRounds = [...new Set(league.games.map(g => g[0]))].filter(r => r >= 3 && r <= nextRoundF).sort((a, b) => b - a);
    const POSF = { Guard: T('Γκαρντ', 'Guards', 'Bases y escoltas', 'Bekovi'), Forward: T('Φόργουορντ', 'Forwards', 'Aleros', 'Krila'), Center: T('Σέντερ', 'Centers', 'Pívots', 'Centri') };
    const fantasyFor = r => {
      const tc = p => p.t.split(';').pop();
      const opp = {}; for (const g of league.games.filter(g => g[0] === r)) { opp[g[2]] = [g[3], 1, g]; opp[g[3]] = [g[2], 0, g]; }
      const allow = {}, gp = {};
      for (const p of players) for (const x of p.g) if (x[0] < r && x[7] > 0) { const o = x[2]; allow[o] = allow[o] || { Guard: 0, Forward: 0, Center: 0 }; allow[o][p.pos] = (allow[o][p.pos] || 0) + x[25]; }
      for (const g of league.games.filter(g => g[6] && g[0] < r)) { gp[g[2]] = (gp[g[2]] || 0) + 1; gp[g[3]] = (gp[g[3]] || 0) + 1; }
      const lavg = {}; for (const ps of Object.keys(POSF)) { const v = Object.keys(allow).filter(c => gp[c]).map(c => allow[c][ps] / gp[c]); lavg[ps] = v.reduce((a, b) => a + b, 0) / (v.length || 1); }
      const list = [];
      for (const p of players) {
        const c = tc(p), o = opp[c]; if (!o || !POSF[p.pos]) continue;
        const g = p.g.filter(x => x[0] < r && x[7] > 0); if (g.length < 3) continue;
        const avg = g.reduce((s, x) => s + x[25], 0) / g.length, min = g.reduce((s, x) => s + x[7], 0) / g.length / 60; if (min < 15) continue;
        const l3 = g.slice(-3).reduce((s, x) => s + x[25], 0) / Math.min(3, g.length);
        if (r === nextRoundF && INJ[LG][p.c]) continue;
        const ratio = gp[o[0]] && lavg[p.pos] ? (allow[o[0]][p.pos] / gp[o[0]]) / lavg[p.pos] : 1;
        const proj = (0.6 * avg + 0.4 * l3) * Math.sqrt(ratio) * (o[1] ? 1.03 : 0.97);
        const act = p.g.find(x => x[0] === r);
        list.push({ p, c, o: o[0], home: o[1], g: o[2], avg, l3, ratio, proj, act: act ? (act[7] > 0 ? act[25] : null) : undefined });
      }
      return list;
    };
    const fTitle = r => T(`Fantasy EuroLeague ${r}η αγωνιστική: ποιους να πάρεις`, `EuroLeague Fantasy Round ${r}: who to pick`, `Fantasy de la EuroLeague, jornada ${r}: a quién fichar`, `Evroliga Fantasy ${r}. kolo: koga izabrati`);
    const FCACHE = Object.fromEntries(fRounds.map(r => [r, fantasyFor(r)]));
    fRounds = fRounds.filter(r => FCACHE[r].length >= 20);
    for (const r of fRounds) {
      const L = FCACHE[r];
      const past = league.games.filter(g => g[0] === r).every(g => g[6]);
      const pL = x => `<a href="${urlFor(LG, 'player:' + x.p.s)}">${esc(niceName(x.p.n))}</a>`;
      const mt = x => `${x.home ? 'vs' : '@'} <a href="${urlFor(LG, `game:${x.g[0]}|${x.g[2]}|${x.g[3]}`)}">${esc(tName(x.o))}</a>`;
      const picks = {}; for (const ps of Object.keys(POSF)) picks[ps] = L.filter(x => x.p.pos === ps).sort((a, b) => b.proj - a.proj).slice(0, 5);
      const all = Object.values(picks).flat();
      const gems = L.filter(x => x.avg < 13 && x.ratio > 1.08 && !all.includes(x)).sort((a, b) => b.proj - a.proj).slice(0, 5);
      const avoid = L.filter(x => x.avg >= 15 && x.ratio < 0.92).sort((a, b) => a.ratio - b.ratio).slice(0, 4);
      const actCell = x => past ? `<td><b>${x.act == null ? '–' : x.act}</b></td>` : '';
      const head = `<tr><th class="l">${T('Παίκτης', 'Player', 'Jugador', 'Igrač')}</th><th class="l">${T('Αγώνας', 'Game', 'Partido', 'Utakmica')}</th><th>${T('Μ.Ο. PIR', 'Avg PIR', 'PIR medio', 'Prosek PIR')}</th><th>${T('Τελ. 3', 'Last 3', 'Últ. 3', 'Posl. 3')}</th><th>${T('Εκτίμηση', 'Projection', 'Estimación', 'Procena')}</th>${past ? `<th>${T('Έφερε', 'Scored', 'Hizo', 'Ostvario')}</th>` : ''}</tr>`;
      const tbl = arr => `<div class="tbl"><table><thead>${head}</thead><tbody>${arr.map(x => `<tr><td class="l">${pL(x)} <small>${esc(tName(x.c))}</small></td><td class="l">${mt(x)}</td><td>${f1(x.avg)}</td><td>${f1(x.l3)}</td><td><b>${f1(x.proj)}</b></td>${actCell(x)}</tr>`).join('')}</tbody></table></div>`;
      const got = all.filter(x => x.act != null && x.act !== undefined), gotAvg = got.length ? got.reduce((s, x) => s + x.act, 0) / got.length : null;
      const top1 = all.slice().sort((a, b) => b.proj - a.proj)[0];
      const intro = past
        ? T(`Οι προτάσεις μας για το Fantasy της ${r}ης αγωνιστικής, όπως βγήκαν από τα στατιστικά πριν από την αγωνιστική, και πόσο PIR έφερε τελικά ο καθένας.${gotAvg != null ? ` Οι ${got.length} προτάσεις μας έφεραν κατά μέσο όρο ${f1(gotAvg)} PIR.` : ''}`, `Our Fantasy picks for Round ${r}, based on the stats before the round, and how much PIR each one actually scored.${gotAvg != null ? ` Our ${got.length} picks averaged ${f1(gotAvg)} PIR.` : ''}`, `Nuestras recomendaciones de Fantasy para la jornada ${r}, según las estadísticas previas, y cuánto PIR hizo finalmente cada uno.${gotAvg != null ? ` Nuestras ${got.length} recomendaciones promediaron ${f1(gotAvg)} de PIR.` : ''}`, `Naši Fantasy predlozi za ${r}. kolo, na osnovu statistike pre kola, i koliko je PIR-a svaki od njih ostvario.${gotAvg != null ? ` Naših ${got.length} predloga imalo je prosečno ${f1(gotAvg)} PIR-a.` : ''}`)
        : T(`Ποιους να πάρεις στο Fantasy της ${r}ης αγωνιστικής της EuroLeague: οι καλύτερες επιλογές ανά θέση με βάση τη φόρμα, το PIR και το πόσο εύκολο είναι το ματς. Πρώτη επιλογή: ${niceName(top1.p.n)} (${f1(top1.proj)} εκτιμώμενο PIR).`, `Who to pick in EuroLeague Fantasy for Round ${r}: the best options by position based on form, PIR and how easy the matchup is. Top pick: ${niceName(top1.p.n)} (${f1(top1.proj)} projected PIR).`, `A quién fichar en el Fantasy de la EuroLeague en la jornada ${r}: las mejores opciones por posición según la forma, el PIR y la dificultad del rival. Primera opción: ${niceName(top1.p.n)} (${f1(top1.proj)} de PIR estimado).`, `Koga izabrati u Evroliga Fantasy za ${r}. kolo: najbolje opcije po pozicijama na osnovu forme, PIR-a i težine meča. Prvi izbor: ${niceName(top1.p.n)} (${f1(top1.proj)} procenjenog PIR-a).`);
      const prevNext = [fRounds.find(x => x === r + 1), fRounds.find(x => x === r - 1)];
      const main = `<article class="article fpick">
<p class="kicker">Fantasy · ${esc(rdTxt0(r))}</p>
<h1>${esc(fTitle(r))}</h1>
<p class="lede2">${esc(intro)}</p>
${Object.keys(POSF).map(ps => `<h2>${esc(POSF[ps])}</h2>${tbl(picks[ps])}`).join('')}
${gems.length ? `<h2>${T('Κρυφά διαμάντια', 'Hidden gems', 'Joyas ocultas', 'Skriveni biseri')}</h2><p class="sub">${T('Παίκτες με χαμηλότερο μέσο όρο αλλά με ματς απέναντι σε άμυνα που δίνει πολλά στη θέση τους', 'Players with lower averages but a matchup against a defense that gives up a lot at their position', 'Jugadores con menos promedio pero ante una defensa que concede mucho en su posición', 'Igrači sa nižim prosekom, ali protiv odbrane koja mnogo prima na njihovoj poziciji')}</p>${tbl(gems)}` : ''}
${avoid.length ? `<h2>${T('Προσοχή: δύσκολο ματς', 'Careful: tough matchup', 'Cuidado: rival difícil', 'Oprez: težak meč')}</h2><p class="sub">${T('Μεγάλα ονόματα που παίζουν με άμυνα που δίνει λίγα στη θέση τους', 'Big names facing a defense that gives up little at their position', 'Grandes nombres ante una defensa que concede poco en su posición', 'Velika imena protiv odbrane koja malo prima na njihovoj poziciji')}</p>${tbl(avoid)}` : ''}
<p class="note">${T('Η εκτίμηση συνδυάζει τον μέσο όρο PIR της σεζόν, τη φόρμα των 3 τελευταίων αγώνων, το PIR που δίνει ο αντίπαλος στη θέση του παίκτη και την έδρα. Μετράνε όσοι έχουν τουλάχιστον 3 αγώνες και 15 λεπτά μέσο όρο· οι τραυματίες δεν προτείνονται.', 'The projection combines season PIR average, form over the last 3 games, the PIR the opponent allows at the player’s position and home court. Players with at least 3 games and 15 minutes per game; injured players are excluded.', 'La estimación combina el PIR medio de la temporada, la forma de los 3 últimos partidos, el PIR que concede el rival en la posición del jugador y el factor cancha. Cuentan los jugadores con al menos 3 partidos y 15 minutos de media; los lesionados no se recomiendan.', 'Procena kombinuje prosečan PIR sezone, formu u poslednje 3 utakmice, PIR koji protivnik prima na poziciji igrača i domaći teren. Računaju se igrači sa najmanje 3 utakmice i 15 minuta u proseku; povređeni se ne predlažu.')}</p>
<p class="leadnav">${prevNext[1] ? `<a href="${urlFor(LG, 'fpick:' + prevNext[1])}">← ${esc(rdTxt0(prevNext[1]))}</a>` : ''}<a href="${urlFor(LG, 'fantasy')}">Fantasy</a>${prevNext[0] ? `<a href="${urlFor(LG, 'fpick:' + prevNext[0])}">${esc(rdTxt0(prevNext[0]))} →</a>` : ''}</p>
</article>`;
      await simplePage('fpick:' + r, { view: 'articles', title: `${fTitle(r)} | ${SITE_NAME}`, desc: intro.slice(0, 300), main,
        ld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: fTitle(r), inLanguage: LG, datePublished: data.fetchedAt.slice(0, 10), dateModified: data.fetchedAt.slice(0, 10), author: { '@type': 'Organization', name: SITE_NAME }, publisher: { '@type': 'Organization', name: SITE_NAME } }, crumbs([[SITE_NAME, B(LG)], [T('Άρθρα', 'Articles', 'Artículos', 'Članci'), urlFor(LG, 'articles')], [fTitle(r), urlFor(LG, 'fpick:' + r)]])] });
    }

    // ---- Το παρολί της αγωνιστικής: οι πιο σίγουρες εκτιμήσεις του μοντέλου, με δεδομένα μόνο πριν από την αγωνιστική
    const nextRoundP = (league.games.find(g => !g[6]) || [0])[0];
    const pRounds = [...new Set(league.games.map(g => g[0]))].filter(r => r >= 3 && r <= nextRoundP).sort((a, b) => b - a);
    const recBefore = (c, r) => { const gs = league.games.filter(g => g[6] && g[0] < r && (g[2] === c || g[3] === c)); const w = gs.filter(g => (g[2] === c ? g[4] > g[5] : g[5] > g[4])).length; return [w, gs.length - w]; };
    const formBefore = (c, r) => league.games.filter(g => g[6] && g[0] < r && (g[2] === c || g[3] === c)).slice(-5).map(g => ((g[2] === c ? g[4] > g[5] : g[5] > g[4]) ? T('Ν', 'W', 'V', 'P') : T('Η', 'L', 'D', 'I'))).join('');
    const paroliFor = r => {
      const M = teamModel(players, r);
      const cand = league.games.filter(g => g[0] === r && TEAMS[g[2]] && TEAMS[g[3]]).map(g => { const x = M.predict(g[2], g[3]); if (!x) return null; const homeFav = x.prob >= 0.5; return { g, x, fav: homeFav ? g[2] : g[3], dog: homeFav ? g[3] : g[2], p: homeFav ? x.prob : 1 - x.prob }; }).filter(Boolean).sort((a, b) => b.p - a.p);
      const picks = cand.filter(c => c.p >= 0.6).slice(0, 3);
      picks.sort((a, b) => a.g[1].slice(0, 8).localeCompare(b.g[1].slice(0, 8)));
      if (picks.length < 2) return null;
      const P = picks.reduce((s, c) => s * c.p, 1);
      const done = picks.every(c => c.g[6]);
      for (const c of picks) c.hit = c.g[6] ? ((c.g[4] > c.g[5] ? c.g[2] : c.g[3]) === c.fav) : null;
      return { r, picks, P, done, won: done ? picks.every(c => c.hit) : null };
    };
    const PAR = Object.fromEntries(pRounds.map(r => [r, paroliFor(r)]).filter(x => x[1]));
    const parRounds = Object.keys(PAR).map(Number).sort((a, b) => b - a);
    const parTitle = r => T(`Το παρολί της ${r}ης αγωνιστικής της EuroLeague`, `EuroLeague Round ${r} parlay`, `La combinada de la jornada ${r} de la EuroLeague`, `Tiket ${r}. kola Evrolige`);
    const fo = p => (1 / p).toFixed(2);
    const RG = T('Οι εκτιμήσεις είναι στατιστικές και δεν αποτελούν συμβουλή στοιχήματος. Το στοίχημα επιτρέπεται μόνο σε άτομα άνω των 21 ετών. Παίξτε υπεύθυνα.', 'These are statistical estimates, not betting advice. Betting is for adults only (21+ in Greece, 18+ in most countries). Please gamble responsibly.', 'Son estimaciones estadísticas, no un consejo de apuestas. Las apuestas son solo para adultos (+21 en Grecia, +18 en España y la mayoría de países). Juega con responsabilidad.', 'Ovo su statističke procene, a ne savet za klađenje. Klađenje je samo za punoletne (21+ u Grčkoj, 18+ u većini zemalja). Igrajte odgovorno.');
    const parDone = parRounds.map(r => PAR[r]).filter(x => x.done);
    const pickDone = parDone.flatMap(x => x.picks);
    const recTxt = parDone.length ? T(`Μέχρι τώρα: ${parDone.filter(x => x.won).length} από ${parDone.length} παρολί βγήκαν και ${pickDone.filter(c => c.hit).length} από ${pickDone.length} επιλογές (το μοντέλο περίμενε ${f1(pickDone.reduce((s, c) => s + c.p, 0))}).`, `So far: ${parDone.filter(x => x.won).length} of ${parDone.length} parlays won and ${pickDone.filter(c => c.hit).length} of ${pickDone.length} picks (the model expected ${f1(pickDone.reduce((s, c) => s + c.p, 0))}).`, `Hasta ahora: ${parDone.filter(x => x.won).length} de ${parDone.length} combinadas acertadas y ${pickDone.filter(c => c.hit).length} de ${pickDone.length} selecciones (el modelo esperaba ${f1(pickDone.reduce((s, c) => s + c.p, 0))}).`, `Do sada: ${parDone.filter(x => x.won).length} od ${parDone.length} tiketa prošlo i ${pickDone.filter(c => c.hit).length} od ${pickDone.length} parova (model je očekivao ${f1(pickDone.reduce((s, c) => s + c.p, 0))}).`) : '';
    for (const r of parRounds) {
      const X = PAR[r];
      const live = r === nextRoundP && !X.done;
      const why = c => {
        const [fw, fl] = recBefore(c.fav, r), [dw, dl] = recBefore(c.dog, r), ff = formBefore(c.fav, r), df = formBefore(c.dog, r);
        const home = c.g[2] === c.fav;
        const out = [];
        out.push(T(`${tName(c.fav)} ${fw}-${fl}${ff ? ` (φόρμα ${ff})` : ''}, ${tName(c.dog)} ${dw}-${dl}${df ? ` (φόρμα ${df})` : ''} πριν από την αγωνιστική.`, `${tName(c.fav)} ${fw}-${fl}${ff ? ` (form ${ff})` : ''}, ${tName(c.dog)} ${dw}-${dl}${df ? ` (form ${df})` : ''} before the round.`, `${tName(c.fav)} ${fw}-${fl}${ff ? ` (racha ${ff})` : ''}, ${tName(c.dog)} ${dw}-${dl}${df ? ` (racha ${df})` : ''} antes de la jornada.`, `${tName(c.fav)} ${fw}-${fl}${ff ? ` (forma ${ff})` : ''}, ${tName(c.dog)} ${dw}-${dl}${df ? ` (forma ${df})` : ''} pre kola.`));
        out.push(T(`Εκτίμηση σκορ ${Math.round(c.x.ph)}-${Math.round(c.x.pa)}${home ? ', με την έδρα υπέρ του φαβορί' : ', ακόμη και εκτός έδρας'}.`, `Projected score ${Math.round(c.x.ph)}-${Math.round(c.x.pa)}${home ? ', with home court for the favourite' : ', even on the road'}.`, `Marcador estimado ${Math.round(c.x.ph)}-${Math.round(c.x.pa)}${home ? ', con el factor cancha a favor del favorito' : ', incluso a domicilio'}.`, `Procenjeni rezultat ${Math.round(c.x.ph)}:${Math.round(c.x.pa)}${home ? ', uz domaći teren za favorita' : ', čak i u gostima'}.`));
        if (live) { const inj = t => players.filter(p => p.t.split(';').pop() === t && INJ[LG][p.c] && INJ[LG][p.c].m === 1).map(p => niceName(p.n)); const a = inj(c.fav), b = inj(c.dog); if (a.length || b.length) out.push(T('Τραυματίες', 'Injured', 'Lesionados', 'Povređeni') + ': ' + [[c.fav, a], [c.dog, b]].filter(x => x[1].length).map(([t, l]) => `${tName(t)}: ${l.join(', ')}`).join(' · ') + '.'); }
        const prev = league.games.find(o => o[6] && o[0] < r && ((o[2] === c.fav && o[3] === c.dog) || (o[2] === c.dog && o[3] === c.fav)));
        if (prev) out.push(T(`Φέτος: ${tName(prev[2])} – ${tName(prev[3])} ${prev[4]}-${prev[5]}.`, `Earlier this season: ${tName(prev[2])} ${prev[4]}-${prev[5]} ${tName(prev[3])}.`, `Esta temporada: ${tName(prev[2])} ${prev[4]}-${prev[5]} ${tName(prev[3])}.`, `Ove sezone: ${tName(prev[2])} - ${tName(prev[3])} ${prev[4]}:${prev[5]}.`));
        return out;
      };
      const card = c => `<div class="pcard parpick${c.hit === true ? ' ok' : c.hit === false ? ' ko' : ''}"><p class="kicker">${esc(new Date(gameDate(c.g[1])).toLocaleString(({ el: "el-GR", en: "en-GB", es: "es-ES", sr: "sr-Latn-RS" }[LG]), { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))}</p><h3><a href="${urlFor(LG, `game:${c.g[0]}|${c.g[2]}|${c.g[3]}`)}">${esc(tName(c.g[2]))} – ${esc(tName(c.g[3]))}</a></h3><p class="parsel">${T('Επιλογή', 'Pick', 'Selección', 'Izbor')}: <b>${T('νίκη', 'win', 'gana', 'pobeda')} ${esc(tName(c.fav))}</b> · ${T('πιθανότητα', 'probability', 'probabilidad', 'verovatnoća')} ${Math.round(c.p * 100)}% · ${T('δίκαιη απόδοση', 'fair odds', 'cuota justa', 'fer kvota')} ${fo(c.p)}</p><ul>${why(c).map(t => `<li>${esc(t)}</li>`).join('')}</ul>${c.g[6] ? `<p class="parres">${T('Αποτέλεσμα', 'Result', 'Resultado', 'Rezultat')}: ${c.g[4]}-${c.g[5]} ${c.hit ? '✔' : '✘'}</p>` : ''}</div>`;
      const intro = live
        ? T(`Οι ${X.picks.length} πιο σίγουρες εκτιμήσεις του μοντέλου μας για την ${r}η αγωνιστική της ${S}. Πιθανότητα να βγουν όλες: ${Math.round(X.P * 100)}% (δίκαιη συνολική απόδοση ${fo(X.P)}).`, `Our model's ${X.picks.length} most confident calls for Round ${r} of the ${S}. Chance that all of them land: ${Math.round(X.P * 100)}% (fair combined odds ${fo(X.P)}).`, `Las ${X.picks.length} estimaciones más seguras de nuestro modelo para la jornada ${r} de la ${S}. Probabilidad de acertarlas todas: ${Math.round(X.P * 100)}% (cuota justa combinada ${fo(X.P)}).`, `${X.picks.length} najsigurnije procene našeg modela za ${r}. kolo ${S}. Šansa da sve prođu: ${Math.round(X.P * 100)}% (fer ukupna kvota ${fo(X.P)}).`)
        : T(`Το παρολί του μοντέλου για την ${r}η αγωνιστική, με τα δεδομένα που υπήρχαν πριν από αυτήν: ${X.done ? (X.won ? 'βγήκε' : 'δεν βγήκε') : 'σε εξέλιξη'} (${X.picks.filter(c => c.hit).length}/${X.picks.length}).`, `The model's parlay for Round ${r}, built with the data available before it: ${X.done ? (X.won ? 'won' : 'lost') : 'in progress'} (${X.picks.filter(c => c.hit).length}/${X.picks.length}).`, `La combinada del modelo para la jornada ${r}, con los datos disponibles antes de ella: ${X.done ? (X.won ? 'acertada' : 'fallada') : 'en juego'} (${X.picks.filter(c => c.hit).length}/${X.picks.length}).`, `Tiket modela za ${r}. kolo, sa podacima pre kola: ${X.done ? (X.won ? 'prošao' : 'pao') : 'u toku'} (${X.picks.filter(c => c.hit).length}/${X.picks.length}).`);
      const main = `<article class="article paroli">
<p class="kicker">${esc(rdTxt0(r))} · ${T('Παρολί', 'Parlay', 'Combinada', 'Tiket')}</p>
<h1>${esc(parTitle(r))}</h1>
<p class="lede2">${esc(intro)}</p>
${X.picks.map(card).join('')}
<div class="partot"><span>${T('Σύνολο', 'Total', 'Total', 'Ukupno')}</span><b>${Math.round(X.P * 100)}%</b><span>${T('δίκαιη απόδοση', 'fair odds', 'cuota justa', 'fer kvota')} <b>${fo(X.P)}</b></span>${X.done ? `<b class="${X.won ? 'ok' : 'ko'}">${X.won ? T('Βγήκε', 'Won', 'Acertada', 'Prošao') : T('Δεν βγήκε', 'Lost', 'Fallada', 'Pao')}</b>` : ''}</div>
${recTxt ? `<p><b>${esc(recTxt)}</b> <a href="${urlFor(LG, 'paroli')}">${T('Όλο το ρεκόρ →', 'Full record →', 'Historial completo →', 'Ceo učinak →')}</a></p>` : ''}
<p class="note">${T('Η «δίκαιη απόδοση» είναι 1 διά την πιθανότητα του μοντέλου: αν μια στοιχηματική δίνει μεγαλύτερη απόδοση, το μοντέλο θεωρεί ότι η επιλογή έχει αξία. Δεν συγκρίνουμε με αποδόσεις στοιχηματικών.', '“Fair odds” are 1 divided by the model’s probability: if a bookmaker offers higher odds, the model sees value in the pick. We do not compare with bookmaker odds.', 'La «cuota justa» es 1 dividido por la probabilidad del modelo: si una casa ofrece una cuota mayor, el modelo ve valor en la selección. No comparamos con cuotas de casas de apuestas.', '„Fer kvota” je 1 podeljeno verovatnoćom modela: ako kladionica nudi veću kvotu, model vidi vrednost u izboru. Ne poredimo sa kvotama kladionica.')}</p>
<p class="note">${esc(RG)}</p>
</article>`;
      await simplePage('paroli:' + r, { view: 'articles', title: `${parTitle(r)}: ${X.picks.map(c => tName(c.fav)).join(', ')} | ${SITE_NAME}`, desc: intro.slice(0, 300), main,
        ld: crumbs([[SITE_NAME, B(LG)], [T('Παρολί', 'Parlays', 'Combinadas', 'Tiketi'), urlFor(LG, 'paroli')], [parTitle(r), urlFor(LG, 'paroli:' + r)]]) });
    }
    if (parRounds.length) {
      const cal = [[0.6, 0.7], [0.7, 0.8], [0.8, 1.01]].map(([a, b]) => { const x = pickDone.filter(c => c.p >= a && c.p < b); return { a, b, n: x.length, h: x.filter(c => c.hit).length, e: x.reduce((s, c) => s + c.p, 0) }; }).filter(x => x.n);
      const main = `<article class="article paroli">
<h1>${T('Το παρολί της αγωνιστικής: όλο το ρεκόρ', 'The round parlay: full record', 'La combinada de la jornada: historial completo', 'Tiket kola: ceo učinak')}</h1>
<p class="lede2">${esc(T('Σε κάθε αγωνιστική το μοντέλο διαλέγει τις 2-3 πιο σίγουρες νίκες, μόνο με όσα ήξερε πριν από την αγωνιστική. Εδώ φαίνονται όλα, και όσα βγήκαν και όσα όχι.', 'Every round the model picks its 2-3 most confident wins, using only what it knew before the round. Everything is shown here, hits and misses.', 'En cada jornada el modelo elige sus 2-3 victorias más seguras, solo con lo que sabía antes de la jornada. Aquí está todo, aciertos y fallos.', 'U svakom kolu model bira 2-3 najsigurnije pobede, samo sa onim što je znao pre kola. Ovde je sve, i pogoci i promašaji.'))} ${esc(recTxt)}</p>
<div class="tbl"><table><thead><tr><th class="l">${T('Αγωνιστική', 'Round', 'Jornada', 'Kolo')}</th><th class="l">${T('Επιλογές', 'Picks', 'Selecciones', 'Parovi')}</th><th>${T('Πιθανότητα', 'Probability', 'Probabilidad', 'Verovatnoća')}</th><th>${T('Δίκαιη απόδοση', 'Fair odds', 'Cuota justa', 'Fer kvota')}</th><th>${T('Αποτέλεσμα', 'Result', 'Resultado', 'Rezultat')}</th></tr></thead><tbody>${parRounds.map(r => { const X = PAR[r]; return `<tr><td class="l"><a href="${urlFor(LG, 'paroli:' + r)}">${esc(rdTxt0(r))}</a></td><td class="l">${X.picks.map(c => `${esc(tName(c.fav))}${c.hit === true ? ' ✔' : c.hit === false ? ' ✘' : ''}`).join(', ')}</td><td>${Math.round(X.P * 100)}%</td><td>${fo(X.P)}</td><td>${X.done ? (X.won ? `<b class="ok">${T('Βγήκε', 'Won', 'Acertada', 'Prošao')}</b>` : `<b class="ko">${T('Δεν βγήκε', 'Lost', 'Fallada', 'Pao')}</b>`) : T('Σε εξέλιξη', 'Upcoming', 'Pendiente', 'U toku')}</td></tr>`; }).join('')}</tbody></table></div>
${cal.length ? `<h2>${T('Βγαίνουν όσο λέει το μοντέλο;', 'Do the picks land as often as the model says?', '¿Se cumplen tanto como dice el modelo?', 'Da li prolaze onoliko koliko model kaže?')}</h2><div class="tbl"><table><thead><tr><th class="l">${T('Πιθανότητα', 'Probability', 'Probabilidad', 'Verovatnoća')}</th><th>${T('Επιλογές', 'Picks', 'Selecciones', 'Parovi')}</th><th>${T('Βγήκαν', 'Hits', 'Aciertos', 'Pogođeno')}</th><th>${T('Αναμενόμενα', 'Expected', 'Esperados', 'Očekivano')}</th></tr></thead><tbody>${cal.map(x => `<tr><td class="l">${Math.round(x.a * 100)}–${Math.min(100, Math.round(x.b * 100))}%</td><td>${x.n}</td><td>${x.h}</td><td>${f1(x.e)}</td></tr>`).join('')}</tbody></table></div>` : ''}
<p class="note">${esc(RG)}</p>
</article>`;
      await simplePage('paroli', { view: 'articles', title: T(`Παρολί EuroLeague: το ρεκόρ του μοντέλου ανά αγωνιστική | ${SITE_NAME}`, `EuroLeague parlays: the model's record by round | ${SITE_NAME}`, `Combinadas de la EuroLeague: el historial del modelo por jornada | ${SITE_NAME}`, `Tiketi Evrolige: učinak modela po kolima | ${SITE_NAME}`), desc: (recTxt || parTitle(parRounds[0])).slice(0, 300), main });
      if (LG === 'el') {
        const X = PAR[parRounds[0]];
        await fs.mkdir(path.join(OUT, 'api', 'paroli'), { recursive: true });
        await fs.writeFile(path.join(OUT, 'api', 'paroli', 'latest.json'), JSON.stringify({ round: X.r, P: X.P, done: X.done, won: X.won, url: SITE_URL + urlFor('el', 'paroli:' + X.r), picks: X.picks.map(c => ({ h: c.g[2], a: c.g[3], fav: c.fav, p: c.p, hit: c.hit, date: gameDate(c.g[1]).toISOString(), score: c.g[6] ? [c.g[4], c.g[5]] : null })), record: { won: parDone.filter(x => x.won).length, n: parDone.length, hits: pickDone.filter(c => c.hit).length, picks: pickDone.length } }));
      }
    }

    // άρθρα
    const typeLabel = t => (t === 'prognostiko' ? T('Προγνωστικό', 'Prediction', 'Pronóstico', 'Prognoza') : T('Άρθρο', 'Article', 'Artículo', 'Članak'));
    const arts = articles.filter(a => a[LG]);
    await simplePage('articles', { view: 'articles', title: T(`Άρθρα και προγνωστικά EuroLeague | ${SITE_NAME}`, `EuroLeague articles and predictions | ${SITE_NAME}`, `Artículos y pronósticos de la EuroLeague | ${SITE_NAME}`, `Članci i prognoze Evrolige | ${SITE_NAME}`),
      desc: T(`Αναλύσεις, προεπισκοπήσεις αγωνιστικών και προγνωστικά για την ${S}.`, `Analysis, round previews and predictions for the ${S}.`, `Análisis, previas de cada jornada y pronósticos de la ${S}.`, `Analize, najave kola i prognoze za ${S}.`),
      main: `<section class="article"><h1>${T('Άρθρα', 'Articles', 'Artículos', 'Članci')}</h1><p class="sub">${T('Αναλύσεις, προεπισκοπήσεις και προγνωστικά για την', 'Analysis, previews and predictions for the', 'Análisis, previas y pronósticos de la', 'Analize, najave i prognoze za')} ${esc(S)}</p>` +
        (parRounds.length ? `<h2>${T('Το παρολί της αγωνιστικής', 'The round parlay', 'La combinada de la jornada', 'Tiket kola')}</h2><div class="alist recaps">${parRounds.map(r => `<a class="acard" href="${urlFor(LG, 'paroli:' + r)}"><time>${esc(rdTxt0(r))}</time><h2>${esc(parTitle(r))}</h2></a>`).join('')}</div>` : '') +
        (fRounds.length ? `<h2>Fantasy: ${T('ποιους να πάρεις', 'who to pick', 'a quién fichar', 'koga izabrati')}</h2><div class="alist recaps">${fRounds.map(r => `<a class="acard" href="${urlFor(LG, 'fpick:' + r)}"><time>${esc(rdTxt0(r))}</time><h2>${esc(fTitle(r))}</h2></a>`).join('')}</div>` : '') +
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
<h2>Estadísticas de visitas</h2>
<p>Si lo aceptas en el aviso de cookies, usamos Google Analytics para contar visitas y ver qué páginas se leen más. Sin tu consentimiento no se guarda ninguna cookie de Analytics. Puedes cambiar tu elección en cualquier momento desde «Configurar cookies» al pie de la página.</p>
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
<h2>Statistika poseta</h2>
<p>Ako to prihvatite u obaveštenju o kolačićima, koristimo Google Analytics da brojimo posete i vidimo koje se stranice najviše čitaju. Bez vaše saglasnosti ne čuva se nijedan Analytics kolačić. Izbor možete promeniti u bilo kom trenutku preko „Podešavanja kolačića” na dnu stranice.</p>
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
<h2>Μέτρηση επισκεψιμότητας</h2>
<p>Αν το αποδεχτείτε στο μήνυμα για τα cookies, χρησιμοποιούμε το Google Analytics για να μετράμε τις επισκέψεις και ποιες σελίδες διαβάζονται περισσότερο. Χωρίς τη συγκατάθεσή σας δεν αποθηκεύεται κανένα cookie του Analytics. Μπορείτε να αλλάξετε την επιλογή σας οποιαδήποτε στιγμή από τις «Ρυθμίσεις cookies» στο κάτω μέρος της σελίδας.</p>
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
<h2>Visitor statistics</h2>
<p>If you accept it in the cookie message, we use Google Analytics to count visits and see which pages are read most. Without your consent no Analytics cookie is stored. You can change your choice at any time from “Cookie settings” at the bottom of the page.</p>
<h2>Fonts</h2>
<p>Fonts are loaded from Google Fonts, so your IP address is sent to Google when the page loads.</p>
<p>YouTube videos are shown as an image and only load from YouTube (youtube-nocookie.com) when you press play; from then on Google’s privacy policy applies.</p>
<h2>Your rights</h2>
<p>Under the General Data Protection Regulation (GDPR) you have the right to access, correct and delete your data and to object to its processing, as well as the right to lodge a complaint with the Hellenic Data Protection Authority (www.dpa.gr) or your local data protection authority.</p>
<h2>Source of the stats</h2>
<p>The stats come from the official public EuroLeague data. ${esc(SITE_NAME)} is not affiliated with the EuroLeague.</p>
<p class="sub">Last updated: ${esc(athensEn)}</p></div>` });

    // ---- Team Analytics, On/Off, Lineups
    const TIP = {
      ortg: T('Πόντοι ανά 100 κατοχές (επίθεση).', 'Points scored per 100 possessions.', 'Puntos anotados por cada 100 posesiones.', 'Postignuti poeni na 100 poseda.'),
      drtg: T('Πόντοι που δέχεται ανά 100 κατοχές (άμυνα· χαμηλότερο = καλύτερο).', 'Points allowed per 100 possessions (lower is better).', 'Puntos recibidos por cada 100 posesiones (menos es mejor).', 'Primljeni poeni na 100 poseda (manje je bolje).'),
      net: T('ORtg μείον DRtg: πόσους πόντους «κερδίζει» η ομάδα ανά 100 κατοχές.', 'ORtg minus DRtg: points won per 100 possessions.', 'ORtg menos DRtg: puntos ganados por cada 100 posesiones.', 'ORtg minus DRtg: dobijeni poeni na 100 poseda.'),
      pace: T('Κατοχές ανά 40 λεπτά: πόσο γρήγορα παίζει.', 'Possessions per 40 minutes: how fast the team plays.', 'Posesiones por 40 minutos: ritmo de juego.', 'Posedi na 40 minuta: tempo igre.'),
      ppp: T('Πόντοι ανά κατοχή.', 'Points per possession.', 'Puntos por posesión.', 'Poeni po posedu.'),
      efg: T('Ποσοστό σουτ όπου το τρίποντο μετρά 1,5 φορά: (FGM + 0,5·3PM) / FGA.', 'Field goal % with threes worth 1.5: (FGM + 0.5·3PM) / FGA.', 'Acierto en tiros de campo con el triple valiendo 1,5.', 'Procenat šuta gde trojka vredi 1,5.'),
      ts: T('Πραγματικό ποσοστό ευστοχίας, μετρώντας και τις βολές.', 'True shooting: efficiency including free throws.', 'Acierto real, incluidos los tiros libres.', 'Pravi procenat šuta, uključujući slobodna bacanja.'),
      ast: T('Ποσοστό εύστοχων καλαθιών που ήρθαν από ασίστ.', 'Share of made field goals that were assisted.', 'Porcentaje de canastas asistidas.', 'Udeo pogođenih šuteva posle asistencije.'),
      tov: T('Λάθη ανά κατοχή (χαμηλότερο = καλύτερο).', 'Turnovers per possession (lower is better).', 'Pérdidas por posesión (menos es mejor).', 'Izgubljene lopte po posedu (manje je bolje).'),
      oreb: T('Ποσοστό των διαθέσιμων επιθετικών ριμπάουντ που παίρνει.', 'Share of available offensive rebounds grabbed.', 'Porcentaje de rebotes ofensivos disponibles capturados.', 'Udeo uhvaćenih skokova u napadu.'),
      dreb: T('Ποσοστό των διαθέσιμων αμυντικών ριμπάουντ που παίρνει.', 'Share of available defensive rebounds grabbed.', 'Porcentaje de rebotes defensivos disponibles capturados.', 'Udeo uhvaćenih skokova u odbrani.'),
      reb: T('Ποσοστό όλων των ριμπάουντ.', 'Share of all rebounds.', 'Porcentaje de todos los rebotes.', 'Udeo svih skokova.'),
      ftr: T('Βολές ανά σουτ εντός παιδιάς (FTA/FGA).', 'Free throw attempts per field goal attempt (FTA/FGA).', 'Tiros libres por tiro de campo (FTA/FGA).', 'Slobodna bacanja po šutu iz igre (FTA/FGA).'),
      oefg: T('eFG% των αντιπάλων (χαμηλότερο = καλύτερη άμυνα).', 'Opponent eFG% (lower is better).', 'eFG% del rival (menos es mejor).', 'eFG% protivnika (manje je bolje).'),
      otov: T('Λάθη των αντιπάλων ανά κατοχή (ψηλότερο = καλύτερη άμυνα).', 'Opponent turnovers per possession (higher is better).', 'Pérdidas del rival por posesión (más es mejor).', 'Izgubljene lopte protivnika po posedu (više je bolje).'),
      ooreb: T('Επιθετικά ριμπάουντ που δίνει στους αντιπάλους (χαμηλότερο = καλύτερο).', 'Offensive rebound % allowed (lower is better).', 'Rebote ofensivo concedido (menos es mejor).', 'Dozvoljeni skokovi u napadu (manje je bolje).'),
      oftr: T('Βολές που δίνει στους αντιπάλους ανά σουτ τους.', 'Opponent free throw rate.', 'Tiros libres concedidos por tiro rival.', 'Slobodna bacanja protivnika po šutu.'),
      min: T('Λεπτά στο παρκέ.', 'Minutes on court.', 'Minutos en pista.', 'Minuti na terenu.'),
      poss: T('Κατοχές: FGA − OREB + TOV + 0,44·FTA.', 'Possessions: FGA − OREB + TOV + 0.44·FTA.', 'Posesiones: FGA − OREB + TOV + 0,44·FTA.', 'Posedi: FGA − OREB + TOV + 0,44·FTA.'),
    };
    const MN = { ortg: 'Offensive Rating', drtg: 'Defensive Rating', net: 'Net Rating', pace: 'Pace', ppp: T('Πόντοι ανά κατοχή', 'Points per possession', 'Puntos por posesión', 'Poeni po posedu'), efg: 'eFG%', ts: 'TS%', ast: 'AST%', tov: 'TOV%', oreb: 'OREB%', dreb: 'DREB%', reb: T('Ριμπάουντ %', 'Rebound %', 'Rebote %', 'Skok %'), ftr: 'FT rate', oefg: T('eFG% αντιπάλων', 'Opp. eFG%', 'eFG% rival', 'eFG% protivnika'), otov: T('TOV% αντιπάλων', 'Opp. TOV%', 'TOV% rival', 'TOV% protivnika'), ooreb: T('OREB% αντιπάλων', 'Opp. OREB%', 'OREB% rival', 'OREB% protivnika'), oftr: T('FT rate αντιπάλων', 'Opp. FT rate', 'FT rate rival', 'FT rate protivnika') };
    const APCT = new Set(['efg', 'ts', 'ast', 'tov', 'oreb', 'dreb', 'reb', 'ftr', 'oefg', 'otov', 'ooreb', 'oftr']);
    const af = (k, v) => (v == null ? '–' : APCT.has(k) ? (100 * v).toFixed(1) + '%' : k === 'net' ? (v > 0 ? '+' : '') + v.toFixed(1) : k === 'ppp' ? v.toFixed(2) : v.toFixed(1));
    const nc = v => (v == null ? '' : v > 2 ? 'pos' : v < -2 ? 'neg' : 'neu');
    const anCtx = cp => `<script type="application/json" id="anctx">${JSON.stringify({ lg: LG, tips: TIP, teams: cp === 'U' ? Object.fromEntries(Object.entries(data.ec?.teams || {}).map(([c, v]) => [c, LG === 'el' && { ARI: 'Άρης', PAO: 'ΠΑΟΚ' }[c] || v[1]])) : Object.fromEntries(Object.keys(TEAMS).map(c => [c, tName(c)])), sentence: T('Όταν ο {n} είναι στο παρκέ, η ομάδα του έχει {on} Net Rating. Όταν είναι εκτός, {off}. Διαφορά: {d}.', 'With {n} on court his team has a {on} Net Rating; with him off, {off}. Differential: {d}.', 'Con {n} en pista su equipo tiene un Net Rating de {on}; sin él, {off}. Diferencia: {d}.', 'Kada je {n} na terenu, tim ima Net Rating {on}; kada nije, {off}. Razlika: {d}.') }).replace(/</g, '\\u003c')}</script><script type="module" src="${BASE}assets/analytics/ui.js?v=${ver}"></script>`;
    const method = `<details class="anmeth"><summary>${T('Μεθοδολογία', 'Methodology', 'Metodología', 'Metodologija')}</summary><p>${esc(T(
      'Κατοχές = FGA − OREB + TOV + 0,44·FTA (μέσος όρος ομάδας και αντιπάλου). ORtg/DRtg = πόντοι ανά 100 κατοχές, Net = ORtg − DRtg, Pace = κατοχές ανά 40 λεπτά. Τα σχήματα (lineups) και το on/off υπολογίζονται μόνο από το επίσημο play-by-play: οι πεντάδες ξαναχτίζονται από τις αλλαγές, ποτέ από σκέτα box scores. Αν σε κάποιο διάστημα δεν βγαίνει καθαρά ποιοι ήταν στο παρκέ, το διάστημα δεν μετρά. Το on/off ενός παίκτη μετρά μόνο αγώνες που αγωνίστηκε. Clutch = τελευταία 5 λεπτά της 4ης περιόδου ή της παράτασης με διαφορά έως 5 πόντους. Κάτω από 150 λεπτά ή 200 κατοχές το δείγμα θεωρείται μικρό.',
      'Possessions = FGA − OREB + TOV + 0.44·FTA (average of team and opponent). ORtg/DRtg = points per 100 possessions, Net = ORtg − DRtg, Pace = possessions per 40 minutes. Lineups and on/off come only from the official play-by-play: five-man units are rebuilt from substitutions, never from plain box scores. Stretches where it is unclear who was on court are left out. A player\'s on/off only counts games he played. Clutch = last 5 minutes of the 4th quarter or overtime with a margin of 5 or less. Under 150 minutes or 200 possessions is flagged as a small sample.',
      'Posesiones = FGA − OREB + TOV + 0,44·FTA (media de equipo y rival). ORtg/DRtg = puntos por 100 posesiones, Net = ORtg − DRtg, Pace = posesiones por 40 minutos. Quintetos y on/off salen solo del play-by-play oficial: los quintetos se reconstruyen con los cambios, nunca con el box score. Los tramos en los que no está claro quién estaba en pista no cuentan. El on/off solo cuenta partidos jugados. Clutch = últimos 5 minutos del 4.º cuarto o de la prórroga con diferencia de 5 o menos. Menos de 150 minutos o 200 posesiones se marca como muestra pequeña.',
      'Posedi = FGA − OREB + TOV + 0,44·FTA (prosek tima i protivnika). ORtg/DRtg = poeni na 100 poseda, Net = ORtg − DRtg, Pace = posedi na 40 minuta. Postave i on/off se računaju samo iz zvaničnog play-by-play zapisa: petorke se rekonstruišu iz izmena, nikada iz box score-a. Delovi gde nije jasno ko je bio na terenu se ne računaju. On/off igrača računa samo utakmice koje je igrao. Clutch = poslednjih 5 minuta 4. četvrtine ili produžetka uz razliku do 5 poena. Ispod 150 minuta ili 200 poseda označeno je kao mali uzorak.'))}</p></details>`;
    const ffBars = (cp, c) => {
      const LT = ANL[cp], r = LT.rows[c], p = LT.pct[c];
      const row = k => { const v = r[k], a = LT.avg[k], q = p[k] ?? 50; return `<div class="bar pct" title="${esc(TIP[k])}"><span>${esc(MN[k])}</span><em><i class="${q >= 60 ? 'hi' : q <= 40 ? 'lo' : ''}" style="width:${Math.max(3, q)}%"></i></em><b>${af(k, v)} <small>${T('μ.ό.', 'avg', 'media', 'pros.')} ${af(k, a)} · ${T('εκατοστημόριο', 'percentile', 'percentil', 'percentil')} ${q}</small></b></div>`; };
      return `<div class="ffgrid"><div><h4>${T('Επίθεση', 'Offense', 'Ataque', 'Napad')}</h4><div class="bars">${['efg', 'tov', 'oreb', 'ftr'].map(row).join('')}</div></div><div><h4>${T('Άμυνα', 'Defense', 'Defensa', 'Odbrana')}</h4><div class="bars">${['oefg', 'otov', 'ooreb', 'oftr'].map(row).join('')}</div></div></div><p class="sub">${T('Η μπάρα δείχνει το εκατοστημόριο στη λίγκα (100 = καλύτερη, η γραμμή στη μέση = μέσος όρος). Στην άμυνα, καλύτερο σημαίνει χαμηλότερη τιμή για τον αντίπαλο (εκτός από τα λάθη του).', 'The bar shows the league percentile (100 = best; the middle line is average). On defense, better means a lower opponent value (except their turnovers).', 'La barra muestra el percentil en la liga (100 = el mejor; la línea central es la media). En defensa, mejor significa un valor rival más bajo (salvo sus pérdidas).', 'Traka pokazuje percentil u ligi (100 = najbolji; linija u sredini je prosek). U odbrani, bolje znači nižu vrednost protivnika (osim njegovih izgubljenih lopti).')}</p><p class="lede2">${esc(AB.interpret(p, T))}</p>`;
    };
    const splitsT = (cp, c) => {
      const C = AN[cp], L = [[T('Σύνολο', 'Total', 'Total', 'Ukupno'), () => true], [T('Εντός έδρας', 'Home', 'En casa', 'Kod kuće'), g => g.home], [T('Εκτός έδρας', 'Away', 'Fuera', 'U gostima'), g => !g.home], [T('Κανονική περίοδος', 'Regular season', 'Fase regular', 'Regularni deo'), g => g.ph === 'RS'], ['Playoffs / Play-in', g => g.ph !== 'RS']];
      const gs = AB.teamGames(C, c); const last5 = new Set(gs.slice(-5).map(g => g.gc));
      L.push([T('Τελευταίοι 5', 'Last 5', 'Últimos 5', 'Poslednjih 5'), g => last5.has(g.gc)]);
      const K = ['ortg', 'drtg', 'net', 'pace', 'efg', 'tov', 'oreb', 'ftr'];
      return `<div class="tbl"><table class="antbl"><thead><tr><th class="l">${T('Διάσπαση', 'Split', 'División', 'Podela')}</th><th>${T('Αγ.', 'G', 'PJ', 'Ut.')}</th><th>${T('Ν-Η', 'W-L', 'V-D', 'P-I')}</th>${K.map(k => `<th title="${esc(TIP[k])}">${k === 'efg' ? 'eFG%' : k === 'tov' ? 'TOV%' : k === 'oreb' ? 'OREB%' : k === 'ftr' ? 'FTr' : MN[k].split(' ')[0].replace('Offensive', 'ORtg').replace('Defensive', 'DRtg').replace('Net', 'Net')}</th>`).join('')}</tr></thead><tbody>${L.map(([n, f]) => { const s = AB.teamSeason(C, c, f); if (!s.gp) return ''; return `<tr><td class="l">${esc(n)}</td><td>${s.gp}</td><td>${s.w}-${s.gp - s.w}</td>${K.map(k => `<td class="${k === 'net' ? 'net ' + nc(s[k]) : ''}">${af(k, s[k])}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
    };
    const metricT = (cp, c) => {
      const LT = ANL[cp], r = LT.rows[c], n = LT.teams.length;
      const K = ['ortg', 'drtg', 'net', 'pace', 'ppp', 'efg', 'ts', 'ast', 'tov', 'oreb', 'dreb', 'reb'];
      return `<div class="anmetrics">${K.map(k => `<div class="am" title="${esc(TIP[k])}"><span>${esc(MN[k])}</span><b class="${k === 'net' ? nc(r[k]) : ''}">${af(k, r[k])}</b><small>${LT.rk[c][k]}η/${n} · ${LT.pct[c][k]}%</small><i style="width:${LT.pct[c][k]}%"></i></div>`).join('')}</div>`.replace(/η\//g, T('η/', '/', '.º/', './'));
    };
    const teamAnalytics = (cp, c, { venue = '', coach = '', recent = '', next = '', lineupsUrl = '' } = {}) => {
      if (!ANL[cp] || !ANL[cp].rows[c]) return '';
      const s = ANL[cp].rows[c];
      return `<section class="tana article" id="analytics"><h2>Team Analytics</h2>
<p class="sub">${[coach && `${T('Προπονητής', 'Head coach', 'Entrenador', 'Trener')}: <b>${esc(coach)}</b>`, venue && `${T('Έδρα', 'Arena', 'Pabellón', 'Dvorana')}: ${esc(venue)}`, `${T('Ρεκόρ', 'Record', 'Balance', 'Skor')}: ${s.w}-${s.gp - s.w}`, `${T('Πόντοι υπέρ/κατά', 'Points for/against', 'Puntos a favor/en contra', 'Poeni dati/primljeni')}: ${f1(s.pfpg)} / ${f1(s.papg)}`].filter(Boolean).join(' · ')}</p>
${recent}${next}
${metricT(cp, c)}
<h3>Four Factors</h3>${ffBars(cp, c)}
<h3>${T('Διασπάσεις', 'Splits', 'Divisiones', 'Podele')}</h3>${splitsT(cp, c)}
${(cp === 'E' ? SHT : SHTU)[c] ? `<p><a class="pread" href="${cp === 'E' ? urlFor(LG, 'sht:' + c) : urlFor(LG, 'shtu:' + slugify(data.ec?.teams?.[c]?.[0] || c))}">Shot chart & scoring zones →</a></p>` : ''}${lineupsUrl ? `<p><a class="pread" href="${lineupsUrl}">${T('Lineups, On/Off και WOWY της ομάδας →', 'Team lineups, on/off and WOWY →', 'Quintetos, on/off y WOWY del equipo →', 'Postave, on/off i WOWY tima →')}</a></p>` : ''}
${method}</section>`;
    };
    const coachOf = (cp, c) => { const C = AN[cp]; if (!C) return ''; for (let i = C.games.length - 1; i >= 0; i--) { const g = C.games[i]; if ((g.h === c || g.a === c) && g.coach?.[c]) return niceName(g.coach[c]); } return ''; };
    for (const cp of ['E', 'U']) {
      const C = AN[cp]; if (!C) continue;
      const compL = cp === 'U' ? 'EuroCup' : 'EuroLeague';
      const ecT = data.ec?.teams || {};
      const nmT = c => (cp === 'U' ? ((LG === 'el' && { ARI: 'Άρης', PAO: 'ΠΑΟΚ' }[c]) || (ecT[c] ? ecT[c][1] : c)) : tName(c));
      const teamU = c => (cp === 'U' ? urlFor(LG, 'ec:' + slugify(ecT[c] ? ecT[c][0] : c)) : urlFor(LG, 'team:' + c));
      for (const c of Object.keys(C.byTeam)) {
        if (cp === 'E' && !TEAMS[c]) continue;
        const nm = nmT(c), url = urlFor(LG, 'lu:' + cp + '-' + c);
        const five = AB.groupLineups(C.byTeam[c].stints, 5).filter(r => r.poss >= 20).sort((a, b) => b.net - a.net);
        const best = five[0];
        const pn = id => niceName(C.names[id] || id);
        const intro = T(`${nm} στην ${compL} ${SEASON_LABEL}: τα σχήματα (2, 3, 4 και 5 παικτών), το on/off και το WOWY, από το επίσημο play-by-play.${best ? ` Καλύτερη πεντάδα (≥20 κατοχές): ${best.p.map(pn).join(', ')} με Net ${af('net', best.net)} σε ${Math.round(best.poss)} κατοχές.` : ''}`,
          `${nm} lineups (2, 3, 4 and 5-man), on/off and WOWY in the ${compL} ${SEASON_LABEL}, from the official play-by-play.${best ? ` Best five-man unit (20+ possessions): ${best.p.map(pn).join(', ')}, ${af('net', best.net)} Net over ${Math.round(best.poss)} possessions.` : ''}`,
          `Quintetos (de 2, 3, 4 y 5 jugadores), on/off y WOWY de ${nm} en la ${compL} ${SEASON_LABEL}, a partir del play-by-play oficial.${best ? ` Mejor quinteto (20+ posesiones): ${best.p.map(pn).join(', ')}, Net ${af('net', best.net)} en ${Math.round(best.poss)} posesiones.` : ''}`,
          `Postave (2, 3, 4 i 5 igrača), on/off i WOWY za ${nm} u ${compL} ${SEASON_LABEL}, iz zvaničnog play-by-play zapisa.${best ? ` Najbolja petorka (20+ poseda): ${best.p.map(pn).join(', ')}, Net ${af('net', best.net)} na ${Math.round(best.poss)} poseda.` : ''}`);
        await simplePage('lu:' + cp + '-' + c, { view: 'lead', title: T(`${nm}: lineups, on/off και WOWY ${compL} ${SEASON_LABEL} | ${SITE_NAME}`, `${nm} lineups, on/off and WOWY, ${compL} ${SEASON_LABEL} | ${SITE_NAME}`, `${nm}: quintetos, on/off y WOWY, ${compL} ${SEASON_LABEL} | ${SITE_NAME}`, `${nm}: postave, on/off i WOWY, ${compL} ${SEASON_LABEL} | ${SITE_NAME}`),
          desc: intro.slice(0, 300),
          main: `<article class="article lead wide anpage"><p class="crumbs"><a href="${urlFor(LG, 'ana')}">Team Analytics</a> · <a href="${teamU(c)}">${esc(nm)}</a></p><h1>${esc(nm)}: Lineups · On/Off · WOWY</h1><p class="lede2">${esc(intro)}</p>
<div id="luApp" data-api="${BASE}api/${cp === 'U' ? 'eurocup/' : ''}lineups/${c}.json"><p class="sub">…</p></div>${method}</article>${anCtx(cp)}`,
          ld: crumbs([[SITE_NAME, B(LG)], ['Team Analytics', urlFor(LG, 'ana')], [nm, url]]) });
      }
    }
    if (ANL.E) {
      const tableFor = cp => {
        const LT = ANL[cp], C = AN[cp]; if (!LT) return '';
        const ecT = data.ec?.teams || {};
        const nmT = c => (cp === 'U' ? ((LG === 'el' && { ARI: 'Άρης', PAO: 'ΠΑΟΚ' }[c]) || (ecT[c] ? ecT[c][1] : c)) : tName(c));
        const K = ['ortg', 'drtg', 'net', 'pace', 'ppp', 'efg', 'ts', 'ast', 'tov', 'oreb', 'dreb', 'ftr', 'oefg', 'otov', 'ooreb', 'oftr'];
        const rows = LT.teams.filter(t => cp === 'U' || TEAMS[t]).sort((a, b) => LT.rows[b].net - LT.rows[a].net);
        return `<div class="tbl"><table class="sortable antbl"><thead><tr><th class="l">${T('Ομάδα', 'Team', 'Equipo', 'Tim')}</th><th data-k>${T('Αγ.', 'G', 'PJ', 'Ut.')}</th><th data-k>${T('Ν-Η', 'W-L', 'V-D', 'P-I')}</th>${K.map(k => `<th data-k title="${esc(TIP[k])}">${esc(MN[k].replace('Offensive Rating', 'ORtg').replace('Defensive Rating', 'DRtg').replace('Net Rating', 'Net'))}</th>`).join('')}<th class="l">Lineups</th></tr></thead><tbody>${rows.map(t => { const r = LT.rows[t]; return `<tr><td class="l">${cp === 'E' ? `<a href="${urlFor(LG, 'team:' + t)}#analytics">${esc(nmT(t))}</a>` : esc(nmT(t))}</td><td>${r.gp}</td><td data-v="${r.w}">${r.w}-${r.gp - r.w}</td>${K.map(k => `<td data-v="${r[k] ?? ''}" class="${k === 'net' ? 'net ' + nc(r[k]) : ''}" title="${LT.pct[t][k]}%">${af(k, r[k])}</td>`).join('')}<td class="l"><a href="${urlFor(LG, 'lu:' + cp + '-' + t)}">→</a></td></tr>`; }).join('')}
<tr class="avg"><td class="l">${T('Μέσος όρος', 'Average', 'Media', 'Prosek')}</td><td></td><td></td>${K.map(k => `<td>${af(k, LT.avg[k])}</td>`).join('')}<td></td></tr></tbody></table></div>`;
      };
      const ooTable = cp => {
        const L = (ANOO[cp] || []).filter(x => x.on.min >= 100 && (cp === 'U' || TEAMS[x.t])).sort((a, b) => b.diff.net - a.diff.net);
        if (!L.length) return '';
        const ecT = data.ec?.teams || {};
        const nmT = c => (cp === 'U' ? (ecT[c] ? ecT[c][1] : c) : tName(c));
        return `<div class="tbl"><table class="sortable antbl"><thead><tr><th class="l">${T('Παίκτης', 'Player', 'Jugador', 'Igrač')}</th><th class="l">${T('Ομάδα', 'Team', 'Equipo', 'Tim')}</th><th data-k>${T('Λεπτά', 'Min', 'Min', 'Min')}</th><th data-k title="${esc(TIP.net)}">Net ${T('μέσα', 'on', 'en pista', 'na terenu')}</th><th data-k>Net ${T('έξω', 'off', 'fuera', 'van')}</th><th data-k>On/Off</th><th data-k title="${esc(TIP.ortg)}">ORtg Δ</th><th data-k title="${esc(TIP.drtg)}">DRtg Δ</th></tr></thead><tbody>${L.map(x => `<tr><td class="l"><a href="${urlFor(LG, 'lu:' + cp + '-' + x.t)}#p=${x.id}">${esc(niceName(x.n))}</a>${x.on.min < 150 || x.on.poss < 200 ? ` <span class="badge small">${T('μικρό δείγμα', 'small sample', 'muestra pequeña', 'mali uzorak')}</span>` : ''}</td><td class="l">${esc(nmT(x.t))}</td><td>${Math.round(x.on.min)}</td><td class="net ${nc(x.on.net)}" data-v="${x.on.net}">${af('net', x.on.net)}</td><td class="net ${nc(x.off.net)}" data-v="${x.off.net}">${af('net', x.off.net)}</td><td class="net ${nc(x.diff.net)}" data-v="${x.diff.net}"><b>${af('net', x.diff.net)}</b></td><td data-v="${x.diff.ortg}">${af('net', x.diff.ortg)}</td><td data-v="${x.diff.drtg}" class="net ${nc(-x.diff.drtg)}">${af('net', x.diff.drtg)}</td></tr>`).join('')}</tbody></table></div>`;
      };
      const nE = AN.E.games.length, nU = AN.U ? AN.U.games.length : 0;
      await simplePage('ana', { view: 'lead', title: T(`Team Analytics EuroLeague & EuroCup ${SEASON_LABEL}: ORtg, DRtg, Net, Pace, Four Factors | ${SITE_NAME}`, `Team Analytics EuroLeague & EuroCup ${SEASON_LABEL}: ORtg, DRtg, Net, Pace, Four Factors | ${SITE_NAME}`, `Team Analytics EuroLeague y EuroCup ${SEASON_LABEL}: ORtg, DRtg, Net, Pace, cuatro factores | ${SITE_NAME}`, `Team Analytics Evroliga i Evrokup ${SEASON_LABEL}: ORtg, DRtg, Net, Pace, četiri faktora | ${SITE_NAME}`),
        desc: T(`Προχωρημένα στατιστικά για κάθε ομάδα της EuroLeague και του EuroCup: Offensive/Defensive/Net Rating, Pace, Four Factors επίθεσης και άμυνας, με κατάταξη και εκατοστημόριο.`, `Advanced stats for every EuroLeague and EuroCup team: offensive, defensive and net rating, pace and the four factors on both ends, with ranks and percentiles.`, `Estadísticas avanzadas de cada equipo de la EuroLeague y la EuroCup: rating ofensivo, defensivo y neto, ritmo y los cuatro factores, con ranking y percentil.`, `Napredna statistika za svaki tim Evrolige i Evrokupa: ofanzivni, defanzivni i neto rejting, tempo i četiri faktora, sa rangom i percentilom.`),
        main: `<article class="article lead wide anpage"><h1>Team Analytics ${SEASON_LABEL}</h1><p class="lede2">${esc(T(`Από ${nE} αγώνες EuroLeague${nU ? ` και ${nU} EuroCup` : ''}. Κλικ στις στήλες για ταξινόμηση· πέρνα το ποντίκι πάνω από μια στήλη για εξήγηση.`, `From ${nE} EuroLeague${nU ? ` and ${nU} EuroCup` : ''} games. Click a column to sort; hover a header for an explanation.`, `Con ${nE} partidos de EuroLeague${nU ? ` y ${nU} de EuroCup` : ''}. Pulsa una columna para ordenar; pasa el ratón por el encabezado para ver la explicación.`, `Na osnovu ${nE} utakmica Evrolige${nU ? ` i ${nU} Evrokupa` : ''}. Klik na kolonu za sortiranje; pređi mišem preko zaglavlja za objašnjenje.`))}</p>
<p><a class="pread" href="${urlFor(LG, 'onoff')}">${T('On/Off όλων των παικτών →', 'On/off for every player →', 'On/off de todos los jugadores →', 'On/off svih igrača →')}</a></p>
<h2>EuroLeague</h2>${tableFor('E')}${AN.U ? `<h2>EuroCup</h2>${tableFor('U')}` : ''}${method}</article>${anCtx('E')}`,
        ld: crumbs([[SITE_NAME, B(LG)], ['Team Analytics', urlFor(LG, 'ana')]]) });
      await simplePage('onoff', { view: 'lead', title: T(`On/Off EuroLeague ${SEASON_LABEL}: Net Rating με και χωρίς κάθε παίκτη | ${SITE_NAME}`, `EuroLeague ${SEASON_LABEL} on/off: net rating with and without every player | ${SITE_NAME}`, `On/off EuroLeague ${SEASON_LABEL}: Net Rating con y sin cada jugador | ${SITE_NAME}`, `On/off Evroliga ${SEASON_LABEL}: Net Rating sa i bez svakog igrača | ${SITE_NAME}`),
        desc: T('Πόσο καλύτερα ή χειρότερα παίζει κάθε ομάδα όταν ένας παίκτης είναι στο παρκέ: Net, ORtg και DRtg on/off για EuroLeague και EuroCup.', 'How much better or worse each team plays with a player on court: on/off net, offensive and defensive rating for the EuroLeague and EuroCup.', 'Cuánto mejor o peor juega cada equipo con un jugador en pista: Net, ORtg y DRtg on/off en la EuroLeague y la EuroCup.', 'Koliko bolje ili lošije tim igra kada je igrač na terenu: on/off Net, ORtg i DRtg u Evroligi i Evrokupu.'),
        main: `<article class="article lead wide anpage"><p class="crumbs"><a href="${urlFor(LG, 'ana')}">Team Analytics</a></p><h1>On/Off ${SEASON_LABEL}</h1><p class="lede2">${esc(T('Παίκτες με τουλάχιστον 100 λεπτά. On/Off = Net Rating ομάδας με τον παίκτη στο παρκέ μείον χωρίς αυτόν. Κλικ σε παίκτη για φίλτρα, τάση και WOWY.', 'Players with at least 100 minutes. On/off = team net rating with the player on court minus without him. Click a player for filters, trend and WOWY.', 'Jugadores con al menos 100 minutos. On/off = Net Rating del equipo con el jugador en pista menos sin él. Pulsa un jugador para filtros, tendencia y WOWY.', 'Igrači sa najmanje 100 minuta. On/off = Net Rating tima sa igračem na terenu minus bez njega. Klik na igrača za filtere, trend i WOWY.'))}</p>
<h2>EuroLeague</h2>${ooTable('E')}${AN.U ? `<h2>EuroCup</h2>${ooTable('U')}` : ''}${method}</article>${anCtx('E')}`,
        ld: crumbs([[SITE_NAME, B(LG)], ['Team Analytics', urlFor(LG, 'ana')], ['On/Off', urlFor(LG, 'onoff')]]) });
    }
    const srow = Object.fromEntries(league.stand.map(s => [s[1], s]));
    for (const c of Object.keys(TEAMS)) {
      const s = srow[c], name = tName(c);
      const lede = s ? T(`${name}: ${s[0]}η θέση στην ${S} με ρεκόρ ${s[2]}-${s[3]} και ${s[4]}-${s[5]} πόντους υπέρ/κατά.`, `${name}: ${ordEn(s[0])} in the ${S} with a ${s[2]}-${s[3]} record and ${s[4]}-${s[5]} points for/against.`, `${name}: ${s[0]}.º en la ${S} con un balance de ${s[2]}-${s[3]} y ${s[4]}-${s[5]} puntos a favor/en contra.`, `${name}: ${s[0]}. mesto u ${S}, skor ${s[2]}-${s[3]} i ${s[4]}-${s[5]} poena datih/primljenih.`)
        : T(`${name} στην ${S}.`, `${name} in the ${S}.`, `${name} en la ${S}.`, `${name} u ${S}.`);
      const roster = players.filter(p => p.t.split(';').pop() === c);
      let thist = '';
      try {
        const md = (await fs.readFile(path.join(ROOT, 'teams', `${c}.${LG}.md`), 'utf8')).replace(/<!--[\s\S]*?-->/g, '').trim();
        if (md) thist = `<section class="thist article"><h2>${T('Η ιστορία της ομάδας', 'Club history', 'Historia del club', 'Istorija kluba')}</h2>${markdown(md)}</section>`;
      } catch { }
      let tana = '';
      if (ANL.E && ANL.E.rows[c]) {
        const tg = league.games.filter(g => g[2] === c || g[3] === c);
        const pl = tg.filter(g => g[6]).sort((x, y) => x[0] - y[0]).slice(-10), nx = tg.filter(g => !g[6]).sort((x, y) => x[0] - y[0]).slice(0, 5);
        const hv = tg.find(g => g[2] === c && VENUE[`${g[0]}|${g[2]}|${g[3]}`]);
        const gU = g => urlFor(LG, 'game:' + `${g[0]}|${g[2]}|${g[3]}`);
        const recent = pl.length ? `<p class="anform">${T('Φόρμα', 'Form', 'Forma', 'Forma')} (${pl.length}): ${pl.map(g => { const h = g[2] === c, w = h ? g[4] > g[5] : g[5] > g[4]; return `<a class="${w ? 'W' : 'L'}" href="${gU(g)}" title="${esc((h ? '' : '@ ') + tName(h ? g[3] : g[2]) + ' ' + g[4] + '-' + g[5])}">${w ? T('Ν', 'W', 'V', 'P') : T('Η', 'L', 'D', 'I')}</a>`; }).join('')}</p>` : '';
        const next = nx.length ? `<p class="annext">${T('Επόμενοι', 'Next', 'Próximos', 'Sledeći')}: ${nx.map(g => `<a href="${gU(g)}">${T('Αγ.', 'R', 'J', 'K')}${g[0]} ${g[2] === c ? '' : '@ '}${esc(tName(g[2] === c ? g[3] : g[2]))}</a>`).join(' · ')}</p>` : '';
        tana = teamAnalytics('E', c, { venue: hv ? VENUE[`${hv[0]}|${hv[2]}|${hv[3]}`] : '', coach: coachOf('E', c), recent, next, lineupsUrl: AN.E.byTeam[c] ? urlFor(LG, 'lu:E-' + c) : '' });
      }
      const shTop = SHT[c] ? shPromo(urlFor(LG, 'sht:' + c), SHT[c].zones, SHLA?.[SEASON]?.zones, T(`${name}: από πού σουτάρει και πόσο ευστοχεί`, `${name}: where they shoot from and how well`, `${name}: desde dónde tira y con qué acierto`, `${name}: odakle šutira i koliko precizno`), teamShotLine(SHT[c], SHLA?.[SEASON]?.groups)) : '';
      await page('team:' + c, { view: 'team', id: c, h1t: name, ledet: lede, extra: tana + thist, top: shTop,
        ld: [{ '@context': 'https://schema.org', '@type': 'SportsTeam', name, sport: 'Basketball', url: SITE_URL + urlFor(LG, 'team:' + c), memberOf: { '@type': 'SportsOrganization', name: 'EuroLeague' }, athlete: roster.map(p => ({ '@type': 'Person', name: niceName(p.n), url: SITE_URL + urlFor(LG, 'player:' + p.s) })) },
          crumbs([[SITE_NAME, B(LG)], [name, urlFor(LG, 'team:' + c)]])],
        title: T(`${name} ${S}: ρόστερ, πρόγραμμα, στατιστικά | ${SITE_NAME}`, `${name} ${S}: roster, schedule, stats | ${SITE_NAME}`, `${name} ${S}: plantilla, calendario y estadísticas | ${SITE_NAME}`, `${name} ${S}: roster, raspored, statistika | ${SITE_NAME}`),
        desc: lede + T(' Ρόστερ, πρόγραμμα, τέσσερις παράγοντες και φόρμα παικτών.', ' Roster, schedule, four factors and player form.', ' Plantilla, calendario, los cuatro factores y la forma de los jugadores.', ' Roster, raspored, četiri faktora i forma igrača.') });
    }
    // συνολική καριέρα στην EuroLeague: σύνολα, σταθμισμένοι μέσοι όροι, ομάδες ανά περίοδο, καλύτερη σεζόν
    const sLab = code => `${+code.slice(1)}-${String(+code.slice(1) + 1).slice(2)}`;
    const careerAgg = (car, s) => { const rows = [...car.map(([c, r]) => ({ G: r[4], pts: r[6], reb: r[7], ast: r[8], pir: r[9] })), { G: s.G, pts: s.pts, reb: s.reb, ast: s.ast, pir: s.pir }]; const G = rows.reduce((a, x) => a + x.G, 0); const w = k => (G ? rows.reduce((a, x) => a + x[k] * x.G, 0) / G : 0); return { G, pts: w('pts'), reb: w('reb'), ast: w('ast'), pir: w('pir'), totPts: Math.round(rows.reduce((a, x) => a + x.pts * x.G, 0)) }; };
    const careerTot = (car, s) => { const a = careerAgg(car, s); return `<tr class="cur"><td class="l">${T('Σύνολο', 'Career', 'Total', 'Ukupno')}</td><td class="l"></td><td>${a.G}</td><td>–</td><td>${f1(a.pts)}</td><td>${f1(a.reb)}</td><td>${f1(a.ast)}</td><td>${f1(a.pir)}</td></tr>`; };
    const careerSum = (car, s, tnNow) => {
      const a = careerAgg(car, s);
      const seq = [...car.map(([c, r]) => [sLab(c), TEAMS[r[2]] ? tName(r[2]) : r[3]]), [SEASON_LABEL, tnNow]];
      const spans = []; for (const [lab, t] of seq) { const last = spans[spans.length - 1]; if (last && last.t === t) last.to = lab; else spans.push({ t, from: lab, to: lab }); }
      const best = car.filter(([c, r]) => r[4] >= 10).sort((x, y) => y[1][9] - x[1][9])[0];
      return `<p class="careersum">${T('Σύνολο', 'Total', 'Total', 'Ukupno')}: <b>${a.G}</b> ${T('αγώνες', 'games', 'partidos', 'utakmica')}, <b>${a.totPts}</b> ${T('πόντοι', 'points', 'puntos', 'poena')} · ${T('μέσοι όροι καριέρας', 'career averages', 'promedios de su carrera', 'proseci karijere')} ${f1(a.pts)} ${T('π', 'pts', 'pts', 'p')}, ${f1(a.reb)} ${T('ρ', 'reb', 'reb', 's')}, ${f1(a.ast)} ${T('α', 'ast', 'ast', 'a')}, ${f1(a.pir)} PIR${best ? ` · ${T('καλύτερη σεζόν', 'best season', 'mejor temporada', 'najbolja sezona')} ${sLab(best[0])} (${f1(best[1][9])} PIR)` : ''}<br>${T('Ομάδες', 'Teams', 'Equipos', 'Timovi')}: ${spans.map(x => `${esc(x.t)} (${x.from === x.to ? x.from : `${x.from} – ${x.to}`})`).join(' → ')}</p>`;
    };
    for (const p of players) {
      const n = niceName(p.n), s = playerSummary(p), tn = teamNameL(p.t);
      const lede = T(`${n} (${tn}) στην ${S}: ${s.G} αγώνες, ${f1(s.pts)} πόντοι, ${f1(s.reb)} ριμπάουντ, ${f1(s.ast)} ασίστ και ${f1(s.pir)} PIR ανά αγώνα.`,
        `${n} (${tn}) in the ${S}: ${s.G} games, ${f1(s.pts)} points, ${f1(s.reb)} rebounds, ${f1(s.ast)} assists and ${f1(s.pir)} PIR per game.`, `${n} (${tn}) en la ${S}: ${s.G} partidos, ${f1(s.pts)} puntos, ${f1(s.reb)} rebotes, ${f1(s.ast)} asistencias y ${f1(s.pir)} de PIR por partido.`, `${n} (${tn}) u ${S}: ${s.G} utakmica, ${f1(s.pts)} poena, ${f1(s.reb)} skokova, ${f1(s.ast)} asistencija i ${f1(s.pir)} PIR po utakmici.`);
      const tc = p.t.split(';').pop();
      const pld = { '@context': 'https://schema.org', '@type': 'Person', name: n, url: SITE_URL + urlFor(LG, 'player:' + p.s), jobTitle: T('Μπασκετμπολίστας', 'Basketball player', 'Jugador de baloncesto', 'Košarkaš'), memberOf: { '@type': 'SportsTeam', name: tName(tc), url: SITE_URL + urlFor(LG, 'team:' + tc) } };
      if (p.bd) pld.birthDate = p.bd; if (p.ct) pld.nationality = p.ct; if (p.h) pld.height = { '@type': 'QuantitativeValue', value: p.h > 3 ? p.h : Math.round(p.h * 100), unitCode: 'CMT' };
      const car = Object.values(data.hist || {}).filter(h => h.rows?.length).sort((a, b) => a.code.localeCompare(b.code)).map(h => [h.code, h.rows.find(r => r[0] === p.c)]).filter(x => x[1]);
      const ooX = ANOO.E ? ANOO.E.find(x => x.id === p.c && x.t === p.t.split(';').pop()) : null;
      const ooSec = ooX && ooX.on.poss >= 20 ? `<section class="career anpo"><h2>On/Off</h2><p class="lede2">${esc(T(`Όταν ο ${n} είναι στο παρκέ, η ομάδα του έχει ${af('net', ooX.on.net)} Net Rating. Όταν είναι εκτός, ${af('net', ooX.off.net)}. Διαφορά: ${af('net', ooX.diff.net)}.`, `With ${n} on court his team has a ${af('net', ooX.on.net)} Net Rating; with him off, ${af('net', ooX.off.net)}. Differential: ${af('net', ooX.diff.net)}.`, `Con ${n} en pista su equipo tiene un Net Rating de ${af('net', ooX.on.net)}; sin él, ${af('net', ooX.off.net)}. Diferencia: ${af('net', ooX.diff.net)}.`, `Kada je ${n} na terenu, tim ima Net Rating ${af('net', ooX.on.net)}; kada nije, ${af('net', ooX.off.net)}. Razlika: ${af('net', ooX.diff.net)}.`))}${ooX.on.min < 150 || ooX.on.poss < 200 ? ` <span class="badge small">${T('μικρό δείγμα', 'small sample', 'muestra pequeña', 'mali uzorak')}</span>` : ''}</p><div class="tbl"><table class="antbl"><thead><tr><th class="l"></th><th>${T('Λεπτά', 'Min', 'Min', 'Min')}</th><th>${T('Κατοχές', 'Poss', 'Pos', 'Pos.')}</th><th title="${esc(TIP.net)}">Net</th><th title="${esc(TIP.ortg)}">ORtg</th><th title="${esc(TIP.drtg)}">DRtg</th><th title="${esc(TIP.pace)}">Pace</th><th>eFG%</th><th>${T('eFG% αντ.', 'Opp eFG%', 'eFG% rival', 'eFG% prot.')}</th><th>REB%</th><th>TOV%</th></tr></thead><tbody>${[[T('Στο παρκέ', 'On court', 'En pista', 'Na terenu'), ooX.on], [T('Εκτός', 'Off court', 'Fuera', 'Van terena'), ooX.off]].map(([l, r]) => `<tr><td class="l">${l}</td><td>${Math.round(r.min)}</td><td>${Math.round(r.poss)}</td><td class="net ${nc(r.net)}">${af('net', r.net)}</td><td>${af('ortg', r.ortg)}</td><td>${af('drtg', r.drtg)}</td><td>${af('pace', r.pace)}</td><td>${af('efg', r.efg)}</td><td>${af('oefg', r.oefg)}</td><td>${af('reb', r.reb)}</td><td>${af('tov', r.tov)}</td></tr>`).join('')}</tbody></table></div><p><a class="pread" href="${urlFor(LG, 'lu:E-' + ooX.t)}#p=${p.c}">${T('Φίλτρα, τάση και WOWY →', 'Filters, trend and WOWY →', 'Filtros, tendencia y WOWY →', 'Filteri, trend i WOWY →')}</a></p></section>` : '';
      const shLink = SHP[p.c] && SHP[p.c].n >= 10 ? `<p><a class="pread" href="${urlFor(LG, 'shp:' + p.s)}">Shot chart & scoring zones →</a></p>` : '';
      const simL = (CMP.similar[SEASON][p.c] || []).slice(0, 6).map(s => players.find(z => z.c === s.id)).filter(Boolean);
      const simSec = simL.length ? `<section class="career"><h2>${T('Παρόμοιοι παίκτες', 'Similar players', 'Jugadores similares', 'Slični igrači')}</h2><p class="sub">${T('Με βάση usage, PIR/λεπτό, TS%, ασίστ, ριμπάουντ, λεπτά και άμυνα', 'Based on usage, PIR/min, TS%, assists, rebounding, minutes and defense', 'Según usage, PIR/min, TS%, asistencias, rebote, minutos y defensa', 'Na osnovu usage-a, PIR/min, TS%, asistencija, skokova, minuta i odbrane')}</p><ul class="cmpsim">${simL.map(q => `<li><span><a href="${urlFor(LG, 'player:' + q.s)}">${esc(niceName(q.n))}</a> <small>${esc(tName(q.t.split(';').pop()))}</small></span><a class="btnsm" href="${urlFor(LG, 'compare')}?ids=${p.c},${q.c}">${T('Σύγκρινε', 'Compare', 'Comparar', 'Uporedi')}</a></li>`).join('')}</ul></section>` : '';
      const extra = shLink + ooSec + simSec + (car.length ? `<section class="career"><h2>${T('Καριέρα στην EuroLeague', 'EuroLeague career', 'Trayectoria en la EuroLeague', 'Karijera u Evroligi')}</h2><p class="sub">${car.length + 1} ${T('σεζόν · μέσοι όροι ανά αγώνα', 'seasons · per-game averages', 'temporadas · promedios por partido', 'sezona · proseci po utakmici')}</p>${careerSum(car, s, tn)}<div class="tbl"><table><thead><tr><th class="l">${T('Σεζόν', 'Season', 'Temporada', 'Sezona')}</th><th class="l">${T('Ομάδα', 'Team', 'Equipo', 'Tim')}</th><th>${T('Αγ.', 'G', 'PJ', 'Ut.')}</th><th>${T('Λεπ.', 'Min', 'Min', 'Min')}</th><th>${T('Π', 'Pts', 'Pts', 'Poe')}</th><th>${T('Ριμπ.', 'Reb', 'Reb', 'Sko')}</th><th>${T('Ασ.', 'Ast', 'Asi', 'Asi')}</th><th>PIR</th></tr></thead><tbody>${car.map(([code, r]) => { const L = `${+code.slice(1)}-${String(+code.slice(1) + 1).slice(2)}`; return `<tr><td class="l"><a href="${urlFor(LG, 'hist:' + L)}">${L}</a></td><td class="l">${esc(TEAMS[r[2]] ? tName(r[2]) : r[3])}</td><td>${r[4]}</td><td>${f1(r[5])}</td><td>${f1(r[6])}</td><td>${f1(r[7])}</td><td>${f1(r[8])}</td><td>${f1(r[9])}</td></tr>`; }).join('')}<tr class="cur"><td class="l">${SEASON_LABEL}</td><td class="l">${esc(tn)}</td><td>${s.G}</td><td>–</td><td>${f1(s.pts)}</td><td>${f1(s.reb)}</td><td>${f1(s.ast)}</td><td>${f1(s.pir)}</td></tr>${careerTot(car, s)}</tbody></table></div></section>` : '');
      const pTop = SHP[p.c] && SHP[p.c].n >= 10 ? shPromo(urlFor(LG, 'shp:' + p.s), SHP[p.c].zones, SHLA?.[SEASON]?.zones, T(`${n}: shot chart και ζώνες`, `${n}: shot chart and zones`, `${n}: mapa de tiro y zonas`, `${n}: mapa šuteva i zone`), shDescribe(SHP[p.c].groups, SHP[p.c].creation, T)) : '';
      await page('player:' + p.s, { view: 'player', id: p.c, h1p: n, ledep: lede, extra, top: pTop,
        ld: [pld, crumbs([[SITE_NAME, B(LG)], [tName(tc), urlFor(LG, 'team:' + tc)], [n, urlFor(LG, 'player:' + p.s)]])],
        title: T(`${n} στατιστικά ${S} (${tn}) | ${SITE_NAME}`, `${n} stats ${S} (${tn}) | ${SITE_NAME}`, `Estadísticas de ${n} en la ${S} (${tn}) | ${SITE_NAME}`, `${n} statistika ${S} (${tn}) | ${SITE_NAME}`), desc: lede });
    }

    // ---- Matchup Center & Game Predictor
    const LOCALE = { el: 'el-GR', en: 'en-GB', es: 'es-ES', sr: 'sr-Latn-RS' }[LG];
    const MCL = { win: T('πιθανότητα νίκης', 'win probability', 'probabilidad de victoria', 'verovatnoća pobede'), score: T('Προβλεπόμενο σκορ', 'Projected score', 'Marcador proyectado', 'Projektovani rezultat'), total: T('Σύνολο', 'Projected total', 'Total proyectado', 'Ukupno'), conf: T('Βεβαιότητα μοντέλου', 'Model confidence', 'Confianza del modelo', 'Pouzdanost modela'), high: T('Υψηλή', 'High', 'Alta', 'Visoka'), medium: T('Μέτρια', 'Medium', 'Media', 'Srednja'), low: T('Χαμηλή', 'Low', 'Baja', 'Niska') };
    const mcTeamName = (cp, c) => (cp === 'U' ? ((LG === 'el' && { ARI: 'Άρης', PAO: 'ΠΑΟΚ' }[c]) || (data.ec?.teams?.[c] ? data.ec.teams[c][1] : c)) : tName(c));
    const mcCrest = (cp, c) => cp === 'U' ? `<span class="c" style="background:#555">${esc(data.ec?.teams?.[c]?.[2] || c)}</span>` : `<span class="c" style="background:${TEAMS[c] ? TEAMS[c][1] : '#555'}">${c}</span>`;
    const mcPlayers = (cp, c) => cp === 'U'
      ? (data.ec?.players || []).filter(p => p.t === c).map(p => ({ c: p.c, n: p.n, pos: '', G: p.gp, pts: p.pts, reb: p.reb, ast: p.ast, pir: p.pir, min: p.min, start: null, url: null }))
      : players.filter(p => p.t.split(';').pop() === c).map(p => { const s = playerSummary(p), g = p.g.filter(r => r[7] > 0); return { c: p.c, n: niceName(p.n), pos: p.pos, G: s.G, pts: s.pts, reb: s.reb, ast: s.ast, pir: s.pir, min: g.length ? g.reduce((a, r) => a + r[7], 0) / g.length / 60 : 0, start: g.length ? g.filter(r => r[6]).length / g.length : 0, url: urlFor(LG, 'player:' + p.s) }; });
    const mcHist = (cp, h, a) => {
      const out = [];
      for (const C of Object.values(MCH)) for (const g of C) if (g.comp === cp && ((g.h === h && g.a === a) || (g.h === a && g.a === h))) out.push(g);
      return out.sort((x, y) => y.d.localeCompare(x.d)).slice(0, 10);
    };
    const rgBlock = () => `<div class="rgbox"><span class="age21">21+</span><p>${T('Το στοίχημα επιτρέπεται μόνο σε ενήλικες άνω των 21 ετών στην Ελλάδα (18+ σε άλλες χώρες). Παίξε υπεύθυνα, μόνο με χρήματα που αντέχεις να χάσεις. Αν το παιχνίδι γίνεται πρόβλημα, ζήτησε βοήθεια — δες τις πληροφορίες για το Υπεύθυνο Παιχνίδι της ΕΕΕΠ (gamingcommission.gov.gr).', 'Betting is for adults 21+ in Greece (18+ elsewhere). Play responsibly and only with money you can afford to lose. If gambling becomes a problem, seek help — see the Hellenic Gaming Commission’s responsible gambling information (gamingcommission.gov.gr).', 'Las apuestas son solo para mayores de 21 años en Grecia (18+ en otros países). Juega con responsabilidad y solo con dinero que puedas perder. Si el juego se convierte en un problema, pide ayuda.', 'Klađenje je samo za punoletne: 21+ u Grčkoj (18+ drugde). Igraj odgovorno i samo novcem koji možeš da izgubiš. Ako kockanje postane problem, potraži pomoć.')}</p><p class="disc">${T('Οι αποδόσεις ενδέχεται να έχουν αλλάξει. Οι προβλέψεις είναι στατιστικές εκτιμήσεις και δεν αποτελούν εγγύηση κέρδους.', 'Odds may have changed. Predictions are statistical estimates and are not a guarantee of profit.', 'Las cuotas pueden haber cambiado. Los pronósticos son estimaciones estadísticas y no garantizan beneficios.', 'Kvote su se možda promenile. Prognoze su statističke procene i ne garantuju dobitak.')}</p>${Object.keys(OB.affiliates || {}).length ? `<p class="disc"><b>${T('Διαφημιστική συνεργασία', 'Advertising disclosure', 'Publicidad', 'Oglašavanje')}:</b> ${T('ορισμένοι σύνδεσμοι προς αδειοδοτημένους από την ΕΕΕΠ διαχειριστές είναι συνεργασίες affiliate. Ισχύουν οι όροι κάθε διαχειριστή.', 'some links to EEEP-licensed operators are affiliate partnerships. Each operator’s terms apply.', 'algunos enlaces a operadores con licencia son de afiliación. Se aplican los términos de cada operador.', 'neki linkovi ka licenciranim operaterima su affiliate saradnja. Važe uslovi svakog operatera.')} ${Object.values(OB.affiliates).filter(a => a.licensed && a.terms).map(a => `<a href="${esc(a.terms)}" rel="nofollow sponsored noopener" target="_blank">${esc(a.name)}</a>`).join(' · ')}</p>` : ''}</div>`;
    const pp = v => (v == null ? '–' : (v > 0 ? '+' : '') + v.toFixed(1) + ' pp');
    const pcO = v => (v == null ? '–' : (100 * v).toFixed(1) + '%');
    const clsTxt = c => ({ model: T('Model value', 'Model value', 'Valor del modelo', 'Vrednost modela'), market: T('Market value', 'Market value', 'Valor de mercado', 'Vrednost tržišta'), neutral: T('Ουδέτερο', 'Neutral', 'Neutral', 'Neutralno'), na: '–' })[c];
    const tierTxt = t => ({ high: 'High', medium: 'Medium', low: 'Low' })[t] || '–';
    const moveSVG = s => {
      if (!s || s.length < 2) return '';
      const W = 300, H = 70, ps = s.map(x => x[1]), lo = Math.min(...ps), hi = Math.max(...ps), t0 = new Date(s[0][0]), t1 = new Date(s[s.length - 1][0]);
      const X = t => 4 + (W - 8) * ((new Date(t) - t0) / ((t1 - t0) || 1)), Y = v => H - 6 - (H - 12) * ((v - lo) / ((hi - lo) || 1));
      return `<svg class="oddsmv" viewBox="0 0 ${W} ${H}" role="img" aria-label="line movement"><polyline points="${s.map(x => `${X(x[0]).toFixed(1)},${Y(x[1]).toFixed(1)}`).join(' ')}"/>${s.map(x => `<circle cx="${X(x[0]).toFixed(1)}" cy="${Y(x[1]).toFixed(1)}" r="2.5"><title>${esc(new Date(x[0]).toLocaleString(LOCALE, { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))}: ${x[1].toFixed(2)}</title></circle>`).join('')}<text x="4" y="10" class="mvl">${hi.toFixed(2)}</text><text x="4" y="${H - 1}" class="mvl">${lo.toFixed(2)}</text></svg>`;
    };
    const mvTxt = m => (m ? `${T('Άνοιγμα', 'Open', 'Apertura', 'Otvaranje')} ${m.open.toFixed(2)} → ${T('τώρα', 'now', 'ahora', 'sada')} ${m.current.toFixed(2)} (${m.changePct > 0 ? '+' : ''}${m.changePct}%) · ${T('υψηλό/χαμηλό', 'high/low', 'máx/mín', 'max/min')} ${m.high.toFixed(2)}/${m.low.toFixed(2)}${m.steams.length ? ` · <b>steam</b>: ${m.steams.map(s => `${s.pct > 0 ? '+' : ''}${s.pct}% ${T('σε', 'in', 'en', 'za')} ${s.min}′`).join(', ')}` : ''}` : '');
    function oddsSec(x, H, A) {
      const gid = `${x.comp}-${x.r}-${x.h}-${x.a}`;
      const I = OB.latest ? OBI[gid] : null;
      if (!I || !I.ml) return '';
      const upd = new Date(I.updated).toLocaleString(LOCALE, { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const names = [H, A], ml = I.ml;
      const fav = ml.edge ? (ml.edge[0] >= ml.edge[1] ? 0 : 1) : 0;
      const line = ml.model ? `${T('Πιθανότητα μοντέλου', 'Model probability', 'Probabilidad del modelo', 'Verovatnoća modela')}: ${Math.round(100 * ml.model[fav])}% | ${T('Best market implied', 'Best market implied', 'Implícita mejor cuota', 'Implicitna najbolja kvota')}: ${Math.round(100 * ml.bestImplied[fav])}% | Model edge: ${pp(ml.edge[fav])}${ml.move?.[fav] && ml.move[fav].open !== ml.move[fav].current ? ` | ${T('Η απόδοση κινήθηκε', 'Line moved', 'La cuota se movió', 'Kvota se pomerila')} ${T('από', 'from', 'de', 'sa')} ${ml.move[fav].open.toFixed(2)} ${T('σε', 'to', 'a', 'na')} ${ml.move[fav].current.toFixed(2)}` : ''} (${esc(names[fav])})` : '';
      const bars = ml.model ? `<div class="mvm">${[0, 1].map(i => `<div class="mvrow"><span>${esc(names[i])}</span><div class="mvb"><i class="m" style="width:${(100 * ml.model[i]).toFixed(1)}%"></i></div><b>${pcO(ml.model[i])}</b><div class="mvb"><i class="k" style="width:${(100 * ml.consensusFair[i]).toFixed(1)}%"></i></div><b>${pcO(ml.consensusFair[i])}</b><em class="edge ${ml.cls[i]}">${pp(ml.edge[i])} · ${clsTxt(ml.cls[i])} · ${tierTxt(ml.tier[i])}</em></div>`).join('')}<p class="sub"><i class="lg"></i> ${T('μοντέλο', 'model', 'modelo', 'model')} · <i class="lg avg"></i> ${T('αγορά (χωρίς vig)', 'market (no vig)', 'mercado (sin margen)', 'tržište (bez marže)')}</p></div>` : '';
      const bookRows = I.books.filter(b => b.ml).map(b => { const d = devig(b.ml); return `<tr><td class="l">${esc(b.title)}</td>${[0, 1].map(i => `<td class="${b.ml[i] === ml.best[i] ? 'best' : ''}">${b.ml[i]?.toFixed(2) ?? '–'}</td>`).join('')}<td>${d ? pcO(d.margin) : '–'}</td>${b.spread ? `<td>${b.spread.line > 0 ? '+' : ''}${b.spread.line}: ${b.spread.h.toFixed(2)} / ${b.spread.a.toFixed(2)}</td>` : '<td>–</td>'}${b.total ? `<td>${b.total.line}: ${b.total.over.toFixed(2)} / ${b.total.under.toFixed(2)}</td>` : '<td>–</td>'}</tr>`; }).join('');
      const mk = (lab, o, sels) => o && o.model ? `<tr><td class="l">${lab}</td>${[0, 1].map(i => `<td>${esc(sels[i])}: <b>${o.best[i]?.toFixed(2)}</b> <small>(${esc(o.bestBook[i] || '')})</small> · ${T('μ.ό.', 'avg', 'media', 'pros.')} ${o.avg[i]?.toFixed(2)} · implied ${pcO(1 / o.best[i])} · fair ${pcO(o.consensusFair[i])} · ${T('μοντέλο', 'model', 'modelo', 'model')} ${pcO(o.model[i])} · <span class="edge ${classify(o.edge[i])}">${pp(o.edge[i])}</span></td>`).join('')}</tr>` : '';
      return `<h3>${T('Αποδόσεις και μοντέλο', 'Odds vs model', 'Cuotas y modelo', 'Kvote i model')} <span class="age21 sm">21+</span></h3>
<p class="lede2">${esc(line).replace(/&lt;b&gt;|&lt;\/b&gt;/g, '')}</p>${bars}
<div class="tbl"><table class="antbl oddsT"><thead><tr><th class="l">Bookmaker</th><th>${esc(H)}</th><th>${esc(A)}</th><th>${T('Περιθώριο', 'Margin', 'Margen', 'Marža')}</th><th>Handicap</th><th>${T('Σύνολο', 'Total', 'Total', 'Ukupno')}</th></tr></thead><tbody>${bookRows}
<tr class="avg"><td class="l">${T('Μέσος όρος αγοράς', 'Market average', 'Media del mercado', 'Prosek tržišta')}</td><td>${ml.avg[0]?.toFixed(2)}</td><td>${ml.avg[1]?.toFixed(2)}</td><td>${pcO(ml.avgMargin)}</td><td></td><td></td></tr></tbody></table></div>
<div class="tbl"><table class="antbl"><tbody>${mk('Handicap ' + (I.spread ? (I.spread.line > 0 ? '+' : '') + I.spread.line : ''), I.spread, [H, A])}${mk((T('Σύνολο', 'Total', 'Total', 'Ukupno')) + ' ' + (I.total?.line ?? ''), I.total, ['Over', 'Under'])}</tbody></table></div>
${ml.series?.[0]?.length > 1 ? `<h4>Line movement (${T('μέση τιμή αγοράς', 'market average', 'media del mercado', 'prosek tržišta')})</h4><div class="mvgrid">${[0, 1].map(i => `<div><b>${esc(names[i])}</b>${moveSVG(ml.series[i])}<p class="sub">${mvTxt(ml.move[i])}</p></div>`).join('')}</div>` : ''}
<p class="sub">${esc(I.provider)} · ${T('τελευταία ενημέρωση', 'last updated', 'última actualización', 'poslednje ažuriranje')} ${esc(upd)} · <a href="${urlFor(LG, 'odds')}">${T('Όλες οι αποδόσεις', 'All odds', 'Todas las cuotas', 'Sve kvote')} →</a></p>${rgBlock()}`;
    }
    function matchupCenter(cp, x) {
      if (!x) return '';
      const { h, a } = x, H = mcTeamName(cp, h), A = mcTeamName(cp, a);
      const ph = Math.round(x.p_home * 100), pa = 100 - ph;
      const sent = `${x.p_home >= 0.5 ? H : A} ${Math.max(ph, pa)}% ${MCL.win} | ${MCL.score}: ${Math.round(x.hs)}-${Math.round(x.as)} | ${MCL.total}: ${Math.round(x.total)} | Pace: ${x.pace.toFixed(1)} | ${MCL.conf}: ${MCL[x.conf]}`;
      const gen = new Date(MPRED.generated_at).toLocaleString(LOCALE, { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const small = Math.min(x.n_h || 0, x.n_a || 0) < 5 ? ` <span class="badge small">${T('μικρό δείγμα', 'small sample', 'muestra pequeña', 'mali uzorak')}</span>` : '';
      // A. σύγκριση ομάδων
      const LT = ANL[cp];
      const K = ['ortg', 'drtg', 'net', 'pace', 'efg', 'ts', 'ast', 'tov', 'oreb', 'dreb', 'ftr'];
      const better = (k, u, v) => (u == null || v == null) ? 0 : (['drtg', 'tov'].includes(k) ? (u < v ? 1 : u > v ? -1 : 0) : (u > v ? 1 : u < v ? -1 : 0));
      const cmp = LT && LT.rows[h] && LT.rows[a] ? `<div class="tbl"><table class="antbl mccmp"><thead><tr><th class="l">${esc(H)}</th><th></th><th class="r">${esc(A)}</th></tr></thead><tbody>${K.map(k => { const u = LT.rows[h][k], v = LT.rows[a][k], b = better(k, u, v); return `<tr><td class="l${b > 0 ? ' win' : ''}">${af(k, u)} <small>${LT.pct[h][k]}%</small></td><td class="c" title="${esc(TIP[k])}">${esc(MN[k])}</td><td class="r${b < 0 ? ' win' : ''}">${af(k, v)} <small>${LT.pct[a][k]}%</small></td></tr>`; }).join('')}
${(() => { const C = AN[cp]; const sh = AB.teamSeason(C, h, g => g.home), sa = AB.teamSeason(C, a, g => !g.home), l5h = AB.teamGames(C, h).slice(-5), l5a = AB.teamGames(C, a).slice(-5); const fm = gs => gs.map(g => g.pf > g.pa ? T('Ν', 'W', 'V', 'P') : T('Η', 'L', 'D', 'I')).join(''); return `<tr><td class="l">${sh.w}-${sh.gp - sh.w} · Net ${af('net', sh.net)}</td><td class="c">${T('Εντός / εκτός έδρας', 'Home / away', 'Local / visitante', 'Kod kuće / u gostima')}</td><td class="r">${sa.w}-${sa.gp - sa.w} · Net ${af('net', sa.net)}</td></tr><tr><td class="l">${fm(l5h)}</td><td class="c">${T('Φόρμα (5)', 'Form (5)', 'Forma (5)', 'Forma (5)')}</td><td class="r">${fm(l5a)}</td></tr>`; })()}
</tbody></table></div><p class="sub">${T('Ο αριθμός με % είναι το εκατοστημόριο στη λίγκα (100 = καλύτερη). Με έντονα ποιος υπερτερεί.', 'The % is the league percentile (100 = best). Bold marks the better side.', 'El % es el percentil en la liga (100 = el mejor). En negrita, quién es mejor.', '% je percentil u ligi (100 = najbolji). Podebljano je bolja strana.')}</p>` : '';
      // B. key matchups
      const PH = mcPlayers(cp, h).filter(p => p.G >= 2), PA = mcPlayers(cp, a).filter(p => p.G >= 2);
      const top = (L, k, n = 5, f = () => true) => L.filter(f).sort((u, v) => v[k] - u[k]).slice(0, n);
      const pL = p => p.url ? `<a href="${p.url}">${esc(p.n)}</a>` : esc(niceName(p.n));
      const posM = cp === 'E' ? ['Guard', 'Forward', 'Center'].map(ps => { const u = top(PH, 'pir', 1, p => p.pos === ps)[0], v = top(PA, 'pir', 1, p => p.pos === ps)[0]; return u && v ? `<li><b>${{ Guard: T('Γκαρντ', 'Guard', 'Base/escolta', 'Bek'), Forward: T('Φόργουορντ', 'Forward', 'Alero', 'Krilo'), Center: T('Σέντερ', 'Center', 'Pívot', 'Centar') }[ps]}:</b> ${pL(u)} (${f1(u.pir)} PIR) – ${pL(v)} (${f1(v.pir)} PIR)</li>` : ''; }).join('') : '';
      const r1 = LT?.rows[h], r2 = LT?.rows[a];
      const bench = L => L.reduce((s, p) => s + (p.start != null && p.start < 0.5 ? p.pir : 0), 0);
      const bestO = (L, opp) => { const p = top(L, 'pts', 1)[0]; return p ? `${pL(p)} (${f1(p.pts)} ${T('πόντοι', 'pts', 'pts', 'poena')}) ${T('απέναντι σε άμυνα με DRtg', 'vs a defense with DRtg', 'contra una defensa con DRtg', 'protiv odbrane sa DRtg')} ${af('drtg', opp?.drtg)} (${LT.rk[opp === r1 ? h : a]?.drtg ?? '–'}${T('η', '', '.º', '.')})` : ''; };
      const coachH = coachOf(cp, h), coachA = coachOf(cp, a);
      const km = `<ul class="mckm">${posM}
${r1 && r2 ? `<li><b>${T('Καλύτερος σκόρερ απέναντι στην άμυνα', 'Top scorer vs defense', 'Máximo anotador frente a la defensa', 'Najbolji strelac protiv odbrane')}:</b> ${bestO(PH, r2)} · ${bestO(PA, r1)}</li>
<li><b>${T('Μάχη των ριμπάουντ', 'Rebounding battle', 'Batalla del rebote', 'Borba za skokove')}:</b> ${esc(H)} OREB% ${af('oreb', r1.oreb)} ${T('έναντι', 'vs', 'frente a', 'protiv')} DREB% ${af('dreb', r2.dreb)} ${esc(A)} · ${esc(A)} OREB% ${af('oreb', r2.oreb)} ${T('έναντι', 'vs', 'frente a', 'protiv')} DREB% ${af('dreb', r1.dreb)} ${esc(H)}</li>
<li><b>${T('Μάχη του ρυθμού', 'Pace battle', 'Batalla del ritmo', 'Borba za tempo')}:</b> ${esc(H)} ${af('pace', r1.pace)} – ${esc(A)} ${af('pace', r2.pace)} · ${T('προβλεπόμενο', 'projected', 'proyectado', 'projektovano')} ${x.pace.toFixed(1)}</li>` : ''}
${cp === 'E' ? `<li><b>${T('Πάγκος (PIR αναπληρωματικών ανά αγώνα)', 'Bench (PIR from reserves per game)', 'Banquillo (PIR de suplentes por partido)', 'Klupa (PIR rezervi po utakmici)')}:</b> ${esc(H)} ${f1(bench(PH))} – ${esc(A)} ${f1(bench(PA))}</li>` : ''}
${coachH || coachA ? `<li><b>${T('Προπονητές', 'Coaches', 'Entrenadores', 'Treneri')}:</b> ${esc(coachH || '–')} – ${esc(coachA || '–')}</li>` : ''}</ul>`;
      // C. players to watch
      const fx = cp === 'E' && FXD ? Object.fromEntries(FXD.players.filter(p => p.t === h || p.t === a).map(p => [p.c, p])) : {};
      const injP = c => cp === 'E' && INJ[LG][c];
      const projP = L => L.map(p => ({ ...p, proj: fx[p.c]?.pp ?? p.pir, price: fx[p.c]?.price })).filter(p => !injP(p.c));
      const card = (p, v, lab) => `<li>${pL(p)} <b>${typeof v === 'number' ? f1(v) : v}</b> <small>${lab}</small></li>`;
      const col = (t, LH, LA, k, lab) => `<div><h4>${t}</h4><div class="mc2"><ol class="leadol">${LH.map(p => card(p, p[k], lab)).join('')}</ol><ol class="leadol">${LA.map(p => card(p, p[k], lab)).join('')}</ol></div></div>`;
      const jh = projP(PH), ja = projP(PA);
      const valueL = L => L.filter(p => p.price).map(p => ({ ...p, val: p.proj / p.price })).sort((u, v) => v.val - u.val).slice(0, 3);
      const injList = [...(cp === 'E' ? players.filter(p => [h, a].includes(p.t.split(';').pop()) && INJ[LG][p.c]).map(p => `${esc(niceName(p.n))} (${esc(mcTeamName(cp, p.t.split(';').pop()))}): ${esc(INJ[LG][p.c].t)}`) : [])];
      const ptw = `<div class="mcptw"><p class="sub mchd"><span>${esc(H)}</span><span>${esc(A)}</span></p>
${col(T('Προβλεπόμενο PIR', 'Projected PIR', 'PIR proyectado', 'Projektovani PIR'), top(jh, 'proj'), top(ja, 'proj'), 'proj', 'PIR')}
${col(T('Σκόρερ', 'Scorers', 'Anotadores', 'Strelci'), top(jh, 'pts'), top(ja, 'pts'), 'pts', T('π.', 'pts', 'pts', 'p.'))}
${col(T('Ριμπάουντερ', 'Rebounders', 'Reboteadores', 'Skakači'), top(jh, 'reb'), top(ja, 'reb'), 'reb', T('ριμπ.', 'reb', 'reb', 'sk.'))}
${col(T('Πασέρ', 'Playmakers', 'Pasadores', 'Organizatori'), top(jh, 'ast'), top(ja, 'ast'), 'ast', T('ασ.', 'ast', 'asi', 'as.'))}
${Object.keys(fx).length ? `<div><h4>${T('Value picks για το Fantasy', 'Fantasy value picks', 'Chollos para el Fantasy', 'Fantasy vrednost')}</h4><div class="mc2"><ol class="leadol">${valueL(jh).map(p => card(p, (p.val).toFixed(2), T('PIR/εκ.', 'PIR/M', 'PIR/M', 'PIR/M'))).join('')}</ol><ol class="leadol">${valueL(ja).map(p => card(p, (p.val).toFixed(2), T('PIR/εκ.', 'PIR/M', 'PIR/M', 'PIR/M'))).join('')}</ol></div></div>` : ''}
<div><h4>${T('Injury watch', 'Injury watch', 'Bajas', 'Povrede')}</h4>${injList.length ? `<ul>${injList.map(s => `<li>${s}</li>`).join('')}</ul>` : `<p class="sub">${T('Καμία γνωστή απουσία.', 'No known absences.', 'Sin bajas conocidas.', 'Nema poznatih odsustava.')}</p>`}${x.h_absent > 0.05 || x.a_absent > 0.05 ? `<p class="sub">${T('Λεπτά που λείπουν σε σχέση με τους 3 τελευταίους αγώνες', 'Share of recent minutes missing', 'Minutos recientes ausentes', 'Udeo nedavnih minuta koji nedostaje')}: ${esc(H)} ${Math.round(100 * x.h_absent)}% · ${esc(A)} ${Math.round(100 * x.a_absent)}%</p>` : ''}</div></div>`;
      // D. ιστορικό
      const hist = mcHist(cp, h, a);
      const C = AN[cp], tg = c => AB.teamGames(C, c);
      const restSplit = c => { const gs = tg(c); let prev = null; const b = { short: [0, 0], long: [0, 0] }; for (const g of gs) { if (prev) { const dd = (new Date(g.d) - new Date(prev)) / 864e5; const k = dd <= 2 ? 'short' : 'long'; b[k][0]++; if (g.pf > g.pa) b[k][1]++; } prev = g.d; } return b; };
      const rs = [restSplit(h), restSplit(a)];
      const hv = tg(h).filter(g => g.home), av = tg(a).filter(g => !g.home);
      const hc = `<div class="tbl"><table class="antbl"><thead><tr><th class="l">${T('Ημερομηνία', 'Date', 'Fecha', 'Datum')}</th><th class="l">${T('Αγώνας', 'Game', 'Partido', 'Utakmica')}</th><th>${T('Σκορ', 'Score', 'Marcador', 'Rezultat')}</th></tr></thead><tbody>${hist.map(g => `<tr><td class="l">${g.d}</td><td class="l">${esc(mcTeamName(cp, g.h))} – ${esc(mcTeamName(cp, g.a))}</td><td>${g.hs}-${g.as}</td></tr>`).join('') || `<tr><td class="l" colspan="3">${T('Δεν υπάρχουν πρόσφατες συναντήσεις στα δεδομένα μας.', 'No recent meetings in our data.', 'No hay enfrentamientos recientes en nuestros datos.', 'Nema skorijih susreta u našim podacima.')}</td></tr>`}</tbody></table></div>
<ul class="mckm"><li><b>${T('Στην έδρα', 'At this venue', 'En este pabellón', 'Na ovom terenu')}:</b> ${esc(H)} ${hv.filter(g => g.pf > g.pa).length}-${hv.filter(g => g.pf < g.pa).length} ${T('εντός', 'at home', 'en casa', 'kod kuće')} · ${esc(A)} ${av.filter(g => g.pf > g.pa).length}-${av.filter(g => g.pf < g.pa).length} ${T('εκτός', 'away', 'fuera', 'u gostima')}</li>
<li><b>${T('Με λίγη ξεκούραση (≤2 μέρες)', 'On short rest (≤2 days)', 'Con poco descanso (≤2 días)', 'Sa kratkim odmorom (≤2 dana)')}:</b> ${esc(H)} ${rs[0].short[1]}-${rs[0].short[0] - rs[0].short[1]} · ${esc(A)} ${rs[1].short[1]}-${rs[1].short[0] - rs[1].short[1]}</li>
<li><b>${T('Με κανονική ξεκούραση', 'On regular rest', 'Con descanso normal', 'Sa normalnim odmorom')}:</b> ${esc(H)} ${rs[0].long[1]}-${rs[0].long[0] - rs[0].long[1]} · ${esc(A)} ${rs[1].long[1]}-${rs[1].long[0] - rs[1].long[1]}</li>
<li><b>${T('Ξεκούραση πριν από αυτόν τον αγώνα', 'Rest before this game', 'Descanso antes de este partido', 'Odmor pre ove utakmice')}:</b> ${esc(H)} ${x.h_rest} · ${esc(A)} ${x.a_rest} ${T('μέρες', 'days', 'días', 'dana')}${x.h_rest <= 1 || x.a_rest <= 1 ? ` · <b>back-to-back</b>` : ''}</li></ul>`;
      // simulator
      const nm = Object.fromEntries([...PH, ...PA].map(p => [p.c, p.n]));
      const simJ = JSON.stringify({ g: x, names: [H, A], pn: Object.fromEntries((x.sim.players || []).map(p => [p.id, nm[p.id] || p.id])), L: { ...MCL } }).replace(/</g, '\\u003c');
      return `<section class="mc" id="matchup"><h2>Matchup Center</h2>
<div class="mcbox"><div class="mcteams"><div>${mcCrest(cp, h)} <b>${esc(H)}</b><span class="mcpct">${ph}%</span></div><div class="mcbar" role="img" aria-label="${esc(H)} ${ph}% – ${esc(A)} ${pa}%"><i style="width:${ph}%"></i></div><div><span class="mcpct">${pa}%</span><b>${esc(A)}</b> ${mcCrest(cp, a)}</div></div>
<div class="mcnums"><div><span>${MCL.score}</span><b>${Math.round(x.hs)}-${Math.round(x.as)}</b></div><div><span>${T('Διαφορά', 'Margin', 'Diferencia', 'Razlika')}</span><b>${x.margin > 0 ? '+' : ''}${x.margin.toFixed(1)}</b></div><div><span>${MCL.total}</span><b>${x.total.toFixed(1)}</b></div><div title="${esc(TIP.pace)}"><span>Pace</span><b>${x.pace.toFixed(1)}</b></div><div><span>${MCL.conf}</span><b>${MCL[x.conf]}</b>${small}</div></div>
<p class="lede2">${esc(sent)}</p>
<p class="sub">${T('Μοντέλο', 'Model', 'Modelo', 'Model')} ${esc(MPRED.model_version)} (${esc(MPRED.engine)}) · ${T('τελευταία ενημέρωση', 'last updated', 'última actualización', 'poslednje ažuriranje')} ${esc(gen)} · <a href="${urlFor(LG, 'model')}#predictor">${T('πόσο πέφτει μέσα', 'how accurate it is', 'qué tal acierta', 'koliko je tačan')}</a></p></div>
<h3>${T('Προσομοίωση σεναρίων', 'Scenario simulator', 'Simulador de escenarios', 'Simulator scenarija')}</h3><div class="mcsim" id="mcSim"><script type="application/json" class="mcj">${simJ}</script><p class="sub">…</p></div>
<h3>${T('Σύγκριση ομάδων', 'Team comparison', 'Comparativa', 'Poređenje timova')}</h3>${cmp}
<h3>Key matchups</h3>${km}
<h3>Players to watch</h3>${ptw}
<h3>${T('Ιστορικό', 'Historical context', 'Contexto histórico', 'Istorijat')}</h3>${hc}
${oddsSec(x, H, A)}
<p class="note">${T('Οι προβλέψεις είναι στατιστικές εκτιμήσεις, όχι εγγυημένα προγνωστικά. Το στοίχημα επιτρέπεται μόνο σε άτομα άνω των 21 ετών (18 εκτός Ελλάδας). Παίξε υπεύθυνα.', 'Predictions are statistical estimates, not guaranteed tips. Gambling is for adults only (21+ in Greece, 18+ elsewhere). Play responsibly.', 'Los pronósticos son estimaciones estadísticas, no apuestas seguras. Apostar es solo para mayores de edad (21+ en Grecia, 18+ en otros países). Juega con responsabilidad.', 'Prognoze su statističke procene, a ne garantovani tipovi. Klađenje je samo za punoletne (21+ u Grčkoj, 18+ drugde). Igraj odgovorno.')}</p>
</section><script type="module" src="${BASE}assets/matchup/ui.js?v=${ver}"></script>`;
    }
    // ---- Game Predictor: αξιολόγηση (στη σελίδα του μοντέλου), hub /matchup/, σελίδες EuroCup
    const predSec = (() => {
      if (!MBT || !MBT.summary || !MBT.summary.n) return '';
      const s = MBT.summary, pc = v => (100 * v).toFixed(1) + '%';
      return `<section id="predictor"><h2>Game Predictor (${esc(MBT.model_version)}, ${esc(MBT.engine)})</h2><p class="sub">${esc(T(`Walk-forward backtest σε ${s.n} αγώνες: το μοντέλο εκπαιδεύεται μόνο σε όσους αγώνες προηγήθηκαν και προβλέπει τους επόμενους.`, `Walk-forward backtest over ${s.n} games: the model is trained only on earlier games and predicts the next ones.`, `Backtest walk-forward en ${s.n} partidos: el modelo se entrena solo con partidos anteriores y predice los siguientes.`, `Walk-forward backtest na ${s.n} utakmica: model se trenira samo na ranijim utakmicama i predviđa sledeće.`))}</p>
<div class="anmetrics"><div class="am"><span>Accuracy</span><b>${pc(s.accuracy)}</b>${s.elo_accuracy != null ? `<small>Elo: ${pc(s.elo_accuracy)}</small>` : ''}</div><div class="am"><span>Log loss</span><b>${s.log_loss.toFixed(3)}</b>${s.elo_log_loss != null ? `<small>Elo: ${s.elo_log_loss.toFixed(3)}</small>` : ''}</div><div class="am"><span>Brier</span><b>${s.brier.toFixed(3)}</b>${s.elo_brier != null ? `<small>Elo: ${s.elo_brier.toFixed(3)}</small>` : ''}</div><div class="am"><span>ECE</span><b>${pc(s.ece)}</b></div><div class="am"><span>MAE ${T('διαφοράς', 'margin', 'diferencia', 'razlike')}</span><b>${s.margin_mae.toFixed(1)}</b><small>RMSE ${s.margin_rmse.toFixed(1)}</small></div><div class="am"><span>MAE ${T('συνόλου', 'total', 'total', 'ukupno')}</span><b>${s.total_mae.toFixed(1)}</b><small>RMSE ${s.total_rmse.toFixed(1)}</small></div><div class="am"><span>MAE pace</span><b>${s.pace_mae.toFixed(1)}</b></div></div>
<h3>Calibration</h3><div class="tbl"><table class="antbl"><thead><tr><th class="l">${T('Πιθανότητα γηπεδούχου', 'Home win probability', 'Probabilidad local', 'Verovatnoća domaćina')}</th><th>${T('Αγώνες', 'Games', 'Partidos', 'Utakmice')}</th><th>${T('Μέση πρόβλεψη', 'Mean forecast', 'Pronóstico medio', 'Prosečna prognoza')}</th><th>${T('Πραγματικό', 'Observed', 'Real', 'Stvarno')}</th></tr></thead><tbody>${s.calibration.map(b => `<tr><td class="l">${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}%</td><td>${b.n}</td><td>${pc(b.pred)}</td><td>${pc(b.obs)}</td></tr>`).join('')}</tbody></table></div></section>`;
    })();
    if (MPRED && MPRED.games.length) {
      const dayKey = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Athens' });
      const byDay = {};
      for (const x of MPRED.games) (byDay[dayKey(x.t)] ||= []).push(x);
      const mUrl = x => x.comp === 'E' ? urlFor(LG, `game:${x.r}|${x.h}|${x.a}`) : urlFor(LG, `mcu:${x.r}|${x.h}|${x.a}`);
      const row = x => { const ph = Math.round(x.p_home * 100); return `<a class="mcrow" href="${mUrl(x)}#matchup"><span class="mct">${new Date(x.t).toLocaleTimeString(LOCALE, { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span><span class="mch">${esc(mcTeamName(x.comp, x.h))}</span><span class="mcbar sm"><i style="width:${ph}%"></i></span><span class="mca">${esc(mcTeamName(x.comp, x.a))}</span><b>${ph}% · ${Math.round(x.hs)}-${Math.round(x.as)}</b><small>${x.comp === 'E' ? 'EL' : 'EC'} · ${MCL[x.conf]}</small></a>`; };
      await simplePage('mc', { view: 'lead', title: T(`Matchup Center: προβλέψεις EuroLeague & EuroCup, πιθανότητα νίκης, σκορ, pace | ${SITE_NAME}`, `Matchup Center: EuroLeague & EuroCup predictions, win probability, score, pace | ${SITE_NAME}`, `Matchup Center: pronósticos EuroLeague y EuroCup, probabilidad, marcador, ritmo | ${SITE_NAME}`, `Matchup Center: prognoze Evrolige i Evrokupa, verovatnoća, rezultat, tempo | ${SITE_NAME}`),
        desc: T('Για κάθε επερχόμενο αγώνα EuroLeague και EuroCup: πιθανότητα νίκης, προβλεπόμενο σκορ, σύνολο, pace, key matchups, παίκτες να προσέξεις και προσομοίωση σεναρίων.', 'For every upcoming EuroLeague and EuroCup game: win probability, projected score, total, pace, key matchups, players to watch and a scenario simulator.', 'Para cada próximo partido de EuroLeague y EuroCup: probabilidad de victoria, marcador proyectado, total, ritmo, duelos clave, jugadores a seguir y simulador.', 'Za svaku narednu utakmicu Evrolige i Evrokupa: verovatnoća pobede, projektovani rezultat, ukupno, tempo, ključni dueli, igrači za praćenje i simulator.'),
        main: `<article class="article lead wide anpage"><h1>Matchup Center</h1><p class="lede2">${esc(T(`Προβλέψεις του Game Predictor (${MPRED.model_version}) για τους επόμενους αγώνες. Κλικ σε αγώνα για το αναλυτικό preview και τον simulator.`, `Game Predictor (${MPRED.model_version}) forecasts for upcoming games. Click a game for the full preview and simulator.`, `Pronósticos del Game Predictor (${MPRED.model_version}) para los próximos partidos. Pulsa un partido para la previa completa y el simulador.`, `Prognoze Game Predictor-a (${MPRED.model_version}) za naredne utakmice. Klik na utakmicu za detaljnu najavu i simulator.`))}</p>
${Object.entries(byDay).sort().map(([d, L]) => `<h2>${esc(new Date(d + 'T12:00:00Z').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }))}</h2><div class="mclist">${L.sort((u, v) => u.t.localeCompare(v.t)).map(row).join('')}</div>`).join('')}
<p><a class="pread" href="${urlFor(LG, 'model')}#predictor">${T('Πόσο πέφτει μέσα το μοντέλο →', 'How accurate is the model →', '¿Cuánto acierta el modelo? →', 'Koliko je model tačan →')}</a></p>${method}</article>`,
        ld: crumbs([[SITE_NAME, B(LG)], ['Matchup Center', urlFor(LG, 'mc')]]) });
      for (const x of MPRED.games.filter(x => x.comp === 'U')) {
        const H = mcTeamName('U', x.h), A = mcTeamName('U', x.a), when = new Date(x.t).toLocaleString(LOCALE, { timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        await simplePage(`mcu:${x.r}|${x.h}|${x.a}`, { view: 'game', title: T(`${H} - ${A} πρόβλεψη EuroCup (${x.r}η αγωνιστική) | ${SITE_NAME}`, `${H} vs ${A} EuroCup prediction (round ${x.r}) | ${SITE_NAME}`, `${H} - ${A} pronóstico EuroCup (jornada ${x.r}) | ${SITE_NAME}`, `${H} - ${A} prognoza Evrokup (${x.r}. kolo) | ${SITE_NAME}`),
          desc: T(`${H} - ${A} (${when}): πιθανότητα νίκης, προβλεπόμενο σκορ ${Math.round(x.hs)}-${Math.round(x.as)}, σύνολο, pace και παίκτες να προσέξεις.`, `${H} vs ${A} (${when}): win probability, projected score ${Math.round(x.hs)}-${Math.round(x.as)}, total, pace and players to watch.`, `${H} - ${A} (${when}): probabilidad, marcador proyectado ${Math.round(x.hs)}-${Math.round(x.as)}, total, ritmo y jugadores a seguir.`, `${H} - ${A} (${when}): verovatnoća, projektovani rezultat ${Math.round(x.hs)}-${Math.round(x.as)}, ukupno, tempo i igrači.`),
          main: `<article class="game"><p class="kicker">EuroCup · ${esc(T(`${x.r}η αγωνιστική`, `Round ${x.r}`, `Jornada ${x.r}`, `${x.r}. kolo`))}</p><h1>${esc(H)} – ${esc(A)}</h1><p class="lede">${esc(when)} ${T('(ώρα Ελλάδας)', '(Athens time)', '(hora de Atenas)', '(po atinskom vremenu)')}</p>${matchupCenter('U', x)}<p><a class="pread" href="${urlFor(LG, 'mc')}">Matchup Center →</a> · <a class="pread" href="${urlFor(LG, 'ec')}">EuroCup →</a></p></article>`,
          ld: [crumbs([[SITE_NAME, B(LG)], ['Matchup Center', urlFor(LG, 'mc')], [`${H} - ${A}`, urlFor(LG, `mcu:${x.r}|${x.h}|${x.a}`)]]), { '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${H} - ${A}`, sport: 'Basketball', startDate: x.t, eventStatus: 'https://schema.org/EventScheduled', homeTeam: { '@type': 'SportsTeam', name: H }, awayTeam: { '@type': 'SportsTeam', name: A }, location: { '@type': 'Place', name: H }, superEvent: { '@type': 'SportsEvent', name: `EuroCup ${SEASON_LABEL}` } }] });
      }
    }
    // ---- Betting Insights: hub, CLV, εσωτερικές γραμμές PIR
    {
      const live = !!(OB.latest && Object.keys(OB.latest.games || {}).length);
      const st = OB.status;
      const feed = live ? `${T('Πάροχος', 'Provider', 'Proveedor', 'Provajder')}: <b>${esc(OB.latest.provider)}</b> · ${T('τελευταία ενημέρωση', 'last updated', 'última actualización', 'poslednje ažuriranje')} ${esc(new Date(OB.latest.updated).toLocaleString(LOCALE, { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))}${st?.error ? ` · <span class="neg">${T('τελευταίο σφάλμα', 'last error', 'último error', 'poslednja greška')}: ${esc(st.error)}</span>` : ''}`
        : T('Δεν έχει συνδεθεί ακόμη αδειοδοτημένος πάροχος αποδόσεων. Μέχρι τότε βλέπεις μόνο τις πιθανότητες του μοντέλου και τις αντίστοιχες «δίκαιες» αποδόσεις (1/πιθανότητα), όχι πραγματικές αποδόσεις bookmakers.', 'No licensed odds provider is connected yet. Until then you only see the model’s probabilities and the matching “fair” odds (1/probability), not real bookmaker odds.', 'Aún no hay un proveedor de cuotas con licencia conectado. Hasta entonces solo ves las probabilidades del modelo y su cuota «justa» (1/probabilidad).', 'Još nije povezan licencirani provajder kvota. Do tada vidiš samo verovatnoće modela i „fer” kvote (1/verovatnoća).');
      const games = (MPRED?.games || []).filter(g => g.comp === 'E').sort((a, b) => a.t.localeCompare(b.t));
      const rowG = g => { const gid = `E-${g.r}-${g.h}-${g.a}`, I = OBI[gid], ml = I?.ml; const fo = p => (p > 0 ? (1 / p).toFixed(2) : '–'); return `<tr><td class="l"><a href="${urlFor(LG, `game:${g.r}|${g.h}|${g.a}`)}#matchup">${esc(tName(g.h))} – ${esc(tName(g.a))}</a><br><small>${esc(new Date(g.t).toLocaleString(LOCALE, { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))}</small></td><td>${pcO(g.p_home)} / ${pcO(1 - g.p_home)}</td><td>${fo(g.p_home)} / ${fo(1 - g.p_home)}</td>${ml ? `<td>${ml.best[0].toFixed(2)} / ${ml.best[1].toFixed(2)}</td><td>${pcO(ml.consensusFair[0])} / ${pcO(ml.consensusFair[1])}</td><td>${[0, 1].map(i => `<span class="edge ${ml.cls[i]}">${pp(ml.edge[i])}</span>`).join(' / ')}</td><td>${[0, 1].map(i => tierTxt(ml.tier[i])).join(' / ')}</td>` : '<td colspan="4" class="sub">–</td>'}</tr>`; };
      await simplePage('odds', { view: 'lead', title: T(`Betting Insights EuroLeague: μοντέλο vs αγορά, implied probability, line movement | ${SITE_NAME}`, `EuroLeague betting insights: model vs market, implied probability, line movement | ${SITE_NAME}`, `Betting insights EuroLeague: modelo vs mercado, probabilidad implícita, movimiento de cuotas | ${SITE_NAME}`, `Betting insights Evroliga: model vs tržište, implicitna verovatnoća, kretanje kvota | ${SITE_NAME}`),
        desc: T('Στατιστική σύγκριση του Game Predictor με την αγορά: implied probability χωρίς vig, model edge, line movement, Closing Line Value και εσωτερικές γραμμές PIR. 21+.', 'Statistical comparison of the Game Predictor with the market: no-vig implied probability, model edge, line movement, closing line value and internal PIR lines. 21+.', 'Comparación estadística del Game Predictor con el mercado: probabilidad implícita sin margen, ventaja del modelo, movimiento de cuotas, CLV y líneas internas de PIR. 21+.', 'Statističko poređenje Game Predictor-a sa tržištem: implicitna verovatnoća bez marže, prednost modela, kretanje kvota, CLV i interne PIR linije. 21+.'),
        main: `<article class="article lead wide anpage oddspage"><h1>Betting Insights <span class="age21">21+</span></h1><p class="lede2">${esc(T('Πού διαφωνεί το στατιστικό μας μοντέλο με την αγορά. Model edge = πιθανότητα μοντέλου − πιθανότητα αγοράς χωρίς το περιθώριο του bookmaker, σε ποσοστιαίες μονάδες. Είναι μέτρο σύγκρισης, όχι υπόσχεση.', 'Where our statistical model disagrees with the market. Model edge = model probability − market probability without the bookmaker margin, in percentage points. It is a comparison metric, not a promise.', 'Dónde discrepa nuestro modelo estadístico del mercado. Ventaja = probabilidad del modelo − probabilidad del mercado sin margen, en puntos porcentuales. Es una métrica de comparación, no una promesa.', 'Gde se naš statistički model razlikuje od tržišta. Prednost = verovatnoća modela − verovatnoća tržišta bez marže, u procentnim poenima. To je metrika poređenja, ne obećanje.'))}</p>
<p class="sub">${feed}</p>
<p class="sub">${T('Εμφανίζονται μόνο εταιρείες με άδεια της ΕΕΕΠ για τη διεξαγωγή στοιχήματος στην Ελλάδα.', 'Only operators licensed by the Hellenic Gaming Commission (EEEP) for Greece are shown.', 'Solo se muestran operadores con licencia de la EEEP en Grecia.', 'Prikazuju se samo operateri sa licencom EEEP za Grčku.')}</p>
${rgBlock()}
<h2>${T('Επόμενοι αγώνες EuroLeague', 'Upcoming EuroLeague games', 'Próximos partidos de EuroLeague', 'Naredne utakmice Evrolige')}</h2>
<div class="tbl"><table class="antbl"><thead><tr><th class="l">${T('Αγώνας', 'Game', 'Partido', 'Utakmica')}</th><th>${T('Μοντέλο (1/2)', 'Model (1/2)', 'Modelo (1/2)', 'Model (1/2)')}</th><th>${T('Δίκαιη απόδοση', 'Fair odds', 'Cuota justa', 'Fer kvota')}</th><th>${T('Καλύτερη απόδοση', 'Best price', 'Mejor cuota', 'Najbolja kvota')}</th><th>${T('Αγορά χωρίς vig', 'Market no-vig', 'Mercado sin margen', 'Tržište bez marže')}</th><th>Model edge</th><th>Confidence</th></tr></thead><tbody>${games.map(rowG).join('') || `<tr><td colspan="7" class="sub">–</td></tr>`}</tbody></table></div>
<p><a class="pread" href="${urlFor(LG, 'oddspir')}">${T('Εσωτερικές γραμμές PIR →', 'Internal PIR lines →', 'Líneas internas de PIR →', 'Interne PIR linije →')}</a> · <a class="pread" href="${urlFor(LG, 'oddsclv')}">Closing Line Value →</a> · <a class="pread" href="${urlFor(LG, 'model')}#predictor">${T('Ακρίβεια μοντέλου →', 'Model accuracy →', 'Acierto del modelo →', 'Tačnost modela →')}</a></p>
<details class="anmeth"><summary>${T('Μεθοδολογία', 'Methodology', 'Metodología', 'Metodologija')}</summary><p>${esc(T('Implied probability = 1/απόδοση. Το άθροισμα των implied μιας αγοράς ξεπερνά το 100%: η διαφορά είναι το περιθώριο (vig) του bookmaker. Το αφαιρούμε κανονικοποιώντας (κάθε implied / άθροισμα) και παίρνουμε τον μέσο όρο όλων των bookmakers. Model edge ≥ +2,5 pp = model value, ≤ −2,5 pp = market value, αλλιώς ουδέτερο. Confidence: μέγεθος του edge, βεβαιότητα του μοντέλου και πόσο πρόσφατη είναι η απόδοση. Handicap/σύνολο: πιθανότητα από την προβλεπόμενη διαφορά/σύνολο και το τυπικό σφάλμα του backtest. Οι αποδόσεις έρχονται μόνο από αδειοδοτημένο πάροχο δεδομένων· δεν συλλέγονται από sites στοιχηματικών.', 'Implied probability = 1/odds. The implied probabilities of a market add up to more than 100%: the excess is the bookmaker margin (vig). We remove it by normalising (each implied / sum) and average all bookmakers. Model edge ≥ +2.5 pp = model value, ≤ −2.5 pp = market value, otherwise neutral. Confidence combines edge size, model certainty and price freshness. Handicap/total: probability from the projected margin/total and the backtest standard error. Odds come only from a licensed data provider; they are not collected from bookmaker sites.', 'Probabilidad implícita = 1/cuota. La suma supera el 100%: la diferencia es el margen. Lo quitamos normalizando y promediamos todos los operadores. Ventaja ≥ +2,5 pp = valor del modelo, ≤ −2,5 pp = valor del mercado. Las cuotas vienen solo de un proveedor con licencia.', 'Implicitna verovatnoća = 1/kvota. Zbir prelazi 100%: razlika je marža. Uklanjamo je normalizacijom i uzimamo prosek svih kladionica. Prednost ≥ +2,5 pp = vrednost modela, ≤ −2,5 pp = vrednost tržišta. Kvote dolaze samo od licenciranog provajdera.'))}</p></details></article>`,
        ld: crumbs([[SITE_NAME, B(LG)], ['Betting Insights', urlFor(LG, 'odds')]]) });
      // CLV
      const C = OCLV;
      const clvT = (S, lab) => `<div class="tbl"><table class="antbl"><thead><tr><th class="l">${lab}</th><th>${T('Αγώνες', 'Games', 'Partidos', 'Utakmice')}</th><th>${T('Μέσο CLV', 'Mean CLV', 'CLV medio', 'Prosečan CLV')}</th><th>${T('% θετικό', '% positive', '% positivo', '% pozitivno')}</th></tr></thead><tbody>${Object.entries(S).sort().map(([k, v]) => `<tr><td class="l">${esc(TEAMS[k] ? tName(k) : k)}</td><td>${v.n}</td><td class="net ${v.mean > 0.5 ? 'pos' : v.mean < -0.5 ? 'neg' : 'neu'}">${pp(v.mean)}</td><td>${pcO(v.pos)}</td></tr>`).join('')}</tbody></table></div>`;
      await simplePage('oddsclv', { view: 'lead', title: T(`Closing Line Value του μοντέλου EuroLeague | ${SITE_NAME}`, `EuroLeague model closing line value | ${SITE_NAME}`, `Closing Line Value del modelo de EuroLeague | ${SITE_NAME}`, `Closing Line Value modela Evrolige | ${SITE_NAME}`),
        desc: T('Πόσο συχνά η πρόβλεψη του μοντέλου «βλέπει» την τελική (closing) γραμμή της αγοράς: μέσο CLV ανά αγορά, ομάδα και μήνα. Μετρική ποιότητας, όχι υπόσχεση κέρδους.', 'How the model’s forecasts compare with the market’s closing line: mean CLV by market, team and month. A quality metric, not a promise of profit.', 'Cómo se comparan los pronósticos del modelo con la línea de cierre: CLV medio por mercado, equipo y mes. Métrica de calidad, no promesa de beneficio.', 'Kako se prognoze modela porede sa zatvarajućom linijom: prosečan CLV po tržištu, timu i mesecu. Metrika kvaliteta, ne obećanje dobitka.'),
        main: `<article class="article lead wide anpage oddspage"><p class="crumbs"><a href="${urlFor(LG, 'odds')}">Betting Insights</a></p><h1>Closing Line Value <span class="age21">21+</span></h1><p class="lede2">${esc(T('CLV = πιθανότητα μοντέλου (τελευταία πρόβλεψη πριν από το τζάμπολ) − πιθανότητα της closing γραμμής χωρίς vig, για την πλευρά που προτιμούσε το μοντέλο. Θετικό μέσο CLV σε μεγάλο δείγμα σημαίνει ότι το μοντέλο προβλέπει προς την κατεύθυνση που κινείται τελικά η αγορά. Δεν είναι εγγύηση κέρδους.', 'CLV = model probability (last forecast before tip-off) − no-vig closing line probability, for the side the model preferred. A positive mean CLV over a large sample means the model leans the way the market eventually moves. It is not a guarantee of profit.', 'CLV = probabilidad del modelo − probabilidad de cierre sin margen, para el lado preferido por el modelo. Un CLV medio positivo en una muestra grande indica que el modelo se adelanta al mercado. No es garantía de beneficio.', 'CLV = verovatnoća modela − verovatnoća zatvarajuće linije bez marže, za stranu koju model preferira. Pozitivan prosečan CLV na velikom uzorku znači da model predviđa kretanje tržišta. Nije garancija dobitka.'))}</p>
${C && C.rows.length ? `<div class="anmetrics"><div class="am"><span>${T('Αγώνες', 'Games', 'Partidos', 'Utakmice')}</span><b>${C.total.all.n}</b></div><div class="am"><span>${T('Μέσο CLV (moneyline)', 'Mean CLV (moneyline)', 'CLV medio (1X2)', 'Prosečan CLV (pobednik)')}</span><b class="${C.total.all.mean > 0 ? 'pos' : 'neg'}">${pp(C.total.all.mean)}</b></div><div class="am"><span>${T('% θετικό', '% positive', '% positivo', '% pozitivno')}</span><b>${pcO(C.total.all.pos)}</b></div></div>${C.total.all.n < 50 ? `<p class="sub"><span class="badge small">${T('μικρό δείγμα', 'small sample', 'muestra pequeña', 'mali uzorak')}</span></p>` : ''}
<h2>${T('Ανά μήνα', 'By month', 'Por mes', 'Po mesecu')}</h2>${clvT(C.byMonth, T('Μήνας', 'Month', 'Mes', 'Mesec'))}<h2>${T('Ανά ομάδα', 'By team', 'Por equipo', 'Po timu')}</h2>${clvT(C.byTeam, T('Ομάδα', 'Team', 'Equipo', 'Tim'))}` : `<p class="sub">${T('Το CLV υπολογίζεται μόλις συγκεντρωθούν αποδόσεις από αδειοδοτημένο πάροχο για αγώνες που έχουν πια παιχτεί.', 'CLV appears once odds from a licensed provider have been collected for games that have been played.', 'El CLV aparecerá cuando haya cuotas de un proveedor con licencia para partidos ya jugados.', 'CLV će se pojaviti kada se prikupe kvote licenciranog provajdera za odigrane utakmice.')}</p>`}${rgBlock()}</article>`,
        ld: crumbs([[SITE_NAME, B(LG)], ['Betting Insights', urlFor(LG, 'odds')], ['CLV', urlFor(LG, 'oddsclv')]]) });
      // εσωτερικές γραμμές PIR (χωρίς αποδόσεις)
      if (FXD) {
        const stL = { playing: T('Παίζει', 'Playing', 'Juega', 'Igra'), doubtful: T('Αμφίβολος', 'Doubtful', 'Duda', 'Neizvestan'), injured: T('Τραυματίας', 'Injured', 'Lesionado', 'Povređen'), rest: T('Ξεκούραση', 'Rest', 'Descanso', 'Odmor') };
        const riskL = { low: T('Χαμηλό', 'Low', 'Bajo', 'Nizak'), medium: T('Μέτριο', 'Medium', 'Medio', 'Srednji'), high: T('Υψηλό', 'High', 'Alto', 'Visok') };
        const rows = FXD.players.filter(p => p.pp >= 6 && p.status !== 'injured').sort((a, b) => b.pp - a.pp).slice(0, 80).map(p => {
          const line = internalLine(p.pp), over = pirOverProb(line, p.p10, p.p50, p.p90), hr = hitRate((p.h || []).slice(-10).map(x => x[2]), line), risk = minutesRisk((p.h || []).slice(-6).map(x => x[1]), p.status);
          const pl = players.find(z => z.c === p.c);
          return { p, pl, line, over, hr, risk };
        });
        await simplePage('oddspir', { view: 'lead', title: T(`Γραμμές PIR ${FXD.round}ης αγωνιστικής EuroLeague: projected PIR και Over/Under | ${SITE_NAME}`, `EuroLeague round ${FXD.round} PIR lines: projected PIR and over/under | ${SITE_NAME}`, `Líneas de PIR jornada ${FXD.round} EuroLeague: PIR proyectado y más/menos | ${SITE_NAME}`, `PIR linije ${FXD.round}. kola Evrolige: projektovani PIR i više/manje | ${SITE_NAME}`),
          desc: T('Εσωτερικές στατιστικές γραμμές PIR για κάθε παίκτη: projected PIR, εύρος P10-P90, πιθανότητα Over/Under, ποσοστό επιτυχίας σε παρόμοιες γραμμές και ρίσκο λεπτών. Χωρίς σύνδεση με αποδόσεις.', 'Internal statistical PIR lines for every player: projected PIR, P10–P90 range, over/under probability, hit rate at similar lines and minutes risk. Not linked to real odds.', 'Líneas estadísticas internas de PIR: PIR proyectado, rango P10–P90, probabilidad más/menos, acierto en líneas similares y riesgo de minutos. Sin cuotas reales.', 'Interne statističke PIR linije: projektovani PIR, raspon P10–P90, verovatnoća više/manje, uspešnost na sličnim linijama i rizik minuta. Bez stvarnih kvota.'),
          main: `<article class="article lead wide anpage oddspage"><p class="crumbs"><a href="${urlFor(LG, 'odds')}">Betting Insights</a> · <a href="${urlFor(LG, 'fx:projections')}">Fantasy projections</a></p><h1>${T(`Γραμμές PIR · ${FXD.round}η αγωνιστική`, `PIR lines · Round ${FXD.round}`, `Líneas de PIR · Jornada ${FXD.round}`, `PIR linije · ${FXD.round}. kolo`)}</h1>
<p class="lede2">${esc(T('Εσωτερικές στατιστικές γραμμές από το μοντέλο PIR του Fantasy, χωρίς σύνδεση με πραγματικές αποδόσεις: π.χ. «Projected PIR: 16,4 | Internal Over/Under: 15,5». Πιθανότητα Over από το εύρος P10-P50-P90 της πρόβλεψης.', 'Internal statistical lines from the Fantasy PIR model, not linked to real odds: e.g. “Projected PIR: 16.4 | Internal Over/Under: 15.5”. Over probability from the forecast’s P10–P50–P90 range.', 'Líneas estadísticas internas del modelo de PIR del Fantasy, sin cuotas reales: p. ej. «PIR proyectado: 16,4 | Más/Menos interno: 15,5».', 'Interne statističke linije iz Fantasy PIR modela, bez stvarnih kvota: npr. „Projektovani PIR: 16,4 | Interna linija: 15,5”.'))}</p>
<div class="tbl"><table class="antbl sortable"><thead><tr><th class="l">${T('Παίκτης', 'Player', 'Jugador', 'Igrač')}</th><th data-k>Projected PIR</th><th data-k>${T('Γραμμή', 'Line', 'Línea', 'Linija')}</th><th data-k>P(Over)</th><th data-k>P(Under)</th><th>P10–P90</th><th data-k>${T('Over στους 10 τελευταίους', 'Over in last 10', 'Más en últimos 10', 'Više u posl. 10')}</th><th>${T('Ρίσκο λεπτών', 'Minutes risk', 'Riesgo de minutos', 'Rizik minuta')}</th><th>${T('Κατάσταση', 'Status', 'Estado', 'Status')}</th></tr></thead><tbody>${rows.map(x => `<tr><td class="l">${x.pl ? `<a href="${urlFor(LG, 'player:' + x.pl.s)}">${esc(niceName(x.p.n))}</a>` : esc(niceName(x.p.n))} <small>${esc(tName(x.p.t))} · ${x.p.home ? 'vs' : '@'} ${esc(tName(x.p.opp))}</small></td><td data-v="${x.p.pp}"><b>${x.p.pp.toFixed(1)}</b></td><td data-v="${x.line}">${x.line.toFixed(1)}</td><td data-v="${x.over}">${pcO(x.over)}</td><td data-v="${1 - x.over}">${pcO(1 - x.over)}</td><td>${x.p.p10.toFixed(0)}–${x.p.p90.toFixed(0)}</td><td data-v="${x.hr ?? ''}">${x.hr == null ? '–' : pcO(x.hr)}</td><td class="net ${x.risk === 'low' ? 'pos' : x.risk === 'high' ? 'neg' : 'neu'}">${riskL[x.risk]}</td><td>${esc(stL[x.p.status] || x.p.status || '')}</td></tr>`).join('')}</tbody></table></div>
<p class="sub">${T('Δεν υπάρχουν PIR props από τον πάροχο· αν προστεθούν, εδώ θα εμφανιστούν και implied probability και model edge.', 'There are no PIR props from the provider; if added, implied probability and model edge will appear here.', 'El proveedor no ofrece props de PIR; si se añaden, aparecerán aquí la probabilidad implícita y la ventaja.', 'Provajder nema PIR props; ako se dodaju, ovde će se pojaviti implicitna verovatnoća i prednost modela.')}</p>${rgBlock()}</article><script type="module" src="${BASE}assets/analytics/ui.js?v=${ver}"></script>`,
          ld: crumbs([[SITE_NAME, B(LG)], ['Betting Insights', urlFor(LG, 'odds')], ['PIR', urlFor(LG, 'oddspir')]]) });
      }
    }
    // ---- Shot Charts & Scoring Zones
    const GN = { rim: 'Rim', paint: 'Paint', mid: 'Mid-range', corner3: T('Τρίποντα γωνίας', 'Corner threes', 'Triples de esquina', 'Trojke iz ugla'), wing3: T('Τρίποντα wing', 'Wing threes', 'Triples laterales', 'Trojke sa krila'), top3: 'Top of the key 3' };
    const pcS = v => (v == null ? '–' : Math.round(100 * v) + '%');
    const shCfg = o => `<div id="shotApp"><script type="application/json" class="shj">${JSON.stringify({ ...o, avg: BASE + 'api/shot-zones/league-averages.json' }).replace(/</g, '\\u003c')}</script><p class="sub">…</p></div><script type="module" src="${BASE}assets/shots/ui.js?v=${ver}"></script>`;
    const shMeth = `<details class="anmeth"><summary>${T('Μεθοδολογία', 'Methodology', 'Metodología', 'Metodologija')}</summary><p>${esc(T('Συντεταγμένες από τα επίσημα δεδομένα σουτ της EuroLeague (εκατοστά, καλάθι στο 0,0). Αν ένα σουτ είναι 2π ή 3π το ορίζει ο επίσημος τύπος του, όχι η θέση. Ζώνες: rim ≤1,25 m από το καλάθι, paint = υπόλοιπη ρακέτα, mid-range = υπόλοιπα δίποντα, τρίποντα γωνίας, wing και top of the key (±22,5° από τον άξονα). Assisted = η ασίστ καταγράφεται αμέσως μετά το καλάθι στο play-by-play. Το αμυντικό προφίλ ενός παίκτη μετρά τα σουτ των αντιπάλων όσο εκείνος είναι στο παρκέ, γιατί η πηγή δεν δίνει τον προσωπικό αμυντικό. Η πηγή δεν δίνει επίσης catch-and-shoot / pull-up. Σουτ χωρίς συντεταγμένες μετρούν στα σύνολα αλλά δεν εμφανίζονται στο γήπεδο. Οι βολές δεν έχουν θέση.', 'Coordinates come from the official EuroLeague shot data (centimetres, basket at 0,0). Whether a shot is a 2 or a 3 comes from its official type, not its location. Zones: rim ≤1.25 m from the basket, paint = rest of the lane, mid-range = other twos, corner, wing and top-of-the-key threes (±22.5° from the axis). Assisted = the assist is logged right after the basket in the play-by-play. A player\'s defensive profile counts opponent shots while he is on court, because the source has no individual defender. The source has no catch-and-shoot / pull-up tag either. Shots without coordinates count in totals but are not drawn. Free throws have no location.', 'Coordenadas de los datos oficiales de tiro de la EuroLeague (centímetros, aro en 0,0). Si un tiro es de 2 o de 3 lo decide su tipo oficial, no la posición. Zonas: aro ≤1,25 m, zona = resto de la pintura, media distancia = resto de tiros de 2, triples de esquina, laterales y frontales (±22,5°). Asistido = la asistencia se registra justo después de la canasta en el play-by-play. El perfil defensivo de un jugador cuenta los tiros rivales mientras está en pista, porque la fuente no indica el defensor directo. Tampoco distingue catch-and-shoot / pull-up. Los tiros sin coordenadas cuentan en los totales pero no se dibujan. Los tiros libres no tienen posición.', 'Koordinate iz zvaničnih podataka o šutevima Evrolige (centimetri, koš u 0,0). Da li je šut za 2 ili 3 određuje njegov zvanični tip, ne pozicija. Zone: ispod koša ≤1,25 m, reket = ostatak reketa, poludistanca = ostali šutevi za 2, trojke iz ugla, sa krila i sa vrha (±22,5°). Asistiran = asistencija je zabeležena odmah posle koša. Odbrambeni profil igrača broji šuteve protivnika dok je on na terenu, jer izvor ne daje direktnog čuvara. Izvor ne razlikuje ni catch-and-shoot / pull-up. Šutevi bez koordinata se računaju u zbiru ali se ne crtaju. Slobodna bacanja nemaju poziciju.'))}</p></details>`;
    const groupTable = (g, la, showPct = true) => `<div class="tbl"><table class="antbl"><thead><tr><th class="l">Zone</th><th>FGM/FGA</th><th>FG%</th><th>${T('μ.ό. λίγκας', 'League avg', 'Media liga', 'Prosek lige')}</th><th>${T('Πόντοι/σουτ', 'Pts/shot', 'Pts/tiro', 'Poena/šut')}</th><th>${T('Μερίδιο', 'Share', 'Cuota', 'Udeo')}</th><th>Assisted</th>${showPct ? `<th>${T('Εκατοστημόριο', 'Percentile', 'Percentil', 'Percentil')}</th>` : ''}</tr></thead><tbody>${Object.keys(GN).map(k => { const v = g[k], a = la?.[k]; if (!v || !v.fga) return ''; const d = v.fg != null && a?.fg != null ? v.fg - a.fg : null; return `<tr><td class="l">${esc(GN[k])}</td><td>${v.fgm}/${v.fga}</td><td class="net ${d == null || v.fga < 5 ? '' : d > 0.03 ? 'pos' : d < -0.03 ? 'neg' : 'neu'}">${pcS(v.fg)}</td><td>${pcS(a?.fg)}</td><td>${v.pps?.toFixed(2) ?? '–'}</td><td>${pcS(v.share)}</td><td>${pcS(v.astPct)}</td>${showPct ? `<td>${v.pct ?? '–'}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
    const crTable = c => `<ul class="mckm"><li><b>${T('Εύστοχα με ασίστ', 'Made shots assisted', 'Canastas asistidas', 'Pogoci posle asistencije')}:</b> ${c.assisted}/${c.made} (${pcS(c.astPct)})${c.ast3Pct != null ? ` · ${T('τρίποντα', 'threes', 'triples', 'trojke')} ${pcS(c.ast3Pct)}` : ''}</li><li><b>Self-created:</b> ${c.unassisted} ${T('καλάθια', 'baskets', 'canastas', 'koševa')}, ${c.ptsSelf} ${T('πόντοι', 'points', 'puntos', 'poena')} · assisted ${c.ptsAssisted} ${T('πόντοι', 'points', 'puntos', 'poena')}</li>${['fastbreak', 'secondChance', 'halfcourt'].map(k => c[k] ? `<li><b>${{ fastbreak: 'Fastbreak', secondChance: T('Δεύτερη ευκαιρία', 'Second chance', 'Segunda oportunidad', 'Druga šansa'), halfcourt: T('Στημένη επίθεση', 'Half-court', 'Ataque posicional', 'Postavljeni napad') }[k]}:</b> ${c[k].fgm}/${c[k].fga} · FG ${pcS(c[k].fg)} · PPS ${c[k].pps.toFixed(2)}</li>` : '').join('')}</ul>`;
    const defTable = (d, la) => d ? `<ul class="mckm"><li><b>Rim protection:</b> ${T('οι αντίπαλοι σουτάρουν', 'opponents shoot', 'los rivales tiran', 'protivnici šutiraju')} ${pcS(d.rim.fg)} ${T('στο καλάθι', 'at the rim', 'en el aro', 'ispod koša')} (${T('μ.ό.', 'avg', 'media', 'pros.')} ${pcS(la?.rim?.fg)}), ${pcS(d.rim.freq)} ${T('των σουτ τους', 'of their shots', 'de sus tiros', 'njihovih šuteva')}</li><li><b>${T('Άμυνα τριπόντου', 'Three-point defense', 'Defensa del triple', 'Odbrana trojke')}:</b> ${pcS(d.three.fg)} (${T('μ.ό.', 'avg', 'media', 'pros.')} ${pcS(la ? (() => { const g = la; const m = ['corner3', 'wing3', 'top3'].reduce((s, k) => s + g[k].fgm, 0), a = ['corner3', 'wing3', 'top3'].reduce((s, k) => s + g[k].fga, 0); return a ? m / a : null; })() : null)}), ${pcS(d.three.freq)} ${T('των σουτ', 'of shots', 'de los tiros', 'šuteva')}</li><li><b>${T('Πόντοι ανά σουτ αντιπάλων', 'Opponent points per shot', 'Puntos por tiro rival', 'Poena po šutu protivnika')}:</b> ${d.pps?.toFixed(2) ?? '–'} · ${d.fga} ${T('σουτ', 'shots', 'tiros', 'šuteva')}</li></ul>${groupTable(d.zones, la, false)}` : '';
    const shLA = s => SHLA?.[s]?.groups;
    // παίκτες EuroLeague
    for (const p of players) {
      const pr = SHP[p.c]; if (!pr || pr.n < 10) continue;
      const n = niceName(p.n), tn = tName(p.t.split(';').pop());
      const sent = shDescribe(pr.groups, pr.creation, T);
      const asl = pr.assisters.slice(0, 5).map(x => { const q = players.find(z => z.c === x.id); return `${q ? `<a href="${urlFor(LG, 'player:' + q.s)}">${esc(niceName(q.n))}</a>` : esc(x.id)} (${x.n})`; }).join(', ');
      await simplePage('shp:' + p.s, { view: 'lead', title: T(`${n} shot chart ${S}: ζώνες, FG% ανά περιοχή | ${SITE_NAME}`, `${n} shot chart ${S}: zones and FG% by area | ${SITE_NAME}`, `${n} mapa de tiro ${S}: zonas y % por área | ${SITE_NAME}`, `${n} mapa šuteva ${S}: zone i procenat po oblastima | ${SITE_NAME}`),
        desc: (sent || T(`Όλα τα σουτ του ${n} στην ${S} σε γήπεδο, με ζώνες και σύγκριση με τη λίγκα.`, `Every ${n} shot of the ${S} on a court, with zones and league comparison.`, `Todos los tiros de ${n} en la ${S}, con zonas y comparación con la liga.`, `Svi šutevi igrača ${n} u ${S}, sa zonama i poređenjem sa ligom.`)).slice(0, 300),
        main: `<article class="article lead wide anpage shpage"><p class="crumbs"><a href="${urlFor(LG, 'player:' + p.s)}">${esc(n)}</a> · <a href="${urlFor(LG, 'sht:' + p.t.split(';').pop())}">${esc(tn)} shot chart</a></p><h1>${esc(n)}: Shot chart</h1><p class="lede2">${esc(sent)}</p>
${shCfg({ kind: 'player', player: p.c, api: `${BASE}api/players/${p.c}/shot-chart.json`, teams: Object.fromEntries(Object.keys(TEAMS).map(c => [c, tName(c)])), file: `${p.s}-shots` })}
<h2>Scoring zones</h2>${groupTable(pr.groups, shLA(SEASON))}
<h2>Assisted / self-created</h2>${crTable(pr.creation)}${asl ? `<p><b>${T('Τις περισσότερες ασίστ του δίνουν', 'Top assisters to him', 'Quién más le asiste', 'Najviše mu asistiraju')}:</b> ${asl}</p>` : ''}
${pr.defense ? `<h2>${T('Αμυντικό προφίλ (σουτ αντιπάλων με τον παίκτη στο παρκέ)', 'Defensive profile (opponent shots with him on court)', 'Perfil defensivo (tiros rivales con él en pista)', 'Odbrambeni profil (šutevi protivnika dok je na terenu)')}</h2>${defTable(pr.defense, shLA(SEASON))}` : ''}${shMeth}</article>`,
        ld: crumbs([[SITE_NAME, B(LG)], [n, urlFor(LG, 'player:' + p.s)], ['Shot chart', urlFor(LG, 'shp:' + p.s)]]) });
    }
    // ομάδες EuroLeague και EuroCup
    for (const [cp, PROF, ssn] of [['E', SHT, SEASON], ['U', SHTU, ECS]]) for (const [c, pr] of Object.entries(PROF)) {
      if (cp === 'E' && !TEAMS[c]) continue;
      const ET = data.ec?.teams || {}, ecSl = slugify(ET[c] ? ET[c][0] : c);
      const nm = cp === 'E' ? tName(c) : ((LG === 'el' && { ARI: 'Άρης', PAO: 'ΠΑΟΚ' }[c]) || (ET[c] ? ET[c][1] : c));
      const key = cp === 'E' ? 'sht:' + c : 'shtu:' + ecSl;
      const la = shLA(ssn), gs = Object.entries(pr.groups).filter(([, v]) => v.fga >= 30 && v.fg != null && la?.[0] !== null).map(([k, v]) => [k, v.fg - (la?.[k]?.fg ?? v.fg)]).sort((a, b) => b[1] - a[1]);
      const best = gs.slice(0, 2).map(([k]) => GN[k]), worst = gs.slice(-2).reverse().map(([k]) => GN[k]);
      const sh3 = ['corner3', 'wing3', 'top3'].reduce((s, k) => s + pr.groups[k].share, 0);
      const intro = T(`${nm}: ${pcS(sh3)} των σουτ είναι τρίποντα, ${pcS(pr.groups.rim.share)} στο καλάθι (rim pressure) και ${pcS(pr.groups.mid.share)} mid-range. Το ${pcS(pr.creation.astPct)} των καλαθιών έρχεται από ασίστ.${best.length ? ` Καλύτερες ζώνες σε σχέση με τη λίγκα: ${best.join(', ')}· πιο αδύναμες: ${worst.join(', ')}.` : ''}`,
        `${nm}: ${pcS(sh3)} of shots are threes, ${pcS(pr.groups.rim.share)} at the rim and ${pcS(pr.groups.mid.share)} mid-range. ${pcS(pr.creation.astPct)} of baskets are assisted.${best.length ? ` Best zones vs the league: ${best.join(', ')}; weakest: ${worst.join(', ')}.` : ''}`,
        `${nm}: el ${pcS(sh3)} de los tiros son triples, el ${pcS(pr.groups.rim.share)} en el aro y el ${pcS(pr.groups.mid.share)} de media distancia. El ${pcS(pr.creation.astPct)} de las canastas son asistidas.${best.length ? ` Mejores zonas frente a la liga: ${best.join(', ')}; peores: ${worst.join(', ')}.` : ''}`,
        `${nm}: ${pcS(sh3)} šuteva su trojke, ${pcS(pr.groups.rim.share)} ispod koša i ${pcS(pr.groups.mid.share)} sa poludistance. ${pcS(pr.creation.astPct)} koševa je posle asistencije.${best.length ? ` Najbolje zone u odnosu na ligu: ${best.join(', ')}; najslabije: ${worst.join(', ')}.` : ''}`);
      const net = pr.network.slice(0, 8).map(e => `<li>${esc(niceName((players.find(z => z.c === e.from)?.n) || (data.ec?.players || []).find(z => z.c === e.from)?.n || e.from))} → ${esc(niceName((players.find(z => z.c === e.to)?.n) || (data.ec?.players || []).find(z => z.c === e.to)?.n || e.to))}: <b>${e.n}</b></li>`).join('');
      const teamsJ = cp === 'E' ? Object.fromEntries(Object.keys(TEAMS).map(x => [x, tName(x)])) : Object.fromEntries(Object.entries(ET).map(([x, v]) => [x, v[1]]));
      await simplePage(key, { view: 'lead', title: T(`${nm} shot chart ${cp === 'E' ? S : 'EuroCup ' + SEASON_LABEL}: ζώνες, τρίποντα, rim pressure | ${SITE_NAME}`, `${nm} shot chart ${cp === 'E' ? S : 'EuroCup ' + SEASON_LABEL}: zones, threes, rim pressure | ${SITE_NAME}`, `${nm} mapa de tiro ${cp === 'E' ? S : 'EuroCup ' + SEASON_LABEL}: zonas, triples, presión al aro | ${SITE_NAME}`, `${nm} mapa šuteva ${cp === 'E' ? S : 'Evrokup ' + SEASON_LABEL}: zone, trojke, pritisak na koš | ${SITE_NAME}`),
        desc: intro.slice(0, 300),
        main: `<article class="article lead wide anpage shpage"><p class="crumbs"><a href="${cp === 'E' ? urlFor(LG, 'team:' + c) : urlFor(LG, 'ec:' + ecSl)}">${esc(nm)}</a></p><h1>${esc(nm)}: Shot chart</h1><p class="lede2">${esc(intro)}</p>
${shCfg({ kind: 'team', api: `${BASE}api/${cp === 'U' ? 'eurocup/' : ''}teams/${c}/shot-chart.json`, teams: teamsJ, file: `${c}-shots` })}
<h2>${T('Αποδοτικότητα ανά ζώνη', 'Zone efficiency', 'Eficiencia por zona', 'Efikasnost po zonama')}</h2>${groupTable(pr.groups, la, false)}
<h2>Assisted</h2>${crTable(pr.creation)}${net ? `<h3>${T('Δίκτυο ασίστ (πιο συχνοί συνδυασμοί)', 'Assist network (most frequent connections)', 'Red de asistencias (conexiones más frecuentes)', 'Mreža asistencija (najčešće veze)')}</h3><ul class="mckm">${net}</ul>` : ''}
<h2>${T('Αμυντικό προφίλ (σουτ αντιπάλων)', 'Defensive profile (opponent shots)', 'Perfil defensivo (tiros rivales)', 'Odbrambeni profil (šutevi protivnika)')}</h2>${defTable(pr.defense, la)}${shMeth}</article>`,
        ld: crumbs([[SITE_NAME, B(LG)], [nm, cp === 'E' ? urlFor(LG, 'team:' + c) : urlFor(LG, 'ec:' + ecSl)], ['Shot chart', urlFor(LG, key)]]) });
    }
    // ---- hub /shot-charts/
    if (SH?.[SEASON]) {
      const laZ = SHLA[SEASON]?.zones, laG = SHLA[SEASON]?.groups;
      const order = league.stand.map(s => s[1]).filter(c => SHT[c] && TEAMS[c]);
      const MINS = { rim: 25, paint: 25, mid: 20, corner3: 8, wing3: 20, top3: 10 };
      const lead = k => Object.entries(SHP).filter(([id, p]) => p.groups?.[k]?.fga >= MINS[k] && players.find(x => x.c === id)).sort((a, b) => b[1].groups[k].fg - a[1].groups[k].fg).slice(0, 5);
      const pl = id => players.find(x => x.c === id);
      const selfC = Object.entries(SHP).filter(([id, p]) => p.creation && pl(id)).sort((a, b) => b[1].creation.ptsSelf - a[1].creation.ptsSelf).slice(0, 5);
      const lastR = Math.max(0, ...SH[SEASON].games.map(g => (league.games.find(x => x[2] === g.h && x[3] === g.a && x[6]) || [0])[0]));
      const lastGames = SH[SEASON].games.map(g => [league.games.find(x => x[2] === g.h && x[3] === g.a && x[6]), g]).filter(([x]) => x && x[0] === lastR);
      const ecT = data.ec?.teams || {};
      await simplePage('shots', { view: 'lead', title: T(`Shot Charts EuroLeague & EuroCup ${SEASON_LABEL}: ζώνες, hot/cold, ευστοχία | ${SITE_NAME}`, `EuroLeague & EuroCup ${SEASON_LABEL} shot charts: zones, hot/cold, efficiency | ${SITE_NAME}`, `Mapas de tiro EuroLeague y EuroCup ${SEASON_LABEL}: zonas, calientes/frías, acierto | ${SITE_NAME}`, `Mape šuteva Evroliga i Evrokup ${SEASON_LABEL}: zone, vruće/hladne, preciznost | ${SITE_NAME}`),
        desc: T('Interactive shot charts για κάθε ομάδα, παίκτη και αγώνα της EuroLeague και του EuroCup: ευστοχία ανά ζώνη, hot/cold zones, assisted σουτ και αμυντικό προφίλ.', 'Interactive shot charts for every EuroLeague and EuroCup team, player and game: efficiency by zone, hot/cold zones, assisted shots and defensive profiles.', 'Mapas de tiro interactivos de cada equipo, jugador y partido de la EuroLeague y la EuroCup: acierto por zona, zonas calientes/frías, tiros asistidos y perfil defensivo.', 'Interaktivne mape šuteva za svaki tim, igrača i utakmicu Evrolige i Evrokupa: preciznost po zonama, vruće/hladne zone, asistirani šutevi i odbrambeni profil.'),
        main: `<article class="article lead wide anpage shpage"><h1>Shot Charts ${SEASON_LABEL}</h1><p class="lede2">${esc(T(`${SH[SEASON].shots.length.toLocaleString('el-GR')} σουτ EuroLeague${SH[ECS] ? ` και ${SH[ECS].shots.length.toLocaleString('el-GR')} EuroCup` : ''} με τις πραγματικές τους θέσεις στο γήπεδο. Κόκκινο = πάνω από τον μέσο όρο της λίγκας, μπλε = κάτω.`, `${SH[SEASON].shots.length.toLocaleString('en-GB')} EuroLeague${SH[ECS] ? ` and ${SH[ECS].shots.length.toLocaleString('en-GB')} EuroCup` : ''} shots at their real court locations. Red = above league average, blue = below.`, `${SH[SEASON].shots.length.toLocaleString('es-ES')} tiros de EuroLeague${SH[ECS] ? ` y ${SH[ECS].shots.length.toLocaleString('es-ES')} de EuroCup` : ''} en su posición real. Rojo = por encima de la media, azul = por debajo.`, `${SH[SEASON].shots.length.toLocaleString('sr-Latn-RS')} šuteva Evrolige${SH[ECS] ? ` i ${SH[ECS].shots.length.toLocaleString('sr-Latn-RS')} Evrokupa` : ''} na stvarnim pozicijama. Crveno = iznad proseka lige, plavo = ispod.`))}</p>
<h2>EuroLeague: ${T('ομάδες', 'teams', 'equipos', 'timovi')}</h2><div class="shgrid">${order.map(c => shPromo(urlFor(LG, 'sht:' + c), SHT[c].zones, laZ, tName(c), teamShotLine(SHT[c], laG))).join('')}</div>
<h2>${T('Κορυφαίοι ανά ζώνη', 'Zone leaders', 'Líderes por zona', 'Lideri po zonama')}</h2><div class="leadgrid">${Object.keys(MINS).map(k => `<div><h3>${esc(GN[k])}</h3><ol class="leadol">${lead(k).map(([id, p]) => `<li><a href="${urlFor(LG, 'shp:' + pl(id).s)}">${esc(niceName(pl(id).n))}</a> <small>${esc(tName(pl(id).t.split(';').pop()))} · ${p.groups[k].fgm}/${p.groups[k].fga}</small><b>${pcS(p.groups[k].fg)}</b></li>`).join('')}</ol><p class="sub">${T('ελάχ.', 'min.', 'mín.', 'min.')} ${MINS[k]} ${T('σουτ', 'shots', 'tiros', 'šuteva')} · ${T('μ.ό.', 'avg', 'media', 'pros.')} ${pcS(laG?.[k]?.fg)}</p></div>`).join('')}
<div><h3>Self-created</h3><ol class="leadol">${selfC.map(([id, p]) => `<li><a href="${urlFor(LG, 'shp:' + pl(id).s)}">${esc(niceName(pl(id).n))}</a> <small>${esc(tName(pl(id).t.split(';').pop()))}</small><b>${p.creation.ptsSelf}</b></li>`).join('')}</ol><p class="sub">${T('πόντοι από καλάθια χωρίς ασίστ', 'points from unassisted baskets', 'puntos en canastas sin asistencia', 'poeni iz koševa bez asistencije')}</p></div></div>
${lastGames.length ? `<h2>${T(`Αγώνες της ${lastR}ης αγωνιστικής`, `Round ${lastR} games`, `Partidos de la jornada ${lastR}`, `Utakmice ${lastR}. kola`)}</h2><ul class="mckm">${lastGames.map(([x, g]) => `<li><a href="${urlFor(LG, `shg:${x[0]}|${g.h}|${g.a}`)}">${esc(tName(g.h))} – ${esc(tName(g.a))} ${g.hs}-${g.as}</a></li>`).join('')}</ul>` : ''}
${Object.keys(SHTU).length ? `<h2>EuroCup</h2><div class="shgrid sm">${Object.keys(SHTU).sort((a, b) => String(ecT[a]?.[1] || a).localeCompare(String(ecT[b]?.[1] || b))).map(c => shPromo(urlFor(LG, 'shtu:' + slugify(ecT[c] ? ecT[c][0] : c)), SHTU[c].zones, SHLA[ECS]?.zones, (LG === 'el' && { ARI: 'Άρης', PAO: 'ΠΑΟΚ' }[c]) || ecT[c]?.[1] || c, '')).join('')}</div>` : ''}
<h2>${T('Μέσοι όροι λίγκας', 'League averages', 'Medias de la liga', 'Proseci lige')}</h2>${groupTable(laG, laG, false)}${shMeth}</article>`,
        ld: crumbs([[SITE_NAME, B(LG)], ['Shot Charts', urlFor(LG, 'shots')]]) });
    }
    // αγώνες EuroLeague που έχουν παιχτεί
    if (SH?.[SEASON]) for (const g of SH[SEASON].games) {
      const lg = league.games.find(x => x[2] === g.h && x[3] === g.a && x[6]); if (!lg || !TEAMS[g.h] || !TEAMS[g.a]) continue;
      const vs = `${tName(g.h)} – ${tName(g.a)}`, key = `shg:${lg[0]}|${g.h}|${g.a}`;
      await simplePage(key, { view: 'lead', title: T(`${vs} ${g.hs}-${g.as}: shot chart αγώνα | ${SITE_NAME}`, `${vs} ${g.hs}-${g.as}: game shot chart | ${SITE_NAME}`, `${vs} ${g.hs}-${g.as}: mapa de tiro del partido | ${SITE_NAME}`, `${vs} ${g.hs}-${g.as}: mapa šuteva utakmice | ${SITE_NAME}`),
        desc: T(`Όλα τα σουτ του ${vs} (${g.hs}-${g.as}) σε γήπεδο: ανά ομάδα, παίκτη και περίοδο, momentum και τα κρίσιμα σουτ.`, `Every shot of ${vs} (${g.hs}-${g.as}) on a court: by team, player and quarter, momentum and key shots.`, `Todos los tiros del ${vs} (${g.hs}-${g.as}): por equipo, jugador y cuarto, momentum y tiros clave.`, `Svi šutevi utakmice ${vs} (${g.hs}-${g.as}): po timu, igraču i četvrtini, momentum i ključni šutevi.`),
        main: `<article class="article lead wide anpage shpage"><p class="crumbs"><a href="${urlFor(LG, `game:${lg[0]}|${g.h}|${g.a}`)}">${esc(vs)} ${g.hs}-${g.as}</a></p><h1>${esc(vs)}: Shot chart</h1>
${shCfg({ kind: 'game', api: `${BASE}api/games/${SEASON}-${g.gc}/shot-chart.json`, teams: Object.fromEntries(Object.keys(TEAMS).map(c => [c, tName(c)])), gameTeams: [g.h, g.a], file: `${g.h}-${g.a}-${lg[0]}-shots` })}${shMeth}</article>`,
        ld: crumbs([[SITE_NAME, B(LG)], [vs, urlFor(LG, `game:${lg[0]}|${g.h}|${g.a}`)], ['Shot chart', urlFor(LG, key)]]) });
    }
    // σελίδες αγώνων: μία για κάθε αγώνα της σεζόν
    const LOC = { el: 'el-GR', en: 'en-GB', es: 'es-ES', sr: 'sr-Latn-RS' }[LG];
    const gDateB = s => new Date(Date.UTC(2020 + (+s[8]), +s.slice(0, 2) - 1, +s.slice(2, 4), +s.slice(4, 6), +s.slice(6, 8)));
    const rdTxt = r => T(`${r}η αγωνιστική`, `Round ${r}`, `Jornada ${r}`, `${r}. kolo`);
    // ---- κείμενο προεπισκόπησης / σύνοψης για κάθε αγώνα (στατικό, για να το διαβάζει και το Google)
    const MP = teamModel(players);
    const standRow = Object.fromEntries(league.stand.map(x => [x[1], x]));
    const formOf = (c, before) => league.games.filter(g => g[6] && (g[2] === c || g[3] === c) && g[0] < before).slice(-5)
      .map(g => ((g[2] === c ? g[4] > g[5] : g[5] > g[4]) ? T('Ν', 'W', 'V', 'P') : T('Η', 'L', 'D', 'I'))).join('');
    const posTxt = c => { const x = standRow[c]; return x ? T(`θέση ${x[0]}, ρεκόρ ${x[2]}-${x[3]}`, `${ordEn(x[0])} place, ${x[2]}-${x[3]}`, `${x[0]}.º, balance ${x[2]}-${x[3]}`, `${x[0]}. mesto, skor ${x[2]}-${x[3]}`) : ''; };
    const injOf = c => players.filter(p => p.t.split(';').pop() === c && INJ[LG][p.c]).map(p => niceName(p.n));
    const bestOf = c => players.filter(p => p.t.split(';').pop() === c).map(p => ({ p, s: playerSummary(p) })).filter(x => x.s.G >= 2 && !INJ[LG][x.p.c]).sort((a, b) => b.s.pir - a.s.pir)[0];
    const lst = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + T(' και ', ' and ', ' y ', ' i ') + a[a.length - 1];
    function previewText(g, H, A, dt) {
      const [r, , h, a, hs, as, pl] = g;
      const P = [];
      if (pl) {
        const W = hs > as ? H : A, L = hs > as ? A : H;
        P.push(T(`Τελικό: ${H} – ${A} ${hs}-${as} (${rdTxt(r)}, ${S}). Νικητής: ${W}.`, `Final: ${H} ${hs}-${as} ${A} (${S}, ${rdTxt(r)}). ${W} beat ${L}.`, `Final: ${H} ${hs}-${as} ${A} (${S}, ${rdTxt(r).toLowerCase()}). Ganador: ${W}.`, `Konačan rezultat: ${H} - ${A} ${hs}:${as} (${S}, ${rdTxt(r)}). Pobednik: ${W}.`));
        const box = players.flatMap(p => p.g.filter(x => x[0] === r && (p.t.split(';').includes(h) || p.t.split(';').includes(a)) && (x[2] === h || x[2] === a)).map(x => ({ p, x }))).sort((u, v) => v.x[25] - u.x[25]);
        const m = box[0];
        if (m) { const tm = m.x[2] === h ? A : H; P.push(T(`Κορυφαίος του αγώνα: ${niceName(m.p.n)} (${tm}) με ${m.x[8]} πόντους, ${m.x[15] + m.x[16]} ριμπάουντ, ${m.x[17]} ασίστ και ${m.x[25]} PIR.`, `Top performer: ${niceName(m.p.n)} (${tm}) with ${m.x[8]} points, ${m.x[15] + m.x[16]} rebounds, ${m.x[17]} assists and ${m.x[25]} PIR.`, `El mejor del partido fue ${niceName(m.p.n)} (${tm}), con ${m.x[8]} puntos, ${m.x[15] + m.x[16]} rebotes, ${m.x[17]} asistencias y ${m.x[25]} de PIR.`, `Najbolji igrač utakmice: ${niceName(m.p.n)} (${tm}) sa ${m.x[8]} poena, ${m.x[15] + m.x[16]} skokova, ${m.x[17]} asistencija i ${m.x[25]} PIR-a.`)); }
        return P;
      }
      P.push(T(`Ο αγώνας ${H} – ${A} για την ${rdTxt(r)} της ${S} γίνεται ${dt} (ώρα Ελλάδας)${VENUE[`${r}|${h}|${a}`] ? `, γήπεδο: ${VENUE[`${r}|${h}|${a}`]}` : ''}.`, `${H} vs ${A}: the ${S} ${rdTxt(r)} game tips off ${dt} (Athens time)${VENUE[`${r}|${h}|${a}`] ? ` at ${VENUE[`${r}|${h}|${a}`]}` : ''}.`, `${H} - ${A}: el partido de la ${rdTxt(r).toLowerCase()} de la ${S} se juega el ${dt} (hora de Atenas)${VENUE[`${r}|${h}|${a}`] ? ` en ${VENUE[`${r}|${h}|${a}`]}` : ''}.`, `${H} - ${A}: utakmica ${rdTxt(r)} ${S} igra se ${dt} (po atinskom vremenu)${VENUE[`${r}|${h}|${a}`] ? `, ${VENUE[`${r}|${h}|${a}`]}` : ''}.`));
      const fh = formOf(h, r), fa = formOf(a, r);
      if (posTxt(h) || posTxt(a)) P.push(T(`${H}: ${posTxt(h)}${fh ? `, φόρμα ${fh}` : ''}. ${A}: ${posTxt(a)}${fa ? `, φόρμα ${fa}` : ''}.`, `${H}: ${posTxt(h)}${fh ? `, form ${fh}` : ''}. ${A}: ${posTxt(a)}${fa ? `, form ${fa}` : ''}.`, `${H}: ${posTxt(h)}${fh ? `, racha ${fh}` : ''}. ${A}: ${posTxt(a)}${fa ? `, racha ${fa}` : ''}.`, `${H}: ${posTxt(h)}${fh ? `, forma ${fh}` : ''}. ${A}: ${posTxt(a)}${fa ? `, forma ${fa}` : ''}.`));
      const mk = MPK[`E|${r}|${h}|${a}`];
      const x = mk ? { ph: mk.hs, pa: mk.as, prob: mk.p_home } : MP.predict(h, a);
      if (x) { const fav = x.prob >= 0.5 ? H : A, pr = Math.round(Math.max(x.prob, 1 - x.prob) * 100); P.push(T(`Το μοντέλο μας εκτιμά σκορ ${Math.round(x.ph)}-${Math.round(x.pa)}. Φαβορί: ${fav}, με πιθανότητα νίκης ${pr}%.`, `Our model projects ${Math.round(x.ph)}-${Math.round(x.pa)}. Favourite: ${fav}, with a ${pr}% chance to win.`, `Nuestro modelo estima un ${Math.round(x.ph)}-${Math.round(x.pa)}. Favorito: ${fav}, con un ${pr}% de probabilidad de ganar.`, `Naš model procenjuje ${Math.round(x.ph)}:${Math.round(x.pa)}. Favorit: ${fav}, sa ${pr}% šanse za pobedu.`)); }
      const bh = bestOf(h), ba = bestOf(a);
      if (bh && ba) P.push(T(`Παίκτες που ξεχωρίζουν: ${niceName(bh.p.n)} (${f1(bh.s.pts)} πόντοι, ${f1(bh.s.pir)} PIR) και ${niceName(ba.p.n)} (${f1(ba.s.pts)} πόντοι, ${f1(ba.s.pir)} PIR).`, `Players to watch: ${niceName(bh.p.n)} (${f1(bh.s.pts)} points, ${f1(bh.s.pir)} PIR) and ${niceName(ba.p.n)} (${f1(ba.s.pts)} points, ${f1(ba.s.pir)} PIR).`, `Jugadores a seguir: ${niceName(bh.p.n)} (${f1(bh.s.pts)} puntos, ${f1(bh.s.pir)} de PIR) y ${niceName(ba.p.n)} (${f1(ba.s.pts)} puntos, ${f1(ba.s.pir)} de PIR).`, `Igrači koje treba pratiti: ${niceName(bh.p.n)} (${f1(bh.s.pts)} poena, ${f1(bh.s.pir)} PIR) i ${niceName(ba.p.n)} (${f1(ba.s.pts)} poena, ${f1(ba.s.pir)} PIR).`));
      const ih = injOf(h), ia = injOf(a);
      P.push(T('Απουσίες', 'Absences', 'Bajas', 'Odsutni') + ': ' + [[H, ih], [A, ia]].map(([n, l]) => `${n}: ${l.length ? lst(l) : T('καμία γνωστή', 'none known', 'ninguna conocida', 'nema poznatih')}`).join(' · ') + '.');
      const prev = league.games.find(o => o[6] && o[0] < r && ((o[2] === a && o[3] === h) || (o[2] === h && o[3] === a)));
      if (prev) P.push(T(`Στην προηγούμενη φετινή τους συνάντηση (${rdTxt(prev[0])}): ${tName(prev[2])} – ${tName(prev[3])} ${prev[4]}-${prev[5]}.`, `Their previous meeting this season (${rdTxt(prev[0])}): ${tName(prev[2])} ${prev[4]}-${prev[5]} ${tName(prev[3])}.`, `Su anterior duelo esta temporada (${rdTxt(prev[0]).toLowerCase()}): ${tName(prev[2])} ${prev[4]}-${prev[5]} ${tName(prev[3])}.`, `Prethodni međusobni duel ove sezone (${rdTxt(prev[0])}): ${tName(prev[2])} - ${tName(prev[3])} ${prev[4]}:${prev[5]}.`));
      return P;
    }
    for (const g of league.games) {
      const [r, w, h, a, hs, as, pl] = g;
      if (!TEAMS[h] || !TEAMS[a]) continue;
      const H = tName(h), A = tName(a), d = gDateB(w);
      const dt = d.toLocaleString(LOC, { timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const vs = T(`${H} - ${A}`, `${H} vs ${A}`, `${H} - ${A}`, `${H} - ${A}`);
      const dS = d.toLocaleDateString(LOC, { timeZone: 'Europe/Athens', day: 'numeric', month: 'numeric' });
      const PV = previewText(g, H, A, dt);
      const sc = LG === 'sr' ? `${hs}:${as}` : `${hs}-${as}`;
      const title = pl
        ? T(`${vs} ${sc}: στατιστικά αγώνα (${rdTxt(r)} EuroLeague)`, `${vs} ${sc}: game stats (EuroLeague ${rdTxt(r)})`, `${vs} ${sc}: estadísticas del partido (${rdTxt(r).toLowerCase()} de la EuroLeague)`, `${vs} ${sc}: statistika utakmice (${rdTxt(r)} Evrolige)`)
        : T(`${vs} πρόβλεψη (${dS}): ώρα, απουσίες, στατιστικά | EuroLeague`, `${vs} prediction (${dS}): tip-off time, injuries, stats | EuroLeague`, `${vs} pronóstico (${dS}): horario, bajas, estadísticas | EuroLeague`, `${vs} prognoza (${dS}): satnica, povrede, statistika | Evroliga`);
      const desc = pl
        ? T(`${vs} ${sc} στην ${rdTxt(r)} της ${S}: οι κορυφαίοι του αγώνα, η φόρμα, οι τέσσερις παράγοντες και τα μεταξύ τους.`, `${vs} ${sc} in ${rdTxt(r)} of the ${S}: top performers, form, four factors and head-to-head.`, `${vs} ${sc} en la ${rdTxt(r).toLowerCase()} de la ${S}: los mejores del partido, la forma, los cuatro factores y los enfrentamientos.`, `${vs} ${sc} u ${rdTxt(r)} ${S}: najbolji igrači utakmice, forma, četiri faktora i međusobni dueli.`)
        : T(`${vs} (${dt}): εκτίμηση σκορ, πιθανότητα νίκης, φόρμα, τέσσερις παράγοντες, απουσίες και βασικοί παίκτες με τις γραμμές τους.`, `${vs} (${dt}): projected score, win probability, form, four factors, injuries and key players with their lines.`, `${vs} (${dt}): marcador estimado, probabilidad de victoria, forma, cuatro factores, bajas y jugadores clave con sus líneas.`, `${vs} (${dt}): procenjeni rezultat, verovatnoća pobede, forma, četiri faktora, povrede i ključni igrači sa linijama.`);
      const ld = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: vs, sport: 'Basketball', startDate: d.toISOString(),
        eventStatus: 'https://schema.org/EventScheduled', homeTeam: { '@type': 'SportsTeam', name: H }, awayTeam: { '@type': 'SportsTeam', name: A },
        superEvent: { '@type': 'SportsEvent', name: S }, url: SITE_URL + urlFor(LG, `game:${r}|${h}|${a}`), description: PV.join(' ') };
      const vn = VENUE[`${r}|${h}|${a}`];
      ld.location = { '@type': 'Place', name: vn || H };
      ld.endDate = new Date(d.getTime() + 2 * 3600e3).toISOString();
      ld.competitor = [{ '@type': 'SportsTeam', name: H, url: SITE_URL + urlFor(LG, 'team:' + h) }, { '@type': 'SportsTeam', name: A, url: SITE_URL + urlFor(LG, 'team:' + a) }];
      ld.homeTeam.url = ld.competitor[0].url; ld.awayTeam.url = ld.competitor[1].url;
      const hlv = VIDS.hl[`${r}|${h}|${a}`], tvs = pl ? teamVideosFor(VIDS, g) : [];
      const ytBox = (id, ttl, big) => `<div class="yt${big ? ' big' : ''}"><button type="button" class="ytb" data-yt="${esc(id)}" aria-label="${esc(T('Αναπαραγωγή', 'Play', 'Reproducir', 'Pusti') + ': ' + ttl)}"><img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="ytp" aria-hidden="true"></span></button></div>`;
      const vidSec = (hlv || tvs.length) ? `<section class="gvid"><h2>${T('Βίντεο', 'Video', 'Vídeo', 'Video')}</h2>${hlv ? `<p class="sub">${T('Τα επίσημα highlights της EuroLeague', 'Official EuroLeague highlights', 'Los highlights oficiales de la EuroLeague', 'Zvanični hajlajti Evrolige')}</p>${ytBox(hlv.id, hlv.t, 1)}` : ''}${tvs.length ? `<h3>${T('Από τα κανάλια των ομάδων', 'From the teams’ channels', 'De los canales de los equipos', 'Sa kanala timova')}</h3><div class="ytgrid">${tvs.map(v => `<figure>${ytBox(v.id, v.t)}<figcaption><span class="crest" style="background:${TEAMS[v.c][1]}">${v.c}</span> ${esc(v.t)}</figcaption></figure>`).join('')}</div>` : ''}<p class="note">${T('Τα βίντεο φορτώνουν από το YouTube μόνο όταν πατήσεις αναπαραγωγή.', 'Videos load from YouTube only when you press play.', 'Los vídeos se cargan desde YouTube solo cuando pulsas reproducir.', 'Video se učitava sa YouTube-a tek kada pritisneš pusti.')}</p></section>\n` : '';
      const main = `<article class="game">
<p class="kicker">EuroLeague · ${esc(rdTxt(r))}</p>
<h1>${esc(H)} – ${esc(A)}</h1>
<p class="lede">${esc(dt)} ${T('(ώρα Ελλάδας)', '(Athens time)', '(hora de Atenas)', '(po atinskom vremenu)')}${pl ? ` · ${T('Τελικό', 'Final', 'Final', 'Konačan rezultat')} ${sc}` : ''}</p>
${pl && SH?.[SEASON]?.games.some(x => x.h === h && x.a === a) ? `<p><a class="pread" href="${urlFor(LG, `shg:${r}|${h}|${a}`)}">Shot chart →</a></p>` : ''}
<section class="gtop" id="gTop"></section>
<section class="gprev"><h2>${pl ? T('Σύνοψη', 'Summary', 'Resumen', 'Rezime') : T('Προεπισκόπηση', 'Preview', 'Previa', 'Najava')}</h2>${PV.map(t => `<p>${esc(t)}</p>`).join('')}</section>
${pl ? '' : matchupCenter('E', MPK[`E|${r}|${h}|${a}`])}
${pl ? '' : `<section class="glive" id="gLive" hidden><div class="lq tbl"></div><div class="ll"></div><p class="note">${T('Ζωντανή ενημέρωση κάθε 30 δευτερόλεπτα από τα επίσημα στοιχεία της EuroLeague', 'Live updates every 30 seconds from official EuroLeague data', 'Actualización en vivo cada 30 segundos con los datos oficiales de la EuroLeague', 'Ažuriranje uživo na svakih 30 sekundi iz zvaničnih podataka Evrolige')}</p></section>\n`}${vidSec}<div class="gcols2">
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
      await simplePage(`game:${r}|${h}|${a}`, { view: 'game', id: `${r}|${h}|${a}`, title: `${title} | ${SITE_NAME}`, desc: (PV.slice(0, 3).join(' ').slice(0, 300) || desc), main, ld: crumbs([[SITE_NAME, B(LG)], [rdTxt(r), urlFor(LG, 'preds')], [vs, urlFor(LG, `game:${r}|${h}|${a}`)]]) });
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


    // ---- Player & Team Comparison Tool
    {
      const LBL = { G: T('Αγώνες', 'Games', 'Partidos', 'Utakmice'), mpg: T('Λεπτά/αγ.', 'Minutes/g', 'Minutos/p', 'Minuta/ut.'), pir: 'PIR', pir36: 'PIR/36', pirmin: 'PIR/min', pts: T('Πόντοι', 'Points', 'Puntos', 'Poeni'), reb: T('Ριμπάουντ', 'Rebounds', 'Rebotes', 'Skokovi'), ast: T('Ασίστ', 'Assists', 'Asistencias', 'Asistencije'), stl: T('Κλεψίματα', 'Steals', 'Robos', 'Ukradene'), blk: T('Κοψίματα', 'Blocks', 'Tapones', 'Blokade'), tov: T('Λάθη', 'Turnovers', 'Pérdidas', 'Izgubljene'), pf: T('Φάουλ', 'Fouls', 'Faltas', 'Faulovi'), fg: 'FG%', p3: '3P%', ft: 'FT%', ts: 'TS%', efg: 'eFG%', usg: 'Usage', astp: 'AST%', tovp: 'TOV%', rebp: T('Ριμπάουντ %', 'Rebound %', 'Rebote %', 'Skok %'), tsa36: 'TSA/36', ortg: 'ORtg', drtg: 'DRtg', net: 'Net Rating', avail: T('Διαθεσιμότητα', 'Availability', 'Disponibilidad', 'Dostupnost'),
        pts36: T('Πόντοι/36', 'Points/36', 'Puntos/36', 'Poeni/36'), reb36: T('Ριμπ./36', 'Reb/36', 'Reb/36', 'Sk./36'), ast36: T('ασίστ ανά 36′', 'assists per 36', 'asistencias por 36', 'asistencija na 36'), stl36: T('Κλεψ./36', 'Stl/36', 'Rob/36', 'Ukr./36'), blk36: T('Κοψ./36', 'Blk/36', 'Tap/36', 'Blok./36'), tov36: T('Λάθη/36', 'TOV/36', 'Pérd./36', 'Izg./36'), pf36: T('Φάουλ/36', 'PF/36', 'Faltas/36', 'Faul./36'),
        pts100: T('Πόντοι/100κ', 'Pts/100', 'Pts/100', 'Poeni/100'), reb100: T('Ριμπ./100κ', 'Reb/100', 'Reb/100', 'Sk./100'), ast100: T('Ασίστ/100κ', 'Ast/100', 'Asi/100', 'As./100'), stl100: T('Κλεψ./100κ', 'Stl/100', 'Rob/100', 'Ukr./100'), blk100: T('Κοψ./100κ', 'Blk/100', 'Tap/100', 'Blok./100'), tov100: T('Λάθη/100κ', 'TOV/100', 'Pérd./100', 'Izg./100'), pir100: 'PIR/100',
        wpct: T('Ποσοστό νικών', 'Win %', '% victorias', '% pobeda'), pfpg: T('Πόντοι υπέρ', 'Points for', 'Puntos a favor', 'Dati poeni'), papg: T('Πόντοι κατά', 'Points against', 'Puntos en contra', 'Primljeni poeni'), pace: 'Pace', oreb: 'OREB%', dreb: 'DREB%', ftr: 'FT rate', oefg: T('eFG% αντιπάλων', 'Opp. eFG%', 'eFG% rival', 'eFG% protivnika'), otov: T('TOV% αντιπάλων', 'Opp. TOV%', 'TOV% rival', 'TOV% protivnika'), bench: T('Πόντοι πάγκου', 'Bench points', 'Puntos del banquillo', 'Poeni klupe'), form10: T('Φόρμα 10', 'Form (10)', 'Forma (10)', 'Forma (10)') };
      const TIPS = { ...TIP, pir: T('Performance Index Rating: ο επίσημος δείκτης αξιολόγησης της EuroLeague.', 'Performance Index Rating, the EuroLeague’s official efficiency rating.', 'Índice de valoración oficial de la EuroLeague.', 'Zvanični indeks korisnosti Evrolige.'), pirmin: T('PIR ανά λεπτό συμμετοχής.', 'PIR per minute played.', 'PIR por minuto jugado.', 'PIR po odigranom minutu.'), usg: T('Ποσοστό των κατοχών της ομάδας που «τελειώνει» ο παίκτης όσο είναι στο παρκέ (σουτ, βολές, λάθη).', 'Share of team possessions a player uses while on court (shots, free throws, turnovers).', 'Porcentaje de posesiones del equipo que usa el jugador en pista.', 'Udeo poseda tima koje igrač završi dok je na terenu.'), astp: T('Ποσοστό των καλαθιών των συμπαικτών με ασίστ του, όσο είναι στο παρκέ.', 'Share of teammates’ baskets he assisted while on court.', 'Porcentaje de canastas de compañeros asistidas por él en pista.', 'Udeo koševa saigrača posle njegove asistencije.'), tovp: T('Λάθη ανά 100 «παιχνίδια» του παίκτη (σουτ + βολές + λάθη).', 'Turnovers per 100 plays (shots + free throws + turnovers).', 'Pérdidas por cada 100 jugadas propias.', 'Izgubljene lopte na 100 sopstvenih akcija.'), rebp: T('Ποσοστό των διαθέσιμων ριμπάουντ που παίρνει όσο είναι στο παρκέ.', 'Share of available rebounds grabbed while on court.', 'Porcentaje de rebotes disponibles capturados en pista.', 'Udeo dostupnih skokova dok je na terenu.'), tsa36: T('Προσπάθειες «πραγματικού» σουτ (FGA + 0,44·FTA) ανά 36′.', 'True shooting attempts (FGA + 0.44·FTA) per 36 minutes.', 'Intentos de tiro reales por 36 minutos.', 'Pravi pokušaji šuta na 36 minuta.'), avail: T('Αγώνες που αγωνίστηκε / αγώνες της ομάδας.', 'Games played / team games.', 'Partidos jugados / partidos del equipo.', 'Odigrane utakmice / utakmice tima.'), ortg: T('Πόντοι της ομάδας ανά 100 κατοχές με τον παίκτη στο παρκέ (από το play-by-play).', 'Team points per 100 possessions with him on court (play-by-play).', 'Puntos del equipo por 100 posesiones con él en pista.', 'Poeni tima na 100 poseda dok je on na terenu.'), drtg: T('Πόντοι που δέχεται η ομάδα ανά 100 κατοχές με τον παίκτη στο παρκέ.', 'Points allowed per 100 possessions with him on court.', 'Puntos recibidos por 100 posesiones con él en pista.', 'Primljeni poeni na 100 poseda dok je on na terenu.') };
      const RL = { scoring: T('Σκοράρισμα', 'Scoring', 'Anotación', 'Poentiranje'), playmaking: T('Δημιουργία', 'Playmaking', 'Creación', 'Kreiranje'), rebounding: T('Ριμπάουντ', 'Rebounding', 'Rebote', 'Skokovi'), defense: T('Άμυνα', 'Defense', 'Defensa', 'Odbrana'), efficiency: T('Αποδοτικότητα', 'Efficiency', 'Eficiencia', 'Efikasnost'), availability: T('Διαθεσιμότητα', 'Availability', 'Disponibilidad', 'Dostupnost'), versatility: T('Ευελιξία', 'Versatility', 'Versatilidad', 'Svestranost'), impact: T('Επίδραση', 'Impact', 'Impacto', 'Uticaj') };
      const RLT = { off: T('Επίθεση', 'Offense', 'Ataque', 'Napad'), def: T('Άμυνα', 'Defense', 'Defensa', 'Odbrana'), reb: T('Ριμπάουντ', 'Rebounding', 'Rebote', 'Skokovi'), ball: T('Κυκλοφορία', 'Ball movement', 'Circulación', 'Kretanje lopte'), pace: 'Pace', ft: T('Βολές', 'Free throws', 'Tiros libres', 'Slobodna bacanja'), bench: T('Πάγκος', 'Bench', 'Banquillo', 'Klupa'), form: T('Φόρμα', 'Form', 'Forma', 'Forma') };
      const teamsJ = Object.fromEntries(Object.keys(TEAMS).map(c => [c, tName(c)]));
      const pcfg = extra => `<div id="cmpApp" data-kind="players"><script type="application/json" class="cmpj">${JSON.stringify({ api: BASE + 'api/compare/players/metrics.json', embedUrl: urlFor(LG, 'cmpe'), labels: LBL, tips: TIPS, radarLabels: RL, teams: teamsJ, ...extra }).replace(/</g, '\\u003c')}</script><p class="sub">…</p></div><script type="module" src="${BASE}assets/compare/ui.js?v=${ver}"></script>`;
      const topPairs = (() => { const L = CMP.seasons[SEASON].players.filter(p => p.q).sort((a, b) => b.m.pir - a.m.pir).slice(0, 12); const out = []; for (let i = 0; i + 1 < L.length && out.length < 6; i += 2) out.push([L[i], L[i + 1]]); return out; })();
      const meth = `<details class="anmeth"><summary>${T('Μεθοδολογία', 'Methodology', 'Metodología', 'Metodologija')}</summary><p>${esc(T('Όλα τα metrics υπολογίζονται από τα επίσημα game logs και τα σύνολα της ομάδας σε κάθε αγώνα. Usage, AST%, TOV% και rebound rate με τους τύπους του Basketball-Reference. ORtg/DRtg/Net = απόδοση της ομάδας με τον παίκτη στο παρκέ (play-by-play). Per 100 κατοχές = κατοχές της ομάδας όσο ο παίκτης είναι στο παρκέ. Percentiles ανάμεσα σε όσους έχουν τουλάχιστον 3 αγώνες και 10 λεπτά ανά αγώνα, μέσα στη θέση τους (ή συνολικά). Radar: κάθε κατηγορία είναι ο μέσος όρος των percentiles των metrics της. Παρόμοιοι παίκτες: cosine similarity σε usage, PIR/min, TS%, AST%, rebound rate, λεπτά, κλεψίματα/κοψίματα, τρίποντα και βολές. Στο EuroCup και στις παλαιότερες σεζόν υπάρχουν μόνο μέσοι όροι, οπότε τα προχωρημένα metrics λείπουν.', 'All metrics are computed from the official game logs and team totals for each game. Usage, AST%, TOV% and rebound rate use the Basketball-Reference formulas. ORtg/DRtg/Net = team performance with the player on court (play-by-play). Per 100 possessions = team possessions while the player is on court. Percentiles among players with at least 3 games and 10 minutes per game, within position (or overall). Radar: each category is the mean of its metrics’ percentiles. Similar players: cosine similarity on usage, PIR/min, TS%, AST%, rebound rate, minutes, steals/blocks, three-point and free-throw rates. EuroCup and older seasons only have averages, so advanced metrics are missing.', 'Todas las métricas salen de los registros oficiales de cada partido y los totales del equipo. Usage, AST%, TOV% y rebote con las fórmulas de Basketball-Reference. ORtg/DRtg/Net = rendimiento del equipo con el jugador en pista. Por 100 posesiones = posesiones del equipo con él en pista. Percentiles entre jugadores con al menos 3 partidos y 10 minutos, por posición o en total. Radar: media de los percentiles de cada categoría. Similares: similitud coseno. En la EuroCup y temporadas anteriores solo hay promedios.', 'Sve metrike se računaju iz zvaničnih zapisa utakmica i ukupnih brojki tima. Usage, AST%, TOV% i skok po formulama Basketball-Reference. ORtg/DRtg/Net = učinak tima dok je igrač na terenu. Na 100 poseda = posedi tima dok je on na terenu. Percentili među igračima sa najmanje 3 utakmice i 10 minuta, po poziciji ili ukupno. Radar: prosek percentila kategorije. Slični igrači: kosinusna sličnost. U Evrokupu i starijim sezonama postoje samo proseci.'))}</p></details>`;
      await simplePage('compare', { view: 'lead', title: T(`Σύγκριση παικτών EuroLeague & EuroCup ${SEASON_LABEL}: έως 4 παίκτες, radar, percentiles | ${SITE_NAME}`, `Compare EuroLeague & EuroCup players ${SEASON_LABEL}: up to 4 players, radar, percentiles | ${SITE_NAME}`, `Comparar jugadores EuroLeague y EuroCup ${SEASON_LABEL}: hasta 4, radar, percentiles | ${SITE_NAME}`, `Poređenje igrača Evroliga i Evrokup ${SEASON_LABEL}: do 4 igrača, radar, percentili | ${SITE_NAME}`),
        desc: T('Σύγκρινε έως 4 παίκτες της EuroLeague ή του EuroCup: πίνακας με percentiles ανά θέση, radar, bars ανά 36′ ή 100 κατοχές, scatter, splits και παρόμοιοι παίκτες.', 'Compare up to 4 EuroLeague or EuroCup players: table with positional percentiles, radar, per-36 or per-100 bars, scatter, splits and similar players.', 'Compara hasta 4 jugadores de la EuroLeague o la EuroCup: tabla con percentiles por posición, radar, barras por 36 o 100 posesiones, dispersión, splits y similares.', 'Uporedi do 4 igrača Evrolige ili Evrokupa: tabela sa percentilima po poziciji, radar, stubići na 36 ili 100 poseda, raspršenost, splitovi i slični igrači.'),
        main: `<article class="article lead wide anpage cmppage"><h1>${T('Σύγκριση παικτών', 'Player comparison', 'Comparador de jugadores', 'Poređenje igrača')}</h1><p class="lede2">${esc(T('Γράψε όνομα παίκτη για να τον προσθέσεις (έως 4). Σύρε τα ονόματα για να αλλάξεις σειρά. Η διεύθυνση της σελίδας κρατά τη σύγκριση, για να τη μοιραστείς.', 'Type a player’s name to add him (up to 4). Drag the names to reorder. The page address keeps the comparison, so you can share it.', 'Escribe el nombre de un jugador para añadirlo (hasta 4). Arrastra los nombres para reordenar. La dirección guarda la comparación para compartirla.', 'Ukucaj ime igrača da ga dodaš (do 4). Prevuci imena da promeniš redosled. Adresa stranice čuva poređenje da ga podeliš.'))} <a href="${urlFor(LG, 'cmpt')}">${T('Σύγκριση ομάδων →', 'Compare teams →', 'Comparar equipos →', 'Uporedi timove →')}</a></p>
${pcfg({ ids: topPairs[0] ? topPairs[0].map(p => p.id).join(',') : '' })}
<h2>${T('Δημοφιλείς συγκρίσεις', 'Popular comparisons', 'Comparaciones populares', 'Popularna poređenja')}</h2><ul class="mckm">${topPairs.map(([a, b]) => `<li><a href="${urlFor(LG, 'compare')}?ids=${a.id},${b.id}">${esc(a.n)} vs ${esc(b.n)}</a></li>`).join('')}</ul>${meth}</article>`,
        ld: crumbs([[SITE_NAME, B(LG)], [T('Σύγκριση παικτών', 'Player comparison', 'Comparador de jugadores', 'Poređenje igrača'), urlFor(LG, 'compare')]]) });
      await simplePage('cmpe', { view: 'lead', title: `${T('Σύγκριση παικτών', 'Player comparison', 'Comparador de jugadores', 'Poređenje igrača')} | ${SITE_NAME}`, desc: T('Ενσωματώσιμη σύγκριση παικτών EuroLeague.', 'Embeddable EuroLeague player comparison.', 'Comparador insertable de jugadores de la EuroLeague.', 'Ugradivo poređenje igrača Evrolige.'),
        main: `<div class="cmpembed">${pcfg({ embed: true })}<p class="sub"><a href="${SITE_URL}${urlFor(LG, 'compare')}" target="_blank" rel="noopener">${SITE_NAME}</a></p></div>` });
      await simplePage('cmpt', { view: 'lead', title: T(`Σύγκριση ομάδων EuroLeague & EuroCup ${SEASON_LABEL}: ratings, Four Factors, head-to-head | ${SITE_NAME}`, `Compare EuroLeague & EuroCup teams ${SEASON_LABEL}: ratings, four factors, head-to-head | ${SITE_NAME}`, `Comparar equipos EuroLeague y EuroCup ${SEASON_LABEL}: ratings, cuatro factores, enfrentamientos | ${SITE_NAME}`, `Poređenje timova Evroliga i Evrokup ${SEASON_LABEL}: rejtinzi, četiri faktora, međusobni dueli | ${SITE_NAME}`),
        desc: T('Σύγκρινε δύο ομάδες: ρεκόρ, ORtg/DRtg/Net, pace, Four Factors, πάγκος, εντός/εκτός, φόρμα, καλύτερες πεντάδες, βασικοί παίκτες, head-to-head και πρόβλεψη.', 'Compare two teams: record, ORtg/DRtg/Net, pace, four factors, bench, home/away, form, best lineups, key players, head-to-head and forecast.', 'Compara dos equipos: balance, ratings, ritmo, cuatro factores, banquillo, local/visitante, forma, quintetos, jugadores clave, enfrentamientos y pronóstico.', 'Uporedi dva tima: skor, rejtinzi, tempo, četiri faktora, klupa, kod kuće/u gostima, forma, petorke, ključni igrači, međusobni dueli i prognoza.'),
        main: `<article class="article lead wide anpage cmppage"><h1>${T('Σύγκριση ομάδων', 'Team comparison', 'Comparador de equipos', 'Poređenje timova')}</h1><p class="lede2"><a href="${urlFor(LG, 'compare')}">← ${T('Σύγκριση παικτών', 'Player comparison', 'Comparador de jugadores', 'Poređenje igrača')}</a></p>
<div id="cmpApp" data-kind="teams"><script type="application/json" class="cmpj">${JSON.stringify({ api: BASE + 'api/compare/teams/metrics.json', mcUrl: urlFor(LG, 'mc'), teams: { E: teamsJ, U: Object.fromEntries(Object.entries(data.ec?.teams || {}).map(([c, v]) => [c, (LG === 'el' && { ARI: 'Άρης', PAO: 'ΠΑΟΚ' }[c]) || v[1]])) }, labels: LBL, tips: TIPS, radarLabels: RLT }).replace(/</g, '\\u003c')}</script><p class="sub">…</p></div><script type="module" src="${BASE}assets/compare/ui.js?v=${ver}"></script>${meth}</article>`,
        ld: crumbs([[SITE_NAME, B(LG)], [T('Σύγκριση ομάδων', 'Team comparison', 'Comparador de equipos', 'Poređenje timova'), urlFor(LG, 'cmpt')]]) });
    }

    // ---- πόσο πέφτει μέσα το μοντέλο: προβλέψεις με τα δεδομένα πριν από κάθε αγωνιστική
    {
      const rows = [];
      for (const r of doneRounds.slice().sort((a, b) => a - b)) {
        const M = teamModel(players, r);
        for (const g of league.games.filter(x => x[0] === r && x[6] && TEAMS[x[2]] && TEAMS[x[3]])) {
          const x = M.predict(g[2], g[3]); if (!x) continue;
          const fav = x.prob >= 0.5 ? g[2] : g[3], won = g[4] > g[5] ? g[2] : g[3];
          rows.push({ r, g, x, ok: fav === won, conf: Math.max(x.prob, 1 - x.prob), em: Math.abs((x.ph - x.pa) - (g[4] - g[5])), et: Math.abs((x.ph + x.pa) - (g[4] + g[5])) });
        }
      }
      const pc = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
      const avg = (a, f) => a.length ? f1(a.reduce((s, o) => s + f(o), 0) / a.length) : '–';
      const hits = rows.filter(o => o.ok).length;
      const byR = [...new Set(rows.map(o => o.r))].sort((a, b) => b - a).map(r => { const x = rows.filter(o => o.r === r); return { r, n: x.length, h: x.filter(o => o.ok).length, em: avg(x, o => o.em), et: avg(x, o => o.et) }; });
      const B2 = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]].map(([a, b]) => { const x = rows.filter(o => o.conf >= a && o.conf < b); return { a, b, n: x.length, h: x.filter(o => o.ok).length }; });
      const miss = rows.filter(o => !o.ok).sort((a, b) => b.conf - a.conf).slice(0, 6);
      const sc = g => LG === 'sr' ? `${g[4]}:${g[5]}` : `${g[4]}-${g[5]}`;
      const gl = g => `<a href="${urlFor(LG, `game:${g[0]}|${g[2]}|${g[3]}`)}">${esc(tName(g[2]))} – ${esc(tName(g[3]))} ${sc(g)}</a>`;
      const main = `<article class="article model">
<h1>${T('Πόσο πέφτει μέσα το μοντέλο μας', 'How accurate is our model', '¿Cuánto acierta nuestro modelo?', 'Koliko je tačan naš model')}</h1>
<p class="lede2">${T('Για κάθε αγώνα ξαναφτιάχνουμε την πρόβλεψη μόνο με όσα ήξερε το μοντέλο πριν από την αγωνιστική, και τη συγκρίνουμε με το αποτέλεσμα. Μετράνε οι αγώνες από την 3η αγωνιστική, όταν υπάρχουν αρκετά δεδομένα.', 'For each game we rebuild the prediction using only what the model knew before the round, and compare it with the result. Games count from Round 3, once there is enough data.', 'Para cada partido rehacemos el pronóstico solo con lo que el modelo sabía antes de la jornada y lo comparamos con el resultado. Cuentan los partidos desde la jornada 3, cuando ya hay datos suficientes.', 'Za svaku utakmicu pravimo prognozu samo sa onim što je model znao pre kola i poredimo je sa rezultatom. Računaju se utakmice od 3. kola, kada ima dovoljno podataka.')}</p>
<div class="otiles mtiles"><div><b>${pc(hits, rows.length)}</b><span>${T('Σωστός νικητής', 'Right winner', 'Ganador acertado', 'Pogođen pobednik')}</span></div><div><b>${hits}/${rows.length}</b><span>${T('Αγώνες', 'Games', 'Partidos', 'Utakmice')}</span></div><div><b>${avg(rows, o => o.em)}</b><span>${T('Μέση απόκλιση στη διαφορά', 'Average miss on margin', 'Error medio en la diferencia', 'Prosečna greška u razlici')}</span></div><div><b>${avg(rows, o => o.et)}</b><span>${T('Μέση απόκλιση στο σύνολο πόντων', 'Average miss on total points', 'Error medio en el total de puntos', 'Prosečna greška u ukupnim poenima')}</span></div></div>
<h2>${T('Ανά αγωνιστική', 'By round', 'Por jornada', 'Po kolu')}</h2>
<div class="tbl"><table><thead><tr><th>${T('Αγωνιστική', 'Round', 'Jornada', 'Kolo')}</th><th>${T('Σωστοί νικητές', 'Right winners', 'Ganadores acertados', 'Pogođeni pobednici')}</th><th>%</th><th>${T('Απόκλ. διαφοράς', 'Margin miss', 'Error dif.', 'Greška razl.')}</th><th>${T('Απόκλ. συνόλου', 'Total miss', 'Error total', 'Greška ukupno')}</th></tr></thead><tbody>${byR.map(o => `<tr><td class="l"><a href="${urlFor(LG, 'recap:' + o.r)}">${esc(rdTxt0(o.r))}</a></td><td>${o.h}/${o.n}</td><td><b>${pc(o.h, o.n)}</b></td><td>${o.em}</td><td>${o.et}</td></tr>`).join('')}</tbody></table></div>
<h2>${T('Όσο πιο σίγουρο, τόσο πιο σωστό;', 'Does more confidence mean more accuracy?', '¿Más confianza significa más acierto?', 'Da li veća sigurnost znači veću tačnost?')}</h2>
<p class="sub">${T('Οι προβλέψεις χωρισμένες με βάση την πιθανότητα που έδινε το μοντέλο στο φαβορί', 'Predictions grouped by the probability the model gave the favourite', 'Pronósticos agrupados según la probabilidad que el modelo daba al favorito', 'Prognoze grupisane po verovatnoći koju je model davao favoritu')}</p>
<div class="tbl"><table><thead><tr><th>${T('Πιθανότητα φαβορί', 'Favourite’s probability', 'Probabilidad del favorito', 'Verovatnoća favorita')}</th><th>${T('Αγώνες', 'Games', 'Partidos', 'Utakmice')}</th><th>${T('Κέρδισε το φαβορί', 'Favourite won', 'Ganó el favorito', 'Favorit pobedio')}</th></tr></thead><tbody>${B2.map(o => `<tr><td class="l">${Math.round(o.a * 100)}–${o.b > 1 ? 100 : Math.round(o.b * 100)}%</td><td>${o.n}</td><td><b>${pc(o.h, o.n)}</b></td></tr>`).join('')}</tbody></table></div>
${miss.length ? `<h2>${T('Οι μεγαλύτερες αστοχίες', 'The biggest misses', 'Los mayores fallos', 'Najveći promašaji')}</h2><ul>${miss.map(o => `<li>${gl(o.g)}: ${T('φαβορί', 'favourite', 'favorito', 'favorit')} ${esc(tName(o.x.prob >= 0.5 ? o.g[2] : o.g[3]))} ${T('με', 'at', 'con un', 'sa')} ${Math.round(o.conf * 100)}%</li>`).join('')}</ul>` : ''}
<p><a class="pread" href="${urlFor(LG, 'preds')}">${T('Οι προβλέψεις της επόμενης αγωνιστικής →', 'Next round’s predictions →', 'Pronósticos de la próxima jornada →', 'Prognoze za sledeće kolo →')}</a></p>
<p class="note">${T('Το μοντέλο εκτιμά το σκορ από την επιθετική και αμυντική απόδοση ανά 100 κατοχές, τον ρυθμό και την έδρα. Δεν λαμβάνει υπόψη τραυματισμούς. Στατιστική εκτίμηση, όχι συμβουλή στοιχήματος.', 'The model estimates the score from offensive and defensive ratings per 100 possessions, pace and home court. It does not account for injuries. A statistical estimate, not betting advice.', 'El modelo estima el marcador con los ratings ofensivo y defensivo por 100 posesiones, el ritmo y el factor cancha. No tiene en cuenta las lesiones. Una estimación estadística, no un consejo de apuestas.', 'Model procenjuje rezultat iz napadačkog i odbrambenog rejtinga na 100 poseda, ritma i domaćeg terena. Ne uzima u obzir povrede. Statistička procena, a ne savet za klađenje.')}</p>
${predSec}
</article>`;
      await simplePage('model', { view: 'model', title: T(`Πόσο πέφτει μέσα το μοντέλο προβλέψεων EuroLeague | ${SITE_NAME}`, `EuroLeague prediction model accuracy | ${SITE_NAME}`, `Acierto del modelo de pronósticos de la EuroLeague | ${SITE_NAME}`, `Tačnost modela prognoza Evrolige | ${SITE_NAME}`),
        desc: T(`Το μοντέλο μας βρήκε τον νικητή σε ${hits} από τους ${rows.length} αγώνες της ${S}. Ανά αγωνιστική, ανά βαθμό σιγουριάς και οι μεγαλύτερες αστοχίες.`, `Our model picked the winner in ${hits} of ${rows.length} games of the ${S}. By round, by confidence and the biggest misses.`, `Nuestro modelo acertó el ganador en ${hits} de ${rows.length} partidos de la ${S}. Por jornada, por confianza y los mayores fallos.`, `Naš model je pogodio pobednika na ${hits} od ${rows.length} utakmica ${S}. Po kolu, po sigurnosti i najveći promašaji.`), main });
    }

    // ---- ιστορικό: σελίδα για κάθε προηγούμενη σεζόν + κεντρική
    const HS = Object.values(data.hist || {}).filter(h => h.rows?.length).sort((a, b) => b.code.localeCompare(a.code));
    const hLabel = code => `${+code.slice(1)}-${String(+code.slice(1) + 1).slice(2)}`;
    const hName = (c, n) => (TEAMS[c] ? tName(c) : String(n || c).replace(/\s+(Istanbul|Moscow|Athens|Piraeus|Kaunas|Belgrade|Milan|Tel Aviv|Munich|Valencia|Vitoria-Gasteiz)$/i, ''));
    const LOC0 = { el: 'el-GR', en: 'en-GB', es: 'es-ES', sr: 'sr-Latn-RS' }[LG];
    if (HS.length) {
      const hLead = (h, k, i) => { const minG = Math.max(8, Math.round(h.rsMax * 0.5)); return h.rows.filter(r => r[4] >= minG).sort((a, b) => b[i] - a[i]).slice(0, 10); };
      const champ = h => h.final ? (h.final[2] > h.final[5] ? [h.final[0], h.final[1]] : [h.final[3], h.final[4]]) : null;
      const runner = h => h.final ? (h.final[2] > h.final[5] ? [h.final[3], h.final[4]] : [h.final[0], h.final[1]]) : null;
      const curPlayer = Object.fromEntries(players.map(p => [p.c, p]));
      const pName = r => curPlayer[r[0]] ? `<a href="${urlFor(LG, 'player:' + curPlayer[r[0]].s)}">${esc(niceName(r[1]))}</a>` : esc(niceName(r[1]));
      const cancelled = T('Ακυρώθηκε (COVID-19)', 'Cancelled (COVID-19)', 'Cancelada (COVID-19)', 'Otkazano (COVID-19)');
      for (const h of HS) {
        const L = hLabel(h.code), ch = champ(h), ru = runner(h);
        const LEADS = [[6, T('Πόντοι', 'Points', 'Puntos', 'Poeni')], [7, T('Ριμπάουντ', 'Rebounds', 'Rebotes', 'Skokovi')], [8, T('Ασίστ', 'Assists', 'Asistencias', 'Asistencije')], [9, 'PIR']];
        const ts = hLead(h, 'pts', 6)[0];
        const fsc = `${Math.max(h.final?.[2] || 0, h.final?.[5] || 0)}-${Math.min(h.final?.[2] || 0, h.final?.[5] || 0)}`;
        const intro = ch ? T(`Πρωταθλήτρια της EuroLeague ${L}: ${hName(ch[0], ch[1])}. Τελικός: ${hName(ch[0], ch[1])} – ${hName(ru[0], ru[1])} ${fsc}.`, `EuroLeague ${L} champion: ${hName(ch[0], ch[1])}, winning the final ${Math.max(h.final[2], h.final[5])}-${Math.min(h.final[2], h.final[5])} against ${hName(ru[0], ru[1])}.`, `Campeón de la EuroLeague ${L}: ${hName(ch[0], ch[1])}, que ganó la final ${Math.max(h.final[2], h.final[5])}-${Math.min(h.final[2], h.final[5])} ante ${hName(ru[0], ru[1])}.`, `Šampion Evrolige ${L}: ${hName(ch[0], ch[1])}. Finale: ${hName(ch[0], ch[1])} - ${hName(ru[0], ru[1])} ${fsc.replace('-', ':')}.`)
          : T(`Η σεζόν ${L} της EuroLeague δεν ολοκληρώθηκε (COVID-19).`, `The EuroLeague ${L} season was not completed (COVID-19).`, `La temporada ${L} de la EuroLeague no se completó (COVID-19).`, `Sezona ${L} Evrolige nije završena (COVID-19).`);
        const intro2 = (h.stand[0] ? T(` Πρώτη στην κανονική περίοδο: ${hName(h.stand[0][1], h.stand[0][2])} (${h.stand[0][3]}-${h.stand[0][4]}).`, ` Regular season leader: ${hName(h.stand[0][1], h.stand[0][2])} (${h.stand[0][3]}-${h.stand[0][4]}).`, ` Líder de la fase regular: ${hName(h.stand[0][1], h.stand[0][2])} (${h.stand[0][3]}-${h.stand[0][4]}).`, ` Prvi u regularnom delu: ${hName(h.stand[0][1], h.stand[0][2])} (${h.stand[0][3]}-${h.stand[0][4]}).`) : '') + (ts ? T(` Πρώτος σκόρερ: ${niceName(ts[1])} (${f1(ts[6])} πόντοι).`, ` Top scorer: ${niceName(ts[1])} (${f1(ts[6])} points).`, ` Máximo anotador: ${niceName(ts[1])} (${f1(ts[6])} puntos).`, ` Najbolji strelac: ${niceName(ts[1])} (${f1(ts[6])} poena).`) : '');
        const main = `<article class="article lead wide hist">
<p class="crumbs"><a href="${urlFor(LG, 'hist')}">${T('Ιστορικό EuroLeague', 'EuroLeague history', 'Historia de la EuroLeague', 'Istorija Evrolige')}</a></p>
<h1>EuroLeague ${L}</h1>
<p class="lede2">${esc(intro + intro2)}</p>
<p class="leadnav">${HS.map(x => `<a href="${urlFor(LG, 'hist:' + hLabel(x.code))}"${x === h ? ' aria-current="page"' : ''}>${hLabel(x.code)}</a>`).join('')}</p>
${h.final ? `<h2>${T('Τελικός', 'Final', 'Final', 'Finale')}</h2><p class="hfinal"><b>${esc(hName(h.final[0], h.final[1]))}</b> ${LG === 'sr' ? `${h.final[2]}:${h.final[5]}` : `${h.final[2]}-${h.final[5]}`} <b>${esc(hName(h.final[3], h.final[4]))}</b> <small>(${esc(new Date(h.final[6]).toLocaleDateString(LOC0, { day: 'numeric', month: 'long', year: 'numeric' }))})</small></p>` : `<p class="hfinal">${esc(cancelled)}</p>`}
<div class="ecgrid hgrid"><div><h2>${T('Κανονική περίοδος', 'Regular season', 'Fase regular', 'Regularni deo')}</h2><div class="tbl"><table><thead><tr><th>#</th><th class="l">${T('Ομάδα', 'Team', 'Equipo', 'Tim')}</th><th>${T('Ν', 'W', 'V', 'P')}</th><th>${T('Η', 'L', 'D', 'I')}</th><th>+/−</th></tr></thead><tbody>${h.stand.map(x => `<tr><td>${x[0]}</td><td class="l">${TEAMS[x[1]] ? `<a href="${urlFor(LG, 'team:' + x[1])}">${esc(hName(x[1], x[2]))}</a>` : esc(hName(x[1], x[2]))}${ch && ch[0] === x[1] ? ' 🏆' : ''}</td><td>${x[3]}</td><td>${x[4]}</td><td>${x[5] - x[6] > 0 ? '+' : ''}${x[5] - x[6]}</td></tr>`).join('')}</tbody></table></div></div>
<div><h2>${T('Κορυφαίοι παίκτες', 'Top players', 'Mejores jugadores', 'Najbolji igrači')}</h2>${LEADS.map(([i, lab]) => `<h3>${esc(lab)}</h3><ol class="leadol">${hLead(h, '', i).map(r => `<li>${pName(r)} <small>${esc(hName(r[2], r[3]))}</small><b>${f1(r[i])}</b></li>`).join('')}</ol>`).join('')}</div></div>
<p class="note">${T('Πηγή: επίσημα στατιστικά της EuroLeague. Οι μέσοι όροι περιλαμβάνουν όλους τους αγώνες της σεζόν· στους κορυφαίους μετράνε όσοι έπαιξαν τουλάχιστον τους μισούς αγώνες της κανονικής περιόδου.', 'Source: official EuroLeague stats. Averages include all games of the season; leaders include players who played at least half of the regular-season games.', 'Fuente: estadísticas oficiales de la EuroLeague. Los promedios incluyen todos los partidos de la temporada; en los líderes cuentan quienes jugaron al menos la mitad de la fase regular.', 'Izvor: zvanična statistika Evrolige. Proseci uključuju sve utakmice sezone; među najboljima su igrači koji su odigrali bar polovinu regularnog dela.')}</p>
</article>`;
        await simplePage('hist:' + L, { view: 'hist', title: T(`EuroLeague ${L}: πρωταθλήτρια, τελικός, βαθμολογία, κορυφαίοι παίκτες | ${SITE_NAME}`, `EuroLeague ${L}: champion, final, standings and top players | ${SITE_NAME}`, `EuroLeague ${L}: campeón, final, clasificación y mejores jugadores | ${SITE_NAME}`, `Evroliga ${L}: šampion, finale, tabela i najbolji igrači | ${SITE_NAME}`), desc: (intro + intro2).slice(0, 300), main,
          ld: crumbs([[SITE_NAME, B(LG)], [T('Ιστορικό', 'History', 'Historia', 'Istorija'), urlFor(LG, 'hist')], [`EuroLeague ${L}`, urlFor(LG, 'hist:' + L)]]) });
      }
      const titles = {}; for (const h of HS) { const c = champ(h); if (c) { const k = hName(c[0], c[1]); titles[k] = (titles[k] || 0) + 1; } }
      const tl = Object.entries(titles).sort((a, b) => b[1] - a[1]);
      const hmain = `<article class="article lead wide hist">
<h1>${T('Ιστορικό EuroLeague', 'EuroLeague history', 'Historia de la EuroLeague', 'Istorija Evrolige')}</h1>
<p class="lede2">${T(`Όλες οι σεζόν της EuroLeague από το ${HIST_FROM}-${String(HIST_FROM + 1).slice(2)}: πρωταθλητές, τελικοί, πρώτοι της κανονικής περιόδου και πρώτοι σκόρερ.`, `Every EuroLeague season since ${HIST_FROM}-${String(HIST_FROM + 1).slice(2)}: champions, finals, regular season leaders and top scorers.`, `Todas las temporadas de la EuroLeague desde la ${HIST_FROM}-${String(HIST_FROM + 1).slice(2)}: campeones, finales, líderes de la fase regular y máximos anotadores.`, `Sve sezone Evrolige od ${HIST_FROM}-${String(HIST_FROM + 1).slice(2)}: šampioni, finala, prvi u regularnom delu i najbolji strelci.`)}</p>
<div class="tbl"><table><thead><tr><th class="l">${T('Σεζόν', 'Season', 'Temporada', 'Sezona')}</th><th class="l">${T('Πρωταθλήτρια', 'Champion', 'Campeón', 'Šampion')}</th><th>${T('Τελικός', 'Final', 'Final', 'Finale')}</th><th class="l">${T('Φιναλίστ', 'Runner-up', 'Subcampeón', 'Finalista')}</th><th class="l">${T('1η κανονικής', 'RS leader', 'Líder fase regular', 'Prvi u RD')}</th><th class="l">${T('Πρώτος σκόρερ', 'Top scorer', 'Máximo anotador', 'Najbolji strelac')}</th></tr></thead><tbody>${HS.map(h => { const c = champ(h), r = runner(h), t = hLead(h, '', 6)[0]; return `<tr><td class="l"><a href="${urlFor(LG, 'hist:' + hLabel(h.code))}">${hLabel(h.code)}</a></td><td class="l">${c ? `<b>${esc(hName(c[0], c[1]))}</b>` : esc(cancelled)}</td><td>${h.final ? `${Math.max(h.final[2], h.final[5])}-${Math.min(h.final[2], h.final[5])}` : '–'}</td><td class="l">${r ? esc(hName(r[0], r[1])) : '–'}</td><td class="l">${h.stand[0] ? esc(hName(h.stand[0][1], h.stand[0][2])) : '–'}</td><td class="l">${t ? `${pName(t)} <small>${f1(t[6])}</small>` : '–'}</td></tr>`; }).join('')}</tbody></table></div>
${tl.length ? `<h2>${T('Τίτλοι ανά ομάδα', 'Titles by team', 'Títulos por equipo', 'Titule po timovima')} (${HS.length ? hLabel(HS[HS.length - 1].code) : ''} – ${HS.length ? hLabel(HS[0].code) : ''})</h2><ol class="leadol">${tl.map(([n, k]) => `<li>${esc(n)}<b>${k}</b></li>`).join('')}</ol>` : ''}
<p class="note">${T('Πηγή: επίσημα στατιστικά της EuroLeague.', 'Source: official EuroLeague stats.', 'Fuente: estadísticas oficiales de la EuroLeague.', 'Izvor: zvanična statistika Evrolige.')}</p>
</article>`;
      await simplePage('hist', { view: 'hist', title: T(`Ιστορικό EuroLeague: πρωταθλητές, τελικοί και πρώτοι σκόρερ ανά σεζόν | ${SITE_NAME}`, `EuroLeague history: champions, finals and top scorers by season | ${SITE_NAME}`, `Historia de la EuroLeague: campeones, finales y máximos anotadores por temporada | ${SITE_NAME}`, `Istorija Evrolige: šampioni, finala i najbolji strelci po sezonama | ${SITE_NAME}`),
        desc: T('Όλοι οι πρωταθλητές της EuroLeague, οι τελικοί, οι πρώτοι της κανονικής περιόδου και οι πρώτοι σκόρερ κάθε σεζόν.', 'All EuroLeague champions, finals, regular season leaders and top scorers of every season.', 'Todos los campeones de la EuroLeague, las finales, los líderes de la fase regular y los máximos anotadores de cada temporada.', 'Svi šampioni Evrolige, finala, prvi u regularnom delu i najbolji strelci svake sezone.'), main: hmain,
        ld: crumbs([[SITE_NAME, B(LG)], [T('Ιστορικό', 'History', 'Historia', 'Istorija'), urlFor(LG, 'hist')]]) });
    }

    // ---- κορυφαίοι και ρεκόρ: σελίδες-λίστες που ψάχνει ο κόσμος
    {
      const pU = p => urlFor(LG, 'player:' + p.s), tcOf = p => p.t.split(';').pop();
      const tL = c => `<a href="${urlFor(LG, 'team:' + c)}">${esc(tName(c))}</a>`;
      const rows = players.map(p => { const g = p.g.filter(r => r[7] > 0), G = g.length; const sm = i => g.reduce((s, r) => s + r[i], 0);
        return { p, G, min: G ? sm(7) / G / 60 : 0, pts: G ? sm(8) / G : 0, reb: G ? (sm(15) + sm(16)) / G : 0, ast: G ? sm(17) / G : 0, pir: G ? sm(25) / G : 0, tpm: G ? sm(11) / G : 0, stl: G ? sm(18) / G : 0, blk: G ? sm(20) / G : 0,
          T: { pts: sm(8), reb: sm(15) + sm(16), ast: sm(17), pir: sm(25), tpm: sm(11), stl: sm(18), blk: sm(20) } }; });
      const qual = rows.filter(x => x.G >= 3 && x.min >= 10);
      const STAT = {
        pts: [T('Πόντοι', 'Points', 'Puntos', 'Poeni'), T('Πρώτοι σκόρερ', 'Top scorers', 'Máximos anotadores', 'Najbolji strelci'), T('πόντους', 'points', 'puntos', 'poena')],
        reb: [T('Ριμπάουντ', 'Rebounds', 'Rebotes', 'Skokovi'), T('Πρώτοι σε ριμπάουντ', 'Rebounding leaders', 'Líderes en rebotes', 'Najbolji skakači'), T('ριμπάουντ', 'rebounds', 'rebotes', 'skokova')],
        ast: [T('Ασίστ', 'Assists', 'Asistencias', 'Asistencije'), T('Πρώτοι σε ασίστ', 'Assist leaders', 'Líderes en asistencias', 'Najbolji asistenti'), T('ασίστ', 'assists', 'asistencias', 'asistencija')],
        pir: ['PIR', T('Πρώτοι σε PIR (αξιολόγηση)', 'PIR leaders (efficiency)', 'Líderes en PIR (valoración)', 'Najbolji po PIR-u (indeks)'), 'PIR'],
        tpm: [T('Τρίποντα', 'Three-pointers', 'Triples', 'Trojke'), T('Πρώτοι σε εύστοχα τρίποντα', 'Three-point leaders', 'Líderes en triples anotados', 'Najbolji u pogođenim trojkama'), T('εύστοχα τρίποντα', 'made threes', 'triples anotados', 'pogođenih trojki')],
        stl: [T('Κλεψίματα', 'Steals', 'Robos', 'Ukradene lopte'), T('Πρώτοι σε κλεψίματα', 'Steals leaders', 'Líderes en robos', 'Najbolji u ukradenim loptama'), T('κλεψίματα', 'steals', 'robos', 'ukradenih lopti')],
        blk: [T('Κοψίματα', 'Blocks', 'Tapones', 'Blokade'), T('Πρώτοι σε κοψίματα', 'Blocks leaders', 'Líderes en tapones', 'Najbolji blokeri'), T('κοψίματα', 'blocks', 'tapones', 'blokada')],
      };
      const IDX = { pts: 8, reb: -1, ast: 17, pir: 25, tpm: 11, stl: 18, blk: 20 };
      const gv = (r, k) => k === 'reb' ? r[15] + r[16] : r[IDX[k]];
      const thr = `<th>${T('Αγ.', 'G', 'PJ', 'Ut.')}</th><th>${T('Λεπ.', 'Min', 'Min', 'Min')}</th>`;
      const upd = T(`Μετά την ${lastRound}η αγωνιστική`, `After Round ${lastRound}`, `Tras la jornada ${lastRound}`, `Posle ${lastRound}. kola`);
      const qNote = `<p class="note">${T('Μετράνε οι παίκτες με τουλάχιστον 3 αγώνες και 10 λεπτά μέσο όρο. Ενημερώνεται αυτόματα μετά από κάθε αγωνιστική από τα επίσημα στατιστικά της EuroLeague.', 'Players with at least 3 games and 10 minutes per game. Updated automatically after every round from official EuroLeague stats.', 'Cuentan los jugadores con al menos 3 partidos y 10 minutos de media. Se actualiza automáticamente tras cada jornada con las estadísticas oficiales de la EuroLeague.', 'Računaju se igrači sa najmanje 3 utakmice i 10 minuta u proseku. Ažurira se automatski posle svakog kola iz zvanične statistike Evrolige.')}</p>`;
      const hubLinks = keys => `<p class="leadnav">${keys.map(k => `<a href="${urlFor(LG, 'lead:' + k)}">${esc(k in STAT ? STAT[k][0] : LEADX[k])}</a>`).join('')}</p>`;
      const LEADX = { rec: T('Ρεκόρ αγώνα', 'Single-game records', 'Récords en un partido', 'Rekordi utakmice'), gr: T('Έλληνες παίκτες', 'Greek players', 'Jugadores griegos', 'Grčki igrači'), yg: T('Νεότεροι παίκτες', 'Youngest players', 'Jugadores más jóvenes', 'Najmlađi igrači') };
      const ALL = [...Object.keys(STAT), 'rec', 'gr', 'yg'];
      const itemList = (name, list) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name, itemListElement: list.slice(0, 10).map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: niceName(x.p.n), url: SITE_URL + pU(x.p) })) });
      for (const [k, [lab, h1, unit]] of Object.entries(STAT)) {
        const L = qual.slice().sort((a, b) => b[k] - a[k]).slice(0, 50);
        if (!L.length) continue;
        const [a1, a2, a3] = L;
        const intro = T(`${upd}, πρώτος στην ${S} σε ${unit} ανά αγώνα είναι ο ${niceName(a1.p.n)} (${tName(tcOf(a1.p))}) με ${f1(a1[k])}.${a2 ? ` Ακολουθούν ο ${niceName(a2.p.n)} (${f1(a2[k])})` : ''}${a3 ? ` και ο ${niceName(a3.p.n)} (${f1(a3[k])}).` : ''}`,
          `${upd}, the ${S} leader in ${unit} per game is ${niceName(a1.p.n)} (${tName(tcOf(a1.p))}) with ${f1(a1[k])}.${a2 ? ` Next are ${niceName(a2.p.n)} (${f1(a2[k])})` : ''}${a3 ? ` and ${niceName(a3.p.n)} (${f1(a3[k])}).` : ''}`,
          `${upd}, el líder de la ${S} en ${unit} por partido es ${niceName(a1.p.n)} (${tName(tcOf(a1.p))}) con ${f1(a1[k])}.${a2 ? ` Le siguen ${niceName(a2.p.n)} (${f1(a2[k])})` : ''}${a3 ? ` y ${niceName(a3.p.n)} (${f1(a3[k])}).` : ''}`,
          `${upd}, najbolji u ${S} po broju ${unit} po utakmici je ${niceName(a1.p.n)} (${tName(tcOf(a1.p))}) sa ${f1(a1[k])}.${a2 ? ` Slede ${niceName(a2.p.n)} (${f1(a2[k])})` : ''}${a3 ? ` i ${niceName(a3.p.n)} (${f1(a3[k])}).` : ''}`);
        const main = `<article class="article lead">
<h1>${esc(h1)} ${S}</h1>
${hubLinks(ALL)}
<p class="lede2">${esc(intro)}</p>
<div class="tbl"><table><thead><tr><th>#</th><th class="l">${T('Παίκτης', 'Player', 'Jugador', 'Igrač')}</th><th class="l">${T('Ομάδα', 'Team', 'Equipo', 'Tim')}</th>${thr}<th>${esc(lab)}</th><th>${T('Σύνολο', 'Total', 'Total', 'Ukupno')}</th></tr></thead><tbody>${L.map((x, i) => `<tr><td>${i + 1}</td><td class="l"><a href="${pU(x.p)}">${esc(niceName(x.p.n))}</a></td><td class="l">${tL(tcOf(x.p))}</td><td>${x.G}</td><td>${f1(x.min)}</td><td><b>${f1(x[k])}</b></td><td>${x.T[k]}</td></tr>`).join('')}</tbody></table></div>
${qNote}</article>`;
        await simplePage('lead:' + k, { view: 'lead', title: T(`${h1} EuroLeague ${SEASON_LABEL} | ${SITE_NAME}`, `EuroLeague ${h1.toLowerCase()} ${SEASON_LABEL} | ${SITE_NAME}`, `${h1} de la EuroLeague ${SEASON_LABEL} | ${SITE_NAME}`, `${h1} Evrolige ${SEASON_LABEL} | ${SITE_NAME}`), desc: intro, main,
          ld: [itemList(`${h1} ${S}`, L), crumbs([[SITE_NAME, B(LG)], [T('Κορυφαίοι', 'Leaders', 'Líderes', 'Lideri'), urlFor(LG, 'lead')], [h1, urlFor(LG, 'lead:' + k)]])] });
      }
      // ρεκόρ ενός αγώνα
      {
        const perf = players.flatMap(p => p.g.filter(r => r[7] > 0).map(r => ({ p, r })));
        const gameOf = x => { const home = x.r[3] === 1, me = tcOf(x.p); const h = home ? me : x.r[2], a = home ? x.r[2] : me; return league.games.find(g => g[0] === x.r[0] && g[2] === h && g[3] === a); };
        const sec = k => { const L = perf.slice().sort((a, b) => gv(b.r, k) - gv(a.r, k) || b.r[25] - a.r[25]).slice(0, 10);
          return `<h2>${esc(STAT[k][0])}</h2><div class="tbl"><table><thead><tr><th>#</th><th class="l">${T('Παίκτης', 'Player', 'Jugador', 'Igrač')}</th><th class="l">${T('Αγώνας', 'Game', 'Partido', 'Utakmica')}</th><th>${esc(STAT[k][0])}</th></tr></thead><tbody>${L.map((x, i) => { const g = gameOf(x); return `<tr><td>${i + 1}</td><td class="l"><a href="${pU(x.p)}">${esc(niceName(x.p.n))}</a></td><td class="l">${g ? `<a href="${urlFor(LG, `game:${g[0]}|${g[2]}|${g[3]}`)}">${esc(tName(g[2]))} – ${esc(tName(g[3]))} ${LG === 'sr' ? `${g[4]}:${g[5]}` : `${g[4]}-${g[5]}`}</a> <small>(${esc(rdTxt0(x.r[0]))})</small>` : ''}</td><td><b>${gv(x.r, k)}</b></td></tr>`; }).join('')}</tbody></table></div>`; };
        const top = perf.slice().sort((a, b) => b.r[8] - a.r[8])[0];
        const intro = top ? T(`Οι καλύτερες ατομικές εμφανίσεις της ${S} σε έναν αγώνα. Οι περισσότεροι πόντοι μέχρι τώρα: ${top.r[8]}, από τον ${niceName(top.p.n)} στην ${rdTxt0(top.r[0])}.`, `The best individual single-game performances of the ${S}. Most points so far: ${top.r[8]}, by ${niceName(top.p.n)} in ${rdTxt0(top.r[0])}.`, `Las mejores actuaciones individuales en un partido de la ${S}. Más puntos hasta ahora: ${top.r[8]}, de ${niceName(top.p.n)} en la ${rdTxt0(top.r[0]).toLowerCase()}.`, `Najbolji pojedinačni učinci na jednoj utakmici u ${S}. Najviše poena do sada: ${top.r[8]}, ${niceName(top.p.n)} u ${rdTxt0(top.r[0])}.`) : '';
        await simplePage('lead:rec', { view: 'lead', title: T(`Ρεκόρ αγώνα EuroLeague ${SEASON_LABEL}: περισσότεροι πόντοι, ριμπάουντ, ασίστ | ${SITE_NAME}`, `EuroLeague ${SEASON_LABEL} single-game records: most points, rebounds, assists | ${SITE_NAME}`, `Récords en un partido de la EuroLeague ${SEASON_LABEL}: más puntos, rebotes y asistencias | ${SITE_NAME}`, `Rekordi utakmice Evrolige ${SEASON_LABEL}: najviše poena, skokova, asistencija | ${SITE_NAME}`), desc: intro,
          main: `<article class="article lead"><h1>${esc(LEADX.rec)} ${S}</h1>${hubLinks(ALL)}<p class="lede2">${esc(intro)}</p>${['pts', 'reb', 'ast', 'tpm', 'pir'].map(sec).join('')}${qNote.replace(/<p class="note">.*?\. /, '<p class="note">')}</article>`,
          ld: crumbs([[SITE_NAME, B(LG)], [T('Κορυφαίοι', 'Leaders', 'Líderes', 'Lideri'), urlFor(LG, 'lead')], [LEADX.rec, urlFor(LG, 'lead:rec')]]) });
      }
      // Έλληνες και νεότεροι παίκτες
      const listPage = async (key, L, intro, extraTh, extraTd) => {
        await simplePage('lead:' + key, { view: 'lead', title: T(`${LEADX[key]} στην EuroLeague ${SEASON_LABEL}: στατιστικά | ${SITE_NAME}`, `${LEADX[key]} in the EuroLeague ${SEASON_LABEL}: stats | ${SITE_NAME}`, `${LEADX[key]} de la EuroLeague ${SEASON_LABEL}: estadísticas | ${SITE_NAME}`, `${LEADX[key]} u Evroligi ${SEASON_LABEL}: statistika | ${SITE_NAME}`), desc: intro,
          main: `<article class="article lead"><h1>${esc(LEADX[key])} ${S}</h1>${hubLinks(ALL)}<p class="lede2">${esc(intro)}</p><div class="tbl"><table><thead><tr><th class="l">${T('Παίκτης', 'Player', 'Jugador', 'Igrač')}</th><th class="l">${T('Ομάδα', 'Team', 'Equipo', 'Tim')}</th>${extraTh}${thr}<th>${T('Π', 'Pts', 'Pts', 'Poe')}</th><th>${T('Ριμπ.', 'Reb', 'Reb', 'Sko')}</th><th>${T('Ασ.', 'Ast', 'Asi', 'Asi')}</th><th>PIR</th></tr></thead><tbody>${L.map(x => `<tr><td class="l"><a href="${pU(x.p)}">${esc(niceName(x.p.n))}</a></td><td class="l">${tL(tcOf(x.p))}</td>${extraTd(x)}<td>${x.G}</td><td>${f1(x.min)}</td><td>${f1(x.pts)}</td><td>${f1(x.reb)}</td><td>${f1(x.ast)}</td><td><b>${f1(x.pir)}</b></td></tr>`).join('')}</tbody></table></div></article>`,
          ld: [itemList(`${LEADX[key]} ${S}`, L), crumbs([[SITE_NAME, B(LG)], [T('Κορυφαίοι', 'Leaders', 'Líderes', 'Lideri'), urlFor(LG, 'lead')], [LEADX[key], urlFor(LG, 'lead:' + key)]])] });
      };
      const GRk = rows.filter(x => x.G > 0 && /^gre/i.test(x.p.ct || '')).sort((a, b) => b.pir - a.pir);
      if (GRk.length) await listPage('gr', GRk, T(`Οι ${GRk.length} Έλληνες παίκτες που έχουν αγωνιστεί φέτος στην EuroLeague, με τους μέσους όρους τους. Πρώτος σε PIR ο ${niceName(GRk[0].p.n)} (${f1(GRk[0].pir)}).`, `The ${GRk.length} Greek players who have played in the EuroLeague this season, with their averages. Top in PIR: ${niceName(GRk[0].p.n)} (${f1(GRk[0].pir)}).`, `Los ${GRk.length} jugadores griegos que han jugado esta temporada en la EuroLeague, con sus promedios. El mejor en PIR: ${niceName(GRk[0].p.n)} (${f1(GRk[0].pir)}).`, `${GRk.length} grčkih igrača koji su ove sezone igrali u Evroligi, sa prosecima. Najbolji po PIR-u: ${niceName(GRk[0].p.n)} (${f1(GRk[0].pir)}).`), '', () => '');
      const YG = rows.filter(x => x.G > 0 && x.p.bd).sort((a, b) => b.p.bd.localeCompare(a.p.bd)).slice(0, 30);
      const ageOf = bd => { const d = new Date(bd), n = new Date(data.fetchedAt); let y = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) y--; return y; };
      if (YG.length) await listPage('yg', YG, T(`Οι 30 νεότεροι παίκτες που έχουν αγωνιστεί φέτος στην EuroLeague. Ο νεότερος είναι ο ${niceName(YG[0].p.n)}, ${ageOf(YG[0].p.bd)} ετών.`, `The 30 youngest players who have played in the EuroLeague this season. The youngest is ${niceName(YG[0].p.n)}, aged ${ageOf(YG[0].p.bd)}.`, `Los 30 jugadores más jóvenes que han jugado esta temporada en la EuroLeague. El más joven es ${niceName(YG[0].p.n)}, de ${ageOf(YG[0].p.bd)} años.`, `30 najmlađih igrača koji su ove sezone igrali u Evroligi. Najmlađi je ${niceName(YG[0].p.n)}, ${ageOf(YG[0].p.bd)} godina.`), `<th>${T('Ηλικία', 'Age', 'Edad', 'Godine')}</th>`, x => `<td>${ageOf(x.p.bd)}</td>`);
      // ---- παίκτες ανά εθνικότητα
      {
        const ISO = { 'France': 'FR', 'Germany': 'DE', 'Italy': 'IT', 'Israel': 'IL', 'Serbia': 'RS', 'United States of America': 'US', 'Spain': 'ES', 'Lithuania': 'LT', 'Turkiye': 'TR', 'Turkey': 'TR', 'Greece': 'GR', 'Canada': 'CA', 'Dominican Republic': 'DO', 'Latvia': 'LV', 'Slovenia': 'SI', 'Nigeria': 'NG', 'Ireland': 'IE', 'Brazil': 'BR', 'United Kingdom': 'GB', 'North Macedonia': 'MK', 'Senegal': 'SN', 'Slovakia': 'SK', 'Georgia': 'GE', 'Finland': 'FI', 'Guinea': 'GN', 'Sweden': 'SE', 'Denmark': 'DK', 'Czech Republic': 'CZ', 'Poland': 'PL', 'Chile': 'CL', 'Hungary': 'HU', 'South Sudan': 'SS', 'Bahamas': 'BS', 'Angola': 'AO', 'Bulgaria': 'BG', 'Croatia': 'HR', 'Australia': 'AU', 'Cabo Verde': 'CV', 'Mali': 'ML', 'Montenegro': 'ME', 'Bosnia and Herzegovina': 'BA', 'Russia': 'RU', 'Ukraine': 'UA', 'Belgium': 'BE', 'Netherlands': 'NL', 'Argentina': 'AR', 'Mexico': 'MX', 'Puerto Rico': 'PR', 'Cameroon': 'CM', 'Congo': 'CG', 'DR Congo': 'CD', 'Austria': 'AT', 'Portugal': 'PT', 'Estonia': 'EE', 'Venezuela': 'VE', 'Uruguay': 'UY', 'Jamaica': 'JM', 'New Zealand': 'NZ', 'Switzerland': 'CH', 'Norway': 'NO', 'Iceland': 'IS', 'Cyprus': 'CY', 'Albania': 'AL', 'Kosovo': 'XK', 'Japan': 'JP', 'China': 'CN', 'Philippines': 'PH', 'Egypt': 'EG', 'Tunisia': 'TN', 'Morocco': 'MA', 'Ivory Coast': 'CI', "Cote d'Ivoire": 'CI', 'Ghana': 'GH', 'Gabon': 'GA', 'Haiti': 'HT', 'Panama': 'PA', 'Colombia': 'CO', 'Cuba': 'CU' };
        const RN = new Intl.DisplayNames([{ el: 'el', en: 'en', es: 'es', sr: 'sr-Latn' }[LG]], { type: 'region' });
        const cName = ct => { try { return ISO[ct] ? RN.of(ISO[ct]) : ct; } catch { return ct; } };
        const byC = {};
        for (const x of rows.filter(x => x.G > 0 && x.p.ct)) (byC[x.p.ct] = byC[x.p.ct] || []).push(x);
        const list = Object.entries(byC).filter(([ct, l]) => l.length >= 2 && ISO[ct] && ISO[ct] !== 'GR').sort((a, b) => b[1].length - a[1].length || cName(a[0]).localeCompare(cName(b[0])));
        const thr2 = `<th>${T('Αγ.', 'G', 'PJ', 'Ut.')}</th><th>${T('Λεπ.', 'Min', 'Min', 'Min')}</th>`;
        for (const [ct, L0] of list) {
          const L = L0.slice().sort((a, b) => b.pir - a.pir), cn = cName(ct), code = ISO[ct].toLowerCase();
          const intro = T(`${L.length} παίκτες με εθνικότητα ${cn} έχουν αγωνιστεί φέτος στην EuroLeague. Πρώτος σε PIR: ${niceName(L[0].p.n)} (${tName(tcOf(L[0].p))}, ${f1(L[0].pir)} PIR, ${f1(L[0].pts)} πόντοι).`, `${L.length} players from ${cn} have played in the EuroLeague this season. Top in PIR: ${niceName(L[0].p.n)} (${tName(tcOf(L[0].p))}, ${f1(L[0].pir)} PIR, ${f1(L[0].pts)} points).`, `${L.length} jugadores de ${cn} han jugado esta temporada en la EuroLeague. El mejor en PIR: ${niceName(L[0].p.n)} (${tName(tcOf(L[0].p))}, ${f1(L[0].pir)} de PIR, ${f1(L[0].pts)} puntos).`, `Ove sezone u Evroligi je igralo ${L.length} igrača, nacionalnost: ${cn}. Najbolji po PIR-u: ${niceName(L[0].p.n)} (${tName(tcOf(L[0].p))}, ${f1(L[0].pir)} PIR, ${f1(L[0].pts)} poena).`);
          const h1 = T(`EuroLeague ${SEASON_LABEL}: παίκτες με εθνικότητα ${cn}`, `Players from ${cn} in the EuroLeague ${SEASON_LABEL}`, `Jugadores de ${cn} en la EuroLeague ${SEASON_LABEL}`, `Evroliga ${SEASON_LABEL}: igrači, nacionalnost ${cn}`);
          await simplePage('nat:' + code, { view: 'lead', title: `${h1} | ${SITE_NAME}`, desc: intro,
            main: `<article class="article lead wide"><p class="crumbs"><a href="${urlFor(LG, 'nat')}">${T('Παίκτες ανά εθνικότητα', 'Players by nationality', 'Jugadores por nacionalidad', 'Igrači po nacionalnosti')}</a></p><h1>${esc(h1)}</h1><p class="lede2">${esc(intro)}</p><div class="tbl"><table><thead><tr><th class="l">${T('Παίκτης', 'Player', 'Jugador', 'Igrač')}</th><th class="l">${T('Ομάδα', 'Team', 'Equipo', 'Tim')}</th>${thr2}<th>${T('Π', 'Pts', 'Pts', 'Poe')}</th><th>${T('Ριμπ.', 'Reb', 'Reb', 'Sko')}</th><th>${T('Ασ.', 'Ast', 'Asi', 'Asi')}</th><th>PIR</th></tr></thead><tbody>${L.map(x => `<tr><td class="l"><a href="${pU(x.p)}">${esc(niceName(x.p.n))}</a></td><td class="l">${tL(tcOf(x.p))}</td><td>${x.G}</td><td>${f1(x.min)}</td><td>${f1(x.pts)}</td><td>${f1(x.reb)}</td><td>${f1(x.ast)}</td><td><b>${f1(x.pir)}</b></td></tr>`).join('')}</tbody></table></div>${qNote.replace(/<p class="note">.*?\. /, '<p class="note">')}</article>`,
            ld: [itemList(h1, L), crumbs([[SITE_NAME, B(LG)], [T('Εθνικότητες', 'Nationalities', 'Nacionalidades', 'Nacionalnosti'), urlFor(LG, 'nat')], [cn, urlFor(LG, 'nat:' + code)]])] });
        }
        const grN = (byC['Greece'] || []).length;
        await simplePage('nat', { view: 'lead', title: T(`Παίκτες EuroLeague ${SEASON_LABEL} ανά εθνικότητα | ${SITE_NAME}`, `EuroLeague ${SEASON_LABEL} players by nationality | ${SITE_NAME}`, `Jugadores de la EuroLeague ${SEASON_LABEL} por nacionalidad | ${SITE_NAME}`, `Igrači Evrolige ${SEASON_LABEL} po nacionalnosti | ${SITE_NAME}`),
          desc: T(`Από πόσες χώρες είναι οι παίκτες της EuroLeague ${SEASON_LABEL}: ${list.length + (grN ? 1 : 0)} χώρες με τουλάχιστον δύο παίκτες, με τα στατιστικά τους.`, `Where the EuroLeague ${SEASON_LABEL} players come from: ${list.length + (grN ? 1 : 0)} countries with at least two players, with their stats.`, `De dónde son los jugadores de la EuroLeague ${SEASON_LABEL}: ${list.length + (grN ? 1 : 0)} países con al menos dos jugadores, con sus estadísticas.`, `Odakle su igrači Evrolige ${SEASON_LABEL}: ${list.length + (grN ? 1 : 0)} zemalja sa najmanje dva igrača, sa statistikom.`),
          main: `<article class="article lead"><h1>${T('Παίκτες ανά εθνικότητα', 'Players by nationality', 'Jugadores por nacionalidad', 'Igrači po nacionalnosti')}</h1><p class="lede2">${esc(T(`Οι παίκτες της ${S} ανά χώρα, με τον καλύτερο της κάθε χώρας σε PIR.`, `The ${S} players by country, with each country’s best by PIR.`, `Los jugadores de la ${S} por país, con el mejor de cada uno por PIR.`, `Igrači ${S} po zemljama, sa najboljim po PIR-u.`))}</p>${hubLinks(['gr', 'yg'])}<div class="tbl"><table><thead><tr><th class="l">${T('Χώρα', 'Country', 'País', 'Zemlja')}</th><th>${T('Παίκτες', 'Players', 'Jugadores', 'Igrači')}</th><th class="l">${T('Καλύτερος', 'Best', 'Mejor', 'Najbolji')}</th></tr></thead><tbody>${grN ? `<tr><td class="l"><a href="${urlFor(LG, 'lead:gr')}">${esc(cName('Greece'))}</a></td><td>${grN}</td><td class="l">${esc(niceName(byC.Greece.slice().sort((a, b) => b.pir - a.pir)[0].p.n))}</td></tr>` : ''}${list.map(([ct, L]) => `<tr><td class="l"><a href="${urlFor(LG, 'nat:' + ISO[ct].toLowerCase())}">${esc(cName(ct))}</a></td><td>${L.length}</td><td class="l">${esc(niceName(L.slice().sort((a, b) => b.pir - a.pir)[0].p.n))}</td></tr>`).join('')}</tbody></table></div></article>`,
          ld: crumbs([[SITE_NAME, B(LG)], [T('Εθνικότητες', 'Nationalities', 'Nacionalidades', 'Nacionalnosti'), urlFor(LG, 'nat')]]) });
      }
      // ---- βραβεία: MVP και πεντάδα κάθε αγωνιστικής, MVP και rookie του μήνα
      {
        const veterans = new Set(Object.values(data.hist || {}).flatMap(h => (h.rows || []).map(r => r[0])));
        const haveHist = veterans.size > 0;
        const perfR = r => players.flatMap(p => p.g.filter(x => x[0] === r && x[7] > 0).map(x => ({ p, x })));
        const fiveOf = L => { const pick = []; for (const [ps, n] of [['Guard', 2], ['Forward', 2], ['Center', 1]]) pick.push(...L.filter(o => o.p.pos === ps).sort((a, b) => b.x[25] - a.x[25]).slice(0, n)); return pick; };
        const line = o => `${o.x[8]} ${T('π', 'pts', 'pts', 'p')} · ${o.x[15] + o.x[16]} ${T('ρ', 'reb', 'reb', 's')} · ${o.x[17]} ${T('α', 'ast', 'ast', 'a')} · <b>${o.x[25]} PIR</b>`;
        const gameL = o => { const me = tcOf(o.p), home = o.x[3] === 1, h = home ? me : o.x[2], a = home ? o.x[2] : me, g = league.games.find(g => g[0] === o.x[0] && g[2] === h && g[3] === a); return g ? `<a href="${urlFor(LG, `game:${g[0]}|${g[2]}|${g[3]}`)}">${esc(tName(g[2]))} – ${esc(tName(g[3]))} ${LG === 'sr' ? `${g[4]}:${g[5]}` : `${g[4]}-${g[5]}`}</a>` : ''; };
        const rounds = doneRounds.slice().sort((a, b) => b - a);
        const roundAw = rounds.map(r => { const L = perfR(r).sort((a, b) => b.x[25] - a.x[25] || b.x[8] - a.x[8]); return { r, mvp: L[0], five: fiveOf(L) }; }).filter(x => x.mvp);
        // months (by game date): MVP = best average PIR; newcomer = no EuroLeague games in the history seasons
        const months = [...new Set(players.flatMap(p => p.g.map(x => x[1].slice(0, 7))))].sort().reverse();
        const monthName = ym => new Date(ym + '-15T12:00:00Z').toLocaleDateString(LOC0, { day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(/^\d+\.?\s*(de\s+)?/, '').replace(/\s*\d+\.?$/, '');
        const monthAw = months.map(ym => {
          const L = players.map(p => { const g = p.g.filter(x => x[7] > 0 && x[1].startsWith(ym)); const n = g.length; return n ? { p, n, pir: g.reduce((s, x) => s + x[25], 0) / n, pts: g.reduce((s, x) => s + x[8], 0) / n, reb: g.reduce((s, x) => s + x[15] + x[16], 0) / n, ast: g.reduce((s, x) => s + x[17], 0) / n } : null; }).filter(Boolean);
          const maxN = Math.max(0, ...L.map(o => o.n)), minN = Math.max(2, Math.ceil(maxN * 0.6));
          const q = L.filter(o => o.n >= minN).sort((a, b) => b.pir - a.pir);
          const rk = haveHist ? L.filter(o => o.n >= Math.max(2, minN - 1) && !veterans.has(o.p.c)).sort((a, b) => b.pir - a.pir) : [];
          return { ym, minN, top: q.slice(0, 5), rookie: rk.slice(0, 3) };
        }).filter(m => m.top.length);
        const awUrl = ym => urlFor(LG, 'awards:' + ym);
        const mRow = o => `<tr><td class="l"><a href="${pU(o.p)}">${esc(niceName(o.p.n))}</a> <small>${esc(tName(tcOf(o.p)))}</small></td><td>${o.n}</td><td>${f1(o.pts)}</td><td>${f1(o.reb)}</td><td>${f1(o.ast)}</td><td><b>${f1(o.pir)}</b></td></tr>`;
        const mHead = `<tr><th class="l">${T('Παίκτης', 'Player', 'Jugador', 'Igrač')}</th><th>${T('Αγ.', 'G', 'PJ', 'Ut.')}</th><th>${T('Π', 'Pts', 'Pts', 'Poe')}</th><th>${T('Ριμπ.', 'Reb', 'Reb', 'Sko')}</th><th>${T('Ασ.', 'Ast', 'Asi', 'Asi')}</th><th>PIR</th></tr>`;
        for (const m of monthAw) {
          const mn = monthName(m.ym), yr = m.ym.slice(0, 4), mvp = m.top[0];
          const h1 = T(`MVP ${mn} ${yr} στην EuroLeague`, `EuroLeague MVP of ${mn} ${yr}`, `MVP de ${mn} de ${yr} en la EuroLeague`, `MVP Evrolige za ${mn} ${yr}.`);
          const intro = T(`MVP του ${mn} στην EuroLeague: ${niceName(mvp.p.n)} (${tName(tcOf(mvp.p))}) με ${f1(mvp.pir)} PIR, ${f1(mvp.pts)} πόντους, ${f1(mvp.reb)} ριμπάουντ και ${f1(mvp.ast)} ασίστ σε ${mvp.n} αγώνες.${m.rookie[0] ? ` Νεοφερμένος του μήνα: ${niceName(m.rookie[0].p.n)} (${f1(m.rookie[0].pir)} PIR).` : ''}`, `EuroLeague MVP of ${mn}: ${niceName(mvp.p.n)} (${tName(tcOf(mvp.p))}) with ${f1(mvp.pir)} PIR, ${f1(mvp.pts)} points, ${f1(mvp.reb)} rebounds and ${f1(mvp.ast)} assists in ${mvp.n} games.${m.rookie[0] ? ` Newcomer of the month: ${niceName(m.rookie[0].p.n)} (${f1(m.rookie[0].pir)} PIR).` : ''}`, `MVP de ${mn} en la EuroLeague: ${niceName(mvp.p.n)} (${tName(tcOf(mvp.p))}), con ${f1(mvp.pir)} de PIR, ${f1(mvp.pts)} puntos, ${f1(mvp.reb)} rebotes y ${f1(mvp.ast)} asistencias en ${mvp.n} partidos.${m.rookie[0] ? ` Novato del mes: ${niceName(m.rookie[0].p.n)} (${f1(m.rookie[0].pir)} de PIR).` : ''}`, `MVP Evrolige za ${mn}: ${niceName(mvp.p.n)} (${tName(tcOf(mvp.p))}) sa ${f1(mvp.pir)} PIR-a, ${f1(mvp.pts)} poena, ${f1(mvp.reb)} skokova i ${f1(mvp.ast)} asistencija u ${mvp.n} utakmica.${m.rookie[0] ? ` Novajlija meseca: ${niceName(m.rookie[0].p.n)} (${f1(m.rookie[0].pir)} PIR).` : ''}`);
          await simplePage('awards:' + m.ym, { view: 'lead', title: `${h1} | ${SITE_NAME}`, desc: intro.slice(0, 300),
            main: `<article class="article lead"><p class="crumbs"><a href="${urlFor(LG, 'awards')}">${T('Βραβεία EuroLeague', 'EuroLeague awards', 'Premios de la EuroLeague', 'Nagrade Evrolige')}</a></p><h1>${esc(h1)}</h1><p class="lede2">${esc(intro)}</p><h2>${T('Οι 5 καλύτεροι του μήνα', 'Top 5 of the month', 'Los 5 mejores del mes', '5 najboljih u mesecu')}</h2><div class="tbl"><table><thead>${mHead}</thead><tbody>${m.top.map(mRow).join('')}</tbody></table></div>${m.rookie.length ? `<h2>${T('Νεοφερμένοι του μήνα', 'Newcomers of the month', 'Novatos del mes', 'Novajlije meseca')}</h2><p class="sub">${T(`Παίκτες χωρίς συμμετοχή στην EuroLeague από το ${HIST_FROM}-${String(HIST_FROM + 1).slice(2)} ως πέρσι`, `Players with no EuroLeague games from ${HIST_FROM}-${String(HIST_FROM + 1).slice(2)} to last season`, `Jugadores sin partidos en la EuroLeague desde la ${HIST_FROM}-${String(HIST_FROM + 1).slice(2)} hasta la temporada pasada`, `Igrači bez utakmica u Evroligi od ${HIST_FROM}-${String(HIST_FROM + 1).slice(2)} do prošle sezone`)}</p><div class="tbl"><table><thead>${mHead}</thead><tbody>${m.rookie.map(mRow).join('')}</tbody></table></div>` : ''}<p class="note">${T(`Μετράνε οι αγώνες του μήνα· για τον MVP χρειάζονται τουλάχιστον ${m.minN} αγώνες. Τα βραβεία βγαίνουν αυτόματα από τα στατιστικά και δεν είναι τα επίσημα της EuroLeague.`, `Games played in the month; the MVP needs at least ${m.minN} games. The awards are computed from the stats and are not the official EuroLeague awards.`, `Cuentan los partidos del mes; el MVP necesita al menos ${m.minN} partidos. Los premios se calculan con las estadísticas y no son los oficiales de la EuroLeague.`, `Računaju se utakmice u mesecu; za MVP je potrebno najmanje ${m.minN} utakmica. Nagrade se računaju iz statistike i nisu zvanične nagrade Evrolige.`)}</p></article>`,
            ld: crumbs([[SITE_NAME, B(LG)], [T('Βραβεία', 'Awards', 'Premios', 'Nagrade'), urlFor(LG, 'awards')], [h1, awUrl(m.ym)]]) });
        }
        const pos5 = p => ({ Guard: T('Γ', 'G', 'B', 'B'), Forward: T('Φ', 'F', 'A', 'K'), Center: T('Σ', 'C', 'P', 'C') })[p.pos] || '';
        await simplePage('awards', { view: 'lead', title: T(`Βραβεία EuroLeague ${SEASON_LABEL}: MVP αγωνιστικής, πεντάδα, MVP και νεοφερμένος του μήνα | ${SITE_NAME}`, `EuroLeague ${SEASON_LABEL} awards: round MVP, team of the round, MVP and newcomer of the month | ${SITE_NAME}`, `Premios de la EuroLeague ${SEASON_LABEL}: MVP de la jornada, quinteto, MVP y novato del mes | ${SITE_NAME}`, `Nagrade Evrolige ${SEASON_LABEL}: MVP kola, idealna petorka, MVP i novajlija meseca | ${SITE_NAME}`),
          desc: T(`Ο MVP και η πεντάδα κάθε αγωνιστικής της ${S}, ο MVP και ο νεοφερμένος κάθε μήνα, από τα στατιστικά.`, `The MVP and team of every round of the ${S}, and the MVP and newcomer of every month, from the stats.`, `El MVP y el quinteto de cada jornada de la ${S}, y el MVP y el novato de cada mes, según las estadísticas.`, `MVP i idealna petorka svakog kola ${S} i MVP i novajlija svakog meseca, iz statistike.`),
          main: `<article class="article lead wide"><h1>${T('Βραβεία', 'Awards', 'Premios', 'Nagrade')} ${S}</h1><p class="lede2">${esc(T('Αυτόματα από τα στατιστικά: ο MVP και η πεντάδα (2 γκαρντ, 2 φόργουορντ, 1 σέντερ) κάθε αγωνιστικής και τα βραβεία κάθε μήνα.', 'Computed from the stats: the MVP and team (2 guards, 2 forwards, 1 center) of every round and the monthly awards.', 'Calculado con las estadísticas: el MVP y el quinteto (2 bases/escoltas, 2 aleros, 1 pívot) de cada jornada y los premios de cada mes.', 'Iz statistike: MVP i idealna petorka (2 beka, 2 krila, 1 centar) svakog kola i mesečne nagrade.'))}</p>
${monthAw.length ? `<h2>${T('Βραβεία του μήνα', 'Monthly awards', 'Premios del mes', 'Mesečne nagrade')}</h2><div class="tbl"><table><thead><tr><th class="l">${T('Μήνας', 'Month', 'Mes', 'Mesec')}</th><th class="l">MVP</th><th class="l">${T('Νεοφερμένος', 'Newcomer', 'Novato', 'Novajlija')}</th></tr></thead><tbody>${monthAw.map(m => `<tr><td class="l"><a href="${awUrl(m.ym)}">${esc(LG === 'el' ? ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'][+m.ym.slice(5, 7) - 1] : new Date(m.ym + '-15T12:00:00Z').toLocaleDateString(LOC0, { month: 'long', timeZone: 'UTC' }).replace(/^./, c => c.toUpperCase()))} ${m.ym.slice(0, 4)}</a></td><td class="l">${esc(niceName(m.top[0].p.n))} <small>${f1(m.top[0].pir)}</small></td><td class="l">${m.rookie[0] ? `${esc(niceName(m.rookie[0].p.n))} <small>${f1(m.rookie[0].pir)}</small>` : '–'}</td></tr>`).join('')}</tbody></table></div>` : ''}
<h2>${T('MVP και πεντάδα κάθε αγωνιστικής', 'MVP and team of every round', 'MVP y quinteto de cada jornada', 'MVP i petorka svakog kola')}</h2>
${roundAw.map(a => `<section class="award"><h3>${esc(rdTxt0(a.r))}</h3><p>MVP: <a href="${pU(a.mvp.p)}"><b>${esc(niceName(a.mvp.p.n))}</b></a> (${esc(tName(tcOf(a.mvp.p)))}) · ${line(a.mvp)} · ${gameL(a.mvp)}</p><ul class="five">${a.five.map(o => `<li><span class="fxslot">${pos5(o.p)}</span> <a href="${pU(o.p)}">${esc(niceName(o.p.n))}</a> <small>${esc(tName(tcOf(o.p)))}</small> · ${line(o)}</li>`).join('')}</ul></section>`).join('')}
</article>`, ld: crumbs([[SITE_NAME, B(LG)], [T('Βραβεία', 'Awards', 'Premios', 'Nagrade'), urlFor(LG, 'awards')]]) });
      }
      // κεντρική σελίδα κορυφαίων
      const card = k => { const L = qual.slice().sort((a, b) => b[k] - a[k]).slice(0, 5); return `<div><h2><a href="${urlFor(LG, 'lead:' + k)}">${esc(STAT[k][1])}</a></h2><ol class="leadol">${L.map(x => `<li><a href="${pU(x.p)}">${esc(niceName(x.p.n))}</a> <small>${esc(tName(tcOf(x.p)))}</small><b>${f1(x[k])}</b></li>`).join('')}</ol><p><a class="pread" href="${urlFor(LG, 'lead:' + k)}">${T('Όλη η λίστα →', 'Full list →', 'Lista completa →', 'Cela lista →')}</a></p></div>`; };
      await simplePage('lead', { view: 'lead', title: T(`Κορυφαίοι παίκτες EuroLeague ${SEASON_LABEL}: σκόρερ, ριμπάουντ, ασίστ, ρεκόρ | ${SITE_NAME}`, `EuroLeague ${SEASON_LABEL} leaders: scorers, rebounds, assists, records | ${SITE_NAME}`, `Líderes de la EuroLeague ${SEASON_LABEL}: anotadores, rebotes, asistencias, récords | ${SITE_NAME}`, `Lideri Evrolige ${SEASON_LABEL}: strelci, skokovi, asistencije, rekordi | ${SITE_NAME}`),
        desc: T(`Οι κορυφαίοι παίκτες της ${S} σε πόντους, ριμπάουντ, ασίστ, PIR, τρίποντα, κλεψίματα και κοψίματα, τα ρεκόρ αγώνα, οι Έλληνες και οι νεότεροι παίκτες.`, `The ${S} leaders in points, rebounds, assists, PIR, threes, steals and blocks, plus single-game records, Greek players and the youngest players.`, `Los líderes de la ${S} en puntos, rebotes, asistencias, PIR, triples, robos y tapones, además de récords en un partido, jugadores griegos y los más jóvenes.`, `Lideri ${S} u poenima, skokovima, asistencijama, PIR-u, trojkama, ukradenim loptama i blokadama, rekordi utakmice, grčki i najmlađi igrači.`),
        main: `<article class="article lead wide"><h1>${T('Κορυφαίοι', 'Leaders', 'Líderes', 'Lideri')} ${S}</h1><p class="lede2">${esc(upd)}.</p>${hubLinks(['rec', 'gr', 'yg'])}<div class="leadgrid">${Object.keys(STAT).map(card).join('')}</div>${qNote}</article>`,
        ld: crumbs([[SITE_NAME, B(LG)], [T('Κορυφαίοι', 'Leaders', 'Líderes', 'Lideri'), urlFor(LG, 'lead')]]) });
    }

    // ---- EuroCup: όμιλοι, αγωνιστικές, κορυφαίοι παίκτες και σελίδα για κάθε ομάδα
    if (data.ec && data.ec.games.length) {
      const EC = data.ec, ET = EC.teams;
      const EC_GR = { ARI: 'Άρης', PAO: 'ΠΑΟΚ' };
      const ecName = c => (LG === 'el' && EC_GR[c]) || (ET[c] ? ET[c][1] : c);
      const ecFull = c => (LG === 'el' && EC_GR[c]) || (ET[c] ? ET[c][0] : c);
      const ecSlug = c => slugify(ET[c] ? ET[c][0] : c);
      const PAL = ['#c8102e', '#00529b', '#007a3d', '#f28c00', '#5b2c83', '#00838f', '#8d6e63', '#d81b60', '#3949ab', '#2e7d32', '#6d4c41', '#ad1457'];
      const ecCol = c => PAL[[...c].reduce((s, ch) => s + ch.charCodeAt(0), 0) % PAL.length];
      const crest = (c, big) => `<span class="${big ? 'bigcrest' : 'crest'}" style="background:${ecCol(c)}">${esc(ET[c] ? ET[c][2] : c)}</span>`;
      const tlink = c => `<a href="${urlFor(LG, 'ec:' + ecSlug(c))}">${esc(ecName(c))}</a>`;
      const loc = { el: 'el-GR', en: 'en-GB', es: 'es-ES', sr: 'sr-Latn-RS' }[LG];
      const when = iso => new Date(iso).toLocaleString(loc, { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const sc = g => LG === 'sr' ? `${g[4]}:${g[5]}` : `${g[4]}-${g[5]}`;
      const rd = r => T(`${r}η αγωνιστική`, `Round ${r}`, `Jornada ${r}`, `${r}. kolo`);
      const pct = (m, a) => a ? Math.round(100 * m / a) + '%' : '–';
      const lr = EC.lastRound;
      const nextR = (EC.games.find(g => !g[6]) || [0])[0];
      const groups = [...new Set(Object.values(ET).map(t => t[3]))].filter(Boolean).sort();
      const standOf = gname => EC.stand.filter(s => s[0] === gname).sort((a, b) => a[1] - b[1]);
      const form = f => [...f].map(x => `<i class="ecf ${x === 'W' ? 'w' : 'l'}">${x === 'W' ? T('Ν', 'W', 'V', 'P') : T('Η', 'L', 'D', 'I')}</i>`).join('');
      const standTbl = gname => `<div class="tbl"><table><thead><tr><th>#</th><th class="l">${T('Ομάδα', 'Team', 'Equipo', 'Tim')}</th><th>${T('Ν', 'W', 'V', 'P')}</th><th>${T('Η', 'L', 'D', 'I')}</th><th>+/−</th><th class="ecform">${T('Φόρμα', 'Form', 'Racha', 'Forma')}</th></tr></thead><tbody>${standOf(gname).map(s => `<tr${s[1] <= 4 ? ' class="ecq"' : ''}><td>${s[1]}</td><td class="l"><span class="ectn">${crest(s[2])}${tlink(s[2])}</span></td><td>${s[3]}</td><td>${s[4]}</td><td>${s[5] - s[6] > 0 ? '+' : ''}${s[5] - s[6]}</td><td class="ecform">${form(s[9])}</td></tr>`).join('')}</tbody></table></div>`;
      const fxCard = g => `<div class="fx"><span class="when">${esc(T('Όμιλος', 'Group', 'Grupo', 'Grupa'))} ${esc(ET[g[2]]?.[3] || '')} · ${g[6] ? rd(g[0]) : esc(when(g[1]))}</span><div class="row"><span class="ectn">${crest(g[2])}${tlink(g[2])}</span><b>${g[6] ? g[4] : ''}</b></div><div class="row"><span class="ectn">${crest(g[3])}${tlink(g[3])}</span><b>${g[6] ? g[5] : ''}</b></div></div>`;
      const pSlug = {}; { const used = new Set(); for (const p of EC.players) { let sl = slugify(p.n) || p.c; if (used.has(p.t + '/' + sl)) sl += '-' + p.c; used.add(p.t + '/' + sl); pSlug[p.c] = ecSlug(p.t) + '/' + sl; } }
      const plink = p => `<a href="${urlFor(LG, 'ec:' + pSlug[p.c])}">${esc(p.n)}</a>`;
      const minG = Math.max(1, Math.ceil(lr / 2));
      const qual = EC.players.filter(p => p.gp >= minG && p.min >= 10);
      const LEAD = [['pir', 'PIR'], ['pts', T('Πόντοι', 'Points', 'Puntos', 'Poeni')], ['reb', T('Ριμπάουντ', 'Rebounds', 'Rebotes', 'Skokovi')], ['ast', T('Ασίστ', 'Assists', 'Asistencias', 'Asistencije')]];
      const leadTbl = ([k, lab]) => `<div><h3>${lab}</h3><div class="tbl"><table><tbody>${qual.slice().sort((a, b) => b[k] - a[k]).slice(0, 10).map((p, i) => `<tr><td>${i + 1}</td><td class="l">${plink(p)} <small class="muted">${tlink(p.t)}</small></td><td><b>${f1(p[k])}</b></td></tr>`).join('')}</tbody></table></div></div>`;
      const src = `<p class="note">${T('Πηγή: επίσημα στατιστικά της EuroCup. Μέσοι όροι ανά αγώνα· στους κορυφαίους μετράνε όσοι έχουν τουλάχιστον', 'Source: official EuroCup stats. Per-game averages; leaders include players with at least', 'Fuente: estadísticas oficiales de la EuroCup. Promedios por partido; en los líderes cuentan quienes tienen al menos', 'Izvor: zvanična statistika Evrokupa. Proseci po utakmici; među najboljima su igrači sa najmanje')} ${minG} ${T('αγώνες και 10 λεπτά.', 'games and 10 minutes.', 'partidos y 10 minutos.', 'utakmica i 10 minuta.')}</p>`;
      const ECL = `EuroCup ${SEASON_LABEL}`;
      const main = `<section class="article ec">
<h1>${ECL}</h1>
<p class="lede2">${T('Βαθμολογία των τεσσάρων ομίλων, αποτελέσματα, πρόγραμμα και οι κορυφαίοι παίκτες της EuroCup, με τον Άρη και τον ΠΑΟΚ.', 'Standings of all four groups, results, schedule and the top players of the EuroCup.', 'Clasificación de los cuatro grupos, resultados, calendario y los mejores jugadores de la EuroCup.', 'Tabele sve četiri grupe, rezultati, raspored i najbolji igrači Evrokupa.')} ${lr ? T(`Έως και την ${lr}η αγωνιστική.`, `Through Round ${lr}.`, `Hasta la jornada ${lr}.`, `Zaključno sa ${lr}. kolom.`) : ''}</p>
<p class="sub">${T('Οι τέσσερις πρώτοι κάθε ομίλου (με χρώμα) περνούν στα playoffs, που ξεκινούν από τους «16», με σειρές στις δύο νίκες.', 'The top four of each group (highlighted) reach the playoffs, which start from the Round of 16 with best-of-three series.', 'Los cuatro primeros de cada grupo (resaltados) pasan a los playoffs, que empiezan en octavos con series al mejor de tres.', 'Prve četiri ekipe iz svake grupe (označene) idu u plej-of, koji počinje od osmine finala, u serijama na dve pobede.')}</p>
<div class="ecgrid">${groups.map(gn => `<div><h2>${T('Όμιλος', 'Group', 'Grupo', 'Grupa')} ${esc(gn)}</h2>${standTbl(gn)}</div>`).join('')}</div>
${lr ? `<h2>${T('Αποτελέσματα', 'Results', 'Resultados', 'Rezultati')}: ${rd(lr)}</h2><div class="ecfx">${EC.games.filter(g => g[0] === lr && g[6]).map(fxCard).join('')}</div>` : ''}
${nextR ? `<h2>${T('Επόμενοι αγώνες', 'Next games', 'Próximos partidos', 'Naredne utakmice')}: ${rd(nextR)}</h2><div class="ecfx">${EC.games.filter(g => g[0] === nextR && !g[6]).map(fxCard).join('')}</div>` : ''}
${qual.length ? `<h2>${T('Κορυφαίοι παίκτες', 'Top players', 'Mejores jugadores', 'Najbolji igrači')}</h2><div class="ecgrid">${LEAD.map(leadTbl).join('')}</div>` : ''}
${src}
</section>`;
      await simplePage('ec', { view: 'eurocup', title: T(`EuroCup ${SEASON_LABEL}: βαθμολογία, αποτελέσματα, πρόγραμμα | ${SITE_NAME}`, `EuroCup ${SEASON_LABEL}: standings, results, schedule | ${SITE_NAME}`, `EuroCup ${SEASON_LABEL}: clasificación, resultados, calendario | ${SITE_NAME}`, `Evrokup ${SEASON_LABEL}: tabela, rezultati, raspored | ${SITE_NAME}`),
        desc: T(`Η βαθμολογία των ομίλων της EuroCup ${SEASON_LABEL}, αποτελέσματα, πρόγραμμα και κορυφαίοι παίκτες, με τον Άρη και τον ΠΑΟΚ.`, `EuroCup ${SEASON_LABEL} group standings, results, schedule and top players.`, `Clasificación de los grupos de la EuroCup ${SEASON_LABEL}, resultados, calendario y mejores jugadores.`, `Tabele grupa Evrokupa ${SEASON_LABEL}, rezultati, raspored i najbolji igrači.`), main });

      for (const c of Object.keys(ET)) {
        const gs = EC.games.filter(g => g[2] === c || g[3] === c);
        const st = EC.stand.find(s => s[2] === c);
        const ros = EC.players.filter(p => p.t === c).sort((a, b) => b.min - a.min);
        const res = g => { const home = g[2] === c, my = home ? g[4] : g[5], op = home ? g[5] : g[4]; return `<b class="${my > op ? 'ecw' : 'ecl'}">${my > op ? T('Ν', 'W', 'V', 'P') : T('Η', 'L', 'D', 'I')} ${LG === 'sr' ? `${my}:${op}` : `${my}-${op}`}</b>`; };
        const tmain = `<section class="article ec">
<p class="crumbs"><a href="${urlFor(LG, 'ec')}">${ECL}</a></p>
<div class="echead">${crest(c, 1)}<div><h1>${esc(ecFull(c))}</h1><p class="sub">${T('Όμιλος', 'Group', 'Grupo', 'Grupa')} ${esc(ET[c][3])}${st ? ` · ${st[1]}${T('η θέση', LG === 'en' ? ({ 1: 'st', 2: 'nd', 3: 'rd' }[st[1]] || 'th') + ' place' : '', '.º puesto', '. mesto')} · ${st[3]}-${st[4]}` : ''}${st ? ` · ${T('Έδρα', 'Home', 'Casa', 'Kod kuće')} ${st[7]} · ${T('Εκτός', 'Away', 'Fuera', 'U gostima')} ${st[8]}` : ''}</p></div></div>
<h2>${T('Πρόγραμμα και αποτελέσματα', 'Schedule and results', 'Calendario y resultados', 'Raspored i rezultati')}</h2>
<div class="tbl"><table><thead><tr><th class="l">${T('Αγ.', 'Rd', 'J.', 'Kolo')}</th><th class="l">${T('Αντίπαλος', 'Opponent', 'Rival', 'Protivnik')}</th><th>${T('Αποτέλεσμα / ώρα', 'Result / time', 'Resultado / hora', 'Rezultat / vreme')}</th></tr></thead><tbody>${gs.map(g => { const home = g[2] === c, o = home ? g[3] : g[2]; return `<tr><td class="l">${g[0]}</td><td class="l">${home ? '' : '@ '}${tlink(o)}</td><td>${g[6] ? res(g) : esc(when(g[1]))}</td></tr>`; }).join('')}</tbody></table></div>
${ros.length ? `<h2>${T('Ρόστερ και μέσοι όροι', 'Roster and averages', 'Plantilla y promedios', 'Roster i proseci')}</h2>
<div class="tbl"><table><thead><tr><th class="l">${T('Παίκτης', 'Player', 'Jugador', 'Igrač')}</th><th>${T('Αγ.', 'G', 'PJ', 'Ut.')}</th><th>${T('Λεπ.', 'Min', 'Min', 'Min')}</th><th>${T('Π', 'Pts', 'Pts', 'Poe')}</th><th>${T('Ριμπ.', 'Reb', 'Reb', 'Sko')}</th><th>${T('Ασ.', 'Ast', 'Asi', 'Asi')}</th><th>3${T('Π', 'P', 'P', 'P')}%</th><th>PIR</th></tr></thead><tbody>${ros.map(p => `<tr><td class="l">${plink(p)}</td><td>${p.gp}</td><td>${f1(p.min)}</td><td>${f1(p.pts)}</td><td>${f1(p.reb)}</td><td>${f1(p.ast)}</td><td>${pct(p.m3, p.a3)}</td><td><b>${f1(p.pir)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
<p class="note">${T('Πηγή: επίσημα στατιστικά της EuroCup. Ώρες Ελλάδας.', 'Source: official EuroCup stats. Times are Greek time (EET).', 'Fuente: estadísticas oficiales de la EuroCup. Horario de Grecia.', 'Izvor: zvanična statistika Evrokupa. Vreme je grčko.')}</p>
</section>`;
        await simplePage('ec:' + ecSlug(c), { view: 'eurocup', title: T(`${ecFull(c)}: EuroCup ${SEASON_LABEL}, πρόγραμμα, ρόστερ, στατιστικά | ${SITE_NAME}`, `${ecFull(c)}: EuroCup ${SEASON_LABEL} schedule, roster and stats | ${SITE_NAME}`, `${ecFull(c)}: EuroCup ${SEASON_LABEL}, calendario, plantilla y estadísticas | ${SITE_NAME}`, `${ecFull(c)}: Evrokup ${SEASON_LABEL}, raspored, roster i statistika | ${SITE_NAME}`),
          ld: [{ '@context': 'https://schema.org', '@type': 'SportsTeam', name: ecFull(c), sport: 'Basketball', url: SITE_URL + urlFor(LG, 'ec:' + ecSlug(c)), memberOf: { '@type': 'SportsOrganization', name: 'EuroCup' }, athlete: ros.map(p => ({ '@type': 'Person', name: p.n, url: SITE_URL + urlFor(LG, 'ec:' + pSlug[p.c]) })) }, crumbs([[SITE_NAME, B(LG)], [ECL, urlFor(LG, 'ec')], [ecFull(c), urlFor(LG, 'ec:' + ecSlug(c))]])],
          desc: T(`Το πρόγραμμα, τα αποτελέσματα και οι μέσοι όροι των παικτών της ${ecFull(c)} στην EuroCup ${SEASON_LABEL}.`, `${ecFull(c)} in the EuroCup ${SEASON_LABEL}: schedule, results and player averages.`, `${ecFull(c)} en la EuroCup ${SEASON_LABEL}: calendario, resultados y promedios de los jugadores.`, `${ecFull(c)} u Evrokupu ${SEASON_LABEL}: raspored, rezultati i proseci igrača.`), main: tmain + (ANL.U && ANL.U.rows[c] ? teamAnalytics('U', c, { coach: coachOf('U', c), lineupsUrl: AN.U.byTeam[c] ? urlFor(LG, 'lu:U-' + c) : '' }) : '') });
      }
    }

    // ---- EuroCup: σελίδα για κάθε παίκτη
    if (data.ec && data.ec.players.length) {
      const EC = data.ec, ET = EC.teams;
      const EC_GR = { ARI: 'Άρης', PAO: 'ΠΑΟΚ' };
      const ecFull = c => (LG === 'el' && EC_GR[c]) || (ET[c] ? ET[c][0] : c);
      const ecSlug = c => slugify(ET[c] ? ET[c][0] : c);
      const ECL = `EuroCup ${SEASON_LABEL}`;
      const used = new Set(), pSlug = {};
      for (const p of EC.players) { let sl = slugify(p.n) || p.c; if (used.has(p.t + '/' + sl)) sl += '-' + p.c; used.add(p.t + '/' + sl); pSlug[p.c] = ecSlug(p.t) + '/' + sl; }
      const lr = EC.lastRound, minG = Math.max(1, Math.ceil(lr / 2));
      const qual = EC.players.filter(p => p.gp >= minG && p.min >= 10);
      const rankOf = (p, k) => { if (!qual.includes(p)) return null; return 1 + qual.filter(q => q[k] > p[k]).length; };
      const pct = (m, a) => a ? Math.round(100 * m / a) + '%' : '–';
      for (const p of EC.players) {
        if (!ET[p.t]) continue;
        const tn = ecFull(p.t), tu = urlFor(LG, 'ec:' + ecSlug(p.t)), u = urlFor(LG, 'ec:' + pSlug[p.c]);
        const lede = T(`${p.n} (${tn}) στην ${ECL}: ${p.gp} αγώνες, ${f1(p.pts)} πόντοι, ${f1(p.reb)} ριμπάουντ, ${f1(p.ast)} ασίστ και ${f1(p.pir)} PIR ανά αγώνα.`, `${p.n} (${tn}) in the ${ECL}: ${p.gp} games, ${f1(p.pts)} points, ${f1(p.reb)} rebounds, ${f1(p.ast)} assists and ${f1(p.pir)} PIR per game.`, `${p.n} (${tn}) en la ${ECL}: ${p.gp} partidos, ${f1(p.pts)} puntos, ${f1(p.reb)} rebotes, ${f1(p.ast)} asistencias y ${f1(p.pir)} de PIR por partido.`, `${p.n} (${tn}) u ${ECL}: ${p.gp} utakmica, ${f1(p.pts)} poena, ${f1(p.reb)} skokova, ${f1(p.ast)} asistencija i ${f1(p.pir)} PIR-a po utakmici.`);
        const RK = [['pts', T('Πόντοι', 'Points', 'Puntos', 'Poeni')], ['reb', T('Ριμπάουντ', 'Rebounds', 'Rebotes', 'Skokovi')], ['ast', T('Ασίστ', 'Assists', 'Asistencias', 'Asistencije')], ['pir', 'PIR']].map(([k, l]) => [l, rankOf(p, k)]).filter(x => x[1]);
        const cells = [[T('Αγώνες', 'Games', 'Partidos', 'Utakmice'), p.gp], [T('Λεπτά', 'Minutes', 'Minutos', 'Minuti'), f1(p.min)], [T('Πόντοι', 'Points', 'Puntos', 'Poeni'), f1(p.pts)], [T('Ριμπάουντ', 'Rebounds', 'Rebotes', 'Skokovi'), f1(p.reb)], [T('Ασίστ', 'Assists', 'Asistencias', 'Asistencije'), f1(p.ast)], [T('Κλεψίματα', 'Steals', 'Robos', 'Ukradene'), f1(p.stl)], [T('Κοψίματα', 'Blocks', 'Tapones', 'Blokade'), f1(p.blk)], [T('Λάθη', 'Turnovers', 'Pérdidas', 'Izgubljene'), f1(p.tov)], ['2' + T('Π', 'P', 'P', 'P') + '%', pct(p.m2, p.a2)], ['3' + T('Π', 'P', 'P', 'P') + '%', pct(p.m3, p.a3)], [T('Βολές', 'FT', 'TL', 'Slob. bac.') + ' %', pct(p.ftm, p.fta)], ['PIR', f1(p.pir)]];
        const mates = EC.players.filter(q => q.t === p.t && q !== p).sort((a, b) => b.min - a.min).slice(0, 8);
        const main = `<section class="article ec">
<p class="crumbs"><a href="${urlFor(LG, 'ec')}">${ECL}</a> › <a href="${tu}">${esc(tn)}</a></p>
<h1>${esc(p.n)}</h1>
<p class="lede2">${esc(lede)}</p>
<div class="otiles ectiles">${cells.map(([l, v]) => `<div><b>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>
${RK.length ? `<h2>${T('Θέση στην EuroCup', 'EuroCup rank', 'Puesto en la EuroCup', 'Mesto u Evrokupu')}</h2><p>${RK.map(([l, r]) => `${esc(l)}: <b>${r}${T('ος', LG === 'en' ? ({ 1: 'st', 2: 'nd', 3: 'rd' }[r % 10 > 3 || [11, 12, 13].includes(r % 100) ? 0 : r % 10] || 'th') : '', '.º', '.')}</b>`).join(' · ')} <small class="muted">(${T('ανάμεσα σε', 'among', 'entre', 'među')} ${qual.length})</small></p>` : ''}
${mates.length ? `<h2>${T('Συμπαίκτες', 'Teammates', 'Compañeros', 'Saigrači')}</h2><p class="leadnav">${mates.map(q => `<a href="${urlFor(LG, 'ec:' + pSlug[q.c])}">${esc(q.n)}</a>`).join('')}</p>` : ''}
<p class="note">${T('Πηγή: επίσημα στατιστικά της EuroCup. Μέσοι όροι ανά αγώνα.', 'Source: official EuroCup stats. Per-game averages.', 'Fuente: estadísticas oficiales de la EuroCup. Promedios por partido.', 'Izvor: zvanična statistika Evrokupa. Proseci po utakmici.')}</p>
</section>`;
        const pld = { '@context': 'https://schema.org', '@type': 'Person', name: p.n, url: SITE_URL + u, jobTitle: T('Μπασκετμπολίστας', 'Basketball player', 'Jugador de baloncesto', 'Košarkaš'), memberOf: { '@type': 'SportsTeam', name: tn, url: SITE_URL + tu } };
        await simplePage('ec:' + pSlug[p.c], { view: 'eurocup', title: T(`${p.n} στατιστικά EuroCup ${SEASON_LABEL} (${tn}) | ${SITE_NAME}`, `${p.n} EuroCup ${SEASON_LABEL} stats (${tn}) | ${SITE_NAME}`, `Estadísticas de ${p.n} en la EuroCup ${SEASON_LABEL} (${tn}) | ${SITE_NAME}`, `${p.n} statistika Evrokup ${SEASON_LABEL} (${tn}) | ${SITE_NAME}`), desc: lede, main,
          ld: [pld, crumbs([[SITE_NAME, B(LG)], [ECL, urlFor(LG, 'ec')], [tn, tu], [p.n, u]])] });
      }
    }

    // ---- κάρτες για social (μόνο ελληνικά, noindex): εικόνες που κατεβαίνουν από τον browser
    if (LG === 'el') {
      const lrC = lastRound, nrC = (league.games.find(g => !g[6]) || [0])[0];
      const MC = teamModel(players);
      const mvpOf = g => players.flatMap(p => p.g.filter(x => x[0] === g[0] && (x[2] === g[2] || x[2] === g[3]) && p.t.split(';').some(t => t === g[2] || t === g[3])).map(x => ({ n: niceName(p.n), t: x[2] === g[2] ? g[3] : g[2], pts: x[8], reb: x[15] + x[16], ast: x[17], pir: x[25] }))).sort((a, b) => b.pir - a.pir)[0] || null;
      const CD = {
        site: 'basketballstats.eu', season: SEASON_LABEL,
        teams: Object.fromEntries(Object.entries(TEAMS).map(([c, v]) => [c, [v[0], v[1]]])),
        res: league.games.filter(g => g[0] === lrC && g[6]).map(g => ({ r: g[0], h: g[2], a: g[3], hs: g[4], as: g[5], m: mvpOf(g) })),
        next: league.games.filter(g => g[0] === nrC && !g[6]).map(g => { const x = MC.predict(g[2], g[3]); const d = gameDate(g[1]); return { h: g[2], a: g[3], d: d.toLocaleString('el-GR', { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), p: x ? Math.round(x.prob * 100) : null }; }),
        stand: league.stand.map(s => [s[0], s[1], s[2], s[3]]), lr: lrC, nr: nrC,
      };
      const cardsHtml = `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Κάρτες για social | ${SITE_NAME}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Sans+Extra+Condensed:wght@600;800&family=Fira+Sans:wght@400;600&display=swap">
<style>body{margin:0;background:#f3f1ec;font:15px/1.5 'Fira Sans',system-ui,sans-serif;color:#1d2330}main{max-width:1100px;margin:0 auto;padding:16px}h1{font-family:'Fira Sans Extra Condensed';font-size:34px;margin:8px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}figure{margin:0;background:#fff;border-radius:10px;padding:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}canvas{width:100%;height:auto;display:block;border-radius:6px}figcaption{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:14px}button{background:#e8562a;color:#fff;border:0;border-radius:8px;padding:7px 12px;font:inherit;font-weight:600;cursor:pointer}.sub{color:#6b7280}</style></head>
<body><main><h1>Κάρτες για social</h1><p class="sub">Έτοιμες εικόνες για Facebook, Instagram και X. Ενημερώνονται μόνες τους μετά από κάθε αγωνιστική. Πάτα «Λήψη» και ανέβασέ τες με link στο ${SITE_NAME}.</p><div class="grid" id="g"></div></main>
<script>const D=${JSON.stringify(CD).replace(/</g, '\\u003c')};
const W=1080;const tn=c=>(D.teams[c]||[c])[0], tc=c=>(D.teams[c]||[0,'#444'])[1];
function base(h,kick){const cv=document.createElement('canvas');cv.width=W;cv.height=h;const x=cv.getContext('2d');x.fillStyle='#1d2330';x.fillRect(0,0,W,h);x.fillStyle='#e8562a';x.fillRect(0,0,W,12);
x.font='800 54px "Fira Sans Extra Condensed",sans-serif';x.fillStyle='#fff';x.textBaseline='alphabetic';x.fillText('BASKETBALL',60,100);const w=x.measureText('BASKETBALL').width;x.fillStyle='#e8562a';x.fillText('STATS',60+w,100);
x.font='600 30px "Fira Sans",sans-serif';x.fillStyle='#aab2c0';x.fillText(kick,60,150);x.font='600 30px "Fira Sans",sans-serif';x.fillStyle='#e8562a';x.textAlign='right';x.fillText(D.site,W-60,h-50);x.textAlign='left';x.fillStyle='#8a93a6';x.fillText('EuroLeague '+D.season,60,h-50);return [cv,x];}
function fit(x,t,max,size,weight){let s=size;do{x.font=weight+' '+s+'px "Fira Sans Extra Condensed",sans-serif';s-=2;}while(x.measureText(t).width>max&&s>20);}
function crest(x,c,cx,cy,r){x.beginPath();x.arc(cx,cy,r,0,7);x.fillStyle=tc(c);x.fill();x.lineWidth=6;x.strokeStyle='rgba(255,255,255,.25)';x.stroke();x.fillStyle='#fff';x.font='800 '+Math.round(r*.62)+'px "Fira Sans Extra Condensed",sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(c,cx,cy+2);x.textAlign='left';x.textBaseline='alphabetic';}
function result(g){const [cv,x]=base(1080,g.r+'η αγωνιστική · Τελικό');const win=g.hs>g.as;
[[g.h,g.hs,330,win],[g.a,g.as,640,!win]].forEach(([c,s,y,w])=>{crest(x,c,150,y,80);x.font='800 150px "Fira Sans Extra Condensed",sans-serif';const sw=x.measureText(String(s)).width;const U=tn(c).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();fit(x,U,W-60-sw-40-270,72,'800');x.fillStyle=w?'#fff':'#9aa3b5';x.fillText(U,270,y+26);x.font='800 150px "Fira Sans Extra Condensed",sans-serif';x.textAlign='right';x.fillText(String(s),W-60,y+52);x.textAlign='left';});
x.fillStyle='rgba(255,255,255,.08)';x.fillRect(60,790,W-120,150);if(g.m){x.fillStyle='#e8562a';x.font='600 28px "Fira Sans",sans-serif';x.fillText('MVP ΑΓΩΝΑ',90,835);fit(x,g.m.n,600,54,'800');x.fillStyle='#fff';x.fillText(g.m.n,90,900);x.font='600 32px "Fira Sans",sans-serif';x.fillStyle='#d5dae3';x.textAlign='right';x.fillText(g.m.pts+' π · '+g.m.reb+' ρ · '+g.m.ast+' α · '+g.m.pir+' PIR',W-90,900);x.textAlign='left';}return cv;}
function next(){const n=D.next.length,h=Math.max(1080,260+n*92+120);const [cv,x]=base(h,D.nr+'η αγωνιστική · Πρόγραμμα και εκτιμήσεις');D.next.forEach((g,i)=>{const y=250+i*92;x.fillStyle=i%2?'rgba(255,255,255,.04)':'rgba(255,255,255,.09)';x.fillRect(60,y-58,W-120,84);x.font='600 24px "Fira Sans",sans-serif';x.fillStyle='#aab2c0';x.fillText(g.d,80,y-22);x.font='800 40px "Fira Sans Extra Condensed",sans-serif';x.fillStyle='#fff';const t=tn(g.h)+' – '+tn(g.a);fit(x,t,620,40,'800');x.fillText(t,80,y+16);if(g.p!=null){const f=g.p>=50?g.h:g.a,p=Math.max(g.p,100-g.p);x.textAlign='right';x.font='800 38px "Fira Sans Extra Condensed",sans-serif';x.fillStyle='#e8562a';x.fillText(p+'%',W-80,y+16);x.font='600 22px "Fira Sans",sans-serif';x.fillStyle='#aab2c0';x.fillText(tn(f),W-80,y-22);x.textAlign='left';}});return cv;}
function stand(){const n=D.stand.length,h=Math.max(1080,230+n*56+110);const [cv,x]=base(h,'Βαθμολογία μετά την '+D.lr+'η αγωνιστική');D.stand.forEach((s,i)=>{const y=240+i*56;x.fillStyle=s[0]<=6?'rgba(46,125,50,.35)':s[0]<=10?'rgba(240,180,0,.22)':'rgba(255,255,255,.05)';x.fillRect(60,y-40,W-120,50);x.font='800 34px "Fira Sans Extra Condensed",sans-serif';x.fillStyle='#fff';x.fillText(String(s[0]),80,y);x.fillStyle=tc(s[1]);x.fillRect(140,y-30,10,32);x.fillStyle='#fff';x.fillText(tn(s[1]),170,y);x.textAlign='right';x.fillText(s[2]+'-'+s[3],W-80,y);x.textAlign='left';});x.font='600 24px "Fira Sans",sans-serif';x.fillStyle='#aab2c0';x.fillText('Πράσινο: playoffs · Κίτρινο: play-in',60,h-95);return cv;}
function add(cv,name,cap){const f=document.createElement('figure');f.appendChild(cv);const fc=document.createElement('figcaption');fc.innerHTML='<span>'+cap+'</span>';const b=document.createElement('button');b.textContent='Λήψη';b.onclick=()=>cv.toBlob(bl=>{const a=document.createElement('a');a.href=URL.createObjectURL(bl);a.download=name+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);},'image/png');fc.appendChild(b);f.appendChild(fc);document.getElementById('g').appendChild(f);}
document.fonts.load('800 40px "Fira Sans Extra Condensed",sans-serif').then(()=>document.fonts.load('600 20px "Fira Sans",sans-serif')).catch(()=>0).then(()=>{
if(D.next.length)add(next(),'agonistiki-'+D.nr+'-programma','Πρόγραμμα '+D.nr+'ης αγωνιστικής');
if(D.stand.length)add(stand(),'vathmologia-'+D.lr,'Βαθμολογία');
D.res.forEach(g=>add(result(g),'apotelesma-'+g.r+'-'+g.h+'-'+g.a,tn(g.h)+' – '+tn(g.a)+' '+g.hs+'-'+g.as));});
</script></body></html>`;
      await write(BASE + 'kartes/', cardsHtml);
    }

    // ---- ημερολόγιο (.ics) για κάθε ομάδα
    {
      const icsEsc = x => String(x).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
      const fold = l => { const out = []; let x = l; while (Buffer.byteLength(x) > 74) { let n = 74; while (Buffer.byteLength(x.slice(0, n)) > 74) n--; out.push(x.slice(0, n)); x = ' ' + x.slice(n); } out.push(x); return out.join('\r\n'); };
      const dt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const stamp = dt(new Date());
      await fs.mkdir(path.join(OUT, (LG === 'el' ? '' : LG + '/') + 'cal'), { recursive: true });
      for (const c of Object.keys(TEAMS)) {
        const ev = league.games.filter(g => g[2] === c || g[3] === c).map(g => {
          const d = gameDate(g[1]), e = new Date(d.getTime() + 2 * 3600e3), u = SITE_URL + urlFor(LG, `game:${g[0]}|${g[2]}|${g[3]}`);
          const sum = `${tName(g[2])} - ${tName(g[3])}${g[6] ? ` ${g[4]}-${g[5]}` : ''} (EuroLeague, ${rdTxt0(g[0])})`;
          return ['BEGIN:VEVENT', `UID:${SEASON}-${g[0]}-${g[2]}-${g[3]}@basketballstats.eu`, `DTSTAMP:${stamp}`, `DTSTART:${dt(d)}`, `DTEND:${dt(e)}`, `SUMMARY:${icsEsc(sum)}`, `URL:${u}`, `DESCRIPTION:${icsEsc(T('Ανάλυση, στατιστικά και απουσίες: ', 'Preview, stats and injuries: ', 'Previa, estadísticas y bajas: ', 'Najava, statistika i povrede: ') + u)}`, 'END:VEVENT'].map(fold).join('\r\n');
        });
        const cal = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${SITE_NAME}//EuroLeague//${LG.toUpperCase()}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', fold(`X-WR-CALNAME:${icsEsc(tName(c) + ' · EuroLeague ' + SEASON_LABEL)}`), 'X-WR-TIMEZONE:Europe/Athens', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
        await fs.writeFile(path.join(OUT, (LG === 'el' ? '' : LG + '/') + 'cal', c + '.ics'), cal);
      }
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
