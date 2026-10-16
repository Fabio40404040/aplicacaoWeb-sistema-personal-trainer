-- GIFs e vídeos enviados diretamente em suas abas também pertencem ao
-- catálogo de exercícios. Converte os arquivos antigos que ficaram soltos,
-- preservando todos os vínculos já existentes.

INSERT INTO exercises
  (trainer_id,name,muscle_group,equipment,difficulty,media_type,is_active,gif_id)
SELECT
  g.trainer_id,g.name,g.muscle_group,'Sem equipamento','Intermediário','gif',1,g.id
FROM exercise_gifs g
WHERE NOT EXISTS (
  SELECT 1 FROM exercises e
  WHERE e.trainer_id=g.trainer_id AND e.gif_id=g.id
);

INSERT INTO exercises
  (trainer_id,name,muscle_group,equipment,instructions,difficulty,media_type,is_active,video_id)
SELECT
  v.trainer_id,v.name,v.muscle_group,COALESCE(v.equipment,'Sem equipamento'),v.instructions,
  COALESCE(v.difficulty,'Intermediário'),'video',1,v.id
FROM exercise_videos v
WHERE NOT EXISTS (
  SELECT 1 FROM exercises e
  WHERE e.trainer_id=v.trainer_id AND (e.video_id=v.id OR e.id=v.id)
);
