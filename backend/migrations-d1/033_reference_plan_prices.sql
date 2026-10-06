-- Preços de referência dos planos de aluno (substituem os valores de teste da
-- migração 014). Valem só para o personal que ainda não definiu os próprios
-- preços em "Meu site"; quem já definiu continua com os dele.
UPDATE plans SET price_cents=4990 WHERE code='ready';
UPDATE plans SET price_cents=9990 WHERE code='basic';
UPDATE plans SET price_cents=14990 WHERE code='premium';
UPDATE plans SET price_cents=19990 WHERE code='athlete';
