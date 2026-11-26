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
