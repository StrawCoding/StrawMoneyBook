CREATE TABLE IF NOT EXISTS einvoice_sync_config (
  id TEXT PRIMARY KEY,
  ledger_id TEXT,
  auto_sync_enabled INTEGER NOT NULL DEFAULT 0,
  lookback_days INTEGER NOT NULL DEFAULT 7,
  default_account_id TEXT,
  default_category_id TEXT,
  last_sync_at INTEGER,
  last_sync_status TEXT NOT NULL DEFAULT 'idle',
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS einvoice_pending_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL,
  invoice_date INTEGER NOT NULL,
  merchant_name TEXT,
  carrier_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  scraped_at INTEGER NOT NULL,
  source_sync_run_id TEXT
);

CREATE TABLE IF NOT EXISTS einvoice_sync_runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  new_pending_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT
);
