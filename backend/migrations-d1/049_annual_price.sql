-- Plano anual do personal com preço próprio (editável no admin, em Planos).
-- Vazio = usa o desconto (annual_discount) sobre 12 mensalidades.
ALTER TABLE saas_plans ADD COLUMN annual_price_cents INTEGER;
