"""Two-stage PIR projection: minutes x PIR per minute, plus P10/P50/P90 by quantile regression."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from features import FEATURES_MIN, FEATURES_PM, FEATURES_Q

SEED = 7
# εκδόσεις μοντέλου: ίδια features και δομή, διαφορετική μηχανή δέντρων. Η ενεργή ορίζεται στο data/fantasy/models.json (rollback).
ENGINES = {"pir-2stage-v1": "hgb", "pir-lgbm-v1": "lgbm"}


def _active_version() -> str:
    try:
        import json
        from pathlib import Path
        reg = json.loads((Path(__file__).resolve().parent.parent / "data" / "fantasy" / "models.json").read_text(encoding="utf-8"))
        v = reg.get("active")
        if v in ENGINES and (ENGINES[v] != "lgbm" or lgbm_available()):
            return v
    except Exception:
        pass
    return "pir-2stage-v1"


def lgbm_available() -> bool:
    try:
        import lightgbm  # noqa: F401
        return True
    except Exception:
        return False


def _hgb(**kw):
    # strongly regularised: ~2,000 player-games per season is little data, so the trees only correct
    # the Bayesian baseline (recent minutes x shrunk PIR/min) where the evidence is clear
    return HistGradientBoostingRegressor(max_iter=60, learning_rate=0.03, max_leaf_nodes=7, min_samples_leaf=80,
                                         l2_regularization=3.0, random_state=SEED, **kw)


def _lgbm(loss=None, quantile=None):
    from lightgbm import LGBMRegressor
    kw = dict(n_estimators=60, learning_rate=0.03, num_leaves=7, min_child_samples=80, reg_lambda=3.0, random_state=SEED, verbose=-1)
    if loss == "quantile":
        kw.update(objective="quantile", alpha=quantile)
    return LGBMRegressor(**kw)


class PirModel:
    def __init__(self, version: str | None = None):
        self.version = version or MODEL_VERSION
        self.engine = ENGINES.get(self.version, "hgb")

    def _reg(self, **kw):
        return _lgbm(**kw) if self.engine == "lgbm" else _hgb(**kw)

    def fit(self, df: pd.DataFrame) -> "PirModel":
        tr = df[~df["is_target"]].copy()
        self.n_train = len(tr)
        # stage 1: minutes, as a correction to the player's recent minutes (trees keep the extremes this way)
        self.m_min = self._reg().fit(tr[FEATURES_MIN], (tr["y_min"] - tr["m5"]).astype(float))
        # stage 2: PIR per minute, as a multiplier of his shrunk (Bayesian) PIR/min
        pl = tr[tr["y_min"] >= 5].copy()
        base = pl["pirpm_shr"].clip(lower=0.05)
        self.m_pm = self._reg().fit(pl[FEATURES_PM], (pl["y_pir"] / pl["y_min"] - base).clip(-1.0, 1.5), sample_weight=pl["y_min"].clip(5, 40))
        # spread: quantiles of the residual PIR around the point projection, for games he plays
        pl2 = tr[tr["y_min"] > 0].copy()
        point = self._point(pl2)
        resid = pl2["y_pir"].to_numpy(float) - point
        self.q = {a: self._reg(loss="quantile", quantile=a).fit(pl2[FEATURES_Q], resid) for a in (0.1, 0.5, 0.9)}
        # conformal widening, measured out of sample: quantiles fitted without the latest round,
        # checked on it, so that P10-P90 really holds ~80% of outcomes
        self.widen = 1.0
        last = int(pl2["round"].max())
        cal_tr, cal_te = pl2[pl2["round"] < last], pl2[pl2["round"] == last]
        if len(cal_tr) > 300 and len(cal_te) > 50:
            pt_tr, pt_te = self._point(cal_tr), self._point(cal_te)
            qlo = self._reg(loss="quantile", quantile=0.1).fit(cal_tr[FEATURES_Q], cal_tr["y_pir"].to_numpy(float) - pt_tr)
            qhi = self._reg(loss="quantile", quantile=0.9).fit(cal_tr[FEATURES_Q], cal_tr["y_pir"].to_numpy(float) - pt_tr)
            lo, hi = pt_te + qlo.predict(cal_te[FEATURES_Q]), pt_te + qhi.predict(cal_te[FEATURES_Q])
            y = cal_te["y_pir"].to_numpy(float)
            mid = (lo + hi) / 2
            self.widen = 2.5
            for w in np.arange(1.0, 2.55, 0.05):
                if np.mean((y >= mid - (mid - lo) * w) & (y <= mid + (hi - mid) * w)) >= 0.8:
                    self.widen = float(w)
                    break
        return self

    def _point(self, df):
        mins = np.clip(df["m5"].to_numpy(float) + self.m_min.predict(df[FEATURES_MIN]), 0, 40)
        pm = df["pirpm_shr"].clip(lower=0.05).to_numpy(float) + self.m_pm.predict(df[FEATURES_PM])
        return mins * pm

    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        out = df[["c", "round", "team", "opp", "home", "pos"]].copy()
        mins = np.clip(df["m5"].to_numpy(float) + self.m_min.predict(df[FEATURES_MIN]), 0, 40)
        pm = df["pirpm_shr"].clip(lower=0.05).to_numpy(float) + self.m_pm.predict(df[FEATURES_PM])
        out["proj_min"] = mins
        out["proj_pirpm"] = pm
        out["proj_pir"] = mins * pm
        q = {a: self.q[a].predict(df[FEATURES_Q]) for a in self.q}
        point = mins * pm
        lo, md, hi = point + q[0.1], point + q[0.5], point + q[0.9]
        mid = (lo + hi) / 2
        p10 = np.minimum(mid - (mid - lo) * self.widen, md)
        p90 = np.maximum(mid + (hi - mid) * self.widen, md)
        out["p10"], out["p50"], out["p90"] = p10, md, p90
        width = np.maximum(p90 - p10, 0.1)
        evidence = np.clip(df["n_played"] / 8, 0, 1)
        out["confidence"] = np.round(100 * np.clip(0.5 * evidence + 0.5 * (1 - width / (np.abs(md) + 25)), 0, 1)).astype(int)
        return out

    def factors(self, df: pd.DataFrame) -> list[list]:
        """Model-based attribution: how much the projection moves when one factor is set to a neutral value."""
        base = self.predict(df)["proj_pir"].to_numpy()
        neutral = {
            "opponent": {"opp_drtg": df["opp_drtg"].median(), "opp_pos_allow": 1.0, "opp_pace": df["opp_pace"].median()},
            "home": {"home": 0.5},
            "rest": {"rest": 4, "b2b": 0},
            "form": {"pir5": df["pir10"], "m_trend": 0.0, "m_last": df["m10"]},
            "role": {"start_rate5": df["start_rate5"].median(), "usage": 1.0},
        }
        res = [[] for _ in range(len(df))]
        for key, ch in neutral.items():
            d2 = df.copy()
            for col, v in ch.items():
                d2[col] = v
            delta = base - self.predict(d2)["proj_pir"].to_numpy()
            for i, v in enumerate(delta):
                res[i].append([key, round(float(v), 1)])
        return [sorted(r, key=lambda x: -abs(x[1])) for r in res]


def backtest(rows: pd.DataFrame, rounds: list[int]) -> dict:
    """Walk-forward: for each round, train only on earlier rounds and predict it."""
    res = []
    for r in rounds:
        train = rows[(rows["round"] < r) & (~rows["is_target"])]
        test = rows[(rows["round"] == r) & (~rows["is_target"])]
        if len(train) < 300 or not len(test):
            continue
        m = PirModel().fit(train)
        pr = m.predict(test)
        y = test["y_pir"].to_numpy(float)
        played = test["y_min"].to_numpy(float) > 0
        base = test["pir10"].to_numpy(float) * test["play_rate5"].to_numpy(float)
        cov = np.mean((y[played] >= pr["p10"].to_numpy()[played]) & (y[played] <= pr["p90"].to_numpy()[played]))
        res.append({"round": r, "n": int(len(test)), "mae": float(np.mean(np.abs(pr["proj_pir"].to_numpy() - y))),
                    "mae_base": float(np.mean(np.abs(base - y))), "coverage_80": float(cov),
                    "mae_min": float(np.mean(np.abs(pr["proj_min"].to_numpy() - test["y_min"].to_numpy(float))))})
    if not res:
        return {"rounds": []}
    tot = sum(x["n"] for x in res)
    agg = {k: sum(x[k] * x["n"] for x in res) / tot for k in ("mae", "mae_base", "coverage_80", "mae_min")}
    return {"rounds": res, **{k: round(v, 3) for k, v in agg.items()}, "n": tot}


MODEL_VERSION = _active_version()


def ncdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))
