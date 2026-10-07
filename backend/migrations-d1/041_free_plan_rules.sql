-- Plano Grátis: 30 dias com todas as ferramentas e, depois, ferramentas
-- básicas para até 3 alunos. Quem já está no Grátis ganha 30 dias a partir de
-- agora. Vaga de aluno apagado fica em espera por 30 dias (só no Grátis).
ALTER TABLE trainers ADD COLUMN saas_trial_ends_at TEXT;
UPDATE trainers SET saas_trial_ends_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 day')
  WHERE saas_plan_code='free';
UPDATE saas_plans SET student_limit=3,
  description='Ferramentas básicas para até 3 alunos, grátis para sempre. Os primeiros 30 dias vêm com tudo liberado.'
  WHERE code='free';

CREATE TABLE IF NOT EXISTS saas_seat_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trainer_id TEXT NOT NULL,
  until TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_seat_holds ON saas_seat_holds (trainer_id, until);
