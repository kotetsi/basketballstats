# Intelligence Engine — Τεχνικό Audit (Φάση 1)

| | |
|---|---|
| Repository | `kotetsi/basketballstats`, branch `main`, commit `0d18b2b` (23/11/2026) |
| Ημερομηνία audit | 24/11/2026 |
| Εύρος | Όλο το repo: `build.mjs`, `src/`, `scripts/`, `fantasy/`, `predictor/`, `data/`, `test/`, `.github/workflows/`, `workers/` |
| Τι έτρεξε | `node build.mjs --offline` (επιτυχία, 9.071 σελίδες, ~30″), όλα τα 47 αρχεία `node --test` (241/241 μετά το build), `unittest` του `predictor/` (16/16) και του `fantasy/tests` (25/25), τα read-only scripts `props-baseline-compare.mjs` και `props-walk-forward.mjs` |
| Τι ΔΕΝ άλλαξε | Κανένα αρχείο κώδικα ή δεδομένων. Μόνο αυτό το έγγραφο είναι νέο |
| Τι δεν ελέγχθηκε | Τα secrets δεν διαβάστηκαν· καταγράφονται μόνο τα ονόματά τους όπως εμφανίζονται στα workflows. Τα ανοιχτά PR εξετάστηκαν μόνο σε επίπεδο περιγραφής (§I) |

Κατηγορίες ταξινόμησης: **Reusable as-is** · **Reusable with improvements** · **Needs replacement** · **Missing**.

---

## 0. Σύνοψη

Το project **δεν** είναι στατιστικό site χωρίς μοντέλα. Έχει ήδη τρία ξεχωριστά μοντέλα πρόβλεψης, αρχεία ιστορικού, backtests και σελίδα αξιολόγησης. Το κενό είναι η **ενοποίηση**: η πρόβλεψη λεπτών και η πρόβλεψη PIR του Fantasy (Python) δεν είναι η ίδια με την πρόβλεψη λεπτών και πόντων/ριμπάουντ/ασίστ του Prop Analyzer (Node). Λείπει επίσης ένα αμετάβλητο αρχείο προβλέψεων **ανά παίκτη**.

| Μοντέλο | Πού | Τι προβλέπει | Επικύρωση σήμερα |
|---|---|---|---|
| `pir-2stage-v2` (HistGradientBoosting, 2 στάδια) | `fantasy/` (Python) | λεπτά, PIR, P10/P50/P90, Fantasy points | Walk-forward 7 σεζόν, 38.546 γραμμές: MAE PIR **5,524** έναντι 5,654 του μέσου όρου 10 αγώνων (−2,3%) και 6,68 του μέσου θέσης· κάλυψη διαστήματος 80%: 81,7% |
| Props (αρνητική διωνυμική, λεπτά × ρυθμός) | `src/odds/props.mjs` (Node) | πόντοι, ριμπάουντ, ασίστ, τρίποντα, Π+Ρ, Π+Α, Π+Ρ+Α, Α+Ρ | Walk-forward αγωνιστικών 10–13 (795 εμφανίσεις): **δεν κερδίζει** τον μέσο όρο σεζόν σε MAE (πόντοι 4,292 έναντι 4,272· τρίποντα 0,803 έναντι 0,776)· κερδίζει τον μέσο όρο 5 αγώνων (2–3%) |
| Game Predictor `mp-1.4` (LightGBM/HGB) | `predictor/` (Python) | νίκη, διαφορά, σύνολο, pace | Time-based backtest, δημόσια σελίδα `/montelo/` |

Στις πραγματικές γραμμές bookmakers (αγωνιστικές 11–14, `data/odds/props-track.json`) η πιθανότητα του μοντέλου props είχε **Brier 0,2485 έναντι 0,2468 της αγοράς** (600 γραμμές με ≥2 bookmakers). Οι επιλογές με EV ≥ 8% ήταν 780, με ROI **−4,2%**. Το δείγμα είναι μικρό, αλλά **δεν υπάρχει σήμερα απόδειξη πλεονεκτήματος έναντι της αγοράς στα player props**. Αυτό πρέπει να φαίνεται στο site και να μη διαφημίζεται το αντίθετο.

---

## 1. Αρχιτεκτονική όπως είναι

```
GitHub Actions update.yml (02:15 καθημερινά + 17:00 Τρίτη–Παρασκευή)
 ├─ node build.mjs                 → λήψη από feeds.incrowdsports.com → data/cache.json → dist/ (1ο πέρασμα)
 ├─ scripts/pbp.mjs, shots.mjs     → data/pbp/, data/shots/ (play-by-play, συντεταγμένες σουτ)
 ├─ python fantasy/run.py          → data/fantasy/latest.json, history/, backtest.json
 ├─ scripts/fantasy-status-history → data/fantasy/status-history.jsonl (pregame κατάσταση παικτών)
 ├─ python fantasy/perf_run.py     → data/fantasy/perf/report.json (walk-forward όλων των εκδόσεων)
 ├─ node scripts/odds.mjs          → data/odds/latest.json, history.jsonl, props-history.jsonl (OddsPapi / The Odds API)
 ├─ python predictor/run.py        → data/matchups/latest.json, backtest.json, runs.jsonl
 ├─ node scripts/ledger.mjs        → data/ledger/predictions.jsonl (append-only, αλυσίδα SHA-256)
 ├─ node build.mjs --offline       → dist/ (2ο πέρασμα, με όλες τις προβλέψεις)
 ├─ portal-home, seo-prune, gone-redirects, e2e (Playwright), Telegram, κάρτες social
 └─ commit δεδομένων στο main → deploy GitHub Pages
```

