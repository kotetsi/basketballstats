import { DURATIONS, DEFAULTS } from '../config.mjs';
import { checkScript } from './factGuard.mjs';

// Template scripts: deterministic, English, built only from story.data. Each segment is one
// narration line bound to a visual scene. `text` is shown as captions; `say` (optional) is what
// the voice reads when it should differ (e.g. the site name).
// Segments marked optional are dropped first when the script is too long for the chosen duration.

const f = x => (x == null ? '' : Number.isInteger(x) ? String(x) : x.toFixed(1));
const SITE_SAY = 'basketball stats dot E U';
const words = t => String(t).trim().split(/\s+/).filter(Boolean).length;
const surname = n => n.split(' ').slice(1).join(' ') || n;
const pl = (n, w) => `${f(n)} ${w}${n === 1 ? '' : 's'}`;
const ORD = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function seg(id, scene, text, extra = {}) { return { id, scene, text, ...extra }; }
function outro(kind) {
  const t = { leaderboard: 'Full rankings at basketballstats.eu', comparison: 'Compare any two players at basketballstats.eu', spotlight: 'Every game log at basketballstats.eu' }[kind];
  return seg('outro', 'outro', `${t}.`, { say: `${t.replace('basketballstats.eu', SITE_SAY)}.` });
}

function leaderboardScript(story, preset) {
  const d = story.data, items = d.items;
  const n = Math.min(items.length, { short: 3, medium: 5, long: 8, editorial: 10 }[preset] ?? 5);
  const shown = items.slice(0, n);
  const isRound = d.scope === 'round';
  const out = [seg('intro', 'intro', isRound
    ? `Round ${d.round}: the top ${n} ${d.metricSpoken} performances in the EuroLeague.`
    : `Who leads the EuroLeague in ${d.metricSpoken} this season? Here are the top ${n}.`)];
  for (const it of [...shown].reverse()) {
    const v = f(it.value);
    let t;
    if (preset === 'short') t = `${ORD[it.rank]}: ${it.name}, ${v}.`;
    else if (isRound) t = `Number ${it.rank}: ${it.name} of ${it.teamName}, ${v} ${d.metricSpoken} ${it.home ? 'at home against' : 'away at'} ${it.oppName}.`;
    else t = `Number ${it.rank}: ${it.name} of ${it.teamName}, with ${v} ${d.metricSpoken} per game.`;
    out.push(seg(`rank-${it.rank}`, 'board', t, { focus: it.rank }));
  }
  if (preset !== 'short' && shown.length >= 2) {
    const [a, b] = shown, gap = d.gapTop2;
    if (gap > 0) out.push(seg('gap', 'board', `${surname(a.name)} leads ${surname(b.name)} by ${f(gap)}.`, { focus: 1, optional: true }));
  }
  if (!isRound && preset !== 'short') out.push(seg('note', 'board', `Minimum ${d.minGames} games played, through round ${d.lastRound}.`, { focus: 0, optional: true }));
  out.push(outro('leaderboard'));
  return out;
}

function comparisonScript(story, preset) {
  const d = story.data, [A, B] = d.players, a = surname(A.name), b = surname(B.name);
  const out = [seg('intro', 'intro', `${A.name} or ${B.name}? Let's put the numbers side by side.`)];
  const rows = d.rows.filter(r => preset === 'short' ? ['pir', 'pts'].includes(r.key) : preset === 'medium' ? r.key !== 'ts' : true);
  for (const r of rows) {
    const unit = r.key === 'ts' ? ' percent' : '';
    out.push(seg(`row-${r.key}`, 'compare', `${r.label}: ${a} ${f(r.a)}${unit}, ${b} ${f(r.b)}${unit}.`, { focus: r.key }));
  }
  if (preset !== 'short') {
    const diffs = d.radarKeys.map(k => ({ k, d: A.radar[k] - B.radar[k] })).sort((x, y) => y.d - x.d);
    const aBest = diffs.filter(x => x.d > 5).slice(0, 2).map(x => d.radarLabels[x.k].toLowerCase());
    const bBest = diffs.filter(x => x.d < -5).slice(-2).reverse().map(x => d.radarLabels[x.k].toLowerCase());
    const parts = [];
    if (aBest.length) parts.push(`${a} rates higher in ${aBest.join(' and ')}`);
    if (bBest.length) parts.push(`${b} in ${bBest.join(' and ')}`);
    if (parts.length) out.push(seg('radar', 'radar', `Compared with the rest of the league, ${parts.join(', ')}.`));
  }
  out.push(seg('form', 'compare', `Recent form, last ${A.last5Count} games: ${f(A.last5Pir)} PIR for ${a}, ${f(B.last5Pir)} for ${b}.`, { focus: 'form', optional: preset === 'short' }));
  out.push(outro('comparison'));
  return out;
}

