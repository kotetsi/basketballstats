"""Game Predictor για το NBA, με τα δεδομένα του ESPN (data/nba, από το scripts/nba.mjs).

Ίδια features και ίδιο μοντέλο με την EuroLeague και τη GBL (features.py / model.py). Ακόμα χωρίς πεντάδες (stints)
και χωρίς διόρθωση τύχης στα τρίποντα (τα σουτ με θέση υπάρχουν, θα μπουν σε επόμενο βήμα).
Ουδέτερο γήπεδο (NBA Cup στο Λας Βέγκας, αγώνες στο εξωτερικό): χωρίς πλεονέκτημα έδρας.

  python predictor/nba.py      backtest χωρίς διαρροή + προβλέψεις των επόμενων ημερών → data/nba/model/latest.json
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import Game, SK, Elo, build_dataset  # noqa: E402
from model import Predictor, backtest, summarize, log_loss, brier, accuracy, MODEL_VERSION  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'nba' / 'model'
HORIZON_DAYS = 4


def team_box(t: dict) -> list:
    """σύνολα ομάδας του ESPN → διάνυσμα στη σειρά του SK (features.py)"""
    x = t.get('totals') or {}
    v = {'pts': x.get('pts', 0), 'fgm2': x.get('fgm', 0) - x.get('f3m', 0), 'fga2': x.get('fga', 0) - x.get('f3a', 0), 'fgm3': x.get('f3m', 0), 'fga3': x.get('f3a', 0),
         'ftm': x.get('ftm', 0), 'fta': x.get('fta', 0), 'oreb': x.get('oreb', 0), 'dreb': x.get('dreb', 0), 'tov': x.get('tov', 0), 'ast': x.get('ast', 0),
         'stl': x.get('stl', 0), 'blk': x.get('blk', 0), 'pf': x.get('pf', 0)}
    return [float(v[k] or 0) for k in SK]


def load(root: Path = ROOT):
    """→ (αγώνες με box score ως Game, όλοι οι αγώνες του προγράμματος)"""
    games, sched = [], []
    base = root / 'data' / 'nba'
    for sd in sorted(p for p in base.iterdir() if p.is_dir() and p.name.startswith('N')) if base.exists() else []:
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
            th, ta = b['teams'][0], b['teams'][1]          # πρώτη = γηπεδούχος (scripts/nba.mjs)
            h, a = th['id'], ta['id']
            per = max([s[0] for s in b.get('shots') or []] + [4])
            secs = 2880.0 + 300.0 * max(0, per - 4)
            played = {h: {p['id']: float(p.get('min') or 0) for p in th['players'] if not p.get('dnp') and (p.get('min') or 0) > 0},
                      a: {p['id']: float(p.get('min') or 0) for p in ta['players'] if not p.get('dnp') and (p.get('min') or 0) > 0}}
            ph = 'FF' if b.get('neutral') or g.get('neutral') else ('PO' if g.get('type') in (3, 5) else 'RS')
            games.append(Game(sd.name, int(g['id']), g['date'][:16], ph, h, a, int(b['hs']), int(b['as']), secs, {h: team_box(th), a: team_box(ta)}, played))
    games.sort(key=lambda x: (x.d, x.season, x.gc))
    sched.sort(key=lambda x: (x.get('date') or '', x['id']))
    return games, sched


def elo_walkforward(sched: list, warmup: str | None) -> tuple[dict, Elo]:
    E, cur, y, p = Elo(), None, [], []
    for g in sched:
        if not g.get('played') or g['home'].get('score') is None:
            continue
        if cur and g['season'] != cur:
            E.new_season()
        cur = g['season']
        h, a = g['home']['id'], g['away']['id']
        if g['season'] != warmup:
            y.append(int(g['home']['score'] > g['away']['score'])); p.append(E.expect(h, a, home=not g.get('neutral')))
        E.update(h, a, g['home']['score'] - g['away']['score'])
    return ({'n': len(y), 'accuracy': accuracy(y, p), 'log_loss': log_loss(y, p), 'brier': brier(y, p), 'home_accuracy': sum(y) / len(y)} if y else {}), E


def main():
    games, sched = load()
    seasons = sorted({g['season'] for g in sched})
    elo, E = elo_walkforward(sched, seasons[0] if len(seasons) > 1 else None)
    out = {'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'model': MODEL_VERSION,
           'games_with_box': len(games), 'games_played': sum(1 for g in sched if g.get('played')), 'elo': elo}
    rows, B = build_dataset(games)
    if len(rows) >= 250:
        pre = build_dataset(games, known_lineups=False)[0]
        bt = backtest(rows, min_train=max(200, len(rows) // 3), step=100, test_rows=pre)
        out['backtest'] = summarize(bt)
        out['backtest']['by_season'] = {s: summarize([x for x in bt if x['season'] == s]) for s in sorted({x['season'] for x in bt})}
    preds = []
    if rows:
        P = Predictor().fit(rows)
        now = datetime.now(timezone.utc)
        up = [g for g in sched if not g.get('played') and g['season'] == seasons[-1]
              and now - timedelta(hours=6) <= datetime.fromisoformat(g['date'].replace('Z', '+00:00')) <= now + timedelta(days=HORIZON_DAYS)]
        if up:
            fr = [B.features_for(g['season'], g['home']['id'], g['away']['id'], g['date'][:16], neutral=bool(g.get('neutral'))) for g in up]
            o = P.predict(fr)
            for j, g in enumerate(up):
                preds.append({'id': g['id'], 'date': g['date'], 'home': g['home'], 'away': g['away'], 'neutral': bool(g.get('neutral')),
                              'p_home': round(float(o['p'][j]), 4), 'margin': round(float(o['y_margin'][j]), 1), 'total': round(float(o['y_total'][j]), 1),
                              'elo_p': round(E.expect(g['home']['id'], g['away']['id'], home=not g.get('neutral')), 4)})
    out['predictions'] = preds
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'latest.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
    b = out.get('backtest') or {}
    print(f"NBA: {out['games_played']} αγώνες, {len(games)} με box score | Elo: n={elo.get('n')} acc={elo.get('accuracy', 0):.3f} (γηπεδούχος {elo.get('home_accuracy', 0):.3f})"
          + (f" | μοντέλο: n={b['n']} acc={b['accuracy']:.3f} brier={b['brier']:.4f} Elo ίδιων acc={b.get('elo_accuracy', 0):.3f} brier={b.get('elo_brier', 0):.4f} | MAE διαφοράς {b['margin_mae']:.1f}, συνόλου {b['total_mae']:.1f}" if b else '')
          + f" | {len(preds)} προβλέψεις")


if __name__ == '__main__':
    main()
