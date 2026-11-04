"""Game Predictor: LightGBM (ή HistGradientBoosting αν δεν υπάρχει το LightGBM) με time-based backtest.

Μοντέλα:
  - classifier για νίκη γηπεδούχου (+ isotonic calibration σε out-of-sample προβλέψεις)
  - regressors για margin, total και κατοχές (pace)
Το τελικό σκορ βγαίνει από margin και total, ώστε να είναι πάντα συνεπές: H = (T+M)/2, A = (T−M)/2.
"""
from __future__ import annotations

import math

import numpy as np

try:
    import lightgbm as lgb  # noqa
    ENGINE = 'lightgbm'
except Exception:  # pragma: no cover
    lgb = None
    ENGINE = 'sklearn-hgb'
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression, Ridge

# Γραμμικό «σκελετό» μοντέλο με λίγα, σταθερά features: πολύ λιγότερο overfitting σε μικρά δείγματα
LIN = ['d_net', 'd_net_l5', 'd_net_l10', 'x_margin', 'elo_h', 'elo_a', 'home', 'd_rest', 'h_b2b', 'a_b2b', 'd_absent', 'h_sos', 'a_sos']
LIN_T = ['x_total', 'x_pace', 'h_pace', 'a_pace', 'h_ortg', 'a_ortg', 'h_drtg', 'a_drtg']

MODEL_VERSION = 'mp-1.0'
TARGETS = ['y_margin', 'y_total', 'y_poss']


def feature_names(rows):
    keys = sorted({k for r in rows for k in r if not k.startswith(('_', 'y_'))})
    return keys


def matrix(rows, names):
    X = np.full((len(rows), len(names)), np.nan)
    for i, r in enumerate(rows):
        for j, k in enumerate(names):
            v = r.get(k)
            if v is not None:
                X[i, j] = v
    return X


def _clf():
    if lgb:
        return lgb.LGBMClassifier(n_estimators=250, learning_rate=0.03, num_leaves=7, min_child_samples=40,
                                  subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=5.0, verbose=-1)
    return HistGradientBoostingClassifier(max_iter=200, learning_rate=0.03, max_leaf_nodes=7, min_samples_leaf=40, l2_regularization=5.0)


def _reg():
    if lgb:
        return lgb.LGBMRegressor(n_estimators=250, learning_rate=0.03, num_leaves=7, min_child_samples=40,
                                 subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=5.0, verbose=-1)
    return HistGradientBoostingRegressor(max_iter=200, learning_rate=0.03, max_leaf_nodes=7, min_samples_leaf=40, l2_regularization=5.0)


# ---------- μετρικές
def log_loss(y, p):
    p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6)
    y = np.asarray(y, float)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def brier(y, p):
    return float(np.mean((np.asarray(p, float) - np.asarray(y, float)) ** 2))


def accuracy(y, p):
    return float(np.mean((np.asarray(p) >= 0.5) == (np.asarray(y) == 1)))


def mae(y, p):
    return float(np.mean(np.abs(np.asarray(y, float) - np.asarray(p, float))))


def rmse(y, p):
    return float(math.sqrt(np.mean((np.asarray(y, float) - np.asarray(p, float)) ** 2)))


def calibration_table(y, p, bins=10):
    """Ανά δεκάδα πιθανότητας: μέση πρόβλεψη vs πραγματικό ποσοστό νικών."""
    y, p = np.asarray(y, float), np.asarray(p, float)
    out = []
    edges = np.linspace(0, 1, bins + 1)
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi if hi < 1 else p <= hi)
        if m.sum():
            out.append({'lo': round(float(lo), 2), 'hi': round(float(hi), 2), 'n': int(m.sum()), 'pred': round(float(p[m].mean()), 3), 'obs': round(float(y[m].mean()), 3)})
    return out


def ece(y, p, bins=10):
    t = calibration_table(y, p, bins)
    n = sum(b['n'] for b in t) or 1
    return float(sum(b['n'] * abs(b['pred'] - b['obs']) for b in t) / n)


