ALTER TABLE reimbursements ADD COLUMN paid_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reimbursement_items ADD COLUMN settled_minor INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS reimbursement_payments (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  reimbursement_id TEXT NOT NULL,
  account_id TEXT,
  paid_at TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  generated_tx_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, reimbursement_id) REFERENCES reimbursements(ledger_id, id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE SET NULL,
  FOREIGN KEY (ledger_id, generated_tx_id) REFERENCES transactions(ledger_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reimbursement_payment_allocations (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, payment_id) REFERENCES reimbursement_payments(ledger_id, id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, item_id) REFERENCES reimbursement_items(ledger_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reim_payments_claim
  ON reimbursement_payments(ledger_id, reimbursement_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_reim_pay_alloc_payment
  ON reimbursement_payment_allocations(ledger_id, payment_id);

UPDATE reimbursement_items
SET settled_minor = amount_minor
WHERE reimbursement_id IN (
  SELECT id FROM reimbursements WHERE status = 'paid' AND deleted_at IS NULL
)
AND settled_minor = 0;

UPDATE reimbursements
SET paid_minor = total_minor
WHERE status = 'paid'
  AND deleted_at IS NULL
  AND paid_minor = 0
  AND total_minor > 0;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_reimbursement_payments
AFTER DELETE ON reimbursement_payments
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'reimbursement_payments',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.updated_at, OLD.paid_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_reimbursement_payment_allocations
AFTER DELETE ON reimbursement_payment_allocations
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'reimbursement_payment_allocations',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;
