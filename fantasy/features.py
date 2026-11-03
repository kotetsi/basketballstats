"""Builds one row per (player, team game) from data/cache.json.

Every feature uses only games played BEFORE the game it describes, so the same
code serves training, walk-forward backtesting and the projection of the next round.
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import date

import numpy as np
import pandas as pd

# indexes in the per-game rows that build.mjs stores for every player
R, DATE, OPP, HOME, MY, OP, START, SECS, PTS = 0, 1, 2, 3, 4, 5, 6, 7, 8
M2, A2, M3, A3, FTM, FTA, ORB, DRB, AST, STL, TOV, BLK, BLKA, FC, FR, PM, PIR = range(9, 26)

POS = ["Guard", "Forward", "Center"]
SHRINK_MIN = 60.0  # minutes of evidence worth as much as the positional prior


def game_date(enc: str) -> date:
    """Decodes build.mjs' compact game date (MMDDHHMMy)."""
    return date(2020 + int(enc[8]), int(enc[0:2]), int(enc[2:4]))


def team_tables(cache: dict):
    """Per team and round: possessions, points for/against, used possessions (for usage)."""
    tot = defaultdict(lambda: defaultdict(float))  # (team, round) -> sums
    for p in cache["players"]:
        teams = p["t"].split(";")
        for r in p["g"]:
            team = team_of_row(cache, teams, r)
            if team is None:
                continue
            k = (team, r[R])
            fga = r[A2] + r[A3]
            tot[k]["fga"] += fga
            tot[k]["fta"] += r[FTA]
            tot[k]["orb"] += r[ORB]
            tot[k]["tov"] += r[TOV]
            tot[k]["secs"] += r[SECS]
    games = [g for g in cache["league"]["games"] if g[6]]
    rows = []
    for g in games:
        rnd, _, h, a, hs, as_, _ = g
        for me, op, pf, pa in ((h, a, hs, as_), (a, h, as_, hs)):
            t = tot[(me, rnd)]
            poss = t["fga"] + 0.44 * t["fta"] - t["orb"] + t["tov"]
            rows.append({"team": me, "opp": op, "round": rnd, "pf": pf, "pa": pa, "poss": poss,
                         "used": t["fga"] + 0.44 * t["fta"] + t["tov"], "secs": t["secs"]})
    df = pd.DataFrame(rows)
    # possessions of a game = mean of both teams' estimates
    if len(df):
        m = df.merge(df[["team", "round", "poss"]].rename(columns={"team": "opp", "poss": "opp_poss"}), on=["opp", "round"], how="left")
        m["gposs"] = (m["poss"] + m["opp_poss"]) / 2
        df = m
    return df


_team_cache: dict = {}


def team_of_row(cache: dict, teams: list[str], r: list) -> str | None:
    """Which of the player's teams played this game (players who changed team have 'A;B')."""
    if len(teams) == 1:
        return teams[0]
    key = (tuple(teams), r[R], r[OPP])
    if key not in _team_cache:
        found = None
        for g in cache["league"]["games"]:
            if g[0] == r[R] and ((g[2] in teams and g[3] == r[OPP]) or (g[3] in teams and g[2] == r[OPP])):
                found = g[2] if g[3] == r[OPP] else g[3]
                break
        _team_cache[key] = found
    return _team_cache[key]


def team_ratings_before(tt: pd.DataFrame, rnd: int) -> dict:
    """Offensive/defensive rating per 100 possessions and pace, from games before `rnd`."""
    prev = tt[tt["round"] < rnd]
    out = {}
    for team, x in prev.groupby("team"):
        poss = x["gposs"].sum()
        if poss <= 0:
            continue
        out[team] = {"ortg": 100 * x["pf"].sum() / poss, "drtg": 100 * x["pa"].sum() / poss,
                     "pace": x["gposs"].mean(), "g": len(x), "used_pm": x["used"].sum() / max(x["secs"].sum() / 60, 1)}
    return out


