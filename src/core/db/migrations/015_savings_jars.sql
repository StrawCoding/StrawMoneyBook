CREATE TABLE IF NOT EXISTS savings_jars (
  ledger_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  goal_type TEXT NOT NULL DEFAULT 'open' CHECK (goal_type IN ('open','target')),
  target_amount_minor INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, account_id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE CASCADE,
  CHECK (
    (goal_type = 'open' AND target_amount_minor IS NULL) OR
    (goal_type = 'target' AND target_amount_minor IS NOT NULL AND target_amount_minor > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_savings_jars_ledger
  ON savings_jars(ledger_id, goal_type, updated_at DESC);