- **Static site generator σε ένα αρχείο:** `build.mjs` 5.321 γραμμές· η συνάρτηση `main()` καλύπτει τις γραμμές 877–5.321. Η λογική των μοντέλων είναι σε ξεχωριστά καθαρά modules (`src/odds/`, `src/fantasy/`, `src/props/` κ.ά.), τα οποία ελέγχονται από tests. Η παρουσίαση όμως είναι σε μεγάλο βαθμό μέσα στο `build.mjs`.
- **Γλώσσες: 5, όχι 4.** `LANGS = ['el','en','es','sr','tr']`. Υπάρχει και τουρκική έκδοση (`/tr/`, `src/tr.mjs`). Το README αναφέρει ακόμα 4. Οι σελίδες παικτών και αγώνων στα sr/tr μπαίνουν σε noindex από το `scripts/seo-prune.mjs`.
- **Εξαρτήσεις:** η Node πλευρά δεν έχει npm εξαρτήσεις (Node ≥18). Η Python πλευρά χρειάζεται `numpy`, `pandas`, `scikit-learn` και προαιρετικά `lightgbm`. Το Playwright χρησιμοποιείται μόνο στα e2e του CI. Η απαίτηση «Node.js-only» δεν ισχύει ήδη σήμερα, και αυτό είναι αποδεκτό: η Python τρέχει δωρεάν στο Actions.
- **Μέγεθος:** το `dist/` είναι 547 MB με 14.833 αρχεία HTML. Το όριο του GitHub Pages είναι 1 GB, άρα κάθε νέος τύπος σελίδας ανά παίκτη × 5 γλώσσες πλησιάζει το όριο (βλ. §8).

---

## A. Πηγές δεδομένων

| Πηγή | Τι δίνει | Πού αποθηκεύεται | Ταξινόμηση |
|---|---|---|---|
| Επίσημο feed EuroLeague `feeds.incrowdsports.com` (v2/v3) | box score ανά παίκτη/αγώνα, bio, πρόγραμμα, βαθμολογία, EuroCup | `data/cache.json` (624 KB) | **Reusable as-is** |
| Ιδιο feed, προηγούμενες σεζόν | E2016–E2025: μόνο μέσοι όροι σεζόν (`hist`)· E2020–E2025: πλήρη box score ανά αγώνα | `cache.json.hist`, `data/fantasy/hist/E20xx.json` (έχει πεδίο `source`) | **Reusable as-is** |
| Live feed EuroLeague (στον browser) | live σκορ ανά 30″ | δεν αποθηκεύεται | **Reusable as-is** |
| Play-by-play / shots | stints, on/off, lineups, RAPM, xPTS | `data/pbp/`, `data/shots/` (E2023–E2026, U2023–U2026) | **Reusable as-is** |
| OddsPapi (κύριος πάροχος, δωρεάν 250 κλήσεις/μήνα) | ML, χάντικαπ, σύνολα, **player props**, `/historical-odds` | `data/odds/latest.json` (3,7 MB), `history.jsonl`, `props-history.jsonl` (18,6 MB, 64.941 γραμμές), `hist/` | **Reusable with improvements** (κόστος κλήσεων, βλ. §11) |
| The Odds API (2ος πάροχος) | κύριες αγορές | ίδια αρχεία | **Reusable as-is** |
| Επίσημες τιμές EuroLeague Fantasy | τιμές ανά αγωνιστική, μεταφερμένες χειροκίνητα (`raw-rNN.txt` → `prices-rNN.csv`) | `fantasy/official/` (r11–r14) | **Reusable with improvements** (χειροκίνητη διαδικασία) |
| Τραυματίες (χειροκίνητα) | `traumaties.md`, 9 στήλες με link πηγής | ανάγνωση στο build | **Reusable with improvements** |
| Τίτλοι τύπου (RSS), `press_fetch.mjs` | μόνο τίτλοι και links | `data/fantasy/press.json`, `headlines.json` | **Reusable as-is** |
| Μεταγραφές (`metagrafes.md`), tipsters (`tipsters/*.md`), άρθρα (`articles/*.md`) | χειροκίνητο περιεχόμενο | markdown | **Reusable as-is** |

**Provenance:** το `cache.json` έχει ένα μόνο `fetchedAt` για όλα. Οι γραμμές αγώνων δεν κρατούν πηγή ή ώρα λήψης ανά εγγραφή. Κάθε βράδυ το `fetchAll()` ξαναγράφει **ολόκληρο** το τμήμα της τρέχουσας σεζόν, οπότε μια διόρθωση στατιστικού από την EuroLeague αντικαθιστά σιωπηλά την παλιά τιμή. Η μόνη ιχνηλασιμότητα είναι το ιστορικό του git. Ταξινόμηση: **Reusable with improvements**.

---

## B. Αναγνωριστικά

| Οντότητα | Σήμερα | Παρατήρηση | Ταξινόμηση |
|---|---|---|---|
| Παίκτης | `c` = κωδικός EuroLeague (π.χ. `003469`), ίδιος σε cache, Fantasy, ledger, props-track, status-history | Σταθερός μεταξύ σεζόν. **Είναι ο φυσικός `player_id`· να μη δημιουργηθεί άλλος.** | **Reusable as-is** |
| Παίκτης σε πάροχο αποδόσεων | αντιστοίχιση ονόματος (`matchPlayer`: «ΕΠΩΝΥΜΟ, ΟΝΟΜΑ» → επώνυμο → αρχικό) | Δεν αποθηκεύεται χάρτης `oddspapi playerId → c`· κάθε build ξανακάνει αντιστοίχιση ονομάτων | **Reusable with improvements** |
| Παίκτης στο Fantasy | `fantasy/official/match.mjs` (όνομα → κωδικός) | ίδιο θέμα | **Reusable with improvements** |
| Παίκτης στους τραυματίες | ουσιαστικά επώνυμο + ομάδα | 5 εγγραφές **δεν αντιστοιχίστηκαν** στο build (Cordinier IST, Makoundou BAR, Medarevic RED, Sissoko BES, Ennis HTA): μόνο warning στο log | **Reusable with improvements** |
| Ομάδα | κωδικός EuroLeague 3 γραμμάτων (`OLY`, `PAN`…), σταθερά `TEAMS` με ονόματα/slugs 5 γλωσσών | Παίκτης με 2 ομάδες: `t = "BAS;DUB"` (η τρέχουσα τελευταία). Πολλά modules **εξαιρούν** αυτούς τους παίκτες (`if (p.t.includes(';')) continue`: teamModel, τραυματίες, όλα τα props scripts) | **Reusable with improvements** |
| Αγώνας | Δεν αποθηκεύεται το `gameCode` του feed. Γραμμή αγώνα: `[round, encDate, home, away, hs, as, played]`. Παράγεται `gid = "E-{round}-{HOME}-{AWAY}"` (ledger, odds, props) | Οι γραμμές box score του παίκτη δεν έχουν game id· συνδέονται με round + αντίπαλο. Για τα playoffs (σειρές με επαναλήψεις ζευγαριού) χρειάζεται έλεγχος μοναδικότητας | **Reusable with improvements** |
| Σεζόν | `E2026` / `U2026` | — | **Reusable as-is** |

