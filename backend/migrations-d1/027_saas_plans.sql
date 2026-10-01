-- Planos da plataforma para os personais (SaaS): faixas por número de alunos,
-- teste grátis e pagamento por período (Pix ou cartão, Mercado Pago).
CREATE TABLE saas_plans (
  code TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  student_limit INTEGER NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  is_trial INTEGER NOT NULL DEFAULT 0
);
INSERT INTO saas_plans (code,name,price_cents,student_limit,description,position,is_trial) VALUES
  ('trial','Teste grátis',0,5,'14 dias para conhecer a plataforma, com até 5 alunos.',0,1),
  ('start','Start',3990,15,'Para quem está começando a atender online.',1,0),
  ('pro','Pro',7990,50,'Para quem já tem uma carteira de alunos.',2,0),
  ('elite','Elite',12990,150,'Para consultorias com muitos alunos.',3,0);

ALTER TABLE trainers ADD COLUMN saas_plan_code TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE trainers ADD COLUMN saas_cycle TEXT;
ALTER TABLE trainers ADD COLUMN saas_expires_at TEXT;

-- Personais que já existem: plano Elite sem vencimento (cortesia).
UPDATE trainers SET saas_plan_code='elite', saas_expires_at=NULL;

CREATE TABLE saas_payment_intents (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  cycle TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX saas_intents_trainer_idx ON saas_payment_intents(trainer_id, created_at);
