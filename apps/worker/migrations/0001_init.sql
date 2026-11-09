-- Apple Hub key service schema.

CREATE TABLE IF NOT EXISTS keys (
  id            TEXT PRIMARY KEY,
  key_hash      TEXT NOT NULL UNIQUE,
  key_prefix    TEXT NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('free', 'premium')),
  max_edges     INTEGER NOT NULL DEFAULT 1,
  discord_id    TEXT,
  note          TEXT,
  created_by    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER,
  revoked_at    INTEGER,
  revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS keys_discord_id ON keys (discord_id);
CREATE INDEX IF NOT EXISTS keys_created_at ON keys (created_at DESC);

CREATE TABLE IF NOT EXISTS redemptions (
  id               TEXT PRIMARY KEY,
  key_id           TEXT NOT NULL REFERENCES keys (id) ON DELETE CASCADE,
  hwid_hash        TEXT NOT NULL,
  user_id          TEXT,
  first_seen_at    INTEGER NOT NULL,
  last_seen_at     INTEGER NOT NULL,
  validation_count INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS redemptions_key_hwid ON redemptions (key_id, hwid_hash);
CREATE INDEX IF NOT EXISTS redemptions_hwid ON redemptions (hwid_hash);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS discord_claims (
  discord_id    TEXT PRIMARY KEY,
  last_claim_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     INTEGER NOT NULL,
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (at DESC);
