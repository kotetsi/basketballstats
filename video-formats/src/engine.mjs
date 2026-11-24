import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkRequirements } from './datasets.mjs';
import { assemble, checkStructure, BANNED } from './editorial.mjs';
import { checkScript } from '../../video-factory/src/script/factGuard.mjs';
import { estimateSecs, fitToDuration } from '../../video-factory/src/script/generator.mjs';
import { DURATIONS, FORMATS } from '../../video-factory/src/config.mjs';
import { THEMES } from '../../video-factory/src/templates/kit.mjs';

// Format registry + production-request builder. Formats are discovered from src/formats/*.mjs:
// adding a format = adding a file. The Video Factory renders the resulting request unchanged.

export const VL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FAMILIES = {
  statistical: 'Statistical intelligence', discovery: 'Player and team discovery', interactive: 'Interactive content',
  historical: 'Historical and storytelling', special: 'Special editorial formats',
};
const REQUIRED_FIELDS = ['id', 'name', 'family', 'description', 'concept', 'audience', 'durations', 'aspects', 'requires', 'validation', 'scriptStructure', 'visual', 'narration', 'frequency', 'example'];

let CACHE = null;
export async function loadFormats(dir = path.join(VL_ROOT, 'src', 'formats')) {
  if (CACHE && dir === CACHE.dir) return CACHE.list;
  const list = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    for (const spec of [].concat(mod.default || [])) {
      const miss = REQUIRED_FIELDS.filter(k => spec[k] == null);
      if (miss.length) throw new Error(`format in ${f} is missing ${miss.join(', ')}`);
      if (!FAMILIES[spec.family]) throw new Error(`format ${spec.id}: unknown family ${spec.family}`);
      if (spec.aspects.some(a => !FORMATS[a])) throw new Error(`format ${spec.id}: unknown aspect`);
      if (list.some(x => x.id === spec.id)) throw new Error(`duplicate format id ${spec.id}`);
      list.push({ version: 1, ...spec, functional: typeof spec.candidates === 'function' });
    }
  }
  list.sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
  CACHE = { dir, list };
  return list;
}

export function loadSettings(file = path.join(VL_ROOT, 'settings.json')) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { enabled: {}, defaults: {} }; }
}
export function saveSettings(s, file = path.join(VL_ROOT, 'settings.json')) { fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n'); return s; }
export const isEnabled = (spec, settings) => settings.enabled?.[spec.id] ?? true;

/** Can this format be produced now? Never guesses: explains exactly what is missing. */
export function availability(ctx, spec, settings = { enabled: {} }, opts = {}) {
  const req = checkRequirements(ctx, spec.requires);
  const base = { id: spec.id, enabled: isEnabled(spec, settings), functional: spec.functional, missing: req.missing };
  if (!spec.functional) return { ...base, status: req.ok ? 'planned' : 'missing-data', reason: req.ok ? 'data is available; the format builder is not implemented yet' : 'required data is missing' };
  if (!req.ok) return { ...base, status: 'missing-data', reason: 'required data is missing' };
  if (opts.lang && opts.lang !== 'en') return { ...base, status: 'missing-data', missing: [{ dataset: `language_${opts.lang}`, why: 'narration language', detail: ctx.datasets[`language_${opts.lang}`]?.note || 'language not supported' }], reason: 'language not supported yet' };
  if (spec.check) {
    const c = spec.check(ctx, opts);
    if (!c.ok) return { ...base, status: 'insufficient', reason: c.reason, missing: c.missing || [] };
  }
  return { ...base, status: base.enabled ? 'available' : 'disabled', reason: base.enabled ? 'ready' : 'disabled by administrator' };
}

function scenesOf(plan) { return new Set(plan.map(s => s.id)); }

/** Turns a format candidate into a Video Factory production request (a story of type "format"). */
export function toRequest(spec, cand, ctx, opts = {}) {
  const day = (opts.date || ctx.today).toISOString().slice(0, 10);
  const question = cand.question || null;
  const plan = [
    { id: 'intro', kind: 'title', kicker: spec.kicker || spec.name.toUpperCase(), title: cand.title, sub: cand.sub || '' },
    ...cand.plan,
    { id: 'outro', kind: 'outro', question, source: cand.source || 'Data: official EuroLeague statistics' },
  ];
  const scripts = {};
  const problems = [];
  const ids = scenesOf(plan);
  for (const preset of Object.keys(DURATIONS)) {
    const segs = assemble(cand.beats, preset, { question, cta: cand.cta || 'More at basketballstats.eu' });
    const st = checkStructure(segs, preset);
    if (!st.ok) problems.push(`${preset}: ${st.issues.join('; ')}`);
    const badScene = segs.filter(s => !ids.has(s.scene)).map(s => s.id);
    if (badScene.length) problems.push(`${preset}: segments point at unknown scenes (${badScene.join(', ')})`);
    if (segs.some(s => BANNED.test(s.text))) problems.push(`${preset}: generic/banned phrasing`);
    scripts[preset] = segs;
  }
  const story = {
    id: `${spec.id}-${cand.key}-${day}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').slice(0, 110),
    type: 'format', format: spec.id, formatVersion: spec.version, family: spec.family,
    params: { ...opts, key: cand.key }, title: cand.title, source: 'format-library', lang: opts.lang || 'en',
    theme: THEMES[opts.theme] ? opts.theme : 'classic',
    status: 'draft', createdAt: new Date().toISOString(), dataAsOf: ctx.model.dataAsOf, lastRound: ctx.lastRound,
    data: cand.data, plan, scripts,
    meta: { hook: cand.hook || cand.title, hashtags: cand.hashtags || spec.hashtags || [], linkPath: cand.linkPath || '/en/', question, narration: spec.narration.notes, narrationStyle: spec.narration.style, kicker: spec.name },
    entities: cand.entities || { players: [], teams: [] },
    signals: { significance: cand.significance ?? 0.5, dataQuality: cand.quality ?? 0.8 },
  };
  // fact check every duration against the request's own data
  for (const preset of Object.keys(DURATIONS)) {
    const fc = checkScript({ segments: scripts[preset] }, story);
    if (!fc.ok) problems.push(`${preset}: numbers not in data (${fc.unsupported.join(', ')})`);
  }
  const rec = spec.durations.recommended;
  const fitted = fitToDuration(scripts[rec], rec);
  const est = estimateSecs(fitted);
  if (est > DURATIONS[rec].max * 1.15) problems.push(`recommended ${rec} script runs ~${est}s`);
  story.estSecs = Object.fromEntries(Object.keys(DURATIONS).map(p => [p, estimateSecs(fitToDuration(scripts[p], p))]));
  return { story, problems };
}

/** Generates validated production requests for a format. Invalid candidates are dropped with reasons. */
export async function generate(ctx, spec, opts = {}, settings = loadSettings()) {
  const av = availability(ctx, spec, settings, opts);
  if (av.status !== 'available') return { availability: av, requests: [], rejected: [] };
  const o = { ...(spec.defaults || {}), ...(settings.defaults?.[spec.id] || {}), ...opts };
  const cands = spec.candidates(ctx, o) || [];
  const requests = [], rejected = [];
  for (const c of cands) {
    const { story, problems } = toRequest(spec, c, ctx, o);
    if (problems.length) rejected.push({ key: c.key, problems }); else requests.push(story);
  }
  // data was present but nothing met the format's validation rules: say so instead of forcing a story
  const finalAv = requests.length ? av : { ...av, status: 'insufficient', reason: cands.length ? 'all candidates failed validation' : 'no candidate meets the data validation rules right now' };
  return { availability: finalAv, requests, rejected };
}
