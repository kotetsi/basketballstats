# Intelligence Engine — Κοινές προβλέψεις παικτών

`data/projections/latest.json`: **ένα** σύνολο προβλέψεων ανά παίκτη για την επόμενη αγωνιστική, για Fantasy και props. Δημιουργείται κάθε βράδυ από το `update.yml`, αμέσως μετά το Fantasy. Αν αποτύχει, δεν επηρεάζει τίποτα άλλο. **Δεν το διαβάζει ακόμα καμία σελίδα** (Φάσεις 5–7).

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
