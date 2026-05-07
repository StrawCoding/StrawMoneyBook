DROP TABLE IF EXISTS invoice_carrier_invoices;

DROP TABLE IF EXISTS invoice_carrier_connections;

DELETE FROM app_settings
WHERE key LIKE 'invoice_carrier.%'
   OR key LIKE 'einvoice.%';
