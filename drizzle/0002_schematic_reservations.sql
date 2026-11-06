CREATE TABLE schematic_progress (
  schematic_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','known','paid')),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE schematic_events (
  id TEXT PRIMARY KEY NOT NULL,
  schematic_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('existing','pay','reset')),
  actor TEXT NOT NULL,
  materials_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX schematic_events_history ON schematic_events(schematic_id,created_at);
--> statement-breakpoint
CREATE TABLE calculation_views (
  account_name TEXT PRIMARY KEY NOT NULL,
  fleet INTEGER NOT NULL CHECK(fleet BETWEEN 1 AND 4),
  stage TEXT NOT NULL CHECK(stage IN ('all','start','upgrade','to1121','to3113','to1123','to3124')),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
ALTER TABLE progress ADD COLUMN history_delivered INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE history_events (
 id TEXT PRIMARY KEY NOT NULL,
 actor TEXT NOT NULL,
 fleet INTEGER NOT NULL,
 before_step TEXT NOT NULL,
 materials_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
