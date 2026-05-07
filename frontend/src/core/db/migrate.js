import migration001 from '@/core/db/migrations/001_init.sql?raw'
import migration002 from '@/core/db/migrations/002_transaction_reimbursement_flags.sql?raw'
import migration003 from '@/core/db/migrations/003_transaction_budget_analysis_flags.sql?raw'
import migration004 from '@/core/db/migrations/004_account_category_icons.sql?raw'
import migration005 from '@/core/db/migrations/005_default_icons_backfill.sql?raw'
import migration006 from '@/core/db/migrations/006_ledger_sort_order.sql?raw'
import migration007 from '@/core/db/migrations/007_remove_default_sample_transaction.sql?raw'
import migration008 from '@/core/db/migrations/008_bank_sync.sql?raw'
import migration009 from '@/core/db/migrations/009_allow_zero_amount_transaction.sql?raw'
import migration010 from '@/core/db/migrations/010_account_include_in_assets.sql?raw'
import migration011 from '@/core/db/migrations/011_reimbursement_advances.sql?raw'
import migration012 from '@/core/db/migrations/012_reimbursement_item_entry_type.sql?raw'
import migration013 from '@/core/db/migrations/013_budget_item_daily_rules.sql?raw'
import migration014 from '@/core/db/migrations/014_reimbursement_advance_category.sql?raw'
import migration015 from '@/core/db/migrations/015_savings_jars.sql?raw'
import migration016 from '@/core/db/migrations/016_loan_payment_interest_tx.sql?raw'
import migration017 from '@/core/db/migrations/017_account_credit_profile.sql?raw'
import migration018 from '@/core/db/migrations/018_shared_sync_deleted_log.sql?raw'
import migration019 from '@/core/db/migrations/019_bank_transaction_metadata.sql?raw'
// NOTE: versions 20 and 21 were intentionally removed during schema consolidation.
// The schema changes from those drafts were either reverted or merged into adjacent migrations.
// Do NOT reuse version numbers 20 or 21 — doing so would skip execution on devices that already
// have schema_migrations rows for those versions, causing a schema split between new and existing installs.
// Next available version: 32.
import migration023 from '@/core/db/migrations/023_reimbursement_item_advance_source.sql?raw'
import migration024 from '@/core/db/migrations/024_savings_jars_auto_save.sql?raw'
import migration025 from '@/core/db/migrations/025_budget_save.sql?raw'
import migration026 from '@/core/db/migrations/026_transaction_origin_type_refund.sql?raw'
import migration028 from '@/core/db/migrations/028_advance_return_amount.sql?raw'
import migration030 from '@/core/db/migrations/030_account_group_statistics.sql?raw'
import migration031 from '@/core/db/migrations/031_remove_invoice_carrier.sql?raw'
import { executeMigrationSql, isIgnorableMigrationError } from '@/core/db/migration-executor'

const MIGRATIONS = [
  { version: 1, name: 'init_schema', sql: migration001 },
  { version: 2, name: 'transaction_reimbursement_flags', sql: migration002 },
  { version: 3, name: 'transaction_budget_analysis_flags', sql: migration003 },
  { version: 4, name: 'account_category_icons', sql: migration004 },
  { version: 5, name: 'default_icons_backfill', sql: migration005 },
  { version: 6, name: 'ledger_sort_order', sql: migration006 },
  { version: 7, name: 'remove_default_sample_transaction', sql: migration007 },
  { version: 8, name: 'bank_sync', sql: migration008 },
  { version: 9, name: 'allow_zero_amount_transaction', sql: migration009 },
  { version: 10, name: 'account_include_in_assets', sql: migration010 },
  { version: 11, name: 'reimbursement_advances', sql: migration011 },
  { version: 12, name: 'reimbursement_item_entry_type', sql: migration012 },
  { version: 13, name: 'budget_item_daily_rules', sql: migration013 },
  { version: 14, name: 'reimbursement_advance_category', sql: migration014 },
  { version: 15, name: 'savings_jars', sql: migration015 },
  { version: 16, name: 'loan_payment_interest_tx', sql: migration016 },
  { version: 17, name: 'account_credit_profile', sql: migration017 },
  { version: 18, name: 'shared_sync_deleted_log', sql: migration018 },
  { version: 19, name: 'bank_transaction_metadata', sql: migration019 },
  { version: 23, name: 'reimbursement_item_advance_source', sql: migration023 },
  { version: 24, name: 'savings_jars_auto_save', sql: migration024 },
  { version: 25, name: 'budget_save', sql: migration025 },
  { version: 26, name: 'transaction_origin_type_refund', sql: migration026 },
  { version: 28, name: 'advance_return_amount', sql: migration028 },
  { version: 30, name: 'account_group_statistics', sql: migration030 },
  { version: 31, name: 'remove_invoice_carrier', sql: migration031 },
]

