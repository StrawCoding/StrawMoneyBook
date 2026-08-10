/**
 * Shared backup import table order + SQLite column contracts.
 * Used by structural gate (pre-wipe) and import.service (INSERT prep)
 * so unknown / incomplete rows cannot pass summary+ledger-id gates then fail after wipe.
 */

/** Same order as import.service TABLE_IMPORT_ORDER — keep in sync. */
export const BACKUP_IMPORT_TABLE_ORDER = Object.freeze([
  'account_groups',
  'accounts',
  'category_groups',
  'categories',
  'transactions',
  'transaction_attachments',
  'counterparties',
  'loans',
  'loan_payments',
  'reimbursement_advances',
  'reimbursement_advance_usages',
  'reimbursements',
  'reimbursement_items',
  'budget_save_settlements',
  'budgets',
  'budget_containers',
  'budget_items',
  'savings_jars',
  'bank_connections',
  'bank_accounts',
  'bank_transactions',
  'bank_sync_rules',
  'app_settings',
  'deleted_log',
])

function cols(...names) {
  return Object.freeze(new Set(names))
}

/**
 * columns: every legal SQLite column for INSERT (incl. ledger_id; importer may inject it).
 * required: NOT NULL columns without DEFAULT that must be present on the row for INSERT
 *           of only listed keys to succeed. ledger_id is injected by importer — not required here.
 */
