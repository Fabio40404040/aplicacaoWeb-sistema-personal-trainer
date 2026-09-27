ALTER TABLE trainers ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE trainer_password_resets (
  trainer_id TEXT PRIMARY KEY REFERENCES trainers(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
