CREATE TABLE IF NOT EXISTS invoice_carrier_connections (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  provider TEXT NOT NULL,
  auth_mode TEXT NOT NULL DEFAULT 'mobile_barcode',
  provider_connection_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reauth_required','disabled')),
  user_label TEXT,
  last_sync_at TEXT,
  last_sync_status TEXT NOT NULL DEFAULT 'idle' CHECK (last_sync_status IN ('idle','ok','error')),
  last_error TEXT,
  sync_filter_json TEXT NOT NULL DEFAULT '{}',
  carrier_options_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
  UNIQUE (ledger_id, provider, auth_mode, provider_connection_id)
);

CREATE TABLE IF NOT EXISTS invoice_carrier_invoices (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider_invoice_key TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  seller_name TEXT,
  carrier_label TEXT,
  buyer_ban TEXT,
  invoice_status TEXT NOT NULL DEFAULT 'all',
  is_viewed INTEGER NOT NULL DEFAULT 0 CHECK (is_viewed IN (0,1)),
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id, connection_id) REFERENCES invoice_carrier_connections(ledger_id, id) ON DELETE CASCADE,
  UNIQUE (ledger_id, connection_id, provider_invoice_key)
);

CREATE INDEX IF NOT EXISTS idx_invoice_carrier_connections_status
ON invoice_carrier_connections(ledger_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_carrier_invoices_connection
ON invoice_carrier_invoices(ledger_id, connection_id, invoice_date DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_carrier_invoices_viewed
ON invoice_carrier_invoices(ledger_id, connection_id, is_viewed, invoice_date DESC);
