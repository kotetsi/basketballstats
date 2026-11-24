# Platform versions and publishing

After a final render, each production gets a package per platform (`production.json → platforms`):

| Platform | File | Max length (config) | Title | Hashtags |
|---|---|---|---|---|
| TikTok | 9:16 | 600 s | – | 5 |
| Instagram Reels | 9:16 | 180 s | – | 5 |
| Facebook Reels | 9:16 | 90 s | – | 5 |
| YouTube Shorts | 9:16 | 180 s | ≤100 chars + `#Shorts` | 3 |
| YouTube | 16:9 | – | ≤100 chars | 3 |

Each description has a hook, the data attribution and a UTM link (`utm_source=<platform>&utm_medium=video&utm_campaign=video_factory&utm_content=<production id>`). TikTok and Instagram use "link in bio", because links in captions are not clickable there. The limits are editable in `platforms/platforms.mjs`; check each platform's current rules.

**Publishing is manual.** `publish()` throws on purpose. The flow: Approve for publication → upload the MP4 (and `captions.srt` where supported) yourself → **Mark published** with the URL.

The existing `scripts/daily-social.mjs` already posts automatically to several networks. Connecting Video Factory to it, or to the platforms' own APIs, needs explicit approval and verified API permissions per platform, and is deliberately left out of the MVP.

**Performance feedback:** enter views, average watch time, completion rate, shares, clicks and site sessions per platform in the dashboard (`production.json → performance`). Site sessions can come from GA4 filtered on `utm_campaign=video_factory`. These fields are what a later "which formats perform best" report will read.
