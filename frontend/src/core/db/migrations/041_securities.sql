CREATE TABLE IF NOT EXISTS securities (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT 'TW',
  asset_class TEXT NOT NULL DEFAULT 'stock' CHECK (asset_class IN ('stock', 'etf')),
  currency_code TEXT NOT NULL DEFAULT 'TWD',
  include_in_assets INTEGER NOT NULL DEFAULT 1,
  manual_price_minor INTEGER NOT NULL DEFAULT 0,
  manual_price_at TEXT,
  price_source TEXT NOT NULL DEFAULT 'manual',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_securities_ledger_active
  ON securities(ledger_id, is_archived, deleted_at, sort_order, updated_at DESC);

CREATE TABLE IF NOT EXISTS security_transactions (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  security_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  occurred_at TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  cash_account_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, security_id) REFERENCES securities(ledger_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_security_transactions_security
  ON security_transactions(ledger_id, security_id, deleted_at, occurred_at DESC);
