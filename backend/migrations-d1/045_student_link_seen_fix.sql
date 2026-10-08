-- Corrige os vínculos feitos antes da 044: o aluno que já tinha conta e foi
-- adicionado por um segundo personal ficou com account_seen=1. Mantém a foto
-- só no primeiro cadastro da conta e no personal que está ativo agora.
UPDATE students SET account_seen = 0
WHERE account_id IS NOT NULL
  AND id <> (SELECT s2.id FROM students s2 WHERE s2.account_id = students.account_id ORDER BY s2.created_at, s2.id LIMIT 1)
  AND id <> COALESCE((SELECT a.student_id FROM student_accounts a WHERE a.id = students.account_id), '');
