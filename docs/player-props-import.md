# Offline Player Props import

This importer is deliberately provider-neutral. It accepts a JSON snapshot supplied by a source that has authorized the data use. It does not contact CrossoverStats, bookmakers, or any other host; it does not scrape, schedule, or write into production odds history.

## Input

```json
{
  "capturedAt": "2026-11-27T09:00:00Z",
  "events": [{
    "eventId": "game-1",
    "home": "Olympiacos",
    "away": "Real Madrid",
    "commence": "2026-11-27T19:00:00Z",
    "books": [{
      "key": "iddaa",
      "title": "iddaa",
      "props": [{
        "playerId": "player-1",
        "name": "Player Name",
        "stat": "pts",
        "line": 14.5,
        "over": 1.90,
        "under": 1.90
      }]
    }]
  }]
}
```

Supported stat keys: `pts`, `reb`, `ast`, `fg3`, `pr`, `pa`, `pra`, `ar`.

## Run

```sh
node scripts/import-player-props.mjs snapshot.json crossoverstats > normalized.json
```

The command validates timestamps, freshness (72-hour default), decimal prices, duplicate events/books/props and market keys. Missing one side is allowed; a quote with neither side is rejected. Output uses the event/book/props shape consumed by the existing odds adapter. The caller must separately decide whether the source is authorized and how to store the snapshot.

No API key, paid dependency, network access, or automated source collection is involved.