def build_rows(cache: dict, target_round: int | None = None) -> pd.DataFrame:
    """Rows for every completed team game of every player (+ the target round if given, without targets)."""
    games = cache["league"]["games"]
    tt = team_tables(cache)
    ratings_by_round: dict[int, dict] = {}
    allowed_by_round: dict[int, dict] = {}

    played_games = [g for g in games if g[6]]
    rounds = sorted({g[0] for g in games})
    want = [r for r in rounds if any(g[0] == r and g[6] for g in games)]
    if target_round is not None and target_round not in want:
        want.append(target_round)

    # PIR allowed per opponent and position (defense by position), from games before each round
    pos_of = {p["c"]: p.get("pos") or "Forward" for p in cache["players"]}
    allow_rows = []
    for p in cache["players"]:
        for r in p["g"]:
            if r[SECS] > 0:
                allow_rows.append((r[OPP], pos_of[p["c"]], r[R], r[PIR]))
    allow = pd.DataFrame(allow_rows, columns=["opp", "pos", "round", "pir"])

    def ratings(rnd):
        if rnd not in ratings_by_round:
            ratings_by_round[rnd] = team_ratings_before(tt, rnd)
            prev = allow[allow["round"] < rnd]
            gp = tt[tt["round"] < rnd].groupby("team").size().to_dict()
            a = {}
            if len(prev):
                s = prev.groupby(["opp", "pos"])["pir"].sum()
                for (o, ps), v in s.items():
                    if gp.get(o):
                        a[(o, ps)] = v / gp[o]
                lg = {ps: np.mean([v for (o, q), v in a.items() if q == ps] or [0]) for ps in POS}
            else:
                lg = {ps: 0 for ps in POS}
            allowed_by_round[rnd] = (a, lg)
        return ratings_by_round[rnd], allowed_by_round[rnd]

    # league priors: PIR per minute by position from games before each round
    def prior_pm(rnd):
        vals = defaultdict(lambda: [0.0, 0.0])
        for p in cache["players"]:
            for r in p["g"]:
                if r[R] < rnd and r[SECS] > 0:
                    v = vals[pos_of[p["c"]]]
                    v[0] += r[PIR]
                    v[1] += r[SECS] / 60
        return {ps: (vals[ps][0] / vals[ps][1] if vals[ps][1] else 0.45) for ps in POS}

    priors = {r: prior_pm(r) for r in want}
    team_dates = defaultdict(dict)
    for g in games:
        d = game_date(g[1])
        team_dates[g[2]][g[0]] = d
        team_dates[g[3]][g[0]] = d

    out = []
    for p in cache["players"]:
        teams = p["t"].split(";")
        pos = pos_of[p["c"]] if pos_of[p["c"]] in POS else "Forward"
        by_round = {r[R]: r for r in p["g"]}
        rows_team = {r[R]: team_of_row(cache, teams, r) for r in p["g"]}
        first = min(by_round) if by_round else None
        if first is None:
            continue
        # the player's team game list: games of his team(s) from his first appearance
        cur_team = teams[-1]
        for rnd in want:
            if rnd < first:
                continue
            team = rows_team.get(rnd)
            if team is None:
                # did his (last known) team play this round?
                team = None
                for t in teams[::-1]:
                    if any(g[0] == rnd and (g[2] == t or g[3] == t) for g in games):
                        # only if he was already with that team (appeared for it before)
                        if any(rows_team.get(x) == t for x in by_round if x < rnd) or t == cur_team:
                            team = t
                            break
                if team is None:
                    continue
            g = next((g for g in games if g[0] == rnd and (g[2] == team or g[3] == team)), None)
            if g is None:
                continue
            is_target = not g[6]
            if is_target and rnd != target_round:
                continue
            home = 1 if g[2] == team else 0
            opp = g[3] if home else g[2]
            hist_rounds = [x for x in sorted(team_dates[team]) if x < rnd and any(gg[0] == x and gg[6] and (gg[2] == team or gg[3] == team) for gg in games)]
            hist = [(x, by_round.get(x)) for x in hist_rounds if x >= first]
            if not hist:
                continue
            mins = [(r[SECS] / 60 if r else 0.0) for _, r in hist]
            played = [r for _, r in hist if r and r[SECS] > 0]
            last5, last10 = mins[-5:], mins[-10:]
            pir_played10 = [r[PIR] for r in played[-10:]]
            pir_played5 = [r[PIR] for r in played[-5:]]
            min_sum10 = sum(r[SECS] for r in played[-10:]) / 60
            pir_sum10 = sum(r[PIR] for r in played[-10:])
            prior = priors[rnd][pos]
            pirpm_raw = pir_sum10 / min_sum10 if min_sum10 else prior
            pirpm_shr = (pir_sum10 + SHRINK_MIN * prior) / (min_sum10 + SHRINK_MIN)
            used = sum(r[A2] + r[A3] + 0.44 * r[FTA] + r[TOV] for r in played[-10:])
            rat, (alw, lgalw) = ratings(rnd)
            tr = rat.get(team, {})
            orat = rat.get(opp, {})
            usage = (used / min_sum10) / (tr.get("used_pm", 1) / 5) if min_sum10 and tr.get("used_pm") else 1.0
            d_now = team_dates[team].get(rnd)
            prev_round = hist_rounds[-1] if hist_rounds else None
            rest = (d_now - team_dates[team][prev_round]).days if (d_now and prev_round) else 7
            opp_pos = alw.get((opp, pos))
            row = {
                "c": p["c"], "round": rnd, "team": team, "opp": opp, "home": home, "pos": pos,
                "n_team_games": len(hist), "n_played": len(played),
                "m_last": mins[-1], "m5": float(np.mean(last5)), "m10": float(np.mean(last10)),
                "m_trend": float(np.mean(mins[-3:]) - np.mean(mins[-8:-3])) if len(mins) >= 5 else 0.0,
                "play_rate5": float(np.mean([m > 0 for m in last5])),
                "start_rate5": float(np.mean([bool(r and r[START]) for _, r in hist[-5:]])),
                "pir5": float(np.mean(pir_played5)) if pir_played5 else 0.0,
                "pir10": float(np.mean(pir_played10)) if pir_played10 else 0.0,
                "pirpm_raw": pirpm_raw, "pirpm_shr": pirpm_shr, "prior_pm": prior,
                "usage": usage, "rest": rest, "b2b": 1 if rest <= 2 else 0,
                "opp_drtg": orat.get("drtg", 115.0), "team_pace": tr.get("pace", 72.0), "opp_pace": orat.get("pace", 72.0),
                "opp_pos_allow": (opp_pos / lgalw[pos]) if (opp_pos and lgalw.get(pos)) else 1.0,
                "pos_G": 1 if pos == "Guard" else 0, "pos_C": 1 if pos == "Center" else 0,
                "is_target": is_target,
                "y_min": None if is_target else (by_round[rnd][SECS] / 60 if by_round.get(rnd) else 0.0),
                "y_pir": None if is_target else (by_round[rnd][PIR] if by_round.get(rnd) else 0.0),
            }
            out.append(row)
    return pd.DataFrame(out)


FEATURES_MIN = ["m_last", "m5", "m10", "m_trend", "play_rate5", "start_rate5", "n_played", "rest", "b2b", "home", "pos_G", "pos_C", "pir10"]
FEATURES_PM = ["pirpm_shr", "pirpm_raw", "prior_pm", "usage", "opp_drtg", "opp_pos_allow", "team_pace", "opp_pace", "home", "rest", "b2b", "start_rate5", "pos_G", "pos_C", "pir5", "m10"]
FEATURES_Q = sorted(set(FEATURES_MIN + FEATURES_PM))
