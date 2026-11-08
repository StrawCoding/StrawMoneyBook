ALTER TABLE reimbursement_items ADD COLUMN amount_manual_override INTEGER NOT NULL DEFAULT 0 CHECK (amount_manual_override IN (0, 1));
