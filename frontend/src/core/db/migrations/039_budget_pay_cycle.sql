ALTER TABLE ledgers ADD COLUMN budget_period_mode TEXT NOT NULL DEFAULT 'calendar_month';
ALTER TABLE ledgers ADD COLUMN budget_pay_day INTEGER NOT NULL DEFAULT 1;

ALTER TABLE budgets ADD COLUMN period_key TEXT;
ALTER TABLE budgets ADD COLUMN period_start_date TEXT;
ALTER TABLE budgets ADD COLUMN period_end_date TEXT;
ALTER TABLE budgets ADD COLUMN period_mode TEXT NOT NULL DEFAULT 'calendar_month';

UPDATE budgets
SET period_key = month_key,
    period_start_date = month_key || '-01',
    period_end_date = date(month_key || '-01', '+1 month', '-1 day'),
    period_mode = 'calendar_month'
WHERE period_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_period_key
  ON budgets(ledger_id, period_key)
  WHERE deleted_at IS NULL AND period_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budget_period_dates
  ON budgets(ledger_id, period_start_date, period_end_date);
