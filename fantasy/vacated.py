"""Μοίρασμα λεπτών όσων λείπουν (vacated minutes).

Όταν ένας παίκτης είναι εκτός (λίστα τραυματιών, ξεκούραση), τα λεπτά που έπαιζε πρέπει να πάνε κάπου. Το μοντέλο
το βλέπει μόνο έμμεσα (λεπτά συμπαικτών που έλειψαν στον *προηγούμενο* αγώνα, για όλη την ομάδα). Εδώ:
  - λεπτά που ελευθερώνονται = ALPHA × λεπτά του απόντα όταν παίζει × (1 − πόσο έχει ήδη λείψει στα 5 τελευταία ματς),
    γιατί ό,τι έχει ήδη λείψει υπάρχει ήδη στα πρόσφατα λεπτά των συμπαικτών,
  - μοιράζονται κυρίως στους διαθέσιμους της ίδιας θέσης (SAME) και λιγότερο στις διπλανές, ανάλογα με τα λεπτά τους,
  - όριο κέρδους ανά παίκτη (CAP_GAIN) και συνολικών λεπτών (CAP_MIN),
  - η νέα εκτίμηση = (λεπτά + κέρδος) × εκτιμώμενο PIR ανά λεπτό του παίκτη.
Πρώτα όμως κοιτάμε το πιο δυνατό σήμα: πόσα λεπτά έπαιξε ο παίκτης στα πρόσφατα ματς όπου *ήδη* έλειπαν οι
τωρινοί απόντες (adjust). Μόνο όπου δεν υπάρχουν τέτοια ματς γίνεται το μοίρασμα.
Walk-forward backtest (fantasy/vac_backtest.py, E2025 + E2026, 1.616 περιπτώσεις με απόντα συμπαίκτη):
σφάλμα PIR 5,560 → 5,560 (ίδιο), λεπτών 4,969 → 4,885· όπου αλλάζουν ≥3 λεπτά (131 περιπτώσεις): PIR 6,33 → 5,92 (−6%).
"""
from __future__ import annotations

ALPHA = 0.25
SAME = 0.75
CAP_GAIN = 10.0
CAP_MIN = 34.0
MODE = "bench"


def weight(pm: float, mode: str) -> float:
    """πόσο από τα ελεύθερα λεπτά παίρνει κάποιος: prop = ανάλογα με τα λεπτά του, bench = κυρίως όσοι παίζουν λίγο
    (ο αναπληρωματικός), mid = κάτι ενδιάμεσο"""
    if mode == "bench":
        return max(0.0, 30.0 - pm) * (1.0 if pm >= 3 else 0.3)
    if mode == "mid":
        return max(0.5, pm) * max(0.0, 32.0 - pm)
    return pm


ADJ = {"Guard": ("Forward",), "Forward": ("Guard", "Center"), "Center": ("Forward",)}


def vacated(mplay: float, miss5: float, alpha: float = ALPHA) -> float:
    """λεπτά που ελευθερώνονται από έναν απόντα: mplay = λεπτά όταν παίζει, miss5 = ποσοστό από τα 5 τελευταία που έλειψε"""
    return max(0.0, alpha * mplay * (1.0 - min(1.0, max(0.0, miss5))))


