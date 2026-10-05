-- Foto do personal no banner: imagem com fundo transparente (recorte) que
-- fica POR CIMA do fundo escolhido (banner pronto), como no site original.
ALTER TABLE trainer_site ADD COLUMN hero_cutout TEXT;
ALTER TABLE trainer_site ADD COLUMN hero_cutout_version INTEGER NOT NULL DEFAULT 0;
