import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import vacated as V


def team(out_c="B"):
    return [
        {"c": "B", "pos": "Center", "pm": 9, "out": True, "mplay": 17, "miss5": 0.2},
        {"c": "D", "pos": "Center", "pm": 11.5, "out": False, "mplay": 12, "miss5": 0.0},
        {"c": "W", "pos": "Center", "pm": 19.5, "out": False, "mplay": 21, "miss5": 0.0},
        {"c": "G", "pos": "Guard", "pm": 25, "out": False, "mplay": 25, "miss5": 0.0},
    ]


def test_minutes_without_the_absent_player():
    # γύρος 10: ο B έλειψε, ο D έπαιξε 20'
    logs = {"B": {6: 20, 7: 19, 8: 20, 9: 7, 10: 0}, "D": {6: 4, 7: 0, 8: 13, 9: 11, 10: 20}, "W": {6: 21, 7: 24, 8: 22, 9: 22, 10: 19}, "G": {r: 25 for r in range(6, 11)}}
    res = V.adjust(team(), logs, [6, 7, 8, 9, 10])
    dm, info = res["D"]
    assert info["k"] == "ww" and info["n"] == 1 and info["m"] == 20
    assert 3 < dm < 4          # 0,4 × (20 − 11,5)


def test_own_injury_streak_is_ignored():
    # ο F έλειπε κι ο ίδιος (σερί 0') όσο έλειπε ο B: αυτά τα ματς δεν μετράνε
    tp = team() + [{"c": "F", "pos": "Forward", "pm": 18, "out": False, "mplay": 18, "miss5": 0.4}]
    logs = {"B": {6: 20, 7: 0, 8: 0, 9: 0, 10: 0}, "F": {6: 18, 7: 0, 8: 0, 9: 25, 10: 26}, "D": {}, "W": {}, "G": {}}
    res = V.adjust(tp, logs, [6, 7, 8, 9, 10])
    dm, info = res["F"]
    assert info["k"] == "ww" and info["n"] == 2 and dm > 0


def test_fallback_shares_minutes_when_no_games_without():
    logs = {"B": {r: 17 for r in range(6, 11)}, "D": {r: 11 for r in range(6, 11)}, "W": {r: 20 for r in range(6, 11)}, "G": {r: 25 for r in range(6, 11)}}
    res = V.adjust(team(), logs, [6, 7, 8, 9, 10])
    assert res["D"][1]["k"] == "vac" and res["D"][0] > res.get("W", (0,))[0]   # τα παίρνει κυρίως ο αναπληρωματικός
