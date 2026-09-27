
CREATE TABLE trainers (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE students (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  email VARCHAR(180) NOT NULL,
  goal VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Pausado')),
  assessment_date DATE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX students_trainer_idx ON students(trainer_id);

CREATE TABLE exercises (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  muscle_group VARCHAR(80) NOT NULL,
  equipment VARCHAR(120) NOT NULL,
  instructions TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX exercises_trainer_idx ON exercises(trainer_id);

CREATE TABLE workouts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  goal VARCHAR(80) NOT NULL,
  duration VARCHAR(40) NOT NULL,
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX workouts_trainer_idx ON workouts(trainer_id);
CREATE INDEX workouts_student_idx ON workouts(student_id);

CREATE TABLE workout_exercises (
  workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  position SMALLINT NOT NULL,
  sets SMALLINT NOT NULL,
  repetitions VARCHAR(40) NOT NULL,
  rest_seconds SMALLINT,
  notes TEXT,
  PRIMARY KEY (workout_id, exercise_id)
);

CREATE TABLE assessments (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  weight_kg NUMERIC(5,2) NOT NULL,
  body_fat_percent NUMERIC(5,2),
  waist_cm NUMERIC(5,2),
  notes TEXT,
  assessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX assessments_student_date_idx ON assessments(student_id, assessed_at DESC);
