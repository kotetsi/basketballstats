"""Σύγκριση δύο εκδόσεων του walk-forward backtest του Fantasy ΣΤΙΣ ΙΔΙΕΣ ΓΡΑΜΜΕΣ (μόνο ανάγνωση).

Όταν αλλάζουν τα δεδομένα (π.χ. νέα λήψη ιστορικών σεζόν με περισσότερους παίκτες), το συνολικό MAE δεν συγκρίνεται:
αλλάζει και το δείγμα. Εδώ κρατάμε μόνο τις γραμμές (season, round, c) που υπάρχουν και στις δύο εκδόσεις.

    python scripts/engine-same-rows.py <παλιός φάκελος perf> <νέος φάκελος perf>
    (π.χ. git worktree ή αντίγραφο του data/fantasy/perf από το main)
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

MODELS = ["pir-2stage-v2", "pir-2stage-v1", "roll10-avg", "pos-avg"]


def load(d: Path) -> pd.DataFrame:
    out = []
    for f in sorted(d.glob("pred_E*.csv.gz")):
        x = pd.read_csv(f, dtype={"c": str})
        x["season"] = f.name[5:10]
        out.append(x)
    return pd.concat(out, ignore_index=True)


def main(old_dir: str, new_dir: str) -> None:
    old, new = load(Path(old_dir)), load(Path(new_dir))
    key = ["season", "round", "c"]
    m = old.merge(new, on=key, suffixes=("_old", "_new"))
    m = m[np.isclose(m["y_pir_old"], m["y_pir_new"]) & np.isclose(m["y_min_old"], m["y_min_new"])]   # ίδιο πραγματικό αποτέλεσμα
    print(f"γραμμές: παλιό {len(old)}, νέο {len(new)}, κοινές με ίδιο αποτέλεσμα {len(m)}")
    print(f"{'μοντέλο':<16}{'στόχος':<8}{'MAE παλιό':>11}{'MAE νέο':>10}{'διαφορά':>10}")
    for mod in MODELS:
        for tgt, y in (("pir", "y_pir"), ("min", "y_min")):
            a, b = f"{mod}|{tgt}_old", f"{mod}|{tgt}_new"
            if a not in m or b not in m:
                continue
            s = m[[a, b, f"{y}_old"]].dropna()
            if not len(s):
                continue
            e0 = (s[a] - s[f"{y}_old"]).abs().mean()
            e1 = (s[b] - s[f"{y}_old"]).abs().mean()
            print(f"{mod:<16}{tgt:<8}{e0:>11.3f}{e1:>10.3f}{100 * (e0 - e1) / e0:>+9.2f}%   n={len(s)}")
    for s_ in sorted(m["season"].unique()):
        s = m[m["season"] == s_][["pir-2stage-v2|pir_old", "pir-2stage-v2|pir_new", "y_pir_old"]].dropna()
        e0 = (s.iloc[:, 0] - s.iloc[:, 2]).abs().mean(); e1 = (s.iloc[:, 1] - s.iloc[:, 2]).abs().mean()
        print(f"  {s_} pir-2stage-v2 PIR: {e0:.3f} → {e1:.3f} ({100 * (e0 - e1) / e0:+.2f}%), n={len(s)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
