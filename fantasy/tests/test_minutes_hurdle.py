import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "perf"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import minutes_hurdle as H  # noqa: E402


def row(rnd, secs):
    r = [0] * 26
    r[0], r[7] = rnd, secs
    return r


class MinutesHurdle(unittest.TestCase):
    def cache(self):
        games = [[r, "", "OLY", "PAN", 80, 70, 1] for r in range(1, 6)]
        # έπαιξε 20′ (r1), 0′ (r2), 30′ (r3), 10′ (r4), r5 = στόχος με 40′ (δεν πρέπει να «φανεί» πριν από το r5)
        return {"players": [{"c": "1", "g": [row(1, 1200), row(2, 0), row(3, 1800), row(4, 600), row(5, 2400)]}], "league": {"games": games}}

    def test_ew_uses_only_earlier_played_games(self):
        t = H.ew_table(self.cache())
        self.assertNotIn(("1", 1), t)                       # τίποτα πριν από την 1η αγωνιστική
        self.assertEqual(t[("1", 2)], (20.0, 1))
        self.assertEqual(t[("1", 3)], (20.0, 1))            # το 0′ της r2 δεν μετράει στο «αν παίξει»
        prev = np.array([20.0, 30.0, 10.0])
        w = 0.5 ** (np.arange(3)[::-1] / H.EW_HALF)
        ew, n = t[("1", 5)]
        self.assertAlmostEqual(ew, float(np.dot(w, prev) / w.sum()))
        self.assertEqual(n, 3)
        self.assertLess(ew, 40)                             # τα 40′ της r5 δεν μπήκαν (χωρίς διαρροή)

    def test_cond_baseline(self):
        df = pd.DataFrame({"play_rate5": [0.5, 0.0], "m5": [10.0, 0.0], "m10": [8.0, 6.0]})
        out = H.add_cond(df)
        self.assertEqual(out["m_cond5"].tolist(), [20.0, 6.0])
        self.assertNotIn("m_cond5", df.columns)            # δεν αλλάζει την είσοδο


if __name__ == "__main__":
    unittest.main()