# ---------- εκπαίδευση
class Predictor:
    def __init__(self):
        self.names = None
        self.clf = None
        self.reg = {}
        self.iso = None
        self.sigma = 12.0
        self.home_adv = 3.0
        self.w_gbm = 0.35
        self.w_elo = 0.5

    def fit(self, rows, calib_rows=None, calib_pred=None):
        self.names = feature_names(rows)
        X = matrix(rows, self.names)
        y = np.array([r['y_win'] for r in rows])
        self.clf = _clf().fit(X, y)
        for t in TARGETS:
            self.reg[t] = _reg().fit(X, np.array([r[t] for r in rows], float))
        if calib_pred is not None and len(calib_pred) >= 80:
            self.iso = IsotonicRegression(out_of_bounds='clip', y_min=0.02, y_max=0.98).fit(calib_pred, [r['y_win'] for r in calib_rows])
        m = np.array([r['y_margin'] for r in rows], float)
        self.home_adv = float(np.mean(m))
        # γραμμικά μοντέλα (με τιμές που λείπουν = μέσος όρος)
        self.lin = {}
        for key, cols in (('win', LIN), ('margin', LIN), ('total', LIN_T + LIN), ('poss', LIN_T)):
            Xl = matrix(rows, cols)
            mu = np.nanmean(Xl, axis=0); mu = np.where(np.isnan(mu), 0, mu)
            sd = np.nanstd(Xl, axis=0); sd = np.where((sd == 0) | np.isnan(sd), 1, sd)
            Z = np.nan_to_num((Xl - mu) / sd)
            if key == 'win':
                mdl = LogisticRegression(C=0.3, max_iter=500).fit(Z, y)
            else:
                yy = {'margin': m, 'total': np.array([r['y_total'] for r in rows], float), 'poss': np.array([r['y_poss'] for r in rows], float)}[key]
                mdl = Ridge(alpha=20.0).fit(Z, yy)
            self.lin[key] = (cols, mu, sd, mdl)
        return self

    def _lin(self, rows, key):
        cols, mu, sd, mdl = self.lin[key]
        Z = np.nan_to_num((matrix(rows, cols) - mu) / sd)
        return mdl.predict_proba(Z)[:, 1] if key == 'win' else mdl.predict(Z)

    def predict(self, rows):
        X = matrix(rows, self.names)
        p = self.clf.predict_proba(X)[:, 1]
        if self.iso is not None:
            p = 0.5 * p + 0.5 * self.iso.predict(p)   # ήπια calibration, για να μη «σκαλώνει» σε σκαλοπάτια
        out = {}
        W = self.w_gbm  # βάρος του LightGBM στο ensemble (το υπόλοιπο στο γραμμικό μοντέλο)
        for t, k in (('y_margin', 'margin'), ('y_total', 'total'), ('y_poss', 'poss')):
            out[t] = W * self.reg[t].predict(X) + (1 - W) * self._lin(rows, k)
        p = W * p + (1 - W) * self._lin(rows, 'win')
        # συνέπεια πιθανότητας και σκορ: μέσος όρος classifier και κανονικής κατανομής γύρω από την προβλεπόμενη διαφορά
        pm = np.array([0.5 * (1 + math.erf(m / (self.sigma * math.sqrt(2)))) for m in out['y_margin']])
        elo = np.array([r.get('elo_p') if r.get('elo_p') is not None else 0.5 for r in rows])
        out['p'] = (1 - self.w_elo) * (0.5 * p + 0.5 * pm) + self.w_elo * elo
        return out


def backtest(rows, min_train=250, step=60):
    """Walk-forward: εκπαίδευση σε όλους τους προηγούμενους αγώνες, πρόβλεψη των επόμενων `step`."""
    preds = []
    i = min_train
    while i < len(rows):
        tr, te = rows[:i], rows[i:i + step]
        P = Predictor().fit(tr)
        o = P.predict(te)
        for j, r in enumerate(te):
            preds.append({'key': r['_key'], 'season': r['_season'], 'p': float(o['p'][j]), 'margin': float(o['y_margin'][j]), 'total': float(o['y_total'][j]),
                          'poss': float(o['y_poss'][j]), 'y_win': r['y_win'], 'y_margin': r['y_margin'], 'y_total': r['y_total'], 'y_poss': r['y_poss'],
                          'base_p': r.get('elo_p')})
        i += step
    return preds


def summarize(preds):
    if not preds:
        return {}
    y = [x['y_win'] for x in preds]
    p = [x['p'] for x in preds]
    s = {
        'n': len(preds), 'log_loss': log_loss(y, p), 'brier': brier(y, p), 'accuracy': accuracy(y, p), 'ece': ece(y, p),
        'margin_mae': mae([x['y_margin'] for x in preds], [x['margin'] for x in preds]),
        'margin_rmse': rmse([x['y_margin'] for x in preds], [x['margin'] for x in preds]),
        'total_mae': mae([x['y_total'] for x in preds], [x['total'] for x in preds]),
        'total_rmse': rmse([x['y_total'] for x in preds], [x['total'] for x in preds]),
        'pace_mae': mae([x['y_poss'] for x in preds], [x['poss'] for x in preds]),
        'calibration': calibration_table(y, p),
    }
    bp = [x['base_p'] for x in preds if x['base_p'] is not None]
    if len(bp) == len(preds):   # σύγκριση με σκέτο Elo
        s['elo_log_loss'], s['elo_brier'], s['elo_accuracy'] = log_loss(y, bp), brier(y, bp), accuracy(y, bp)
    return s


def confidence(p, n_h, n_a):
    """Υψηλή / Μέτρια / Χαμηλή, από την απόσταση από το 50% και το μέγεθος δείγματος."""
    e = abs(p - 0.5)
    if min(n_h, n_a) < 3:
        return 'low'
    if e >= 0.2 and min(n_h, n_a) >= 6:
        return 'high'
    if e >= 0.08:
        return 'medium'
    return 'low'
