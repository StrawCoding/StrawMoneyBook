CREATE TABLE IF NOT EXISTS reimbursement_advances (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_tx_id TEXT,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  used_minor INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, source_tx_id) REFERENCES transactions(ledger_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reimbursement_advance_usages (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  advance_id TEXT NOT NULL,
  expense_tx_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, advance_id) REFERENCES reimbursement_advances(ledger_id, id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, expense_tx_id) REFERENCES transactions(ledger_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reimbursement_advances_account
  ON reimbursement_advances(ledger_id, account_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_reimbursement_advances_active
  ON reimbursement_advances(ledger_id, deleted_at, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_reimbursement_advance_usages_expense
  ON reimbursement_advance_usages(ledger_id, expense_tx_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reimbursement_advance_usages_unique
  ON reimbursement_advance_usages(ledger_id, advance_id, expense_tx_id);