const LEGACY_SCHEMA_PATCH_META_KEY = 'legacy_schema_patched_v1'

const LEGACY_COLUMN_PATCHES = {
  ledgers: [
    "ALTER TABLE ledgers ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'TWD';",
    "ALTER TABLE ledgers ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Taipei';",
    'ALTER TABLE ledgers ADD COLUMN color TEXT;',
    'ALTER TABLE ledgers ADD COLUMN icon TEXT;',
    'ALTER TABLE ledgers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE ledgers ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE ledgers ADD COLUMN created_at TEXT;',
    'ALTER TABLE ledgers ADD COLUMN updated_at TEXT;',
    'ALTER TABLE ledgers ADD COLUMN deleted_at TEXT;',
  ],
  account_groups: [
    'ALTER TABLE account_groups ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE account_groups ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE account_groups ADD COLUMN deleted_at TEXT;',
    'ALTER TABLE account_groups ADD COLUMN created_at TEXT;',
    'ALTER TABLE account_groups ADD COLUMN updated_at TEXT;',
  ],
  accounts: [
    'ALTER TABLE accounts ADD COLUMN group_id TEXT;',
    "ALTER TABLE accounts ADD COLUMN account_type TEXT NOT NULL DEFAULT 'asset';",
    "ALTER TABLE accounts ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'cash';",
    'ALTER TABLE accounts ADD COLUMN allow_negative INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE accounts ADD COLUMN include_in_assets INTEGER NOT NULL DEFAULT 1;',
    'ALTER TABLE accounts ADD COLUMN include_in_group_statistics INTEGER NOT NULL DEFAULT 1;',
    'ALTER TABLE accounts ADD COLUMN opening_balance_minor INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE accounts ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'TWD';",
    'ALTER TABLE accounts ADD COLUMN icon TEXT;',
    'ALTER TABLE accounts ADD COLUMN credit_limit_minor INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE accounts ADD COLUMN repayment_reminder_day INTEGER;',
    'ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE accounts ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE accounts ADD COLUMN deleted_at TEXT;',
    'ALTER TABLE accounts ADD COLUMN created_at TEXT;',
    'ALTER TABLE accounts ADD COLUMN updated_at TEXT;',
  ],
  category_groups: [
    'ALTER TABLE category_groups ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE category_groups ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE category_groups ADD COLUMN deleted_at TEXT;',
    'ALTER TABLE category_groups ADD COLUMN created_at TEXT;',
    'ALTER TABLE category_groups ADD COLUMN updated_at TEXT;',
  ],
  categories: [
    'ALTER TABLE categories ADD COLUMN group_id TEXT;',
    "ALTER TABLE categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense';",
    'ALTER TABLE categories ADD COLUMN icon TEXT;',
    'ALTER TABLE categories ADD COLUMN is_budgetable INTEGER NOT NULL DEFAULT 1;',
    'ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE categories ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE categories ADD COLUMN deleted_at TEXT;',
    'ALTER TABLE categories ADD COLUMN created_at TEXT;',
    'ALTER TABLE categories ADD COLUMN updated_at TEXT;',
  ],
  transactions: [
    "ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'expense';",
    'ALTER TABLE transactions ADD COLUMN transfer_group_id TEXT;',
    'ALTER TABLE transactions ADD COLUMN account_id TEXT;',
    'ALTER TABLE transactions ADD COLUMN peer_account_id TEXT;',
    'ALTER TABLE transactions ADD COLUMN category_id TEXT;',
    'ALTER TABLE transactions ADD COLUMN amount_minor INTEGER;',
    'ALTER TABLE transactions ADD COLUMN occurred_at TEXT;',
    'ALTER TABLE transactions ADD COLUMN note TEXT;',
    'ALTER TABLE transactions ADD COLUMN location TEXT;',
    'ALTER TABLE transactions ADD COLUMN tags_json TEXT;',
    "ALTER TABLE transactions ADD COLUMN origin_type TEXT NOT NULL DEFAULT 'manual';",
    'ALTER TABLE transactions ADD COLUMN external_ref_id TEXT;',
    'ALTER TABLE transactions ADD COLUMN idempotency_key TEXT;',
    'ALTER TABLE transactions ADD COLUMN include_in_budget INTEGER NOT NULL DEFAULT 1;',
    'ALTER TABLE transactions ADD COLUMN include_in_analysis INTEGER NOT NULL DEFAULT 1;',
    'ALTER TABLE transactions ADD COLUMN deleted_at TEXT;',
    'ALTER TABLE transactions ADD COLUMN created_at TEXT;',
    'ALTER TABLE transactions ADD COLUMN updated_at TEXT;',
  ],
  transaction_attachments: [
    'ALTER TABLE transaction_attachments ADD COLUMN file_uri TEXT;',
    'ALTER TABLE transaction_attachments ADD COLUMN mime_type TEXT;',
    'ALTER TABLE transaction_attachments ADD COLUMN file_size INTEGER;',
    'ALTER TABLE transaction_attachments ADD COLUMN checksum TEXT;',
    'ALTER TABLE transaction_attachments ADD COLUMN created_at TEXT;',
  ],
  counterparties: [
    'ALTER TABLE counterparties ADD COLUMN contact_json TEXT;',
    'ALTER TABLE counterparties ADD COLUMN note TEXT;',
    'ALTER TABLE counterparties ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE counterparties ADD COLUMN created_at TEXT;',
    'ALTER TABLE counterparties ADD COLUMN updated_at TEXT;',
  ],
  loans: [
    'ALTER TABLE loans ADD COLUMN counterparty_id TEXT;',
    "ALTER TABLE loans ADD COLUMN direction TEXT NOT NULL DEFAULT 'lend';",
    'ALTER TABLE loans ADD COLUMN principal_minor INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE loans ADD COLUMN interest_rule_json TEXT;',
    'ALTER TABLE loans ADD COLUMN start_date TEXT;',
    'ALTER TABLE loans ADD COLUMN due_date TEXT;',
    "ALTER TABLE loans ADD COLUMN status TEXT NOT NULL DEFAULT 'active';",
    'ALTER TABLE loans ADD COLUMN settled_at TEXT;',
    'ALTER TABLE loans ADD COLUMN note TEXT;',
    'ALTER TABLE loans ADD COLUMN created_at TEXT;',
    'ALTER TABLE loans ADD COLUMN updated_at TEXT;',
    'ALTER TABLE loans ADD COLUMN deleted_at TEXT;',
  ],
  loan_payments: [
    'ALTER TABLE loan_payments ADD COLUMN loan_id TEXT;',
    'ALTER TABLE loan_payments ADD COLUMN account_id TEXT;',
    'ALTER TABLE loan_payments ADD COLUMN paid_at TEXT;',
    'ALTER TABLE loan_payments ADD COLUMN amount_minor INTEGER;',
    'ALTER TABLE loan_payments ADD COLUMN principal_component_minor INTEGER;',
    'ALTER TABLE loan_payments ADD COLUMN interest_component_minor INTEGER;',
    'ALTER TABLE loan_payments ADD COLUMN generated_tx_id TEXT;',
    'ALTER TABLE loan_payments ADD COLUMN generated_interest_tx_id TEXT;',
    'ALTER TABLE loan_payments ADD COLUMN note TEXT;',
    'ALTER TABLE loan_payments ADD COLUMN created_at TEXT;',
    'ALTER TABLE loan_payments ADD COLUMN updated_at TEXT;',
  ],
  reimbursements: [
    'ALTER TABLE reimbursements ADD COLUMN title TEXT;',
    'ALTER TABLE reimbursements ADD COLUMN counterparty_id TEXT;',
    "ALTER TABLE reimbursements ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';",
    'ALTER TABLE reimbursements ADD COLUMN submitted_at TEXT;',
    'ALTER TABLE reimbursements ADD COLUMN approved_at TEXT;',
    'ALTER TABLE reimbursements ADD COLUMN paid_at TEXT;',
    'ALTER TABLE reimbursements ADD COLUMN paid_tx_id TEXT;',
    'ALTER TABLE reimbursements ADD COLUMN total_minor INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE reimbursements ADD COLUMN note TEXT;',
    'ALTER TABLE reimbursements ADD COLUMN idempotency_key TEXT;',
    'ALTER TABLE reimbursements ADD COLUMN created_at TEXT;',
    'ALTER TABLE reimbursements ADD COLUMN updated_at TEXT;',
    'ALTER TABLE reimbursements ADD COLUMN deleted_at TEXT;',
  ],
  reimbursement_items: [
    "ALTER TABLE reimbursement_items ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual';",
    "ALTER TABLE reimbursement_items ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'expense';",
    'ALTER TABLE reimbursement_items ADD COLUMN transaction_id TEXT;',
    'ALTER TABLE reimbursement_items ADD COLUMN category_id TEXT;',
    'ALTER TABLE reimbursement_items ADD COLUMN account_id TEXT;',
    'ALTER TABLE reimbursement_items ADD COLUMN description TEXT;',
    'ALTER TABLE reimbursement_items ADD COLUMN amount_minor INTEGER;',
    'ALTER TABLE reimbursement_items ADD COLUMN occurred_at TEXT;',
    'ALTER TABLE reimbursement_items ADD COLUMN attachment_uri TEXT;',
    'ALTER TABLE reimbursement_items ADD COLUMN created_at TEXT;',
    'ALTER TABLE reimbursement_items ADD COLUMN updated_at TEXT;',
  ],
  reimbursement_advances: [
    'ALTER TABLE reimbursement_advances ADD COLUMN category_id TEXT;',
  ],
  budgets: [
    'ALTER TABLE budgets ADD COLUMN name TEXT;',
    'ALTER TABLE budgets ADD COLUMN include_transfers INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE budgets ADD COLUMN include_loan_repayments INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE budgets ADD COLUMN include_reimbursed_expenses INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE budgets ADD COLUMN budget_save_total_enabled INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE budgets ADD COLUMN budget_save_total_target_account_id TEXT;',
    'ALTER TABLE budgets ADD COLUMN budget_save_total_source_account_id TEXT;',
    'ALTER TABLE budgets ADD COLUMN created_at TEXT;',
    'ALTER TABLE budgets ADD COLUMN updated_at TEXT;',
    'ALTER TABLE budgets ADD COLUMN deleted_at TEXT;',
  ],
  budget_items: [
    "ALTER TABLE budget_items ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'category';",
    'ALTER TABLE budget_items ADD COLUMN category_id TEXT;',
    'ALTER TABLE budget_items ADD COLUMN category_group_id TEXT;',
    'ALTER TABLE budget_items ADD COLUMN amount_minor INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE budget_items ADD COLUMN amount_mode TEXT NOT NULL DEFAULT 'fixed';",
    "ALTER TABLE budget_items ADD COLUMN day_rule_unit TEXT NOT NULL DEFAULT 'none';",
    "ALTER TABLE budget_items ADD COLUMN day_rule_values_json TEXT NOT NULL DEFAULT '[]';",
    'ALTER TABLE budget_items ADD COLUMN budget_save_enabled INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE budget_items ADD COLUMN budget_save_target_account_id TEXT;',
    'ALTER TABLE budget_items ADD COLUMN budget_save_source_account_id TEXT;',
    'ALTER TABLE budget_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE budget_items ADD COLUMN created_at TEXT;',
    'ALTER TABLE budget_items ADD COLUMN updated_at TEXT;',
  ],
  savings_jars: [
    'ALTER TABLE savings_jars ADD COLUMN auto_save_source_account_id TEXT;',
    'ALTER TABLE savings_jars ADD COLUMN auto_save_amount_minor INTEGER;',
    'ALTER TABLE savings_jars ADD COLUMN auto_save_interval_value INTEGER;',
    'ALTER TABLE savings_jars ADD COLUMN auto_save_interval_unit TEXT;',
    'ALTER TABLE savings_jars ADD COLUMN auto_save_start_date TEXT;',
    'ALTER TABLE savings_jars ADD COLUMN auto_save_charge_day INTEGER;',
    'ALTER TABLE savings_jars ADD COLUMN auto_save_paused INTEGER NOT NULL DEFAULT 0;',
  ],
  app_settings: [
    'ALTER TABLE app_settings ADD COLUMN value_json TEXT;',
    'ALTER TABLE app_settings ADD COLUMN updated_at TEXT;',
  ],
  deleted_log: [
    'ALTER TABLE deleted_log ADD COLUMN payload_json TEXT;',
    'ALTER TABLE deleted_log ADD COLUMN deleted_at TEXT;',
  ],
}

