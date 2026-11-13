import { R } from '../compare/metrics.mjs';

const metrics = {
  pts: [R.pts],
  reb: [R.oreb, R.dreb],
  ast: [R.ast],
  m3: [R.m3],
  pir: [R.pir],
};

export function buildQuizPool(players, displayName) {
  const names = players.map(player => displayName(player.n));
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  return players.flatMap((player, index) => {
    const name = names[index];
    const games = player.g.filter(game => game[R.sec] > 0);
    if (games.length < 3 || !name || counts.get(name) !== 1) return [];
    const totals = Object.entries(metrics).flatMap(([metric, columns]) => {
      const values = games.flatMap(game => columns.map(column => game[column]));
      if (!values.every(Number.isSafeInteger)) return [];
      return [[metric, values.reduce((sum, value) => sum + value, 0)]];
    });
    return [{ id: String(player.c), name, totals: Object.fromEntries(totals) }];
  });
}

function seededRandom(seed) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function shuffled(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const rankRanges = { easy: 30, medium: 12, hard: 4 };

export function quizQuestions(pool, seed, level = 'medium') {
  if (!Object.hasOwn(rankRanges, level)) throw new RangeError('Unknown quiz level');
  const random = seededRandom(seed + '/' + level);
  const questions = [];
  for (const metric of Object.keys(metrics)) {
    const ranked = pool.filter(player => Number.isSafeInteger(player.totals[metric]))
      .sort((a, b) => b.totals[metric] - a.totals[metric] || (a.id < b.id ? -1 : Number(a.id > b.id)));
    const groups = new Map();
    for (const player of ranked) {
      const value = player.totals[metric];
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(player);
    }
    if (groups.size < 4) return [];
    // Compare nearby season totals in Hard and spread the distractors out in Easy.
    const start = Math.floor(random() * Math.min(8, groups.size - 3));
    const window = [...groups.values()].slice(start, start + rankRanges[level]);
    const last = window.length - 1;
    const candidates = shuffled([0, Math.floor(last / 3), Math.floor(2 * last / 3), last]
      .map(index => window[index]), random);
    const options = candidates.map(group => {
      const { name, totals } = group[Math.floor(random() * group.length)];
      return { name, value: totals[metric] };
    });
    const answer = options.reduce((best, option) => option.value > best.value ? option : best);
    questions.push({ metric, options, correct: options.indexOf(answer) });
  }
  return shuffled(questions, random);
}
