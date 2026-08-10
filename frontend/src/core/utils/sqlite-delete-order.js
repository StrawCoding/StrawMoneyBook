/**
 * Child-first delete order for ledger-scoped tables under PRAGMA foreign_keys=ON.
 * Keep wipe / purge / legacy fallbacks aligned — never disable foreign_keys to force deletes.
 */
export const LEDGER_CHILD_DELETE_ORDER = Object.freeze([
  'transaction_attachments',
  'loan_payments',
  'reimbursement_advance_usages',
  'reimbursement_advances',
  'reimbursement_items',
  'reimbursements',
  'budget_save_settlements',
  'budget_items',
  'budget_containers',
  'budgets',
  'loans',
  'bank_transactions',
  'bank_sync_rules',
  'bank_accounts',
  'bank_connections',
  'transactions',
  'savings_jars',
  'accounts',
  'account_groups',
  'categories',
  'category_groups',
  'counterparties',
  'app_settings',
  'deleted_log',
])

/** Full DB wipe order (children first, then ledgers). */
export const DATABASE_WIPE_DELETE_ORDER = Object.freeze([
  ...LEDGER_CHILD_DELETE_ORDER.filter((table) => table !== 'deleted_log'),
  'deleted_log',
  'ledgers',
])
