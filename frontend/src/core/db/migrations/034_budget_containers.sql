CREATE TABLE IF NOT EXISTS budget_containers (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  budget_save_enabled INTEGER NOT NULL DEFAULT 0,
  budget_save_target_account_id TEXT,
  budget_save_source_account_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, budget_id) REFERENCES budgets(ledger_id, id) ON DELETE CASCADE
);

ALTER TABLE budget_items ADD COLUMN budget_container_id TEXT;

CREATE INDEX IF NOT EXISTS idx_budget_containers_budget
  ON budget_containers(ledger_id, budget_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_budget_items_container
  ON budget_items(ledger_id, budget_container_id);
