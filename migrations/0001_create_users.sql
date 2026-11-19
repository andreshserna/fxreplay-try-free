-- Users created by the signup flow, and the idempotency keys of the requests that created them.
-- The email is unique here, in the database, so two concurrent requests cannot both win.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  markets TEXT,
  experience TEXT,
  goal TEXT,
  anonymous_id TEXT,
  attribution TEXT,
  experiments TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX users_email_unique ON users (email);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL
) STRICT;
