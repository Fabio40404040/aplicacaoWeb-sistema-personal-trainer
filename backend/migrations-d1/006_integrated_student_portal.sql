ALTER TABLE student_accounts ADD COLUMN trainer_id TEXT;
ALTER TABLE student_accounts ADD COLUMN student_id TEXT;
ALTER TABLE student_accounts ADD COLUMN requested_plan_code TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE student_accounts ADD COLUMN requested_payment_channel TEXT NOT NULL DEFAULT 'whatsapp';

ALTER TABLE students ADD COLUMN account_id TEXT;
ALTER TABLE students ADD COLUMN access_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE students ADD COLUMN plan_code TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE students ADD COLUMN access_type TEXT NOT NULL DEFAULT 'subscription';
ALTER TABLE students ADD COLUMN access_expires_at TEXT;
ALTER TABLE students ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE students ADD COLUMN payment_method TEXT;
ALTER TABLE students ADD COLUMN authorized_at TEXT;
ALTER TABLE students ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

ALTER TABLE workouts ADD COLUMN published_at TEXT;
ALTER TABLE workouts ADD COLUMN permanent_access INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workouts ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

ALTER TABLE exercises ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'Intermediário';
ALTER TABLE exercises ADD COLUMN media_type TEXT NOT NULL DEFAULT '3d';
ALTER TABLE exercises ADD COLUMN media_url TEXT;
ALTER TABLE exercises ADD COLUMN thumbnail_url TEXT;
ALTER TABLE exercises ADD COLUMN animation_clip TEXT;
ALTER TABLE exercises ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

ALTER TABLE assessments ADD COLUMN published_at TEXT;

CREATE UNIQUE INDEX student_accounts_student_idx ON student_accounts(student_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX students_account_idx ON students(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX students_access_idx ON students(trainer_id, access_status, access_expires_at);
CREATE INDEX workouts_published_idx ON workouts(student_id, published_at);

CREATE TABLE plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  access_type TEXT NOT NULL,
  duration_days INTEGER,
  features_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO plans (code, name, price_cents, access_type, duration_days, features_json) VALUES
  ('ready', 'Treinos Prontos', 9900, 'permanent', NULL, '["workouts","exercises"]'),
  ('basic', 'Consultoria Básica', 14900, 'subscription', 30, '["workouts","exercises","assessments","progress"]'),
  ('premium', 'Consultoria Premium', 24900, 'subscription', 30, '["workouts","exercises","assessments","progress","checkins"]'),
  ('athlete', 'Performance Atleta', 39900, 'subscription', 30, '["workouts","exercises","assessments","progress","checkins"]');

CREATE TABLE payments (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES plans(code),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  method TEXT NOT NULL,
  provider TEXT,
  provider_reference TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX payments_provider_reference_idx ON payments(provider_reference) WHERE provider_reference IS NOT NULL;
CREATE INDEX payments_student_idx ON payments(student_id, created_at DESC);

CREATE TABLE checkins (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 5),
  sleep INTEGER NOT NULL CHECK (sleep BETWEEN 1 AND 5),
  pain TEXT,
  notes TEXT,
  trainer_feedback TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX checkins_student_idx ON checkins(student_id, created_at DESC);

CREATE TABLE workout_logs (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

CREATE TABLE access_history (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  plan_code TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO students (trainer_id, name, email, goal, status, account_id, access_status, plan_code, access_type, payment_status)
SELECT (SELECT id FROM trainers ORDER BY created_at LIMIT 1), a.name, a.email, 'A definir', 'Pausado', a.id,
       'pending', a.requested_plan_code,
       CASE WHEN a.requested_plan_code='ready' THEN 'permanent' ELSE 'subscription' END,
       'pending'
FROM student_accounts a
WHERE EXISTS (SELECT 1 FROM trainers)
  AND NOT EXISTS (SELECT 1 FROM students s WHERE s.account_id=a.id);

UPDATE student_accounts
SET trainer_id=(SELECT trainer_id FROM students WHERE students.account_id=student_accounts.id LIMIT 1),
    student_id=(SELECT id FROM students WHERE students.account_id=student_accounts.id LIMIT 1)
WHERE student_id IS NULL;
