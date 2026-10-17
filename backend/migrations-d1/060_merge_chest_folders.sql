-- Os GIFs chegaram pela pasta "Peito" e os MP4 por "1-Peito". São o mesmo
-- grupo muscular: preserva o nome criado primeiro e reúne toda a mídia nele.
UPDATE exercises SET muscle_group='Peito' WHERE muscle_group='1-Peito';
UPDATE exercise_gifs SET muscle_group='Peito' WHERE muscle_group='1-Peito';
UPDATE exercise_videos SET muscle_group='Peito' WHERE muscle_group='1-Peito';

DELETE FROM trainer_muscle_groups WHERE name='1-Peito';

UPDATE trainer_folder_order
SET names=CASE
  WHEN instr(names, '"Peito"')>0
    THEN replace(replace(names, '"1-Peito",', ''), ',"1-Peito"', '')
  ELSE replace(names, '"1-Peito"', '"Peito"')
END,
updated_at=CURRENT_TIMESTAMP
WHERE instr(names, '"1-Peito"')>0;
