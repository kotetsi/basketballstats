# Fantasy Vision (προαιρετικό)

Μοντέλο όρασης για το **AI Fantasy Assistant** (`/fantasy/assistant/`). Χωρίς αυτό, η σελίδα δουλεύει με
αναγνώριση κειμένου (OCR) στη συσκευή του χρήστη, δωρεάν. Με αυτό, ο χρήστης μπορεί να επιλέξει «AI αναγνώριση»
για πιο ακριβή αποτελέσματα σε δύσκολα screenshots.

## Τι χρειάζεται
1. Λογαριασμός Cloudflare (το δωρεάν πλάνο Workers αρκεί).
2. API key της Anthropic (πληρωμή ανά χρήση: κάθε αναγνώριση είναι μία κλήση μοντέλου με μία εικόνα).

## Ενεργοποίηση
```bash
cd workers/fantasy-vision
npx wrangler kv namespace create LIMITS        # βάλε το id στο wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY      # το key μένει μόνο στο Cloudflare
npx wrangler deploy                            # δίνει διεύθυνση π.χ. https://bs-fantasy-vision.<λογαριασμός>.workers.dev
```
Μετά βάλε τη διεύθυνση στο `site.config.json`: `"fantasyVisionEndpoint": "https://bs-fantasy-vision.<λογαριασμός>.workers.dev"`.

## Ασφάλεια και κόστος
- Δέχεται μόνο POST από `ALLOWED_ORIGINS`, μόνο JPEG/PNG/WEBP έως 4 MB (ο browser στέλνει σμίκρυνση 1600 px).
- Όρια: `DAILY_PER_IP` ανά IP και `DAILY_TOTAL` συνολικά ανά μέρα (το δεύτερο είναι το ανώτατο ημερήσιο κόστος).
- Η εικόνα δεν αποθηκεύεται. Στο KV κρατιούνται μόνο μετρητές (IP + ημερομηνία) για 2 μέρες.
- Το μοντέλο απαντά μόνο μέσω εργαλείου με αυστηρό JSON σχήμα· το κείμενο της εικόνας αντιμετωπίζεται ως δεδομένο.
  Κάθε όνομα ξαναελέγχεται στον browser με τη βάση παικτών: το μοντέλο δεν μπορεί να «προσθέσει» παίκτη ή τιμή.
