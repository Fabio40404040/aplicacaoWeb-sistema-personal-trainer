-- Página de cada personal (SaaS): a estrutura do site é a mesma para todos;
-- cada personal muda a marca, a cor, o banner, o contato e os preços dos
-- planos. A página fica em /p/<slug>; o site principal (/) é do dono.
CREATE TABLE trainer_site (
  trainer_id TEXT PRIMARY KEY NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  brand_mark TEXT,
  brand_name TEXT,
  accent TEXT NOT NULL DEFAULT 'blue',
  hero_kind TEXT NOT NULL DEFAULT 'default' CHECK (hero_kind IN ('default','preset','upload')),
  hero_preset TEXT,
  hero_image TEXT,          -- foto enviada (data URL JPEG, já recortada no navegador)
  hero_version INTEGER NOT NULL DEFAULT 0,
  whatsapp TEXT,
  contact_email TEXT,
  address TEXT,
  instagram TEXT,
  facebook TEXT,
  tiktok TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Preço que cada personal cobra por plano (sem linha = preço padrão do plano).
CREATE TABLE trainer_plan_prices (
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES plans(code),
  price_cents INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (trainer_id, plan_code)
);
