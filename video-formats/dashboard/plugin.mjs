import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext } from '../src/datasets.mjs';
import { loadFormats, availability, generate, loadSettings, saveSettings, FAMILIES, VL_ROOT } from '../src/engine.mjs';
import { scoreRequest } from '../src/scoring.mjs';
import { buildCalendar, addPlanEntry, removePlanEntry } from '../src/calendar.mjs';
import { performanceByFormat, perfIndex, loadProductions } from '../src/analytics.mjs';
import { THEMES } from '../../video-factory/src/templates/kit.mjs';
import { DURATIONS, STYLES } from '../../video-factory/src/config.mjs';

// Video Format Library admin, mounted into the Video Factory dashboard as a plugin.
// Production requests are saved as Video Factory stories; approving one = approving the story.

const HERE = path.dirname(fileURLToPath(import.meta.url));

export default function formatsPlugin({ cfg, deps, stories, P, runJob, json, body }) {
  const settingsFile = deps.formatSettingsFile || path.join(VL_ROOT, 'settings.json');
  const planFile = deps.calendarFile || path.join(VL_ROOT, 'calendar.json');
  let ctx = null, ctxAt = 0;
  const getCtx = () => { if (!ctx || Date.now() - ctxAt > 10 * 60e3) { ctx = deps.formatContext || loadContext(cfg.dataDir); ctxAt = Date.now(); } return ctx; };
  const pending = new Map(); // generated, not yet accepted requests
  const history = () => loadProductions(cfg.productionsDir).filter(p => p.format).map(p => ({ format: p.format, createdAt: p.createdAt, entities: stories.get(p.story.id)?.entities }));

  const routes = [
    ['GET', /^\/api\/formats$/, async (req, res) => {
      const F = await loadFormats(), s = loadSettings(settingsFile), c = getCtx();
      json(res, 200, { families: FAMILIES, themes: THEMES, durations: DURATIONS, styles: STYLES, datasets: c.datasets, formats: F.map(f => ({ ...strip(f), availability: availability(c, f, s), settings: s.defaults?.[f.id] || {} })) });
    }],
    ['PUT', /^\/api\/formats\/([a-z0-9-]+)\/settings$/, async (req, res, m) => {
      const b = await body(req), s = loadSettings(settingsFile);
      if (!(await loadFormats()).some(f => f.id === m[1])) return json(res, 404, { error: 'unknown format' });
      if (b.enabled != null) (s.enabled ||= {})[m[1]] = !!b.enabled;
      if (b.defaults) {
        const d = {}, x = b.defaults;
        if (x.preset && DURATIONS[x.preset]) d.preset = x.preset;
        if (x.theme && THEMES[x.theme]) d.theme = x.theme;
        if (x.style && STYLES[x.style]) d.style = x.style;
        if (x.lang) d.lang = String(x.lang).slice(0, 5);
        for (const k of ['count', 'minAttempts', 'minShots', 'maxAge', 'maxMin', 'minFga', 'round']) if (x[k] !== undefined && x[k] !== '' && Number.isFinite(+x[k])) d[k] = +x[k];
        (s.defaults ||= {})[m[1]] = d;
      }
      json(res, 200, saveSettings(s, settingsFile));
    }],
    ['POST', /^\/api\/formats\/([a-z0-9-]+)\/generate$/, async (req, res, m) => {
      const F = await loadFormats(), spec = F.find(f => f.id === m[1]);
      if (!spec) return json(res, 404, { error: 'unknown format' });
      const b = await body(req), c = getCtx(), s = loadSettings(settingsFile);
      const r = await generate(c, spec, b.options || {}, s);
      const perf = perfIndex(performanceByFormat(cfg.productionsDir, F)), H = history();
      const items = r.requests.map(q => { const sc = scoreRequest(q, spec, c, { history: H, perf }); pending.set(q.id, q); return { id: q.id, title: q.title, estSecs: q.estSecs, score: sc, script: q.scripts[spec.durations.recommended], entities: q.entities }; }).sort((a, b) => b.score.score - a.score.score);
      json(res, 200, { availability: r.availability, items, rejected: r.rejected });
    }],
    ['POST', /^\/api\/formats\/requests\/([^/]+)\/accept$/, async (req, res, m) => {
      const q = pending.get(decodeURIComponent(m[1])); if (!q) return json(res, 404, { error: 'request expired: generate again' });
      stories.save(q); const st = stories.approve(q.id, 'admin');
      json(res, 200, { story: st.id, status: st.status });
    }],
    ['POST', /^\/api\/formats\/requests\/([^/]+)\/sample$/, async (req, res, m) => {
      const q = pending.get(decodeURIComponent(m[1])); if (!q) return json(res, 404, { error: 'request expired: generate again' });
      stories.save(q); stories.approve(q.id, 'admin');
      const F = await loadFormats(), spec = F.find(f => f.id === q.format), d = loadSettings(settingsFile).defaults?.[q.format] || {};
      const prod = P.create({ storyId: q.id, formats: ['9x16'], preset: d.preset || spec.durations.recommended, voiceId: d.voice && cfg.voices[d.voice] ? d.voice : 'local-en', style: d.style || spec.narration.style || 'energetic' });
      await P.script(prod.id, { useLlm: true });
      const job = runJob('render-preview', prod.id, log => new (P.constructor)(cfg, { ...deps, log }).render(prod.id, { mode: 'preview' }));
      json(res, 202, { production: prod.id, job });
    }],
    ['GET', /^\/api\/calendar$/, async (req, res, m, url) => {
      const F = await loadFormats();
      json(res, 200, await buildCalendar(getCtx(), F, { days: Math.min(42, +url.searchParams.get('days') || 14), settings: loadSettings(settingsFile), productionsDir: cfg.productionsDir, planFile }));
    }],
    ['POST', /^\/api\/calendar$/, async (req, res) => { const b = await body(req); if (!(await loadFormats()).some(f => f.id === b.formatId)) return json(res, 400, { error: 'unknown format' }); json(res, 201, addPlanEntry(b, planFile)); }],
    ['DELETE', /^\/api\/calendar\/([a-z0-9]+)$/, (req, res, m) => json(res, 200, removePlanEntry(m[1], planFile))],
    ['GET', /^\/api\/formats\/performance$/, async (req, res) => json(res, 200, performanceByFormat(cfg.productionsDir, await loadFormats()))],
  ];
  return {
    routes,
    pages: {
      '/formats': { body: () => fs.readFileSync(path.join(HERE, 'formats.html'), 'utf8') },
      '/formats.js': { type: 'text/javascript; charset=utf-8', body: () => fs.readFileSync(path.join(HERE, 'formats.js'), 'utf8') },
    },
  };
}

function strip(f) { const { candidates, check, ...rest } = f; return rest; }
