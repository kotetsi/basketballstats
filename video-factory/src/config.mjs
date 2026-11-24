import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VF_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(VF_ROOT, '..');

export const FORMATS = {
  '9x16': { w: 1080, h: 1920, label: 'Vertical 9:16 (TikTok, Reels, Shorts)' },
  '16x9': { w: 1920, h: 1080, label: 'Horizontal 16:9 (YouTube)' },
  '1x1': { w: 1080, h: 1080, label: 'Square 1:1 (feeds)' },
};

// target = what the script generator aims for; min/max = accepted narration length
export const DURATIONS = {
  short: { label: '15–30 s', min: 15, max: 30, target: 24 },
  medium: { label: '30–60 s', min: 30, max: 60, target: 45 },
  long: { label: '60–120 s', min: 60, max: 120, target: 90 },
  editorial: { label: 'Editorial (2–5 min)', min: 120, max: 300, target: 180 },
};

export const DEFAULTS = {
  fps: 30,
  previewFps: 15,
  previewScale: 0.5,
  wordsPerSecond: 2.5,      // narration pace at speed 1.0, used to fit scripts to a duration
  gapSecs: 0.3,             // pause between narration segments
  introPadSecs: 0.5,
  outroTailSecs: 1.2,
  musicVolume: 0.10,        // background bed under the narration (generated in code, no rights needed)
  loudness: -14,            // LUFS target for social platforms
  site: 'https://basketballstats.eu',
};

export function loadConfig(overrides = {}) {
  const f = path.join(VF_ROOT, 'config.json');
  const file = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  const cfg = {
    ...DEFAULTS, ...file, ...overrides,
    dataDir: overrides.dataDir || process.env.VF_DATA_DIR || path.join(REPO_ROOT, 'data'),
    storiesDir: overrides.storiesDir || process.env.VF_STORIES_DIR || path.join(VF_ROOT, 'stories'),
    productionsDir: overrides.productionsDir || process.env.VF_PRODUCTIONS_DIR || path.join(VF_ROOT, 'productions'),
    outDir: overrides.outDir || process.env.VF_OUT_DIR || path.join(VF_ROOT, 'out'),
    cacheDir: overrides.cacheDir || process.env.VF_CACHE_DIR || path.join(VF_ROOT, '.cache'),
  };
  cfg.voices = { ...VOICES, ...(file.voices || {}), ...(overrides.voices || {}) };
  cfg.llm = { enabled: true, model: 'claude-sonnet-5-5', maxTokens: 1500, ...(file.llm || {}), ...(overrides.llm || {}) };
  return cfg;
}

// Voices: provider + provider-specific voice id. Add more in video-factory/config.json → "voices".
export const VOICES = {
  'local-en': { provider: 'espeak', voice: 'en-us', lang: 'en', label: 'Local (espeak-ng, robotic, for tests only)' },
  'local-el': { provider: 'espeak', voice: 'el', lang: 'el', label: 'Local Greek (espeak-ng, tests only)' },
  'openai-onyx': { provider: 'openai', voice: 'onyx', model: 'gpt-4o-mini-tts', lang: 'en', label: 'OpenAI Onyx (deep, sports-broadcast)', instructions: 'Energetic sports analyst. Clear, confident, upbeat. Slight emphasis on numbers.' },
  'openai-nova': { provider: 'openai', voice: 'nova', model: 'gpt-4o-mini-tts', lang: 'en', label: 'OpenAI Nova (bright)', instructions: 'Friendly, energetic sports presenter. Clear diction.' },
  'elevenlabs-adam': { provider: 'elevenlabs', voice: 'pNInz6obpgDQGcFmaJgB', model: 'eleven_multilingual_v2', lang: 'en', label: 'ElevenLabs Adam (premium; also speaks Greek)' },
  'google-charon': { provider: 'google', voice: 'en-US-Chirp3-HD-Charon', languageCode: 'en-US', lang: 'en', label: 'Google Chirp 3 HD Charon' },
};

export const STYLES = {
  energetic: { speed: 1.08, label: 'Energetic' },
  analyst: { speed: 1.0, label: 'Analyst (calm)' },
  hype: { speed: 1.15, label: 'Hype' },
};
