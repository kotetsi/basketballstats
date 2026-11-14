# Λογαριασμοί χρηστών (σύνδεση με Google/Facebook, ομάδα Fantasy, ειδοποιήσεις)

Ο χρήστης συνδέεται με Google ή Facebook. Η ομάδα του στο Fantasy (ό,τι κρατά ο Fantasy Manager στον browser) αποθηκεύεται στον
λογαριασμό του. Τον ειδοποιούμε για τραυματίες ή αμφίβολους, για τον αρχηγό, για μία πρόταση αλλαγής την εβδομάδα και πριν κλείσει
ο γύρος. Οι ειδοποιήσεις φτάνουν μέσω Telegram (από το @eubasketball_bot) και ως ειδοποίηση browser.
**Δεν συνδεόμαστε με τον λογαριασμό του χρήστη στο EuroLeague Fantasy**: μόνο προτείνουμε· την αλλαγή την κάνει ο ίδιος στο επίσημο παιχνίδι.

| Κομμάτι | Πού | Κόστος |
|---|---|---|
| Σύνδεση, αποθήκευση, Telegram webhook | `workers/account` (Cloudflare Worker + D1) | δωρεάν πλάνο |
| Υπολογισμός και αποστολή ειδοποιήσεων | `scripts/account-alerts.mjs` (GitHub Actions, κάθε 30') | δωρεάν |
| Κουμπί «Σύνδεση» και συγχρονισμός | `src/account/account.js` | — |
| Λογική ειδοποιήσεων | `src/account/alerts.mjs` (ίδια με τον Fantasy Manager) | — |

Μέχρι να γίνει το βήμα 1, όλα μένουν ανενεργά και το site δουλεύει όπως πριν.

## Ενεργοποίηση (μία φορά)
1. **Cloudflare** (δωρεάν): λογαριασμός → Workers & Pages (ενεργοποίηση του `workers.dev`) → API token με το πρότυπο
   «Edit Cloudflare Workers» + δικαίωμα **D1: Edit**. Στο GitHub → Settings → Secrets → Actions:
   `CLOUDFLARE_API_TOKEN` και `CLOUDFLARE_ACCOUNT_ID`. Μετά: Actions → «Λογαριασμοί (deploy)» → Run workflow.
   Το workflow φτιάχνει τη βάση, κάνει deploy και γράφει τη διεύθυνση στο `site.config.json` → εμφανίζεται το κουμπί «Σύνδεση».
2. **Google**: Google Cloud Console → νέο project → OAuth consent screen (External, όνομα BasketballStats, privacy
   `https://basketballstats.eu/privacy/`) → Credentials → OAuth client ID → Web application → Authorized JavaScript origins:
   `https://basketballstats.eu`. Το Client ID (δεν είναι μυστικό) μπαίνει στο `site.config.json` → `account.googleClientId`.
3. **Facebook** (προαιρετικό): στην εφαρμογή «BasketballStats Poster» → προσθήκη Facebook Login for Business/Login,
   App domains `basketballstats.eu`, Privacy URL και Data deletion URL `https://basketballstats.eu/privacy/#delete-data`,
   εφαρμογή σε Live. Το App Secret → secret `META_APP_SECRET` στο GitHub, και ξανά Run του «Λογαριασμοί (deploy)».

Το `TELEGRAM_BOT_TOKEN` υπάρχει ήδη και περνά αυτόματα στον worker. Το bot παίρνει webhook (για το `/start`)·
οι αναρτήσεις στο κανάλι συνεχίζουν κανονικά.

## Ασφάλεια και απόρρητο
- Το ID token της Google ελέγχεται με τα δημόσια κλειδιά της (υπογραφή, αποδέκτης, λήξη). Του Facebook με `debug_token` για τη δική μας εφαρμογή.
- Συνεδρία: τυχαίο token στον browser· στη βάση μόνο το SHA-256 του, λήξη 180 ημέρες.
- CORS μόνο για το basketballstats.eu. Όριο 64 KB στην αποθηκευμένη κατάσταση. Οι ρυθμίσεις δέχονται μόνο γνωστά πεδία.
- Web Push χωρίς περιεχόμενο (VAPID): το service worker φέρνει το κείμενο από τον worker. Τα κλειδιά VAPID δημιουργούνται και μένουν στη D1.
- «Διαγραφή λογαριασμού» σβήνει αμέσως όλα τα δεδομένα. Στο Telegram, `/stop` σταματά τα μηνύματα.

## Tests
`node --test test/account.test.mjs test/account-worker.test.mjs` (D1 σε node:sqlite, ψεύτικοι Google/Telegram, χωρίς δίκτυο).
