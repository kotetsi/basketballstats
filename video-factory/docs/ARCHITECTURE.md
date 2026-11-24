# Architecture

```
approved story ──► script ──► narration ──► timeline + captions ──► page (HTML/SVG) ──► frames ──► MP4 per format
 (stories/*.json)  template /   per line,      segment timings,        3 templates +       Playwright   ffmpeg H.264/AAC
 built from the    Claude, fact  any provider,  SRT/VTT cues             intro/outro,        setT(t)      + mixed audio
 site's data       guarded       cached                                  responsive                       (voice + bed, -14 LUFS)
                                                                                                   └──► platform packages, production.json
```

## Modules (`video-factory/src`)

| Module | Role |
|---|---|
| `config.mjs` | Formats (9:16 1080×1920, 16:9 1920×1080, 1:1 1080×1080), duration presets, voices, styles |
| `data/model.mjs` | Reads `data/cache.json`, `data/fantasy/latest.json`, `data/projections/latest.json` (read-only) |
| `stories/builders.mjs` | Story types: `leaderboard`, `comparison`, `spotlight`. Resolve all numbers up front into `story.data` |
| `stories/store.mjs` | Story files; only `approved` stories can be produced |
| `script/generator.mjs` | Template scripts per type and duration; segments bound to scenes; fits to duration |
| `script/llm.mjs` | Claude rewrite of the template script; accepted only if structure, length and every number check out |
| `script/factGuard.mjs` | Numbers in captions/narration must exist in `story.data` |
| `tts/providers.mjs` | `espeak` (local), `openai`, `elevenlabs`, `google` behind one `synth()` interface |
| `tts/narrate.mjs` | Per-line synthesis, silence trim, 48 kHz WAV, duration probe, cache by text+voice+speed |
| `subtitles/timeline.mjs` | Segment/scene timeline from real audio durations; caption cues; SRT/VTT |
| `templates/page.mjs` | One deterministic animated page per production (`window.setT(t)`), sized in `--u` units so one page fits every aspect ratio |
| `render/audio.mjs` | Narration placement, generated music bed with side-chain ducking, loudness normalisation |
| `render/video.mjs` | Headless Chromium frames piped into ffmpeg; thumbnails |
| `platforms/platforms.mjs` | Per-platform file, title, description, hashtags, UTM link, limits. `publish()` intentionally disabled |
| `productions/pipeline.mjs` | Production lifecycle and metadata: draft → scripted → previewed → rendered → approved → published |
| `dashboard/` | Local admin UI + JSON API (render jobs run in a queue) |

## Rendering engine: why HTML + Playwright + ffmpeg

- It is the approach the site already uses in `scripts/daily-social.mjs` (proven in GitHub Actions). This module reuses it with narration, captions, multiple formats and a pipe into ffmpeg instead of temporary frame files.
- No licence questions. Remotion is free only for organisations of up to 3 people and needs a company licence beyond that. It would also add React and a bundler.
- Speed: about 65 ms per 1080×1920 frame. A 45 s video at 30 fps renders in about 1.5–2 minutes per format, on free CI minutes.
- SVG and CSS give charts, radar and typography without image assets.

## Files

- `video-factory/stories/<id>.json`: stories (in git)
- `video-factory/productions/<id>/production.json`: production metadata (in git): story ref, settings, script, narration provider/voice/cost, timeline, renders (size, duration, sha256, render time), platform packages, publication, performance, history
- `video-factory/out/<id>/`: media (not in git): `final-9x16.mp4`, `final-16x9.mp4`, thumbnails, `captions.srt/.vtt`, `audio.wav`, `page.html`, narration lines
- `video-factory/.cache/tts/`: narration cache (not in git)

## Templates (MVP)

| Story type | Template | Scenes |
|---|---|---|
| leaderboard | `leaderboard-v1` | intro (kinetic title) → animated ranked bars, count-up values, row highlighted as narrated → outro |
| comparison | `comparison-v1` | intro → mirrored stat bars per row → league-percentile radar → recent form → outro |
| spotlight | `spotlight-v1` | intro → big count-up number + season cards → game-by-game bar chart with season-average line and highlighted games → outro |

Adding a template: add a builder (story data), a script function (segments with `scene` names) and scene markup + a `R.<scene>` renderer in `page.mjs`. Court/shot-chart scenes can reuse `scripts/shot-reel.mjs` and `data/shots/`.
