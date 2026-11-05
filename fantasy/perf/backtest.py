"""Walk-forward backtest: για κάθε αγωνιστική r, εκπαίδευση ΜΟΝΟ με αγωνιστικές < r της ίδιας σεζόν, πρόβλεψη της r.

Κάθε γραμμή του αποτελέσματος = (σεζόν, αγωνιστική, παίκτης): features που ήταν γνωστά πριν από τον αγώνα (feature
snapshot), οι προβλέψεις κάθε έκδοσης μοντέλου και το πραγματικό αποτέλεσμα. Με τον ίδιο κώδικα (features.build_rows)
που χρησιμοποιεί και η καθημερινή πρόβλεψη, οπότε δεν υπάρχει διαφορά ανάμεσα σε backtest και παραγωγή.
"""
from __future__ import annotations

import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import features as F  # noqa: E402
from model import ENGINES, PirModel, lgbm_available  # noqa: E402

SD_MARGIN = 11.0
START_ROUND = 4          # όπως στην παραγωγή: πριν από την 4η αγωνιστική δεν υπάρχουν αρκετά δεδομένα για εκπαίδευση
MIN_TRAIN = 200
BASELINES = {"roll10-avg": "Μέσος όρος PIR 10 αγώνων × ποσοστό συμμετοχής", "pos-avg": "Μέσος όρος PIR της θέσης"}
SNAPSHOT = ["n_played", "m5", "m10", "pir10", "play_rate5", "start_rate5", "rest", "b2b", "home", "opp_drtg", "opp_pos_allow", "m_trend"]


def ncdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def time_split(rows: pd.DataFrame, r: int):
    """Αυστηρό time-based split: train = αγωνιστικές < r, test = η αγωνιστική r. Αποτυγχάνει αν υπάρξει διαρροή."""
    tr = rows[(rows["round"] < r) & (~rows["is_target"])]
    te = rows[(rows["round"] == r) & (~rows["is_target"])]
    assert tr.empty or tr["round"].max() < r, "data leakage: train περιέχει την αγωνιστική του test"
    return tr, te


def model_versions() -> list[str]:
    return [v for v, e in ENGINES.items() if e != "lgbm" or lgbm_available()]


def _resid_q(y, p):
    r = np.asarray(y, float) - np.asarray(p, float)
    return {q: float(np.quantile(r, q)) for q in (0.1, 0.5, 0.9)} if len(r) else {0.1: -5, 0.5: 0, 0.9: 5}


def predict_baselines(tr: pd.DataFrame, te: pd.DataFrame) -> dict[str, pd.DataFrame]:
    out = {}
    # 1. μέσος όρος 10 αγώνων × ποσοστό συμμετοχής 5 αγώνων (το «απλό» μοντέλο που χρησιμοποιούν οι περισσότεροι)
    f = lambda d: (d["pir10"] * d["play_rate5"]).to_numpy(float)
    q = _resid_q(tr["y_pir"], f(tr))
    p = f(te)
    out["roll10-avg"] = pd.DataFrame({"pir": p, "min": (te["m5"] * te["play_rate5"]).to_numpy(float), "p10": p + q[0.1], "p50": p + q[0.5], "p90": p + q[0.9]}, index=te.index)
    # 2. μέσος όρος της θέσης (χωρίς καμία πληροφορία για τον παίκτη)
    mp = tr.groupby("pos")["y_pir"].mean().to_dict()
    mm = tr.groupby("pos")["y_min"].mean().to_dict()
    pt = tr["pos"].map(mp).fillna(tr["y_pir"].mean()).to_numpy(float)
    q = _resid_q(tr["y_pir"], pt)
    p = te["pos"].map(mp).fillna(tr["y_pir"].mean()).to_numpy(float)
    out["pos-avg"] = pd.DataFrame({"pir": p, "min": te["pos"].map(mm).fillna(tr["y_min"].mean()).to_numpy(float), "p10": p + q[0.1], "p50": p + q[0.5], "p90": p + q[0.9]}, index=te.index)
    return out


def game_context(cache: dict, r: int, tt: pd.DataFrame) -> dict:
    """Ανά ομάδα: πιθανότητα νίκης πριν από τον αγώνα (από ratings των προηγούμενων αγωνιστικών), νίκη/διαφορά μετά."""
    rat = F.team_ratings_before(tt, r)
    ctx = {}
    for g in cache["league"]["games"]:
        if g[0] != r:
            continue
        H, A = rat.get(g[2]), rat.get(g[3])
        mu = 0.0
        if H and A:
            pace = (H["pace"] + A["pace"]) / 2
            mu = (pace * (H["ortg"] + A["drtg"]) / 200 + 1.5) - (pace * (A["ortg"] + H["drtg"]) / 200 - 1.5)
        for t, m, s, o in ((g[2], mu, g[4], g[5]), (g[3], -mu, g[5], g[4])):
            ctx[t] = {"pwin": ncdf(m / SD_MARGIN), "won": int(g[6] and s > o), "margin": (s - o) if g[6] else None}
    return ctx


