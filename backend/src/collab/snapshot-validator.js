/**
 * ART-06 — Shared-ledger SnapshotValidator (Structural / Semantic / Integrity).
 * Used by validateSnapshot() before persisting client snapshots.
 */

export const SHARED_LEDGER_SNAPSHOT_TABLES = Object.freeze([
  'ledgers',
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
  'securities',
  'security_transactions',
  'credit_statements',
  'credit_repayments',
  'credit_repayment_allocations',
  'transaction_postings',
  'bank_connections',
  'bank_accounts',
  'bank_transactions',
  'bank_sync_rules',
  'app_settings',
  'deleted_log',
])

const ALLOWED_TABLE_SET = new Set(SHARED_LEDGER_SNAPSHOT_TABLES)

/** Soft upper bound to reject pathological payloads (bytes of JSON). */
export const SNAPSHOT_MAX_JSON_BYTES = 20 * 1024 * 1024
export const SNAPSHOT_MAX_ROWS_PER_TABLE = 200_000

export class SnapshotValidationError extends Error {
  /**
   * @param {string} message
   * @param {{ layer?: string, code?: string }} [options]
   */
  constructor(message, options = {}) {
    super(message)
    this.name = 'SnapshotValidationError'
    this.layer = String(options.layer ?? 'structural')
    this.code = String(options.code ?? 'snapshot_invalid')
  }
}

function fail(layer, code, message) {
  throw new SnapshotValidationError(message, { layer, code })
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function rowId(row) {
  if (!row || typeof row !== 'object') return ''
  if (row.id != null && String(row.id).trim()) return String(row.id).trim()
  if (row.key != null && String(row.key).trim()) return String(row.key).trim()
  return ''
}

function assertIntegerMinor(value, path) {
  if (value === null || value === undefined || value === '') return
  if (typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)) return
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return
  fail('semantic', 'amount_minor_invalid', `${path} 必須是整數 amount_minor`)
}

function assertTimestampLoose(value, path) {
  if (value === null || value === undefined || value === '') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  const text = String(value).trim()
  if (!text) return
  if (/^-?\d+(\.\d+)?$/.test(text)) return
  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) {
    fail('semantic', 'timestamp_invalid', `${path} 時間格式無效`)
  }
}

/**
 * @param {unknown} snapshot
 * @returns {{ ledgerId: string, ledgerName: string, schemaVersion: number | null }}
 */
