"""Ratings παικτών από τις πεντάδες (regularized adjusted plus-minus, RAPM) για τον Game Predictor.

Κάθε «stint» (διάστημα με ίδιες πεντάδες) του play-by-play δίνει δύο γραμμές: επίθεση της μίας πεντάδας
απέναντι στην άμυνα της άλλης. Στόχος: πόντοι ανά 100 κατοχές. Μεταβλητές: +1 για κάθε επιθετικό παίκτη
(rating επίθεσης) και +1 για κάθε αμυντικό (rating άμυνας, θετικό = δέχεται περισσότερους), συν έδρα.
Ridge (συρρίκνωση προς τον μέσο παίκτη), βάρος = κατοχές × χρονική απόσβεση, ξεχωριστά ανά διοργάνωση.

Για έναν αγώνα, η δύναμη της ομάδας = μέσος όρος των ratings των παικτών που θα αγωνιστούν, σταθμισμένος
με τα αναμενόμενα λεπτά τους (μέσος όρος των τελευταίων αγώνων που έπαιξαν). Έτσι το μοντέλο «βλέπει»
ποιοι παίζουν, όχι μόνο την ομάδα ως σύνολο.
Κανόνας: μόνο stints από αγώνες με ημερομηνία πριν από τον αγώνα που προβλέπεται.
"""
from __future__ import annotations

import os
from collections import defaultdict
from datetime import date

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import lsqr

LAMBDA = float(os.environ.get('PRED_RAPM_LAMBDA', '3000'))     # συρρίκνωση προς την αφετηρία box score (σε μονάδες κατοχών· ελεγμένο 800–6000)
HALF_LIFE_DAYS = float(os.environ.get('PRED_RAPM_HL', '240'))  # χρονική απόσβεση των stints
REFIT_EVERY = 10                                                # νέο fit κάθε τόσους νέους αγώνες
MIN_POSS = 1.0
EXP_GAMES = 5                                                   # αναμενόμενα λεπτά: μ.ο. τελευταίων αγώνων που έπαιξε

# δείκτες στο box score stint (ίδια σειρά με το SK του features.py)
_FGA2, _FGA3, _OREB, _TOV, _FTA, _PTS = 2, 4, 7, 9, 6, 0


def _poss(s):
    return s[_FGA2] + s[_FGA3] - s[_OREB] + s[_TOV] + 0.44 * s[_FTA]


def _ord(d: str) -> int:
    try:
        return date.fromisoformat(d[:10]).toordinal()
    except Exception:
        return 0


def stints_of(raw: dict) -> dict:
    """Από το data/pbp αρχείο: {ομάδα: [(πεντάδα (ids), κατοχές επίθεσης, πόντοι, πεντάδα αντιπάλου)]}."""
    ids = [str(x).strip().lstrip('P') for x in raw.get('ids') or []]
    st = raw.get('st') or {}
    teams = list(st.keys())
    if len(teams) != 2 or not ids:
        return {}
    out = {t: [] for t in teams}
    # τα stints των δύο ομάδων είναι τα ίδια χρονικά διαστήματα από τη σκοπιά της καθεμίας·
    # για την πεντάδα του αντιπάλου ταιριάζουμε με βάση το χρονικό διάστημα
    def spans(t):
        o, cur = [], 0
        for s in st[t]:
            o.append((cur, cur + s[1], s))
            cur += s[1]
        return o
    S = {t: spans(t) for t in teams}
    for t in teams:
        u = teams[1] if t == teams[0] else teams[0]
        for a0, a1, s in S[t]:
            if s[1] <= 0:
                continue
            # αντίπαλη πεντάδα με τη μεγαλύτερη επικάλυψη
            best, ov = None, 0
            for b0, b1, z in S[u]:
                o = min(a1, b1) - max(a0, b0)
                if o > ov:
                    best, ov = z, o
            if best is None:
                continue
            p = _poss(s[3])
            if p < MIN_POSS:
                continue
            try:
                off = tuple(ids[i] for i in s[0])
                dfn = tuple(ids[i] for i in best[0])
            except IndexError:
                continue
            out[t].append((off, p, s[3][_PTS], dfn))
    return out


