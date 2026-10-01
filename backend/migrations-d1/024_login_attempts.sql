-- Limite de tentativas de login e de "esqueci a senha" (contra força bruta).
CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
