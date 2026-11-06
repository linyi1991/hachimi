ALTER TABLE progress ADD COLUMN partner_target INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE progress ADD COLUMN partner_done INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE progress ADD COLUMN reserve_tab INTEGER NOT NULL DEFAULT 4;
--> statement-breakpoint
ALTER TABLE progress ADD COLUMN reserve_locked INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL,
  item_id TEXT NOT NULL,
  author TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  location TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX messages_item_time ON messages(item_id,created_at);