async function tableExists(db, tableName) {
  const result = await db.query(
    `SELECT 1 AS ok
     FROM sqlite_master
     WHERE type = 'table'
       AND name = ?
     LIMIT 1;`,
    [tableName],
  )
  return Boolean(result?.values?.length)
}

async function patchLegacyTableColumns(db, tableName, alterSqlList) {
  if (!(await tableExists(db, tableName))) return

  for (const sql of alterSqlList) {
    try {
      await db.execute(sql)
    } catch (error) {
      if (!isIgnorableMigrationError(error)) {
        throw error
      }
    }
  }
}

async function patchLegacySchema(db) {
  for (const [tableName, sqlList] of Object.entries(LEGACY_COLUMN_PATCHES)) {
    await patchLegacyTableColumns(db, tableName, sqlList)
  }

  const nowExpr = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

  // Best-effort backfill for legacy rows after adding nullable columns.
  if (await tableExists(db, 'transactions')) {
    await db.execute(
      `UPDATE transactions
       SET created_at = COALESCE(created_at, ${nowExpr}),
           updated_at = COALESCE(updated_at, created_at, ${nowExpr});`,
    )
    await db.execute(
      `UPDATE transactions
       SET occurred_at = COALESCE(occurred_at, created_at, updated_at, ${nowExpr}),
           amount_minor = COALESCE(amount_minor, 0),
           origin_type = COALESCE(origin_type, 'manual'),
           include_in_budget = COALESCE(include_in_budget, 1),
           include_in_analysis = COALESCE(include_in_analysis, 1);`,
    )
    await db.execute(
      `UPDATE transactions
       SET include_in_budget = 0,
           include_in_analysis = 0
       WHERE origin_type = 'reimbursement';`,
    )
  }

  if (await tableExists(db, 'budgets')) {
    await db.execute(
      `UPDATE budgets
       SET created_at = COALESCE(created_at, ${nowExpr}),
           updated_at = COALESCE(updated_at, created_at, ${nowExpr}),
           include_transfers = COALESCE(include_transfers, 0),
           include_loan_repayments = COALESCE(include_loan_repayments, 0),
           include_reimbursed_expenses = COALESCE(include_reimbursed_expenses, 0),
           budget_save_total_enabled = COALESCE(budget_save_total_enabled, 0);`,
    )
  }

  if (await tableExists(db, 'budget_items')) {
    await db.execute(
      `UPDATE budget_items
       SET created_at = COALESCE(created_at, ${nowExpr}),
           updated_at = COALESCE(updated_at, created_at, ${nowExpr}),
           sort_order = COALESCE(sort_order, 0),
           amount_minor = COALESCE(amount_minor, 0),
           amount_mode = COALESCE(amount_mode, 'fixed'),
           day_rule_unit = COALESCE(day_rule_unit, 'none'),
           day_rule_values_json = COALESCE(day_rule_values_json, '[]'),
           budget_save_enabled = COALESCE(budget_save_enabled, 0);`,
    )
  }

  if (await tableExists(db, 'accounts')) {
    await db.execute(
      `UPDATE accounts
       SET created_at = COALESCE(created_at, ${nowExpr}),
           updated_at = COALESCE(updated_at, created_at, ${nowExpr}),
           sort_order = COALESCE(sort_order, 0),
           opening_balance_minor = COALESCE(opening_balance_minor, 0),
           account_type = COALESCE(account_type, 'asset'),
           allow_negative = COALESCE(allow_negative, 0),
           include_in_assets = COALESCE(include_in_assets, 1),
           include_in_group_statistics = COALESCE(include_in_group_statistics, 1),
           currency_code = COALESCE(currency_code, 'TWD'),
           is_archived = COALESCE(is_archived, 0);`,
    )
  }

  if (await tableExists(db, 'ledgers')) {
    await db.execute(
      `UPDATE ledgers
       SET created_at = COALESCE(created_at, ${nowExpr}),
           updated_at = COALESCE(updated_at, created_at, ${nowExpr}),
           sort_order = COALESCE(sort_order, 0),
           is_archived = COALESCE(is_archived, 0),
           currency_code = COALESCE(currency_code, 'TWD'),
           timezone = COALESCE(timezone, 'Asia/Taipei');`,
    )
  }

  if (await tableExists(db, 'categories')) {
    await db.execute(
      `UPDATE categories
       SET created_at = COALESCE(created_at, ${nowExpr}),
           updated_at = COALESCE(updated_at, created_at, ${nowExpr}),
           sort_order = COALESCE(sort_order, 0),
           kind = COALESCE(kind, 'expense'),
           is_budgetable = COALESCE(is_budgetable, 1),
           is_archived = COALESCE(is_archived, 0);`,
    )
  }

  if (await tableExists(db, 'app_settings')) {
    await db.execute(
      `UPDATE app_settings
       SET value_json = COALESCE(value_json, '{}'),
           updated_at = COALESCE(updated_at, ${nowExpr});`,
    )
  }

  if (await tableExists(db, 'savings_jars')) {
    await db.execute(
      `UPDATE savings_jars
       SET created_at = COALESCE(created_at, ${nowExpr}),
           updated_at = COALESCE(updated_at, created_at, ${nowExpr}),
           auto_save_paused = COALESCE(auto_save_paused, 0);`,
    )
  }
}

async function ensureSchemaMetaTable(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)
}

async function getSchemaMetaValue(db, key) {
  const result = await db.query(
    `SELECT value
     FROM schema_meta
     WHERE key = ?
     LIMIT 1;`,
    [key],
  )
  return String(result?.values?.[0]?.value ?? '')
}

async function setSchemaMetaValue(db, key, value) {
  await db.run(
    `INSERT INTO schema_meta (key, value, updated_at)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at;`,
    [key, String(value ?? '')],
  )
}

export async function runMigrations(db) {
  await ensureSchemaMetaTable(db)

  const hasPatchedLegacySchema = getSchemaMetaValue(db, LEGACY_SCHEMA_PATCH_META_KEY)
    .then((value) => value === '1')
    .catch(() => false)

  if (!(await hasPatchedLegacySchema)) {
    await patchLegacySchema(db)
    await setSchemaMetaValue(db, LEGACY_SCHEMA_PATCH_META_KEY, '1')
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)

  const result = await db.query('SELECT version FROM schema_migrations ORDER BY version ASC;')
  const appliedVersions = new Set((result?.values ?? []).map((row) => row.version))

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue

    await executeMigrationSql(db, migration.sql)
    await db.run(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?);',
      [migration.version, migration.name],
    )
  }
}
