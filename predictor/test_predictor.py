"""python -m unittest predictor/test_predictor.py"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import SK, I, possessions, rates, Game, build_dataset, TeamState, absent_share, ridge_fit  # noqa: E402
from model import log_loss, brier, accuracy, calibration_table, ece, mae, rmse, confidence, Predictor  # noqa: E402


def S(**kw):
    z = [0.0] * len(SK)
    for k, v in kw.items():
        z[I[k]] = v
    return z


class Metrics(unittest.TestCase):
    def test_possessions(self):
        self.assertAlmostEqual(possessions(S(fga2=40, fga3=25, oreb=10, tov=12, fta=20)), 75.8)

    def test_ratings_and_pace(self):
        own = S(pts=80, fgm2=20, fga2=40, fgm3=10, fga3=25, fta=20, ftm=10, oreb=10, dreb=25, tov=12, ast=18)
        opp = S(pts=70, fgm2=20, fga2=45, fgm3=6, fga3=20, fta=15, ftm=12, oreb=8, dreb=20, tov=14)
        r = rates(own, opp, 2400)
        p = ((65 - 10 + 12 + 8.8) + (65 - 8 + 14 + 6.6)) / 2
        self.assertAlmostEqual(r['ortg'], 8000 / p)
        self.assertAlmostEqual(r['drtg'], 7000 / p)
        self.assertAlmostEqual(r['net'], r['ortg'] - r['drtg'])
        self.assertAlmostEqual(r['pace'], p)                      # 40 λεπτά
        self.assertAlmostEqual(rates(own, opp, 2700)['pace'], p * 2400 / 2700)   # παράταση
        self.assertAlmostEqual(r['efg'], 35 / 65)

    def test_classification_metrics(self):
        y, p = [1, 0, 1, 1], [0.9, 0.2, 0.6, 0.4]
        self.assertAlmostEqual(brier(y, p), (0.01 + 0.04 + 0.16 + 0.36) / 4)
        self.assertAlmostEqual(accuracy(y, p), 0.75)
        self.assertLess(log_loss(y, p), log_loss(y, [0.5] * 4))
        t = calibration_table(y, p, bins=2)
        self.assertEqual(sum(b['n'] for b in t), 4)
        self.assertGreaterEqual(ece(y, p, 2), 0)
        self.assertAlmostEqual(mae([1, 2], [2, 4]), 1.5)
        self.assertAlmostEqual(rmse([0, 0], [3, 4]), (12.5) ** 0.5)

    def test_confidence(self):
        self.assertEqual(confidence(0.8, 8, 8), 'high')
        self.assertEqual(confidence(0.6, 8, 8), 'medium')
        self.assertEqual(confidence(0.52, 8, 8), 'low')
        self.assertEqual(confidence(0.9, 1, 8), 'low')


def fake_games(n=160):
    """Συνθετικό πρωτάθλημα: η ομάδα T0 είναι πολύ καλύτερη, οι υπόλοιπες ίσες."""
    import random
    rnd = random.Random(3)
    teams = [f'T{i}' for i in range(8)]
    out = []
    for i in range(n):
        h, a = rnd.sample(teams, 2)
        bh = 80 + (12 if h == 'T0' else 0) + rnd.randint(-8, 8) + 3
        ba = 80 + (12 if a == 'T0' else 0) + rnd.randint(-8, 8)
        box = lambda pts: S(pts=pts, fgm2=pts // 3, fga2=40, fgm3=6, fga3=24, ftm=10, fta=14, oreb=9, dreb=24, tov=12, ast=15)
        d = f'2025-{1 + i // 28:02d}-{1 + i % 28:02d}'
        g = Game('E2025', i + 1, d, 'RS', h, a, bh, ba, 2400, {h: box(bh), a: box(ba)},
                 {h: {f'{h}p{j}': 25 for j in range(8)}, a: {f'{a}p{j}': 25 for j in range(8)}})
        out.append(g)
    return out


class Features(unittest.TestCase):
    def test_no_leakage(self):
        games = fake_games(40)
        rows, _ = build_dataset(games)
        self.assertEqual(rows[0]['h_n_games'], 0)               # ο πρώτος αγώνας δεν βλέπει τίποτα
        # τα features ενός αγώνα δεν αλλάζουν αν αλλάξει το αποτέλεσμά του
        g2 = fake_games(40)
        g2[10].hs += 30
        g2[10].box[g2[10].h][I['pts']] += 30
        r2, _ = build_dataset(g2)
        self.assertEqual({k: v for k, v in rows[10].items() if not k.startswith('y_')}, {k: v for k, v in r2[10].items() if not k.startswith('y_')})
        self.assertNotEqual(rows[11].get('h_ortg'), None)

    def test_rest_and_b2b(self):
        rows, _ = build_dataset(fake_games(60))
        self.assertTrue(all(0 <= r['h_rest'] <= 10 for r in rows))
        self.assertTrue(all(r['h_b2b'] == int(r['h_rest'] <= 1) for r in rows))

    def test_absent_share(self):
        T = TeamState()
        for _ in range(3):
            T.mins['a'].append(30)
            T.mins['b'].append(10)
        self.assertAlmostEqual(absent_share(T, {'b'}), 0.75)
        self.assertAlmostEqual(absent_share(T, None, {'b'}), 0.25)

    def test_model_learns_strong_team(self):
        rows, B = build_dataset(fake_games(220))
        P = Predictor().fit(rows[:200])
        f_strong = B.features_for('E2025', 'T0', 'T3', '2025-12-30')
        f_weak = B.features_for('E2025', 'T3', 'T0', '2025-12-30')
        o = P.predict([f_strong, f_weak])
        self.assertGreater(o['p'][0], o['p'][1])
        self.assertGreater(o['y_margin'][0], o['y_margin'][1])


if __name__ == '__main__':
    unittest.main()


class Ridge(unittest.TestCase):
    def test_ratings_and_prior(self):
        res = [('A', 'B', 90, 70, False), ('B', 'C', 80, 80, False), ('C', 'A', 70, 90, False), ('A', 'C', 88, 72, False)]
        mu, R = ridge_fit(res)
        self.assertGreater(R['A'][0] - R['A'][1], R['C'][0] - R['C'][1])   # η A είναι η καλύτερη
        self.assertAlmostEqual(sum(o for o, d in R.values()), 0, places=6)
        mu2, _ = ridge_fit([], prior={'A': (4.0, -2.0)}, mu_prior=82.0)
        self.assertAlmostEqual(mu2, 82.0)
