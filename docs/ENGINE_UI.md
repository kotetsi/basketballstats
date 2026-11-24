# Intelligence Engine — UI (Φάση 7)

Επέκταση των υπαρχουσών σελίδων με τα ίδια στυλ (`career`, `anmetrics`, `antbl`). Δεν δημιουργούνται νέες σελίδες ανά παίκτη. Όλα τα κείμενα υπάρχουν σε 5 γλώσσες (el, en, es, sr, tr). Κώδικας HTML: `src/engine/ui.mjs` (tests: `test/engine-ui.test.mjs`).

| Πού | Τι |
|---|---|
| Προφίλ παίκτη (`/paiktis/<slug>/` κ.λπ.) | Ενότητα «Πρόβλεψη επόμενου αγώνα»: πιθανότητα να παίξει, λεπτά αν παίξει, πόντοι/ριμπάουντ/ασίστ/τρίποντα (± τυπική απόκλιση), PIR, πιθανότητες ανά όριο και ποιότητα δεδομένων. Μόνο για παίκτες με πρόβλεψη (287 σήμερα). Οι μέσοι όροι σεζόν, η φόρμα και το πρόγραμμα υπάρχουν ήδη στη σελίδα |
| Νέα σελίδα «Πόσο πέφτει μέσα το μοντέλο» (`/akriveia-provlepseon/`, `/en/prediction-accuracy/`, `/es/precision-predicciones/`, `/sr/tacnost-prognoza/`, `/tr/tahmin-dogrulugu/`) | (1) αποτελέσματα σε πραγματικό χρόνο από το αρχείο pregame προβλέψεων, με προειδοποίηση για μικρό δείγμα, (2) backtest 7 σεζόν έναντι μέσου σεζόν/5/10 και του παλιού μοντέλου, (3) σύγκριση με τις αποδόσεις και κατάσταση της πύλης EV, (4) εκδόσεις μοντέλων. Στο sitemap, με hreflang και canonical |
| Σελίδα player props | Νέα εισαγωγή και μεθοδολογία (περιγράφουν το engine) και σύνδεσμος στη σελίδα ακρίβειας |

Δεδομένα: `data/projections/latest.json`, `data/predictions/report.json`, `data/predictions/market-eval.json`, `data/engine/evaluation-summary.json` (σύνοψη backtest, ενημερώνεται χειροκίνητα όταν αλλάζει μοντέλο).

Screenshots: `docs/engine-screenshots/`.
