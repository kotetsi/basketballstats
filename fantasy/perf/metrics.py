"""Μετρικές σφάλματος. Όλες επιστρέφουν και το n· οι ομάδες με n < MIN_N κρύβονται (hidden=True, χωρίς τιμές)."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

MIN_N = 30
MAPE_FLOOR = 5.0  # το MAPE υπολογίζεται μόνο όπου |actual| >= 5 PIR, αλλιώς εκτινάσσεται για τιμές κοντά στο 0


def _f(x, d=3):
    return None if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))) else round(float(x), d)


def error_metrics(actual, proj, line=None, min_n: int = MIN_N) -> dict:
    """MAE, RMSE, MAPE, median AE, correlation, R², bias, directional accuracy και hit rate over/under.

    line: η «εσωτερική γραμμή» του κάθε παίκτη (μέσος όρος 10 αγώνων). directional = το μοντέλο είπε σωστά αν θα πάει
    πάνω ή κάτω από τη γραμμή· over/under = μόνο όπου το μοντέλο διαφέρει από τη γραμμή κατά >= 1 PIR, γραμμή στο x.5.
    """
    a = np.asarray(actual, float)
    p = np.asarray(proj, float)
    ok = ~(np.isnan(a) | np.isnan(p))
    a, p = a[ok], p[ok]
    n = int(len(a))
    if n < min_n:
        return {"n": n, "hidden": True}
    e = a - p
    ss_res = float(np.sum(e ** 2))
    ss_tot = float(np.sum((a - a.mean()) ** 2))
    big = np.abs(a) >= MAPE_FLOOR
    out = {
        "n": n, "hidden": False,
        "mae": _f(np.mean(np.abs(e))), "rmse": _f(math.sqrt(np.mean(e ** 2))),
        "mape": _f(100 * np.mean(np.abs(e[big]) / np.abs(a[big])), 1) if big.sum() >= min_n else None,
        "medae": _f(np.median(np.abs(e))), "bias": _f(np.mean(e)),
        "corr": _f(np.corrcoef(a, p)[0, 1]) if np.std(a) > 0 and np.std(p) > 0 else None,
        "r2": _f(1 - ss_res / ss_tot) if ss_tot > 0 else None,
        "mean_actual": _f(a.mean(), 2), "mean_proj": _f(p.mean(), 2),
    }
    if line is not None:
        L = np.asarray(line, float)[ok]
        d_p, d_a = np.sign(p - L), np.sign(a - L)
        m = (d_p != 0) & (d_a != 0)
        out["directional"] = _f(np.mean(d_p[m] == d_a[m])) if m.sum() >= min_n else None
        ln = np.floor(L) + 0.5
        pick = np.abs(p - ln) >= 1.0
        out["ou_n"] = int(pick.sum())
        out["ou_hit"] = _f(np.mean(np.sign(p[pick] - ln[pick]) == np.sign(a[pick] - ln[pick]))) if pick.sum() >= min_n else None
    return out


def interval_metrics(actual, p10, p90, min_n: int = MIN_N) -> dict:
    """Πόσα αποτελέσματα πέφτουν μέσα στο P10–P90 (στόχος 80%), πάνω από το floor (90%) και πάνω από το ceiling (10%)."""
    a, lo, hi = (np.asarray(x, float) for x in (actual, p10, p90))
    n = len(a)
    if n < min_n:
        return {"n": n, "hidden": True}
    return {"n": n, "hidden": False, "coverage_80": _f(np.mean((a >= lo) & (a <= hi))),
            "floor_hit": _f(np.mean(a >= lo)), "ceiling_hit": _f(np.mean(a >= hi)), "width": _f(np.mean(hi - lo), 2)}


def by_group(df: pd.DataFrame, col: str, actual: str, proj: str, line: str | None = None, order=None, min_n: int = MIN_N, extra=None) -> list[dict]:
    """error_metrics ανά τιμή της στήλης col (π.χ. θέση, bucket λεπτών). Ομάδες με n < min_n κρύβονται."""
    res = []
    keys = order if order is not None else sorted(df[col].dropna().unique().tolist(), key=str)
    for k in keys:
        g = df[df[col] == k]
        m = error_metrics(g[actual], g[proj], g[line] if line else None, min_n=min_n)
        if extra and not m.get("hidden"):
            m.update(extra(g))
        res.append({"group": k if not isinstance(k, (np.integer,)) else int(k), **m})
    return res


def bucket(x, edges, labels):
    """Ταξινόμηση σε buckets: edges = όρια (ανοιχτά άκρα), labels = len(edges)+1 ετικέτες."""
    return pd.cut(pd.Series(x, dtype=float), [-np.inf, *edges, np.inf], labels=labels, right=False).astype(str)
