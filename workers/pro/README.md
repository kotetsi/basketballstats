# BasketballStats PRO API

Cloudflare Worker + D1 (SQLite). Το στατικό site (GitHub Pages, δημόσιο repo) **δεν περιέχει ποτέ PRO περιεχόμενο**:
picks, αναλύσεις, συνδρομητές και πληρωμές ζουν μόνο εδώ, και το API τα δίνει μόνο σε ενεργό PRO.

## Ροή
1. `/pro/` → `/checkout/` (πακέτο + αποδοχή όρων + συναίνεση άμεσης πρόσβασης) → `POST /v1/checkout` → σελίδα πληρωμής Stripe.
2. Η Stripe στέλνει `checkout.session.completed` στο `/v1/stripe/webhook` (υπογεγραμμένο) → ο χρήστης γίνεται PRO,
   γράφεται η πληρωμή (για απόδειξη) και φεύγει **ένα** email καλωσορίσματος με προσωπικό PRO Telegram link (24 ώρες, 1 άτομο).
3. Η Stripe επιστρέφει τον αγοραστή στο `/welcome-pro/?cs=…` → `POST /v1/checkout/claim` → συνδέεται αμέσως (μία φορά ανά πληρωμή).
4. `/my-account/`: σύνδεση με link στο email (χωρίς κωδικό), κατάσταση, λήξη, Telegram, πληρωμές, ακύρωση (Stripe Customer Portal).

Ρόλοι: `FREE`, `PRO`, `PRO_EXPIRED` (η λήξη επιστρέφει αυτόματα σε δικαιώματα FREE), `ADMIN` (`ADMIN_EMAILS`).

## Ενεργοποίηση (μία φορά)
1. **Cloudflare**: My Profile → API Tokens → «Edit Cloudflare Workers» + δικαίωμα D1 Edit. Στο GitHub: secrets
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PRO_ADMIN_EMAILS`.
2. **Stripe** (πρώτα Test mode): Developers → API keys → secret key → GitHub secret `STRIPE_SECRET_KEY`.
   Developers → Webhooks → endpoint `https://bs-pro.<λογαριασμός>.workers.dev/v1/stripe/webhook` με events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted` → signing secret → `STRIPE_WEBHOOK_SECRET`.
   Settings → Billing → Customer portal: «Cancel subscriptions: at end of billing period», «Invoice history: on» → Save.
3. **Brevo**: SMTP & API → API key → `BREVO_API_KEY`· επιβεβαιωμένος αποστολέας `MAIL_FROM` (wrangler.toml).
4. **Telegram**: @BotFather → νέο bot → token → `TELEGRAM_BOT_TOKEN`. Ιδιωτικό κανάλι PRO → πρόσθεσε το bot ως διαχειριστή
   με «Invite users via link» και «Ban users» → το id του καναλιού (-100…) → `TELEGRAM_PRO_CHAT_ID`.
5. GitHub → Actions → «PRO API (Cloudflare Worker)» → Run workflow (tests, βάση D1, schema, deploy, secrets).
6. Στο `site.config.json`: `"proApi": "https://bs-pro.<λογαριασμός>.workers.dev"` και `"proSeller": "<επωνυμία, ΑΦΜ, διεύθυνση, email>"`.
   Μέχρι να μπει `proApi`, οι σελίδες PRO δείχνουν «Οι εγγραφές PRO ανοίγουν σύντομα» (καμία φόρμα πληρωμής).

## Tests
```bash
node --test test/pro/worker.test.mjs                                   # Worker + D1 (SQLite) + ψεύτικα Stripe/Telegram/Brevo
PRO_API=http://localhost:8787 node build.mjs --offline && node test/e2e/pro.e2e.mjs   # browser, κινητό, από άκρη σε άκρη
```
Χρειάζεται Node 22+ (node:sqlite).

## Κλείδωμα περιεχομένου (Βήμα 2) — ΑΝΕΝΕΡΓΟ μέχρι να το αποφασίσεις
`site.config.json` → `"proLock": false`: τα tips μένουν ανοιχτά όπως πάντα. Με `true`:
- οι **ανοιχτές** επιλογές των tipsters του `proTipsters` δεν μπαίνουν πουθενά στο στατικό site (HTML, JSON, sitemap)·
  οι κριμένες μένουν δημόσιες. Τα νέα picks μπαίνουν από το admin του PRO API (`POST /v1/admin/picks`), όχι στο `tipsters/*.md`
  (το repo είναι δημόσιο).
- Tipsters και σελίδες αγώνων δείχνουν κλειδωμένο κουτί που γεμίζει από το API: FREE → «High Fidelity Pick - Δες το με PRO»
  (μόνο αγώνας/ώρα), PRO → παίκτης, αγορά, απόδοση, μονάδες, ανάλυση, ώρα δημοσίευσης.
- Απόδειξη: `node test/e2e/pro-lock.e2e.mjs` (σαρώνει όλο το dist/ σε ανοιχτό και κλειδωμένο build) και
  `PRO_LOCK=1 PRO_API=http://localhost:8787 node build.mjs --offline && node test/e2e/pro.e2e.mjs` (ελέγχει κάθε απάντηση δικτύου του FREE).
