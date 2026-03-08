PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS transactions_new (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense','income','adjustment','transfer')),
  transfer_group_id TEXT,
  account_id TEXT NOT NULL,
  peer_account_id TEXT,
  category_id TEXT,
  amount_minor INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  note TEXT,
  location TEXT,
  tags_json TEXT,
  origin_type TEXT NOT NULL DEFAULT 'manual' CHECK (origin_type IN ('manual','loan_payment','reimbursement','import','recurring')),
  external_ref_id TEXT,
  idempotency_key TEXT,
  include_in_budget INTEGER NOT NULL DEFAULT 1 CHECK (include_in_budget IN (0,1)),
  include_in_analysis INTEGER NOT NULL DEFAULT 1 CHECK (include_in_analysis IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  is_reimbursable INTEGER NOT NULL DEFAULT 0 CHECK (is_reimbursable IN (0,1)),
  reimbursement_state TEXT NOT NULL DEFAULT 'none' CHECK (reimbursement_state IN ('none','pending','reimbursed')),
  reimbursed_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_id, peer_account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_id, category_id) REFERENCES categories(ledger_id, id) ON DELETE RESTRICT
);

INSERT INTO transactions_new (
  ledger_id,
  id,
  type,
  transfer_group_id,
  account_id,
  peer_account_id,
  category_id,
  amount_minor,
  occurred_at,
  note,
  location,
  tags_json,
  origin_type,
  external_ref_id,
  idempotency_key,
  include_in_budget,
  include_in_analysis,
  created_at,
  updated_at,
  deleted_at,
  is_reimbursable,
  reimbursement_state,
  reimbursed_at
)
SELECT
  ledger_id,
  id,
  type,
  transfer_group_id,
  account_id,
  peer_account_id,
  category_id,
  amount_minor,
  occurred_at,
  note,
  location,
  tags_json,
  origin_type,
  external_ref_id,
  idempotency_key,
  include_in_budget,
  include_in_analysis,
  created_at,
  updated_at,
  deleted_at,
  COALESCE(is_reimbursable, 0),
  COALESCE(reimbursement_state, 'none'),
  reimbursed_at
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(ledger_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(ledger_id, account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_category_date ON transactions(ledger_id, category_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_transfer_group ON transactions(ledger_id, transfer_group_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions(ledger_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_reimbursement_state ON transactions(ledger_id, is_reimbursable, reimbursement_state, occurred_at DESC);

PRAGMA foreign_keys = ON;
