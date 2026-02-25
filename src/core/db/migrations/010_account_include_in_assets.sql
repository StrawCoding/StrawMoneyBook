ALTER TABLE accounts ADD COLUMN include_in_assets INTEGER NOT NULL DEFAULT 1 CHECK (include_in_assets IN (0,1));

UPDATE accounts
SET include_in_assets = COALESCE(include_in_assets, 1);
