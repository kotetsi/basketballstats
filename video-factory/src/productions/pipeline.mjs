import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FORMATS, DURATIONS, STYLES, VF_ROOT } from '../config.mjs';
import { loadModel } from '../data/model.mjs';
import { StoryStore, requireApproved } from '../stories/store.mjs';
import { templateScript, estimateSecs } from '../script/generator.mjs';
import { llmScript } from '../script/llm.mjs';
import { checkScript } from '../script/factGuard.mjs';
import { narrate } from '../tts/narrate.mjs';
import { providerStatus } from '../tts/providers.mjs';
import { buildTimeline, buildCues, toSrt, toVtt } from '../subtitles/timeline.mjs';
import { buildPage, TEMPLATE_IDS } from '../templates/page.mjs';
import { mixAudio } from '../render/audio.mjs';
import { renderVideo, renderStill } from '../render/video.mjs';
import { platformPackages } from '../platforms/platforms.mjs';

// Production = one video project for one approved story. Metadata lives in
// productions/<id>/production.json (kept in git); media files go to out/<id>/ (not in git).

export const STATUS = ['draft', 'scripted', 'previewed', 'rendered', 'approved', 'published'];
const safe = id => { if (!/^[a-z0-9][a-z0-9._-]{0,150}$/i.test(id)) throw new Error('invalid id'); return id; };
const now = () => new Date().toISOString();
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
// rough per-provider cost per 1k characters, for the metadata only (USD)
const COST_PER_1K = { espeak: 0, openai: 0.015, elevenlabs: 0.2, google: 0.03 };

export class Productions {
  constructor(cfg, deps = {}) {
    this.cfg = cfg; this.deps = deps;
    this.stories = new StoryStore(cfg.storiesDir);
    fs.mkdirSync(cfg.productionsDir, { recursive: true }); fs.mkdirSync(cfg.outDir, { recursive: true });
  }
  log(...a) { (this.deps.log || (() => {}))(...a); }
  dir(id) { return path.join(this.cfg.productionsDir, safe(id)); }
  out(id) { return path.join(this.cfg.outDir, safe(id)); }
  model() { return this.deps.model || (this._m ||= loadModel(this.cfg.dataDir)); }