export const BACKUP_IMPORT_TABLE_SCHEMA = Object.freeze({
  account_groups: {
    columns: cols(
      'ledger_id', 'id', 'name', 'type', 'sort_order', 'is_archived',
      'created_at', 'updated_at', 'deleted_at',
    ),
    required: Object.freeze(['id', 'name', 'type', 'created_at', 'updated_at']),
  },
  accounts: {
    columns: cols(
      'ledger_id', 'id', 'group_id', 'name', 'account_type', 'account_kind',
      'allow_negative', 'opening_balance_minor', 'currency_code', 'icon',
      'credit_limit_minor', 'repayment_reminder_day', 'sort_order', 'is_archived',
      'created_at', 'updated_at', 'deleted_at', 'include_in_assets',
      'include_in_group_statistics',
    ),
    required: Object.freeze(['id', 'group_id', 'name', 'created_at', 'updated_at']),
  },
  category_groups: {
    columns: cols(
      'ledger_id', 'id', 'name', 'kind', 'sort_order', 'is_archived',
      'created_at', 'updated_at', 'deleted_at',
    ),
    required: Object.freeze(['id', 'name', 'kind', 'created_at', 'updated_at']),
  },
  categories: {
    columns: cols(
      'ledger_id', 'id', 'group_id', 'name', 'kind', 'icon', 'is_budgetable',
      'sort_order', 'is_archived', 'created_at', 'updated_at', 'deleted_at',
      'default_include_in_analysis', 'default_include_in_budget', 'default_is_reimbursable',
    ),
    required: Object.freeze(['id', 'group_id', 'name', 'kind', 'created_at', 'updated_at']),
  },
  transactions: {
    columns: cols(
      'ledger_id', 'id', 'type', 'transfer_group_id', 'account_id', 'peer_account_id',
      'category_id', 'amount_minor', 'occurred_at', 'note', 'location', 'tags_json',
      'origin_type', 'external_ref_id', 'idempotency_key', 'include_in_budget',
      'include_in_analysis', 'created_at', 'updated_at', 'deleted_at',
      'is_reimbursable', 'reimbursement_state', 'reimbursed_at', 'reimburse_target_minor',
      'created_by_user_id', 'created_by_display_name', 'updated_by_user_id',
      'updated_by_display_name',
    ),
    required: Object.freeze([
      'id', 'type', 'account_id', 'amount_minor', 'occurred_at', 'created_at', 'updated_at',
    ]),
  },
  transaction_attachments: {
    columns: cols(
      'ledger_id', 'id', 'transaction_id', 'file_uri', 'mime_type', 'file_size',
      'checksum', 'created_at',
    ),
    required: Object.freeze(['id', 'transaction_id', 'file_uri', 'mime_type', 'file_size', 'created_at']),
  },
  counterparties: {
    columns: cols(
      'ledger_id', 'id', 'name', 'contact_json', 'note', 'is_archived',
      'created_at', 'updated_at',
    ),
    required: Object.freeze(['id', 'name', 'created_at', 'updated_at']),
  },
  loans: {
    columns: cols(
      'ledger_id', 'id', 'counterparty_id', 'direction', 'principal_minor',
      'interest_rule_json', 'start_date', 'due_date', 'status', 'settled_at', 'note',
      'created_at', 'updated_at', 'deleted_at',
    ),
    required: Object.freeze([
      'id', 'counterparty_id', 'direction', 'principal_minor', 'start_date', 'status',
      'created_at', 'updated_at',
    ]),
  },
  loan_payments: {
    columns: cols(
      'ledger_id', 'id', 'loan_id', 'account_id', 'paid_at', 'amount_minor',
      'principal_component_minor', 'interest_component_minor', 'generated_tx_id',
      'generated_interest_tx_id', 'note', 'created_at', 'updated_at',
    ),
    required: Object.freeze(['id', 'loan_id', 'account_id', 'paid_at', 'amount_minor', 'created_at', 'updated_at']),
  },
  reimbursement_advances: {
    columns: cols(
      'ledger_id', 'id', 'account_id', 'source_tx_id', 'amount_minor', 'used_minor',
      'note', 'received_at', 'created_at', 'updated_at', 'deleted_at', 'category_id',
      'return_amount_minor',
    ),
    required: Object.freeze(['id', 'account_id', 'received_at', 'created_at', 'updated_at']),
  },
  reimbursement_advance_usages: {
    columns: cols(
      'ledger_id', 'id', 'advance_id', 'expense_tx_id', 'amount_minor',
      'created_at', 'updated_at',
    ),
    required: Object.freeze(['id', 'advance_id', 'expense_tx_id', 'created_at', 'updated_at']),
  },
  reimbursements: {
    columns: cols(
      'ledger_id', 'id', 'title', 'counterparty_id', 'status', 'submitted_at',
      'approved_at', 'paid_at', 'paid_tx_id', 'total_minor', 'note', 'idempotency_key',
      'created_at', 'updated_at', 'deleted_at',
    ),
    required: Object.freeze(['id', 'title', 'status', 'created_at', 'updated_at']),
  },
  reimbursement_items: {
    columns: cols(
      'ledger_id', 'id', 'reimbursement_id', 'source_type', 'transaction_id',
      'category_id', 'account_id', 'description', 'amount_minor', 'occurred_at',
      'attachment_uri', 'created_at', 'updated_at', 'entry_type',
    ),
    required: Object.freeze([
      'id', 'reimbursement_id', 'source_type', 'amount_minor', 'occurred_at',
      'created_at', 'updated_at',
    ]),
  },
  budget_save_settlements: {
    columns: cols(
      'ledger_id', 'id', 'scope_type', 'scope_ref_id', 'period_key', 'source_account_id',
      'target_account_id', 'settled_amount_minor', 'status', 'transfer_group_id',
      'last_error', 'created_at', 'updated_at',
    ),
    required: Object.freeze(['id', 'scope_type', 'scope_ref_id', 'period_key', 'status', 'created_at', 'updated_at']),
  },
  budgets: {
    columns: cols(
      'ledger_id', 'id', 'month_key', 'name', 'include_transfers', 'include_loan_repayments',
      'include_reimbursed_expenses', 'created_at', 'updated_at', 'deleted_at',
      'budget_save_total_enabled', 'budget_save_total_target_account_id',
      'budget_save_total_source_account_id', 'period_key', 'period_start_date',
      'period_end_date', 'period_mode',
    ),
    required: Object.freeze(['id', 'month_key', 'created_at', 'updated_at']),
  },
  budget_containers: {
    columns: cols(
      'ledger_id', 'id', 'budget_id', 'name', 'amount_minor', 'budget_save_enabled',
      'budget_save_target_account_id', 'budget_save_source_account_id', 'sort_order',
      'created_at', 'updated_at', 'period_mode',
    ),
    required: Object.freeze(['id', 'budget_id', 'name', 'created_at', 'updated_at']),
  },
  budget_items: {
    columns: cols(
      'ledger_id', 'id', 'budget_id', 'scope_type', 'category_id', 'category_group_id',
      'amount_minor', 'sort_order', 'created_at', 'updated_at', 'amount_mode',
      'day_rule_unit', 'day_rule_values_json', 'budget_save_enabled',
      'budget_save_target_account_id', 'budget_save_source_account_id', 'budget_container_id',
    ),
    required: Object.freeze(['id', 'budget_id', 'scope_type', 'amount_minor', 'created_at', 'updated_at']),
  },
  savings_jars: {
    columns: cols(
      'ledger_id', 'account_id', 'goal_type', 'target_amount_minor', 'created_at', 'updated_at',
      'auto_save_source_account_id', 'auto_save_amount_minor', 'auto_save_interval_value',
      'auto_save_interval_unit', 'auto_save_start_date', 'auto_save_charge_day', 'auto_save_paused',
    ),
    required: Object.freeze(['account_id', 'created_at', 'updated_at']),
  },
  bank_connections: {
    columns: cols(
      'ledger_id', 'id', 'provider', 'provider_connection_id', 'status', 'user_label',
      'last_sync_at', 'sync_cursor', 'last_sync_status', 'last_error',
      'created_at', 'updated_at', 'deleted_at',
    ),
    required: Object.freeze(['id', 'provider', 'provider_connection_id', 'created_at', 'updated_at']),
  },
  bank_accounts: {
    columns: cols(
      'ledger_id', 'id', 'connection_id', 'provider_account_id', 'account_mask',
      'account_name', 'account_type', 'currency', 'enabled', 'user_label',
      'mapped_account_id', 'created_at', 'updated_at', 'deleted_at',
    ),
    required: Object.freeze(['id', 'connection_id', 'provider_account_id', 'account_name', 'created_at', 'updated_at']),
  },
  bank_transactions: {
    columns: cols(
      'ledger_id', 'id', 'connection_id', 'bank_account_id', 'provider_transaction_id',
      'posted_at', 'amount_minor', 'currency', 'description', 'merchant', 'status',
      'seen_in_app', 'imported', 'imported_txn_id', 'raw_json', 'first_seen_at',
      'last_seen_at', 'created_at', 'updated_at', 'transaction_type', 'note', 'summary',
      'balance_minor',
    ),
    required: Object.freeze([
      'id', 'connection_id', 'bank_account_id', 'provider_transaction_id', 'posted_at',
      'amount_minor', 'first_seen_at', 'last_seen_at', 'created_at', 'updated_at',
    ]),
  },
  bank_sync_rules: {
    columns: cols(
      'ledger_id', 'connection_id', 'direction', 'exclude_keywords_json', 'min_amount_minor',
      'include_pending', 'lookback_days', 'updated_at',
    ),
    required: Object.freeze(['connection_id', 'updated_at']),
  },
  app_settings: {
    columns: cols('ledger_id', 'key', 'value_json', 'updated_at'),
    required: Object.freeze(['key', 'value_json', 'updated_at']),
  },
  deleted_log: {
    columns: cols('id', 'ledger_id', 'table_name', 'row_pk', 'payload_json', 'deleted_at'),
    required: Object.freeze(['table_name', 'row_pk', 'payload_json', 'deleted_at']),
  },
})

