"""Intelligence Engine, Φάση 3: πειραματικό μοντέλο λεπτών δύο μερών (hurdle). ΔΕΝ χρησιμοποιείται από την παραγωγή.

    αναμενόμενα λεπτά = P(παίζει) × E[λεπτά | παίζει]

  * P(παίζει): classifier (HistGradientBoosting) με τα features λεπτών του pir-2stage-v2.
  * E[λεπτά | παίζει]: διόρθωση πάνω στον εκθετικό μέσο (μισή ζωή 3) των λεπτών των αγώνων που έπαιξε (όπως τα props),
    εκπαιδευμένη μόνο στις γραμμές όπου ο παίκτης έπαιξε.

Ίδιο walk-forward με το fantasy/perf/backtest.py (pooled προηγούμενες σεζόν + αγωνιστικές < r της τρέχουσας),
άρα και ίδια προστασία από διαρροή: για την αγωνιστική r εκπαιδεύεται μόνο με αγωνιστικές < r (assert).

    python fantasy/perf/minutes_hurdle.py [--seasons E2024,E2025] [--out data/fantasy/perf/minutes_hurdle.csv.gz]

Η αξιολόγηση γίνεται από το scripts/engine-minutes-compare.mjs (ίδιο δείγμα με τις υπόλοιπες μεθόδους).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import features as F  # noqa: E402
import features2 as F2  # noqa: E402
from backtest import EARLY_FROM, MIN_TRAIN  # noqa: E402

ROOT = HERE.parent.parent
VERSION = "min-hurdle-x2"
EW_HALF = 3.0   # ίδια μισή ζωή με τα props (src/odds/props.mjs PARAMS.minHalf)
FEATS = F2.FEATURES_MIN_V2 + ["m_cond5", "m_ew3", "n_played_all"]


def add_cond(df: pd.DataFrame) -> pd.DataFrame:
    """βάση για «αν παίξει»: μέσος λεπτών των αγώνων που έπαιξε μέσα στους τελευταίους 5 (αλλιώς των 10)"""
    df = df.copy()
    pr5 = df["play_rate5"].to_numpy(float)
    m5, m10 = df["m5"].to_numpy(float), df["m10"].to_numpy(float)
    with np.errstate(divide="ignore", invalid="ignore"):
        c5 = np.where(pr5 > 0, m5 / np.maximum(pr5, 1e-9), np.nan)
    df["m_cond5"] = np.where(np.isfinite(c5), c5, np.maximum(m10, 0))
    return df


def ew_table(cache: dict) -> dict:
    """(c, round) → (εκθετικός μέσος λεπτών των αγώνων που ΕΠΑΙΞΕ πριν από την αγωνιστική, πλήθος).
    Μόνο αγώνες με αγωνιστική < round: χωρίς διαρροή."""
    out = {}
    for p in cache["players"]:
        g = sorted((r for r in p.get("g", []) if r[7] > 0), key=lambda r: r[0])
        rounds = sorted({r[0] for r in p.get("g", [])} | {x[0] for x in cache["league"]["games"]})
        mins = [(r[0], r[7] / 60) for r in g]
        for rnd in rounds:
            prev = [m for (rr, m) in mins if rr < rnd]
            if not prev:
                continue
            w = 0.5 ** (np.arange(len(prev))[::-1] / EW_HALF)
            out[(p["c"], rnd)] = (float(np.dot(w, prev) / w.sum()), len(prev))
    return out


def add_ew(df: pd.DataFrame, tab: dict) -> pd.DataFrame:
    df = df.copy()
    v = [tab.get((c, r), (np.nan, 0)) for c, r in zip(df["c"], df["round"])]
    df["m_ew3"] = [x[0] for x in v]
    df["n_played_all"] = [x[1] for x in v]
    df["m_ew3"] = df["m_ew3"].fillna(df["m_cond5"])
    return df


def clf():
    return HistGradientBoostingClassifier(max_iter=120, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=80, l2_regularization=1.0, random_state=7)


def reg():
    return HistGradientBoostingRegressor(max_iter=120, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=80, l2_regularization=1.0, random_state=7)


def load(season: str, cur: str) -> dict:
    f = ROOT / "data" / "cache.json" if season == cur else ROOT / "data" / "fantasy" / "hist" / f"{season}.json"
    return json.loads(f.read_text(encoding="utf-8"))


def run_season(season: str, caches: dict, pool: dict, log=print) -> pd.DataFrame:
    order = sorted(caches)
    cache = caches[season]
    prev = caches.get(order[order.index(season) - 1]) if order.index(season) > 0 else None
    F._team_cache.clear()
    r2 = F2.add_time_index(F2.rows_v2(cache, prev), season)
    r2 = add_ew(add_cond(r2[~r2["is_target"]]), ew_table(cache))
    hist = F2.pooled_history(caches, season, cache_rows=pool)
    if len(hist):
        tabs = {}
        for s_ in hist["season"].unique() if "season" in hist else []:
            tabs.update({(s_, k[0], k[1]): v for k, v in ew_table(caches[s_]).items()})
        hist = add_cond(hist)
        v = [tabs.get((s_, c, r), (np.nan, 0)) for s_, c, r in zip(hist["season"], hist["c"], hist["round"])]
        hist["m_ew3"] = [x[0] for x in v]
        hist["n_played_all"] = [x[1] for x in v]
        hist["m_ew3"] = hist["m_ew3"].fillna(hist["m_cond5"])
    F._team_cache.clear()
    out = []
    for r in sorted(r2["round"].unique().tolist()):
        if r < EARLY_FROM:
            continue
        cur_tr = r2[r2["round"] < r]
        assert cur_tr.empty or cur_tr["round"].max() < r, "data leakage: train περιέχει την αγωνιστική του test"
        tr = pd.concat([hist, cur_tr], ignore_index=True)
        te = r2[(r2["round"] == r) & (r2["n_played"] >= 1)]
        if te.empty or len(tr) < MIN_TRAIN:
            continue
        X, Xt = tr[FEATS], te[FEATS]
        played = (tr["y_min"] > 0).to_numpy()
        p = clf().fit(X, played.astype(int)).predict_proba(Xt)[:, 1]
        trp = tr[played]
        cm = reg().fit(trp[FEATS], (trp["y_min"] - trp["m_ew3"]).astype(float)).predict(Xt)
        cond = np.clip(te["m_ew3"].to_numpy(float) + cm, 0, 40)
        out.append(pd.DataFrame({"season": season, "round": r, "c": te["c"].to_numpy(), "hz_p": np.round(p, 4),
                                 "hz_cond": np.round(cond, 2), "hz_exp": np.round(p * cond, 2), "y_min": te["y_min"].to_numpy()}))
        log(f"[hurdle] {season} r{r}: train {len(tr)}, test {len(te)}")
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", default="")
    ap.add_argument("--out", default=str(ROOT / "data" / "fantasy" / "perf" / "minutes_hurdle.csv.gz"))
    a = ap.parse_args(argv)
    cur = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))["season"]
    seasons = sorted([f.stem for f in (ROOT / "data" / "fantasy" / "hist").glob("E*.json") if f.stem != cur] + [cur])
    caches = {s: load(s, cur) for s in seasons}
    want = [s for s in (a.seasons.split(",") if a.seasons else seasons) if s in caches]
    pool: dict = {}
    t0 = time.time()
    df = pd.concat([run_season(s, caches, pool) for s in want], ignore_index=True)
    df.insert(0, "model", VERSION)
    df.to_csv(a.out, index=False, compression="gzip")
    print(f"[hurdle] {len(df)} γραμμές → {a.out} ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
