import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

// Frame-accurate renderer: opens the production page in headless Chromium at the target size,
// calls window.setT(t) for every frame, screenshots it and pipes the JPEG frames into ffmpeg,
// which muxes them with the mixed audio into an H.264/AAC MP4 (yuv420p, faststart).
// Same approach as the site's existing daily-social videos, without temp frame files.

export async function renderVideo({ htmlFile, audioFile, out, w, h, fps = 30, duration, chromePath = process.env.PW_CHROME, log = () => {}, crf = 20 }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    ...(audioFile ? ['-i', audioFile] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
    // JPEG frames are full-range; convert explicitly so every ffmpeg build writes standard yuv420p (TV range)
    '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', String(fps),
    ...(audioFile ? ['-c:a', 'aac', '-b:a', '160k', '-shortest'] : []),
    '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', d => { ffErr += d; });
  const done = new Promise((res, rej) => ff.on('close', code => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}: ${ffErr.slice(-500)}`)))));
  try {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(pathToFileURL(htmlFile).href);
    await page.evaluate(() => window.ready);
    const frames = Math.ceil(duration * fps);
    const t0 = Date.now();
    for (let i = 0; i < frames; i++) {
      await page.evaluate(t => window.setT(t), i / fps);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % (fps * 5) === 0) log(`frame ${i}/${frames} (${Math.round((Date.now() - t0) / 1000)}s)`);
    }
    ff.stdin.end();
    await done;
  } finally {
    await browser.close();
    if (ff.exitCode == null) ff.stdin.destroy();
  }
  return { out, bytes: fs.statSync(out).size };
}

export async function renderStill({ htmlFile, out, w, h, t, chromePath = process.env.PW_CHROME }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});
  try {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(pathToFileURL(htmlFile).href);
    await page.evaluate(() => window.ready);
    await page.evaluate(x => window.setT(x), t);
    await page.screenshot({ path: out, type: 'png' });
  } finally { await browser.close(); }
  return out;
}
