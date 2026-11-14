"""Εκπαίδευση, backtest και προβλέψεις για τους επερχόμενους αγώνες.

  python predictor/run.py            κανονική εκτέλεση (CI)
  python predictor/run.py --no-bt    χωρίς walk-forward backtest (γρήγορο)

Γράφει: data/matchups/latest.json (προβλέψεις), data/matchups/backtest.json (αξιολόγηση), data/matchups/runs.jsonl (model_runs).
"""
from __future__ import annotations

import csv
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import load_games, build_dataset, Builder  # noqa: E402
from model import Predictor, backtest, summarize, confidence, MODEL_VERSION, ENGINE  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'matchups'
HORIZON_DAYS = 16


def ncdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def unavailable_set():
    s = set()
    try:
        fx = json.loads((OUT / 'fixtures.json').read_text())
        s |= {c for c, m in fx.get('avail', {}).items()}
    except Exception:
        pass
    try:
        for row in csv.reader((ROOT / 'data' / 'fantasy' / 'status.csv').read_text().splitlines()):
            if row and not row[0].startswith('#') and len(row) >= 2 and row[1].strip() in ('injured', 'rest'):
                s.add(row[0].strip())
    except Exception:
        pass
    # λίστα τραυματιών του site (traumaties.md): σίγουρες απουσίες (όχι οι αμφίβολοι με «?»), μέχρι την ημερομηνία επιστροφής
    try:
        import unicodedata
        norm = lambda x: ''.join(c for c in unicodedata.normalize('NFD', x) if unicodedata.category(c) != 'Mn').upper().strip()
        C = json.loads((ROOT / 'data' / 'cache.json').read_text())
        roster = [(p['c'], norm(p['n'].split(',')[0]), p['t'].split(';')[-1]) for p in C.get('players', [])]
        today = datetime.now(timezone.utc).date().isoformat()
        for line in (ROOT / 'traumaties.md').read_text().splitlines():
            parts = [x.strip() for x in line.split('|')]
            if len(parts) < 4 or not parts[0][:4].isdigit():
                continue
            ret = parts[3].lstrip('!')
            if ret.startswith('?') or (ret not in ('-', '') and ret < today[:len(ret)]):
                continue
            ids = [c for c, ln, t in roster if ln == norm(parts[1]) and t == parts[2]]
            if len(ids) == 1:
                s.add(ids[0])
    except Exception:
        pass
    return s


