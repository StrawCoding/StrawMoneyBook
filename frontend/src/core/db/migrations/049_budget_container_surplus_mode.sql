ALTER TABLE budget_containers ADD COLUMN surplus_mode TEXT NOT NULL DEFAULT 'roll';

UPDATE budget_containers
SET surplus_mode = 'save'
WHERE budget_save_enabled = 1;
