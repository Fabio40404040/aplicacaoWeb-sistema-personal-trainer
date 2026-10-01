PRAGMA defer_foreign_keys = true;

-- Agenda integrada: atendimentos online e presenciais, horários livres do
-- personal, tipos de atendimento, cota por plano e agendamento pelo aluno.

-- 1) Atendimentos ganham modalidade, link da chamada, tipo e origem, e a
--    situação "pending" (aguardando confirmação do personal).
CREATE TABLE appointments_new (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  service TEXT NOT NULL,
  location TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('pending','scheduled','completed','cancelled')),
  modality TEXT NOT NULL DEFAULT 'presencial' CHECK (modality IN ('presencial','online')),
  meeting_url TEXT,
  service_id TEXT,
  source TEXT NOT NULL DEFAULT 'trainer' CHECK (source IN ('trainer','student')),
  cancelled_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO appointments_new (id,trainer_id,student_id,starts_at,ends_at,service,location,notes,status,created_at,updated_at)
  SELECT id,trainer_id,student_id,starts_at,ends_at,service,location,notes,status,created_at,updated_at FROM appointments;
DROP TABLE appointments;
ALTER TABLE appointments_new RENAME TO appointments;
CREATE INDEX appointments_trainer_date_idx ON appointments(trainer_id, starts_at);
CREATE INDEX appointments_student_date_idx ON appointments(student_id, starts_at);

-- 2) Regras gerais do agendamento (uma linha por personal).
CREATE TABLE booking_settings (
  trainer_id TEXT PRIMARY KEY REFERENCES trainers(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0,
  auto_confirm INTEGER NOT NULL DEFAULT 1,
  min_notice_hours INTEGER NOT NULL DEFAULT 12,
  cancel_hours INTEGER NOT NULL DEFAULT 12,
  horizon_days INTEGER NOT NULL DEFAULT 30,
  default_address TEXT,
  default_meeting_url TEXT,
  tz_offset_min INTEGER NOT NULL DEFAULT -180,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3) Tipos de atendimento (Avaliação física, Consulta por vídeo…).
CREATE TABLE booking_services (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  modality TEXT NOT NULL DEFAULT 'both' CHECK (modality IN ('presencial','online','both')),
  duration_min INTEGER NOT NULL DEFAULT 60,
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX booking_services_trainer_idx ON booking_services(trainer_id, position);

-- 4) Quantos atendimentos de cada tipo cada plano dá direito por mês.
CREATE TABLE booking_quotas (
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  service_id TEXT NOT NULL REFERENCES booking_services(id) ON DELETE CASCADE,
  per_month INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trainer_id, plan_code, service_id)
);

-- 5) Horários livres da semana (minutos desde 00:00, horário local).
CREATE TABLE availability_rules (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  modality TEXT NOT NULL DEFAULT 'both' CHECK (modality IN ('presencial','online','both'))
);
CREATE INDEX availability_rules_trainer_idx ON availability_rules(trainer_id, weekday);

-- 6) Folgas, férias e bloqueios.
CREATE TABLE availability_blocks (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX availability_blocks_trainer_idx ON availability_blocks(trainer_id, starts_at);
