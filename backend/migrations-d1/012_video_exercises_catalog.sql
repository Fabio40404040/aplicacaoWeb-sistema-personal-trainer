INSERT OR IGNORE INTO exercises
  (id,trainer_id,name,muscle_group,equipment,instructions,difficulty,media_type,is_active)
SELECT id,trainer_id,name,muscle_group,COALESCE(equipment,'Sem equipamento'),instructions,
  difficulty,'video',1
FROM exercise_videos;
