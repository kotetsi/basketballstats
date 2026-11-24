# Intelligence Engine — Επίπεδο δεδομένων (Φάση 2)

Κοινό επίπεδο δεδομένων για το Fantasy και το Betting. Είναι **παραγόμενη όψη** πάνω στα υπάρχοντα αρχεία. Το `data/cache.json` και οι σελίδες δεν αλλάζουν.

## Modules

| Αρχείο | Τι κάνει |
|---|---|
| `src/engine/data.mjs` | `normalizeSeason(raw, { season })` → `{ meta, players, teams, games, player_games, issues }` από το `data/cache.json` ή τα `data/fantasy/hist/E20xx.json` |
| `src/engine/validate.mjs` | `validateSeason(N)`: ταυτότητες, σκορ, εύστοχα ≤ προσπάθειες, πόντοι = 2·2P + 3·3P + FT, PIR, λεπτά, άθροισμα πόντων ομάδας |
| `src/engine/asof.mjs` | Προστασία από διαρροή: `asOf(N, cutoff)`, `assertNoFuture(rows, cutoff)` (ρίχνει `LeakageError`), `statusAsOf(statusHistory, cutoff)`, `walkForward(N)` |
| `src/engine/identity.mjs` | Αντιστοίχιση ονομάτων (τραυματίες) με `player_id`, με αιτία για κάθε αποτυχία |
| `scripts/engine-validate.mjs` | Αναφορά validation για όλες τις σεζόν (μόνο ανάγνωση· exit 1 σε σφάλμα) |
| `scripts/dist-size.mjs` | Μέγεθος `dist/` (προειδοποίηση 800 MB, αποτυχία 950 MB· όριο GitHub Pages 1 GB) και αρχικές σελίδες των 5 γλωσσών |
| `scripts/run-tests.mjs` | `npm test` / `npm run test:full` |

## Ταυτότητες

- `player_id` = κωδικός EuroLeague (`003469`, παλιότεροι αλφαριθμητικοί π.χ. `TGB`). Δεν δημιουργείται νέα ταυτότητα.
- `team_id` = κωδικός ομάδας (`OLY`). Κάθε γραμμή αγώνα παίρνει την ομάδα **του συγκεκριμένου αγώνα**, ώστε να υποστηρίζονται και οι παίκτες με 2 ομάδες (`BAS;DUB`).
- `game_id` = `{season}-{round}-{home}-{away}` (π.χ. `E2026-13-TEL-DUB`). Το `legacy_gid` (`E-13-TEL-DUB`) είναι το κλειδί που χρησιμοποιούν το ledger και οι αποδόσεις.
- Κάθε γραμμή έχει `source` και `fetched_at`.

## Πεδία `player_games`

`game_id, player_id, team_id, opp_id, season, round, date, home, started, seconds, minutes, points, rebounds, oreb, dreb, assists, steals, blocks, blocks_against, turnovers, fouls, fouls_drawn, three_pointers_made/attempted, two_pointers_made/attempted, free_throws_made/attempted, plus_minus, pir, team_pts, opp_pts, source, fetched_at`

Η `active_status` του παίκτη είναι `injured | out | doubtful | missed_recent_games | no_known_absence`. Το `no_known_absence` **δεν** σημαίνει «διαθέσιμος». Σημαίνει ότι δεν ξέρουμε για απουσία.

## Κανόνας διαρροής

Μια πρόβλεψη για αγώνα με τζάμπολ T βλέπει μόνο αγώνες με τζάμπολ **< T**. Στο walk-forward, το cutoff είναι το **πρώτο** τζάμπολ της αγωνιστικής, ώστε ούτε οι αγώνες της ίδιας αγωνιστικής να μη «φαίνονται». Η κατάσταση παικτών προκύπτει μόνο από snapshots με `captured_at < cutoff` και ποτέ από το box score του αγώνα-στόχου. Τα επόμενα μοντέλα (Φάση 3) θα παίρνουν δεδομένα μόνο μέσα από το `asOf()` και θα καλούν το `assertNoFuture()` στα tests.

## Build χωρίς εγγραφές

`node build.mjs --offline --readonly` (ή `BS_DATA_READONLY=1`): το build δεν γράφει τίποτα στο `data/`. Χωρίς τη σημαία η συμπεριφορά μένει **ίδια** με πριν, ώστε το βραδινό CI να συνεχίσει να ενημερώνει τα `cache.json`, `props-track.json`, `daytips.json`, `matchups/fixtures.json`, `title-odds.json` και `sitemap-lastmod.json`.

## Ευρήματα validation (24/11/2026)

| Σεζόν | Γραμμές | Σφάλματα | Προειδοποιήσεις |
|---|---|---|---|
| E2026 (τρέχουσα) | 2.929 | 0 | 0 |
| E2020–E2025 (`data/fantasy/hist`) | 34.443 | 0 | 2.614 `team_points_mismatch` |

- Σε όλες τις σεζόν: πόντοι, PIR, εύστοχα/προσπάθειες και σκορ ταιριάζουν σε **κάθε** γραμμή.
- **Τα ιστορικά αρχεία E2020–E2025 δεν έχουν όλους τους παίκτες.** Σε 375–582 περιπτώσεις ανά σεζόν (ομάδα σε αγώνα), το άθροισμα των πόντων των παικτών είναι μικρότερο από το σκορ. Αιτία: το `fantasy/hist_fetch.mjs` παίρνει τη λίστα παικτών από `statistics/players/traditional?statisticMode=PerGame` **χωρίς** `statisticSortMode=accumulated`. Αυτή η λίστα κόβει όσους δεν περνούν το όριο αγώνων/λεπτών. Είναι το ίδιο πρόβλημα που διορθώθηκε στο `build.mjs` για την τρέχουσα σεζόν. Επίπτωση: τα στοιχεία ομάδας (pace, άμυνα αντιπάλου, λεπτά συμπαικτών) που υπολογίζονται από τις γραμμές παικτών στις παλιές σεζόν είναι μεροληπτικά. Η διόρθωση (νέα λήψη) είναι πρώτο βήμα της Φάσης 3, πριν από νέα εκπαίδευση μοντέλων.
- **Τραυματίες:** 5 από τις 64 εγγραφές (Cordinier, Makoundou, Medarevic, Sissoko, Ennis) δεν αντιστοιχίζονται, γιατί οι παίκτες δεν έχουν αγωνιστεί φέτος. Το feed στατιστικών δίνει μόνο όσους έχουν παίξει. Χρειάζεται πηγή ρόστερ.
- **Pregame κατάσταση παικτών:** 29.103 snapshots, μόνο για τις αγωνιστικές 12–14 (από 16/11/2026).

## Περιορισμοί

- Τα `issues`/`findings` είναι αναφορές. Τίποτα δεν διορθώνεται αυτόματα και τίποτα δεν αντικαθίσταται.
- Η αντιστοίχιση των ονομάτων των παρόχων αποδόσεων (`matchPlayer` στο `src/odds/props.mjs`) δεν έχει μεταφερθεί ακόμα εδώ. Θα μεταφερθεί στη Φάση 6.
- Τα `test/account-worker.test.mjs` και `test/billing.test.mjs` χρειάζονται `node:sqlite` (Node ≥ 22.5). Σε παλιότερη Node παραλείπονται από το `npm test` με μήνυμα και τρέχουν στο `account-test.yml` (Node 22). Επίσης 5 tests του `test/account.test.mjs` παραλείπονται (`skip: !HAS`) όταν λείπει το αρχείο που χρειάζονται· ήταν ήδη έτσι στο `main`.
