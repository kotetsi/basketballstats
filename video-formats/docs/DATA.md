# Datasets and availability

Measured from the real files by `src/datasets.mjs` (data through round 13).

| Dataset | Available | Coverage | Note |
|---|---|---|---|
| `boxscores`: Player box scores (this season) | ✓ | {"rounds":13,"games":130,"players":302} |  |
| `bio`: Player bio (age, height, country, position) | ✓ | {"players":302} |  |
| `standings`: Standings with home/away records | ✓ | {"teams":20} |  |
| `results`: Game results this season | ✓ | {"games":130} |  |
| `schedule`: Upcoming fixtures with dates | ✓ | {"fixtures":346} |  |
| `fantasyPrices`: EuroLeague Fantasy prices | ✓ | {"players":302} |  |
| `priceHistory`: Fantasy price history by round | ✓ | {"players":302} |  |
| `projections`: PIR projections for the next round | ✓ | {"round":14} |  |
| `matchPredictions`: Model win probabilities per game (logged before tip-off) | ✓ | {"games":60} |  |
| `shots`: Shot locations with zones and clutch flags | ✓ | {"games":130,"ofPlayed":130} |  |
| `starters`: Starting lineups (play-by-play) | ✓ | {"games":130} |  |
| `lineups`: Lineup stints / rotations (play-by-play) | ✓ | {"games":130} | present in data/pbp (st, mu) but not yet modelled |
| `history`: Past seasons (standings, finals, player averages) | ✓ | {"seasons":["E2016","E2017","E2018","E2019","E2020","E2021","E2022","E2023","E2024","E2025"]} |  |
| `multiCompetition`: Comparable data across competitions/leagues worldwide | ✗ | {} | only EuroLeague (and partial EuroCup) data exists |
| `imageLibrary`: Licensed player images | ✗ | {} | Basketballstats Image Library not built yet |
| `editorialClaims`: Editor-approved claims to fact-check | ✗ | {} | no claims input yet: add an editorial claims queue (dashboard) to enable |
| `careerLinks`: Player careers across seasons and leagues | ✗ | {} | history has EuroLeague-only season rows; careers outside EuroLeague are not in the data |
| `fantasyRules`: Complete EuroLeague Fantasy roster rules (squad size, positions) | ✗ | {} | budget (100) and per-team limit (6) are known; squad size and position slots are not in the data |
| `language_el`: Greek scripts and voice | ✗ | {} | Video Factory narrates English only for now |

## How to unlock the remaining formats

- **Agree or Disagree?**: add an editorial claims queue (claim text + the metric that decides it) to the dashboard; then `editorialClaims` becomes available.
- **The Perfect Team**: record the Fantasy squad size and position slots in `fantasy/official/`; the optimiser can then use budget 100 and max 6 per team (already known).
- **What Happened Next?**: needs career data beyond EuroLeague seasons (other leagues).
- **The Basketball World Ranking**: needs comparable data for other competitions.
- **The Statistical Court**, **The Rotation Lab**: data exists; only the builders are missing.
- **Greek**: Greek scripts and labels (voice via ElevenLabs multilingual).

Never generate a format whose data is missing: the engine returns `missing-data` or `insufficient` with the exact reason instead.
