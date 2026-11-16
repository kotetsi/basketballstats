export const finderTitle = {
  el: 'Σύνθετη αναζήτηση παικτών',
  en: 'Advanced Player Finder',
  es: 'Buscador avanzado de jugadores',
  sr: 'Napredna pretraga igrača',
  tr: 'Gelişmiş oyuncu arama',
};

export function finderPage({ lang, T, esc, base, urlFor, players, niceName }) {
  const title = finderTitle[lang];
  const desc = T(
    'Βρες παίκτες EuroLeague βάσει PIR, πόντων, ριμπάουντ και ασίστ, με φίλτρα συμμετοχής.',
    'Find EuroLeague players by PIR, points, rebounds and assists, with playing-time filters.',
    'Busca jugadores de la Euroliga por PIR, puntos, rebotes y asistencias, con filtros de participación.',
    'Pronađi igrače Evrolige po PIR-u, poenima, skokovima i asistencijama, uz filtere za minutažu.',
    'EuroLeague oyuncularını PIR, sayı, ribaund ve asist verilerine göre bul, süreye göre filtrele.'
  );
  const names = {
    player: T('Παίκτης', 'Player', 'Jugador', 'Igrač', 'Oyuncu'),
    team: T('Ομάδα', 'Team', 'Equipo', 'Tim', 'Takım'),
    games: T('Αγώνες', 'Games', 'Partidos', 'Utakmice', 'Maç'),
    minutes: T('Λεπτά', 'Minutes', 'Minutos', 'Minuti', 'Dakika'),
    pir: 'PIR',
    points: T('Πόντοι', 'Points', 'Puntos', 'Poeni', 'Sayı'),
    rebounds: T('Ριμπάουντ', 'Rebounds', 'Rebotes', 'Skokovi', 'Ribaund'),
    assists: T('Ασίστ', 'Assists', 'Asistencias', 'Asistencije', 'Asist'),
  };
  const select = (id, label, options) => `<label>${esc(label)}<select id="finder-${id}">${options.map(([value, text]) =>
    `<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select></label>`;
  const columns = Object.keys(names);
  const config = {
    base,
    profiles: Object.fromEntries(players.map(p => [p.c, [niceName(p.n), urlFor(lang, 'player:' + p.s)]])),
    count: T('Παίκτες: {n}', 'Players: {n}', 'Jugadores: {n}', 'Igrači: {n}', 'Oyuncular: {n}'),
    empty: T('Δεν βρέθηκαν παίκτες.', 'No players found.', 'No se encontraron jugadores.', 'Nema pronađenih igrača.', 'Oyuncu bulunamadı.'),
    error: T('Η φόρτωση των παικτών απέτυχε.', 'Could not load players.', 'No se pudieron cargar los jugadores.', 'Učitavanje igrača nije uspelo.', 'Oyuncular yüklenemedi.'),
  };
  const main = `<link rel="stylesheet" href="${base}assets/finder/finder.css">
<section id="finder">
<h1>${esc(title)}</h1>
<p class="lede">${esc(desc)}</p>
<p><a href="${esc(urlFor(lang, 'compare'))}">${T('Σύγκριση παικτών', 'Compare players', 'Comparar jugadores', 'Poređenje igrača', 'Oyuncuları karşılaştır')}</a></p>
<div class="finder-filters">
${select('period', T('Περίοδος', 'Period', 'Periodo', 'Period', 'Dönem'), [
  ['5', T('Τελευταίες 5 συμμετοχές', 'Last 5 appearances', 'Últimos 5 partidos jugados', 'Poslednjih 5 nastupa', 'Son 5 maç')],
  ['3', T('Τελευταίες 3 συμμετοχές', 'Last 3 appearances', 'Últimos 3 partidos jugados', 'Poslednja 3 nastupa', 'Son 3 maç')],
  ['all', T('Όλη η σεζόν', 'Full season', 'Toda la temporada', 'Cela sezona', 'Tüm sezon')],
])}
${select('metric', T('Ταξινόμηση κατά', 'Sort by', 'Ordenar por', 'Sortiraj po', 'Sırala'), columns.slice(4).map(k => [k, names[k]]))}
<label>${T('Ελάχιστα λεπτά (μ.ό.)', 'Minimum average minutes', 'Media mínima de minutos', 'Minimalni prosek minuta', 'En az ortalama dakika')}
<input id="finder-minutes" type="number" min="0" step="1" value="15" inputmode="numeric"></label>
${select('position', T('Θέση', 'Position', 'Posición', 'Pozicija', 'Pozisyon'), [
  ['', T('Όλες', 'All', 'Todas', 'Sve', 'Tümü')],
  ['Guard', T('Γκαρντ', 'Guard', 'Base / escolta', 'Bek', 'Guard')],
  ['Forward', T('Φόργουορντ', 'Forward', 'Alero / ala-pívot', 'Krilo', 'Forvet')],
  ['Center', T('Σέντερ', 'Center', 'Pívot', 'Centar', 'Pivot')],
])}
${select('venue', T('Έδρα', 'Venue', 'Cancha', 'Teren', 'Saha'), [
  ['all', T('Όλοι οι αγώνες', 'All games', 'Todos los partidos', 'Sve utakmice', 'Tüm maçlar')],
  ['home', T('Εντός', 'Home', 'Local', 'Kod kuće', 'İç saha')],
  ['away', T('Εκτός', 'Away', 'Visitante', 'U gostima', 'Deplasman')],
])}
<label>${T('Όνομα παίκτη', 'Player name', 'Nombre del jugador', 'Ime igrača', 'Oyuncu adı')}
<input id="finder-search" type="search"></label>
</div>
<p>${T(
  'Εμφανίζονται παίκτες με τουλάχιστον 3 συμμετοχές μετά τα φίλτρα. Το φίλτρο έδρας εφαρμόζεται στις συμμετοχές της επιλεγμένης περιόδου. Τα λεπτά και τα στατιστικά είναι μέσοι όροι ανά αγώνα.',
  'Players need at least 3 appearances after filtering. The venue filter applies within the selected period. Minutes and stats are per-game averages.',
  'Se muestran jugadores con al menos 3 partidos tras aplicar los filtros. El filtro de cancha se aplica dentro del periodo elegido. Los minutos y las estadísticas son medias por partido.',
  'Prikazuju se igrači sa najmanje 3 nastupa nakon filtriranja. Filter terena važi unutar izabranog perioda. Minuti i statistika su proseci po utakmici.',
  'Filtrelerden sonra en az 3 maç oynayan oyuncular gösterilir. Saha filtresi seçilen dönemdeki maçlara uygulanır. Dakika ve istatistikler maç başına ortalamadır.'
)}</p>
<p id="finder-status" role="status">${T('Φόρτωση…', 'Loading…', 'Cargando…', 'Učitavanje…', 'Yükleniyor…')}</p>
<div class="finder-results" role="region" aria-label="${esc(title)}" tabindex="0" hidden>
<table>
<thead><tr>${columns.map(k => `<th scope="col" data-stat="${k}">${esc(names[k])}</th>`).join('')}</tr></thead>
<tbody id="finder-rows"></tbody>
</table>
</div>
<noscript>${T('Η αναζήτηση χρειάζεται JavaScript.', 'The Finder requires JavaScript.', 'El buscador requiere JavaScript.', 'Za pretragu je potreban JavaScript.', 'Arama için JavaScript gerekir.')}</noscript>
<script type="application/json" id="finder-config">${JSON.stringify(config).replace(/</g, '\\u003c')}</script>
<script type="module" src="${base}assets/finder/ui.mjs"></script>
</section>`;
  return { title, desc, view: 'finder', main };
}