def _absence_and_role(rows: pd.DataFrame) -> pd.DataFrame:
    """Σημαίες για το drift: πρώτος αγώνας μετά από απουσία ≥2 αγώνων, αλλαγή ρόλου (λεπτά 5 vs 10 αγώνων ≥ 6), νέος παίκτης."""
    rows = rows.sort_values(["c", "round"]).copy()
    played = (rows["y_min"] > 0).astype(int)
    miss = []
    streak = {}
    for c, p in zip(rows["c"], played):
        miss.append(streak.get(c, 0))
        streak[c] = 0 if p else streak.get(c, 0) + 1
    rows["prev_missed"] = miss
    rows["after_absence"] = (rows["prev_missed"] >= 2).astype(int)
    rows["role_change"] = ((rows["m5"] - rows["m10"]).abs() >= 6).astype(int)
    rows["new_player"] = (rows["n_played"] < 3).astype(int)
    return rows


def walk_forward(cache: dict, season: str, versions: list[str] | None = None, rounds: list[int] | None = None, log=print) -> pd.DataFrame:
    F._team_cache.clear()   # ο cache ομάδων είναι ανά σεζόν
    rows = F.build_rows(cache)
    rows = rows[~rows["is_target"]].copy()
    rows = _absence_and_role(rows)
    tt = F.team_tables(cache)
    versions = versions or model_versions()
    done = sorted(rows["round"].unique().tolist())
    want = [r for r in (rounds or done) if r >= START_ROUND and r in done]
    out = []
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for r in want:
        tr, te = time_split(rows, r)
        te = te[te["n_played"] >= 1]        # προβλέψεις μόνο για όσους έχουν παίξει τουλάχιστον μία φορά (όπως στο site)
        if len(tr) < MIN_TRAIN or te.empty:
            continue
        ctx = game_context(cache, r, tt)
        base = te[["c", "round", "team", "opp", "home", "pos", *[c for c in SNAPSHOT if c != "home"], "after_absence", "role_change", "new_player", "prev_missed", "y_min", "y_pir"]].copy()
        base["season"] = season
        base["pwin"] = base["team"].map(lambda t: ctx.get(t, {}).get("pwin", 0.5))
        base["won"] = base["team"].map(lambda t: ctx.get(t, {}).get("won", 0))
        base["exp_starter"] = (base["start_rate5"] >= 0.5).astype(int)
        # εκτιμώμενη τιμή από τον μέσο όρο 10 αγώνων (δεν υπάρχουν ιστορικές επίσημες τιμές), ίδια για όλα τα μοντέλα
        base["price"] = np.round(np.clip(4 + 0.75 * base["pir10"].clip(lower=0), 4, 24), 1)
        base["actual_fp"] = base["y_pir"] * np.where(base["won"] == 1, 1.1, 1.0)
        base["generated_at"] = now
        preds = predict_baselines(tr, te)
        for v in versions:
            try:
                m = PirModel(v).fit(tr)
                p = m.predict(te)
                preds[v] = pd.DataFrame({"pir": p["proj_pir"].to_numpy(), "min": p["proj_min"].to_numpy(), "p10": p["p10"].to_numpy(), "p50": p["p50"].to_numpy(), "p90": p["p90"].to_numpy()}, index=te.index)
            except Exception as e:  # μια έκδοση που αποτυγχάνει δεν σταματά το backtest
                log(f"[backtest] {season} r{r} {v}: {e}")
        wb = 1 + 0.1 * base["pwin"]
        for v, p in preds.items():
            for k in ("pir", "min", "p10", "p50", "p90"):
                base[f"{v}|{k}"] = np.round(p[k].to_numpy(float), 2)
            base[f"{v}|fp"] = np.round(p["pir"].to_numpy(float) * wb, 2)
        out.append(base)
        log(f"[backtest] {season} r{r}: train {len(tr)}, test {len(te)}, μοντέλα {', '.join(preds)}")
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def models_in(df: pd.DataFrame) -> list[str]:
    return sorted({c.split("|")[0] for c in df.columns if "|" in c})
