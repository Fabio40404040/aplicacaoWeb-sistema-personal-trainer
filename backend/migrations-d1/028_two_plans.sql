-- Só dois planos na plataforma: "Grátis" (permanente) e "Ilimitado" (preço
-- único mensal). O limite de alunos de cada plano é editável pelo admin
-- (0 = sem limite) e pode ser ajustado personal por personal.
ALTER TABLE trainers ADD COLUMN saas_student_limit INTEGER;

INSERT INTO saas_plans (code,name,price_cents,student_limit,description,position,active,is_trial) VALUES
  ('free','Grátis',0,5,'Grátis para sempre, com número limitado de alunos.',0,1,0),
  ('unlimited','Ilimitado',4990,0,'Todas as funções, sem limite de alunos.',1,1,0);

-- Quem estava no teste vai para o Grátis permanente; quem tinha plano pago ou
-- cortesia vai para o Ilimitado, mantendo o vencimento que já tinha.
UPDATE trainers SET saas_plan_code='free', saas_cycle=NULL, saas_expires_at=NULL
  WHERE saas_plan_code NOT IN ('start','pro','elite');
UPDATE trainers SET saas_plan_code='unlimited' WHERE saas_plan_code IN ('start','pro','elite');
UPDATE saas_payment_intents SET status='cancelled' WHERE status IN ('pending','in_process','authorized');
DELETE FROM saas_plans WHERE code NOT IN ('free','unlimited');
UPDATE trainers SET plan_name=(SELECT name FROM saas_plans p WHERE p.code=trainers.saas_plan_code),
  student_limit=(SELECT student_limit FROM saas_plans p WHERE p.code=trainers.saas_plan_code);
