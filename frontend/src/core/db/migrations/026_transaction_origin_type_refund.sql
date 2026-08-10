-- smb296: rebuild transactions under PRAGMA foreign_keys=ON.
-- Composite child FKs use ON DELETE SET NULL / CASCADE; disabling foreign_keys is forbidden.
-- Detach nullable refs + backup/delete CASCADE children, rebuild parent, then restore.
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS transactions_new;
DROP TABLE IF EXISTS _mig026_bak_tx_att;
DROP TABLE IF EXISTS _mig026_bak_adv_usage;
DROP TABLE IF EXISTS _mig026_bak_loan_gen;
DROP TABLE IF EXISTS _mig026_bak_reimb_paid;
DROP TABLE IF EXISTS _mig026_bak_reimb_item_tx;
DROP TABLE IF EXISTS _mig026_bak_bank_imported;
DROP TABLE IF EXISTS _mig026_bak_adv_source;

CREATE TABLE _mig026_bak_tx_att AS SELECT * FROM transaction_attachments;
CREATE TABLE _mig026_bak_adv_usage AS SELECT * FROM reimbursement_advance_usages;
CREATE TABLE _mig026_bak_loan_gen AS
  SELECT ledger_id, id, generated_tx_id FROM loan_payments WHERE generated_tx_id IS NOT NULL;
CREATE TABLE _mig026_bak_reimb_paid AS
  SELECT ledger_id, id, paid_tx_id FROM reimbursements WHERE paid_tx_id IS NOT NULL;
CREATE TABLE _mig026_bak_reimb_item_tx AS
  SELECT ledger_id, id, transaction_id FROM reimbursement_items WHERE transaction_id IS NOT NULL;
CREATE TABLE _mig026_bak_bank_imported AS
  SELECT ledger_id, id, imported_txn_id FROM bank_transactions WHERE imported_txn_id IS NOT NULL;
CREATE TABLE _mig026_bak_adv_source AS
  SELECT ledger_id, id, source_tx_id FROM reimbursement_advances WHERE source_tx_id IS NOT NULL;

UPDATE loan_payments SET generated_tx_id = NULL WHERE generated_tx_id IS NOT NULL;
UPDATE reimbursements SET paid_tx_id = NULL WHERE paid_tx_id IS NOT NULL;
UPDATE reimbursement_items SET transaction_id = NULL WHERE transaction_id IS NOT NULL;
UPDATE bank_transactions SET imported_txn_id = NULL WHERE imported_txn_id IS NOT NULL;
UPDATE reimbursement_advances SET source_tx_id = NULL WHERE source_tx_id IS NOT NULL;
DELETE FROM reimbursement_advance_usages;
DELETE FROM transaction_attachments;

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
  origin_type TEXT NOT NULL DEFAULT 'manual' CHECK (origin_type IN ('manual','loan_payment','reimbursement','import','recurring','refund')),
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

INSERT INTO transaction_attachments SELECT * FROM _mig026_bak_tx_att;
INSERT INTO reimbursement_advance_usages SELECT * FROM _mig026_bak_adv_usage;

UPDATE loan_payments
SET generated_tx_id = (
  SELECT b.generated_tx_id FROM _mig026_bak_loan_gen b
  WHERE b.ledger_id = loan_payments.ledger_id AND b.id = loan_payments.id
)
WHERE EXISTS (
  SELECT 1 FROM _mig026_bak_loan_gen b
  WHERE b.ledger_id = loan_payments.ledger_id AND b.id = loan_payments.id
);

UPDATE reimbursements
SET paid_tx_id = (
  SELECT b.paid_tx_id FROM _mig026_bak_reimb_paid b
  WHERE b.ledger_id = reimbursements.ledger_id AND b.id = reimbursements.id
)
WHERE EXISTS (
  SELECT 1 FROM _mig026_bak_reimb_paid b
  WHERE b.ledger_id = reimbursements.ledger_id AND b.id = reimbursements.id
);

UPDATE reimbursement_items
SET transaction_id = (
  SELECT b.transaction_id FROM _mig026_bak_reimb_item_tx b
  WHERE b.ledger_id = reimbursement_items.ledger_id AND b.id = reimbursement_items.id
)
WHERE EXISTS (
  SELECT 1 FROM _mig026_bak_reimb_item_tx b
  WHERE b.ledger_id = reimbursement_items.ledger_id AND b.id = reimbursement_items.id
);

UPDATE bank_transactions
SET imported_txn_id = (
  SELECT b.imported_txn_id FROM _mig026_bak_bank_imported b
  WHERE b.ledger_id = bank_transactions.ledger_id AND b.id = bank_transactions.id
)
WHERE EXISTS (
  SELECT 1 FROM _mig026_bak_bank_imported b
  WHERE b.ledger_id = bank_transactions.ledger_id AND b.id = bank_transactions.id
);

UPDATE reimbursement_advances
SET source_tx_id = (
  SELECT b.source_tx_id FROM _mig026_bak_adv_source b
  WHERE b.ledger_id = reimbursement_advances.ledger_id AND b.id = reimbursement_advances.id
)
WHERE EXISTS (
  SELECT 1 FROM _mig026_bak_adv_source b
  WHERE b.ledger_id = reimbursement_advances.ledger_id AND b.id = reimbursement_advances.id
);

DROP TABLE IF EXISTS _mig026_bak_tx_att;
DROP TABLE IF EXISTS _mig026_bak_adv_usage;
DROP TABLE IF EXISTS _mig026_bak_loan_gen;
DROP TABLE IF EXISTS _mig026_bak_reimb_paid;
DROP TABLE IF EXISTS _mig026_bak_reimb_item_tx;
DROP TABLE IF EXISTS _mig026_bak_bank_imported;
DROP TABLE IF EXISTS _mig026_bak_adv_source;

PRAGMA foreign_keys = ON;
