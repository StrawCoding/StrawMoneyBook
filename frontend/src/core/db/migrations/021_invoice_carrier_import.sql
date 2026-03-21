ALTER TABLE invoice_carrier_connections ADD COLUMN mapped_account_id TEXT;

ALTER TABLE invoice_carrier_invoices ADD COLUMN imported INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1));

ALTER TABLE invoice_carrier_invoices ADD COLUMN imported_txn_id TEXT;

CREATE INDEX IF NOT EXISTS idx_invoice_carrier_connections_mapped_account
ON invoice_carrier_connections(ledger_id, mapped_account_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_carrier_invoices_imported
ON invoice_carrier_invoices(ledger_id, connection_id, imported, invoice_date DESC);
