ALTER TABLE progress ADD COLUMN self_claimed INTEGER NOT NULL DEFAULT 0 CHECK(self_claimed IN (0,1));
