ALTER TABLE reimbursement_items RENAME TO reimbursement_items__old_source_type;

CREATE TABLE reimbursement_items (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  reimbursement_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('transaction','manual','advance')),
  transaction_id TEXT,
  entry_type TEXT NOT NULL DEFAULT 'expense' CHECK (entry_type IN ('expense', 'income')),
  category_id TEXT,
  account_id TEXT,
  description TEXT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  occurred_at TEXT NOT NULL,
  attachment_uri TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, reimbursement_id) REFERENCES reimbursements(ledger_id, id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, transaction_id) REFERENCES transactions(ledger_id, id) ON DELETE SET NULL,
  FOREIGN KEY (ledger_id, category_id) REFERENCES categories(ledger_id, id) ON DELETE SET NULL,
  FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE SET NULL
);

INSERT INTO reimbursement_items (
  ledger_id,
  id,
  reimbursement_id,
  source_type,
  transaction_id,
  entry_type,
  category_id,
  account_id,
  description,
  amount_minor,
  occurred_at,
  attachment_uri,
  created_at,
  updated_at
)
SELECT
  ledger_id,
  id,
  reimbursement_id,
  source_type,
  transaction_id,
  entry_type,
  category_id,
  account_id,
  description,
  amount_minor,
  occurred_at,
  attachment_uri,
  created_at,
  updated_at
FROM reimbursement_items__old_source_type;

DROP TABLE reimbursement_items__old_source_type;

CREATE INDEX IF NOT EXISTS idx_reimburse_items_claim ON reimbursement_items(ledger_id, reimbursement_id);
