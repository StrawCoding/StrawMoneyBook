-- Migration 047: restore deleted_log triggers lost by rebuild-by-rename
-- (026 / 045 DROP TABLE transactions) and cover SNAPSHOT_TABLE_ORDER tables
-- added after 018 that never received trg_deleted_log_*.
-- CREATE TRIGGER IF NOT EXISTS is idempotent for already-patched databases.

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_transactions
AFTER DELETE ON transactions
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'transactions',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.occurred_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_transaction_postings
AFTER DELETE ON transaction_postings
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'transaction_postings',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_budget_save_settlements
AFTER DELETE ON budget_save_settlements
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'budget_save_settlements',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_budget_containers
AFTER DELETE ON budget_containers
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'budget_containers',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_securities
AFTER DELETE ON securities
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'securities',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_security_transactions
AFTER DELETE ON security_transactions
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'security_transactions',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.occurred_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_credit_statements
AFTER DELETE ON credit_statements
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'credit_statements',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_credit_repayments
AFTER DELETE ON credit_repayments
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'credit_repayments',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.paid_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_credit_repayment_allocations
AFTER DELETE ON credit_repayment_allocations
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'credit_repayment_allocations',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;
