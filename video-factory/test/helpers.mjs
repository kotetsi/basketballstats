import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.mjs';
import { loadModel } from '../src/data/model.mjs';

export const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const DATA = path.join(FIX, 'data');

export function tmpCfg(over = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-'));
  return loadConfig({ dataDir: DATA, storiesDir: path.join(d, 'stories'), productionsDir: path.join(d, 'prod'), outDir: path.join(d, 'out'), cacheDir: path.join(d, 'cache'), ...over });
}
let M; export const model = () => (M ||= loadModel(DATA));

const has = bin => { try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; } catch { return false; } };
export const HAS_ESPEAK = has('espeak-ng') || has('espeak');
export const HAS_FFMPEG = has('ffmpeg') && has('ffprobe');
export async function hasBrowser() {
  try { const { chromium } = await import('playwright'); const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}); await b.close(); return true; } catch { return false; }
}

export function fakeFetch(routes) {
  const calls = [];
  const f = async (url, opts = {}) => {
    calls.push({ url: String(url), opts, body: opts.body ? JSON.parse(opts.body) : null });
    for (const [re, h] of routes) if (re.test(String(url))) {
      const r = await h(String(url), opts);
      const buf = Buffer.isBuffer(r.body) ? r.body : Buffer.from(typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
      return { ok: (r.status || 200) < 400, status: r.status || 200, text: async () => buf.toString(), json: async () => JSON.parse(buf.toString()), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  f.calls = calls;
  return f;
}

/** A valid 1-second 440 Hz WAV made with ffmpeg, used as a fake TTS response. */
export function toneWav(secs = 1) {
  const f = path.join(os.tmpdir(), `tone-${secs}-${process.pid}.wav`);
  if (!fs.existsSync(f)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${secs}`, '-ar', '24000', f]);
  return fs.readFileSync(f);
}
