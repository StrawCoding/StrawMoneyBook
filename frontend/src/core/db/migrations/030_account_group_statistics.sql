ALTER TABLE accounts ADD COLUMN include_in_group_statistics INTEGER NOT NULL DEFAULT 1 CHECK (include_in_group_statistics IN (0,1));

UPDATE accounts
SET include_in_group_statistics = COALESCE(include_in_group_statistics, 1);
