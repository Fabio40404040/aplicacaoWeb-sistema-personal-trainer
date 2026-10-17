-- Progresso diário das séries marcadas pelo aluno em cada exercício.
CREATE TABLE IF NOT EXISTS exercise_set_progress (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  completed_sets INTEGER NOT NULL DEFAULT 0 CHECK (completed_sets BETWEEN 0 AND 20),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, workout_id, exercise_id, day)
);

CREATE INDEX IF NOT EXISTS exercise_set_progress_student_day_idx
  ON exercise_set_progress (student_id, day);
