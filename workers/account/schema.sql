-- Λογαριασμοί basketballstats.eu (Cloudflare D1). Τρέχει σε κάθε deploy: όλα είναι IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, provider TEXT NOT NULL, sub TEXT NOT NULL, name TEXT, email TEXT, created INTEGER NOT NULL, prefs TEXT NOT NULL DEFAULT '{}', UNIQUE (provider, sub));
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, exp INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
-- η κατάσταση του Fantasy Manager (fmt-v1): ομάδες, αρχηγός, credits
CREATE TABLE IF NOT EXISTS state (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS telegram (user_id TEXT PRIMARY KEY, chat_id TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tg_codes (code TEXT PRIMARY KEY, user_id TEXT NOT NULL, exp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, sub_id INTEGER NOT NULL, text TEXT NOT NULL, url TEXT, created INTEGER NOT NULL);
-- τι έχει ήδη σταλεί (κλειδί ειδοποίησης ανά χρήστη): τίποτα δεν στέλνεται δύο φορές
CREATE TABLE IF NOT EXISTS sent (user_id TEXT NOT NULL, key TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (user_id, key));
CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL);