export function validateSharedLedgerSnapshot(snapshot) {
  // ── Structural ──────────────────────────────────────────────
  const root = asObject(snapshot)
  if (!root) {
    fail('structural', 'snapshot_not_object', '共同帳本快照格式錯誤')
  }

  let encoded = ''
  try {
    encoded = JSON.stringify(root)
  } catch {
    fail('structural', 'snapshot_not_json', '共同帳本快照無法序列化')
  }
  if (Buffer.byteLength(encoded, 'utf8') > SNAPSHOT_MAX_JSON_BYTES) {
    fail('structural', 'snapshot_too_large', '共同帳本快照超過大小上限')
  }

  const ledgerId = String(root.ledger_id ?? '').trim()
  if (!ledgerId) {
    fail('structural', 'ledger_id_required', '共同帳本快照缺少 ledger_id')
  }

  const schemaVersionRaw = root.schema_version
  let schemaVersion = null
  if (schemaVersionRaw !== null && schemaVersionRaw !== undefined && schemaVersionRaw !== '') {
    const n = Number(schemaVersionRaw)
    if (!Number.isFinite(n) || n < 0) {
      fail('structural', 'schema_version_invalid', '共同帳本快照 schema_version 無效')
    }
    schemaVersion = n
  }

  const tables = asObject(root.tables)
  if (!tables) {
    fail('structural', 'tables_required', '共同帳本快照缺少 tables')
  }

  for (const [tableName, rows] of Object.entries(tables)) {
    if (!ALLOWED_TABLE_SET.has(tableName)) {
      fail('structural', 'unsupported_table', `共同帳本快照含不支援的資料表: ${tableName}`)
    }
    if (!Array.isArray(rows)) {
      fail('structural', 'table_not_array', `共同帳本快照 tables.${tableName} 必須是陣列`)
    }
    if (rows.length > SNAPSHOT_MAX_ROWS_PER_TABLE) {
      fail('structural', 'table_too_large', `共同帳本快照 tables.${tableName} 列數超過上限`)
    }
  }

  const ledgers = Array.isArray(tables.ledgers) ? tables.ledgers : []
  if (!ledgers.length) {
    fail('structural', 'ledgers_required', '共同帳本快照缺少 ledger 資料')
  }

  // ── Semantic ────────────────────────────────────────────────
  const ledgerRow =
    ledgers.find((row) => String(row?.id ?? '').trim() === ledgerId) ?? null
  if (!ledgerRow) {
    fail('semantic', 'ledger_row_mismatch', '共同帳本快照 ledgers 必須包含 ledger_id 對應列')
  }

  for (const [tableName, rows] of Object.entries(tables)) {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        fail('semantic', 'row_not_object', `共同帳本快照 tables.${tableName}[${i}] 必須是物件`)
      }

      if (Object.prototype.hasOwnProperty.call(row, 'ledger_id')) {
        const rowLedgerId = String(row.ledger_id ?? '').trim()
        if (rowLedgerId && rowLedgerId !== ledgerId) {
          fail(
            'semantic',
            'ledger_id_mixed',
            `共同帳本快照 tables.${tableName}[${i}] ledger_id 與快照不一致`,
          )
        }
      }

      if (Object.prototype.hasOwnProperty.call(row, 'amount_minor')) {
        assertIntegerMinor(row.amount_minor, `tables.${tableName}[${i}].amount_minor`)
      }
      if (Object.prototype.hasOwnProperty.call(row, 'opening_balance_minor')) {
        assertIntegerMinor(row.opening_balance_minor, `tables.${tableName}[${i}].opening_balance_minor`)
      }

      assertTimestampLoose(row.created_at, `tables.${tableName}[${i}].created_at`)
      assertTimestampLoose(row.updated_at, `tables.${tableName}[${i}].updated_at`)
      assertTimestampLoose(row.occurred_at, `tables.${tableName}[${i}].occurred_at`)
      assertTimestampLoose(row.exported_at, `tables.${tableName}[${i}].exported_at`)
    }
  }

  assertTimestampLoose(root.exported_at, 'exported_at')

  // ── Integrity ───────────────────────────────────────────────
  for (const [tableName, rows] of Object.entries(tables)) {
    const seen = new Set()
    for (let i = 0; i < rows.length; i += 1) {
      const id = rowId(rows[i])
      if (!id) continue
      const key = `${tableName}::${id}`
      if (seen.has(key)) {
        fail('integrity', 'duplicate_id', `共同帳本快照 tables.${tableName} 有重複 id: ${id}`)
      }
      seen.add(key)
    }
  }

  const accountIds = new Set(
    (Array.isArray(tables.accounts) ? tables.accounts : [])
      .map((row) => String(row?.id ?? '').trim())
      .filter(Boolean),
  )
  const categoryIds = new Set(
    (Array.isArray(tables.categories) ? tables.categories : [])
      .map((row) => String(row?.id ?? '').trim())
      .filter(Boolean),
  )

  if (Array.isArray(tables.transactions) && accountIds.size > 0) {
    for (let i = 0; i < tables.transactions.length; i += 1) {
      const tx = tables.transactions[i]
      const accountId = String(tx?.account_id ?? '').trim()
      if (accountId && !accountIds.has(accountId)) {
        fail(
          'integrity',
          'tx_account_fk',
          `共同帳本快照 transactions[${i}] 參照不存在的 account_id`,
        )
      }
      const categoryId = String(tx?.category_id ?? '').trim()
      if (categoryId && categoryIds.size > 0 && !categoryIds.has(categoryId)) {
        fail(
          'integrity',
          'tx_category_fk',
          `共同帳本快照 transactions[${i}] 參照不存在的 category_id`,
        )
      }
    }
  }

  return {
    ledgerId,
    ledgerName: String(ledgerRow?.name ?? '').trim() || '共同帳本',
    schemaVersion,
  }
}
