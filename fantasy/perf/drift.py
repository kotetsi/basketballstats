"""Model drift: σειρές ανά αγωνιστική, rolling μετρικές 5/10 αγωνιστικών και κανόνες για alerts."""
from __future__ import annotations

import numpy as np
import pandas as pd

from metrics import MIN_N, _f

# όρια των alerts
MAE_RISE = 1.15        # rolling MAE 5 αγωνιστικών > 1,15 × MAE των 10 προηγούμενων
COV_LO, COV_HI = 0.70, 0.90
POS_RATIO = 1.25       # θέση με MAE > 1,25 × συνολικό
NEW_WORSE = 1.03       # νέα έκδοση με MAE > 1,03 × προηγούμενη


def round_series(df: pd.DataFrame, v: str) -> list[dict]:
    out = []
    for (s, r), g in df.groupby(["season", "round"], sort=True):
        e = g["y_pir"] - g[f"{v}|pir"]
        cov = ((g["y_pir"] >= g[f"{v}|p10"]) & (g["y_pir"] <= g[f"{v}|p90"])).mean()
        c = np.corrcoef(g["y_pir"], g[f"{v}|pir"])[0, 1] if len(g) > 2 and g[f"{v}|pir"].std() > 0 else np.nan
        out.append({"season": s, "round": int(r), "n": len(g), "mae": _f(e.abs().mean()), "rmse": _f(np.sqrt((e ** 2).mean())), "corr": _f(c), "coverage_80": _f(cov),
                    "fp_mae": _f((g["actual_fp"] - g[f"{v}|fp"]).abs().mean())})
    return out


def rolling(series: list[dict], w: int, key: str = "mae") -> list[dict]:
    """Rolling τιμή w αγωνιστικών, σταθμισμένη με το n, μέσα σε κάθε σεζόν."""
    out = []
    for i, x in enumerate(series):
        win = [y for y in series[max(0, i - w + 1): i + 1] if y["season"] == x["season"] and y.get(key) is not None]
        n = sum(y["n"] for y in win)
        out.append({"season": x["season"], "round": x["round"], "n": n, key: _f(sum(y[key] * y["n"] for y in win) / n) if n else None})
    return out


def detect(df: pd.DataFrame, v: str, prev_v: str | None = None, series: list[dict] | None = None) -> list[dict]:
    """Alerts για την πιο πρόσφατη σεζόν του df."""
    alerts = []
    if df.empty:
        return alerts
    season = sorted(df["season"].unique())[-1]
    cur = df[df["season"] == season]
    ser = [x for x in (series or round_series(df, v)) if x["season"] == season]
    if len(ser) >= 6:
        last5, prev10 = ser[-5:], ser[-15:-5]
        a = sum(x["mae"] * x["n"] for x in last5) / sum(x["n"] for x in last5)
        if prev10:
            b = sum(x["mae"] * x["n"] for x in prev10) / sum(x["n"] for x in prev10)
            if a > b * MAE_RISE and sum(x["n"] for x in last5) >= MIN_N:
                alerts.append({"k": "mae_up", "severity": "warning", "season": season, "value": _f(a, 2), "ref": _f(b, 2)})
        cov = sum(x["coverage_80"] * x["n"] for x in last5) / sum(x["n"] for x in last5)
        if not (COV_LO <= cov <= COV_HI):
            alerts.append({"k": "calibration", "severity": "warning", "season": season, "value": _f(cov, 2), "ref": 0.8})
    lastR = sorted(cur["round"].unique())[-10:]
    recent = cur[cur["round"].isin(lastR)]
    if len(recent) >= MIN_N:
        tot = (recent["y_pir"] - recent[f"{v}|pir"]).abs().mean()
        for pos, g in recent.groupby("pos"):
            if len(g) >= MIN_N:
                m = (g["y_pir"] - g[f"{v}|pir"]).abs().mean()
                if m > tot * POS_RATIO:
                    alerts.append({"k": "position", "severity": "warning", "season": season, "group": pos, "value": _f(m, 2), "ref": _f(tot, 2)})
    if prev_v and f"{prev_v}|pir" in df.columns:
        both = df.dropna(subset=[f"{v}|pir", f"{prev_v}|pir"])
        if len(both) >= MIN_N:
            a = (both["y_pir"] - both[f"{v}|pir"]).abs().mean()
            b = (both["y_pir"] - both[f"{prev_v}|pir"]).abs().mean()
            if a > b * NEW_WORSE:
                alerts.append({"k": "new_worse", "severity": "critical", "value": _f(a, 2), "ref": _f(b, 2), "model": v, "prev": prev_v, "action": "rollback"})
    return alerts
