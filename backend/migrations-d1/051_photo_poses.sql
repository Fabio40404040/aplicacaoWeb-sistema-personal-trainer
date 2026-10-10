-- Poses das fotos de evolução de cada personal: nomes trocados e poses novas.
-- Sem linhas = as 6 poses padrão (frente, lado, costas, duplo bíceps de
-- frente e de costas, lado com braços estendidos).
CREATE TABLE IF NOT EXISTS trainer_photo_poses (
  trainer_id TEXT NOT NULL,
  pose TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trainer_id, pose)
);
