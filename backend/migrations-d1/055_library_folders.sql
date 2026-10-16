-- Unifica as pastas das bibliotecas de Exercícios, GIFs e MP4. Cada conta
-- continua isolada por trainer_id; farisa-library é a conta interna do admin.
-- Pastas existentes são registradas com a data do primeiro item, preservando
-- a ordem em que foram adicionadas.

INSERT OR IGNORE INTO trainer_muscle_groups (id, trainer_id, name, created_at)
SELECT lower(hex(randomblob(16))), trainer_id, name, MIN(created_at)
FROM (
  SELECT trainer_id, trim(muscle_group) AS name, created_at
    FROM exercises
   WHERE trim(muscle_group)<>'' AND instr(muscle_group, ',')=0
  UNION ALL
  SELECT trainer_id, trim(muscle_group) AS name, created_at
    FROM exercise_gifs
   WHERE trim(muscle_group)<>''
  UNION ALL
  SELECT trainer_id, trim(muscle_group) AS name, created_at
    FROM exercise_videos
   WHERE trim(muscle_group)<>''
)
GROUP BY trainer_id, lower(name);

-- Contas que ainda não escolheram uma ordem recebem a sequência histórica.
INSERT OR IGNORE INTO trainer_folder_order (trainer_id, names)
SELECT trainer_id, json_group_array(name)
FROM (
  SELECT trainer_id, name
    FROM trainer_muscle_groups
   ORDER BY trainer_id, created_at, id
)
GROUP BY trainer_id;