---

## C. Στατιστικοί υπολογισμοί και αντιστοίχιση με τις οντότητες της προδιαγραφής

### Γραμμή αγώνα παίκτη (`cache.json → players[].g[]`, 26 θέσεις)

| idx | πεδίο | idx | πεδίο |
|---|---|---|---|
| 0 | αγωνιστική | 13/14 | FTM / FTA |
| 1 | ημερομηνία (UTC) | 15/16 | επιθετικά / αμυντικά ριμπάουντ |
| 2 | αντίπαλος | 17 | ασίστ |
| 3 | εντός (1/0) | 18 | κλεψίματα |
| 4/5 | πόντοι ομάδας / αντιπάλου | 19 | λάθη |
| 6 | βασικός (1/0) | 20/21 | κοψίματα υπέρ / κατά |
| 7 | **δευτερόλεπτα** | 22/23 | φάουλ που έκανε / δέχτηκε |
| 8 | πόντοι | 24 | +/− |
| 9/10 | 2PM / 2PA | 25 | PIR (valuation) |
| 11/12 | 3PM / 3PA | | |

**Όλα τα πεδία του «Player game statistics» της προδιαγραφής υπάρχουν ήδη.** Λείπουν μόνο `game_id`, `team_id` ανά γραμμή (για παίκτες με 2 ομάδες προκύπτει από το `home` + το πρόγραμμα) και πηγή/ώρα λήψης. Το ίδιο σχήμα, με λίγα πεδία λιγότερα (χωρίς `bd`, `age`), χρησιμοποιείται στα `data/fantasy/hist/E20xx.json`.

| Οντότητα προδιαγραφής | Υπάρχει ως | Τι λείπει |
|---|---|---|
| Players | `players[]`: `c, n, t, pos, ct (χώρα, όνομα), no, age, bd, h, w` | `active_status` (σήμερα προκύπτει από τραυματίες, Fantasy status, κενά συμμετοχής)· ISO κωδικός εθνικότητας |
| Teams | σταθερά `TEAMS` + `league.stand` | καθαρή οντότητα `team/season/league`· η EuroCup είναι ξεχωριστή δομή `ec` |
| Games | `league.games` + `venue` | `game_id` του feed, κατάσταση πέρα από played/όχι (αναβολή, live) |
| Player game stats | `players[].g[]` | `game_id`, `team_id`, provenance |

### Υπολογισμοί που υπάρχουν

| Υπολογισμός | Αρχείο | Ταξινόμηση |
|---|---|---|
| Ratings ομάδων ανά 100 κατοχές, pace, απλή πρόβλεψη (`teamModel`, μόνο με αγώνες πριν από την αγωνιστική) | `build.mjs:766` | **Reusable as-is** (fallback) |
| Άμυνα ανά θέση (PIR/πόντοι/ριμπάουντ/ασίστ/τρίποντα ανά θέση) | `src/odds/props.mjs → defenseVsPos`, `fantasy/features.py` | **Reusable with improvements**: ακατέργαστοι μέσοι όροι, χωρίς shrinkage, χωρίς προσαρμογή για τη δύναμη αντιπάλων, θέση G/F/C από το bio |
| On/off, WOWY, lineups, RAPM (ridge με επιλογή λ με CV) | `src/analytics/` | **Reusable as-is** |
| xPTS (αναμενόμενοι πόντοι από ζώνες σουτ) | `src/odds/xpts.mjs` | **Reusable as-is** (τεκμηριωμένη μικρή βελτίωση στο backtest) |
| Γραμμές/hit rates, «με και χωρίς», Θερμόμετρο φόρμας | `src/props/calc.mjs`, `build.mjs` | **Reusable as-is** |
| Προσομοίωση σεζόν (5.000 runs) | `src/sim/season.mjs` | **Reusable as-is** |
| Win probability αγώνα | `src/game/wp.mjs` | **Reusable as-is** |

---

## D. Fantasy

| Εργαλείο | Αρχεία | Ταξινόμηση | Σχόλιο |
|---|---|---|---|
| Κανόνες (100 credits, 4G/4F/2C + προπονητής, έως 6 ανά ομάδα, σχηματισμοί, αρχηγός ×2, πάγκος 50%, +10% νίκη, πόντοι προπονητή) | `src/fantasy/rules.mjs`, `CLASSIC_RULES` | **Reusable as-is** | Οι αλλαγές ανά αγωνιστική είναι μέσα στο `tradesAllowed` |
| Optimizer (DP + branch-and-bound, safe/balanced/ceiling) | `solver.mjs`, `optimizer.mjs` | **Reusable as-is** | Επαληθεύεται στο build («optimal») |
| Round Planner / turns (ημέρες αγωνιστικής) | `turns.mjs`, `manager.mjs → planRound` | **Reusable as-is** | |
| Captain Advisor | `captain.mjs`, `fantasy/perf/captain.py` | **Reusable with improvements** | Backtest 200 αγωνιστικών: top-10 στο 34,5%. Βασίζεται στα P10/P50/P90 του PIR |
| Transfer Impact / multi-trade | `manager.mjs → tradeEval, multiTrade` | **Reusable with improvements** | Λαμβάνει υπόψη τιμή, ταμείο, αλλαγές που απομένουν, ορίζοντα 3 αγωνιστικών, ρίσκο. Δεν προβλέπει ακόμα μεταβολή τιμής (υπάρχει `price_roll.py`, `guide.mjs → priceChange`) |
| What-If Simulator | `whatif.mjs` | **Reusable as-is** | |
| Buy/Sell, value grades | `value.mjs → signalOf, valueBoard` | **Reusable with improvements** | |
| Expected Fantasy Points | `value.mjs → fpNext, fp3`, `run.py` | **Reusable as-is** | |
| Risk indicator | `manager.mjs → injuryRisk, minutesRisk`, `captain.mjs → riskScore` | **Reusable with improvements** | Δύο διαφορετικές `minutesRisk` (εδώ και στο `src/odds/core.mjs`) |
| Assistant (OCR στιγμιότυπου ομάδας, Vision worker, live tracker) | `assistant.mjs`, `workers/fantasy-vision` | **Reusable as-is** | Το `fantasyVisionEndpoint` είναι κενό στο config |
| Live score Fantasy, alerts, round review | `live.mjs`, `livetracker.js` | **Reusable as-is** | |
| Σελίδα απόδοσης μοντέλου Fantasy | `perfpage.mjs`, `perf_run.py` | **Reusable as-is** | MAE/RMSE/corr/coverage/ECE ανά αγωνιστική, ομάδα, έκδοση, νέοι/παλιοί παίκτες |

