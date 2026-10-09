-- Exercício copiado da Biblioteca FARISA: guarda de qual exercício veio, para
-- não copiar duas vezes e não aparecer repetido na montagem da ficha.
ALTER TABLE exercises ADD COLUMN source_id TEXT;
CREATE INDEX IF NOT EXISTS exercises_source_idx ON exercises (trainer_id, source_id);
