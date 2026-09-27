CREATE TABLE exercise_videos (
  id TEXT PRIMARY KEY,
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  equipment TEXT,
  difficulty TEXT NOT NULL DEFAULT 'Intermediário',
  instructions TEXT,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX exercise_videos_trainer_group_idx
  ON exercise_videos(trainer_id, muscle_group, created_at);