**Συμπέρασμα:** το Fantasy είναι η πιο ώριμη ενότητα. Στη Φάση 5 δεν χρειάζεται να ξαναγραφτεί κάτι. Χρειάζεται μόνο να διαβάζει τα λεπτά και το PIR από το κοινό αρχείο projections (§E).

---

## E. Player projections

### Τι υπάρχει

1. **PIR / λεπτά (Fantasy)**, `fantasy/run.py` + `model.py` + `features*.py`, έκδοση `pir-2stage-v2`, με μητρώο εκδόσεων και rollback στο `data/fantasy/models.json`.
   - Στάδιο 1, λεπτά: m5, m10, play rate, start rate, ξεκούραση, back-to-back, τάση, απουσίες συμπαικτών (`vacated.py`), επιστροφή από απουσία, αλλαγή ρόλου, ταξίδι, φάουλ/36′.
   - Στάδιο 2, PIR/λεπτό: διόρθωση πάνω σε Bayesian μέσο όρο με shrinkage προς τη θέση, usage, άμυνα αντιπάλου (γενική και ανά θέση), pace, έδρα, προηγούμενη σεζόν.
   - P10/P50/P90: quantile regression με conformal διεύρυνση.
   - **Ταξινόμηση: Reusable with improvements.** Καλύπτει μόνο PIR και λεπτά, όχι πόντους, ριμπάουντ, ασίστ ή τρίποντα.
2. **Props (πόντοι, ριμπάουντ, ασίστ, τρίποντα και συνδυασμοί)**, `src/odds/props.mjs → project, nextProjections`.
   - Λεπτά: εκθετικός μέσος όρος (μισή ζωή 3 αγώνες) + ανακατανομή λεπτών απόντων ανά θέση (`teamMinutes`, `redistribute`, share 0,45, όριο 36′) + προαιρετικά `role.mjs`.
   - Ρυθμός ανά λεπτό: εκθετικός μέσος (μισή ζωή 8) με shrinkage προς τη λίγκα (40 «ψεύτικα» λεπτά). Πλαίσιο αγώνα από τους προβλεπόμενους πόντους ομάδας (μόνο σε πόντους/ασίστ/τρίποντα). Διόρθωση xPTS.
   - Κατανομή: **αρνητική διωνυμική ανά stat** με διαφορετική υπερδιασπορά (pts 3, reb 1, ast 1, fg3 1,15) + αβεβαιότητα λεπτών (sd 8′). Η άμυνα αντιπάλου ανά θέση **δεν** μπαίνει στην πρόβλεψη· εμφανίζεται μόνο στη σελίδα.
   - **Ταξινόμηση: Reusable with improvements.** Η δομή (ξεχωριστή κατανομή ανά stat, παράμετροι με τεκμηρίωση backtest) είναι σωστή. Η ακρίβεια όμως δεν ξεπερνά τον μέσο όρο σεζόν.

### Αποτελέσματα που μετρήθηκαν σε αυτό το audit (walk-forward, train αγων. 1–9, validation 10–13, n=795, ίδιο δείγμα για όλες τις μεθόδους)

| Stat | MAE μοντέλου | MAE μέσου σεζόν | MAE μέσου 5 | Διαφορά έναντι σεζόν |
|---|---|---|---|---|
| Πόντοι | 4,292 | 4,272 | 4,419 | −0,5% (χειρότερο) |
| Ριμπάουντ | 1,657 | 1,646 | 1,692 | −0,7% |
| Ασίστ | 1,204 | 1,195 | 1,226 | −0,8% |
| Τρίποντα | 0,803 | 0,776 | 0,805 | −3,5% |
| Π+Ρ+Α | 5,536 | 5,510 | 5,689 | −0,5% |

Σημειώσεις: (α) η αξιολόγηση δεν περιλαμβάνει ανακατανομή λόγω απουσιών ή πλαίσιο αγώνα· (β) αξιολογούνται μόνο εμφανίσεις όπου ο παίκτης έπαιξε (υπό τη συνθήκη ότι παίζει)· (γ) η βαθμονόμηση για τους πόντους δείχνει συστηματικά λίγο υψηλότερη πραγματική συχνότητα over από την προβλεπόμενη (π.χ. 0,57 → 0,62), κάτι που εξηγεί το `calShift`.

### Δύο διαφορετικά «αναμενόμενα λεπτά» για τον ίδιο παίκτη

Το Fantasy και ο Prop Analyzer υπολογίζουν **διαφορετικά λεπτά** για τον ίδιο παίκτη στον ίδιο αγώνα, με διαφορετικούς κανόνες απουσιών: το Python διαβάζει `status.csv`/Fantasy status, το Node διαβάζει `traumaties.md` + Fantasy status. Αυτό είναι το βασικό εμπόδιο για «ένα κοινό engine». **Ταξινόμηση της ενοποίησης: Missing.**

---

## F. Betting και prediction tools

