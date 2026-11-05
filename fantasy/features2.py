"""Features v2 (pir-2stage-v2): ό,τι έχει το v1 και επιπλέον
  - ιστορικό προηγούμενης σεζόν του παίκτη (PIR/λεπτό, λεπτά, βασικός, ίδια ομάδα ή όχι) ως αφετηρία (prior),
  - ταξίδι (χλμ από την πόλη του προηγούμενου αγώνα της ομάδας),
  - φάουλ ανά 36 λεπτά (κίνδυνος λίγων λεπτών),
  - λεπτά συμπαικτών που έλειψαν στον προηγούμενο αγώνα της ομάδας (ευκαιρία για περισσότερα λεπτά/PIR).
Όλα είναι γνωστά πριν από τον αγώνα. Η εκπαίδευση γίνεται σε pooled δεδομένα: προηγούμενες σεζόν + οι προηγούμενες
αγωνιστικές της τρέχουσας (time-based, χωρίς πληροφορία από το μέλλον).
"""
from __future__ import annotations

import math
from collections import defaultdict

import numpy as np
import pandas as pd

import features as F
from features import FEATURES_MIN, FEATURES_PM, PIR, SECS, START, FC, POS

SHRINK_PREV = 150.0   # λεπτά «αξίας» του περσινού PIR/λεπτό (ο τρέχων μέσος όρος θέλει ~150 λεπτά για να το ξεπεράσει)
PREV_MIN_OK = 100.0   # λιγότερα από 100 λεπτά πέρσι = δεν μετράει ως prior
N_PREV_TRAIN = 2      # πόσες προηγούμενες σεζόν μπαίνουν στην εκπαίδευση

# πόλη έδρας ανά κωδικό ομάδας (για το ταξίδι). Οι ισραηλινές ομάδες έπαιξαν κατά διαστήματα αλλού: προσέγγιση.
CITY = {
    "MAD": (40.42, -3.70), "BAR": (41.39, 2.17), "BAS": (42.85, -2.67), "PAM": (39.47, -0.38), "VAL": (39.47, -0.38),
    "MIL": (45.46, 9.19), "VIR": (44.49, 11.34), "MUN": (48.14, 11.58), "BER": (52.52, 13.40), "ASV": (45.77, 4.88),
    "PRS": (48.86, 2.35), "MCO": (43.74, 7.42), "OLY": (37.94, 23.65), "PAN": (37.98, 23.73), "ULK": (40.99, 29.03),
    "IST": (41.07, 28.99), "ZAL": (54.90, 23.89), "RED": (44.79, 20.45), "PAR": (44.79, 20.45), "TEL": (32.08, 34.78),
    "HTA": (32.08, 34.78), "DUB": (25.20, 55.27), "CSK": (55.76, 37.62), "ZEN": (59.93, 30.36), "KHI": (55.89, 37.44),
    "UNK": (55.79, 49.12), "BES": (41.04, 29.01), "LYV": (45.77, 4.88),
}

FEATURES_MIN_V2 = FEATURES_MIN + ["has_prev", "prev_min", "prev_start", "prev_same_team", "n_team_games", "team_missing_min", "fouls36", "travel_km"]
FEATURES_PM_V2 = FEATURES_PM + ["has_prev", "prev_pirpm", "prev_same_team", "team_missing_min", "fouls36", "travel_km"]
FEATURES_Q_V2 = sorted(set(FEATURES_MIN_V2 + FEATURES_PM_V2))


