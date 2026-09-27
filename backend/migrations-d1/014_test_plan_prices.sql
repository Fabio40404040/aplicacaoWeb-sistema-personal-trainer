-- Valores temporários para validar o fluxo completo do Mercado Pago.
-- O backend usa estes valores como fonte oficial e não aceita preço enviado pelo navegador.
UPDATE plans SET price_cents=200 WHERE code='ready';
UPDATE plans SET price_cents=400 WHERE code='basic';
UPDATE plans SET price_cents=600 WHERE code='premium';
UPDATE plans SET price_cents=800 WHERE code='athlete';
