"""Calibration: (α) μέσο πραγματικό ανά bucket εκτίμησης, (β) quantile calibration των P10/P50/P90."""
from __future__ import annotations

import numpy as np

from metrics import MIN_N, _f

Z90 = 1.2816


def bucket_calibration(actual, proj, edges=(0, 5, 10, 15, 20, 25), min_n: int = MIN_N) -> list[dict]:
    """Για κάθε bucket της εκτίμησης: μέση εκτίμηση vs μέσο πραγματικό. Τέλειο calibration = πάνω στη διαγώνιο."""
    a, p = np.asarray(actual, float), np.asarray(proj, float)
    b = [-np.inf, *edges, np.inf]
    out = []
    for lo, hi in zip(b[:-1], b[1:]):
        m = (p >= lo) & (p < hi)
        n = int(m.sum())
        lbl = f"<{hi:g}" if lo == -np.inf else f"{lo:g}+" if hi == np.inf else f"{lo:g}–{hi:g}"
        if n < min_n:
            out.append({"bucket": lbl, "n": n, "hidden": True})
            continue
        out.append({"bucket": lbl, "n": n, "hidden": False, "proj": _f(p[m].mean(), 2), "actual": _f(a[m].mean(), 2), "gap": _f(a[m].mean() - p[m].mean(), 2)})
    return out


def quantile_calibration(actual, p10, p50, p90, min_n: int = MIN_N) -> dict:
    """Ποσοστό αποτελεσμάτων κάτω από κάθε quantile (στόχοι 10/50/90%) και καμπύλη calibration 10%…90%.

    Για τα ενδιάμεσα επίπεδα η κατανομή προσεγγίζεται κανονική ανάμεσα στα P10 και P90 (κέντρο P50).
    """
    a, lo, md, hi = (np.asarray(x, float) for x in (actual, p10, p50, p90))
    n = len(a)
    if n < min_n:
        return {"n": n, "hidden": True}
    sd = np.maximum((hi - lo) / (2 * Z90), 0.1)
    from math import erf, sqrt
    pit = 0.5 * (1 + np.vectorize(erf)((a - md) / (sd * sqrt(2))))
    curve = [{"q": q, "observed": _f(np.mean(pit <= q))} for q in (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)]
    obs = {"below_p10": _f(np.mean(a < lo)), "below_p50": _f(np.mean(a < md)), "below_p90": _f(np.mean(a < hi))}
    ece = _f(np.mean([abs(c["observed"] - c["q"]) for c in curve]))
    return {"n": n, "hidden": False, **obs, "curve": curve, "ece": ece}


def histogram(errors, lo=-30, hi=30, step=2.5) -> list[dict]:
    e = np.clip(np.asarray(errors, float), lo, hi - 1e-9)
    edges = np.arange(lo, hi + step, step)
    cnt, _ = np.histogram(e, bins=edges)
    return [{"from": float(edges[i]), "to": float(edges[i + 1]), "n": int(cnt[i])} for i in range(len(cnt))]
