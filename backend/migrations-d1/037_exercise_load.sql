-- Carga de cada exercício da ficha. O aluno ajusta na área dele e o personal vê
-- quem mexeu por último e quando, e também pode editar.
ALTER TABLE workout_exercises ADD COLUMN load TEXT;
ALTER TABLE workout_exercises ADD COLUMN load_by TEXT;
ALTER TABLE workout_exercises ADD COLUMN load_at TEXT;
