CREATE TABLE IF NOT EXISTS einvoice_credentials (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  platform  TEXT    NOT NULL DEFAULT 'einvoice',
  encrypted_account  TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  iv        TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS einvoice_invoice_imports (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT    NOT NULL UNIQUE,
  amount         REAL    NOT NULL,
  invoice_date   INTEGER NOT NULL,
  merchant_name  TEXT,
  carrier_name   TEXT,
  transaction_id TEXT,
  imported_at    INTEGER NOT NULL
);
