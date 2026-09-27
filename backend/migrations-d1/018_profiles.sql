-- Perfil do personal (foto, contato, CREF, limite de alunos do plano) e
-- perfil do aluno (foto, telefone, data de nascimento, dia do check-in).
-- A foto fica guardada como imagem pequena (JPEG ~256px, já reduzida no
-- navegador) direto na coluna, sem precisar de outro armazenamento.
ALTER TABLE trainers ADD COLUMN phone TEXT;
ALTER TABLE trainers ADD COLUMN cref TEXT;
ALTER TABLE trainers ADD COLUMN bio TEXT;
ALTER TABLE trainers ADD COLUMN avatar TEXT;
ALTER TABLE trainers ADD COLUMN plan_name TEXT NOT NULL DEFAULT 'Plano profissional';
ALTER TABLE trainers ADD COLUMN student_limit INTEGER NOT NULL DEFAULT 60;

ALTER TABLE student_accounts ADD COLUMN phone TEXT;
ALTER TABLE student_accounts ADD COLUMN avatar TEXT;
ALTER TABLE student_accounts ADD COLUMN birth_date TEXT;
-- 0 = domingo … 6 = sábado. Segunda-feira por padrão.
ALTER TABLE student_accounts ADD COLUMN checkin_weekday INTEGER NOT NULL DEFAULT 1;
