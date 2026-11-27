# Player Props: chronological holdout validation

Run from the repository root:

```sh
node scripts/props-holdout-validation.mjs
```

The script evaluates the existing `src/odds/props.mjs` model on the final 25% of observed EuroLeague rounds. It does not tune parameters. For every player-game in the holdout, it builds the projection from that player's earlier appearances and the league per-minute prior available before the target round.

It reports, separately for each stat key:

- **MAE / RMSE:** error in the projected count.
- **Log loss:** quality of the full predictive distribution.
- **Brier score:** probability accuracy at three half-point lines around the projection.

The player-specific model is compared with a league-rate-only baseline using the same projected minutes and dispersion assumptions. League priors include all players in the cache, including players who changed teams; individual projections follow the repository's existing convention of excluding multi-team season rows. Lower scores are better for all four metrics.

This first pass validates the core player-history projection only. It does not supply optional game-context (`teamPts`) or shot-quality (`xrows` / xPTS) adjustments to `project()`, so it must not be presented as a full validation of every live projection adjustment.

## Interpretation

- A lower player-model log loss than the baseline indicates that player history adds predictive information beyond the league rate.
- A lower MAE alone is not sufficient: the predictive distribution can still be overconfident or poorly calibrated.
- Results are only as reliable as the historical cache and its player/game mappings.
- This is a first chronological holdout, not proof of profitability. It does not use bookmaker prices, calculate EV/ROI, or account for market closing lines.
- The current parameter values are evaluated as-is. Do not select new parameters based on this holdout and then report the same holdout as out-of-sample evidence.

The script is offline and read-only. It makes no network requests and changes no data files.

## xPTS walk-forward validation

Run:

```sh
node scripts/props-xpts-walkforward-validation.mjs
```

This companion report compares the same player-history model with and without the current xPTS adjustment on the final 25% of observed rounds. It reports MAE, RMSE, predictive log loss, and Brier score for every stat, plus shot-data coverage.

To avoid look-ahead leakage, historical-season shot-zone rates form a fixed prior. Current-season league shot-zone rates are updated only after each round has been evaluated. The player's xPTS history contains only shots from appearances before the target game. The target game's shots and score are never used. The production values of `xLam` and `xK` are evaluated as-is; this report does not tune them.

The minutes diagnostics run in the same workflow and evaluate forecasts conditional on appearing. They do not establish whether a player will be available or whether he will be a DNP. The role-adjusted minutes method is diagnostic only and should not be enabled in production without a longer, independent validation.

## Multi-season chronological robustness validation

Run:

```sh
node scripts/props-multiseason-validation.mjs
```

The report rebuilds player-game rows from the archived individual play-by-play splits in `data/pbp/E2023` through `data/pbp/E2026`. E2023 supplies warm-up history; E2024, E2025 and E2026 are reported separately and pooled. It uses player IDs across seasons, rather than matching players by display name.

For each target game, the player's history and league per-minute priors include only games on strictly earlier calendar dates. Games on the same date are treated as simultaneous. The report compares the frozen current player model against a league-rate-only baseline on identical player-game samples and reports MAE, RMSE, log loss and Brier score by season and pooled.

PBP splits contain total rebounds rather than offensive/defensive rebounds separately; the validation maps total rebounds into the first rebound slot, preserving the total used by the `reb`, `pr`, `pra` and `ar` market definitions. The report skips games without usable individual splits and games whose PBP integrity check failed, and reports data coverage.

**Important limitation:** current production parameters are frozen. Some were selected using E2026 results, so E2024/E2025 are retrospective robustness tests, not fully independent historical out-of-sample tests. The report uses synthetic model-centred half-point lines, not historical bookmaker prices. It does not establish ROI or profitability. A strict nested walk-forward parameter-selection test is still required before claiming independent multi-season out-of-sample performance.


## Nested seasonal walk-forward validation

Run:

```sh
node scripts/props-nested-walkforward.mjs
```

This is the strict parameter-selection test. It searches 54 combinations of `minHalf`, `rateHalf`, `prior` and `minSd`. Dispersion, calibration shift, market blend, absence share, game-context and xPTS parameters remain frozen; the report makes this boundary explicit.

For each outer test season, candidates are selected only from earlier data. Inner validation consists of a chronological later portion of E2023 (with only earlier E2023 dates as history), plus each complete intervening prior season evaluated using strictly earlier dates for player histories and league priors. The selected candidate is then evaluated once on the outer season.

E2025 is an intermediate outer fold. E2026 is the primary final untouched holdout: its outcomes are not used in candidate selection, and its report is not fed back into tuning. The output includes the selected parameters, inner folds, top candidates, per-market MAE/RMSE/log loss/Brier and data-quality coverage.

The search objective is mean per-market predictive log loss across inner folds; mean Brier score breaks ties. MAE and RMSE are reported, not optimized. Same-date games are simultaneous. The workflow is offline/read-only and does not change `src/odds/props.mjs`, production parameters, deployment or betting behavior.

This report evaluates the core player-history projection and league-rate baseline. It does not claim bookmaker ROI or validate optional live-only game-context/xPTS adjustments. A positive result is evidence of predictive generalization, not proof of a profitable betting edge.
