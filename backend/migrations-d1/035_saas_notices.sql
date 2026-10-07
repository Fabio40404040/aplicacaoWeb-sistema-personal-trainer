-- E-mails da assinatura já enviados (um por personal, tipo e referência), para
-- nunca repetir o mesmo aviso. ref = vencimento ou id do pagamento.
CREATE TABLE IF NOT EXISTS saas_notices (
  trainer_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (trainer_id, kind, ref)
);
-- Última execução de tarefas automáticas (evita rodar a mesma várias vezes seguidas).
CREATE TABLE IF NOT EXISTS job_runs (
  name TEXT PRIMARY KEY NOT NULL,
  ran_at INTEGER NOT NULL DEFAULT 0
);
