ALTER TABLE accounts ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE accounts ADD COLUMN credit_limit_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN repayment_reminder_day INTEGER;
