-- smb300 securities v2 P1: settlement portfolio, settle_at / status, funds mode fields.
-- Migration strategy for legacy MVP rows (041):
--   - Existing buy/sell keep type/qty/price/fee; settlement_status='confirmed', settle_at=occurred_at
--   - record_mode='position'; principal/proceeds backfilled from notional±fee
--   - cash_*_tx_id NULL (MVP never wrote cash legs; new confirms create legs)
--   - securities.settlement_account_id NULL until user assigns; confirm requires it
PRAGMA foreign_keys = ON;

ALTER TABLE accounts ADD COLUMN is_settlement INTEGER NOT NULL DEFAULT 0 CHECK (is_settlement IN (0, 1));

ALTER TABLE securities ADD COLUMN settlement_account_id TEXT;

ALTER TABLE categories ADD COLUMN system_key TEXT;

DROP TABLE IF EXISTS security_transactions_new;

CREATE TABLE security_transactions_new (
  ledger_id TEXT NOT NULL,
  id TEXT NOT NULL,
  security_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  occurred_at TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  fee_mode TEXT NOT NULL DEFAULT 'into_cost' CHECK (fee_mode IN ('into_cost', 'from_proceeds')),
  record_mode TEXT NOT NULL DEFAULT 'position' CHECK (record_mode IN ('position', 'funds')),
  principal_minor INTEGER NOT NULL DEFAULT 0 CHECK (principal_minor >= 0),
  proceeds_minor INTEGER NOT NULL DEFAULT 0 CHECK (proceeds_minor >= 0),
  settle_at TEXT,
  settlement_status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (settlement_status IN ('scheduled', 'confirmed', 'cancelled')),
  confirmed_at TEXT,
  cash_account_id TEXT,
  cash_principal_tx_id TEXT,
  cash_pnl_tx_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (ledger_id, id),
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id, security_id) REFERENCES securities(ledger_id, id) ON DELETE CASCADE
);

INSERT INTO security_transactions_new (
  ledger_id, id, security_id, type, occurred_at, quantity, price_minor, fee_minor,
  fee_mode, record_mode, principal_minor, proceeds_minor, settle_at, settlement_status,
  confirmed_at, cash_account_id, cash_principal_tx_id, cash_pnl_tx_id, note,
  created_at, updated_at, deleted_at
)
SELECT
  ledger_id,
  id,
  security_id,
  type,
  occurred_at,
  quantity,
  price_minor,
  fee_minor,
  'into_cost',
  'position',
  CASE
    WHEN type = 'buy' THEN (quantity * price_minor) + fee_minor
    ELSE CASE
      WHEN (quantity * price_minor) > fee_minor THEN (quantity * price_minor) - fee_minor
      ELSE 0
    END
  END,
  CASE
    WHEN type = 'sell' THEN
      CASE
        WHEN (quantity * price_minor) > fee_minor THEN (quantity * price_minor) - fee_minor
        ELSE 0
      END
    ELSE 0
  END,
  occurred_at,
  'confirmed',
  occurred_at,
  cash_account_id,
  NULL,
  NULL,
  note,
  created_at,
  updated_at,
  deleted_at
FROM security_transactions;

DROP TABLE security_transactions;
ALTER TABLE security_transactions_new RENAME TO security_transactions;

CREATE INDEX IF NOT EXISTS idx_security_transactions_security
  ON security_transactions(ledger_id, security_id, deleted_at, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_transactions_settle_due
  ON security_transactions(ledger_id, settlement_status, settle_at, deleted_at);

CREATE INDEX IF NOT EXISTS idx_securities_settlement_account
  ON securities(ledger_id, settlement_account_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_accounts_is_settlement
  ON accounts(ledger_id, is_settlement, deleted_at);

CREATE INDEX IF NOT EXISTS idx_categories_system_key
  ON categories(ledger_id, system_key, deleted_at);
