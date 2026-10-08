-- Um aluno (uma conta de login) pode ter mais de um personal: cada personal
-- tem o seu cadastro do aluno (students), todos ligados à mesma conta. Antes
-- só podia existir um cadastro por conta.
DROP INDEX IF EXISTS students_account_idx;
CREATE UNIQUE INDEX IF NOT EXISTS students_account_trainer_idx ON students (account_id, trainer_id) WHERE account_id IS NOT NULL;
