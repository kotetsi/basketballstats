import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig, FORMATS, DURATIONS, STYLES } from '../src/config.mjs';
import { loadModel } from '../src/data/model.mjs';
import { buildStory, STORY_TYPES, METRICS } from '../src/stories/builders.mjs';
import { StoryStore } from '../src/stories/store.mjs';
import { Productions } from '../src/productions/pipeline.mjs';
import { providerStatus } from '../src/tts/providers.mjs';
import { PLATFORMS } from '../src/platforms/platforms.mjs';

// Video production dashboard (local). Nothing is published from here: "approve" marks a video as
// cleared for publication; publishing is done by hand and recorded with "mark as published".

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.png': 'image/png', '.srt': 'text/plain; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8', '.wav': 'audio/wav' };

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
async function body(req) {
  let n = 0; const c = [];
  for await (const x of req) { n += x.length; if (n > 500_000) throw Object.assign(new Error('body too large'), { code: 413 }); c.push(x); }
  const s = Buffer.concat(c).toString('utf8'); return s ? JSON.parse(s) : {};
}

function serveFile(req, res, file, download) {
  const stat = fs.statSync(file), type = MIME[path.extname(file)] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  if (download) headers['Content-Disposition'] = `attachment; filename="${path.basename(path.dirname(file))}-${path.basename(file)}"`;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const start = m[1] ? +m[1] : 0, end = m[2] ? Math.min(+m[2], stat.size - 1) : stat.size - 1;
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  fs.createReadStream(file).pipe(res);
}

