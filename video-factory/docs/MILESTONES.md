# MVP status

| Requirement | Status |
|---|---|
| Working production dashboard | done: stories, productions, script editor, preview, final render, download, history, approval, metrics |
| ≥ 3 visual templates | done: leaderboard, comparison (with radar), spotlight (big number + game timeline), plus intro/outro |
| AI-generated scripts | done: Claude rewrite with fact guard. Needs `ANTHROPIC_API_KEY`; otherwise the fact-checked template script is used |
| AI narration integration | done: Kokoro (free, default), OpenAI, ElevenLabs, Google, local espeak behind one interface |
| Real MP4 rendering | done: H.264/AAC, yuv420p, faststart, 30 fps |
| 9:16 and 16:9 (and 1:1) | done |
| Subtitles | done: burned in + SRT/VTT |
| Complete video from real data | done: "Season 2026-27: top 5 in PIR" and "Vezenkov vs Nunn", data through round 13 |
| Docs and tests | done: 18 tests including real MP4 renders |

## Next

1. Run the Video Factory workflow once with `voice=kokoro-michael` to get the demo videos with the free AI voice; add ElevenLabs later for Greek.
2. Greek scripts and labels.
3. More templates: shot chart (reuse `scripts/shot-reel.mjs`), team comparison, round recap, timeline of a season.
4. Stories from `daily-social` / the Data Studio.
5. Performance import from platform APIs and GA4, then a report of which formats and durations perform best.
6. Publishing integrations, only after explicit approval per platform.
