ALTER TABLE student_accounts ADD COLUMN requested_billing_cycle TEXT NOT NULL DEFAULT 'quarterly';
ALTER TABLE students ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'quarterly';
ALTER TABLE payments ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly';

-- Contratos que já existiam eram mensais. Mantemos o período original para
-- não ampliar nem reduzir automaticamente um acesso já contratado.
UPDATE students SET billing_cycle='monthly' WHERE plan_code<>'ready';
UPDATE student_accounts SET requested_billing_cycle='monthly' WHERE requested_plan_code<>'ready';

UPDATE students SET billing_cycle='permanent' WHERE plan_code='ready';
UPDATE student_accounts SET requested_billing_cycle='permanent' WHERE requested_plan_code='ready';
