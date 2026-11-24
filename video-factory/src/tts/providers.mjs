import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

// Narration providers behind one interface:
//   synth({ text, voice, speed, lang }, { fetchImpl, env }) → { bytes: Buffer, ext: 'wav'|'mp3' }
// `voice` is an entry of cfg.voices. Adding a provider = adding one function here.
// API keys come only from environment variables (GitHub secrets), never from files.

export class ProviderUnavailable extends Error {}

async function http(fetchImpl, url, opts, name) {
  const res = await fetchImpl(url, opts);
  if (!res.ok) {
    let msg = ''; try { msg = (await res.text()).slice(0, 300); } catch { }
    throw new Error(`${name} TTS HTTP ${res.status}: ${msg}`);
  }
  return res;
}

export const PROVIDERS = {
  // Local, offline, free. Robotic: for tests and drafts only.
  espeak: {
    requires: [],
    async synth({ text, voice, speed }) {
      const bin = ['espeak-ng', 'espeak'].find(b => { try { execFileSync('which', [b], { stdio: 'ignore' }); return true; } catch { return false; } });
      if (!bin) throw new ProviderUnavailable('espeak-ng is not installed (apt-get install espeak-ng)');
      const tmp = `/tmp/vf-espeak-${process.pid}-${Date.now()}.wav`;
      execFileSync(bin, ['-v', voice.voice || 'en-us', '-s', String(Math.round(165 * speed)), '-w', tmp, text]);
      const bytes = fs.readFileSync(tmp); fs.rmSync(tmp, { force: true });
      return { bytes, ext: 'wav' };
    },
  },

  // OpenAI speech API (gpt-4o-mini-tts supports style "instructions").
  openai: {
    requires: ['OPENAI_API_KEY'],
    async synth({ text, voice, speed }, { fetchImpl, env }) {
      const res = await http(fetchImpl, 'https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: voice.model || 'gpt-4o-mini-tts', voice: voice.voice, input: text, instructions: voice.instructions, speed, response_format: 'wav' }),
      }, 'OpenAI');
      return { bytes: Buffer.from(await res.arrayBuffer()), ext: 'wav' };
    },
  },

  // ElevenLabs (premium quality; eleven_multilingual_v2 also speaks Greek).
  elevenlabs: {
    requires: ['ELEVENLABS_API_KEY'],
    async synth({ text, voice, speed }, { fetchImpl, env }) {
      const res = await http(fetchImpl, `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.voice)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: voice.model || 'eleven_multilingual_v2', voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: Math.max(0.7, Math.min(1.2, speed)) } }),
      }, 'ElevenLabs');
      return { bytes: Buffer.from(await res.arrayBuffer()), ext: 'mp3' };
    },
  },

  // Google Cloud Text-to-Speech (API key restricted to the TTS API).
  google: {
    requires: ['GOOGLE_TTS_API_KEY'],
    async synth({ text, voice, speed }, { fetchImpl, env }) {
      const res = await http(fetchImpl, `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(env.GOOGLE_TTS_API_KEY)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { text }, voice: { languageCode: voice.languageCode || 'en-US', name: voice.voice }, audioConfig: { audioEncoding: 'LINEAR16', speakingRate: speed, sampleRateHertz: 48000 } }),
      }, 'Google');
      const j = await res.json();
      if (!j.audioContent) throw new Error('Google TTS: empty audioContent');
      return { bytes: Buffer.from(j.audioContent, 'base64'), ext: 'wav' };
    },
  },
};

export function providerStatus(voice, env = process.env) {
  const p = PROVIDERS[voice.provider];
  if (!p) return { ok: false, reason: `unknown provider ${voice.provider}` };
  const missing = p.requires.filter(k => !env[k]);
  return missing.length ? { ok: false, reason: `missing ${missing.join(', ')}` } : { ok: true };
}
