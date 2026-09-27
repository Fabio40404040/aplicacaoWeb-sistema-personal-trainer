CREATE TABLE ready_workout_pdfs (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  level TEXT NOT NULL,
  duration TEXT NOT NULL,
  muscle_groups TEXT NOT NULL DEFAULT '',
  description TEXT,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ready_workout_pdfs_trainer_idx
  ON ready_workout_pdfs(trainer_id, published, created_at DESC);
