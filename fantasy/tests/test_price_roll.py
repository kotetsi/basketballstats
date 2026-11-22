import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import price_roll as P  # noqa: E402

M = {"slope": 0.036, "dnp_ratio": -0.012, "floor": 4.0, "win_bonus": 0.1}


def row(pir, my=80, op=70, secs=1500):
    r = [0] * 26
    r[P.MY], r[P.OP], r[P.SECS], r[P.PIR] = my, op, secs, pir
    return r


class PriceRoll(unittest.TestCase):
    def test_win_bonus_and_rounding(self):
        # νίκη: FP = 20 × 1,1 = 22 → 0,036 × (22 − 10) = 0,432 → +0,4
        self.assertEqual(P.step(10.0, row(20), M), 10.4)
        # ήττα: FP = 20 → 0,036 × 10 = 0,36 → +0,4
        self.assertEqual(P.step(10.0, row(20, my=60), M), 10.4)
        self.assertEqual(P.step(15.0, row(5, my=60), M), 14.6)

    def test_dnp_and_floor(self):
        self.assertEqual(P.step(10.0, None, M), 9.9)
        self.assertEqual(P.step(10.0, row(0, secs=0), M), 9.9)
        self.assertEqual(P.step(4.0, None, M), 4.0)
        self.assertEqual(P.step(4.1, row(-5), M), 4.0)

    def test_backtest_on_official_files(self):
        import json
        cache = json.loads((P.ROOT / "data" / "cache.json").read_text(encoding="utf-8"))
        for r in P.check(cache):
            self.assertLess(r["mae"], 0.1, r)
            self.assertLess(r["mae"], r["mae_no_change"], r)


if __name__ == "__main__":
    unittest.main()
