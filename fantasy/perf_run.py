"""Fantasy Model Performance & Backtesting: τρέχει (σταδιακά) το walk-forward backtest σε όλες τις διαθέσιμες σεζόν
και γράφει data/fantasy/perf/report.json για τη σελίδα /fantasy/model-performance/ και τα API JSON.

    python fantasy/perf_run.py                    # νέες αγωνιστικές/μοντέλα μόνο (οι παλιές προβλέψεις κρατιούνται)
    python fantasy/perf_run.py --full             # όλα από την αρχή
    python fantasy/perf_run.py --season E2025     # μόνο μία σεζόν
    python fantasy/perf_run.py --rollback pir-2stage-v1 --reason "..."

Πηγές: data/cache.json (τρέχουσα σεζόν) και data/fantasy/hist/<S>.json (fantasy/hist_fetch.mjs, προηγούμενες σεζόν).
Αποθήκευση: data/fantasy/perf/pred_<S>.csv.gz = κάθε πρόβλεψη με model version, generated_at, feature snapshot, πραγματικό.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "perf"))
from backtest import BASELINES, model_versions, models_in, walk_forward  # noqa: E402
from calibration import bucket_calibration, histogram, quantile_calibration  # noqa: E402
from captain import captain_eval  # noqa: E402
from compare import compare_models, load_registry, previous_version, rollback  # noqa: E402
from drift import detect, rolling, round_series  # noqa: E402
from metrics import MIN_N, _f, bucket, by_group, error_metrics, interval_metrics  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PERF = ROOT / "data" / "fantasy" / "perf"
HIST = ROOT / "data" / "fantasy" / "hist"
CUR = os.environ.get("SEASON") or json.loads((ROOT / "site.config.json").read_text(encoding="utf-8")).get("season", "E2026")

PRICE_E, PRICE_L = (6, 9, 12, 15), ["<6", "6–9", "9–12", "12–15", "15+"]
MIN_E, MIN_L = (10, 20, 28), ["<10'", "10–20'", "20–28'", "28'+"]
PIR_E, PIR_L = (0, 5, 10, 15, 20), ["<0", "0–5", "5–10", "10–15", "15–20", "20+"]


def log(*a):
    print("[perf]", *a, flush=True)


def seasons_available() -> dict[str, Path | None]:
    out = {}
    for f in sorted(HIST.glob("E*.json")):
        if f.stem != CUR:
            out[f.stem] = f
    out[CUR] = None
    return out


def load_cache(season: str, f: Path | None) -> dict:
    if f is None:
        return json.loads((ROOT / "data" / "cache.json").read_text(encoding="utf-8"))
    return json.loads(f.read_text(encoding="utf-8"))


def complete_rounds(cache: dict) -> list[int]:
    by = {}
    for g in cache["league"]["games"]:
        by.setdefault(g[0], []).append(g[6])
    return sorted(r for r, v in by.items() if v and all(v))


def update_season(season: str, f: Path | None, full: bool) -> pd.DataFrame:
    pf = PERF / f"pred_{season}.csv.gz"
    old = pd.DataFrame()
    if pf.exists() and not full:
        old = pd.read_csv(pf, dtype={"c": str})
    cache = load_cache(season, f)
    rounds = complete_rounds(cache)
    want_models = model_versions()
    have_models = models_in(old) if len(old) else []
    missing_models = [m for m in want_models if m not in have_models]
    have_rounds = set(old["round"].unique().tolist()) if len(old) else set()
    todo = [r for r in rounds if r not in have_rounds]
    if missing_models and len(old):
        todo = rounds   # νέα έκδοση μοντέλου: ξανά όλη η σεζόν, για σύγκριση στις ίδιες γραμμές
        old = pd.DataFrame()
    if not todo:
        log(f"{season}: ενημερωμένο ({len(old)} γραμμές)")
        return old
    t0 = time.time()
    new = walk_forward(cache, season, want_models, todo, log=log)
    df = pd.concat([old, new], ignore_index=True) if len(old) else new
    if len(df):
        df = df.sort_values(["round", "c"]).reset_index(drop=True)
        PERF.mkdir(parents=True, exist_ok=True)
        df.to_csv(pf, index=False, compression="gzip", float_format="%.3f")
    log(f"{season}: +{len(new)} γραμμές ({len(todo)} αγωνιστικές) σε {time.time() - t0:.0f}s")
    return df


def add_groups(df: pd.DataFrame, v: str) -> pd.DataFrame:
    df = df.copy()
    df["price_b"] = bucket(df["price"], PRICE_E, PRICE_L).values
    df["min_b"] = bucket(df["m5"], MIN_E, MIN_L).values
    df["pir_b"] = bucket(df[f"{v}|pir"], PIR_E, PIR_L).values
    df["role"] = np.where(df["exp_starter"] == 1, "starter", "bench")
    df["venue"] = np.where(df["home"] == 1, "home", "away")
    df["b2b_k"] = np.where(df["b2b"] == 1, "b2b", "rest")
    df["ptype"] = np.select([df["new_player"] == 1, df["after_absence"] == 1, df["role_change"] == 1], ["new", "after_absence", "role_change"], "regular")
    return df


def section(df: pd.DataFrame, v: str) -> dict:
    """Όλες οι μετρικές ενός μοντέλου πάνω σε ένα σύνολο γραμμών."""
    if df.empty:
        return {"n": 0, "hidden": True}
    fpx = lambda g: {"fp_mae": _f((g["actual_fp"] - g[f"{v}|fp"]).abs().mean()), "coverage_80": _f(((g["y_pir"] >= g[f"{v}|p10"]) & (g["y_pir"] <= g[f"{v}|p90"])).mean())}
    wb = 1 + 0.1 * df["pwin"]
    return {
        "pir": error_metrics(df["y_pir"], df[f"{v}|pir"], df["pir10"]),
        "minutes": error_metrics(df["y_min"], df[f"{v}|min"]),
        "fp": {**error_metrics(df["actual_fp"], df[f"{v}|fp"]), **{k: x for k, x in interval_metrics(df["actual_fp"], df[f"{v}|p10"] * wb, df[f"{v}|p90"] * wb).items() if k not in ("n", "hidden")}},
        "interval": interval_metrics(df["y_pir"], df[f"{v}|p10"], df[f"{v}|p90"]),
        "calibration": bucket_calibration(df["y_pir"], df[f"{v}|pir"]),
        "quantiles": quantile_calibration(df["y_pir"], df[f"{v}|p10"], df[f"{v}|p50"], df[f"{v}|p90"]),
        "fp_quantiles": quantile_calibration(df["actual_fp"], df[f"{v}|p10"] * wb, df[f"{v}|p50"] * wb, df[f"{v}|p90"] * wb),
        "histogram": histogram(df["y_pir"] - df[f"{v}|pir"]),
        "by": {
            "position": by_group(df, "pos", "y_pir", f"{v}|pir", "pir10", order=["Guard", "Forward", "Center"], extra=fpx),
            "price": by_group(df, "price_b", "y_pir", f"{v}|pir", "pir10", order=PRICE_L, extra=fpx),
            "minutes": by_group(df, "min_b", "y_pir", f"{v}|pir", "pir10", order=MIN_L, extra=fpx),
            "proj_pir": by_group(df, "pir_b", "y_pir", f"{v}|pir", "pir10", order=PIR_L, extra=fpx),
            "role": by_group(df, "role", "y_pir", f"{v}|pir", "pir10", order=["starter", "bench"], extra=fpx),
            "venue": by_group(df, "venue", "y_pir", f"{v}|pir", "pir10", order=["home", "away"], extra=fpx),
            "b2b": by_group(df, "b2b_k", "y_pir", f"{v}|pir", "pir10", order=["rest", "b2b"], extra=fpx),
            "ptype": by_group(df, "ptype", "y_pir", f"{v}|pir", "pir10", order=["regular", "new", "after_absence", "role_change"], extra=fpx),
            "season": by_group(df, "season", "y_pir", f"{v}|pir", "pir10", extra=fpx),
        },
    }


def report(dfs: dict[str, pd.DataFrame], reg: dict) -> dict:
    allp = pd.concat([d for d in dfs.values() if len(d)], ignore_index=True)
    models = [m for m in models_in(allp)]
    active = reg.get("active") if reg.get("active") in models else ("pir-2stage-v1" if "pir-2stage-v1" in models else models[0])
    prev = previous_version(reg)
    allp = add_groups(allp, active)
    cur = allp[allp["season"] == CUR]
    ser = round_series(allp, active)
    cap = captain_eval(allp, active)
    cap_cur = captain_eval(cur, active) if len(cur) else {"n": 0, "hidden": True, "picks": []}
    hist = {m: [{"season": x["season"], "round": x["round"], "n": x["n"], "mae": x["mae"]} for x in round_series(allp, m)] for m in models}
    out = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "active": active, "previous": prev, "current_season": CUR, "min_n": MIN_N,
        "models": [{"id": m, "kind": "baseline" if m in BASELINES else "model", "desc": BASELINES.get(m) or next((v.get("description") for v in reg.get("versions", []) if v["id"] == m), "")} for m in models],
        "registry": reg,
        "seasons": [{"season": s, "rows": int(len(d)), "rounds": int(d["round"].nunique()) if len(d) else 0, "from": int(d["round"].min()) if len(d) else None, "to": int(d["round"].max()) if len(d) else None} for s, d in dfs.items()],
        "n": int(len(allp)),
        "all": section(allp, active),
        "current": section(cur, active) if len(cur) else {"n": 0, "hidden": True},
        "rounds_current": by_group(cur, "round", "y_pir", f"{active}|pir", "pir10") if len(cur) else [],
        "teams_current": by_group(cur, "team", "y_pir", f"{active}|pir", "pir10") if len(cur) else [],
        "teams_all": by_group(allp, "team", "y_pir", f"{active}|pir", "pir10"),
        "captain": {k: v for k, v in cap.items() if k != "picks"}, "captain_current": {k: v for k, v in cap_cur.items() if k != "picks"},
        "captain_picks": cap.get("picks", [])[-60:],
        "series": ser, "rolling5": rolling(ser, 5), "rolling10": rolling(ser, 10),
        "rolling5_rmse": rolling(ser, 5, "rmse"), "rolling5_corr": rolling(ser, 5, "corr"),
        "history": hist,
        "compare": {"all": compare_models(allp, models), "current": compare_models(cur, models) if len(cur) else []},
        "alerts": detect(allp, active, prev if prev in models else None, ser),
    }
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--season")
    ap.add_argument("--rollback")
    ap.add_argument("--reason", default="")
    a = ap.parse_args(argv)
    if a.rollback:
        reg = rollback(a.rollback, a.reason or "χειροκίνητο rollback")
        log(f"ενεργή έκδοση: {reg['active']}")
        return
    t0 = time.time()
    dfs = {}
    for s, f in seasons_available().items():
        if a.season and s != a.season:
            pf = PERF / f"pred_{s}.csv.gz"
            dfs[s] = pd.read_csv(pf, dtype={"c": str}) if pf.exists() else pd.DataFrame()
            continue
        try:
            dfs[s] = update_season(s, f, a.full)
        except FileNotFoundError:
            continue
    dfs = {s: d for s, d in dfs.items() if len(d)}
    if not dfs:
        log("δεν υπάρχουν δεδομένα")
        return
    rep = report(dfs, load_registry())
    PERF.mkdir(parents=True, exist_ok=True)
    (PERF / "report.json").write_text(json.dumps(rep, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    al = rep["all"]["pir"]
    log(f"report: {rep['n']} προβλέψεις, μοντέλο {rep['active']}, MAE {al.get('mae')} (n={al.get('n')}), alerts {len(rep['alerts'])}, {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
