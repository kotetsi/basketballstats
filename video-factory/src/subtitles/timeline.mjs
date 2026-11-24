import { DEFAULTS } from '../config.mjs';

// Timeline: when each narration segment (and therefore its scene) starts and ends.
// Captions: each segment is split into short cues (max ~2 lines), timed in proportion to their
// length within the segment's measured audio duration.

export function buildTimeline(script, narration, { introPad = DEFAULTS.introPadSecs, gap = DEFAULTS.gapSecs, tail = DEFAULTS.outroTailSecs } = {}) {
  const secs = new Map(narration.segments.map(s => [s.id, s.secs]));
  let t = introPad;
  const segments = script.segments.map(s => {
    const d = secs.get(s.id);
    if (d == null) throw new Error(`no narration for segment ${s.id}`);
    const seg = { id: s.id, scene: s.scene, focus: s.focus ?? null, text: s.text, start: round(t), end: round(t + d) };
    t += d + gap;
    return seg;
  });
  // scenes: consecutive segments with the same scene form one scene block
  const scenes = [];
  for (const s of segments) {
    const last = scenes[scenes.length - 1];
    if (last && last.scene === s.scene) { last.end = s.end; last.segments.push(s.id); }
    else scenes.push({ scene: s.scene, start: s.start, end: s.end, segments: [s.id] });
  }
  scenes[0].start = 0;
  for (let i = 0; i < scenes.length - 1; i++) scenes[i].end = scenes[i + 1].start; // no gaps between scenes
  const total = round(t - gap + tail);
  scenes[scenes.length - 1].end = total;
  return { total, segments, scenes };
}

const round = x => Math.round(x * 1000) / 1000;

export function splitCaption(text, maxChars = 32) {
  // balanced split: as few cues as possible (max 2 lines each), similar length, no one-word tails
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const len = ws => ws.join(' ').length;
  const cueCount = Math.max(1, Math.ceil(len(words) / (2 * maxChars - 4)));
  const chunks = balance(words, cueCount);
  return chunks.map(ws => {
    if (len(ws) <= maxChars) return ws.join(' ');
    const [a, b] = balance(ws, 2);
    return `${a.join(' ')}\n${b.join(' ')}`;
  });
}

function balance(words, parts) {
  const total = words.join(' ').length, out = [];
  let cur = [], target = total / parts;
  for (const w of words) {
    const next = [...cur, w].join(' ').length;
    if (cur.length && out.length < parts - 1 && next > target && Math.abs(next - target) > Math.abs(cur.join(' ').length - target)) { out.push(cur); cur = [w]; }
    else cur.push(w);
  }
  out.push(cur);
  return out.filter(c => c.length);
}

export function buildCues(timeline, { maxChars = 32 } = {}) {
  const cues = [];
  for (const s of timeline.segments) {
    const parts = splitCaption(s.text, maxChars);
    const total = parts.reduce((n, p) => n + p.length, 0) || 1;
    let t = s.start;
    for (const p of parts) {
      const d = (s.end - s.start) * (p.length / total);
      cues.push({ start: round(t), end: round(t + d), text: p, segment: s.id });
      t += d;
    }
  }
  return cues;
}

const ts = (x, sep) => {
  const ms = Math.round(x * 1000), h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
};
export const toSrt = cues => cues.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
export const toVtt = cues => `WEBVTT\n\n${cues.map(c => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n')}`;
