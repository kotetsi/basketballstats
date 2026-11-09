-- BasketballStats PRO: σχήμα D1 (SQLite). Εφαρμόζεται με: npx wrangler d1 execute bs-pro --remote --file=schema.sql
-- Μόνο προσθήκες (CREATE ... IF NOT EXISTS): ασφαλές να ξανατρέξει.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  stripe_customer TEXT UNIQUE,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

-- σύνδεση με link στο email: αποθηκεύεται μόνο το SHA-256 του token
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS login_tokens_user ON login_tokens(user_id, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- μία γραμμή ανά συνδρομή (μηνιαία Stripe) ή πάσο σεζόν (εφάπαξ)
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL CHECK (plan IN ('monthly','season_eb','season','manual')),
  status TEXT NOT NULL,                 -- active | trialing | past_due | canceled | expired
  stripe_subscription TEXT UNIQUE,
  stripe_session TEXT UNIQUE,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  welcomed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS subscriptions_user ON subscriptions(user_id);

-- πληρωμές / στοιχεία για παραστατικό (fallback: ο λογιστής εκδίδει χειροκίνητα)
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT NOT NULL UNIQUE,          -- Stripe invoice id ή checkout session id (μία εγγραφή ανά πληρωμή)
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  vat_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  description TEXT NOT NULL,
  status TEXT NOT NULL,                 -- paid | failed | refunded
  receipt_status TEXT NOT NULL DEFAULT 'pending_manual',  -- pending_manual | issued
  receipt_url TEXT,
  billing_name TEXT,
  billing_country TEXT,
  tax_id TEXT,                          -- ΑΦΜ αν δόθηκε → τιμολόγιο αντί για απόδειξη
  created_at TEXT NOT NULL
);

-- κάθε webhook μία φορά (η Stripe μπορεί να στείλει το ίδιο event ξανά)
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL
);

-- η σελίδα /welcome-pro συνδέει τον αγοραστή μία φορά ανά checkout
CREATE TABLE IF NOT EXISTS checkout_claims (
  stripe_session TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  claimed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  invite_link TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,                 -- sent | failed | logged (χωρίς πάροχο)
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