def redistribute(team_players: list[dict], alpha: float = ALPHA, same: float | None = None, mode: str | None = None) -> dict:
    """team_players: [{c, pos, pm, out, mplay, miss5}] για μία ομάδα.
    Επιστρέφει {c: (κέρδος λεπτών, [(c_απόντα, λεπτά)])} μόνο για όσους κερδίζουν."""
    same = SAME if same is None else same
    mode = MODE if mode is None else mode
    absent = [p for p in team_players if p["out"] and p.get("mplay", 0) >= 8]
    avail = [p for p in team_players if not p["out"] and p.get("pm", 0) > 0.5]
    gain = {p["c"]: 0.0 for p in avail}
    src = {p["c"]: [] for p in avail}
    for a in absent:
        v = vacated(a["mplay"], a.get("miss5", 0.0), alpha)
        if v <= 0:
            continue
        for share, poss in ((same, (a["pos"],)), (1 - same, ADJ.get(a["pos"], ()))):
            grp = [p for p in avail if p["pos"] in poss]
            w = {p["c"]: weight(p["pm"], mode) for p in grp}
            tot = sum(w.values())
            if not grp or tot <= 0:
                continue
            for p in grp:
                g = v * share * w[p["c"]] / tot
                gain[p["c"]] += g
                src[p["c"]].append((a["c"], g))
    out = {}
    for p in avail:
        g = min(gain[p["c"]], CAP_GAIN, max(0.0, CAP_MIN - p["pm"]))
        if g >= 0.5:
            tot = sum(x for _, x in src[p["c"]]) or 1.0
            out[p["c"]] = (g, [(c, g * x / tot) for c, x in src[p["c"]]])
    return out


W_WITHOUT = (0.4, 0.55, 0.65)   # βάρος των «ματς χωρίς τον απόντα» για 1, 2, 3+ τέτοια ματς
LOOKBACK = 8


def without_minutes(c: str, absent: list[str], logs: dict, trounds: list[int], regular: bool = False) -> list[float]:
    """λεπτά του c στα πρόσφατα ματς της ομάδας όπου έλειπαν όλοι οι τωρινοί απόντες (και είχαν ήδη παίξει πριν).
    Για παίκτη της βασικής rotation (regular), ματς με 0 λεπτά δεν μετράνε: σχεδόν πάντα έλειπε κι ο ίδιος."""
    ms = []
    mine = logs.get(c, {})
    # σερί ≥2 ματς χωρίς συμμετοχή = έλειπε κι ο ίδιος (τραυματισμός), όχι επιλογή του προπονητή
    zero = [mine.get(r, 0) <= 0 for r in trounds]
    own_out = {trounds[i] for i in range(len(trounds)) if zero[i] and ((i > 0 and zero[i - 1]) or (i + 1 < len(zero) and zero[i + 1]))}
    for r in trounds[-LOOKBACK:]:
        if mine.get(r, 0) <= 0 and (regular or r in own_out):
            continue
        if any(logs.get(a, {}).get(r, 0) > 0 for a in absent):
            continue
        if not any(any(v > 0 for k, v in logs.get(a, {}).items() if k < r) for a in absent):
            continue
        ms.append(logs.get(c, {}).get(r, 0.0))
    return ms


def adjust(team_players: list[dict], logs: dict, trounds: list[int]) -> dict:
    """{c: (μεταβολή λεπτών, info)}: info = {"k": "ww", "n", "m", "a": [απόντες]} ή {"k": "vac", "src": [(απών, λεπτά)]}"""
    absent = [p["c"] for p in team_players if p["out"] and p.get("mplay", 0) >= 8]
    if not absent:
        return {}
    fb = redistribute(team_players)
    out = {}
    for p in team_players:
        if p["out"] or p.get("pm", 0) <= 0.5 and not any(logs.get(p["c"], {}).values()):
            continue
        ms = without_minutes(p["c"], absent, logs, trounds, p.get("mplay", 0) >= 20)
        if ms:
            w = W_WITHOUT[min(len(ms), len(W_WITHOUT)) - 1]
            m = sum(ms) / len(ms)
            new = max(p["pm"] + w * (m - p["pm"]), p["pm"] - 6)
            new = min(new, CAP_MIN + 2)
            d = new - p["pm"]
            if abs(d) >= 0.5:
                out[p["c"]] = (d, {"k": "ww", "n": len(ms), "m": round(m, 1), "a": absent})
        elif p["c"] in fb:
            g, src = fb[p["c"]]
            out[p["c"]] = (g, {"k": "vac", "src": src})
    return out
