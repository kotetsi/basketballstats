# Story contract (for the future Data Studio)

There is no Data Studio in the repository yet (checked November 2026). Until there is, stories come from the dashboard's builder or from the CLI. When a Data Studio exists, it does **not** need to duplicate anything here. It writes approved stories in this shape to `video-factory/stories/<id>.json`, or calls `POST /api/stories` and then `/approve`:

```json
{
  "id": "leaderboard-pir-season-2026-11-24",
  "type": "leaderboard | comparison | spotlight",
  "params": { "metric": "pir", "scope": "season", "limit": 5 },
  "title": "Season 2026-27: top 5 in PIR",
  "source": "data-studio",
  "lang": "en",
  "status": "approved",
  "approvedAt": "2026-11-24T10:00:00Z",
  "approvedBy": "nikos",
  "dataAsOf": "2026-11-24T08:29:10.950Z",
  "lastRound": 13,
  "data": { "...": "fully resolved numbers, see stories/builders.mjs" }
}
```

The simplest integration: the Data Studio sends only `type` + `params`, and `buildStory()` resolves `data` from the site's files. If it sends its own `data`, it must keep the same fields the templates use (documented in `stories/builders.mjs`). Every number in a video must come from `data`, and the fact guard enforces this.

Existing story discovery in `scripts/daily-social.mjs` (stat of the day, top 5, scorer race) is a natural first source to adapt.
