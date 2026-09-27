ALTER TABLE workout_exercises ADD COLUMN session_label TEXT NOT NULL DEFAULT 'A';

CREATE TABLE ready_workout_programs (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'Intermediário',
  duration TEXT NOT NULL,
  description TEXT,
  color_theme TEXT NOT NULL DEFAULT 'red',
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ready_workout_programs_trainer_idx
  ON ready_workout_programs(trainer_id, published, created_at DESC);

CREATE TABLE ready_program_exercises (
  program_id TEXT NOT NULL REFERENCES ready_workout_programs(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  session_label TEXT NOT NULL DEFAULT 'A',
  sets INTEGER NOT NULL DEFAULT 3,
  repetitions TEXT NOT NULL DEFAULT '10-12',
  rest_seconds INTEGER NOT NULL DEFAULT 60,
  notes TEXT,
  PRIMARY KEY (program_id, exercise_id)
);

CREATE INDEX ready_program_exercises_program_idx
  ON ready_program_exercises(program_id, session_label, position);
