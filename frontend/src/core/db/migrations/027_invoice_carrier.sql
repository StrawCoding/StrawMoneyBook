CREATE TABLE IF NOT EXISTS invoice_carrier_connections (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'einvoice_tw',
  user_label TEXT,
  mobile_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_sync_at TEXT,
  last_sync_status TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_carrier_invoices (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES invoice_carrier_connections(id),
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  seller_name TEXT,
  amount INTEGER NOT NULL,
  carrier_label TEXT,
  raw_json TEXT,
  imported_transaction_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_carrier_connections_status ON invoice_carrier_connections(status);
CREATE INDEX IF NOT EXISTS idx_invoice_carrier_invoices_connection_id ON invoice_carrier_invoices(connection_id);
CREATE INDEX IF NOT EXISTS idx_invoice_carrier_invoices_imported_tx_id ON invoice_carrier_invoices(imported_transaction_id);