function spotlightScript(story, preset) {
  const d = story.data, P = d.player, s = surname(P.name);
  const out = [seg('intro', 'intro', `${P.name}'s last ${d.n} games, in numbers.`)];
  const dir = d.avgLastN >= d.season.pir ? 'up from' : 'compared with';
  out.push(seg('avg', 'big', `${f(d.avgLastN)} PIR per game over that stretch, ${dir} ${f(d.season.pir)} on the season.`, { focus: 'avg' }));
  if (preset !== 'short') out.push(seg('season', 'big', `Season line: ${pl(d.season.pts, 'point')}, ${pl(d.season.reb, 'rebound')} and ${pl(d.season.ast, 'assist')} in ${f(d.season.min)} minutes.`, { focus: 'season' }));
  out.push(seg('best', 'timeline', `His best: ${f(d.best.pir)} PIR against ${d.best.oppName} in round ${d.best.round}.`, { focus: d.best.round }));
  out.push(seg('last', 'timeline', `Last time out: ${f(d.last.pir)} PIR and ${pl(d.last.pts, 'point')} against ${d.last.oppName}.`, { focus: d.last.round, optional: preset === 'short' }));
  if (preset !== 'short') out.push(seg('above', 'timeline', `${s} beat his season average in ${d.aboveAvg} of the ${d.n} games.`, { focus: 'avg', optional: true }));
  out.push(outro('spotlight'));
  return out;
}

const BY_TYPE = { leaderboard: leaderboardScript, comparison: comparisonScript, spotlight: spotlightScript };

export function estimateSecs(segments, { wordsPerSecond = DEFAULTS.wordsPerSecond, speed = 1, gapSecs = DEFAULTS.gapSecs } = {}) {
  const w = segments.reduce((n, s) => n + words(s.say || s.text), 0);
  return Math.round((w / (wordsPerSecond * speed) + gapSecs * segments.length + DEFAULTS.introPadSecs + DEFAULTS.outroTailSecs) * 10) / 10;
}

/** Drops optional segments (from the end) until the estimate fits the preset's max. */
export function fitToDuration(segments, preset, opts) {
  const D = DURATIONS[preset];
  let out = [...segments];
  while (estimateSecs(out, opts) > D.max) {
    const i = out.map(s => !!s.optional).lastIndexOf(true);
    if (i < 0) break;
    out.splice(i, 1);
  }
  return out;
}

// Production requests from the Video Format Library carry ready scripts per duration
// (story.scripts[preset]); the engine only fits and checks them. Nearest preset is used if missing.
const PRESET_ORDER = ['short', 'medium', 'long', 'editorial'];
function requestScript(story, preset) {
  const i = PRESET_ORDER.indexOf(preset);
  const order = [...PRESET_ORDER.slice(0, i + 1).reverse(), ...PRESET_ORDER.slice(i + 1)];
  const key = order.find(k => story.scripts[k]?.length);
  if (!key) throw new Error(`request ${story.id} has no script`);
  return structuredClone(story.scripts[key]);
}

export function templateScript(story, { preset = 'medium', speed = 1 } = {}) {
  if (!DURATIONS[preset]) throw new Error(`unknown duration ${preset}`);
  const fn = story.scripts ? s => requestScript(s, preset) : BY_TYPE[story.type] && (s => BY_TYPE[story.type](s, preset));
  if (!fn) throw new Error(`no script template for ${story.type}`);
  const segments = fitToDuration(fn(story), preset, { speed });
  const script = { lang: story.lang || 'en', preset, generator: story.scripts ? `format:${story.format}` : 'template', segments, createdAt: new Date().toISOString() };
  script.estSecs = estimateSecs(segments, { speed });
  script.factCheck = checkScript(script, story);
  return script;
}
