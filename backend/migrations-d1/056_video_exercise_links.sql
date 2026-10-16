-- Corrige exercícios de vídeo criados antes de video_id ser preenchido no
-- envio e impede duas linhas da mesma conta de apontarem para o mesmo MP4.

-- Formato antigo: exercício e vídeo nasceram com o mesmo id.
UPDATE exercises
SET video_id=id
WHERE video_id IS NULL
  AND EXISTS (
    SELECT 1 FROM exercise_videos v
    WHERE v.id=exercises.id AND v.trainer_id=exercises.trainer_id
  );

-- Recupera os registros ainda sem vínculo pelo nome e pela pasta.
UPDATE exercises
SET video_id=(
  SELECT v.id FROM exercise_videos v
  WHERE v.trainer_id=exercises.trainer_id
    AND lower(v.name)=lower(exercises.name)
    AND lower(v.muscle_group)=lower(exercises.muscle_group)
  ORDER BY v.created_at,v.id
  LIMIT 1
)
WHERE video_id IS NULL
  AND EXISTS (
    SELECT 1 FROM exercise_videos v
    WHERE v.trainer_id=exercises.trainer_id
      AND lower(v.name)=lower(exercises.name)
      AND lower(v.muscle_group)=lower(exercises.muscle_group)
  );

-- Se o histórico já produziu mais de um exercício para o mesmo vídeo, mantém
-- o vínculo principal (prioriza o exercício que nasceu junto com o MP4).
UPDATE exercises
SET video_id=NULL
WHERE video_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM exercises keep
    WHERE keep.trainer_id=exercises.trainer_id
      AND keep.video_id=exercises.video_id
      AND keep.id<>exercises.id
      AND (
        CASE WHEN keep.id=keep.video_id THEN 0 ELSE 1 END
          < CASE WHEN exercises.id=exercises.video_id THEN 0 ELSE 1 END
        OR (
          CASE WHEN keep.id=keep.video_id THEN 0 ELSE 1 END
            = CASE WHEN exercises.id=exercises.video_id THEN 0 ELSE 1 END
          AND (
            keep.created_at<exercises.created_at
            OR (keep.created_at=exercises.created_at AND keep.id<exercises.id)
          )
        )
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS exercises_trainer_video_unique_idx
ON exercises(trainer_id,video_id)
WHERE video_id IS NOT NULL;
