# Narration (AI voice)

All providers sit behind one interface (`src/tts/providers.mjs`). A voice is configured as `{ provider, voice, model, lang, instructions }` in `src/config.mjs`, or added in `video-factory/config.json` → `"voices"`. Keys are read only from environment variables / GitHub secrets.

| Voice id | Provider | Key | Approx. cost* | Notes |
|---|---|---|---|---|
| `local-en`, `local-el` | espeak-ng (local) | none | free | Robotic. For tests and drafts only |
| `openai-onyx`, `openai-nova` | OpenAI `gpt-4o-mini-tts` | `OPENAI_API_KEY` | ~1.5 cents / minute | Style set with `instructions`. Disclose AI voice |
| `elevenlabs-adam` | ElevenLabs `eleven_multilingual_v2` | `ELEVENLABS_API_KEY` | Starter $6/month (~30 min) | Best quality, good Greek. Commercial use needs a paid plan |
| `google-charon` | Google Cloud TTS Chirp 3 HD | `GOOGLE_TTS_API_KEY` | $30 / 1M chars after free tier | API key restricted to Text-to-Speech |

\* Prices checked November 2026 from public pricing pages. Re-check before committing a budget.

**Monthly estimate** for ~60 videos of 45 s (~45 min of narration): OpenAI under $1; ElevenLabs within Starter/Creator. Narration is cached per line, so re-renders and edits don't pay twice.

**Styles:** `energetic` (speed 1.08), `analyst` (1.0), `hype` (1.15), set in `config.mjs`.

**Greek (next step):** set `lang: 'el'` on a story and use `elevenlabs-adam` (multilingual) or a Google `el-GR` voice. The templates already load Greek glyphs (Inter subset includes Greek). What is still missing: Greek script templates in `script/generator.mjs` and Greek on-screen labels in `templates/page.mjs`.

**Subtitles** are built from the real measured audio durations of each line (no speech-to-text needed). They are burned into the video and also saved as `captions.srt` / `captions.vtt` for platforms that accept caption files.
