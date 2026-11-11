"""Runs after `node build.mjs`: projects the next round and writes data/fantasy/*.json.

    python3 fantasy/run.py            # projection + backtest
Outputs
    data/fantasy/latest.json                      read by build.mjs for the Fantasy pages and the /api files
    data/fantasy/history/r{round}_{date}_{ver}.json   every projection kept for backtesting
"""
from __future__ import annotations

import csv
import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from features import build_rows, game_date, team_tables, team_ratings_before, SECS, PIR  # noqa: E402
from model import FEATSET, MODEL_VERSION, PirModel, backtest, ncdf  # noqa: E402
import features2 as F2  # noqa: E402
import vacated as VAC  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fantasy"
SD_MARGIN = 11.0
SNAP_COLS = ["n_played", "m5", "m10", "pir10", "play_rate5", "start_rate5", "rest", "b2b", "home", "opp_drtg", "opp_pos_allow", "m_trend"]


def log(*a):
    print("[fantasy]", *a, flush=True)


def read_overrides(name: str) -> dict:
    """Optional CSV files the owner can edit: code,value (lines starting with # are ignored)."""
    f = OUT / name
    res = {}
    if f.exists():
        for row in csv.reader(l for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")):
            if len(row) >= 2:
                res[row[0].strip().upper()] = row[1].strip()
    return res


def official_prices(rnd: int) -> dict:
    """Επίσημες τιμές του EuroLeague Fantasy για τη συγκεκριμένη αγωνιστική (fantasy/official/prices-rNN.csv).
    Χρησιμοποιούνται μόνο για την ίδια αγωνιστική: οι τιμές αλλάζουν μετά από κάθε αγωνιστική."""
    f = ROOT / "fantasy" / "official" / f"prices-r{rnd}.csv"
    res = {}
    if f.exists():
        for row in csv.reader(l for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")):
            if len(row) >= 2:
                res[row[0].strip().upper()] = row[1].strip()
    return res


def coach_points(margin: float) -> float:
    if margin > 0:
        return 10 if margin <= 10 else 20 if margin <= 20 else 25
    m = -margin
    return -5 if m <= 10 else -10 if m <= 20 else -20


def coach_dist(mu: float) -> dict:
    """Expected coach score and its spread from a normal margin distribution (rounded to whole points)."""
    ms = np.arange(-60, 61)
    ms = ms[ms != 0]
    w = np.array([ncdf((m + 0.5 - mu) / SD_MARGIN) - ncdf((m - 0.5 - mu) / SD_MARGIN) for m in ms])
    w /= w.sum()
    pts = np.array([coach_points(m) for m in ms])
    order = np.argsort(pts)
    cdf = np.cumsum(w[order])
    q = lambda a: float(pts[order][np.searchsorted(cdf, a)])
    return {"exp": round(float((w * pts).sum()), 2), "p10": q(0.1), "p50": q(0.5), "p90": q(0.9)}


def main():
    t0 = time.time()
    cache = json.loads((ROOT / "data" / "cache.json").read_text(encoding="utf-8"))
    try:
        site = json.loads((ROOT / "dist" / "assets" / "data.json").read_text(encoding="utf-8"))
        inj = site.get("inj", {})
    except FileNotFoundError:
        inj = {}
    games = cache["league"]["games"]
    target = next((g[0] for g in games if not g[6]), None)
    if target is None:
        log("no upcoming round, nothing to project")
        return
    v2 = FEATSET.get(MODEL_VERSION) == "v2"
    caches, season = {}, None
    if v2:
        # v2: features με την προηγούμενη σεζόν + εκπαίδευση και στις 2 προηγούμενες σεζόν (data/fantasy/hist)
        season = os.environ.get("SEASON") or json.loads((ROOT / "site.config.json").read_text(encoding="utf-8")).get("season", "E2026")
        for f in sorted((ROOT / "data" / "fantasy" / "hist").glob("E*.json")):
            if f.stem < season:
                caches[f.stem] = json.loads(f.read_text(encoding="utf-8"))
        caches[season] = cache
        order = sorted(caches)
        prev_cache = caches.get(order[order.index(season) - 1]) if order.index(season) > 0 else None

    def make_rows(rr):
        if v2:
            return F2.add_time_index(F2.rows_v2(cache, prev_cache, rr), season)
        return build_rows(cache, rr)

    rows = make_rows(target)
    done_rounds = sorted({g[0] for g in games if g[6]})
    hist_rows = rows[~rows["is_target"]]
    train_rows = pd.concat([F2.pooled_history(caches, season), hist_rows], ignore_index=True) if v2 else hist_rows
    model = PirModel().fit(train_rows)
    tgt = rows[rows["is_target"]].reset_index(drop=True)
    pred = model.predict(tgt)
    facts = model.factors(tgt)

    # team strength for win probabilities, coach scoring and the +10% win bonus
    tt = team_tables(cache)
    rat = team_ratings_before(tt, target)
    def proj_game(h, a):
        H, A = rat.get(h), rat.get(a)
        if not H or not A:
            return None
        pace = (H["pace"] + A["pace"]) / 2
        ph = pace * (H["ortg"] + A["drtg"]) / 200 + 1.5
        pa = pace * (A["ortg"] + H["drtg"]) / 200 - 1.5
        return ph, pa
    tg = [g for g in games if g[0] == target]
    days = sorted({game_date(g[1]).isoformat() for g in tg})
    team_game = {}
    for g in tg:
        pg = proj_game(g[2], g[3])
        mu = (pg[0] - pg[1]) if pg else 0.0
        for team, opp, home, m in ((g[2], g[3], 1, mu), (g[3], g[2], 0, -mu)):
            team_game[team] = {"opp": opp, "home": home, "day": days.index(game_date(g[1]).isoformat()), "date": g[1],
                               "pwin": round(ncdf(m / SD_MARGIN), 3), "margin": round(m, 1)}

    prices_over = {**official_prices(target), **read_overrides("prices.csv")}
    log("επίσημες τιμές:", len(prices_over))
    status_over = read_overrides("status.csv")
    pos_of = {p["c"]: p.get("pos") or "Forward" for p in cache["players"]}
    pl_by = {p["c"]: p for p in cache["players"]}
    players = []
    for i, r in pred.iterrows():
        c = r["c"]
        p = pl_by[c]
        played = [x for x in p["g"] if x[SECS] > 0]
        l5 = [x[PIR] for x in played[-5:]]
        l10 = [x[PIR] for x in played[-10:]]
        mins10 = sum(x[SECS] for x in played[-10:]) / 60
        status = "playing"
        status_src = "none"            # καμία πληροφορία = θεωρείται διαθέσιμος
        ij = inj.get(c)
        if ij:
            status = "injured" if ij.get("m") == 1 else "doubtful"
            status_src = "injury_list" if ij.get("m") == 1 else "missed_games_rule"
        ov = status_over.get(c, status_over.get(p["n"].upper()))
        if ov:
            status, status_src = ov, "manual_override"
        mult = {"playing": 1.0, "doubtful": 0.4, "injured": 0.0, "rest": 0.0}.get(status, 1.0)
        proj = max(float(r["proj_pir"]), 0.0) * mult
        base = 0.5 * (np.mean(l10) if l10 else 0) + 0.5 * max(float(r["proj_pir"]), 0)
        price_off = float(prices_over.get(c, prices_over.get(p["n"].upper(), 0)) or 0)
        price = price_off or round(min(24, max(4, 4 + 0.75 * base)), 1)
        tg_ = team_game.get(r["team"], {})
        players.append({
            "c": c, "n": p["n"], "t": r["team"], "pos": pos_of[c], "price": price, "price_src": "official" if price_off else "estimate", "status": status, "status_src": status_src,
            "l5": round(float(np.mean(l5)), 1) if l5 else 0, "l10": round(float(np.mean(l10)), 1) if l10 else 0,
            "pirpm": round(sum(x[PIR] for x in played[-10:]) / mins10, 3) if mins10 else 0,
            "pm": round(float(r["proj_min"]) * mult, 1), "pp0": round(max(float(r["proj_pir"]), 0.0), 1), "pm0": round(float(r["proj_min"]), 1), "ppm": round(float(r["proj_pirpm"]), 3), "pp": round(proj, 1),
            "p10": round(float(r["p10"]) * mult, 1), "p50": round(float(r["p50"]) * mult, 1), "p90": round(float(r["p90"]) * mult, 1),
            "conf": int(r["confidence"]) if mult else 0, "opp": tg_.get("opp"), "home": tg_.get("home"), "day": tg_.get("day"), "pwin": tg_.get("pwin"),
            "f": facts[i][:4], "h": [[x[0], round(x[SECS] / 60, 1), x[PIR]] for x in p["g"][-12:]],
        })
    # ---- απόντες συμπαίκτες (fantasy/vacated.py, ελεγμένο με vac_backtest.py): λεπτά στα ματς χωρίς αυτούς,
    #      αλλιώς μοίρασμα των λεπτών τους στους διαθέσιμους
    tg_rounds = {}
    for g in games:
        if g[6]:
            for tm in (g[2], g[3]):
                tg_rounds.setdefault(tm, []).append(g[0])
    by_team, logs = {}, {}
    for p in players:
        g_ = pl_by[p["c"]]["g"]
        logs[p["c"]] = {x[0]: x[SECS] / 60 for x in g_}
        played5 = [x for x in g_ if x[SECS] > 0][-5:]
        have = {x[0] for x in g_ if x[SECS] > 0}
        last5 = sorted(tg_rounds.get(p["t"], []))[-5:]
        by_team.setdefault(p["t"], []).append({
            "c": p["c"], "pos": p["pos"], "pm": p["pm0"], "out": p["status"] in ("injured", "rest"),
            "mplay": float(np.mean([x[SECS] / 60 for x in played5])) if played5 else 0.0,
            "miss5": (sum(1 for r_ in last5 if r_ not in have) / len(last5)) if last5 else 0.0})
    vac_n = 0
    pidx = {p["c"]: p for p in players}
    for team, tp in by_team.items():
        res = VAC.adjust(tp, logs, sorted(set(tg_rounds.get(team, []))))
        for c, (dm, info) in res.items():
            p = pidx[c]
            mult = {"playing": 1.0, "doubtful": 0.4}.get(p["status"], 0.0)
            d = dm * p["ppm"] * mult
            p["pm"] = round(max(0.0, p["pm"] + dm * mult), 1)
            p["pp"] = round(max(0.0, p["pp"] + d), 1)
            for k in ("p10", "p50", "p90"):
                p[k] = round(p[k] + d, 1)
            if info["k"] == "ww":
                p["vx"] = {"k": "ww", "n": info["n"], "m": info["m"], "a": info["a"], "dm": round(dm, 1), "dp": round(d, 1)}
            else:
                p["vx"] = {"k": "vac", "a": [c_ for c_, m_ in info["src"] if m_ >= 0.3], "dm": round(dm, 1), "dp": round(d, 1)}
            vac_n += 1
    log(f"vacated minutes: {vac_n} players gained minutes from absent teammates")
    players.sort(key=lambda x: -x["pp"])

    # ---- Transfer Market Analyzer: προβολή για τις επόμενες 3 αγωνιστικές, εκτιμώμενη τιμή ανά αγωνιστική, σήματα
    team_dates = {}
    for g in games:
        for tm in (g[2], g[3]):
            team_dates.setdefault(tm, {})[g[0]] = game_date(g[1])
    def diff_scale(df):
        # δυσκολία 1 (εύκολο) .. 5 (δύσκολο) από το PIR που δίνει ο αντίπαλος στη θέση και την άμυνά του
        s = (-df["opp_pos_allow"].rank(pct=True) + df["opp_drtg"].rank(pct=True)) / 2
        r = s.rank(pct=True)
        return np.clip(np.ceil(r * 5), 1, 5).astype(int)
    fut = {0: (tgt, pred)}
    for k in (1, 2):
        rr = target + k
        if not any(g[0] == rr for g in games):
            break
        rows_k = make_rows(rr)
        tk = rows_k[rows_k["is_target"]].reset_index(drop=True)
        if not len(tk):
            break
        # σωστές μέρες ξεκούρασης: από τον αγώνα της προηγούμενης αγωνιστικής
        rest = []
        for _, x in tk.iterrows():
            d = team_dates.get(x["team"], {})
            a_, b_ = d.get(rr - 1), d.get(rr)
            rest.append((b_ - a_).days if a_ and b_ else 7)
        tk["rest"] = rest
        tk["b2b"] = (tk["rest"] <= 2).astype(int)
        fut[k] = (tk, model.predict(tk))
    dif = {k: dict(zip(df["c"], diff_scale(df))) for k, (df, _) in fut.items()}
    proj_k = {k: dict(zip(pr["c"], pr["proj_pir"])) for k, (_, pr) in fut.items()}
    feat0 = {x["c"]: x for _, x in tgt.iterrows()}
    opp_k = {k: {x["c"]: (x["opp"], int(x["home"]), int(x["rest"]), int(x["b2b"])) for _, x in df.iterrows()} for k, (df, _) in fut.items()}
    # εκτιμώμενη τιμή ανά αγωνιστική (backfill με τον ίδιο τύπο, από τον μέσο όρο PIR των 10 προηγούμενων αγώνων)
    ph_file = OUT / "price_hist.json"
    try:
        ph = json.loads(ph_file.read_text(encoding="utf-8"))
    except Exception:
        ph = {}
    for p in players:
        c = p["c"]
        hist_c = ph.setdefault(c, {})
        g_ = [x for x in pl_by[c]["g"] if x[SECS] > 0]
        for rnd in sorted({x[0] for x in pl_by[c]["g"]}) + [target]:
            if str(rnd) in hist_c:
                continue
            prev = [x[PIR] for x in g_ if x[0] < rnd][-10:]
            if len(prev) >= 3:
                hist_c[str(rnd)] = round(min(24, max(4, 4 + 0.75 * float(np.mean(prev)))), 1)
        hist_c[str(target)] = p["price"]
    ph_file.write_text(json.dumps(ph), encoding="utf-8")
    mult_f = {"playing": (1, 1, 1), "doubtful": (0.4, 0.85, 1), "injured": (0, 0.35, 0.7), "rest": (0, 1, 1)}
    for p in players:
        c = p["c"]
        m3 = mult_f.get(p["status"], (1, 1, 1))
        nx = []
        for k in sorted(fut):
            if c not in proj_k[k]:
                continue
            o = opp_k[k][c]
            val = p["pp"] if k == 0 else max(float(proj_k[k][c]), 0) * m3[k]
            nx.append([target + k, o[0], o[1], round(val, 1), int(dif[k][c]), o[3]])
        p["nx"] = nx
        p["p3"] = round(sum(x[3] for x in nx), 1)
        f0 = feat0.get(c)
        p["start"] = round(float(f0["start_rate5"]), 2) if f0 is not None else None
        # για τον Captain Advisor: άμυνα αντιπάλου, ρυθμός αναμέτρησης, σταθερότητα λεπτών, ιστορικό «ως αρχηγός»
        p["odrtg"] = round(float(f0["opp_drtg"]), 1) if f0 is not None and f0["opp_drtg"] == f0["opp_drtg"] else None
        p["gpace"] = round((float(f0["team_pace"]) + float(f0["opp_pace"])) / 2, 1) if f0 is not None and f0["team_pace"] == f0["team_pace"] and f0["opp_pace"] == f0["opp_pace"] else None
        pl10 = [x for x in pl_by[c]["g"] if x[SECS] > 0][-10:]
        mins_ = [x[SECS] / 60 for x in pl10]
        p["mcv"] = round(float(np.std(mins_) / np.mean(mins_)), 3) if len(mins_) >= 3 and np.mean(mins_) > 0 else None
        p["hcap"] = round(2 * float(np.mean([x[PIR] for x in pl10])), 1) if pl10 else None
        p["hhit"] = round(sum(1 for x in pl10 if x[PIR] >= 20) / len(pl10), 2) if pl10 else None
        p["hneg"] = round(sum(1 for x in pl10 if x[PIR] <= 5) / len(pl10), 2) if pl10 else None
        p["rest"] = int(f0["rest"]) if f0 is not None else None
        p["b2b"] = int(any(x[5] for x in nx))
        pr = ph.get(c, {})
        rs = sorted(int(k) for k in pr)
        p["ph"] = [[r_, pr[str(r_)]] for r_ in rs][-12:]
        played = [x for x in pl_by[c]["g"] if x[SECS] > 0]
        p["l3"] = round(float(np.mean([x[PIR] for x in played[-3:]])), 1) if played else 0
        m3_ = [x[SECS] / 60 for x in played[-3:]]; m10_ = [x[SECS] / 60 for x in played[-10:]]
        p["m3"] = round(float(np.mean(m3_)), 1) if m3_ else 0
        p["m10"] = round(float(np.mean(m10_)), 1) if m10_ else 0
        p["gp"] = len(played)
        # σήμα: buy-low / sell-high / hold
        avg3 = p["p3"] / max(len(nx), 1)
        val = avg3 / p["price"] if p["price"] else 0
        p["vpc"] = round(val, 2)
    # σήματα buy-low/sell-high και value grade: υπολογίζονται σε ΕΝΑ σημείο, στο src/fantasy/value.mjs (build), με κατάταξη ανά θέση
    for p in players:
        p["small"] = 1 if p["gp"] < 3 else 0
    # coach: one per team, price from team strength
    strength = sorted(rat, key=lambda t: -(rat[t]["ortg"] - rat[t]["drtg"]))
    coaches = []
    for t, g in team_game.items():
        cd = coach_dist(g["margin"])
        rank = strength.index(t) if t in strength else len(strength) // 2
        price = float(prices_over.get("COACH-" + t, 0) or 0) or round(4 + 6 * (1 - rank / max(len(strength) - 1, 1)), 1)
        coaches.append({"t": t, "price": price, **cd, "opp": g["opp"], "home": g["home"], "day": g["day"], "pwin": g["pwin"]})
    coaches.sort(key=lambda x: -x["exp"])
    pos_median = {ps: float(np.median([x["pp"] for x in players if x["pos"] == ps and x["status"] == "playing"] or [0])) for ps in ("Guard", "Forward", "Center")}

    bt_file = OUT / "backtest.json"
    bt = {}
    try:
        bt = json.loads(bt_file.read_text(encoding="utf-8"))
    except Exception:
        pass
    if bt.get("upto") != done_rounds[-1] or bt.get("model") != MODEL_VERSION:
        bt = backtest(rows[~rows["is_target"]], [r for r in done_rounds if r >= 4])
        bt["upto"] = done_rounds[-1]
        bt["model"] = MODEL_VERSION
        bt_file.parent.mkdir(parents=True, exist_ok=True)
        bt_file.write_text(json.dumps(bt), encoding="utf-8")
    now = datetime.now(timezone.utc)
    latest = {"round": target, "generated": now.isoformat(timespec="seconds"), "model": MODEL_VERSION, "n_train": model.n_train,
              "days": days, "players": players, "coaches": coaches, "pos_median": pos_median,
              "backtest": {k: bt.get(k) for k in ("mae", "mae_base", "coverage_80", "mae_min", "n", "upto")}}
    OUT.mkdir(parents=True, exist_ok=True)
    update_news(latest)
    (OUT / "latest.json").write_text(json.dumps(latest, ensure_ascii=False), encoding="utf-8")
    hist = OUT / "history"
    hist.mkdir(exist_ok=True)
    slim = {"round": target, "generated": latest["generated"], "model": MODEL_VERSION,
            "p": [[x["c"], x["pm"], x["pp"], x["p10"], x["p50"], x["p90"], x["status"]] for x in players],
            # feature snapshot: ό,τι ήξερε το μοντέλο τη στιγμή της πρόβλεψης (για το backtesting/model performance)
            "snapshot_cols": SNAP_COLS,
            "snapshot": {r["c"]: [None if pd.isna(r[k]) else round(float(r[k]), 3) for k in SNAP_COLS] for _, r in tgt.iterrows()}}
    (hist / f"r{target}_{now.date().isoformat()}_{MODEL_VERSION}.json").write_text(json.dumps(slim), encoding="utf-8")
    log(f"round {target}: {len(players)} players, {len(coaches)} coaches, trained on {model.n_train} rows, "
        f"backtest MAE {bt.get('mae')} (baseline {bt.get('mae_base')}), {time.time() - t0:.1f}s")


def update_news(latest: dict) -> None:
    """Fantasy news feed: τι άλλαξε από την προηγούμενη εκτέλεση (κατάσταση, προβολή, λεπτά, βασικός, ομάδα)."""
    f = OUT / "news.json"
    try:
        feed = json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        feed = {"items": []}
    try:
        prev = json.loads((OUT / "latest.json").read_text(encoding="utf-8"))
    except Exception:
        prev = None
    if not prev:
        return
    ts = latest["generated"]
    P0 = {p["c"]: p for p in prev.get("players", [])}
    items = []
    def add(p, kind, before=None, after=None, source="model", detail=None):
        items.append({"ts": ts, "c": p["c"], "n": p["n"], "t": p["t"], "kind": kind, "before": before, "after": after, "source": source, "detail": detail, "round": latest["round"]})
    same_round = prev.get("round") == latest["round"]
    if not feed.get("items"):   # πρώτη φορά: αφετηρία από την τρέχουσα εικόνα
        P0 = {c: {**q, "status": "playing"} for c, q in P0.items()}
        same_round = False
    for p in latest["players"]:
        q = P0.get(p["c"])
        if not q:
            continue
        if q.get("status") != p["status"]:
            SRC = {"injury_list": "injury_list", "missed_games_rule": "missed_games_rule", "manual_override": "manual_override", "none": "box_score"}
            src = SRC.get(p.get("status_src"), "box_score")
            if p["status"] in ("injured", "rest"):
                add(p, "injury", q.get("pp"), p["pp"], src)
            elif p["status"] == "doubtful":
                add(p, "doubtful", q.get("pp"), p["pp"], src)
            elif p["status"] == "playing" and q.get("status") in ("injured", "rest", "doubtful"):
                add(p, "return", q.get("pp"), p["pp"], src)
        if q.get("t") and q["t"] != p["t"]:
            add(p, "transfer", None, p["pp"], "euroleague_roster", detail={"from": q["t"], "to": p["t"]})
        if same_round and q.get("pp") is not None and abs(p["pp"] - q["pp"]) >= 3 and q.get("status") == p["status"]:
            add(p, "projection_change", q["pp"], p["pp"])
        if not same_round:
            if (q.get("start") or 0) < 0.4 and (p.get("start") or 0) >= 0.6:
                add(p, "probable_starter", q.get("pp"), p["pp"])
            if p.get("m10") and p.get("m3") is not None:
                d = p["m3"] - p["m10"]
                if d >= 5:
                    add(p, "minutes_up", q.get("pp"), p["pp"], detail={"m3": p["m3"], "m10": p["m10"]})
                elif d <= -5:
                    add(p, "minutes_drop", q.get("pp"), p["pp"], detail={"m3": p["m3"], "m10": p["m10"]})
    pri = {"injury": 0, "doubtful": 1, "return": 2, "transfer": 3, "probable_starter": 4, "projection_change": 5, "minutes_drop": 6, "minutes_up": 7}
    items.sort(key=lambda x: pri.get(x["kind"], 9))
    feed["items"] = (items + feed.get("items", []))[:400]
    f.write_text(json.dumps(feed, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
