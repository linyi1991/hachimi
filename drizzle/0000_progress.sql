CREATE TABLE progress (
  item_id TEXT PRIMARY KEY NOT NULL,
  collected INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  owner TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE unlock_attempts (
  ip_hash TEXT PRIMARY KEY NOT NULL,
  bucket INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
