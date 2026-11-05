"""Σύγκριση εκδόσεων μοντέλου και registry με rollback (data/fantasy/models.json)."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pandas as pd

from calibration import quantile_calibration
from captain import captain_eval
from metrics import error_metrics, interval_metrics

REG = Path(__file__).resolve().parent.parent.parent / "data" / "fantasy" / "models.json"


def compare_models(df: pd.DataFrame, models: list[str]) -> list[dict]:
    """Για κάθε μοντέλο στις ΙΔΙΕΣ γραμμές: σφάλματα PIR και fantasy, κάλυψη, calibration, αρχηγός."""
    out = []
    cols = [f"{m}|pir" for m in models]
    common = df.dropna(subset=cols)
    for m in models:
        e = error_metrics(common["y_pir"], common[f"{m}|pir"], common["pir10"])
        f = error_metrics(common["actual_fp"], common[f"{m}|fp"])
        iv = interval_metrics(common["y_pir"], common[f"{m}|p10"], common[f"{m}|p90"])
        qc = quantile_calibration(common["y_pir"], common[f"{m}|p10"], common[f"{m}|p50"], common[f"{m}|p90"])
        cap = captain_eval(common, m)
        out.append({"model": m, "n": e["n"], "mae": e.get("mae"), "rmse": e.get("rmse"), "corr": e.get("corr"), "r2": e.get("r2"),
                    "directional": e.get("directional"), "ou_hit": e.get("ou_hit"), "fp_mae": f.get("mae"), "coverage_80": iv.get("coverage_80"),
                    "ece": qc.get("ece"), "captain_top10": None if cap.get("hidden") else cap.get("top10_rate"), "captain_pct": None if cap.get("hidden") else cap.get("median_pct"), "captain_n": cap.get("n")})
    best = min((x for x in out if x["mae"] is not None), key=lambda x: x["mae"], default=None)
    for x in out:
        x["best"] = best is not None and x["model"] == best["model"]
    return out


def load_registry(path: Path = REG) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"active": "pir-2stage-v1", "versions": [], "history": []}


def previous_version(reg: dict) -> str | None:
    """Η έκδοση που ήταν ενεργή πριν από την τρέχουσα (από το ιστορικό ενεργοποιήσεων)."""
    acts = [h["to"] for h in reg.get("history", []) if h.get("action") in ("activate", "rollback")]
    cur = reg.get("active")
    for v in reversed(acts):
        if v != cur:
            return v
    return None


def rollback(to: str, reason: str = "", path: Path = REG) -> dict:
    """Αλλάζει την ενεργή έκδοση. Η επόμενη εκτέλεση του fantasy/run.py χρησιμοποιεί αυτή."""
    reg = load_registry(path)
    ids = {v["id"] for v in reg.get("versions", [])}
    if to not in ids:
        raise ValueError(f"άγνωστη έκδοση {to}; διαθέσιμες: {sorted(ids)}")
    if reg.get("active") == to:
        return reg
    reg.setdefault("history", []).append({"at": date.today().isoformat(), "action": "rollback", "from": reg.get("active"), "to": to, "reason": reason})
    for v in reg["versions"]:
        v["status"] = "production" if v["id"] == to else ("retired" if v["id"] == reg.get("active") else v.get("status", "challenger"))
    reg["active"] = to
    path.write_text(json.dumps(reg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return reg