def main():
    games = load_games(ROOT)
    if len(games) < 120:
        print(f'Game Predictor: μόνο {len(games)} αγώνες, παραλείπεται')
        return
    rows, B = build_dataset(games)
    # οι πρώτοι αγώνες κάθε σεζόν χωρίς κανένα δεδομένο ομάδας είναι θόρυβος για την εκπαίδευση
    rows = [r for r in rows if (r.get('h_n_games') or 0) + (r.get('a_n_games') or 0) >= 2 or r.get('h_ortg') is not None]
    bt = [] if '--no-bt' in sys.argv else backtest(rows, min_train=max(200, len(rows) // 3), step=80)
    summ = summarize(bt)
    if bt:
        idx = {r['_key']: r for r in rows}
        calib_rows, calib_pred = [idx[x['key']] for x in bt], [x['p'] for x in bt]
    else:
        calib_rows, calib_pred = None, None
    P = Predictor().fit(rows, calib_rows, calib_pred)
    sigma = summ.get('margin_rmse') or 12.0
    P.sigma = sigma

    fx = json.loads((OUT / 'fixtures.json').read_text())
    unav = unavailable_set()
    now = datetime.now(timezone.utc)
    cur = {'E': fx['season'], 'U': 'U' + fx['season'][1:]}
    preds = []
    for f in fx['fixtures']:
        t = datetime.fromisoformat(f['t'].replace('Z', '+00:00').replace('.000', ''))
        if t < now - timedelta(hours=3) or t > now + timedelta(days=HORIZON_DAYS):
            continue
        season, h, a, d = cur[f['comp']], f['h'], f['a'], t.date().isoformat()
        if (season, h) not in B.teams or (season, a) not in B.teams:
            continue   # λείπουν κρίσιμα δεδομένα: καμία πρόβλεψη
        base = B.features_for(season, h, a, d, unavailable=unav)
        if base.get('h_ortg') is None or base.get('a_ortg') is None:
            continue
        variants = [base]
        # ίδιος αγώνας σε ανεστραμμένη έδρα (για τον simulator)
        swap = B.features_for(season, a, h, d, unavailable=unav)
        variants.append(swap)
        # ευαισθησία στις μέρες ξεκούρασης
        rest_grid = [1, 2, 3, 5, 7]
        for side in ('h', 'a'):
            for rd in rest_grid:
                v = dict(base)
                v[f'{side}_rest'] = rd
                v[f'{side}_b2b'] = int(rd <= 1)
                v['d_rest'] = v['h_rest'] - v['a_rest']
                variants.append(v)
        # επίδραση απουσίας κάθε βασικού παίκτη (8 με τα περισσότερα πρόσφατα λεπτά ανά ομάδα)
        keyp = []
        for side, tm in (('h', h), ('a', a)):
            T = B.teams[(season, tm)]
            rm = T.recent_minutes()
            tot = sum(rm.values()) or 1
            for pid, m in sorted(rm.items(), key=lambda x: -x[1])[:8]:
                v = dict(base)
                out_now = pid in unav
                v[f'{side}_absent'] = max(0.0, base[f'{side}_absent'] + (-m if out_now else m) / tot)
                v['d_absent'] = v['h_absent'] - v['a_absent']
                variants.append(v)
                keyp.append({'side': side, 'id': pid, 'min': round(m, 1), 'out': out_now})
        o = P.predict(variants)
        p0, m0, tot0, pos0 = float(o['p'][0]), float(o['y_margin'][0]), float(o['y_total'][0]), float(o['y_poss'][0])
        k = 2
        rest = {}
        for side in ('h', 'a'):
            rest[side] = {str(rd): round(float(o['y_margin'][k + i]) - m0, 2) for i, rd in enumerate(rest_grid)}
            k += len(rest_grid)
        for j, kp in enumerate(keyp):
            dm = float(o['y_margin'][k + j]) - m0
            kp['dm'] = round(dm if not kp['out'] else -dm, 2)   # πάντα: πόσο αλλάζει η διαφορά αν ο παίκτης ΛΕΙΠΕΙ (θετικό = υπέρ γηπεδούχου)
        hs, as_ = (tot0 + m0) / 2, (tot0 - m0) / 2
        preds.append({
            'comp': f['comp'], 'season': season, 'r': f['r'], 'h': h, 'a': a, 't': f['t'],
            'p_home': round(p0, 4), 'p_away': round(1 - p0, 4),
            'hs': round(hs, 1), 'as': round(as_, 1), 'margin': round(m0, 1), 'total': round(tot0, 1), 'pace': round(pos0, 1), 'poss': round(pos0, 1),
            'conf': confidence(p0, base.get('h_n_games') or 0, base.get('a_n_games') or 0),
            'n_h': base.get('h_n_games'), 'n_a': base.get('a_n_games'),
            'h_rest': base['h_rest'], 'a_rest': base['a_rest'], 'h_absent': round(base['h_absent'], 3), 'a_absent': round(base['a_absent'], 3),
            'sim': {'sigma': round(sigma, 2), 'swap': {'p_home': round(1 - float(o['p'][1]), 4), 'margin': round(-float(o['y_margin'][1]), 1), 'total': round(float(o['y_total'][1]), 1)},
                    'rest': rest, 'players': keyp},
        })
    gen = now.isoformat(timespec='seconds')
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {'model_version': MODEL_VERSION, 'engine': ENGINE, 'generated_at': gen, 'train_games': len(rows), 'features': len(P.names)}
    (OUT / 'latest.json').write_text(json.dumps({**meta, 'sigma': sigma, 'home_adv': P.home_adv, 'games': preds}, ensure_ascii=False))
    if bt:
        (OUT / 'backtest.json').write_text(json.dumps({**meta, 'summary': summ, 'by_season': {s: summarize([x for x in bt if x['season'] == s]) for s in sorted({x['season'] for x in bt})}}, ensure_ascii=False))
    # ιστορικό προβλέψεων ανά αγώνα (για Closing Line Value): πρώτη και τελευταία πρόβλεψη πριν από το τζάμπολ
    logf = OUT / 'pred_log.json'
    try:
        plog = json.loads(logf.read_text())
    except Exception:
        plog = {}
    for p in preds:
        gid = f"{p['comp']}-{p['r']}-{p['h']}-{p['a']}"
        if datetime.fromisoformat(p['t'].replace('Z', '+00:00').replace('.000', '')) < now:
            continue
        e = plog.setdefault(gid, {'first': {'p': p['p_home'], 't': gen, 'margin': p['margin'], 'total': p['total']}})
        e['last'] = {'p': p['p_home'], 't': gen, 'margin': p['margin'], 'total': p['total'], 'model_version': MODEL_VERSION}
    logf.write_text(json.dumps(plog))
    with open(OUT / 'runs.jsonl', 'a') as fh:
        fh.write(json.dumps({**meta, 'predictions': len(preds), **{k: summ.get(k) for k in ('n', 'log_loss', 'brier', 'accuracy', 'margin_mae', 'total_mae')}}) + '\n')
    print(f"Game Predictor ({ENGINE}): {len(rows)} αγώνες εκπαίδευσης, {len(preds)} προβλέψεις"
          + (f", backtest n={summ['n']} logloss={summ['log_loss']:.3f} brier={summ['brier']:.3f} acc={summ['accuracy']:.3f} MAE margin={summ['margin_mae']:.1f} total={summ['total_mae']:.1f}" if summ else ''))


if __name__ == '__main__':
    main()
