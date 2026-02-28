ALTER TABLE reimbursement_items
  ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'expense'
  CHECK (entry_type IN ('expense', 'income'));
