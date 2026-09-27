ALTER TABLE student_accounts ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE student_password_resets (
  account_id TEXT PRIMARY KEY REFERENCES student_accounts(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
