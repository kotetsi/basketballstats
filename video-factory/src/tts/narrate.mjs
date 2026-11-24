import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PROVIDERS, providerStatus } from './providers.mjs';
import { STYLES } from '../config.mjs';

// Synthesises each script segment separately (so visuals and captions can be timed per line),
// normalises it to 48 kHz mono WAV and measures it. Results are cached by text+voice+speed,
// so editing one line only re-pays for that line.

export function probeSecs(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  return Math.round(parseFloat(out) * 1000) / 1000;
}

export async function narrate(script, { voiceId, style = 'energetic', cfg, outDir, fetchImpl = globalThis.fetch, env = process.env, log = () => {}, kokoro }) {
  const voice = cfg.voices[voiceId];
  if (!voice) throw new Error(`unknown voice ${voiceId}`);
  const st = providerStatus(voice, env);
  if (!st.ok) throw new Error(`voice ${voiceId} unavailable: ${st.reason}`);
  const speed = STYLES[style]?.speed ?? 1;
  const cacheDir = path.join(cfg.cacheDir, 'tts');
  fs.mkdirSync(cacheDir, { recursive: true }); fs.mkdirSync(outDir, { recursive: true });
  const segments = [];
  let chars = 0;
  for (const s of script.segments) {
    const text = (s.say || s.text).trim();
    const key = crypto.createHash('sha1').update(JSON.stringify([voice.provider, voice.voice, voice.model, voice.instructions, speed, text])).digest('hex').slice(0, 16);
    const cached = path.join(cacheDir, `${key}.wav`);
    if (!fs.existsSync(cached)) {
      log(`tts ${voice.provider}: ${s.id}`);
      const { bytes, ext } = await PROVIDERS[voice.provider].synth({ text, voice, speed, lang: voice.lang }, { fetchImpl, env, kokoro });
      const raw = path.join(cacheDir, `${key}.raw.${ext}`);
      fs.writeFileSync(raw, bytes);
      // trim leading/trailing silence so the timeline is tight, then normalise format
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,areverse', '-ar', '48000', '-ac', '1', cached]);
      fs.rmSync(raw, { force: true });
      chars += text.length;
    }
    const file = path.join(outDir, `${s.id}.wav`);
    fs.copyFileSync(cached, file);
    segments.push({ id: s.id, file, secs: probeSecs(file), chars: text.length });
  }
  return { voiceId, provider: voice.provider, voice: voice.voice, model: voice.model || null, style, speed, segments, billedChars: chars };
}
