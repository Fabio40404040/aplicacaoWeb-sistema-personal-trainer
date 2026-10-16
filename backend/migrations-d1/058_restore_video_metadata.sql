-- Recupera metadados que conversões antigas de MP4 substituíram por valores
-- vazios ou padrões. Só usa o vídeo da mesma conta e preserva campos já
-- personalizados no exercício.

UPDATE exercises
SET equipment=(
  SELECT trim(v.equipment) FROM exercise_videos v
  WHERE v.id=exercises.video_id AND v.trainer_id=exercises.trainer_id
)
WHERE video_id IS NOT NULL
  AND (equipment IS NULL OR trim(equipment)='' OR equipment='Sem equipamento')
  AND EXISTS (
    SELECT 1 FROM exercise_videos v
    WHERE v.id=exercises.video_id AND v.trainer_id=exercises.trainer_id
      AND v.equipment IS NOT NULL AND trim(v.equipment)<>''
  );

UPDATE exercises
SET instructions=(
  SELECT v.instructions FROM exercise_videos v
  WHERE v.id=exercises.video_id AND v.trainer_id=exercises.trainer_id
)
WHERE video_id IS NOT NULL
  AND (instructions IS NULL OR trim(instructions)='')
  AND EXISTS (
    SELECT 1 FROM exercise_videos v
    WHERE v.id=exercises.video_id AND v.trainer_id=exercises.trainer_id
      AND v.instructions IS NOT NULL AND trim(v.instructions)<>''
  );

UPDATE exercises
SET difficulty=(
  SELECT trim(v.difficulty) FROM exercise_videos v
  WHERE v.id=exercises.video_id AND v.trainer_id=exercises.trainer_id
)
WHERE video_id IS NOT NULL
  AND (difficulty IS NULL OR trim(difficulty)='' OR difficulty='Intermediário')
  AND EXISTS (
    SELECT 1 FROM exercise_videos v
    WHERE v.id=exercises.video_id AND v.trainer_id=exercises.trainer_id
      AND v.difficulty IS NOT NULL AND trim(v.difficulty)<>''
      AND v.difficulty<>'Intermediário'
  );
