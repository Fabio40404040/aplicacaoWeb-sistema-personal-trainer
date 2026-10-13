-- Índices para o painel e a área do aluno abrirem mais rápido quando houver
-- muitos alunos e pagamentos. Só acrescenta índices: não muda nem apaga dados.
CREATE INDEX IF NOT EXISTS payments_trainer_paid_idx ON payments(trainer_id, paid_at);
CREATE INDEX IF NOT EXISTS checkins_trainer_idx ON checkins(trainer_id, created_at);
CREATE INDEX IF NOT EXISTS assessments_trainer_idx ON assessments(trainer_id);
CREATE INDEX IF NOT EXISTS workout_logs_student_idx ON workout_logs(student_id);
CREATE INDEX IF NOT EXISTS workout_logs_trainer_idx ON workout_logs(trainer_id);
CREATE INDEX IF NOT EXISTS access_history_student_idx ON access_history(student_id, created_at);
CREATE INDEX IF NOT EXISTS payment_intents_trainer_idx ON payment_intents(trainer_id, status);
CREATE INDEX IF NOT EXISTS error_log_created_idx ON error_log(created_at);
