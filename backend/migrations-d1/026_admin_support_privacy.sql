-- Administração completa, suporte ao personal e privacidade (LGPD).

-- Personal: bloquear/desbloquear, anotações internas e aceite dos termos.
ALTER TABLE trainers ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE trainers ADD COLUMN blocked_reason TEXT;
ALTER TABLE trainers ADD COLUMN admin_notes TEXT;
ALTER TABLE trainers ADD COLUMN terms_accepted_at TEXT;

-- Aluno: aceite da política de privacidade (dados de saúde).
ALTER TABLE student_accounts ADD COLUMN privacy_accepted_at TEXT;
ALTER TABLE student_accounts ADD COLUMN privacy_version TEXT;

-- Registro de tudo o que o administrador faz (quem, o quê, quando, por quê).
CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  admin_id TEXT,
  admin_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_label TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX admin_audit_created_idx ON admin_audit(created_at);

-- Eventos de privacidade sem dados pessoais (ex.: aluno excluiu a conta).
CREATE TABLE privacy_events (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Suporte: o personal fala com o dono da plataforma.
CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'duvida',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  trainer_unread INTEGER NOT NULL DEFAULT 0,
  admin_unread INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX support_tickets_trainer_idx ON support_tickets(trainer_id, updated_at);
CREATE TABLE support_messages (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (author IN ('trainer','admin')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX support_messages_ticket_idx ON support_messages(ticket_id, created_at);