  list() {
    return fs.readdirSync(this.cfg.productionsDir).filter(d => fs.existsSync(path.join(this.cfg.productionsDir, d, 'production.json')))
      .map(d => this.get(d)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  get(id) { const f = path.join(this.dir(id), 'production.json'); try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
  save(p) { fs.mkdirSync(this.dir(p.id), { recursive: true }); p.updatedAt = now(); fs.writeFileSync(path.join(this.dir(p.id), 'production.json'), JSON.stringify(p, null, 2) + '\n'); return p; }
  event(p, action, extra = {}) { (p.history ||= []).push({ at: now(), action, ...extra }); return p; }

  create({ storyId, formats = ['9x16', '16x9'], preset = 'medium', voiceId = 'local-en', style = 'energetic', music = true }) {
    const story = requireApproved(this.stories.get(storyId));
    if (!formats.length || formats.some(f => !FORMATS[f])) throw new Error('choose at least one valid format');
    if (!DURATIONS[preset]) throw new Error('invalid duration');
    if (!this.cfg.voices[voiceId]) throw new Error('invalid voice');
    if (!STYLES[style]) throw new Error('invalid style');
    const id = `${story.id}-${Date.now().toString(36)}`.slice(0, 150);
    const p = {
      id, status: 'draft', createdAt: now(),
      story: { id: story.id, type: story.type, format: story.format || null, title: story.title, dataAsOf: story.dataAsOf, lastRound: story.lastRound, approvedAt: story.approvedAt },
      settings: { formats, preset, voiceId, style, music },
      template: story.format ? `format:${story.format}@${story.formatVersion || 1}` : TEMPLATE_IDS[story.type],
      format: story.format || null,
      script: null, narration: null, renders: [], platforms: null,
      assets: ['font-inter', 'graphics-generated', 'data-euroleague-stats', ...(music ? ['music-bed-generated'] : [])],
      publication: { approved: false, approvedAt: null, publishedTo: [] },
      performance: {},
    };
    return this.save(this.event(p, 'created', { storyId }));
  }

  update(id, settings) {
    const p = this.must(id);
    if (['approved', 'published'].includes(p.status)) throw new Error(`cannot change a ${p.status} production`);
    const s = { ...p.settings, ...settings };
    if (s.formats.some(f => !FORMATS[f]) || !DURATIONS[s.preset] || !this.cfg.voices[s.voiceId] || !STYLES[s.style]) throw new Error('invalid settings');
    const durationChanged = s.preset !== p.settings.preset;
    p.settings = s;
    if (durationChanged) { p.script = null; p.status = 'draft'; }
    return this.save(this.event(p, 'settings', settings));
  }

  must(id) { const p = this.get(id); if (!p) throw new Error('production not found'); return p; }
  story(p) { return requireApproved(this.stories.get(p.story.id)); }

  async script(id, { useLlm = true } = {}) {
    const p = this.must(id);
    const story = this.story(p);
    let script = templateScript(story, { preset: p.settings.preset, speed: STYLES[p.settings.style].speed });
    let llmNote = null;
    if (useLlm) {
      const r = await llmScript(story, script, this.cfg, { ...this.deps, style: p.settings.style });
      if (r.script) script = r.script; else llmNote = r.skipped || r.rejected;
    }
    p.script = { ...script, llmNote };
    p.status = 'scripted'; p.renders = []; // a new script invalidates old renders
    return this.save(this.event(p, 'scripted', { generator: script.generator, llmNote }));
  }

  editScript(id, segments) {
    const p = this.must(id);
    if (!p.script) throw new Error('generate a script first');
    if (['approved', 'published'].includes(p.status)) throw new Error(`cannot edit a ${p.status} production`);
    const byId = new Map(segments.map(s => [s.id, s]));
    p.script.segments = p.script.segments.map(s => {
      const e = byId.get(s.id); if (!e) return s;
      const text = String(e.text ?? s.text).trim(); if (!text) throw new Error(`segment ${s.id} is empty`);
      return { ...s, text, say: e.say !== undefined ? (String(e.say).trim() || undefined) : (text !== s.text && s.id !== 'outro' ? undefined : s.say) };
    });
    p.script.edited = true;
    p.script.estSecs = estimateSecs(p.script.segments, { speed: STYLES[p.settings.style].speed });
    p.script.factCheck = checkScript(p.script, this.story(p));
    p.status = 'scripted'; p.renders = [];
    return this.save(this.event(p, 'script-edited', { factCheck: p.script.factCheck.ok }));
  }

  /** mode: 'preview' (first format, half size, 15 fps) or 'final' (all formats, full size). */
  async render(id, { mode = 'final', formats } = {}) {
    const p = this.must(id);
    if (!p.script) throw new Error('generate a script first');
    if (['approved', 'published'].includes(p.status)) throw new Error(`already ${p.status}`);
    const voice = this.cfg.voices[p.settings.voiceId];
    const st = providerStatus(voice, this.deps.env || process.env);
    if (!st.ok) throw new Error(`voice unavailable: ${st.reason}`);
    const story = this.story(p), out = this.out(id);
    fs.mkdirSync(out, { recursive: true });
    const t0 = Date.now();
    const narration = await narrate(p.script, { voiceId: p.settings.voiceId, style: p.settings.style, cfg: this.cfg, outDir: path.join(out, 'narration'), fetchImpl: this.deps.fetchImpl || globalThis.fetch, env: this.deps.env || process.env, log: m => this.log(m) });
    const timeline = buildTimeline(p.script, narration);
    const cues = buildCues(timeline);
    fs.writeFileSync(path.join(out, 'captions.srt'), toSrt(cues));
    fs.writeFileSync(path.join(out, 'captions.vtt'), toVtt(cues));
    const htmlFile = path.join(out, 'page.html');
    fs.writeFileSync(htmlFile, buildPage({ story, timeline, cues }));
    const audio = mixAudio({ timeline, narration, out: path.join(out, 'audio.wav'), music: p.settings.music, musicVolume: this.cfg.musicVolume, loudness: this.cfg.loudness, tmpDir: out });
    fs.rmSync(path.join(out, 'bed.wav'), { force: true });
    const fmts = mode === 'preview' ? [(formats || p.settings.formats)[0]] : (formats || p.settings.formats);
    const scale = mode === 'preview' ? this.cfg.previewScale : 1, fps = mode === 'preview' ? this.cfg.previewFps : this.cfg.fps;
    const renders = [];
    for (const f of fmts) {
      const F = FORMATS[f], w = Math.round(F.w * scale / 2) * 2, h = Math.round(F.h * scale / 2) * 2;
      const file = path.join(out, `${mode}-${f}.mp4`);
      this.log(`render ${mode} ${f} ${w}x${h}@${fps}`);
      const r0 = Date.now();
      await renderVideo({ htmlFile, audioFile: audio, out: file, w, h, fps, duration: timeline.total, log: m => this.log(m), crf: mode === 'preview' ? 26 : 20 });
      const thumb = path.join(out, `${mode}-${f}.png`);
      // thumbnail: the last content frame before the outro (everything revealed)
      const outroAt = timeline.scenes.find(s => s.scene === 'outro')?.start ?? timeline.total;
      await renderStill({ htmlFile, out: thumb, w, h, t: Math.max(0, outroAt - 0.6) });
      renders.push({ mode, format: f, w, h, fps, secs: timeline.total, file: path.relative(VF_ROOT, file), thumb: path.relative(VF_ROOT, thumb), bytes: fs.statSync(file).size, sha256: sha(file), renderSecs: Math.round((Date.now() - r0) / 1000), at: now() });
    }
    p.narration = { provider: narration.provider, voiceId: narration.voiceId, voice: narration.voice, model: narration.model, style: narration.style, speed: narration.speed, secs: timeline.total, billedChars: narration.billedChars, estCostUsd: Math.round((narration.billedChars / 1000) * (COST_PER_1K[narration.provider] ?? 0) * 1000) / 1000 };
    p.timeline = timeline;
    p.captions = { srt: path.relative(VF_ROOT, path.join(out, 'captions.srt')), vtt: path.relative(VF_ROOT, path.join(out, 'captions.vtt')), cues: cues.length };
    p.renders = [...p.renders.filter(r => !(r.mode === mode && fmts.includes(r.format))), ...renders];
    if (mode === 'final') { p.status = 'rendered'; p.platforms = platformPackages(p, story, { site: this.cfg.site }); }
    else if (p.status !== 'rendered') p.status = 'previewed';
    return this.save(this.event(p, `render-${mode}`, { formats: fmts, secs: Math.round((Date.now() - t0) / 1000) }));
  }

  approve(id, by = 'admin') {
    const p = this.must(id);
    if (p.status !== 'rendered') throw new Error('render the final video before approving');
    if (!p.script.factCheck.ok) throw new Error(`script has numbers not in the data: ${p.script.factCheck.unsupported.join(', ')}`);
    p.status = 'approved'; p.publication = { ...p.publication, approved: true, approvedAt: now(), approvedBy: by };
    return this.save(this.event(p, 'approved', { by }));
  }

  markPublished(id, { platform, url }) {
    const p = this.must(id);
    if (!['approved', 'published'].includes(p.status)) throw new Error('approve before publishing');
    p.status = 'published'; p.publication.publishedTo.push({ platform, url: url || null, at: now() });
    return this.save(this.event(p, 'published', { platform, url }));
  }

  /** Performance feedback (manual entry now; platform APIs later). */
  recordMetrics(id, platform, m) {
    const p = this.must(id);
    const keys = ['views', 'avgWatchSecs', 'completionRate', 'likes', 'comments', 'shares', 'saves', 'clicks', 'siteSessions', 'registrations'];
    const clean = Object.fromEntries(keys.filter(k => m[k] !== undefined && m[k] !== '').map(k => [k, Number(m[k])]).filter(([, v]) => Number.isFinite(v)));
    p.performance[platform] = { ...(p.performance[platform] || {}), ...clean, updatedAt: now() };
    return this.save(this.event(p, 'metrics', { platform }));
  }
}

