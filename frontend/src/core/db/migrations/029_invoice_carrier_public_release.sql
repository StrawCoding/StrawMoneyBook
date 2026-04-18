ALTER TABLE invoice_carrier_connections ADD COLUMN settings_ledger_id TEXT;
ALTER TABLE invoice_carrier_connections ADD COLUMN provider_connection_id TEXT;
ALTER TABLE invoice_carrier_connections ADD COLUMN carrier_options_json TEXT NOT NULL DEFAULT '[]';

UPDATE invoice_carrier_connections
SET provider_connection_id = id
WHERE provider_connection_id IS NULL OR provider_connection_id = '';

UPDATE invoice_carrier_connections
SET carrier_options_json = '[]'
WHERE carrier_options_json IS NULL OR carrier_options_json = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_carrier_connection_provider_ref
  ON invoice_carrier_connections(provider, provider_connection_id)
  WHERE provider_connection_id IS NOT NULL AND provider_connection_id != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_carrier_invoices_unique_invoice
  ON invoice_carrier_invoices(connection_id, invoice_number, invoice_date);
