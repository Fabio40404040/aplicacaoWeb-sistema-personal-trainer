CREATE TABLE student_accounts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  name VARCHAR(140) NOT NULL,
  email VARCHAR(180) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX student_accounts_email_idx ON student_accounts (lower(email));
-- Separate login identities. Never associate existing private student records
-- merely by matching an unverified email address.