| Εργαλείο | Αρχεία | Ταξινόμηση | Σχόλιο |
|---|---|---|---|
| Implied probability, devig, edge, κατηγορίες | `src/odds/core.mjs` | **Reusable as-is** | |
| Fair odds `1/p`, EV `p·odds − 1` | `value.mjs → fairOdds, evPct`, `props.mjs → ev` | **Reusable as-is** | Ίδιοι τύποι με την προδιαγραφή |
| Value board αγώνων (ML/χάντικαπ/σύνολο) με **πύλη αξιοπιστίας** (ECE ≤ 0,05, n ≥ 500, CLV n ≥ 100) | `value.mjs → valueBoard, reliability` | **Reusable as-is** | |
| Prop value / Prop Analyzer / props board | `props.mjs → gameProps`, `src/props/` | **Reusable with improvements** | Η πύλη αξιοπιστίας **δεν** εφαρμόζεται στα props. Το EV υπολογίζεται με μείξη 50% μοντέλο + 50% αγορά, όριο EV 8%, σημαίες doubtful/sample/gap/minutes. Δεν καταγράφεται έκδοση μοντέλου |
| CLV, line movement / steam, red flags | `core.mjs`, `closing.mjs`, `redflags.mjs`, `build-odds.mjs` | **Reusable as-is** | |
| Μητρώο αδειοδοτημένων bookmakers ανά χώρα/γλώσσα, όρια ηλικίας | `data/odds/licensed.json`, `bookmakers-gr.json` | **Reusable with improvements** | gr → ΕΕΕΠ **21+** (σωστό για την Ελλάδα, η προδιαγραφή γράφει 18+), uk/es/rs 18+. **Δεν υπάρχει εγγραφή για `tr`.** Τελευταίος έλεγχος 09/11/2026 |
| Δημόσιο ledger προβλέψεων αγώνων (append-only, αλυσίδα SHA-256, `verifyChain` στο CI) | `src/odds/ledger.mjs`, `data/ledger/predictions.jsonl` (198 γραμμές) | **Reusable as-is** | Καλό πρότυπο για το αρχείο παικτών |
| Παρολί αγωνιστικής, tipsters (αυτόματη βαθμολόγηση), Telegram | `build.mjs`, `scripts/telegram.mjs` | **Reusable as-is** | |
| Game Predictor + `/montelo/` | `predictor/` | **Reusable as-is** | |
| Premium/Stripe, λογαριασμοί (Cloudflare Worker + D1) | `workers/account`, `docs/premium-billing-plan.md` | εκτός εύρους | `premium.enabled: false` |

---

## G. Τραυματίες και διαθεσιμότητα

| Μηχανισμός | Ταξινόμηση | Σχόλιο |
|---|---|---|
| `traumaties.md` (χειροκίνητο: ημερομηνία, παίκτης, ομάδα, επιστροφή με `!`/`?`/`+`, σημειώσεις σε 4 γλώσσες, πηγή) | **Reusable with improvements** | Τα τουρκικά παίρνουν το αγγλικό κείμενο. Η αντιστοίχιση γίνεται με επώνυμο: 5 αποτυχίες σήμερα. Δεν κρατιέται ιστορικό αλλαγών πέρα από το git |
| Αυτόματο «έλειψε από 2+ τελευταίους αγώνες» | **Reusable as-is** | |
| Fantasy status (`status.csv` + επίσημο Fantasy + `dom_fetch`) | **Reusable as-is** | |
| **Pregame αρχείο κατάστασης** `data/fantasy/status-history.jsonl` (`captured_at`, round, player_id, status, source) από 16/11/2026 | **Reusable as-is** | Είναι το κλειδί για backtest απουσιών χωρίς διαρροή. Υπάρχει μόνο για ~2 αγωνιστικές |
| Διάρκεια απουσίας, πιθανότητα να παίξει (αμφίβολος ≠ 50%) | **Missing** | |
| Τιμωρίες | εν μέρει (`!`) | |

---

## H. Ιστορικά δεδομένα

| Δεδομένα | Κάλυψη | Ταξινόμηση |
|---|---|---|
| Box score ανά αγώνα | E2020–E2026 (7 σεζόν, ~38.500 εμφανίσεις παίκτη) | **Reusable as-is** |
| Μέσοι όροι σεζόν | E2016–E2025 | **Reusable as-is** |
| PBP / shots | E2023–E2026, EuroCup U2023–U2026 | **Reusable as-is** |
| Walk-forward προβλέψεις PIR όλων των εκδόσεων + baselines | `data/fantasy/perf/pred_E20xx.csv.gz` (με `generated_at`) | **Reusable as-is**. Είναι backtest, όχι πραγματικές pregame προβλέψεις |
| Πραγματικές pregame προβλέψεις PIR | `data/fantasy/history/r{N}_{ημερ.}_{έκδοση}.json` από 03/11/2026 | **Reusable with improvements**: ίδιο όνομα αρχείου για 2 εκτελέσεις την ίδια μέρα ⇒ η δεύτερη (17:00) **αντικαθιστά** την πρώτη· δεν ενώνονται αυτόματα με το αποτέλεσμα |
| Αποδόσεις αγώνων | `odds/history.jsonl` (9.755 αλλαγές) | **Reusable as-is** |
| Αποδόσεις props | Ζωντανή συλλογή από την αγωνιστική 11 (`props-history.jsonl`, με `t` = αλλαγή τιμής και `seen` = λήψη) + ιστορικές κλήσεις για τις αγωνιστικές 9–10 (`odds/hist/`) | **Reusable with improvements**. Για αγωνιστικές πριν από την 9η δεν υπάρχουν και δεν μπορούν να αγοραστούν δωρεάν |
| Pregame πιθανότητα props + αποτέλεσμα | `props-track.json` (6.116 γραμμές, αγων. 11–14) | **Needs replacement**: δες §5 |

---

## I. Tests και CI

