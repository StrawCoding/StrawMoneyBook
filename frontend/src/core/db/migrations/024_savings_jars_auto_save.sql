ALTER TABLE savings_jars ADD COLUMN auto_save_source_account_id TEXT;
ALTER TABLE savings_jars ADD COLUMN auto_save_amount_minor INTEGER;
ALTER TABLE savings_jars ADD COLUMN auto_save_interval_value INTEGER;
ALTER TABLE savings_jars ADD COLUMN auto_save_interval_unit TEXT;
ALTER TABLE savings_jars ADD COLUMN auto_save_start_date TEXT;
ALTER TABLE savings_jars ADD COLUMN auto_save_charge_day INTEGER;
ALTER TABLE savings_jars ADD COLUMN auto_save_paused INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_savings_jars_auto_save
  ON savings_jars(ledger_id, auto_save_paused, updated_at DESC);
