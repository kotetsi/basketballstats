# BasketballStats Video Factory

The video production engine of basketballstats.eu. It takes an **approved data story** and produces real **MP4** videos. Each video has an AI-written, fact-checked script, AI narration, animated graphics, burned-in subtitles and rights-free music, in **9:16, 16:9 and 1:1**. It also prepares title, description and hashtags for TikTok, Reels, Shorts and YouTube. **Nothing is published automatically.**

## Γρήγορη εκκίνηση (ελληνικά)

Χρειάζεται Node 20+, ffmpeg, Chromium (Playwright) και προαιρετικά espeak-ng για τη δοκιμαστική φωνή.

```bash
npm i --no-save playwright@1.48.2 && npx playwright install chromium   # στη ρίζα του repo
node video-factory/dashboard/server.mjs                               # http://127.0.0.1:4318/
```

Στο dashboard:
1. **+ New story**: διαλέγεις Leaderboard, Σύγκριση ή Spotlight. Το story χτίζεται από τα δεδομένα του site. Μετά **Approve story**.
2. Διαλέγεις διαστάσεις, διάρκεια, φωνή και ύφος → **Create production**. Το σενάριο γράφεται μόνο του.
3. Διορθώνεις το σενάριο αν θες → **Generate preview** (γρήγορο) → **Render final**.
4. Βλέπεις και κατεβάζεις τα MP4 και τους υπότιτλους → **Approve for publication**.
5. Ανεβάζεις το βίντεο εσύ, πατάς **Mark published** και αργότερα περνάς προβολές και κλικ στο **Performance**.

Για κανονική AI φωνή χρειάζεται ένα κλειδί: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY` ή `GOOGLE_TTS_API_KEY`. Για AI σενάριο χρειάζεται το `ANTHROPIC_API_KEY`. Στο GitHub: Actions → **Video Factory** → Run workflow.

## Commands

```bash
node video-factory/src/cli.mjs story leaderboard metric=pir scope=season limit=5
node video-factory/src/cli.mjs story comparison a=sasha-vezenkov b=kendrick-nunn
node video-factory/src/cli.mjs story spotlight player=sasha-vezenkov n=8
node video-factory/src/cli.mjs approve-story <story-id>
node video-factory/src/cli.mjs produce <story-id> formats=9x16,16x9 preset=medium voice=openai-onyx style=energetic
node --test video-factory/test/*.test.mjs
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): pipeline, modules, rendering choice, files
- [docs/DATA_STUDIO.md](docs/DATA_STUDIO.md): story contract for the future Data Studio
- [docs/VOICES.md](docs/VOICES.md): narration providers, keys, costs, Greek
- [docs/COMPLIANCE.md](docs/COMPLIANCE.md): assets, licences, what is never used
- [docs/PUBLISHING.md](docs/PUBLISHING.md): platform packages, manual publishing, metrics
- [docs/MILESTONES.md](docs/MILESTONES.md): MVP status and next steps
