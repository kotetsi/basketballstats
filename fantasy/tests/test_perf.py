"""Unit tests για το Fantasy Model Performance & Backtesting:  python -m unittest fantasy/tests/test_perf.py"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "perf"))
from backtest import time_split  # noqa: E402
from calibration import bucket_calibration, quantile_calibration  # noqa: E402
from captain import captain_eval  # noqa: E402
from compare import compare_models, previous_version, rollback  # noqa: E402
from drift import detect, rolling, round_series  # noqa: E402
from metrics import by_group, error_metrics, interval_metrics  # noqa: E402


def frame(n_rounds=12, per=40, noise=4.0, seed=1, models=("m1", "m2"), drift_from=None):
    R = np.random.default_rng(seed)
    rows = []
    for r in range(1, n_rounds + 1):
        for i in range(per):
            true = R.uniform(0, 20)
            y = true + R.normal(0, noise * (2.5 if drift_from and r >= drift_from else 1))
            row = {"season": "E9999", "round": r, "c": f"p{i}", "team": f"T{i % 8}", "pos": ["Guard", "Forward", "Center"][i % 3], "pir10": true + R.normal(0, 2),
                   "y_pir": y, "y_min": 20.0, "pwin": 0.5, "won": int(R.random() < 0.5), "exp_starter": int(i % 2 == 0), "n_played": 5}
            row["actual_fp"] = y * (1.1 if row["won"] else 1)
            for k, m in enumerate(models):
                p = true + (0 if k == 0 else R.normal(0, 3))
                row.update({f"{m}|pir": p, f"{m}|p10": p - 1.2816 * noise, f"{m}|p50": p, f"{m}|p90": p + 1.2816 * noise, f"{m}|fp": p * 1.05, f"{m}|min": 20.0})
            rows.append(row)
    return pd.DataFrame(rows)


class TestSplit(unittest.TestCase):
    def test_no_leakage(self):
        rows = pd.DataFrame({"round": [1, 2, 3, 4, 4, 5], "is_target": [False] * 6, "y_pir": range(6)})
        tr, te = time_split(rows, 4)
        self.assertTrue((tr["round"] < 4).all())
        self.assertTrue((te["round"] == 4).all())
        self.assertEqual(len(te), 2)
        self.assertNotIn(5, tr["round"].tolist())

    def test_target_rows_excluded(self):
        rows = pd.DataFrame({"round": [1, 2, 3], "is_target": [False, False, True], "y_pir": [1, 2, None]})
        tr, te = time_split(rows, 3)
        self.assertEqual(len(te), 0)
        self.assertEqual(len(tr), 2)


class TestMetrics(unittest.TestCase):
    def test_known_values(self):
        a = np.array([10, 0, 5, 20] * 10, float)
        p = np.array([8, 2, 5, 16] * 10, float)
        m = error_metrics(a, p)
        self.assertAlmostEqual(m["mae"], 2.0)
        self.assertAlmostEqual(m["rmse"], round(float(np.sqrt((4 + 4 + 0 + 16) / 4)), 3))
        self.assertAlmostEqual(m["medae"], 2.0)
        self.assertAlmostEqual(m["bias"], 1.0)
        self.assertGreater(m["corr"], 0.95)
        # MAPE μόνο όπου |actual| >= 5: (2/10 + 0/5 + 4/20)/3
        self.assertAlmostEqual(m["mape"], round(100 * (0.2 + 0 + 0.2) / 3, 1))

    def test_small_groups_hidden(self):
        m = error_metrics([1, 2, 3], [1, 2, 3])
        self.assertTrue(m["hidden"])
        self.assertNotIn("mae", m)
        df = pd.DataFrame({"g": ["a"] * 40 + ["b"] * 5, "y": np.arange(45.0), "p": np.arange(45.0) + 1})
        res = {x["group"]: x for x in by_group(df, "g", "y", "p")}
        self.assertFalse(res["a"]["hidden"])
        self.assertTrue(res["b"]["hidden"])
        self.assertEqual(res["b"]["n"], 5)

    def test_directional_and_ou(self):
        line = np.full(60, 10.0)
        p = np.r_[np.full(30, 13.0), np.full(30, 7.0)]
        a = np.r_[np.full(30, 15.0), np.full(30, 12.0)]   # πάνω: σωστό, κάτω: λάθος
        m = error_metrics(a, p, line)
        self.assertAlmostEqual(m["directional"], 0.5)
        self.assertAlmostEqual(m["ou_hit"], 0.5)

    def test_interval(self):
        a = np.arange(100.0)
        m = interval_metrics(a, np.full(100, 10.0), np.full(100, 89.0))
        self.assertAlmostEqual(m["coverage_80"], 0.8)
        self.assertAlmostEqual(m["floor_hit"], 0.9)
        self.assertAlmostEqual(m["ceiling_hit"], 0.11)


class TestCalibration(unittest.TestCase):
    def test_perfect_normal_is_calibrated(self):
        R = np.random.default_rng(3)
        mu = R.uniform(0, 20, 5000)
        y = mu + R.normal(0, 5, 5000)
        q = quantile_calibration(y, mu - 1.2816 * 5, mu, mu + 1.2816 * 5)
        self.assertLess(abs(q["below_p10"] - 0.1), 0.02)
        self.assertLess(abs(q["below_p90"] - 0.9), 0.02)
        self.assertLess(q["ece"], 0.02)

    def test_overconfident_detected(self):
        R = np.random.default_rng(4)
        mu = R.uniform(0, 20, 3000)
        y = mu + R.normal(0, 8, 3000)
        q = quantile_calibration(y, mu - 1.2816 * 3, mu, mu + 1.2816 * 3)
        self.assertGreater(q["ece"], 0.1)

    def test_bucket(self):
        p = np.r_[np.full(50, 3.0), np.full(50, 12.0)]
        a = np.r_[np.full(50, 4.0), np.full(50, 10.0)]
        b = {x["bucket"]: x for x in bucket_calibration(a, p)}
        self.assertAlmostEqual(b["0–5"]["gap"], 1.0)
        self.assertAlmostEqual(b["10–15"]["gap"], -2.0)
        self.assertTrue(b["20–25"]["hidden"])


class TestCaptain(unittest.TestCase):
    def test_best_and_rank(self):
        rows = []
        for r in range(1, 4):
            for i in range(10):
                rows.append({"season": "S", "round": r, "c": f"p{i}", "exp_starter": 1, "n_played": 5, "m|fp": float(i), "m|p10": i - 3.0, "m|p90": i + 3.0,
                             "y_pir": float(i if r != 3 else 9 - i), "actual_fp": float(i if r != 3 else 9 - i)})
        res = captain_eval(pd.DataFrame(rows), "m", "mean")
        picks = {p["round"]: p for p in res["picks"]}
        self.assertEqual(picks[1]["c"], "p9")
        self.assertEqual(picks[1]["rank"], 1)
        self.assertEqual(picks[1]["best"], 1)
        self.assertEqual(picks[3]["rank"], 10)          # η πρόταση ήταν τελευταία
        self.assertEqual(picks[3]["missed"], 18.0)      # 2×9 − 2×0
        self.assertEqual(picks[3]["top10"], 1)
        self.assertEqual(picks[3]["top5"], 0)
        self.assertAlmostEqual(res["best_rate"], round(2 / 3, 3))
        self.assertTrue(res["hidden"])                  # n=3 < 30

    def test_upside_rule_prefers_ceiling(self):
        # ίδιο αναμενόμενο, ο B έχει μεγαλύτερο εύρος: με τον κανόνα upside γίνεται αρχηγός
        rows = [{"season": "S", "round": 1, "c": c, "exp_starter": 1, "n_played": 5, "pwin": 0.5, "m|pir": 15.0, "m|fp": 15.75, "m|p10": 15 - w, "m|p90": 15 + w,
                 "y_pir": y, "actual_fp": y} for c, w, y in (("A", 3.0, 10.0), ("B", 10.0, 30.0))]
        self.assertEqual(captain_eval(pd.DataFrame(rows), "m", "upside")["picks"][0]["c"], "B")


class TestCompare(unittest.TestCase):
    def test_better_model_wins(self):
        df = frame()
        res = {x["model"]: x for x in compare_models(df, ["m1", "m2"])}
        self.assertLess(res["m1"]["mae"], res["m2"]["mae"])
        self.assertTrue(res["m1"]["best"])
        self.assertEqual(res["m1"]["n"], res["m2"]["n"])   # ίδιες γραμμές

    def test_registry_and_rollback(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "models.json"
            p.write_text(json.dumps({"active": "b", "versions": [{"id": "a"}, {"id": "b"}], "history": [{"action": "activate", "to": "a"}, {"action": "activate", "to": "b"}]}))
            from compare import load_registry
            self.assertEqual(previous_version(load_registry(p)), "a")
            reg = rollback("a", "χειρότερο", path=p)
            self.assertEqual(reg["active"], "a")
            self.assertEqual(json.loads(p.read_text())["history"][-1]["action"], "rollback")
            with self.assertRaises(ValueError):
                rollback("zzz", path=p)


class TestDrift(unittest.TestCase):
    def test_rolling(self):
        s = [{"season": "S", "round": r, "n": 10, "mae": float(r)} for r in range(1, 7)]
        r5 = rolling(s, 5)
        self.assertAlmostEqual(r5[-1]["mae"], 4.0)       # (2+3+4+5+6)/5
        self.assertEqual(r5[-1]["n"], 50)

    def test_mae_rise_alert(self):
        df = frame(n_rounds=16, per=40, drift_from=12)
        kinds = {a["k"] for a in detect(df, "m1")}
        self.assertIn("mae_up", kinds)
        self.assertIn("calibration", kinds)

    def test_no_alert_when_stable(self):
        df = frame(n_rounds=16, per=40)
        kinds = {a["k"] for a in detect(df, "m1")}
        self.assertNotIn("mae_up", kinds)

    def test_new_model_worse(self):
        df = frame(n_rounds=8)
        kinds = {a["k"]: a for a in detect(df, "m2", prev_v="m1")}
        self.assertIn("new_worse", kinds)
        self.assertEqual(kinds["new_worse"]["action"], "rollback")
        self.assertEqual(len(round_series(df, "m1")), 8)


if __name__ == "__main__":
    unittest.main()
