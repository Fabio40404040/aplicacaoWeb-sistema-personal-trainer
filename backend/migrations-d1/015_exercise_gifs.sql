-- Biblioteca de GIFs animados dos exercicios.
-- Os GIFs ficam num acervo proprio (exercise_gifs) e cada exercicio aponta para um deles
-- pela coluna exercises.gif_id. Nada aqui altera exercise_videos: os MP4 continuam iguais.

CREATE TABLE exercise_gifs (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  object_key TEXT NOT NULL,
  frame_key TEXT,
  original_filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX exercise_gifs_group_idx ON exercise_gifs(trainer_id, muscle_group, name);
CREATE UNIQUE INDEX exercise_gifs_file_idx ON exercise_gifs(trainer_id, original_filename);

ALTER TABLE exercises ADD COLUMN gif_id TEXT;
CREATE INDEX exercises_gif_idx ON exercises(gif_id);
