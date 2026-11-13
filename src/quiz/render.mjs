const locales = {
  el: {
    title: 'Κουίζ EuroLeague',
    description: 'Πέντε καθημερινές ερωτήσεις με πραγματικά στατιστικά της EuroLeague. Δες τις απαντήσεις και μοιράσου το σκορ σου.',
    guess: 'Μάντεψε τον παίκτη', progress: 'Ερώτηση {current} από {total}', score: 'Σκορ {score}/{total}',
    correct: 'Σωστά!', incorrect: 'Σωστή απάντηση:', next: 'Επόμενη ερώτηση', finish: 'Δες το σκορ',
    replay: 'Παίξε ξανά', share: 'Κοινοποίηση', copy: 'Αντιγραφή σκορ', copied: 'Το σκορ αντιγράφηκε.',
    unavailable: 'Δεν υπάρχουν ακόμη αρκετά στατιστικά για το κουίζ.',
    prompts: ['Ποιος έχει τους περισσότερους πόντους;', 'Ποιος έχει τα περισσότερα ριμπάουντ;', 'Ποιος έχει τις περισσότερες ασίστ;', 'Ποιος έχει τα περισσότερα εύστοχα τρίποντα;', 'Ποιος έχει το υψηλότερο συνολικό PIR;'],
  },
  en: {
    title: 'EuroLeague Quiz',
    description: 'Five daily questions based on real EuroLeague stats. See the answers and share your score.',
    guess: 'Guess the Player', progress: 'Question {current} of {total}', score: 'Score {score}/{total}',
    correct: 'Correct!', incorrect: 'Correct answer:', next: 'Next question', finish: 'See your score',
    replay: 'Play again', share: 'Share', copy: 'Copy score', copied: 'Score copied.',
    unavailable: 'There are not enough stats for the quiz yet.',
    prompts: ['Who has the most points?', 'Who has the most rebounds?', 'Who has the most assists?', 'Who has made the most three-pointers?', 'Who has the highest total PIR?'],
  },
  es: {
    title: 'Quiz de la Euroliga',
    description: 'Cinco preguntas diarias con estadísticas reales de la Euroliga. Descubre las respuestas y comparte tu puntuación.',
    guess: 'Adivina el jugador', progress: 'Pregunta {current} de {total}', score: 'Puntuación {score}/{total}',
    correct: '¡Correcto!', incorrect: 'Respuesta correcta:', next: 'Siguiente pregunta', finish: 'Ver puntuación',
    replay: 'Volver a jugar', share: 'Compartir', copy: 'Copiar puntuación', copied: 'Puntuación copiada.',
    unavailable: 'Todavía no hay suficientes estadísticas para el quiz.',
    prompts: ['¿Quién tiene más puntos?', '¿Quién tiene más rebotes?', '¿Quién tiene más asistencias?', '¿Quién ha anotado más triples?', '¿Quién tiene la mayor valoración (PIR) total?'],
  },
  sr: {
    title: 'Kviz Evrolige',
    description: 'Pet dnevnih pitanja na osnovu stvarne statistike Evrolige. Pogledaj odgovore i podeli rezultat.',
    guess: 'Pogodi igrača', progress: 'Pitanje {current} od {total}', score: 'Rezultat {score}/{total}',
    correct: 'Tačno!', incorrect: 'Tačan odgovor:', next: 'Sledeće pitanje', finish: 'Prikaži rezultat',
    replay: 'Igraj ponovo', share: 'Podeli', copy: 'Kopiraj rezultat', copied: 'Rezultat je kopiran.',
    unavailable: 'Još nema dovoljno statistike za kviz.',
    prompts: ['Ko ima najviše poena?', 'Ko ima najviše skokova?', 'Ko ima najviše asistencija?', 'Ko je pogodio najviše trojki?', 'Ko ima najveći ukupni PIR?'],
  },
  tr: {
    title: 'EuroLeague Bilgi Yarışması',
    description: 'Gerçek EuroLeague istatistiklerine dayanan beş günlük soru. Cevapları gör ve skorunu paylaş.',
    guess: 'Oyuncuyu tahmin et', progress: 'Soru {current}/{total}', score: 'Skor {score}/{total}',
    correct: 'Doğru!', incorrect: 'Doğru cevap:', next: 'Sonraki soru', finish: 'Skoru gör',
    replay: 'Tekrar oyna', share: 'Paylaş', copy: 'Skoru kopyala', copied: 'Skor kopyalandı.',
    unavailable: 'Yarışma için henüz yeterli istatistik yok.',
    prompts: ['En çok sayıyı kim attı?', 'En çok ribaundu kim aldı?', 'En çok asisti kim yaptı?', 'En çok üçlüğü kim attı?', 'En yüksek toplam PIR kime ait?'],
  },
};

export const quizLabels = lang => locales[lang];

export function renderQuiz({ lang, pool, season, seasonLabel, guessUrl, asset, esc }) {
  const labels = quizLabels(lang);
  const prompts = Object.fromEntries(['pts', 'reb', 'ast', 'm3', 'pir'].map((key, i) => [key, labels.prompts[i]]));
  const context = JSON.stringify({ pool, season, labels: { ...labels, prompts } }).replace(/</g, '\\u003c');
  return `<link rel="stylesheet" href="${asset('quiz.css')}">
<article class="article lead wide">
<h1>${esc(labels.title)}</h1>
<p class="lede2">${esc(labels.description)} · ${esc(seasonLabel)}</p>
<section id="quiz-app" class="quiz-panel" aria-labelledby="quiz-heading">
<p class="quiz-progress"></p>
<h2 id="quiz-heading" tabindex="-1">${esc(labels.title)}</h2>
<div class="quiz-options"></div>
<p class="quiz-feedback" role="status"></p>
<button type="button" data-action="next" hidden></button>
<div class="quiz-results" hidden>
<div class="quiz-actions">
<button type="button" data-action="replay">${esc(labels.replay)}</button>
<button type="button" data-action="share" hidden>${esc(labels.share)}</button>
<button type="button" data-action="copy">${esc(labels.copy)}</button>
</div>
<textarea aria-label="${esc(labels.copy)}" rows="3" readonly hidden></textarea>
</div>
</section>
<p><a href="${esc(guessUrl)}">${esc(labels.guess)} →</a></p>
</article>
<script type="application/json" id="quiz-data">${context}</script>
<script type="module" src="${asset('quiz.js')}"></script>`;
}
