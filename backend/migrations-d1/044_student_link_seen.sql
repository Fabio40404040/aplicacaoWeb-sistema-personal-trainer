-- Quando um personal adiciona um aluno que já tem conta (de outro personal),
-- a foto de perfil do aluno só aparece para esse personal depois que o aluno
-- entra na página dele (ou troca para ele em "Meus personais").
-- 1 = aluno já usou este vínculo (padrão para todos os cadastros existentes).
ALTER TABLE students ADD COLUMN account_seen INTEGER NOT NULL DEFAULT 1;