- **47 αρχεία Node tests (241 tests)**: όλα περνούν **αφού** τρέξει το build. Χωρίς `dist/` αποτυγχάνουν 18 (`seo`, `portal-routes`, `premium-public-build`). Δεν υπάρχει ενιαίο `npm test`. Το `package.json` έχει μόνο `build`, `build:offline`, `preview`.
- **Το `update.yml` τρέχει 30 από τα 47 αρχεία** (28 στο βήμα unit tests + `seo`, `seo-prune`). Δεν τρέχουν εκεί 17, ανάμεσά τους τα `prop-analyzer`, `props-market-audit`, `odds-sanity`, `totals-track`, `win-probability`, `five`, `premium-gate`. Μερικά τρέχουν σε άλλα workflows (`account-test`, `quiz-check`, `portal-pr-check`, `props-calibration`, `premium-data-*`).
- **Python:** `predictor` 16 tests, `fantasy/tests` 25 tests: όλα περνούν. Τρέχουν στο CI.
- **E2E (Playwright):** compare, odds-value, prop-analyzer, quiz, assistant.
- **Τα tests τρέχουν μέσα στο ίδιο workflow που κάνει commit στο `main` και deploy.** Δεν υπάρχει «πύλη» PR για κώδικα μοντέλων. Το `portal-pr-check.yml` καλύπτει μόνο την αρχική.
- **Validation δεδομένων:** δεν υπάρχει schema validation για το `cache.json` ή τα αρχεία προβλέψεων. Υπάρχουν μόνο έλεγχοι λογικής (`odds-sanity`, `props-market-audit`, `meta-check`, `odds-check`, alert για stale feed).
- **Το `node build.mjs --offline` δεν είναι καθαρό:** τροποποιεί αρχεία που παρακολουθούνται από το git (`data/odds/props-track.json`, `daytips.json`, `sitemap-lastmod.json`, `title-odds.json`). Ένα τοπικό build δηλαδή αλλάζει το ιστορικό track. Στο audit τα αρχεία επαναφέρθηκαν με `git checkout`.
- **Μετάφραση:** το build αναφέρει 2 αμετάφραστα strings στα en/es/sr/tr (σχετικά με το Game Predictor).

**Ταξινόμηση:** tests **Reusable as-is**· CI **Reusable with improvements**.

### Ανοιχτά pull requests (24/11/2026)

| PR | Τίτλος | Κατάσταση | Σχέση με το engine |
|---|---|---|---|
| #4 | Research: EuroLeague player prop value backtesting foundation | draft, +30, clean | Επικαλύπτεται με τη Φάση 3/4 (backtest props με pregame πιθανότητες). Πρόταση: να απορροφηθεί στη Φάση 3 και να κλείσει, για να μην υπάρχουν δύο backtests |
| #3 | Probe OddsPapi historical odds availability | draft, +206, clean | Χρήσιμο για τον έλεγχο του §11. Το `scripts/props-history.mjs` στο `main` καλύπτει ήδη `/historical-odds` στην πράξη. Πιθανότατα παρωχημένο |
| #2, #14, #15 | Advanced Player Finder (WIP, port, φίλτρο ομάδας) | draft, **conflicts** (dirty) | Ανεξάρτητο από το engine. Το #14 αντικαθιστά το #2 και το #15 βασίζεται στο #14 |
| #12 | Day navigation στη σελίδα επόμενων αγώνων | ready, clean | Ανεξάρτητο |

Κανένα ανοιχτό PR δεν αγγίζει τα `src/odds/props.mjs`, `fantasy/` ή `data/ledger/`, οπότε δεν μπλοκάρει τη Φάση 2.

---

## 4. Πίνακας ταξινόμησης (σύνοψη)

| Λειτουργία | Ταξινόμηση |
|---|---|
| Λήψη δεδομένων EuroLeague, cache, fallback | Reusable as-is |
| Σχήμα box score ανά αγώνα | Reusable with improvements (game_id, team_id, provenance) |
| Ταυτότητα παίκτη (`c`) | Reusable as-is |
| Αντιστοίχιση ονομάτων (odds, Fantasy, τραυματίες) | Reusable with improvements (μόνιμος χάρτης + αναφορά αποτυχιών) |
| Ratings ομάδων, pace, RAPM, on/off, xPTS | Reusable as-is |
| Άμυνα ανά θέση | Reusable with improvements (smoothing, χρήση στο μοντέλο) |
| Μοντέλο PIR/λεπτών (Python) | Reusable with improvements |
| Μοντέλο props (Node) | Reusable with improvements |
| **Κοινό αρχείο projections ανά παίκτη/αγώνα (ένα σύνολο λεπτών για όλους)** | **Missing** |
| Κατανομές και πιθανότητες ορίων | Reusable with improvements (υπάρχουν μόνο για γραμμές bookmaker, όχι για ρυθμιζόμενη σκάλα ορίων· PIR με κανονική προσέγγιση από P10/P50/P90) |
| Μητρώο εκδόσεων μοντέλων | Reusable with improvements (υπάρχει στο Fantasy και στο Game Predictor, λείπει στα props) |
| Ledger αγώνων (append-only, hash) | Reusable as-is |
| **Αρχείο pregame προβλέψεων παικτών (append-only, snapshots, settlement, σφάλματα)** | **Missing** (το `props-track` χρειάζεται αντικατάσταση· το `fantasy/history` βελτίωση) |
| Αξιολόγηση PIR (walk-forward, baselines, ανά ομάδα/αγωνιστική/έκδοση) | Reusable as-is |
| Αξιολόγηση props (walk-forward, baselines σεζόν/5) | Reusable with improvements (λείπει ο μέσος όρος 10 αγώνων, ανά εύρος λεπτών, ανά παίκτη, μόνιμη αναφορά) |
| `docs/MODEL_EVALUATION.md`, ενιαίο dashboard | Missing |
| Fantasy optimizer / planner / captain / trade / what-if | Reusable as-is |
| Value αγώνων με πύλη αξιοπιστίας | Reusable as-is |
| Value props | Reusable with improvements (πύλη αξιοπιστίας, έκδοση μοντέλου) |
| Μητρώο αδειοδοτημένων bookmakers | Reusable with improvements (εγγραφή `tr`) |
| Τραυματίες | Reusable with improvements |
| Pregame αρχείο κατάστασης | Reusable as-is (πρέπει να συνεχίσει να μαζεύει δεδομένα) |
| Unit/E2E tests | Reusable as-is |
| CI πύλη για αλλαγές μοντέλων, schema validation | Missing |

---

## 5. Διαρροή δεδομένων (leakage) και ακεραιότητα

