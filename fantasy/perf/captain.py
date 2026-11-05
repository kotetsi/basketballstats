"""Αξιολόγηση αρχηγού: η πρόταση του Captain Advisor (μέγιστοι αναμενόμενοι πόντοι ως αρχηγός, ανάμεσα σε πιθανούς
βασικούς με τουλάχιστον 3 αγώνες) σε σχέση με όλους τους παίκτες της αγωνιστικής."""
from __future__ import annotations

import numpy as np
import pandas as pd

from metrics import MIN_N, _f


def captain_points(fp):
    return 2 * np.asarray(fp, float)


def pick_captain(g: pd.DataFrame, v: str) -> pd.Series | None:
    pool = g[(g["exp_starter"] == 1) & (g["n_played"] >= 3)]
    if pool.empty:
        pool = g
    return None if pool.empty else pool.loc[pool[f"{v}|fp"].idxmax()]


def evaluate_round(g: pd.DataFrame, v: str) -> dict | None:
    pick = pick_captain(g, v)
    if pick is None:
        return None
    act = captain_points(g["actual_fp"])
    me = 2 * float(pick["actual_fp"])
    rank = int(1 + np.sum(act > me))
    n = len(act)
    width = float(pick[f"{v}|p90"] - pick[f"{v}|p10"])
    return {"season": pick["season"], "round": int(pick["round"]), "c": pick["c"], "proj": round(2 * float(pick[f"{v}|fp"]), 1), "actual": round(me, 1),
            "error": round(me - 2 * float(pick[f"{v}|fp"]), 1), "rank": rank, "n": n, "best": int(rank == 1), "top5": int(rank <= 5), "top10": int(rank <= 10),
            "pct": round(1 - (rank - 1) / max(n - 1, 1), 3), "missed": round(float(act.max()) - me, 1), "best_c": g.loc[g["actual_fp"].idxmax(), "c"],
            "width": round(width, 1), "in_range": int(pick[f"{v}|p10"] <= pick["y_pir"] <= pick[f"{v}|p90"])}


def captain_eval(df: pd.DataFrame, v: str) -> dict:
    picks = [x for _, g in df.groupby(["season", "round"]) if (x := evaluate_round(g, v))]
    if not picks:
        return {"n": 0, "hidden": True, "picks": []}
    P = pd.DataFrame(picks)
    n = len(P)
    summary = {"n": n, "hidden": n < MIN_N, "best_rate": _f(P["best"].mean()), "top5_rate": _f(P["top5"].mean()), "top10_rate": _f(P["top10"].mean()),
               "median_pct": _f(P["pct"].median()), "avg_rank": _f(P["rank"].mean(), 1), "avg_missed": _f(P["missed"].mean(), 1),
               "mae": _f(P["error"].abs().mean(), 1), "bias": _f(P["error"].mean(), 1)}
    # calibration ρίσκου: οι προτάσεις χωρισμένες σε τρία ίσα μέρη κατά το εύρος P10–P90 (μικρό = «ασφαλής», μεγάλο = «ρισκαδόρικη»)
    risk = []
    if n >= 3:
        q = np.quantile(P["width"], [1 / 3, 2 / 3])
        P["risk"] = np.where(P["width"] <= q[0], "low", np.where(P["width"] <= q[1], "medium", "high"))
        for k in ("low", "medium", "high"):
            g = P[P["risk"] == k]
            risk.append({"group": k, "n": len(g), "hidden": len(g) < MIN_N, **({} if len(g) < MIN_N else {"width": _f(g["width"].mean(), 1), "coverage_80": _f(g["in_range"].mean()), "sd_actual": _f(g["actual"].std(), 1), "mae": _f(g["error"].abs().mean(), 1)})})
    summary["risk"] = risk
    summary["picks"] = picks
    return summary
