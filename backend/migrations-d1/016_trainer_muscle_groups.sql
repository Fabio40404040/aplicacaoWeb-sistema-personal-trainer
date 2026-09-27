-- Pastas de grupo muscular criadas pelo proprio personal.
-- Os grupos que ja vem no sistema continuam vindo do catalogo fixo; esta
-- tabela guarda apenas os que o Fábio criar pelo painel, para que a pasta
-- apareca mesmo antes de ter qualquer exercicio dentro.

CREATE TABLE trainer_muscle_groups (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX trainer_muscle_groups_name_idx
  ON trainer_muscle_groups(trainer_id, name);
