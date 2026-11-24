# Intelligence Engine — Κοινές προβλέψεις παικτών

`data/projections/latest.json`: **ένα** σύνολο προβλέψεων ανά παίκτη για την επόμενη αγωνιστική, για Fantasy και props. Δημιουργείται κάθε βράδυ από το `update.yml`, αμέσως μετά το Fantasy. Αν αποτύχει, δεν επηρεάζει τίποτα άλλο.

```
python fantasy/perf/minutes_hurdle.py --next   → data/projections/minutes.json   (λεπτά: min-hurdle-x2)
node scripts/engine-projections.mjs            → data/projections/latest.json    (στατιστικά, σκάλα, PIR)
```

## Περιεχόμενο ανά παίκτη

| Πεδίο | Σημασία |
|---|---|
| `minutes.p_play` | Πιθανότητα να παίξει: hurdle × κατάσταση (playing 1, doubtful 0,4, injured/rest 0, όπως το Fantasy) |
| `minutes.if_plays` / `expected` | Λεπτά αν παίξει / αναμενόμενα λεπτά |
| `stats.{pts,reb,ast,fg3}.mean / median / sd` | Κατανομή **αν παίξει** (αρνητική διωνυμική) |
| `stats.*.over["15.5"]` | P(πάνω από το όριο) **αν παίξει** (το prop ακυρώνεται αν δεν παίξει) |
| `stats.*.mean_exp` | Μέση τιμή με την πιθανότητα να μην παίξει |
| `pir.mean / mean_exp` | PIR/λεπτό του Fantasy × λεπτά hurdle |
| `quality` | `ok` · `uncertain` (αμφίβολος) · `experimental` (<6 αγώνες και χωρίς προηγούμενη σεζόν) · `out` · `insufficient` (<3 αγώνες ή χωρίς μοντέλο λεπτών: **χωρίς πρόβλεψη**) |
| `flags` | `few_games`, `doubtful`, `not_expected_to_play`, `no_minutes_model`, `no_pir_model` |

Στο επίπεδο του αρχείου: `version`, `models` (έκδοση και χρονοσφραγίδα κάθε μοντέλου), `generated_at`, `first_tip`, `pregame` (αν δημιουργήθηκε πριν από το πρώτο τζάμπολ). Η σκάλα ορίων ρυθμίζεται από το `site.config.json` → `engine.ladder`.

## Κανόνες

- Μόνο αγώνες με αγωνιστική < στόχο (tests: `test/engine-projections.test.mjs`, `fantasy/tests/test_minutes_hurdle.py`).
- Χωρίς αρκετά δεδομένα **δεν** βγαίνει πρόβλεψη· δεν «εφευρίσκεται».
- Το `latest.json` ξαναγράφεται σε κάθε εκτέλεση. Το αμετάβλητο αρχείο pregame προβλέψεων με snapshots είναι η Φάση 4.
- Αξιολόγηση: `docs/MODEL_EVALUATION.md` §3.1, §4.

## Fantasy (Φάση 5)

Σειρά στο `update.yml`: `minutes_hurdle.py --next` → `fantasy/run.py` → `engine-projections.mjs` → `engine-archive.mjs`.

Το `fantasy/run.py` (`apply_engine_minutes`) παίρνει τα **αναμενόμενα λεπτά** από το `data/projections/minutes.json` και υπολογίζει PIR = PIR/λεπτό του `pir-2stage-v2` × αυτά τα λεπτά. Τα P10/P50/P90 μετατοπίζονται κατά τη διαφορά, ώστε να μένει ίδιο το εύρος. Μετά εφαρμόζονται, όπως πριν, η κατάσταση του παίκτη (×0,4 αμφίβολος, ×0 τραυματίας/ξεκούραση) και η προσαρμογή για απόντες συμπαίκτες (`vacated.py`). Όλα τα εργαλεία Fantasy (optimizer, Round Planner, αρχηγός, αλλαγές, What-If, ρίσκο, value) διαβάζουν αυτούς τους αριθμούς από το `data/fantasy/latest.json`, οπότε **κανένας κανόνας παιχνιδιού, budget ή όριο ομάδας δεν αλλάζει**.

- Αν το `minutes.json` λείπει ή είναι για άλλη αγωνιστική/σεζόν, το Fantasy κρατά τα λεπτά του `pir-2stage-v2` (`minutes_model: null` στο `latest.json`).
- Το `engine-projections.mjs` ελέγχει ότι το αναμενόμενο PIR του κοινού αρχείου είναι ίδιο με του Fantasy. Η μόνη επιτρεπτή διαφορά είναι η προσαρμογή απόντων συμπαικτών, που υπάρχει μόνο στο Fantasy.
- Τεκμηρίωση της αλλαγής: `docs/MODEL_EVALUATION.md` §4.1 (MAE PIR 4,525 → 4,505, n=55.775, 6/7 σεζόν).
- Η σελίδα απόδοσης του Fantasy δείχνει ακόμα το backtest του `pir-2stage-v2` με τα δικά του λεπτά. Η μέτρηση της παραγωγής σε πραγματικό χρόνο είναι στο `data/predictions/report.json` (Φάση 4).
