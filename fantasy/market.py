"""Αγορά στοιχήματος για το Fantasy: πιθανότητα νίκης και αναμενόμενη διαφορά από τις αποδόσεις.

Ανά εταιρεία: moneyline χωρίς το περιθώριο (αναλογικό de-vig) → πιθανότητα νίκης γηπεδούχου,
handicap → αναμενόμενη διαφορά (−line). Μετά διάμεσος όλων των εταιρειών.
Μίξη με το μοντέλο: W_MODEL × μοντέλο + (1 − W_MODEL) × αγορά, όπως στο src/odds/blend.mjs
(backtest 3 σεζόν: η αγορά προβλέπει καλύτερα από το μοντέλο μόνο του).

    python3 fantasy/market.py --check   # backtest στους αγώνες με αποδόσεις (data/odds/history.jsonl)
"""
from __future__ import annotations

import json
import math
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ODDS = ROOT / "data" / "odds"
W_MODEL = 0.3
SD = 11.0
STALE_H = 48


def ncdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def nppf(p: float) -> float:
    lo, hi = -8.0, 8.0
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if ncdf(mid) < p else (lo, mid)
    return (lo + hi) / 2


def _ts(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00")) if s else None


def snap(books: dict) -> dict | None:
    """{p, mu, n_ml, n_spread} από τις τιμές των εταιρειών ({book: {ml:[h,a], spread:{line,h,a}}})."""
    ps, mus = [], []
    for b in (books or {}).values():
        ml = b.get("ml")
        if ml and len(ml) == 2 and ml[0] and ml[1] and ml[0] > 1 and ml[1] > 1:
            ih, ia = 1 / ml[0], 1 / ml[1]
            ps.append(ih / (ih + ia))
        sp = b.get("spread")
        if sp and sp.get("line") is not None:
            mus.append(-float(sp["line"]))
    if not ps and not mus:
        return None
    p = statistics.median(ps) if ps else None
    mu = statistics.median(mus) if mus else (SD * nppf(min(max(p, 0.01), 0.99)) if p is not None else None)
    if p is None:
        p = ncdf(mu / SD)
    return {"p": p, "mu": mu, "n_ml": len(ps), "n_spread": len(mus)}


def load_latest(now: datetime | None = None) -> dict:
    """Παιχνίδια με φρέσκες αποδόσεις πριν από το τζάμπολ: {"E-r-H-A": snap}."""
    try:
        d = json.loads((ODDS / "latest.json").read_text(encoding="utf-8"))
    except Exception:
        return {}
    now = now or datetime.now(timezone.utc)
    upd = _ts(d.get("updated"))
    if not upd or (now - upd).total_seconds() / 3600 > STALE_H:
        return {}
    out = {}
    for k, g in (d.get("games") or {}).items():
        t = _ts(g.get("t") or g.get("commence"))
        if t and t <= now:
            continue
        s = snap(g.get("books"))
        if s:
            out[k] = s
    return out


def blend(mu_model: float, mkt: dict | None, w: float = W_MODEL) -> tuple[float, float, str]:
    """(margin, pwin, πηγή) για τον γηπεδούχο."""
    if not mkt:
        return mu_model, ncdf(mu_model / SD), "model"
    mu = w * mu_model + (1 - w) * mkt["mu"]
    p = w * ncdf(mu_model / SD) + (1 - w) * mkt["p"]
    return mu, p, "blend"


# ---------------- backtest
def history_snaps(starts: dict) -> dict:
    """Τελευταία τιμή κάθε εταιρείας πριν από το τζάμπολ, από το data/odds/history.jsonl."""
    last = {}
    for line in (ODDS / "history.jsonl").read_text(encoding="utf-8").splitlines():
        x = json.loads(line)
        ev, st = x["event"], starts.get(x["event"])
        seen = _ts(x.get("seen") or x.get("t"))
        if not st or not seen or seen >= st or x["market"] not in ("ml", "spread"):
            continue
        k = (ev, x["book"], x["market"], x["sel"])
        if k not in last or seen >= last[k][0]:
            last[k] = (seen, x)
    books = {}
    for (ev, bk, mk, sel), (_, x) in last.items():
        b = books.setdefault(ev, {}).setdefault(bk, {})
        if mk == "ml":
            b.setdefault("_ml", {})[sel] = x["price"]
        elif sel == "home" and x.get("line") is not None:
            b["spread"] = {"line": x["line"]}
    out = {}
    for ev, bs in books.items():
        for b in bs.values():
            m = b.pop("_ml", {})
            if "home" in m and "away" in m:
                b["ml"] = [m["home"], m["away"]]
        s = snap(bs)
        if s:
            out[ev] = s
    return out


def check() -> dict:
    sys.path.insert(0, str(Path(__file__).parent))
    from run import coach_dist, coach_points, round_start  # noqa: E402
    cache = json.loads((ROOT / "data" / "cache.json").read_text(encoding="utf-8"))
    games = cache["league"]["games"]
    # τζάμπολ ανά αγώνα από το data/odds/latest.json ή το hist
    starts = {}
    for f in (ODDS / "hist").glob("E-*.json"):
        try:
            starts[f.stem] = _ts(json.loads(f.read_text(encoding="utf-8")).get("start"))
        except Exception:
            pass
    try:
        for k, g in json.loads((ODDS / "latest.json").read_text(encoding="utf-8"))["games"].items():
            starts.setdefault(k, _ts(g.get("t")))
    except Exception:
        pass
    mk = history_snaps(starts)
    # μοντέλο: τελευταίο αρχείο προβολής πριν από την αγωνιστική (pwin προπονητών)
    hist = {}
    for f in sorted((ROOT / "data" / "fantasy" / "history").glob("r*_*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        if "co" not in d:
            continue
        rs = round_start(games, d["round"])
        if rs and _ts(d["generated"]) and _ts(d["generated"]) < rs:
            hist[d["round"]] = {c["t"]: c for c in d["co"]}
    rows = []
    for g in games:
        r, h, a, hs, as_, played = g[0], g[2], g[3], g[4], g[5], g[6]
        ev = f"E-{r}-{h}-{a}"
        if not played or ev not in mk or r not in hist or h not in hist[r]:
            continue
        pw = min(max(hist[r][h]["pwin"], 0.005), 0.995)
        rows.append({"r": r, "mu_model": SD * nppf(pw), "mkt": mk[ev], "act": hs - as_})
    rep = {"n": len(rows), "rounds": sorted({x["r"] for x in rows})}
    if not rows:
        return rep
    for name, w in (("model", 1.0), ("blend_0.3", 0.3), ("blend_0.5", 0.5), ("market", 0.0)):
        mae = ll = cmae = 0.0
        for x in rows:
            mu, p, _ = blend(x["mu_model"], x["mkt"], w)
            win = x["act"] > 0
            mae += abs(mu - x["act"])
            ll += -math.log(p if win else 1 - p)
            # πόντοι προπονητή και για τις δύο ομάδες
            cmae += abs(coach_dist(mu)["exp"] - coach_points(x["act"])) + abs(coach_dist(-mu)["exp"] - coach_points(-x["act"]))
        n = len(rows)
        rep[name] = {"margin_mae": round(mae / n, 2), "logloss": round(ll / n, 4), "coach_mae": round(cmae / (2 * n), 2)}
    return rep


if __name__ == "__main__":
    if "--check" in sys.argv:
        print(json.dumps(check(), ensure_ascii=False, indent=1))
    else:
        for k, v in load_latest().items():
            print(k, {kk: round(vv, 3) if isinstance(vv, float) else vv for kk, vv in v.items()})
