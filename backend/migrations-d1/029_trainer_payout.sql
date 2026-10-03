-- Recebimento de cada personal (SaaS): os pagamentos dos alunos caem na
-- conta do próprio personal. Modos:
--   platform    = conta Mercado Pago da plataforma (só o dono/admin)
--   mercadopago = conta Mercado Pago do personal, conectada por autorização
--   pix         = chave Pix de qualquer banco, com conferência manual
--   none        = ainda não configurou (não consegue cobrar pelo site)
CREATE TABLE trainer_payout (
  trainer_id TEXT PRIMARY KEY NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'none' CHECK (mode IN ('none','platform','mercadopago','pix')),
  mp_user_id TEXT,
  mp_access_token TEXT,   -- cifrado (AES-GCM)
  mp_refresh_token TEXT,  -- cifrado (AES-GCM)
  mp_public_key TEXT,
  mp_expires_at TEXT,
  mp_connected_at TEXT,
  pix_key_type TEXT,
  pix_key TEXT,
  pix_holder TEXT,
  pix_city TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX trainer_payout_mp_user_idx ON trainer_payout(mp_user_id);

-- O personal dono do site (primeiro cadastro) continua recebendo pela conta
-- Mercado Pago da plataforma, que é a do admin.
INSERT INTO trainer_payout (trainer_id, mode)
  SELECT id, 'platform' FROM trainers ORDER BY created_at, id LIMIT 1;
