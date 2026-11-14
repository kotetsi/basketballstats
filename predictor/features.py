"""Feature engineering για τον Game Predictor.

Πηγή: data/pbp/<σεζόν>/<αγώνας>.json (box score ομάδων + ποιοι αγωνίστηκαν), από το scripts/pbp.mjs.
Κανόνας: τα features κάθε αγώνα χτίζονται ΜΟΝΟ από αγώνες με ημερομηνία πριν από αυτόν (χωρίς leakage).
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

SK = ['pts', 'fgm2', 'fga2', 'fgm3', 'fga3', 'ftm', 'fta', 'oreb', 'dreb', 'tov', 'ast', 'stl', 'blk', 'pf']
I = {k: i for i, k in enumerate(SK)}

HALF_LIFE = 8        # αγώνες: ημιζωή της εκθετικής στάθμισης
PRIOR_GAMES = 6      # πόσους «αγώνες» αξίζει η προηγούμενη σεζόν στην αρχή της νέας
ELO_K, ELO_HOME, ELO_CARRY = 20.0, 60.0, 0.75
# Ridge ratings επίθεσης/άμυνας με διόρθωση για τον αντίπαλο (πόντοι = μ + έδρα/2 + επίθεση + άμυνα αντιπάλου).
# Prior: RIDGE_REG × τα τελικά ratings της προηγούμενης σεζόν, με βάρος RIDGE_LAM «αγώνων». Ελεγμένο σε 3 σεζόν EuroLeague.
RIDGE_REG, RIDGE_LAM, RIDGE_HOME = 0.75, 8.0, 3.0


# ---------- βασικοί δείκτες
def possessions(s) -> float:
    return s[I['fga2']] + s[I['fga3']] - s[I['oreb']] + s[I['tov']] + 0.44 * s[I['fta']]


def _div(a, b):
    return a / b if b else None


def rates(own, opp, secs: float) -> dict:
    """ORtg/DRtg/Net/Pace και Four Factors από αθροισμένα στατιστικά."""
    p = (possessions(own) + possessions(opp)) / 2
    fga, ofga = own[I['fga2']] + own[I['fga3']], opp[I['fga2']] + opp[I['fga3']]
    fgm, ofgm = own[I['fgm2']] + own[I['fgm3']], opp[I['fgm2']] + opp[I['fgm3']]
    r = {
        'poss': p,
        'ortg': _div(100 * own[I['pts']], p), 'drtg': _div(100 * opp[I['pts']], p),
        'pace': _div(p * 40 * 60, secs) if secs else None,
        'efg': _div(fgm + 0.5 * own[I['fgm3']], fga), 'oefg': _div(ofgm + 0.5 * opp[I['fgm3']], ofga),
        'ts': _div(own[I['pts']], 2 * (fga + 0.44 * own[I['fta']])),
        'ast': _div(own[I['ast']], fgm),
        'tov': _div(own[I['tov']], p), 'otov': _div(opp[I['tov']], p),
        'oreb': _div(own[I['oreb']], own[I['oreb']] + opp[I['dreb']]), 'dreb': _div(own[I['dreb']], own[I['dreb']] + opp[I['oreb']]),
        'ftr': _div(own[I['fta']], fga), 'oftr': _div(opp[I['fta']], ofga),
    }
    r['net'] = r['ortg'] - r['drtg'] if r['ortg'] is not None and r['drtg'] is not None else None
    return r


RATE_KEYS = ['ortg', 'drtg', 'net', 'pace', 'efg', 'oefg', 'ts', 'ast', 'tov', 'otov', 'oreb', 'dreb', 'ftr', 'oftr']


# ---------- φόρτωση αγώνων
@dataclass
class Game:
    season: str
    gc: int
    d: str
    ph: str
    h: str
    a: str
    hs: int
    as_: int
    secs: float
    box: dict
    played: dict = field(default_factory=dict)   # ομάδα → {παίκτης: λεπτά}

    @property
    def key(self):
        return f'{self.season}_{self.gc}'


def load_games(root: Path, seasons=None) -> list[Game]:
    out = []
    base = root / 'data' / 'pbp'
    if not base.exists():
        return out
    for sd in sorted(base.iterdir()):
        if not sd.is_dir() or (seasons and sd.name not in seasons):
            continue
        for f in sd.glob('*.json'):
            try:
                g = json.loads(f.read_text())
            except Exception:
                continue
            if g.get('hs') is None or g.get('as') is None or not g.get('box'):
                continue
            played = defaultdict(dict)
            for pid, v in (g.get('pl') or {}).items():
                if v[2] > 0:
                    played[v[1]][pid.strip().lstrip('P')] = v[2] / 60
            out.append(Game(sd.name, int(g['gc']), g.get('d') or '', g.get('ph') or 'RS', g['h'], g['a'], int(g['hs']), int(g['as']),
                            float(g.get('secs') or 2400), g['box'], dict(played)))
    out.sort(key=lambda x: (x.d, x.season, x.gc))
    return out


def days(a: str, b: str) -> int:
    return (date.fromisoformat(b[:10]) - date.fromisoformat(a[:10])).days


# ---------- κατάσταση ομάδας που ενημερώνεται αγώνα-αγώνα
class TeamState:
    def __init__(self):
        self.hist = []        # [(date, own, opp, secs, home, opp_team, margin)]
        self.prior = None     # rates προηγούμενης σεζόν
        self.mins = defaultdict(list)  # παίκτης → λεπτά ανά αγώνα (με σειρά)

    def agg(self, pred=lambda h: True, weighted=True, last=None):
        rows = [h for h in self.hist if pred(h)]
        if last:
            rows = rows[-last:]
        if not rows:
            return None, 0
        own, opp, secs, wsum = [0.0] * len(SK), [0.0] * len(SK), 0.0, 0.0
        n = len(rows)
        for i, h in enumerate(rows):
            w = 0.5 ** ((n - 1 - i) / HALF_LIFE) if weighted else 1.0
            for k in range(len(SK)):
                own[k] += w * h[1][k]
                opp[k] += w * h[2][k]
            secs += w * h[3]
            wsum += w
        return rates(own, opp, secs), n

    def features(self, league_avg: dict) -> dict:
        cur, n = self.agg()
        f = {'n_games': n}
        prior = self.prior or league_avg
        for k in RATE_KEYS:
            c = cur.get(k) if cur else None
            p = prior.get(k) if prior else None
            if c is None and p is None:
                f[k] = None
            elif c is None:
                f[k] = p
            elif p is None:
                f[k] = c
            else:   # shrinkage προς την προηγούμενη σεζόν όσο το δείγμα είναι μικρό
                w = n / (n + PRIOR_GAMES)
                f[k] = w * c + (1 - w) * p
        for L in (5, 10):
            r, m = self.agg(weighted=False, last=L)
            f[f'net_l{L}'] = r['net'] if r else f.get('net')
            f[f'win_l{L}'] = sum(1 for h in self.hist[-L:] if h[6] > 0) / m if m else 0.5
        rh, nh = self.agg(lambda h: h[4])
        ra, na = self.agg(lambda h: not h[4])
        base = f.get('net') or 0.0
        f['net_home'] = (rh['net'] * nh + base * 3) / (nh + 3) if rh else base
        f['net_away'] = (ra['net'] * na + base * 3) / (na + 3) if ra else base
        return f

    def last_date(self):
        return self.hist[-1][0] if self.hist else None

    def recent_minutes(self, k=3):
        """Μέσος όρος λεπτών κάθε παίκτη στους τελευταίους k αγώνες της ομάδας."""
        out = {}
        for pid, ms in self.mins.items():
            tail = ms[-k:]
            if tail and any(m > 0 for m in tail):
                out[pid] = sum(tail) / k
        return out


class Elo:
    def __init__(self):
        self.r = defaultdict(lambda: 1500.0)

    def expect(self, h, a, home=True):
        return 1 / (1 + 10 ** (-(self.r[h] + (ELO_HOME if home else 0) - self.r[a]) / 400))

    def update(self, h, a, margin):
        e = self.expect(h, a)
        s = 1.0 if margin > 0 else 0.0
        mult = math.log(abs(margin) + 1) * 2.2 / ((self.r[h] - self.r[a]) * 0.001 + 2.2)
        d = ELO_K * mult * (s - e)
        self.r[h] += d
        self.r[a] -= d

    def new_season(self):
        for t in list(self.r):
            self.r[t] = 1500 + ELO_CARRY * (self.r[t] - 1500)


def matchup_row(H: TeamState, A: TeamState, fH: dict, fA: dict, elo: Elo, h: str, a: str, d: str, sos: dict,
                absH: float, absA: float, neutral=False) -> dict:
    row = {}
    for k, v in fH.items():
        row['h_' + k] = v
    for k, v in fA.items():
        row['a_' + k] = v
    for k in RATE_KEYS + ['net_l5', 'net_l10']:
        if fH.get(k) is not None and fA.get(k) is not None:
            row['d_' + k] = fH[k] - fA[k]
    # αναμενόμενα ratings του αγώνα: επίθεση της μίας απέναντι στην άμυνα της άλλης
    if None not in (fH.get('ortg'), fA.get('drtg'), fA.get('ortg'), fH.get('drtg'), fH.get('pace'), fA.get('pace')):
        row['x_h_rtg'] = (fH['ortg'] + fA['drtg']) / 2
        row['x_a_rtg'] = (fA['ortg'] + fH['drtg']) / 2
        row['x_pace'] = (fH['pace'] + fA['pace']) / 2
        row['x_margin'] = (row['x_h_rtg'] - row['x_a_rtg']) * row['x_pace'] / 100
        row['x_total'] = (row['x_h_rtg'] + row['x_a_rtg']) * row['x_pace'] / 100
    row['home'] = 0 if neutral else 1
    lh, la = H.last_date(), A.last_date()
    row['h_rest'] = min(days(lh, d), 10) if lh else 7
    row['a_rest'] = min(days(la, d), 10) if la else 7
    row['h_b2b'] = int(row['h_rest'] <= 1)
    row['a_b2b'] = int(row['a_rest'] <= 1)
    row['d_rest'] = row['h_rest'] - row['a_rest']
    row['h_sos'], row['a_sos'] = sos.get(h, 0.0), sos.get(a, 0.0)
    row['elo_h'], row['elo_a'] = elo.r[h], elo.r[a]
    row['elo_p'] = elo.expect(h, a, home=not neutral)
    row['h_absent'], row['a_absent'] = absH, absA
    row['d_absent'] = absH - absA
    return row


def ridge_fit(results, prior=None, mu_prior=None):
    """results: [(h, a, hs, as, neutral)]. Επιστρέφει (μ, {ομάδα: (o, d)})."""
    import numpy as np
    teams = sorted({t for r in results for t in r[:2]} | set(prior or {}))
    if not teams:
        return mu_prior or 80.0, {}
    ix = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    pts = [x for r in results for x in r[2:4]]
    mu0 = mu_prior if mu_prior is not None else (sum(pts) / len(pts) if pts else 80.0)
    mu = (sum(pts) + 20 * mu0) / (len(pts) + 20) if pts else mu0
    A, y = [], []
    for h, a, hs, as_, neu in results:
        ha = 0.0 if neu else RIDGE_HOME / 2
        r1 = np.zeros(2 * n); r1[ix[h]] = 1; r1[n + ix[a]] = 1
        r2 = np.zeros(2 * n); r2[ix[a]] = 1; r2[n + ix[h]] = 1
        A += [r1, r2]; y += [hs - mu - ha, as_ - mu + ha]
    w = math.sqrt(RIDGE_LAM)
    for t in teams:
        po, pd = (prior or {}).get(t, (0.0, 0.0))
        r = np.zeros(2 * n); r[ix[t]] = w; A.append(r); y.append(w * RIDGE_REG * po)
        r = np.zeros(2 * n); r[n + ix[t]] = w; A.append(r); y.append(w * RIDGE_REG * pd)
    # άθροισμα μηδέν (επίθεση και άμυνα) ώστε το μ να είναι ο μέσος όρος
    for off in (0, n):
        r = np.zeros(2 * n); r[off:off + n] = 10; A.append(r); y.append(0.0)
    x = np.linalg.lstsq(np.array(A), np.array(y), rcond=None)[0]
    return mu, {t: (float(x[ix[t]]), float(x[n + ix[t]])) for t in teams}


def absent_share(T: TeamState, played_now: set | None, unavailable: set | None = None) -> float:
    """Ποσοστό των πρόσφατων λεπτών της ομάδας που λείπουν σε αυτόν τον αγώνα."""
    rm = T.recent_minutes()
    tot = sum(rm.values())
    if not tot:
        return 0.0
    if played_now is not None:
        miss = sum(m for p, m in rm.items() if p not in played_now)
    else:
        miss = sum(m for p, m in rm.items() if unavailable and p in unavailable)
    return miss / tot


class Builder:
    """Περνά τους αγώνες με χρονολογική σειρά και βγάζει μία γραμμή features ανά αγώνα (πριν τον αγώνα)."""

    def __init__(self):
        self.teams: dict[tuple, TeamState] = {}
        self.elo = {'E': Elo(), 'U': Elo()}
        self.season_of = {}
        self.last_season = {}
        self.results = defaultdict(list)     # σεζόν → [(h, a, hs, as, neutral)]
        self.ridge_prior = {}                # σεζόν → (μ, ratings) της προηγούμενης σεζόν
        self._ridge_cache = {}

    def state(self, season, team):
        k = (season, team)
        if k not in self.teams:
            T = TeamState()
            prev = self.last_season.get((season[0], team))
            if prev:
                pr, n = self.teams[(prev, team)].agg(weighted=False)
                T.prior = pr if n >= 10 else None
            self.teams[k] = T
        return self.teams[k]

    def league_avg(self, season):
        vals = defaultdict(list)
        for (s, t), T in self.teams.items():
            if s != season:
                continue
            r, n = T.agg(weighted=False)
            if r and n >= 3:
                for k in RATE_KEYS:
                    if r.get(k) is not None:
                        vals[k].append(r[k])
        return {k: sum(v) / len(v) for k, v in vals.items()} if vals else {}

    def sos(self, season):
        """Strength of schedule: μέσο Net Rating (σεζόν μέχρι τώρα) των αντιπάλων που έχει ήδη αντιμετωπίσει."""
        nets = {}
        for (s, t), T in self.teams.items():
            if s == season:
                r, n = T.agg(weighted=False)
                nets[t] = r['net'] if r and n else 0.0
        out = {}
        for (s, t), T in self.teams.items():
            if s == season and T.hist:
                out[t] = sum(nets.get(h[5], 0.0) for h in T.hist) / len(T.hist)
        return out

    def _season_start(self, season):
        comp = season[0]
        if self.season_of.get(comp) != season:
            if comp in self.season_of:
                prev = self.season_of[comp]
                self.last_season_map(comp, prev)
                pm, pr = ridge_fit(self.results[prev], self.ridge_prior.get(prev, (None, None))[1], self.ridge_prior.get(prev, (None, None))[0])
                self.ridge_prior[season] = (pm, pr)
                self.elo[comp].new_season()
            self.season_of[comp] = season

    def last_season_map(self, comp, prev):
        for (s, t) in list(self.teams):
            if s == prev:
                self.last_season[(comp, t)] = prev

    def features_for(self, season, h, a, d, played_h=None, played_a=None, unavailable=None, neutral=False):
        self._season_start(season)
        H, A = self.state(season, h), self.state(season, a)
        la = self.league_avg(season)
        fH, fA = H.features(la), A.features(la)
        sos = self.sos(season)
        absH = absent_share(H, played_h, unavailable)
        absA = absent_share(A, played_a, unavailable)
        row = matchup_row(H, A, fH, fA, self.elo[season[0]], h, a, d, sos, absH, absA, neutral)
        key = (season, len(self.results[season]))
        if key not in self._ridge_cache:
            pm, pr = self.ridge_prior.get(season, (None, None))
            self._ridge_cache[key] = ridge_fit(self.results[season], pr, pm)
        mu, R = self._ridge_cache[key]
        oh, dh = R.get(h, (0.0, 0.0))
        oa, da = R.get(a, (0.0, 0.0))
        row['x_rmargin'] = (0.0 if neutral else RIDGE_HOME) + oh + da - oa - dh
        row['x_rtotal'] = 2 * mu + oh + da + oa + dh
        row['h_ro'], row['h_rd'], row['a_ro'], row['a_rd'] = oh, dh, oa, da
        return row

    def add_result(self, g: Game):
        H, A = self.state(g.season, g.h), self.state(g.season, g.a)
        bh, ba = g.box[g.h], g.box[g.a]
        H.hist.append((g.d, bh, ba, g.secs, True, g.a, g.hs - g.as_))
        A.hist.append((g.d, ba, bh, g.secs, False, g.h, g.as_ - g.hs))
        for T, tm in ((H, g.h), (A, g.a)):
            pl = g.played.get(tm, {})
            for pid in set(T.mins) | set(pl):
                T.mins[pid].append(pl.get(pid, 0.0))
        self.elo[g.season[0]].update(g.h, g.a, g.hs - g.as_)
        self.results[g.season].append((g.h, g.a, g.hs, g.as_, g.ph == 'FF'))


def build_dataset(games: list[Game]):
    """Γραμμές εκπαίδευσης: features πριν από κάθε αγώνα + στόχοι."""
    B = Builder()
    rows = []
    for g in games:
        f = B.features_for(g.season, g.h, g.a, g.d, set(g.played.get(g.h, {})), set(g.played.get(g.a, {})), neutral=g.ph == 'FF')
        bh, ba = g.box[g.h], g.box[g.a]
        poss = (possessions(bh) + possessions(ba)) / 2
        f.update({'_key': g.key, '_season': g.season, '_d': g.d, '_h': g.h, '_a': g.a,
                  'y_win': int(g.hs > g.as_), 'y_hs': g.hs, 'y_as': g.as_, 'y_margin': g.hs - g.as_, 'y_total': g.hs + g.as_,
                  'y_poss': poss * 2400 / g.secs})
        rows.append(f)
        B.add_result(g)
    return rows, B
