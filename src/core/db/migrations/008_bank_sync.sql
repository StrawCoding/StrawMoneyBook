CREATE TABLE IF NOT EXISTS bank_connections (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_connection_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','error')),
  user_label TEXT,
  last_sync_at TEXT,
  sync_cursor TEXT,
  last_sync_status TEXT NOT NULL DEFAULT 'idle' CHECK (last_sync_status IN ('idle','ok','error')),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
  UNIQUE (ledger_id, provider, provider_connection_id)
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  account_mask TEXT,
  account_name TEXT NOT NULL,
  account_type TEXT,
  currency TEXT NOT NULL DEFAULT 'TWD',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  user_label TEXT,
  mapped_account_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, connection_id) REFERENCES bank_connections(ledger_id, id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, mapped_account_id) REFERENCES accounts(ledger_id, id) ON DELETE SET NULL,
  UNIQUE (ledger_id, connection_id, provider_account_id)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TWD',
  description TEXT,
  merchant TEXT,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','reversed')),
  seen_in_app INTEGER NOT NULL DEFAULT 0 CHECK (seen_in_app IN (0,1)),
  imported INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1)),
  imported_txn_id TEXT,
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, connection_id) REFERENCES bank_connections(ledger_id, id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, bank_account_id) REFERENCES bank_accounts(ledger_id, id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, imported_txn_id) REFERENCES transactions(ledger_id, id) ON DELETE SET NULL,
  UNIQUE (ledger_id, bank_account_id, provider_transaction_id)
);

CREATE TABLE IF NOT EXISTS bank_sync_rules (
  ledger_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'all' CHECK (direction IN ('all','income','expense')),
  exclude_keywords_json TEXT NOT NULL DEFAULT '[]',
  min_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (min_amount_minor >= 0),
  include_pending INTEGER NOT NULL DEFAULT 0 CHECK (include_pending IN (0,1)),
  lookback_days INTEGER NOT NULL DEFAULT 3 CHECK (lookback_days >= 0 AND lookback_days <= 30),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ledger_id, connection_id),
  FOREIGN KEY (ledger_id, connection_id) REFERENCES bank_connections(ledger_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bank_connections_status
ON bank_connections(ledger_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_connection_enabled
ON bank_accounts(ledger_id, connection_id, enabled, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_tx_posted_at
ON bank_transactions(ledger_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_tx_imported
ON bank_transactions(ledger_id, imported, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_tx_seen
ON bank_transactions(ledger_id, seen_in_app, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_tx_status
ON bank_transactions(ledger_id, status, posted_at DESC);
