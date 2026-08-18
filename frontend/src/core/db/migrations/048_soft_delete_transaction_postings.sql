-- Migration 048: soft-delete postings when parent transaction is soft-deleted.
-- FK ON DELETE CASCADE never fires for app-level deleted_at (DB-002 / DB-014).

DROP TRIGGER IF EXISTS trg_tx_soft_delete_postings;
CREATE TRIGGER trg_tx_soft_delete_postings
AFTER UPDATE OF deleted_at ON transactions
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  UPDATE transaction_postings
     SET deleted_at = NEW.deleted_at,
         updated_at = COALESCE(NEW.updated_at, NEW.deleted_at)
   WHERE ledger_id = NEW.ledger_id
     AND transaction_id = NEW.id
     AND deleted_at IS NULL;
END;

DROP TRIGGER IF EXISTS trg_tx_soft_restore_postings;
CREATE TRIGGER trg_tx_soft_restore_postings
AFTER UPDATE OF deleted_at ON transactions
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
BEGIN
  UPDATE transaction_postings
     SET deleted_at = NULL,
         updated_at = COALESCE(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE ledger_id = NEW.ledger_id
     AND transaction_id = NEW.id
     AND deleted_at IS NOT NULL;
END;

UPDATE transaction_postings
   SET deleted_at = (
         SELECT t.deleted_at
           FROM transactions t
          WHERE t.ledger_id = transaction_postings.ledger_id
            AND t.id = transaction_postings.transaction_id
            AND t.deleted_at IS NOT NULL
       ),
       updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 WHERE deleted_at IS NULL
   AND EXISTS (
         SELECT 1
           FROM transactions t
          WHERE t.ledger_id = transaction_postings.ledger_id
            AND t.id = transaction_postings.transaction_id
            AND t.deleted_at IS NOT NULL
       );
