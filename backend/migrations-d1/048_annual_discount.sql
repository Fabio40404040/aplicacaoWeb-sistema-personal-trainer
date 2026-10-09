-- Assinatura anual do personal: desconto (%) sobre 12 meses do plano pago.
-- O admin muda em Planos. Padrão: 20%.
ALTER TABLE saas_plans ADD COLUMN annual_discount INTEGER NOT NULL DEFAULT 20;
