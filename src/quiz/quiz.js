import { quizQuestions } from './questions.mjs';

const root = document.querySelector('#quiz-app');
const { pool, season, labels } = JSON.parse(document.querySelector('#quiz-data').textContent);
const day = new Date().toISOString().slice(0, 10);
const seed = season + '/' + day;
const levels = root.querySelector('.quiz-levels');
let level;
let questions;
const heading = root.querySelector('h2');
const options = root.querySelector('.quiz-options');
const feedback = root.querySelector('.quiz-feedback');
const next = root.querySelector('[data-action="next"]');
const results = root.querySelector('.quiz-results');
const manualCopy = root.querySelector('textarea');
const actions = results.querySelector('.quiz-actions');
const share = root.querySelector('[data-action="share"]');
const progress = root.querySelector('.quiz-progress');
const format = (text, fields) => text.replace(/\{(\w+)\}/g, (_, key) => fields[key]);
const number = new Intl.NumberFormat(document.documentElement.lang);
let index = 0;
let score = 0;
let answered = false;
let attempt = 0;

function showQuestion() {
  answered = false;
  const question = questions[index];
  progress.textContent = labels.levels[level] + ' · ' + format(labels.progress, { current: index + 1, total: questions.length });
  heading.textContent = labels.prompts[question.metric];
  options.replaceChildren(...question.options.map((option, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.name;
    button.addEventListener('click', () => answer(i));
    return button;
  }));
  feedback.textContent = '';
  next.hidden = true;
}

function answer(selected) {
  if (answered) return;
  answered = true;
  const { correct, options: choices } = questions[index];
  if (correct === selected) score++;
  options.querySelectorAll('button').forEach((button, i) => {
    button.disabled = true;
    button.dataset.result = i === correct ? 'correct' : i === selected ? 'incorrect' : '';
  });
  const explanation = choices.map(({ name, value }) => name + ' (' + number.format(value) + ')').join(' · ');
  feedback.textContent = (selected === correct ? labels.correct : labels.incorrect)
    + ' ' + choices[correct].name + '. ' + explanation;
  next.textContent = index + 1 === questions.length ? labels.finish : labels.next;
  next.hidden = false;
  next.focus();
}

next.addEventListener('click', () => {
  index++;
  if (index < questions.length) {
    showQuestion();
  } else {
    progress.textContent = labels.levels[level];
    options.replaceChildren();
    feedback.textContent = '';
    next.hidden = true;
    heading.textContent = format(labels.score, { score, total: questions.length });
    results.hidden = false;
    levels.hidden = false;
    share.hidden = typeof navigator.share !== 'function';
  }
  heading.focus();
});

function start(selectedLevel) {
  attempt++;
  level = selectedLevel;
  questions = quizQuestions(pool, seed, level);
  levels.hidden = true;
  index = 0;
  score = 0;
  results.hidden = true;
  manualCopy.hidden = true;
  showQuestion();
  heading.focus();
}

levels.addEventListener('click', event => {
  const selected = event.target.dataset.level;
  if (selected) start(selected);
});
root.querySelector('[data-action="replay"]').addEventListener('click', () => start(level));

actions.addEventListener('click', async event => {
  const action = event.target.dataset.action;
  if (action !== 'share' && action !== 'copy') return;
  const currentAttempt = attempt;
  const url = location.origin + location.pathname;
  const text = 'EuroLeague Quiz · ' + day + ' · ' + labels.levels[level] + ' · ' + score + '/' + questions.length;
  try {
    if (action === 'share') {
      await navigator.share({ text, url });
    } else {
      await navigator.clipboard.writeText(text + '\n' + url);
      if (currentAttempt === attempt) feedback.textContent = labels.copied;
    }
  } catch (error) {
    if (error.name === 'AbortError' || currentAttempt !== attempt) return;
    manualCopy.value = text + '\n' + url;
    manualCopy.hidden = false;
    manualCopy.focus();
    manualCopy.select();
  }
});

if (!quizQuestions(pool, seed).length) {
  levels.hidden = true;
  heading.textContent = labels.unavailable;
}
