"""Walk-forward έλεγχος του μοιράσματος λεπτών (fantasy/vacated.py).

Για κάθε αγωνιστική: εκπαίδευση μόνο με ό,τι υπήρχε πριν, εκτίμηση της αγωνιστικής, και μετά «ξέρουμε» ποιοι
βασικοί έλειψαν (όπως θα το ήξερε η λίστα τραυματιών) και μοιράζουμε τα λεπτά τους. Σύγκριση σφάλματος με/χωρίς.
    python3 fantasy/vac_backtest.py
"""
from __future__ import annotations

import json
import pickle
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import features2 as F2  # noqa: E402
from features import SECS  # noqa: E402
from model import PirModel  # noqa: E402
import vacated as V  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ALPHAS = [0.0, 0.25, 0.5, 0.75, 1.0]


def load():
    caches = {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in sorted((ROOT / "data" / "fantasy" / "hist").glob("E*.json"))}
    caches["E2026"] = json.loads((ROOT / "data" / "cache.json").read_text(encoding="utf-8"))
    return caches


def absences(cache, rows_r, r):
    """όσοι έλειψαν στην αγωνιστική r ενώ ήταν βασικά κομμάτια της rotation: λεπτά όταν παίζουν, ποσοστό απουσιών στα 5 τελευταία"""
    games = cache["league"]["games"]
    pl = {p["c"]: p for p in cache["players"]}
    info = {}
    for _, x in rows_r.iterrows():
        g = pl[x["c"]]["g"]
        played = [z for z in g if z[0] < r and z[SECS] > 0][-5:]
        mplay = float(np.mean([z[SECS] / 60 for z in played])) if played else 0.0
        tg = sorted({gg[0] for gg in games if gg[6] and gg[0] < r and x["team"] in (gg[2], gg[3])})[-5:]
        have = {z[0] for z in g if z[SECS] > 0}
        miss5 = (sum(1 for t in tg if t not in have) / len(tg)) if tg else 0.0
        out = x["y_min"] == 0 and mplay >= 10 and len(played) >= 3 and miss5 <= 0.4
        info[x["c"]] = (out, mplay, miss5)
    return info


def main():
    t0 = time.time()
    caches = load()
    order = sorted(caches)
    plan = {"E2026": list(range(4, 11)), "E2025": list(range(6, 35, 3))}
    recs = []
    store = []
    for s, rounds in plan.items():
        i = order.index(s)
        cache, prev = caches[s], caches[order[i - 1]]
        rows = F2.add_time_index(F2.rows_v2(cache, prev), s)
        rows = rows[~rows["is_target"]]
        pooled = F2.pooled_history(caches, s)
        for r in rounds:
            test = rows[rows["round"] == r].reset_index(drop=True)
            if not len(test):
                continue
            train = pd.concat([pooled, rows[rows["round"] < r]], ignore_index=True)
            m = PirModel().fit(train)
            pr = m.predict(test)
            info = absences(cache, test, r)
            for team, idx in test.groupby("team").groups.items():
                tp = [{"c": test.at[k, "c"], "pos": test.at[k, "pos"], "pm": float(pr.at[k, "proj_min"]), "out": info[test.at[k, "c"]][0],
                       "mplay": info[test.at[k, "c"]][1], "miss5": info[test.at[k, "c"]][2]} for k in idx]
                if not any(p["out"] for p in tp):
                    continue
                act = {test.at[k, 'c']: (float(test.at[k, 'y_pir']), float(test.at[k, 'y_min']), float(pr.at[k, 'proj_pirpm'])) for k in idx}
                plmap = {p['c']: p for p in cache['players']}
                logs = {test.at[k, 'c']: {z[0]: z[SECS] / 60 for z in plmap[test.at[k, 'c']]['g'] if z[0] < r} for k in idx}
                trounds = sorted({gg[0] for gg in cache['league']['games'] if gg[6] and gg[0] < r and team in (gg[2], gg[3])})
                store.append((s, r, tp, act, logs, trounds))
                res = {a: V.redistribute(tp, a) for a in ALPHAS}
                for k in idx:
                    c = test.at[k, "c"]
                    if info[c][0] or test.at[k, "y_min"] == 0 and pr.at[k, "proj_min"] < 3:
                        continue
                    if not res[1.0].get(c):
                        continue
                    rec = {"s": s, "r": r, "c": c, "y": float(test.at[k, "y_pir"]), "ym": float(test.at[k, "y_min"]),
                           "pm": float(pr.at[k, "proj_min"]), "ppm": float(pr.at[k, "proj_pirpm"])}
                    for a in ALPHAS:
                        g = res[a].get(c, (0.0, []))[0]
                        rec[f"m{a}"] = rec["pm"] + g
                    recs.append(rec)
            print(f"{s} r{r}: {len(recs)} affected so far ({time.time() - t0:.0f}s)", flush=True)
    pickle.dump(store, open('/tmp/vac_store.pkl', 'wb'))
    df = pd.DataFrame(recs)
    print(f"\naffected player-games: {len(df)}")
    for a in ALPHAS:
        mae_pir = np.mean(np.abs(df[f"m{a}"] * df["ppm"] - df["y"]))
        mae_min = np.mean(np.abs(df[f"m{a}"] - df["ym"]))
        bias = np.mean(df[f"m{a}"] * df["ppm"] - df["y"])
        print(f"alpha={a:<4}  MAE PIR {mae_pir:.3f}  MAE λεπτά {mae_min:.3f}  bias PIR {bias:+.3f}")
    for s in plan:
        d = df[df["s"] == s]
        if len(d):
            print(s, len(d), " ".join(f"a{a}:{np.mean(np.abs(d[f'm{a}'] * d['ppm'] - d['y'])):.3f}" for a in ALPHAS))


if __name__ == "__main__":
    main()
