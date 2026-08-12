-- smb301 credit card system P0 (v1.1 hard contracts)
PRAGMA foreign_keys = ON;

-- Credit profile on accounts
ALTER TABLE accounts ADD COLUMN statement_close_day INTEGER
  CHECK (statement_close_day IS NULL OR (statement_close_day >= 1 AND statement_close_day <= 31));
ALTER TABLE accounts ADD COLUMN payment_due_day INTEGER
  CHECK (payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31));
ALTER TABLE accounts ADD COLUMN card_last4 TEXT;
ALTER TABLE accounts ADD COLUMN issuer TEXT;

-- posted_at is the ONLY field used to assign statement_id (occurred_at = budget/calendar)
ALTER TABLE transactions ADD COLUMN posted_at TEXT;
UPDATE transactions SET posted_at = occurred_at WHERE posted_at IS NULL OR posted_at = '';

-- Auto-defaults for existing credit / credit_card accounts
UPDATE accounts
SET statement_close_day = COALESCE(
      statement_close_day,
      CASE
        WHEN repayment_reminder_day IS NOT NULL AND repayment_reminder_day BETWEEN 1 AND 31
          THEN repayment_reminder_day
        ELSE 25
      END
    ),
    payment_due_day = COALESCE(
      payment_due_day,
      CASE
        WHEN repayment_reminder_day IS NOT NULL AND repayment_reminder_day BETWEEN 1 AND 31
          THEN repayment_reminder_day
        ELSE 15
      END
    ),
    updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%f','now'))
WHERE deleted_at IS NULL
  AND (
    account_kind = 'credit'
    OR LOWER(COALESCE(name, '')) LIKE '%credit%'
    OR LOWER(COALESCE(name, '')) LIKE '%信用卡%'
  );

UPDATE accounts
SET account_kind = 'credit',
    account_type = CASE WHEN account_type = 'asset' THEN 'liability' ELSE account_type END,
    allow_negative = 1,
    updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%f','now'))
WHERE deleted_at IS NULL
  AND account_kind != 'credit'
  AND group_id IN (
    SELECT id FROM account_groups
    WHERE type = 'credit_card' AND deleted_at IS NULL
  );

UPDATE accounts
SET statement_close_day = COALESCE(statement_close_day, 25),
    payment_due_day = COALESCE(payment_due_day, COALESCE(repayment_reminder_day, 15)),
    updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%f','now'))
WHERE deleted_at IS NULL AND account_kind = 'credit';

CREATE TABLE IF NOT EXISTS credit_statements (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  period_start_inclusive TEXT NOT NULL,
  period_end_exclusive TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  closing_balance_minor INTEGER,
  due_on TEXT,
  closed_at TEXT,
  closing_hash TEXT,
  close_token TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  UNIQUE (ledger_id, account_id, period_start_inclusive),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_statements_one_open
  ON credit_statements(ledger_id, account_id)
  WHERE status = 'open' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_statements_close_token
  ON credit_statements(ledger_id, id, close_token)
  WHERE close_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_statements_account_period
  ON credit_statements(ledger_id, account_id, period_start_inclusive DESC);

CREATE TABLE IF NOT EXISTS credit_repayments (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_account_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  paid_at TEXT NOT NULL,
  transfer_group_id TEXT,
  idempotency_key TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  UNIQUE (ledger_id, idempotency_key),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_id, source_account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_credit_repayments_account
  ON credit_repayments(ledger_id, account_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS credit_repayment_allocations (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  repayment_id TEXT NOT NULL,
  statement_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  UNIQUE (ledger_id, repayment_id, statement_id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, repayment_id) REFERENCES credit_repayments(ledger_id, id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, statement_id) REFERENCES credit_statements(ledger_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_credit_alloc_statement
  ON credit_repayment_allocations(ledger_id, statement_id);

CREATE TABLE IF NOT EXISTS transaction_postings (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'expense_accrual', 'card_liability', 'cash_transfer', 'fee', 'adjustment', 'reversal'
  )),
  account_id TEXT,
  category_id TEXT,
  amount_minor INTEGER NOT NULL,
  statement_id TEXT,
  include_in_budget INTEGER NOT NULL DEFAULT 0 CHECK (include_in_budget IN (0, 1)),
  include_in_analysis INTEGER NOT NULL DEFAULT 0 CHECK (include_in_analysis IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, transaction_id) REFERENCES transactions(ledger_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tx_postings_tx
  ON transaction_postings(ledger_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_tx_postings_statement
  ON transaction_postings(ledger_id, statement_id, role);
CREATE INDEX IF NOT EXISTS idx_tx_posted_at
  ON transactions(ledger_id, posted_at DESC);
