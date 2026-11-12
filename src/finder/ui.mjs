import { findPlayers } from './metrics.mjs';

const byId = name => document.getElementById('finder-' + name);
const config = JSON.parse(byId('config').textContent);
const status = byId('status');
const tbody = byId('rows');
const region = tbody.closest('.finder-results');
const headers = [...region.querySelectorAll('th[data-stat]')];
const lang = document.documentElement.lang;
const decimal = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat(lang);
const normalize = value => value.toLocaleLowerCase(lang).normalize('NFD').replace(/\p{M}/gu, '');

try {
  const response = await fetch(config.base + 'assets/data.json');
  if (!response.ok) throw new Error('Finder data request failed');
  const { players } = await response.json();

  function render() {
    const metric = byId('metric').value;
    const query = normalize(byId('search').value.trim());
    const candidates = query ? players.filter(player => {
      const name = config.profiles[player.c]?.[0] ?? player.n;
      return normalize(name).includes(query) || normalize(player.n).includes(query);
    }) : players;
    const rows = findPlayers(candidates, {
      metric,
      period: byId('period').value,
      minMinutes: Math.max(0, Number(byId('minutes').value) || 0),
      position: byId('position').value,
      venue: byId('venue').value,
    });

    const body = document.createDocumentFragment();
    for (const row of rows) {
      const player = row.player;
      const tr = document.createElement('tr');
      const nameCell = tr.insertCell();
      const profile = config.profiles[player.c];
      if (profile) {
        const link = document.createElement('a');
        [link.textContent, link.href] = profile;
        nameCell.append(link);
      } else {
        nameCell.textContent = player.n;
      }
      tr.insertCell().textContent = player.t.replaceAll(';', ' / ');
      tr.insertCell().textContent = integer.format(row.games);
      for (const key of ['minutes', 'pir', 'points', 'rebounds', 'assists']) {
        tr.insertCell().textContent = decimal.format(row[key]);
      }
      body.append(tr);
    }
    for (const header of headers) {
      if (header.dataset.stat === metric) header.setAttribute('aria-sort', 'descending');
      else header.removeAttribute('aria-sort');
    }
    tbody.replaceChildren(body);
    region.hidden = rows.length === 0;
    status.textContent = rows.length ? config.count.replace('{n}', integer.format(rows.length)) : config.empty;
  }

  for (const input of document.querySelectorAll('.finder-filters input, .finder-filters select')) {
    input.addEventListener('input', render);
  }
  render();
} catch {
  status.textContent = config.error;
}
