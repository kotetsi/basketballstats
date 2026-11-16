"""Ratings παικτών από πεντάδες: αντιστοίχιση stints, αναμενόμενα λεπτά, RAPM σε συνθετικά δεδομένα."""
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lineups import RAPM, stints_of, expected_minutes, lineup_strength


def box(pts, poss):
    # [pts, fgm2, fga2, fgm3, fga3, ftm, fta, oreb, dreb, tov, ast, stl, blk, pf] με κατοχές ≈ poss
    return [pts, 0, poss, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]


class TestLineups(unittest.TestCase):
    def test_stints_matching(self):
        raw = {'ids': ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11'],
               'st': {'A': [[[0, 1, 2, 3, 4], 300, 0, box(10, 8), box(8, 8)], [[0, 1, 2, 3, 10], 100, 0, box(4, 3), box(2, 3)]],
                      'B': [[[5, 6, 7, 8, 9], 400, 0, box(10, 11), box(14, 11)]]}}
        S = stints_of(raw)
        self.assertEqual(S['A'][0][0], ('1', '2', '3', '4', '5'))
        self.assertEqual(S['A'][1][3], ('6', '7', '8', '9', '10'))      # αντίπαλη πεντάδα με επικάλυψη
        self.assertEqual(S['B'][0][3], ('1', '2', '3', '4', '5'))      # η μεγαλύτερη επικάλυψη (300 > 100)

    def test_expected_minutes(self):
        mins = {'a': [30, 30, 30], 'b': [20, 0, 20], 'c': [10, 10, 10], 'x': [25, 25, 25]}
        em = expected_minutes(mins, unavailable={'x'})
        self.assertAlmostEqual(sum(em.values()), 200)
        self.assertNotIn('x', em)
        self.assertGreater(em['a'], em['b'])

    def test_rapm_finds_strong_player(self):
        random.seed(3)
        R = RAPM(lam=200)
        pool_a = [f'a{i}' for i in range(8)]
        pool_b = [f'b{i}' for i in range(8)]
        for g in range(60):
            st = {'A': [], 'B': []}
            for _ in range(10):
                la, lb = tuple(random.sample(pool_a, 5)), tuple(random.sample(pool_b, 5))
                bonus = 12 if 'a0' in la else 0      # ο a0 ανεβάζει την επίθεση κατά ~12 πόντους/100
                pa = 10.0
                st['A'].append((la, pa, pa * (1.10 + bonus / 100) + random.gauss(0, 1), lb))
                st['B'].append((lb, pa, pa * 1.10 + random.gauss(0, 1), la))
            R.add_game(f'2025-10-{1 + g % 28:02d}', 'A', st)
        mu, home, PR = R.ratings()
        best = max(PR, key=lambda p: PR[p][0])
        self.assertEqual(best, 'a0')
        o, d = lineup_strength(PR, {'a0': 40, 'a1': 40, 'a2': 40, 'a3': 40, 'a4': 40})
        o2, _ = lineup_strength(PR, {'a5': 40, 'a1': 40, 'a2': 40, 'a3': 40, 'a4': 40})
        self.assertGreater(o, o2)

    def test_box_prior_features(self):
        import features
        features.BOX_HIST['E2024'] = {'001': (30.0, 25.0, 14.0, 4.0, 3.0, 15.0)}
        f = features.player_box_features('001', 'E2025', [20, 0, 30])
        self.assertEqual(f[0], 1.0)
        self.assertAlmostEqual(f[2], 36 * 15 / 25)                        # PIR ανά 36′ της προηγούμενης σεζόν
        self.assertEqual(f[6:8], [1.0, 25.0])                            # λεπτά ανά αγώνα φέτος (μόνο όσους έπαιξε)
        g = features.player_box_features('999', 'E2025', None)           # νέος παίκτης χωρίς ιστορικό
        self.assertEqual(g[:6], [0.0] * 6)
        self.assertEqual(g[6], 0.0)

    def test_prior_pulls_toward_box_score(self):
        import numpy as np
        R = RAPM(lam=5000)
        players = [f'p{i}' for i in range(50)]
        beta = np.concatenate([np.linspace(-3, 3, 50), np.zeros(50), [0.0]])
        expo = np.full(50, 1000.0)
        pri = R._prior(players, beta, expo, lambda p: [float(p[1:])])     # το box score «ξέρει» τη σειρά
        self.assertIsNotNone(pri)
        self.assertGreater(pri[-1, 0], pri[0, 0])


if __name__ == '__main__':
    unittest.main()
