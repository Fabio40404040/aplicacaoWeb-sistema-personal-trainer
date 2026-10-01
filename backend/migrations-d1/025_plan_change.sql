-- Mudança de plano pelo aluno: o plano novo fica guardado aqui até o
-- pagamento ser aprovado; até lá o aluno continua com o acesso atual.
ALTER TABLE student_accounts ADD COLUMN change_plan_code TEXT;
ALTER TABLE student_accounts ADD COLUMN change_billing_cycle TEXT;
