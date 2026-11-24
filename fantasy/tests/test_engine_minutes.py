import json
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from run import apply_engine_minutes  # noqa: E402


def pred():
    return pd.DataFrame({"c": ["A", "B"], "proj_min": [20.0, 10.0], "proj_pirpm": [0.5, 0.4], "proj_pir": [10.0, 4.0],
                         "p10": [3.0, 0.0], "p50": [10.0, 4.0], "p90": [18.0, 9.0]})


class EngineMinutes(unittest.TestCase):
    def write(self, d):
        f = Path(tempfile.mkdtemp()) / "minutes.json"
        f.write_text(json.dumps(d), encoding="utf-8")
        return f

    def test_applies_minutes_and_shifts_quantiles(self):
        f = self.write({"model": "min-hurdle-x2", "season": "E2026", "round": 14, "players": {"A": {"min_exp": 24.0}}})
        out, info = apply_engine_minutes(pred(), 14, "E2026", f)
        a = out.iloc[0]
        self.assertEqual(a["proj_min"], 24.0)
        self.assertAlmostEqual(a["proj_pir"], 12.0)                  # PIR/λεπτό × λεπτά engine
        self.assertAlmostEqual(a["p10"], 5.0)                        # +2 μετατόπιση, ίδιο εύρος
        self.assertAlmostEqual(a["p90"] - a["p10"], 15.0)
        b = out.iloc[1]
        self.assertEqual((b["proj_min"], b["proj_pir"]), (10.0, 4.0))   # χωρίς engine λεπτά: ίδιο με πριν
        self.assertEqual(info["n"], 1)

    def test_fallback_when_missing_or_other_round(self):
        out, info = apply_engine_minutes(pred(), 14, "E2026", Path(tempfile.mkdtemp()) / "none.json")
        self.assertIsNone(info)
        self.assertTrue(out.equals(pred()))
        f = self.write({"model": "x", "season": "E2026", "round": 13, "players": {"A": {"min_exp": 30.0}}})
        out, info = apply_engine_minutes(pred(), 14, "E2026", f)
        self.assertIsNone(info)
        self.assertEqual(out.iloc[0]["proj_min"], 20.0)


if __name__ == "__main__":
    unittest.main()