class RAPM:
    """Ratings παικτών μίας διοργάνωσης, ενημερώνονται αγώνα-αγώνα, fit «τεμπέλικα» με cache."""

    def __init__(self, lam=LAMBDA, half_life=HALF_LIFE_DAYS):
        self.lam, self.hl = lam, half_life
        self.rows = []          # (ordinal ημερομηνίας, off ids, def ids, κατοχές, πόντοι, έδρα ±1)
        self.n_games = 0
        self._fit = None
        self._fit_n = -10 ** 9

    def add_game(self, d: str, home: str, stints: dict):
        od = _ord(d)
        for t, L in stints.items():
            hs = 1.0 if t == home else -1.0
            for off, p, pts, dfn in L:
                self.rows.append((od, off, dfn, p, pts, hs))
        self.n_games += 1

    def ratings(self, featfn=None):
        """(μ, home, {παίκτης: (o, d)}) με όσα stints έχουν προστεθεί μέχρι τώρα.
        featfn(παίκτης) → λίστα χαρακτηριστικών box score (ή None): αν δοθεί, κάθε παίκτης ξεκινά από μια
        εκτίμηση από το box score του (αντί για τον μέσο παίκτη) και οι πεντάδες τη διορθώνουν (βλ. _prior)."""
        if self._fit is not None and self.n_games - self._fit_n < REFIT_EVERY:
            return self._fit
        self._fit_n = self.n_games
        if len(self.rows) < 200:
            self._fit = (None, 0.0, {})
            return self._fit
        players = sorted({p for r in self.rows for p in r[1] + r[2]})
        ix = {p: i for i, p in enumerate(players)}
        P = len(players)
        last = max(r[0] for r in self.rows)
        R, C, V, y, w = [], [], [], [], []
        tot_pts = sum(r[4] for r in self.rows)
        tot_p = sum(r[3] for r in self.rows)
        mu = 100.0 * tot_pts / tot_p
        for k, (od, off, dfn, p, pts, hs) in enumerate(self.rows):
            for q in off:
                R.append(k); C.append(ix[q]); V.append(1.0)
            for q in dfn:
                R.append(k); C.append(P + ix[q]); V.append(1.0)
            R.append(k); C.append(2 * P); V.append(hs)
            y.append(100.0 * pts / p - mu)
            w.append(p * 0.5 ** ((last - od) / self.hl))
        sw = np.sqrt(np.array(w))
        X = csr_matrix((V, (R, C)), shape=(len(self.rows), 2 * P + 1))
        Xw = X.multiply(sw[:, None]).tocsr()
        yw = np.array(y) * sw
        solve = lambda yy: lsqr(Xw, yy, damp=float(np.sqrt(self.lam)), atol=1e-8, btol=1e-8, iter_lim=3000)[0]
        beta = solve(yw)
        if featfn is not None and PRIOR_ON:
            # 2ο βήμα: συρρίκνωση προς την εκτίμηση από το box score αντί για το 0 (b = prior + c, ridge στο c)
            exposure = np.asarray(abs(X[:, :P]).T @ np.array(w)).ravel() + np.asarray(abs(X[:, P:2 * P]).T @ np.array(w)).ravel()
            pri = self._prior(players, beta, exposure, featfn)
            if pri is not None:
                b0 = np.concatenate([pri[:, 0], pri[:, 1], [0.0]])
                beta = b0 + solve(yw - Xw @ b0)
        R_ = {p: (float(beta[ix[p]]), float(beta[P + ix[p]])) for p in players}
        self._fit = (mu, float(beta[2 * P]), R_)
        return self._fit

    @staticmethod
    def _prior(players, beta, exposure, featfn):
        """Εκτίμηση (o, d) κάθε παίκτη από το box score: γραμμική σχέση ανάμεσα στα χαρακτηριστικά box score και στο
        RAPM των παικτών με αρκετό δείγμα (μόνο με αγώνες ως τώρα, άρα χωρίς leakage)."""
        P = len(players)
        F = [featfn(p) for p in players]
        k = next((len(f) for f in F if f is not None), 0)
        if not k:
            return None
        Fm = np.array([f if f is not None else [np.nan] * k for f in F], float)
        has = ~np.isnan(Fm).any(axis=1)
        good = has & (exposure > 300)
        if good.sum() < 40:
            return None
        out = np.zeros((P, 2))
        for j, off in ((0, 0), (1, P)):
            g = _prior_fit(Fm[good], beta[off:off + P][good], np.minimum(exposure[good], 3000.0))
            out[has, j] = np.hstack([np.ones((has.sum(), 1)), Fm[has]]) @ g
        return out


PRIOR_ON = os.environ.get('PRED_RAPM_PRIOR', '1') != '0'


def _prior_fit(F, T, wts, alpha=1.0):
    """Σταθμισμένη ridge F·γ ≈ T (με σταθερό όρο)."""
    A = np.hstack([np.ones((F.shape[0], 1)), F])
    Wd = np.sqrt(wts)[:, None]
    reg = alpha * np.eye(A.shape[1]); reg[0, 0] = 0
    return np.linalg.solve((A * Wd).T @ (A * Wd) + reg, (A * Wd).T @ (T * Wd.ravel()))


def expected_minutes(mins: dict, available=None, unavailable=None, k=EXP_GAMES) -> dict:
    """Αναμενόμενα λεπτά: μέσος όρος των τελευταίων k αγώνων που έπαιξε κάθε παίκτης, μόνο για όσους
    είναι διαθέσιμοι, κλιμακωμένα ώστε το σύνολο να είναι 200 (5 θέσεις × 40′)."""
    out = {}
    for pid, ms in mins.items():
        if available is not None and pid not in available:
            continue
        if unavailable and pid in unavailable:
            continue
        played = [m for m in ms if m > 0][-k:]
        if not played:
            continue
        # όσο περισσότερους από τους πρόσφατους αγώνες έχασε, τόσο πιο αβέβαιος ο ρόλος του
        recent = ms[-k:]
        share = sum(1 for m in recent if m > 0) / max(1, len(recent))
        out[pid] = (sum(played) / len(played)) * (0.5 + 0.5 * share)
    s = sum(out.values())
    return {p: 200.0 * m / s for p, m in out.items()} if s > 0 else {}


def lineup_strength(R: dict, em: dict):
    """(επίθεση, άμυνα) πεντάδας της ομάδας = 5 × σταθμισμένος μέσος όρος των ratings με τα λεπτά."""
    if not em:
        return None, None
    tot = sum(em.values())
    o = sum(m * R.get(p, (0.0, 0.0))[0] for p, m in em.items()) / tot * 5
    d = sum(m * R.get(p, (0.0, 0.0))[1] for p, m in em.items()) / tot * 5
    return o, d
