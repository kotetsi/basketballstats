"""Backfill για τα Fantasy Manager Tools: «snapshot» της αγοράς για κάθε αγωνιστική που έχει παιχτεί.

Για κάθε αγωνιστική r της τρέχουσας σεζόν εκπαιδεύει το μοντέλο ΜΟΝΟ με αγώνες πριν από την r (χωρίς data leakage),
προβλέπει την r και γράφει data/fantasy/backfill/r<r>.json με εκτίμηση, εκτιμώμενη τιμή, PIR/credit και το πραγματικό PIR.
Έτσι ελέγχεται με time-based validation πόσο καλά δουλεύουν τα σήματα buy-low/sell-high.

    python fantasy/backfill.py            # όλες οι αγωνιστικές από την 4η
    python fantasy/backfill.py 6 7        # συγκεκριμένες
Οι παλαιότερες σεζόν έχουν στο site μόνο συγκεντρωτικά στατιστικά (όχι ανά αγώνα ανά παίκτη), οπότε το backfill γίνεται για την τρέχουσα.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from features import build_rows, SECS, PIR  # noqa: E402
from model import PirModel  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fantasy" / "backfill"


def main(argv):
    cache = json.loads((ROOT / "data" / "cache.json").read_text(encoding="utf-8"))
    games = cache["league"]["games"]
    done = sorted({g[0] for g in games if g[6]})
    want = [int(x) for x in argv] or [r for r in done if r >= 4]
    OUT.mkdir(parents=True, exist_ok=True)
    pl = {p["c"]: p for p in cache["players"]}
    summary = []
    for r in want:
        if r not in done:
            print(f"[backfill] r{r}: δεν έχει παιχτεί, παραλείπεται")
            continue
        rows = build_rows(cache, r)
        train = rows[rows["round"] < r]
        target = rows[rows["round"] == r].reset_index(drop=True)
        if len(train) < 200 or not len(target):
            continue
        m = PirModel().fit(train)
        pr = m.predict(target)
        snap = []
        for i, x in pr.iterrows():
            g = [y for y in pl[x["c"]]["g"] if y[0] < r and y[SECS] > 0]
            l10 = [y[PIR] for y in g[-10:]]
            if len(l10) < 3:
                continue
            price = round(min(24, max(4, 4 + 0.75 * (0.5 * float(np.mean(l10)) + 0.5 * max(float(x["proj_pir"]), 0)))), 1)
            actual = next((y[PIR] for y in pl[x["c"]]["g"] if y[0] == r and y[SECS] > 0), None)
            snap.append({"c": x["c"], "price": price, "pp": round(float(x["proj_pir"]), 1), "vpc": round(max(float(x["proj_pir"]), 0) / price, 3), "l10": round(float(np.mean(l10)), 1), "actual": actual})
        (OUT / f"r{r}.json").write_text(json.dumps({"round": r, "players": snap}), encoding="utf-8")
        a = [s for s in snap if s["actual"] is not None]
        mae = float(np.mean([abs(s["actual"] - s["pp"]) for s in a])) if a else None
        top = sorted(a, key=lambda s: -s["vpc"])[: max(1, len(a) // 4)]
        # captain: ο παίκτης με την υψηλότερη εκτίμηση PIR (καλύτερη αναμενόμενη επιλογή) σε σχέση με τους υπόλοιπους
        byp = sorted(a, key=lambda s: -s["pp"])
        act_rank = sorted(a, key=lambda s: -s["actual"])
        cap = byp[0] if byp else None
        summary.append({"round": r, "n": len(a), "mae": round(mae, 2) if mae is not None else None,
                        "top_quartile_actual_per_credit": round(float(np.mean([s["actual"] / s["price"] for s in top])), 3) if top else None,
                        "all_actual_per_credit": round(float(np.mean([s["actual"] / s["price"] for s in a])), 3) if a else None,
                        "captain_pick": cap["c"] if cap else None, "captain_pick_actual": cap["actual"] if cap else None,
                        "captain_pick_actual_rank": (act_rank.index(cap) + 1) if cap else None,
                        "top10_projected_avg_actual": round(float(np.mean([s["actual"] for s in byp[:10]])), 1) if byp else None})
        print(f"[backfill] r{r}: {len(snap)} παίκτες, MAE {summary[-1]['mae']}")
    (OUT / "summary.json").write_text(json.dumps(summary), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
