-- Fotos de evolução (frente, lado, costas) de cada avaliação física. Ficam no
-- banco, já reduzidas pelo navegador, e somem junto com a avaliação.
CREATE TABLE IF NOT EXISTS assessment_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  trainer_id TEXT NOT NULL,
  pose TEXT NOT NULL,
  image TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (assessment_id, pose)
);
CREATE INDEX IF NOT EXISTS idx_assessment_photos_trainer ON assessment_photos (trainer_id);
