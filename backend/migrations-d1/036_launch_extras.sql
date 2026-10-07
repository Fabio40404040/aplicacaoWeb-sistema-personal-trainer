-- Confirmação de e-mail (personal e aluno). Contas que já existem contam como confirmadas.
ALTER TABLE trainers ADD COLUMN email_verified_at TEXT;
ALTER TABLE student_accounts ADD COLUMN email_verified_at TEXT;
UPDATE trainers SET email_verified_at=CURRENT_TIMESTAMP WHERE email_verified_at IS NULL;
UPDATE student_accounts SET email_verified_at=CURRENT_TIMESTAMP WHERE email_verified_at IS NULL;
CREATE TABLE IF NOT EXISTS email_verifications (
  token_hash TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  account_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
-- Registro de erros do servidor (aparece no admin, em Registro de ações).
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  route TEXT,
  message TEXT,
  detail TEXT
);
