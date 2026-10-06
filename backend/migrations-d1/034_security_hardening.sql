-- "Sair" encerra a sessão no servidor: assinatura do token fica aqui até expirar.
CREATE TABLE IF NOT EXISTS revoked_sessions (
  signature TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);
-- Segunda etapa do login do administrador: código de 6 dígitos enviado por e-mail.
CREATE TABLE IF NOT EXISTS admin_login_codes (
  admin_id TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
