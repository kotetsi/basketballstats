import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { model, tmpCfg, fakeFetch, toneWav, HAS_ESPEAK, HAS_FFMPEG, hasBrowser } from './helpers.mjs';
import { buildStory } from '../src/stories/builders.mjs';
import { templateScript } from '../src/script/generator.mjs';
import { PROVIDERS, providerStatus } from '../src/tts/providers.mjs';
import { narrate, probeSecs } from '../src/tts/narrate.mjs';
import { buildTimeline, buildCues, toSrt, toVtt, splitCaption } from '../src/subtitles/timeline.mjs';
import { buildPage } from '../src/templates/page.mjs';
import { mixAudio } from '../src/render/audio.mjs';
import { renderVideo } from '../src/render/video.mjs';
import { VF_ROOT } from '../src/config.mjs';

const story = () => buildStory(model(), { type: 'spotlight', params: { player: 'sasha-vezenkov', n: 5 } });

test('provider requests: OpenAI, ElevenLabs, Google use their documented endpoints and keys', async () => {
  const wav = toneWav(1);
  const f = fakeFetch([
    [/api\.openai\.com\/v1\/audio\/speech/, (u, o) => { assert.equal(o.headers.Authorization, 'Bearer OK'); return { body: wav }; }],
    [/api\.elevenlabs\.io\/v1\/text-to-speech\/VOICE\?output_format=mp3_44100_128/, (u, o) => { assert.equal(o.headers['xi-api-key'], 'EK'); return { body: wav }; }],
    [/texttospeech\.googleapis\.com\/v1\/text:synthesize\?key=GK/, () => ({ body: { audioContent: wav.toString('base64') } })],
  ]);
  const env = { OPENAI_API_KEY: 'OK', ELEVENLABS_API_KEY: 'EK', GOOGLE_TTS_API_KEY: 'GK' };
  const o = await PROVIDERS.openai.synth({ text: 'hi', voice: { voice: 'onyx', model: 'gpt-4o-mini-tts', instructions: 'calm' }, speed: 1.1 }, { fetchImpl: f, env });
  assert.equal(o.ext, 'wav'); assert.equal(f.calls[0].body.voice, 'onyx'); assert.equal(f.calls[0].body.speed, 1.1); assert.equal(f.calls[0].body.instructions, 'calm');
  await PROVIDERS.elevenlabs.synth({ text: 'hi', voice: { voice: 'VOICE' }, speed: 1 }, { fetchImpl: f, env });
  assert.equal(f.calls[1].body.model_id, 'eleven_multilingual_v2');
  const g = await PROVIDERS.google.synth({ text: 'hi', voice: { voice: 'en-US-Chirp3-HD-Charon', languageCode: 'en-US' }, speed: 1 }, { fetchImpl: f, env });
  assert.equal(g.bytes.length, wav.length);
  assert.deepEqual(providerStatus({ provider: 'openai' }, {}), { ok: false, reason: 'missing OPENAI_API_KEY' });
  await assert.rejects(PROVIDERS.openai.synth({ text: 'x', voice: { voice: 'onyx' }, speed: 1 }, { fetchImpl: fakeFetch([[/openai/, () => ({ status: 401, body: 'bad key' })]]), env }), /HTTP 401/);
});

test('narration via a cloud provider is cached per line (edits only re-pay changed lines)', { skip: !HAS_FFMPEG }, async () => {
  const cfg = tmpCfg(), wav = toneWav(1);
  const f = fakeFetch([[/openai/, () => ({ body: wav })]]);
  const sc = templateScript(story(), { preset: 'short' });
  const out = fs.mkdtempSync(path.join(cfg.cacheDir + '-n'));
  const a = await narrate(sc, { voiceId: 'openai-onyx', cfg, outDir: out, fetchImpl: f, env: { OPENAI_API_KEY: 'k' } });
  assert.equal(f.calls.length, sc.segments.length);
  assert.ok(a.segments.every(s => s.secs > 0.5 && s.secs < 1.2));
  sc.segments[1] = { ...sc.segments[1], text: 'An edited line.' };
  await narrate(sc, { voiceId: 'openai-onyx', cfg, outDir: out, fetchImpl: f, env: { OPENAI_API_KEY: 'k' } });
  assert.equal(f.calls.length, sc.segments.length + 1);
  await assert.rejects(narrate(sc, { voiceId: 'openai-onyx', cfg, outDir: out, env: {} }), /missing OPENAI_API_KEY/);
});

