"""Τιμές Fantasy όταν λείπουν οι επίσημες της αγωνιστικής.

Αντί για την εκτίμηση από το PIR, παίρνουμε τις τελευταίες επίσημες τιμές (fantasy/official/prices-rK.csv)
και τις «κυλάμε» μπροστά με το μοντέλο αλλαγής τιμής (fantasy/official/price-model.json):
    αλλαγή ≈ slope × (fantasy points − τιμή), στρογγυλεμένη στο 0,1
    fantasy points = PIR × (1 + win_bonus) σε νίκη
    όποιος δεν παίζει ενώ η ομάδα του έπαιξε: τιμή × (1 + dnp_ratio), όχι κάτω από floor
Οι προπονητές μένουν στην τελευταία επίσημη τιμή (το μοντέλο είναι για παίκτες).

    python3 fantasy/price_roll.py --check   # backtest: πρόβλεψη rN από rN-1, σύγκριση με τις επίσημες rN
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OFF = ROOT / "fantasy" / "official"
R, MY, OP, SECS, PIR = 0, 4, 5, 7, 25


def read_prices(rnd: int) -> dict:
    f = OFF / f"prices-r{rnd}.csv"
    res = {}
    if f.exists():
        for row in csv.reader(l for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")):
            if len(row) >= 2 and row[1].strip():
                res[row[0].strip().upper()] = float(row[1])
    return res


def latest_official(before: int) -> int | None:
    rs = [int(f.stem[8:]) for f in OFF.glob("prices-r*.csv") if f.stem[8:].isdigit()]
    rs = [r for r in rs if r < before]
    return max(rs) if rs else None


def load_model() -> dict:
    try:
        return json.loads((OFF / "price-model.json").read_text(encoding="utf-8"))
    except Exception:
        return {"slope": 0.036, "dnp_ratio": -0.012, "floor": 4.0, "win_bonus": 0.1}


def step(price: float, row, m: dict) -> float:
    """Τιμή μετά από μία αγωνιστική. row = γραμμή αγώνα του παίκτη ή None αν δεν έπαιξε (η ομάδα του έπαιξε)."""
    if row is None or row[SECS] <= 0:
        return round(max(m["floor"], price * (1 + m["dnp_ratio"])), 1) if price > m["floor"] else price
    fp = row[PIR] * (1 + m["win_bonus"] if row[MY] > row[OP] else 1)
    return round(max(m["floor"], price + round(m["slope"] * (fp - price), 1)), 1)


def roll(cache: dict, target: int, model: dict | None = None):
    """{κωδικός: τιμή} για την target από τις τελευταίες επίσημες, και η αγωνιστική-βάση (ή None)."""
    base = latest_official(target)
    if base is None:
        return {}, None
    m = model or load_model()
    prices = read_prices(base)
    team_played = {}
    for p in cache["players"]:
        for g in p["g"]:
            team_played.setdefault(g[R], set()).add(p["t"])
    out = {}
    for p in cache["players"]:
        c = p["c"].upper()
        if c not in prices:
            continue
        pr = prices[c]
        by_r = {g[R]: g for g in p["g"]}
        for rnd in range(base, target):
            if p["t"] not in team_played.get(rnd, ()):
                continue
            pr = step(pr, by_r.get(rnd), m)
        out[c] = pr
    for k, v in prices.items():          # προπονητές: τελευταία επίσημη τιμή
        if k.startswith("COACH-"):
            out[k] = v
    return out, base


def check(cache: dict) -> list:
    rs = sorted(int(f.stem[8:]) for f in OFF.glob("prices-r*.csv") if f.stem[8:].isdigit())
    rep = []
    for r in rs[1:]:
        act = read_prices(r)
        pred, base = roll(cache, r)
        if base != r - 1:
            continue
        ks = [k for k in pred if k in act and not k.startswith("COACH-")]
        prev = read_prices(base)
        err = [abs(pred[k] - act[k]) for k in ks]
        err0 = [abs(prev[k] - act[k]) for k in ks]
        rep.append({"round": r, "n": len(ks), "mae": round(sum(err) / len(err), 3), "exact": round(sum(e < 0.05 for e in err) / len(err), 3),
                    "within_0_2": round(sum(e <= 0.2 for e in err) / len(err), 3), "mae_no_change": round(sum(err0) / len(err0), 3)})
    return rep


if __name__ == "__main__":
    cache = json.loads((ROOT / "data" / "cache.json").read_text(encoding="utf-8"))
    if "--check" in sys.argv:
        for x in check(cache):
            print(x)
    else:
        t = int(sys.argv[1]) if len(sys.argv) > 1 else cache["lastRound"] + 1
        pr, b = roll(cache, t)
        print(f"r{t} από τις επίσημες r{b}: {len(pr)} τιμές")
