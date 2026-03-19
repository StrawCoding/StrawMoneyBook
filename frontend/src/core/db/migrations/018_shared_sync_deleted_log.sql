CREATE INDEX IF NOT EXISTS idx_deleted_log_lookup
ON deleted_log(ledger_id, table_name, row_pk, deleted_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_account_groups
AFTER DELETE ON account_groups
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'account_groups',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_accounts
AFTER DELETE ON accounts
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'accounts',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_category_groups
AFTER DELETE ON category_groups
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'category_groups',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_categories
AFTER DELETE ON categories
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'categories',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

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

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_transaction_attachments
AFTER DELETE ON transaction_attachments
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'transaction_attachments',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_counterparties
AFTER DELETE ON counterparties
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'counterparties',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_loans
AFTER DELETE ON loans
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'loans',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.settled_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_loan_payments
AFTER DELETE ON loan_payments
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'loan_payments',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.updated_at, OLD.paid_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_reimbursement_advances
AFTER DELETE ON reimbursement_advances
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'reimbursement_advances',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.received_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_reimbursement_advance_usages
AFTER DELETE ON reimbursement_advance_usages
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'reimbursement_advance_usages',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_reimbursements
AFTER DELETE ON reimbursements
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'reimbursements',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.paid_at, OLD.approved_at, OLD.submitted_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_reimbursement_items
AFTER DELETE ON reimbursement_items
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'reimbursement_items',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.updated_at, OLD.occurred_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_budgets
AFTER DELETE ON budgets
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'budgets',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_budget_items
AFTER DELETE ON budget_items
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'budget_items',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_savings_jars
AFTER DELETE ON savings_jars
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'savings_jars',
    OLD.account_id,
    json_object('account_id', OLD.account_id),
    COALESCE(OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_bank_connections
AFTER DELETE ON bank_connections
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'bank_connections',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.last_sync_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_bank_accounts
AFTER DELETE ON bank_accounts
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'bank_accounts',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.deleted_at, OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_bank_transactions
AFTER DELETE ON bank_transactions
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'bank_transactions',
    OLD.id,
    json_object('id', OLD.id),
    COALESCE(OLD.updated_at, OLD.last_seen_at, OLD.posted_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_bank_sync_rules
AFTER DELETE ON bank_sync_rules
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'bank_sync_rules',
    OLD.connection_id,
    json_object('connection_id', OLD.connection_id),
    COALESCE(OLD.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_deleted_log_app_settings
AFTER DELETE ON app_settings
BEGIN
  INSERT INTO deleted_log (ledger_id, table_name, row_pk, payload_json, deleted_at)
  VALUES (
    OLD.ledger_id,
    'app_settings',
    OLD.key,
    json_object('key', OLD.key),
    COALESCE(OLD.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;
