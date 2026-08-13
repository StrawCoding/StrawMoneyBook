-- Sell against a specific buy lot (1:1). Remaining qty/principal are derived.
PRAGMA foreign_keys = ON;

ALTER TABLE security_transactions ADD COLUMN source_buy_tx_id TEXT;

CREATE INDEX IF NOT EXISTS idx_security_transactions_source_buy
  ON security_transactions(ledger_id, source_buy_tx_id, deleted_at);
