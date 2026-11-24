import { DURATIONS } from '../config.mjs';
import { checkScript } from './factGuard.mjs';
import { estimateSecs } from './generator.mjs';

// AI script writing (Anthropic Messages API). The model rewrites the template script line by line:
// same segments, same scenes, same order, so the visuals stay in sync. The result is accepted only
// if every number exists in the story data and the length fits the chosen duration; otherwise the
// template script is kept and the reason is recorded.

const SYSTEM = `You write narration for short basketball statistics videos (TikTok, Reels, Shorts, YouTube).
Voice: an energetic, credible EuroLeague analyst. Short spoken sentences. Hook first. No hype words like "insane" or "crazy", no emojis, no hashtags.
Hard rules:
- Use ONLY numbers present in STORY DATA. Never invent, round differently or estimate a statistic.
- Keep exactly the same segment ids, in the same order. One or two sentences per segment.
- Each segment must still describe what its scene shows (scene names are given).
- Total spoken length must fit TARGET SECONDS at about 2.5 words per second.
- The "outro" segment must mention basketballstats.eu in "text" and spell it as "basketball stats dot E U" in "say".
Return ONLY JSON: {"segments":[{"id":"...","text":"caption text","say":"optional spoken variant"}]}`;

export async function llmScript(story, draft, cfg, { fetchImpl = globalThis.fetch, env = process.env, style = 'energetic' } = {}) {
  if (!cfg.llm?.enabled) return { skipped: 'LLM disabled in config' };
  if (!env.ANTHROPIC_API_KEY) return { skipped: 'ANTHROPIC_API_KEY not set' };
  const D = DURATIONS[draft.preset];
  const user = [
    `STORY: ${story.title} (type ${story.type}, data as of ${story.dataAsOf})`,
    `STORY DATA:\n${JSON.stringify(story.data)}`,
    `TARGET SECONDS: ${D.target} (max ${D.max}). STYLE: ${style}`,
    `SEGMENTS (id → scene → current text):\n${draft.segments.map(s => `${s.id} → ${s.scene} → ${s.text}`).join('\n')}`,
  ].join('\n\n');
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.llm.model, max_tokens: cfg.llm.maxTokens, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) return { rejected: `LLM HTTP ${res.status}` };
  const j = await res.json();
  const raw = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  let parsed;
  try { parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch { return { rejected: 'LLM did not return JSON' }; }
  const got = parsed.segments || [];
  if (got.length !== draft.segments.length || got.some((s, i) => s.id !== draft.segments[i].id || !String(s.text || '').trim()))
    return { rejected: 'LLM changed the segment structure' };
  const segments = draft.segments.map((s, i) => ({ ...s, text: String(got[i].text).trim(), say: got[i].say ? String(got[i].say).trim() : s.id === 'outro' ? s.say : undefined }));
  const script = { ...draft, segments, generator: `llm:${cfg.llm.model}`, createdAt: new Date().toISOString() };
  script.estSecs = estimateSecs(segments);
  script.factCheck = checkScript(script, story);
  if (!script.factCheck.ok) return { rejected: `unsupported numbers: ${script.factCheck.unsupported.join(', ')}` };
  if (script.estSecs > D.max * 1.1) return { rejected: `too long (${script.estSecs}s for max ${D.max}s)` };
  return { script };
}