| # | Εύρημα | Σοβαρότητα |
|---|---|---|
| L1 | Το `props-track.json` **ξαναγράφει** την πιθανότητα του μοντέλου (`x[7]`) και της αγοράς σε κάθε εκτέλεση πριν από τον αγώνα. Κρατά μόνο την τελευταία. Δεν έχει έκδοση μοντέλου ή μέση τιμή/διασπορά και αλλάζει και από τοπικό offline build. Δεν είναι αμετάβλητο αρχείο. | Υψηλή |
| L2 | Το `fantasy/history/r{N}_{ημερομηνία}_{έκδοση}.json` αντικαθίσταται αν το μοντέλο τρέξει 2 φορές την ίδια μέρα (02:15 και 17:00). | Μέτρια |
| L3 | Το `scripts/props-history-eval.mjs` θεωρεί απόντες όσους **δεν έπαιξαν** στον αγώνα-στόχο (box score). Είναι διαρροή μελλοντικής πληροφορίας. Το ίδιο το αρχείο το σημειώνει· το `props-backtest.mjs --team` είναι ήδη απενεργοποιημένο για τον ίδιο λόγο. Τα αποτελέσματα αυτού του script δεν πρέπει να χρησιμοποιούνται ως απόδειξη ακρίβειας. | Μέτρια |
| L4 | Τα walk-forward των props αξιολογούν μόνο όσους έπαιξαν στον αγώνα-στόχο. Αυτό είναι σωστό για props «αν παίξει» (void), όχι όμως για τα αναμενόμενα λεπτά ή το Fantasy. | Χαμηλή, χρειάζεται τεκμηρίωση |
| L5 | Η τελική πιθανότητα props μειγνύει 50% με τη χωρίς-vig τιμή της αγοράς **τη στιγμή που τρέχει**. Σε ιστορική αξιολόγηση πρέπει να χρησιμοποιείται μόνο τιμή με `t` πριν από την ώρα της πρόβλεψης, ποτέ το κλείσιμο. | Μέτρια |
| L6 | Διορθώσεις box score από την EuroLeague αντικαθιστούν σιωπηλά τις παλιές τιμές στο `cache.json`. Η ιχνηλασιμότητα υπάρχει μόνο μέσω git. | Χαμηλή |
| L7 | Καλό: το Fantasy walk-forward εκπαιδεύει μόνο με προηγούμενες αγωνιστικές, το ledger αγώνων είναι append-only με έλεγχο αλυσίδας, το `teamModel(players, maxRound)` κόβει στον αγώνα-στόχο, υπάρχει pregame `status-history`. | — |

---

## 6. Κρίσιμοι περιορισμοί δεδομένων

1. **Ιστορικές αποδόσεις props:** μόνο αγωνιστικές 9–14 της τρέχουσας σεζόν (~6.000 γραμμές με αποτέλεσμα). Το OddsPapi δίνει `/historical-odds`, αλλά κάθε αγώνας κοστίζει 1 κλήση από τις 250 δωρεάν του μήνα. Η προδιαγραφή ζητά να μην υποθέσουμε περισσότερα: **η αξιολόγηση της στατιστικής ακρίβειας προχωράει ανεξάρτητα από τις αποδόσεις** (7 σεζόν box score). Η αξιολόγηση της αξίας έναντι της αγοράς θα έχει μικρό δείγμα για μήνες.
2. **Ιστορικό τραυματιών/διαθεσιμότητας:** pregame snapshots μόνο από 16/11/2026. Για παλιότερες σεζόν δεν υπάρχει γνώση των απουσιών πριν από το τζάμπολ. Οποιοδήποτε backtest ανακατανομής λεπτών σε αυτές θα είχε διαρροή.
3. **Βασική πεντάδα πριν από τον αγώνα:** δεν υπάρχει πηγή. Το `startFive` είναι γνωστό μόνο μετά. Ως feature πρέπει να χρησιμοποιείται μόνο το ποσοστό ως βασικός στους προηγούμενους αγώνες.
4. **Επίσημες τιμές Fantasy:** χειροκίνητη μεταφορά ανά αγωνιστική (r11–r14). Πριν από αυτές το μοντέλο τιμών είναι εκτίμηση.
5. **Θέσεις:** τρεις κατηγορίες (G/F/C) από το bio ή τον επίσημο Fantasy. Η άμυνα ανά θέση έχει ~13 αγώνες ανά ομάδα, άρα χρειάζεται smoothing.
6. **Παίκτες με 2 ομάδες** εξαιρούνται από αρκετούς υπολογισμούς (βλ. §B).
7. **Όγκος repo/site:** `props-history.jsonl` 18,6 MB, `status-history.jsonl` 6,8 MB, `odds/latest.json` 3,7 MB, μεγαλώνουν καθημερινά. Το `dist/` είναι 547 MB έναντι ορίου 1 GB του GitHub Pages. Το νέο αρχείο προβλέψεων πρέπει να γράφεται σε αρχεία ανά αγωνιστική/μήνα (JSONL, προαιρετικά gzip) και **όχι** ως νέες HTML σελίδες ανά παίκτη × γλώσσα.
8. **Νομικά/ρυθμιστικά:** Ελλάδα 21+, όχι 18+. Η τουρκική έκδοση δεν έχει μητρώο αδειοδοτημένων bookmakers, άρα **δεν πρέπει να δείχνει προσφορές στοιχήματος** μέχρι να αποφασιστεί. Οι όροι του feed της EuroLeague για εμπορική χρήση δεν έχουν ελεγχθεί (το README το επισημαίνει).

---

## J. Τι λείπει (συγκεντρωτικά)