export function createServer(cfg, deps = {}) {
  const stories = new StoryStore(cfg.storiesDir);
  const P = new Productions(cfg, deps);
  const model = () => deps.model || (P._m ||= loadModel(cfg.dataDir));
  const password = deps.password ?? process.env.VF_DASHBOARD_PASSWORD ?? '';
  const env = deps.env || process.env;
  const jobs = new Map();
  let queue = Promise.resolve();
  const runJob = (kind, prodId, fn) => {
    const id = crypto.randomUUID().slice(0, 8);
    const job = { id, kind, prodId, status: 'queued', log: [], startedAt: null, endedAt: null, error: null };
    jobs.set(id, job);
    queue = queue.then(async () => {
      job.status = 'running'; job.startedAt = new Date().toISOString();
      try { await fn(m => { job.log.push(m); if (job.log.length > 200) job.log.shift(); }); job.status = 'done'; }
      catch (e) { job.status = 'failed'; job.error = e.message; }
      job.endedAt = new Date().toISOString();
    });
    return job;
  };

  const R = [
    ['GET', /^\/api\/meta$/, (req, res) => json(res, 200, {
      formats: FORMATS, durations: DURATIONS, styles: STYLES, storyTypes: STORY_TYPES, metrics: METRICS, platforms: PLATFORMS,
      voices: Object.fromEntries(Object.entries(cfg.voices).map(([k, v]) => [k, { label: v.label, provider: v.provider, lang: v.lang, available: providerStatus(v, env) }])),
      llm: { model: cfg.llm.model, available: !!env.ANTHROPIC_API_KEY && cfg.llm.enabled },
      players: model().players.filter(p => p.season).map(p => ({ slug: p.slug, name: p.name, team: p.teamName })).sort((a, b) => a.name.localeCompare(b.name)),
      lastRound: model().lastRound, dataAsOf: model().dataAsOf, plugins: Object.keys(pages),
    })],
    ['GET', /^\/api\/stories$/, (req, res) => json(res, 200, { items: stories.list() })],
    ['POST', /^\/api\/stories$/, async (req, res) => {
      const b = await body(req);
      try { json(res, 201, stories.save(buildStory(model(), { type: b.type, params: b.params || {}, title: b.title || undefined }))); }
      catch (e) { json(res, 400, { error: e.message }); }
    }],
    ['POST', /^\/api\/stories\/([^/]+)\/approve$/, (req, res, m) => json(res, 200, stories.approve(decodeURIComponent(m[1])))],
    ['GET', /^\/api\/productions$/, (req, res) => json(res, 200, { items: P.list() })],
    ['POST', /^\/api\/productions$/, async (req, res) => {
      const b = await body(req);
      try { json(res, 201, P.create(b)); } catch (e) { json(res, 400, { error: e.message }); }
    }],
    ['GET', /^\/api\/productions\/([^/]+)$/, (req, res, m) => { const p = P.get(decodeURIComponent(m[1])); p ? json(res, 200, { ...p, storyData: stories.get(p.story.id)?.data }) : json(res, 404, { error: 'not found' }); }],
    ['PATCH', /^\/api\/productions\/([^/]+)$/, async (req, res, m) => json(res, 200, P.update(decodeURIComponent(m[1]), await body(req)))],
    ['POST', /^\/api\/productions\/([^/]+)\/script$/, async (req, res, m) => { const b = await body(req); json(res, 200, await P.script(decodeURIComponent(m[1]), { useLlm: b.useLlm !== false })); }],
    ['PUT', /^\/api\/productions\/([^/]+)\/script$/, async (req, res, m) => json(res, 200, P.editScript(decodeURIComponent(m[1]), (await body(req)).segments || []))],
    ['POST', /^\/api\/productions\/([^/]+)\/render$/, async (req, res, m) => {
      const id = decodeURIComponent(m[1]), b = await body(req), mode = b.mode === 'preview' ? 'preview' : 'final';
      P.must(id);
      const job = runJob(`render-${mode}`, id, log => new Productions(cfg, { ...deps, log }).render(id, { mode }));
      json(res, 202, job);
    }],
    ['GET', /^\/api\/jobs\/([^/]+)$/, (req, res, m) => { const j = jobs.get(m[1]); j ? json(res, 200, j) : json(res, 404, { error: 'not found' }); }],
    ['POST', /^\/api\/productions\/([^/]+)\/approve$/, (req, res, m) => json(res, 200, P.approve(decodeURIComponent(m[1]))) ],
    ['POST', /^\/api\/productions\/([^/]+)\/published$/, async (req, res, m) => { const b = await body(req); if (!PLATFORMS[b.platform]) return json(res, 400, { error: 'unknown platform' }); json(res, 200, P.markPublished(decodeURIComponent(m[1]), b)); }],
    ['POST', /^\/api\/productions\/([^/]+)\/metrics$/, async (req, res, m) => { const b = await body(req); if (!PLATFORMS[b.platform]) return json(res, 400, { error: 'unknown platform' }); json(res, 200, P.recordMetrics(decodeURIComponent(m[1]), b.platform, b)); }],
    ['GET', /^\/media\/([^/]+)\/([a-z0-9._-]+)$/i, (req, res, m, url) => {
      const dir = path.resolve(cfg.outDir, m[1]), file = path.resolve(dir, m[2]);
      if (!dir.startsWith(path.resolve(cfg.outDir) + path.sep) || !file.startsWith(dir + path.sep) || !fs.existsSync(file)) return json(res, 404, { error: 'not found' });
      serveFile(req, res, file, url.searchParams.has('download'));
    }],
  ];

  // plugins (e.g. the Video Format Library) add routes and pages without changing this file
  const pages = {};
  for (const make of deps.plugins || []) {
    const pl = make({ cfg, deps, stories, P, runJob, json, body, model });
    R.unshift(...(pl.routes || []));
    Object.assign(pages, pl.pages || {});
  }

  return http.createServer(async (req, res) => {
    try {
      if (password) {
        const p = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':');
        const h = x => crypto.createHash('sha256').update(x).digest();
        if (!p || !crypto.timingSafeEqual(h(p), h(password))) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="video-factory"' }); return res.end('auth required'); }
      }
      const url = new URL(req.url, 'http://localhost');
      if (req.method !== 'GET') {
        if (!/application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'JSON required' });
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'cross-origin request refused' });
      }
      for (const [method, re, fn] of R) { const m = url.pathname.match(re); if (m && req.method === method) return await fn(req, res, m, url); }
      if (req.method === 'GET' && pages[url.pathname]) { const pg = pages[url.pathname]; res.writeHead(200, { 'Content-Type': pg.type || 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(pg.body()); }
      if (req.method === 'GET') {
        const f = path.join(PUBLIC, path.normalize(url.pathname === '/' ? 'index.html' : url.pathname.slice(1)));
        if (f.startsWith(PUBLIC) && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); return fs.createReadStream(f).pipe(res); }
      }
      json(res, 404, { error: 'not found' });
    } catch (e) { json(res, e.code === 413 ? 413 : /not found|invalid|cannot|before|first|already|unavailable|approve/i.test(e.message) ? 400 : 500, { error: e.message }); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig();
  const port = +process.env.PORT || 4318;
  const plugins = [];
  const vl = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../video-formats/dashboard/plugin.mjs');
  if (fs.existsSync(vl)) plugins.push((await import(vl)).default);
  createServer(cfg, { plugins }).listen(port, '127.0.0.1', () => console.log(`Video Factory dashboard: http://127.0.0.1:${port}/`));
}