export function toSafeSqlIdentifier(identifier, tableName) {
  const value = String(identifier ?? '').trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`表 ${tableName} 欄位名稱不合法：${value}`)
  }
  return value
}

export function objectToInsertSql(tableName, row) {
  const keys = Object.keys(row).map((key) => toSafeSqlIdentifier(key, tableName))
  if (!keys.length) {
    throw new Error(`表 ${tableName} 缺少欄位資料`)
  }
  const placeholders = keys.map(() => '?').join(', ')
  const sql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders});`
  const values = keys.map((key) => row[key])
  return { sql, values }
}

function isMissingRequiredValue(value) {
  return value === undefined || value === null || value === ''
}

/**
 * Prove sanitized ledger payload rows can be turned into SQLite INSERTs
 * without unknown columns or missing NOT-NULL-without-default fields.
 * Does not touch the database.
 */
export function assertImportTableRowsInsertable(sanitizedPayload) {
  const tables = sanitizedPayload?.tables && typeof sanitizedPayload.tables === 'object'
    ? sanitizedPayload.tables
    : {}

  for (const tableName of BACKUP_IMPORT_TABLE_ORDER) {
    const rows = Array.isArray(tables[tableName]) ? tables[tableName] : []
    const schema = BACKUP_IMPORT_TABLE_SCHEMA[tableName]
    if (!schema) {
      throw new Error(`表 ${tableName} 缺少匯入 schema 合約`)
    }

    for (let index = 0; index < rows.length; index += 1) {
      const sourceRow = rows[index]
      if (!sourceRow || typeof sourceRow !== 'object' || Array.isArray(sourceRow)) {
        throw new Error(`表 ${tableName} 第 ${index + 1} 筆資料格式無效`)
      }

      // Mirror importer: inject ledger_id for INSERT prep (may already exist).
      const row = { ...sourceRow, ledger_id: sourceRow.ledger_id || 'gate_ledger_probe' }
      if (tableName === 'deleted_log') {
        delete row.id
      }

      const keys = Object.keys(row)
      if (!keys.length) {
        throw new Error(`表 ${tableName} 缺少欄位資料`)
      }

      for (const key of keys) {
        toSafeSqlIdentifier(key, tableName)
        if (!schema.columns.has(key)) {
          throw new Error(`表 ${tableName} 含不存在的欄位：${key}`)
        }
      }

      for (const required of schema.required) {
        if (isMissingRequiredValue(row[required])) {
          throw new Error(`表 ${tableName} 缺少必要欄位：${required}`)
        }
      }

      // Same SQL shape the formal importer would build.
      objectToInsertSql(tableName, row)
    }
  }
}