1. Ένα **κοινό αρχείο projections** (`data/projections/`) ανά παίκτη/αγώνα με αναμενόμενα λεπτά, πόντους, ριμπάουντ, ασίστ, τρίποντα και PIR. Θα παράγεται από **ένα** μοντέλο λεπτών, με ενιαίους κανόνες διαθεσιμότητας, έκδοση, χρονοσφραγίδα και δείκτη ποιότητας δεδομένων.
2. **Σκάλα ορίων με ρυθμιζόμενες τιμές** (π.χ. πόντοι 10,5/15,5/20,5) από την κατανομή κάθε stat, ανεξάρτητα από το αν υπάρχει γραμμή bookmaker.
3. **Append-only αρχείο pregame προβλέψεων παικτών** με snapshots, «τελευταία έγκυρη pregame», αυτόματο settlement και σφάλματα. Μπορεί να χρησιμοποιηθεί το πρότυπο hash του ledger.
4. **Ενιαία αξιολόγηση** για όλα τα stats: MAE, RMSE, Brier, βαθμονόμηση, ανά stat, παίκτη, εύρος λεπτών, ομάδα και έκδοση, απέναντι σε μέσο σεζόν / 5 / 10 αγώνων, και `docs/MODEL_EVALUATION.md`.
5. Πύλη αξιοπιστίας για τα props (όπως στις κύριες αγορές) και μητρώο εκδόσεων του μοντέλου props.
6. Schema validation και test που **αποτυγχάνει** αν μια πρόβλεψη χρησιμοποιεί δεδομένα με ημερομηνία ≥ του αγώνα-στόχου.
7. Μόνιμος χάρτης ταυτοτήτων (`odds/Fantasy/τραυματίες → c`) και αναφορά αποτυχημένων αντιστοιχίσεων.
8. Ενιαίο `npm test` και εκτέλεση όλων των tests στο CI.

---

## 7. Προτεινόμενη σειρά υλοποίησης

**Φάση 2: Θεμέλια δεδομένων** (χωρίς αλλαγή στις σελίδες)
1. `npm test` που τρέχει όλα τα Node + Python tests (με offline build πριν από όσα το χρειάζονται)· το CI να τρέχει και τα 17 που λείπουν από το `update.yml`.
2. Το offline build να μην αλλάζει το `props-track.json` (ή μεταφορά του track σε ξεχωριστό βήμα του CI).
3. `src/engine/schema.mjs` (ή αντίστοιχο): κανονικοποιημένη, **παραγόμενη** όψη (Players/Teams/Games/PlayerGameStats) πάνω στο υπάρχον `cache.json` + `hist/`, με `game_id`, `team_id` ανά γραμμή και `source`/`fetched_at`. Το `cache.json` μένει όπως είναι, ώστε να μη σπάσει καμία σελίδα.
4. Validators + tests: μοναδικότητα `player_id`, συνέπεια σκορ αγώνα = άθροισμα πόντων, έγκυρα ποσοστά, κανένα αρνητικό stat.
5. Χάρτης ταυτοτήτων και αναφορά αποτυχιών (ξεκινώντας από τους 5 τραυματίες).

**Φάση 3: Κοινό engine προβολών**
1. Σύγκριση των δύο μοντέλων λεπτών (Python stage 1 έναντι Node EW + ανακατανομή) στο ίδιο walk-forward δείγμα. Επιλέγεται **ένα**.
2. Τα stats ανά λεπτό: ξεκινώντας από το υπάρχον NB μοντέλο. Δοκιμάζονται άμυνα ανά θέση με smoothing και προηγούμενη σεζόν ως prior, που λείπουν σήμερα από τα props και είναι ο πιθανότερος λόγος που ο μέσος όρος σεζόν κερδίζει. Αποδεκτό μόνο αν κερδίζει τον μέσο όρο σεζόν/5/10 σε 7 σεζόν walk-forward.
3. Αρχείο εξόδου `data/projections/latest.json` + σκάλα ορίων, που διαβάζεται από το Fantasy και τον Prop Analyzer.

**Φάση 4: Αρχείο προβλέψεων.** Append-only JSONL ανά αγωνιστική, με hash, snapshots, settlement και αντικατάσταση του `props-track`.
**Φάση 5: Fantasy.** Χρήση των κοινών λεπτών/PIR· ο κώδικας του optimizer μένει ως έχει.
**Φάση 6: Betting.** Πύλη αξιοπιστίας στα props, έκδοση μοντέλου σε κάθε γραμμή value.
**Φάση 7: UI.** Επέκταση των υπαρχουσών σελίδων παίκτη/Fantasy/Αποδόσεων, χωρίς νέες σελίδες ανά παίκτη.

**Python ή Node;** Η προδιαγραφή προτιμά Node. Όμως το καλύτερο επικυρωμένο μοντέλο (PIR) είναι σε Python και τρέχει ήδη δωρεάν στο CI. Πρόταση: **ένα κοινό συμβόλαιο JSON**, με το μοντέλο να μένει όπου είναι ήδη καλύτερο. Η μεταφορά του PIR σε Node δεν έχει όφελος για τον χρήστη. Χρειάζεται έγκριση.

---

## 8. Αποφάσεις ιδιοκτήτη (24/11/2026)

1. **Γλώσσες:** οι νέες λειτουργίες στατιστικών και Fantasy θα υποστηρίζουν και τις 5 γλώσσες (el, en, es, sr, tr). Οι λειτουργίες στοιχήματος (αποδόσεις, value, EV) **δεν** θα εμφανίζονται στο `/tr/` μέχρι να υπάρξει μητρώο αδειοδοτημένων bookmakers για την Τουρκία.
2. **Python:** μένει για τα μοντέλα που υπάρχουν ήδη. Όλα τα μοντέλα γράφουν σε ένα κοινό συμβόλαιο JSON (`data/projections/`), που διαβάζουν το Fantasy, ο Prop Analyzer και το build.
3. **Hosting:** παραμένει το GitHub Pages. Η αύξηση του ορίου του 1 GB δεν αγοράζεται, άρα στη Φάση 2 μπαίνει έλεγχος μεγέθους του `dist/`, και οι νέες λειτουργίες δεν προσθέτουν σελίδες ανά παίκτη. Η μεταφορά σε Cloudflare Pages θα εξεταστεί πριν από την ενεργοποίηση πληρωμών (PRO), γιατί οι όροι του GitHub Pages δεν επιτρέπουν site που εξυπηρετεί κυρίως εμπορικές συναλλαγές.
4. **Πρόσβαση GitHub:** δόθηκε. Η δουλειά γίνεται σε feature branches με PR, χωρίς merge ή deploy χωρίς έγκριση.

Ανοιχτό: πόσες από τις μηνιαίες κλήσεις OddsPapi θα διατεθούν για ιστορικές αποδόσεις props.
