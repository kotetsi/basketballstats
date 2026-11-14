const root = document.querySelector('#five-game');
const { games, labels } = JSON.parse(document.querySelector('#five-data').textContent);
const team = root.querySelector('[name="team"]');
const match = root.querySelector('[name="match"]');
const start = root.querySelector('[data-start]');
const clock = root.querySelector('time');
const form = root.querySelector('form');
const player = form.querySelector('select');
const slots = root.querySelector('ol');
const status = root.querySelector('[role="status"]');
const reveal = root.querySelector('[data-reveal]');
const source = root.querySelector('[data-source]');
let timer;
let deadline;
let game;
let found;
const duration = 240;

function option(value, name) {
  return new Option(name, value);
}

function reset() {
  clearInterval(timer);
  form.hidden = true;
  reveal.hidden = true;
  clock.hidden = true;
  source.hidden = true;
  slots.replaceChildren();
  status.textContent = '';
}

function listMatches() {
  reset();
  match.replaceChildren(...games.filter(game => game.team === team.value).map(game =>
    option(game.id, game.year + ' · ' + game.opponent + ' · ' + game.score)));
}

function finish() {
  clearInterval(timer);
  form.hidden = true;
  reveal.hidden = true;
  status.textContent = labels.score + ' ' + found.size + '/5';
  source.href = game.source;
  source.hidden = false;
  const missed = game.roster.filter(p => p.start && !found.has(p.name));
  missed.forEach((p, index) => fillSlot(found.size + index, p.name + ' · ' + labels.missed, 'revealed'));
  start.focus();
}

function fillSlot(index, name, result) {
  const slot = slots.children[index];
  slot.firstElementChild.textContent = name;
  slot.dataset.result = result;
}

function tick() {
  const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  clock.textContent = Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0');
  if (!remaining) finish();
  return remaining;
}

team.replaceChildren(...[...new Set(games.map(game => game.team))].sort().map(name => option(name, name)));
team.addEventListener('change', listMatches);
match.addEventListener('change', reset);
listMatches();
start.disabled = games.length === 0;
if (!games.length) status.textContent = labels.empty;

start.addEventListener('click', () => {
  reset();
  game = games.find(game => game.id === match.value);
  if (!game) return;
  found = new Set();
  player.replaceChildren(option('', labels.choose), ...game.roster.map(p => option(p.name, p.name)));
  slots.replaceChildren(...Array.from({ length: 5 }, (_, index) => {
    const slot = document.createElement('li');
    slot.dataset.slot = String(index + 1);
    slot.append(document.createElement('span'));
    return slot;
  }));
  form.hidden = false;
  reveal.hidden = false;
  clock.hidden = false;
  deadline = Date.now() + duration * 1000;
  tick();
  timer = setInterval(tick, 250);
  player.focus();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!tick() || !player.value) return;
  const name = player.value;
  if (!game.roster.some(p => p.name === name && p.start)) {
    status.textContent = labels.wrong + ' ' + name;
    return;
  }
  if (found.has(name)) return;
  fillSlot(found.size, name, 'found');
  found.add(name);
  player.selectedOptions[0].disabled = true;
  player.value = '';
  status.textContent = labels.score + ' ' + found.size + '/5';
  if (found.size === 5) finish();
  else player.focus();
});
reveal.addEventListener('click', finish);
