-- Liga o video MP4 ao exercicio do mesmo jeito que o GIF ja e ligado.
-- Antes o video era encontrado pelo nome, o que falha quando o arquivo tem
-- nome diferente do exercicio. Agora o vinculo e explicito.

ALTER TABLE exercises ADD COLUMN video_id TEXT;
CREATE INDEX exercises_video_idx ON exercises(video_id);

-- Aproveita os videos que ja casam por nome e grupo, para nao perder o que
-- ja estava funcionando.
UPDATE exercises
SET video_id = (
  SELECT v.id FROM exercise_videos v
  WHERE v.trainer_id = exercises.trainer_id
    AND lower(v.name) = lower(exercises.name)
    AND lower(v.muscle_group) = lower(exercises.muscle_group)
  LIMIT 1
)
WHERE video_id IS NULL;
