-- Ordem das pastas da biblioteca de exercícios escolhida pelo personal (a
-- ordem em que ele arrastou as pastas). Lista de nomes em JSON.
CREATE TABLE IF NOT EXISTS trainer_folder_order (
  trainer_id TEXT PRIMARY KEY NOT NULL,
  names TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
