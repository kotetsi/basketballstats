import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import market as M  # noqa: E402


class Market(unittest.TestCase):
    def test_devig_and_spread(self):
        s = M.snap({"a": {"ml": [1.5, 2.6], "spread": {"line": -5.5}}, "b": {"ml": [1.55, 2.5], "spread": {"line": -4.5}}})
        self.assertAlmostEqual(s["p"], (1 / 1.5 / (1 / 1.5 + 1 / 2.6) + 1 / 1.55 / (1 / 1.55 + 1 / 2.5)) / 2, places=6)
        self.assertEqual(s["mu"], 5.0)

    def test_margin_from_ml_only(self):
        s = M.snap({"a": {"ml": [1.91, 1.91]}})
        self.assertAlmostEqual(s["p"], 0.5)
        self.assertAlmostEqual(s["mu"], 0.0, places=3)

    def test_blend(self):
        mu, p, src = M.blend(2.0, None)
        self.assertEqual((mu, src), (2.0, "model"))
        mu, p, src = M.blend(2.0, {"mu": 6.0, "p": 0.7})
        self.assertAlmostEqual(mu, 0.3 * 2 + 0.7 * 6)
        self.assertAlmostEqual(p, 0.3 * M.ncdf(2 / 11) + 0.7 * 0.7)
        self.assertEqual(src, "blend")

    def test_bad_prices_ignored(self):
        self.assertIsNone(M.snap({"a": {"ml": [1.0, 0]}}))


if __name__ == "__main__":
    unittest.main()