def km(a, b):
    if a is None or b is None:
        return float("nan")
    (la1, lo1), (la2, lo2) = a, b
    p = math.pi / 180
    h = math.sin((la2 - la1) * p / 2) ** 2 + math.cos(la1 * p) * math.cos(la2 * p) * math.sin((lo2 - lo1) * p / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def season_summary(cache: dict) -> dict:
    """Ανά παίκτη, όλη η σεζόν: αγώνες, λεπτά, PIR/λεπτό (shrunk προς τη θέση), ποσοστό βασικού, κύρια ομάδα."""
    pri = defaultdict(lambda: [0.0, 0.0])
    for p in cache["players"]:
        for r in p["g"]:
            if r[SECS] > 0:
                v = pri[p.get("pos") or "Forward"]
                v[0] += r[PIR]
                v[1] += r[SECS] / 60
    pos_pm = {k: v[0] / v[1] for k, v in pri.items() if v[1]}
    out = {}
    for p in cache["players"]:
        pl = [r for r in p["g"] if r[SECS] > 0]
        if not pl:
            continue
        mins = sum(r[SECS] for r in pl) / 60
        pir = sum(r[PIR] for r in pl)
        prior = pos_pm.get(p.get("pos") or "Forward", 0.45)
        out[p["c"]] = {"gp": len(pl), "min": mins / len(pl), "mins": mins, "pirpm": (pir + 60 * prior) / (mins + 60),
                       "start": float(np.mean([r[START] for r in pl])), "team": p["t"].split(";")[-1]}
    return out


def _travel(cache: dict) -> dict:
    """(ομάδα, αγωνιστική) -> χλμ από την πόλη του προηγούμενου αγώνα της ομάδας στην πόλη αυτού του αγώνα."""
    by_team = defaultdict(list)
    for g in sorted(cache["league"]["games"], key=lambda g: (g[0], g[1])):
        loc = CITY.get(g[2])
        by_team[g[2]].append((g[0], loc))
        by_team[g[3]].append((g[0], loc))
    out = {}
    for t, xs in by_team.items():
        for i, (r, loc) in enumerate(xs):
            out[(t, r)] = km(xs[i - 1][1], loc) if i else float("nan")
    return out


def rows_v2(cache: dict, prev_cache: dict | None = None, target_round: int | None = None) -> pd.DataFrame:
    F._team_cache.clear()
    rows = F.build_rows(cache, target_round)
    if rows.empty:
        return rows
    prev = season_summary(prev_cache) if prev_cache else {}
    pl = {p["c"]: p for p in cache["players"]}
    # προηγούμενη σεζόν
    rows["has_prev"] = rows["c"].map(lambda c: 1 if c in prev and prev[c]["mins"] >= PREV_MIN_OK else 0)
    rows["prev_min"] = rows["c"].map(lambda c: prev[c]["min"] if c in prev else np.nan)
    rows["prev_start"] = rows["c"].map(lambda c: prev[c]["start"] if c in prev else np.nan)
    rows["prev_pirpm"] = rows["c"].map(lambda c: prev[c]["pirpm"] if c in prev else np.nan)
    rows["prev_same_team"] = [1 if (c in prev and prev[c]["team"] == t) else 0 for c, t in zip(rows["c"], rows["team"])]
    # χωρίς ιστορικό: ουδέτερες τιμές (μια στήλη μόνο με κενά σπάει το gradient boosting)
    rows["prev_min"] = rows["prev_min"].fillna(0.0)
    rows["prev_start"] = rows["prev_start"].fillna(0.0)
    rows["prev_pirpm"] = rows["prev_pirpm"].fillna(rows["prior_pm"])
    # PIR/λεπτό: shrink προς το περσινό του αντί για τον μέσο όρο της θέσης, όταν υπάρχει
    cur_min = rows["pirpm_raw"].where(rows["n_played"] > 0)
    min_sum = []
    for c, r in zip(rows["c"], rows["round"]):
        g = [x for x in pl[c]["g"] if x[0] < r and x[SECS] > 0][-10:]
        min_sum.append((sum(x[SECS] for x in g) / 60, sum(x[PIR] for x in g), sum(x[FC] for x in g)))
    ms = np.array([m for m, _, _ in min_sum])
    ps = np.array([p for _, p, _ in min_sum])
    fc = np.array([f for _, _, f in min_sum])
    target = np.where(rows["has_prev"] == 1, rows["prev_pirpm"].fillna(rows["prior_pm"]), rows["prior_pm"])
    w = np.where(rows["has_prev"] == 1, SHRINK_PREV, F.SHRINK_MIN)
    rows["pirpm_shr"] = (ps + w * target) / (ms + w)
    rows["fouls36"] = np.where(ms > 30, 36 * fc / np.maximum(ms, 1), np.nan)
    del cur_min
    # ταξίδι
    tr = _travel(cache)
    rows["travel_km"] = [tr.get((t, r), np.nan) for t, r in zip(rows["team"], rows["round"])]
    # λεπτά συμπαικτών που έλειψαν στον προηγούμενο αγώνα (γνωστό πριν από τον αγώνα)
    miss = (rows["m_last"] == 0) & (rows["m10"] >= 10)
    tot = rows[miss].groupby(["team", "round"])["m10"].sum()
    key = list(zip(rows["team"], rows["round"]))
    rows["team_missing_min"] = [float(tot.get(k, 0.0)) - (m10 if mi else 0.0) for k, m10, mi in zip(key, rows["m10"], miss)]
    return rows


def season_order(seasons: list[str]) -> list[str]:
    return sorted(seasons)


def add_time_index(df: pd.DataFrame, season: str) -> pd.DataFrame:
    df = df.copy()
    df["season"] = season
    df["tix"] = int(season[1:]) * 100 + df["round"]
    return df


def pooled_history(caches: dict, season: str, n_prev: int = N_PREV_TRAIN, cache_rows: dict | None = None) -> pd.DataFrame:
    """Γραμμές εκπαίδευσης από τις n_prev προηγούμενες σεζόν (όλες οι αγωνιστικές τους), με τα δικά τους priors."""
    order = season_order(list(caches))
    i = order.index(season)
    out = []
    for s in order[max(0, i - n_prev): i]:
        if cache_rows is not None and s in cache_rows:
            out.append(cache_rows[s])
            continue
        j = order.index(s)
        r = rows_v2(caches[s], caches[order[j - 1]] if j > 0 else None)
        r = add_time_index(r[~r["is_target"]], s)
        if cache_rows is not None:
            cache_rows[s] = r
        out.append(r)
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()
