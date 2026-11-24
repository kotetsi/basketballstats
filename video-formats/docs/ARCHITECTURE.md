# Architecture and integration

```
 data/ (site datasets) ──► datasets.mjs (catalog + coverage) ──► availability (per format: available | planned | missing-data | insufficient | disabled)
                                                                    │
 formats/*.mjs (30 specs) ──► engine.generate() ──► candidates ──► toRequest(): plan + scripts per duration + meta
                                                                    │  checks: structure roles, scene ids, fact guard, banned phrasing, duration
                                                                    ▼
                                               scoring.mjs (opportunity score)  ──►  admin approves  ──►  Video Factory story (type "format")
                                                                                                             │
                                               Video Factory: script fit → narration → scene kit → MP4 → platform packages
                                                                                                             │
 analytics.mjs ◄── performance entered per video ◄─────────────────────────────────────────────── publication (manual)
 calendar.mjs: recommends formats per day from fixtures, weekly shows, cool-downs, performance
```

## What lives where (no duplication)

| Concern | Owner |
|---|---|
| Rendering, narration, captions, MP4, platform packages, approval before publication | Video Factory |
| Story discovery from raw data | Future Data Studio. Until then each format's `candidates()` finds its own stories from data |
| Format definitions, editorial structure, data requirements, validation, calendar, scoring, per-format analytics | Video Format Library |

The Data Studio can later feed `candidates()` (or produce requests directly) using the same contract.

## Production request contract (Video Factory story, `type: "format"`)

```js
{ id, type: 'format', format: 'statistical-twin', formatVersion: 1, family, status: 'draft' | 'approved',
  title, lang: 'en', theme: 'classic' | 'ocean' | 'gold', dataAsOf, lastRound,
  data: { ... },                       // every number the video may say; the fact guard checks against it
  plan: [ { id, kind, ...payload } ],  // scene kit: title, board, compare, radar, big, bars, statement, question, clues, court, split, outro
  scripts: { short: [...], medium: [...], long: [...], editorial: [...] },  // segments { id, scene, role, text, say?, focus? }
  meta: { hook, hashtags, linkPath, question, narration, narrationStyle },
  entities: { players: [codes], teams: [codes] }, signals: { significance, dataQuality } }
```

Changes made to the Video Factory, once, and generic (not per format):
- `templates/kit.mjs`: the generic scene kit, used when a story has `plan`.
- `script/generator.mjs`: uses `story.scripts[preset]` when present (nearest preset as fallback), then fits and fact-checks as usual.
- `platforms/platforms.mjs`: hook, hashtags and link come from `story.meta` when present.
- `productions/pipeline.mjs`: records `format`, `template: format:<id>@<version>`, and the `comments` / `registrations` metrics.
- `dashboard/server.mjs`: plugin hook (routes + pages). The Format Library mounts as `/formats`.

Existing leaderboard/comparison/spotlight stories render exactly as before.

## Adding a format

Create `src/formats/<anything>.mjs` exporting a spec (or an array of specs):

```js
export default {
  id, number, name, family, description, concept, audience, durations: { recommended, supported }, aspects,
  requires: [{ dataset, why, min? }], validation: [...], scriptStructure: [...], visual, narration: { style, notes }, frequency, example,
  check?(ctx, opts),          // extra data sufficiency check → { ok, reason, missing }
  candidates(ctx, opts) {     // omit to declare the format "planned"
    return [{ key, title, data, plan: [...scenes], beats: [{ id, scene, role, text, focus?, minPreset? }], question, hook, entities, significance, quality }];
  },
};
```

It is discovered automatically (test: "a new format is added by dropping in a file"). The engine adds the intro and outro scenes and the closing call to action. It builds scripts for every duration from `beats` (`minPreset` controls which beats appear in longer cuts) and rejects any candidate that fails a check.

## Implementation complexity (estimates)

| Format | Effort | Note |
|---|---|---|
| Statistical Court | S | Percentile strengths/weaknesses already computed for Twin/Team DNA |
| Rotation Lab | M | Model the `st`/`mu` stints in `data/pbp` into lineup net ratings |
| Agree or Disagree? | M | Needs an editorial claims queue in the dashboard + claim→metric mapping |
| Perfect Team | M | Needs Fantasy squad-size/position rules, then a knapsack optimiser (budget 100, ≤6 per team) |
| What Happened Next? | L | Needs player careers outside EuroLeague |
| World Ranking | L | Needs comparable multi-competition data |
| Greek language | M | Greek script templates + Greek on-screen labels. Voice: ElevenLabs multilingual |
