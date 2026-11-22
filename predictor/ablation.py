"""Σύγκριση εκδοχών του Game Predictor στο ίδιο walk-forward backtest (χωρίς να γράφει τίποτα).
Οι ρυθμίσεις δίνονται με μεταβλητές περιβάλλοντος (PRED_LINEUPS=0, PRED_RAPM_PRIOR=0, PRED_RAPM_LAMBDA=…).
   python predictor/ablation.py "ετικέτα"
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import load_games, build_dataset  # noqa: E402
from model import backtest, summarize  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
games = load_games(ROOT)
rows, _ = build_dataset(games)
rows = [r for r in rows if (r.get('h_n_games') or 0) + (r.get('a_n_games') or 0) >= 2 or r.get('h_ortg') is not None]
bt = backtest(rows, min_train=max(200, len(rows) // 3), step=80)
s = summarize(bt)
# και χωριστά μόνο οι αγώνες με απουσίες (≥ 15% των πρόσφατων λεπτών μιας ομάδας λείπουν)
idx = {r['_key']: r for r in rows}
abs_bt = [x for x in bt if max(idx[x['key']].get('h_absent') or 0, idx[x['key']].get('a_absent') or 0) >= 0.15]
sa = summarize(abs_bt) if abs_bt else {}
env = {k: v for k, v in os.environ.items() if k.startswith('PRED_')}
print('ABLATION', json.dumps({'label': sys.argv[1] if len(sys.argv) > 1 else '', 'env': env,
      'all': {k: s.get(k) for k in ('n', 'log_loss', 'brier', 'accuracy', 'margin_mae', 'total_mae')},
      'absences': {k: sa.get(k) for k in ('n', 'log_loss', 'brier', 'accuracy', 'margin_mae')}}, ensure_ascii=False))
