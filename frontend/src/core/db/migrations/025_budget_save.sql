ALTER TABLE budgets ADD COLUMN budget_save_total_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE budgets ADD COLUMN budget_save_total_target_account_id TEXT;
ALTER TABLE budgets ADD COLUMN budget_save_total_source_account_id TEXT;

ALTER TABLE budget_items ADD COLUMN budget_save_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE budget_items ADD COLUMN budget_save_target_account_id TEXT;
ALTER TABLE budget_items ADD COLUMN budget_save_source_account_id TEXT;

CREATE TABLE IF NOT EXISTS budget_save_settlements (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('budget_item_day', 'budget_item_month', 'budget_total_month')),
  scope_ref_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  source_account_id TEXT,
  target_account_id TEXT,
  settled_amount_minor INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('settled', 'skipped_no_surplus', 'invalid_config', 'conflict', 'failed')),
  transfer_group_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, id),
  UNIQUE (ledger_id, scope_type, scope_ref_id, period_key),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_budget_save_settlements_scope
  ON budget_save_settlements(ledger_id, scope_type, scope_ref_id, period_key);

CREATE INDEX IF NOT EXISTS idx_budget_save_settlements_updated
  ON budget_save_settlements(ledger_id, updated_at DESC);
