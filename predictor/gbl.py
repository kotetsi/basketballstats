"""Game Predictor για τη Stoiximan GBL, με τα δεδομένα του esake.gr (data/gbl, από το scripts/gbl.mjs).

Ίδια features και ίδιο μοντέλο με την EuroLeague (features.py / model.py), με δύο διαφορές:
  - δεν υπάρχουν πεντάδες (stints) ούτε shot charts, άρα χωρίς RAPM πεντάδων και χωρίς διόρθωση τύχης στα τρίποντα,
  - η ομάδα αναγνωρίζεται από το id του esake.gr (ίδιο σε όλες τις σεζόν).

  python predictor/gbl.py      backtest χωρίς διαρροή + προβλέψεις επόμενων αγώνων → data/gbl/model/
"""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import Game, SK, Builder, Elo, build_dataset  # noqa: E402
from model import Predictor, backtest, summarize, log_loss, brier, accuracy, MODEL_VERSION  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'gbl' / 'model'


def team_box(t: dict) -> list:
    """σύνολα ομάδας του esake.gr → διάνυσμα στη σειρά του SK (features.py)"""
    x = t.get('totals') or {}
    m = {'pts': 'pts', 'fgm2': 'f2m', 'fga2': 'f2a', 'fgm3': 'f3m', 'fga3': 'f3a', 'ftm': 'ftm', 'fta': 'fta',
         'oreb': 'oreb', 'dreb': 'dreb', 'tov': 'tov', 'ast': 'ast', 'stl': 'stl', 'blk': 'blk', 'pf': 'pf'}
    return [float(x.get(m[k], 0) or 0) for k in SK]


def load(root: Path = ROOT):
    """→ (αγώνες με box score ως Game, όλοι οι αγώνες του προγράμματος ως dict)"""
    games, sched = [], []
    base = root / 'data' / 'gbl'
    for sd in sorted(p for p in base.iterdir() if p.is_dir() and p.name.startswith('G')) if base.exists() else []:
        try:
            G = json.loads((sd / 'games.json').read_text())['games']
        except Exception:
            continue
        for g in G:
            g = {**g, 'season': sd.name}
            sched.append(g)
            if not (g.get('played') and g.get('box')):
                continue
            try:
                b = json.loads((sd / 'box' / f"{g['id']}.json").read_text())
            except Exception:
                continue
            th, ta = b['teams'][0], b['teams'][1]          # πρώτος πίνακας = γηπεδούχος (ελέγχεται στο scripts/gbl.mjs)
            h, a = g['home']['logo'], g['away']['logo']
            secs = sum(p['secs'] for p in th['players']) / 5 or 2400.0
            played = {h: {p['pid']: p['secs'] / 60 for p in th['players'] if p['secs'] > 0},
                      a: {p['pid']: p['secs'] / 60 for p in ta['players'] if p['secs'] > 0}}
            games.append(Game(sd.name, int(g['id'], 16), g['date'] or '', 'PO' if g.get('phase') == 'playoffs' else 'RS',
                              h, a, int(g['hs']), int(g['as']), float(secs), {h: team_box(th), a: team_box(ta)}, played))
    games.sort(key=lambda x: (x.d, x.season, x.gc))
    sched.sort(key=lambda x: (x.get('date') or '', x['id']))
    return games, sched


def elo_walkforward(sched: list, warmup: str) -> dict:
    """Σκέτο Elo από τα σκορ (χωρίς box scores): πρόβλεψη κάθε αγώνα με ό,τι ήξερε πριν από αυτόν.
    Οι αγώνες της σεζόν warmup μόνο εκπαιδεύουν."""
    E, cur, y, p, by = Elo(), None, [], [], {}
    for g in sched:
        if not g.get('played'):
            continue
        if cur and g['season'] != cur:
            E.new_season()
        cur = g['season']
        h, a = g['home']['logo'], g['away']['logo']
        if g['season'] != warmup:
            pr = E.expect(h, a)
            y.append(int(g['hs'] > g['as'])); p.append(pr)
            by.setdefault(g['season'], [[], []]); by[g['season']][0].append(y[-1]); by[g['season']][1].append(pr)
        E.update(h, a, g['hs'] - g['as'])
    s = lambda y, p: {'n': len(y), 'accuracy': accuracy(y, p), 'log_loss': log_loss(y, p), 'brier': brier(y, p),
                      'home_accuracy': sum(y) / len(y)} if y else {}
    return {**s(y, p), 'by_season': {k: s(*v) for k, v in sorted(by.items())}}, E


def main():
    games, sched = load()
    seasons = sorted({g['season'] for g in sched})
    elo, E = elo_walkforward(sched, seasons[0]) if seasons else ({}, Elo())
    out = {'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'model': MODEL_VERSION,
           'games_with_box': len(games), 'games_played': sum(1 for g in sched if g.get('played')), 'elo': elo}

    # πλήρες μοντέλο: walk-forward, εκπαίδευση με όσους έπαιξαν, πρόβλεψη με features όπως πριν από τον αγώνα
    rows, B = build_dataset(games)
    bt = []
    if len(rows) >= 150:
        pre = build_dataset(games, known_lineups=False)[0]
        bt = backtest(rows, min_train=max(120, len(rows) // 3), step=40, test_rows=pre)
        out['backtest'] = summarize(bt)
        out['backtest']['by_season'] = {s: summarize([x for x in bt if x['season'] == s]) for s in sorted({x['season'] for x in bt})}

    # προβλέψεις: οι επόμενοι αγώνες της τρέχουσας σεζόν που δεν έχουν παιχτεί
    preds = []
    if rows:
        P = Predictor().fit(rows)
        up = [g for g in sched if not g.get('played') and g['season'] == seasons[-1]][:14]
        if up:
            fr = [B.features_for(g['season'], g['home']['logo'], g['away']['logo'], g['date'] or '') for g in up]
            o = P.predict(fr)
            for j, g in enumerate(up):
                preds.append({'id': g['id'], 'date': g['date'], 'round': g.get('round'), 'home': g['home']['name'], 'away': g['away']['name'],
                              'p_home': round(float(o['p'][j]), 4), 'margin': round(float(o['y_margin'][j]), 1), 'total': round(float(o['y_total'][j]), 1),
                              'elo_p': round(E.expect(g['home']['logo'], g['away']['logo']), 4)})
    out['predictions'] = preds
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'latest.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
    b = out.get('backtest') or {}
    print(f"GBL: {out['games_played']} αγώνες, {len(games)} με box score | Elo: n={elo.get('n')} acc={elo.get('accuracy', 0):.3f} "
          f"(γηπεδούχος {elo.get('home_accuracy', 0):.3f})" + (f" | μοντέλο: n={b['n']} acc={b['accuracy']:.3f} brier={b['brier']:.3f} "
          f"Elo ίδιων αγώνων acc={b.get('elo_accuracy', 0):.3f} | MAE διαφοράς {b['margin_mae']:.1f}, συνόλου {b['total_mae']:.1f}" if b else '')
          + f" | {len(preds)} προβλέψεις")


if __name__ == '__main__':
    main()
