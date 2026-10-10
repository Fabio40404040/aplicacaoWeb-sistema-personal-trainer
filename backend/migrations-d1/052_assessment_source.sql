-- Autoavaliação: o aluno à distância envia medidas e fotos; o personal revisa
-- e publica. source='student' marca a avaliação enviada pelo aluno.
ALTER TABLE assessments ADD COLUMN source TEXT;
