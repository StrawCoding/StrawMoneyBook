PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ledgers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'TWD',
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  color TEXT,
  icon TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS account_groups (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash','bank','ewallet','credit_card','other')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounts (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'asset' CHECK (account_type IN ('asset','liability')),
  account_kind TEXT NOT NULL DEFAULT 'cash' CHECK (account_kind IN ('cash','credit')),
  allow_negative INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative IN (0,1)),
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'TWD',
  icon TEXT DEFAULT 'fa-solid fa-wallet',
  credit_limit_minor INTEGER NOT NULL DEFAULT 0,
  repayment_reminder_day INTEGER CHECK (repayment_reminder_day IS NULL OR (repayment_reminder_day >= 1 AND repayment_reminder_day <= 31)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, group_id) REFERENCES account_groups(ledger_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS category_groups (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense','income','both')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense','income','both')),
  icon TEXT DEFAULT 'fa-solid fa-tag',
  is_budgetable INTEGER NOT NULL DEFAULT 1 CHECK (is_budgetable IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, group_id) REFERENCES category_groups(ledger_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS transactions (
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
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_id, peer_account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_id, category_id) REFERENCES categories(ledger_id, id) ON DELETE RESTRICT,
  CHECK (amount_minor IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS transaction_attachments (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  file_uri TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  checksum TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, transaction_id) REFERENCES transactions(ledger_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS counterparties (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_json TEXT,
  note TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loans (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  counterparty_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('lend','borrow')),
  principal_minor INTEGER NOT NULL CHECK (principal_minor > 0),
  interest_rule_json TEXT,
  start_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','partial','settled','void')),
  settled_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, counterparty_id) REFERENCES counterparties(ledger_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS loan_payments (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  loan_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  principal_component_minor INTEGER,
  interest_component_minor INTEGER,
  generated_tx_id TEXT,
  generated_interest_tx_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, loan_id) REFERENCES loans(ledger_id, id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_id, generated_tx_id) REFERENCES transactions(ledger_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reimbursements (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  counterparty_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','submitted','in_review','approved','paid','rejected')),
  submitted_at TEXT,
  approved_at TEXT,
  paid_at TEXT,
  paid_tx_id TEXT,
  total_minor INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, counterparty_id) REFERENCES counterparties(ledger_id, id) ON DELETE SET NULL,
  FOREIGN KEY (ledger_id, paid_tx_id) REFERENCES transactions(ledger_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reimbursement_items (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  reimbursement_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('transaction','manual','advance')),
  transaction_id TEXT,
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

CREATE TABLE IF NOT EXISTS budgets (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  name TEXT,
  include_transfers INTEGER NOT NULL DEFAULT 0 CHECK (include_transfers IN (0,1)),
  include_loan_repayments INTEGER NOT NULL DEFAULT 0 CHECK (include_loan_repayments IN (0,1)),
  include_reimbursed_expenses INTEGER NOT NULL DEFAULT 0 CHECK (include_reimbursed_expenses IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
  UNIQUE (ledger_id, month_key)
);

CREATE TABLE IF NOT EXISTS budget_items (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('category','group')),
  category_id TEXT,
  category_group_id TEXT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, budget_id) REFERENCES budgets(ledger_id, id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, category_id) REFERENCES categories(ledger_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_id, category_group_id) REFERENCES category_groups(ledger_id, id) ON DELETE RESTRICT,
  CHECK (
    (scope_type='category' AND category_id IS NOT NULL AND category_group_id IS NULL) OR
    (scope_type='group' AND category_id IS NULL AND category_group_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS app_settings (
  ledger_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, key),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deleted_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_pk TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  deleted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_group ON accounts(ledger_id, group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_accounts_archived ON accounts(ledger_id, is_archived);

CREATE INDEX IF NOT EXISTS idx_categories_group ON categories(ledger_id, group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_archived ON categories(ledger_id, is_archived);

CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(ledger_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(ledger_id, account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_category_date ON transactions(ledger_id, category_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_transfer_group ON transactions(ledger_id, transfer_group_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions(ledger_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(ledger_id, status, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_date ON loan_payments(ledger_id, loan_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_reimburse_status ON reimbursements(ledger_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reimburse_idempotency ON reimbursements(ledger_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reimburse_items_claim ON reimbursement_items(ledger_id, reimbursement_id);

CREATE INDEX IF NOT EXISTS idx_budget_month ON budgets(ledger_id, month_key);
CREATE INDEX IF NOT EXISTS idx_budget_items_budget ON budget_items(ledger_id, budget_id, sort_order);
