-- Quem enviou cada foto de evolução: 'trainer' (personal) ou 'student' (aluno,
-- na autoavaliação). A área do aluno mostra a origem de cada foto.
ALTER TABLE assessment_photos ADD COLUMN uploaded_by TEXT;
