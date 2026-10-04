-- App do aluno com a marca do personal: ícones (PNG) gerados no navegador do
-- personal ao salvar "Meu site" e servidos no manifesto da página /p/<slug>.
ALTER TABLE trainer_site ADD COLUMN icon_192 TEXT;
ALTER TABLE trainer_site ADD COLUMN icon_512 TEXT;
ALTER TABLE trainer_site ADD COLUMN icon_version INTEGER NOT NULL DEFAULT 0;
