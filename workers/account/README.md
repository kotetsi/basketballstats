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
   `https://basketballstats.eu/politiki-aporritou/`) → Credentials → OAuth client ID → Web application → Authorized JavaScript origins:
   `https://basketballstats.eu`. Το Client ID (δεν είναι μυστικό) μπαίνει στο `site.config.json` → `account.googleClientId`.
3. **Facebook** (προαιρετικό): στην εφαρμογή «BasketballStats Poster» → προσθήκη Facebook Login for Business/Login,
   App domains `basketballstats.eu`, Privacy URL και Data deletion URL `https://basketballstats.eu/politiki-aporritou/#delete-data`,
   εφαρμογή σε Live. Το App Secret → secret `META_APP_SECRET` στο GitHub, και ξανά Run του «Λογαριασμοί (deploy)».

Το `TELEGRAM_BOT_TOKEN` υπάρχει ήδη και περνά αυτόματα στον worker. Το bot παίρνει webhook (για το `/start`)·
οι αναρτήσεις στο κανάλι συνεχίζουν κανονικά.

## Ασφάλεια και απόρρητο
- Το ID token της Google ελέγχεται με τα δημόσια κλειδιά της (υπογραφή, αποδέκτης, λήξη). Του Facebook με `debug_token` για τη δική μας εφαρμογή.
- Συνεδρία: τυχαίο token στον browser· στη βάση μόνο το SHA-256 του, λήξη 180 ημέρες.
- CORS μόνο για το basketballstats.eu. Όριο 64 KB στην αποθηκευμένη κατάσταση. Οι ρυθμίσεις δέχονται μόνο γνωστά πεδία.
- Web Push χωρίς περιεχόμενο (VAPID): το service worker φέρνει το κείμενο από τον worker. Τα κλειδιά VAPID δημιουργούνται και μένουν στη D1.
- «Διαγραφή λογαριασμού» σβήνει αμέσως όλα τα δεδομένα. Στο Telegram, `/stop` σταματά τα μηνύματα.

## BasketballStats Premium (Paddle, sandbox-first)

The Worker includes a Paddle integration in `billing.mjs`:

- `POST /billing/checkout` requires an existing account session and creates a transaction for the configured fixed price.
- `POST /billing/portal` creates a short-lived hosted customer-portal link only for the signed-in user's stored Paddle customer.
- `GET /billing/status` and `GET /me` return the locally stored entitlement.
- `POST /billing/webhook` verifies the raw request body using Paddle's HMAC-SHA256 signature and a timestamp tolerance, then stores subscription state idempotently.
- Premium is granted only for a signed, matching-price subscription with status `active`. There is no trial or annual product in the first version.

### Paddle configuration

1. Create and verify a Paddle seller account. Create the Premium product and a single monthly €9.90 price. Confirm how Paddle presents tax and the payout/transaction fees in your account.
2. Use Paddle **sandbox** credentials first. Create a notification destination for `https://<worker-host>/billing/webhook` and subscribe to `subscription.created` and `subscription.updated`. Keep the destination's secret private.
3. After the Worker code and D1 schema are deployed under a separately approved release, add these values as **Worker secrets directly in the Cloudflare dashboard** for `bs-account` (Settings → Variables and Secrets):
   - `PADDLE_API_KEY` — sandbox API key with transaction and customer-portal permissions.
   - `PADDLE_WEBHOOK_SECRET` — signing secret for that sandbox notification destination.
   - `PADDLE_PRICE_ID` — sandbox monthly Premium price ID.
   - Keep `PADDLE_ENV=sandbox`, which is the checked-in default. Do not add live credentials until a separate production release is approved.
4. The existing account deploy workflow applies the D1 schema. Adding or changing Worker secrets affects the deployed Worker, so do this only as part of an approved release.
5. Run the Paddle webhook simulator and account/billing tests. Do not enable real checkout until protected Premium data and calculations are enforced server-side and production settings have been reviewed.

Never put Paddle keys or webhook secrets in `site.config.json`, source files, or browser JavaScript. Checkout remains unavailable unless the server has the API key and fixed price ID. Sandbox is the configured default. Setting production credentials or deploying the Worker is a separate release action and is not done by this change.

### Προστασία δεδομένων Premium (υπό υλοποίηση)

Το Prop Analyzer και οι συγκρίσεις ζητούν τα datasets μέσω `GET /premium/data/{key}`. Ο Worker απαιτεί υπάρχουσα συνεδρία και ενεργό entitlement στο D1 πριν διαβάσει το ιδιωτικό R2 binding `PREMIUM_DATA`. Επιτρεπόμενα keys:

- `props/data.json`
- `compare/players/metrics.json`
- `compare/players/similar/{playerId}.json`
- `compare/teams/metrics.json`

Το build τα γράφει στο αγνοημένο `.premium-data/`, έξω από το δημόσιο `dist`. Δεν έχει δημιουργηθεί ακόμη R2 bucket, δεν έχουν ανέβει αντικείμενα και δεν υπάρχει ενεργός συγχρονισμός. Χωρίς αυτά, ο Worker αποτυγχάνει κλειστά και τα Premium εργαλεία δεν φορτώνουν δεδομένα.

Το αρχικό αίτημα για προσθήκη sync στο nightly Pages/deployment workflow απορρίφθηκε από την αυτόματη αναθεώρηση, επειδή θα πρόσθετε credentials και `aws s3 sync --delete`. Με ξεχωριστή έγκριση του ιδιοκτήτη προστέθηκε διαφορετικό workflow, `.github/workflows/premium-data-sync.yml`: έχει μόνο `contents: read`, ξαναχτίζει τα δεδομένα από το `main`, ελέγχει ότι δεν μπήκαν στο `dist` και κάνει μόνο `aws s3 cp` ανά JSON αρχείο — χωρίς download artifacts, διαγραφές, αλλαγές Pages ή Worker deployment.

Πριν το ενεργοποιήσεις, δημιούργησε το bucket `bs-premium-data` με **Public Access απενεργοποιημένο** και ρύθμισε GitHub Actions:
- Repository Variables: `CLOUDFLARE_ACCOUNT_ID`, `PREMIUM_R2_BUCKET=bs-premium-data`.
- Repository Secrets: `PREMIUM_R2_ACCESS_KEY_ID`, `PREMIUM_R2_SECRET_ACCESS_KEY` από R2 token περιορισμένο στο συγκεκριμένο bucket και με Object Write μόνο. Μην χρησιμοποιήσεις Paddle secrets ή Worker deploy token.

Το workflow τρέχει μετά από επιτυχημένη ενημέρωση του site στο `main` ή χειροκίνητα. Μέχρι να προστεθούν οι μεταβλητές/secrets και να γεμίσει το bucket, το Premium data endpoint παραμένει κλειστό.

## Tests
`node --test test/account.test.mjs test/account-worker.test.mjs test/billing.test.mjs test/premium-gate.test.mjs` (D1 σε node:sqlite, ψεύτικοι Google/Telegram, χωρίς δίκτυο).
