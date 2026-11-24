# Copyright and compliance

Registry: `assets/licenses.json`. Every asset a video uses must be listed there with source and licence, and each production records the asset ids it used (`production.json → assets`).

**Used**
- **Font:** Inter (SIL Open Font License 1.1), subset to Latin + Greek, WOFF2, with the licence in `assets/fonts/LICENSE-Inter.txt`.
- **Graphics:** drawn in code (HTML/CSS/SVG): charts, radar, court lines, typography. Team colours appear only as colour swatches.
- **Music:** a bed synthesised in code with ffmpeg (`render/audio.mjs`). No samples or recordings, no third-party rights.
- **Data:** the site's statistics, attributed on screen ("Data: official EuroLeague statistics").
- **Voice:** AI narration under each provider's terms (see VOICES.md). ElevenLabs commercial use needs a paid plan.

**Never used**
- player photographs (unless licensed and registered here, e.g. a future Image Library)
- broadcast or game footage
- team or competition logos and crests
- third-party music

A test checks that the rendered page loads no remote URLs and only fonts listed in the registry.

**Future: Image Library.** Add an asset type `image` with `{ file, source, license, rightsHolder, expires, allowedUses }`. Templates must reference images by registry id only, and the renderer must refuse ids without a valid licence for video use.

**AI disclosure.** Some platforms require labelling realistic AI-generated audio. Tick the platform's AI-content label when uploading videos with AI narration.
