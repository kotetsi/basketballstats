import crypto from 'node:crypto';
import { DURATIONS } from '../../video-factory/src/config.mjs';

// Editorial toolkit shared by all formats: deterministic phrasing variants (so the same format
// does not always open the same way), number formatting, script assembly and structure checks.

export const ROLES = ['hook', 'narrative', 'evidence', 'sequence', 'conclusion', 'question'];
export const REQUIRED_ROLES = ['hook', 'evidence', 'conclusion', 'question'];

export const f = x => (x == null ? '' : Number.isInteger(x) ? String(x) : (Math.round(x * 10) / 10).toFixed(1));
export const pl = (n, w, ws = w + 's') => `${f(n)} ${n === 1 ? w : ws}`;
export const pct = x => `${f(x)} percent`;
export const surname = n => String(n).split(' ').slice(1).join(' ') || n;
export const list = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
export const r1 = x => Math.round(x * 10) / 10;
export const ORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Deterministic variant choice: same story → same wording; different stories → varied wording. */
export function pick(seed, variants) {
  const h = crypto.createHash('md5').update(String(seed)).digest();
  return variants[h[0] % variants.length];
}

export const SITE_SAY = 'basketball stats dot E U';

/**
 * Builds a script from beats. Each beat: { id, scene, role, text, focus?, optional?, minPreset? }
 * minPreset: the beat is only used for that duration or longer (short < medium < long < editorial).
 */
const ORDER = ['short', 'medium', 'long', 'editorial'];
export function assemble(beats, preset, { cta = 'More at basketballstats.eu', question } = {}) {
  const lvl = ORDER.indexOf(preset);
  const out = beats.filter(b => ORDER.indexOf(b.minPreset || 'short') <= lvl && !(b.maxPreset && ORDER.indexOf(b.maxPreset) < lvl))
    .map(({ minPreset, maxPreset, ...b }) => b);
  const outroText = question ? `${question} ${cta}.` : `${cta}.`;
  out.push({ id: 'outro', scene: 'outro', role: 'question', text: outroText, say: outroText.replace('basketballstats.eu', SITE_SAY) });
  return out;
}

export function checkStructure(segments, preset) {
  const roles = new Set(segments.map(s => s.role));
  const missing = REQUIRED_ROLES.filter(r => !roles.has(r));
  const ids = segments.map(s => s.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  const issues = [];
  if (missing.length) issues.push(`missing roles: ${missing.join(', ')}`);
  if (dup.length) issues.push(`duplicate segment ids: ${dup.join(', ')}`);
  if (!DURATIONS[preset]) issues.push(`unknown preset ${preset}`);
  return { ok: issues.length === 0, issues };
}

// Words used in hooks that make scripts sound generic/AI-written; rejected by the quality check.
export const BANNED = /\b(delve|unleash|game[- ]changer|in today's video|let's dive|buckle up|insane|crazy|you won't believe)\b/i;
