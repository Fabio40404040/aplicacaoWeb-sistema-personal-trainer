-- "Esqueci a senha" da área do administrador (/admin).
CREATE TABLE admin_password_resets (
  admin_id TEXT PRIMARY KEY REFERENCES platform_admins(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
