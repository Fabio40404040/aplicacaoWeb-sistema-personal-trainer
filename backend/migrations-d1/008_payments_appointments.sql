CREATE TABLE payment_intents (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES plans(code),
  billing_cycle TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('pix', 'credit_card')),
  provider TEXT NOT NULL DEFAULT 'mercadopago',
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX payment_intents_student_idx ON payment_intents(student_id, created_at DESC);
CREATE UNIQUE INDEX payment_intents_provider_idx ON payment_intents(provider_reference) WHERE provider_reference IS NOT NULL;

CREATE TABLE appointments (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  service TEXT NOT NULL,
  location TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX appointments_trainer_date_idx ON appointments(trainer_id, starts_at);
CREATE INDEX appointments_student_date_idx ON appointments(student_id, starts_at);
