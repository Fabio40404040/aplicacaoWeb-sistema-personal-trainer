-- Ferramentas do aluno: evolução da carga, dias de treino concluídos (com
-- recado opcional para o personal) e consumo de água.
CREATE TABLE IF NOT EXISTS exercise_load_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  load TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_load_history ON exercise_load_history (workout_id, exercise_id, created_at);

CREATE TABLE IF NOT EXISTS training_days (
  student_id TEXT NOT NULL,
  trainer_id TEXT,
  day TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (student_id, day)
);
CREATE INDEX IF NOT EXISTS idx_training_days_trainer ON training_days (trainer_id, created_at);

CREATE TABLE IF NOT EXISTS water_log (
  student_id TEXT NOT NULL,
  day TEXT NOT NULL,
  ml INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (student_id, day)
);

CREATE TABLE IF NOT EXISTS student_tool_prefs (
  student_id TEXT PRIMARY KEY,
  water_goal_ml INTEGER
);
