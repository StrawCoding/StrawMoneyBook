-- Migration 046 — bank sync Architecture B account checkpoints
-- Account-level watermark / status (v1.1.1)
ALTER TABLE bank_accounts ADD COLUMN last_success_sync_at TEXT;
ALTER TABLE bank_accounts ADD COLUMN sync_cursor TEXT;
ALTER TABLE bank_accounts ADD COLUMN last_sync_status TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE bank_accounts ADD COLUMN last_error TEXT;

-- Connection aggregate + opt-in auto-import
ALTER TABLE bank_connections ADD COLUMN last_attempt_at TEXT;
ALTER TABLE bank_connections ADD COLUMN last_full_success_at TEXT;
ALTER TABLE bank_connections ADD COLUMN auto_import_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bank_transactions ADD COLUMN identity_scheme TEXT;

-- Best-effort backfill: copy connection last_sync_at onto enabled accounts
UPDATE bank_accounts
SET last_success_sync_at = (
  SELECT c.last_sync_at FROM bank_connections c
  WHERE c.ledger_id = bank_accounts.ledger_id
    AND c.id = bank_accounts.connection_id
    AND c.deleted_at IS NULL
  LIMIT 1
)
WHERE IFNULL(last_success_sync_at, '') = ''
  AND enabled = 1
  AND deleted_at IS NULL;

UPDATE bank_connections
SET last_full_success_at = last_sync_at
WHERE IFNULL(last_full_success_at, '') = ''
  AND IFNULL(last_sync_at, '') != ''
  AND deleted_at IS NULL;
