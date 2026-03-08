ALTER TABLE reimbursement_advances
  ADD COLUMN category_id TEXT;

CREATE INDEX IF NOT EXISTS idx_reimbursement_advances_category
  ON reimbursement_advances(ledger_id, category_id, received_at DESC);
