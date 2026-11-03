"""Runs after `node build.mjs`: projects the next round and writes data/fantasy/*.json.

    python3 fantasy/run.py            # projection + backtest
Outputs
    data/fantasy/latest.json                      read by build.mjs for the Fantasy pages and the /api files
    data/fantasy/history/r{round}_{date}_{ver}.json   every projection kept for backtesting
"""
from __future__ import annotations

import csv
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from features import build_rows, game_date, team_tables, team_ratings_before, SECS, PIR  # noqa: E402
from model import MODEL_VERSION, PirModel, backtest, ncdf  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fantasy"
SD_MARGIN = 11.0


def log(*a):
    print("[fantasy]", *a, flush=True)


def read_overrides(name: str) -> dict:
    """Optional CSV files the owner can edit: code,value (lines starting with # are ignored)."""
    f = OUT / name
    res = {}
    if f.exists():
        for row in csv.reader(l for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")):
            if len(row) >= 2:
                res[row[0].strip().upper()] = row[1].strip()
    return res


def coach_points(margin: float) -> float:
    if margin > 0:
        return 10 if margin <= 10 else 20 if margin <= 20 else 25
    m = -margin
    return -5 if m <= 10 else -10 if m <= 20 else -20


def coach_dist(mu: float) -> dict:
    """Expected coach score and its spread from a normal margin distribution (rounded to whole points)."""
    ms = np.arange(-60, 61)
    ms = ms[ms != 0]
    w = np.array([ncdf((m + 0.5 - mu) / SD_MARGIN) - ncdf((m - 0.5 - mu) / SD_MARGIN) for m in ms])
    w /= w.sum()
    pts = np.array([coach_points(m) for m in ms])
    order = np.argsort(pts)
    cdf = np.cumsum(w[order])
    q = lambda a: float(pts[order][np.searchsorted(cdf, a)])
    return {"exp": round(float((w * pts).sum()), 2), "p10": q(0.1), "p50": q(0.5), "p90": q(0.9)}


def main():
    t0 = time.time()
    cache = json.loads((ROOT / "data" / "cache.json").read_text(encoding="utf-8"))
    try:
        site = json.loads((ROOT / "dist" / "assets" / "data.json").read_text(encoding="utf-8"))
        inj = site.get("inj", {})
    except FileNotFoundError:
        inj = {}
    games = cache["league"]["games"]
    target = next((g[0] for g in games if not g[6]), None)
    if target is None:
        log("no upcoming round, nothing to project")
        return
    rows = build_rows(cache, target)
    done_rounds = sorted({g[0] for g in games if g[6]})
    hist_rows = rows[~rows["is_target"]]
    model = PirModel().fit(hist_rows)
    tgt = rows[rows["is_target"]].reset_index(drop=True)
    pred = model.predict(tgt)
    facts = model.factors(tgt)

    # team strength for win probabilities, coach scoring and the +10% win bonus
    tt = team_tables(cache)
    rat = team_ratings_before(tt, target)
    def proj_game(h, a):
        H, A = rat.get(h), rat.get(a)
        if not H or not A:
            return None
        pace = (H["pace"] + A["pace"]) / 2
        ph = pace * (H["ortg"] + A["drtg"]) / 200 + 1.5
        pa = pace * (A["ortg"] + H["drtg"]) / 200 - 1.5
        return ph, pa
    tg = [g for g in games if g[0] == target]
    days = sorted({game_date(g[1]).isoformat() for g in tg})
    team_game = {}
    for g in tg:
        pg = proj_game(g[2], g[3])
        mu = (pg[0] - pg[1]) if pg else 0.0
        for team, opp, home, m in ((g[2], g[3], 1, mu), (g[3], g[2], 0, -mu)):
            team_game[team] = {"opp": opp, "home": home, "day": days.index(game_date(g[1]).isoformat()), "date": g[1],
                               "pwin": round(ncdf(m / SD_MARGIN), 3), "margin": round(m, 1)}

    prices_over = read_overrides("prices.csv")
    status_over = read_overrides("status.csv")
    pos_of = {p["c"]: p.get("pos") or "Forward" for p in cache["players"]}
    pl_by = {p["c"]: p for p in cache["players"]}
    players = []
    for i, r in pred.iterrows():
        c = r["c"]
        p = pl_by[c]
        played = [x for x in p["g"] if x[SECS] > 0]
        l5 = [x[PIR] for x in played[-5:]]
        l10 = [x[PIR] for x in played[-10:]]
        mins10 = sum(x[SECS] for x in played[-10:]) / 60
        status = "playing"
        ij = inj.get(c)
        if ij:
            status = "injured" if ij.get("m") == 1 else "doubtful"
        status = status_over.get(c, status_over.get(p["n"].upper(), status))
        mult = {"playing": 1.0, "doubtful": 0.4, "injured": 0.0, "rest": 0.0}.get(status, 1.0)
        proj = max(float(r["proj_pir"]), 0.0) * mult
        base = 0.5 * (np.mean(l10) if l10 else 0) + 0.5 * max(float(r["proj_pir"]), 0)
        price = float(prices_over.get(c, prices_over.get(p["n"].upper(), 0)) or 0) or round(min(24, max(4, 4 + 0.75 * base)), 1)
        tg_ = team_game.get(r["team"], {})
        players.append({
            "c": c, "n": p["n"], "t": r["team"], "pos": pos_of[c], "price": price, "status": status,
            "l5": round(float(np.mean(l5)), 1) if l5 else 0, "l10": round(float(np.mean(l10)), 1) if l10 else 0,
            "pirpm": round(sum(x[PIR] for x in played[-10:]) / mins10, 3) if mins10 else 0,
            "pm": round(float(r["proj_min"]) * mult, 1), "ppm": round(float(r["proj_pirpm"]), 3), "pp": round(proj, 1),
            "p10": round(float(r["p10"]) * mult, 1), "p50": round(float(r["p50"]) * mult, 1), "p90": round(float(r["p90"]) * mult, 1),
            "conf": int(r["confidence"]) if mult else 0, "opp": tg_.get("opp"), "home": tg_.get("home"), "day": tg_.get("day"), "pwin": tg_.get("pwin"),
            "f": facts[i][:4], "h": [[x[0], round(x[SECS] / 60, 1), x[PIR]] for x in p["g"][-12:]],
        })
    players.sort(key=lambda x: -x["pp"])
    # coach: one per team, price from team strength
    strength = sorted(rat, key=lambda t: -(rat[t]["ortg"] - rat[t]["drtg"]))
    coaches = []
    for t, g in team_game.items():
        cd = coach_dist(g["margin"])
        rank = strength.index(t) if t in strength else len(strength) // 2
        price = float(prices_over.get("COACH-" + t, 0) or 0) or round(4 + 6 * (1 - rank / max(len(strength) - 1, 1)), 1)
        coaches.append({"t": t, "price": price, **cd, "opp": g["opp"], "home": g["home"], "day": g["day"], "pwin": g["pwin"]})
    coaches.sort(key=lambda x: -x["exp"])
    pos_median = {ps: float(np.median([x["pp"] for x in players if x["pos"] == ps and x["status"] == "playing"] or [0])) for ps in ("Guard", "Forward", "Center")}

    bt_file = OUT / "backtest.json"
    bt = {}
    try:
        bt = json.loads(bt_file.read_text(encoding="utf-8"))
    except Exception:
        pass
    if bt.get("upto") != done_rounds[-1] or bt.get("model") != MODEL_VERSION:
        bt = backtest(rows[~rows["is_target"]], [r for r in done_rounds if r >= 4])
        bt["upto"] = done_rounds[-1]
        bt["model"] = MODEL_VERSION
        bt_file.parent.mkdir(parents=True, exist_ok=True)
        bt_file.write_text(json.dumps(bt), encoding="utf-8")
    now = datetime.now(timezone.utc)
    latest = {"round": target, "generated": now.isoformat(timespec="seconds"), "model": MODEL_VERSION, "n_train": model.n_train,
              "days": days, "players": players, "coaches": coaches, "pos_median": pos_median,
              "backtest": {k: bt.get(k) for k in ("mae", "mae_base", "coverage_80", "mae_min", "n", "upto")}}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "latest.json").write_text(json.dumps(latest, ensure_ascii=False), encoding="utf-8")
    hist = OUT / "history"
    hist.mkdir(exist_ok=True)
    slim = {"round": target, "generated": latest["generated"], "model": MODEL_VERSION,
            "p": [[x["c"], x["pm"], x["pp"], x["p10"], x["p50"], x["p90"], x["status"]] for x in players]}
    (hist / f"r{target}_{now.date().isoformat()}_{MODEL_VERSION}.json").write_text(json.dumps(slim), encoding="utf-8")
    log(f"round {target}: {len(players)} players, {len(coaches)} coaches, trained on {model.n_train} rows, "
        f"backtest MAE {bt.get('mae')} (baseline {bt.get('mae_base')}), {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
