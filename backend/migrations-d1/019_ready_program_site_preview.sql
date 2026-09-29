-- Treino pronto usado como "Ver prévia" no card Treinos Prontos do site.
-- Só um treino por personal fica marcado (o painel desmarca os outros).
ALTER TABLE ready_workout_programs ADD COLUMN is_site_preview INTEGER NOT NULL DEFAULT 0;