test('timeline and captions: ordered, inside their segments, valid SRT/VTT', () => {
  const sc = templateScript(story(), { preset: 'medium' });
  const nar = { segments: sc.segments.map((s, i) => ({ id: s.id, secs: 2 + i * 0.1 })) };
  const tl = buildTimeline(sc, nar);
  assert.equal(tl.scenes[0].start, 0); assert.equal(tl.scenes.at(-1).end, tl.total);
  for (let i = 1; i < tl.scenes.length; i++) assert.equal(tl.scenes[i].start, tl.scenes[i - 1].end);
  const cues = buildCues(tl);
  for (const c of cues) { const s = tl.segments.find(x => x.id === c.segment); assert.ok(c.start >= s.start - 1e-6 && c.end <= s.end + 1e-6); assert.ok(c.text.split('\n').length <= 2); }
  assert.match(toSrt(cues), /^1\n00:00:00,\d{3} --> 00:00:\d\d,\d{3}\n/);
  assert.match(toVtt(cues), /^WEBVTT\n\n00:00:00\.\d{3} --> /);
  assert.ok(splitCaption('a '.repeat(60)).every(c => c.split('\n').every(l => l.length <= 32)));
});

test('page uses only local, licensed assets (no remote URLs, fonts from the registry)', () => {
  const sc = templateScript(story(), { preset: 'short' });
  const tl = buildTimeline(sc, { segments: sc.segments.map(s => ({ id: s.id, secs: 1 })) });
  const html = buildPage({ story: story(), timeline: tl, cues: buildCues(tl) });
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/);
  const reg = JSON.parse(fs.readFileSync(path.join(VF_ROOT, 'assets', 'licenses.json'), 'utf8'));
  const fonts = [...html.matchAll(/assets\/fonts\/([\w.-]+)/g)].map(m => `assets/fonts/${m[1]}`);
  assert.ok(fonts.length >= 4);
  for (const f of fonts) { assert.ok(reg.assets['font-inter'].files.includes(f), f); assert.ok(fs.existsSync(path.join(VF_ROOT, f))); }
  assert.ok(fs.existsSync(path.join(VF_ROOT, reg.assets['font-inter'].licenseFile)));
});

test('end to end: local voice → mixed audio → real MP4 (H.264 + AAC) in 9:16 and 16:9', { skip: !(HAS_ESPEAK && HAS_FFMPEG) }, async t => {
  if (!(await hasBrowser())) return t.skip('no headless browser');
  const cfg = tmpCfg(), st = story(), sc = templateScript(st, { preset: 'short' });
  const out = fs.mkdtempSync(cfg.outDir + '-e2e');
  const nar = await narrate(sc, { voiceId: 'local-en', cfg, outDir: path.join(out, 'n') });
  const tl = buildTimeline(sc, nar);
  const html = path.join(out, 'page.html'); fs.writeFileSync(html, buildPage({ story: st, timeline: tl, cues: buildCues(tl) }));
  const audio = mixAudio({ timeline: tl, narration: nar, out: path.join(out, 'a.wav'), tmpDir: out });
  assert.ok(Math.abs(probeSecs(audio) - tl.total) < 0.15);
  for (const [w, h] of [[270, 480], [480, 270]]) {
    const mp4 = path.join(out, `v-${w}.mp4`);
    await renderVideo({ htmlFile: html, audioFile: audio, out: mp4, w, h, fps: 10, duration: tl.total });
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp4], { encoding: 'utf8' }));
    const v = info.streams.find(s => s.codec_type === 'video'), a = info.streams.find(s => s.codec_type === 'audio');
    assert.equal(v.codec_name, 'h264'); assert.equal(v.pix_fmt, 'yuv420p'); assert.equal(v.width, w); assert.equal(v.height, h);
    assert.equal(a.codec_name, 'aac');
    assert.ok(Math.abs(+info.format.duration - tl.total) < 0.3, `${info.format.duration} vs ${tl.total}`);
  }
});

test('Kokoro (free open model): status when not installed, synthesis through the same interface', async () => {
  const { providerStatus: st, PROVIDERS: P } = await import('../src/tts/providers.mjs');
  const { createRequire } = await import('node:module');
  let installed = true; try { createRequire(import.meta.url).resolve('kokoro-js'); } catch { installed = false; }
  if (!installed) assert.match(st({ provider: 'kokoro' }, {}).reason, /kokoro-js not installed/);
  assert.ok(st({ provider: 'kokoro' }, { VF_SKIP_MODULE_CHECK: '1' }).ok, 'no API key needed');
  if (!HAS_FFMPEG) return;
  const wav = toneWav(1), calls = [];
  const fake = { generate: async (text, o) => { calls.push({ text, ...o }); return { save: async f => fs.writeFileSync(f, wav) }; } };
  const r = await P.kokoro.synth({ text: 'Vezenkov scores again.', voice: { voice: 'am_michael' }, speed: 1.08 }, { kokoro: fake });
  assert.equal(r.ext, 'wav'); assert.equal(r.bytes.length, wav.length);
  assert.deepEqual(calls[0], { text: 'Vezenkov scores again.', voice: 'am_michael', speed: 1.08 });
  // through the narration pipeline (per-line, cached)
  const cfg = tmpCfg(), sc = templateScript(story(), { preset: 'short' });
  const n = await narrate(sc, { voiceId: 'kokoro-michael', cfg, outDir: fs.mkdtempSync(cfg.cacheDir + '-k'), env: { VF_SKIP_MODULE_CHECK: '1' }, kokoro: fake });
  assert.equal(n.provider, 'kokoro'); assert.equal(n.segments.length, sc.segments.length);
});
