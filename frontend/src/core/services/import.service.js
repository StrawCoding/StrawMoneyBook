import { withTransaction, run } from '@/core/db/sqlite'
import { createLedger, listLedgers } from '@/core/repositories/ledger.repo'
import { createId } from '@/core/utils/id'
import { rethrowAsForeignKeyError } from '@/core/utils/sqlite-fk'
import { addTransaction } from '@/core/repositories/transaction.repo'
import { assertCanCreateLedger } from '@/core/services/membership.service'
import { repairLedgerData, scanLedgerIntegrity } from '@/core/services/repair.service'
import { createAccountGroup, createAccount, listAccounts, listAccountGroups } from '@/core/repositories/account.repo'
import {
  createCategoryGroup,
  createCategory,
  listCategoryGroups,
  listCategories,
} from '@/core/repositories/category.repo'
import { normalizeSharedLedgerSnapshot } from '@/ui/services/shared-ledger/snapshot-merge'
import { LEDGER_REPAIR_REASON } from '@/core/services/data-wipe-guard.service'
import {
  assertBackupJsonStructureImportable,
  resolveSourceLedger,
} from '@/core/services/backup-json-import-gate.service'

const TABLE_IMPORT_ORDER = [
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
]

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('JSON 格式錯誤')
  }
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeLedgerName(value, fallback = '') {
  const text = normalizeText(value)
  if (text) return text
  return normalizeText(fallback)
}

function parseBooleanLike(value, fallback = false) {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return fallback
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off'].includes(text)) return false
  return fallback
}

function normalizeFaIcon(value) {
  const source = String(value ?? '').trim()
  if (!source) return null

  const tokens = source.split(/\s+/).filter(Boolean)
  let style = 'fa-solid'
  let iconName = ''

  for (const token of tokens) {
    if (token === 'fas' || token === 'fa-solid') {
      style = 'fa-solid'
      continue
    }
    if (token === 'far' || token === 'fa-regular') {
      style = 'fa-regular'
      continue
    }
    if (token === 'fab' || token === 'fa-brands') {
      style = 'fa-brands'
      continue
    }
    if (token.startsWith('fa-')) {
      iconName = token
      continue
    }
    if (/^[a-z0-9-]+$/i.test(token)) {
      iconName = `fa-${token.toLowerCase()}`
    }
  }

  if (!iconName || ['fa-solid', 'fa-regular', 'fa-brands'].includes(iconName)) {
    return null
  }

  return `${style} ${iconName}`
}

function normalizedRows(tablePayload, tableName) {
  const rows = tablePayload?.[tableName]
  if (!Array.isArray(rows)) return []
  return rows
}

function resolveImportedLedgerName(sourceLedgerName, options = {}) {
  const explicitName = normalizeLedgerName(options.ledgerName)
  if (explicitName) return explicitName

  const suffix = normalizeText(options.ledgerNameSuffix ?? '（匯入）')
  if (!suffix) return sourceLedgerName
  return `${sourceLedgerName}${suffix}`
}

function sumNumericValues(source) {
  if (!source || typeof source !== 'object') return 0
  return Object.values(source).reduce((total, value) => total + Number(value ?? 0), 0)
}

function toSafeSqlIdentifier(identifier, tableName) {
  const value = String(identifier ?? '').trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`表 ${tableName} 欄位名稱不合法：${value}`)
  }
  return value
}

function objectToInsertSql(tableName, row) {
  const keys = Object.keys(row).map((key) => toSafeSqlIdentifier(key, tableName))
  if (!keys.length) {
    throw new Error(`表 ${tableName} 缺少欄位資料`)
  }

  const placeholders = keys.map(() => '?').join(', ')
  const sql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders});`
  const values = keys.map((key) => row[key])
  return { sql, values }
}

export async function importLedgerJsonAsNewLedger(jsonText, options = {}) {
  const payload = parseJson(jsonText)
  return importLedgerPayloadAsNewLedger(payload, options)
}

async function importLedgerPayloadAsNewLedger(payload, options = {}) {
  // Prune orphan / invalid FK refs before INSERT so SQLite never throws 1811 mid-import.
  // Shared-ledger sync already canonicalize; backup / Google Drive / raw JSON paths need this too.
  const sanitizedPayload = normalizeSharedLedgerSnapshot(payload)
  const { sourceLedgerId, ledgerRow } = resolveSourceLedger(sanitizedPayload)
  const sourceLedgerName = normalizeLedgerName(ledgerRow.name, '匯入帳本')
  const importedLedgerName = resolveImportedLedgerName(sourceLedgerName, options)

  const existingLedgers = await listLedgers()
  assertCanCreateLedger(existingLedgers.length)

  try {
    return await withTransaction(async () => {
      const importedLedger = await createLedger({
        id: options.keepLedgerId ? sourceLedgerId : createId('ledger_import'),
        name: importedLedgerName,
        currencyCode: ledgerRow.currency_code ?? 'TWD',
        timezone: ledgerRow.timezone ?? 'Asia/Taipei',
        color: ledgerRow.color ?? null,
        icon: ledgerRow.icon ?? null,
      })

      let insertedRows = 0

      for (const tableName of TABLE_IMPORT_ORDER) {
        const rows = normalizedRows(sanitizedPayload.tables, tableName)
        for (const sourceRow of rows) {
          const row = { ...sourceRow, ledger_id: importedLedger.id }
          if (tableName === 'deleted_log') {
            delete row.id
          }

          const { sql, values } = objectToInsertSql(tableName, row)
          await run(sql, values)
          insertedRows += 1
        }
      }

      // smb297: integrity repair is opt-in only. Sync / shared-ledger replace must NOT
      // auto-pass confirmed:true — that silently rewrote account/category/transfer semantics.
      // Callers that already completed a user wipe/restore countdown may set
      // runIntegrityRepair:true with an explicit repair reason.
      let integrityCheck = null
      if (options.runIntegrityRepair === true) {
        const before = await scanLedgerIntegrity(importedLedger.id)
        const beforeIssueCount = sumNumericValues(before)
        let fixed = {}
        let after = before

        if (beforeIssueCount > 0) {
          const repairResult = await repairLedgerData(importedLedger.id, {
            confirmed: true,
            reason: options.integrityRepairReason || LEDGER_REPAIR_REASON.USER_IMPORT_JSON,
            source: options.integrityRepairSource || 'import.service',
          })
          fixed = repairResult?.fixed ?? {}
          after = repairResult?.after ?? before
        }

        integrityCheck = {
          before,
          after,
          fixed,
          beforeIssueCount,
          afterIssueCount: sumNumericValues(after),
          fixedCount: sumNumericValues(fixed),
        }
      }

      return {
        ledgerId: importedLedger.id,
        ledgerName: importedLedger.name,
        insertedRows,
        schemaVersion: sanitizedPayload.schema_version ?? null,
        integrityCheck,
      }
    })
  } catch (error) {
    rethrowAsForeignKeyError(error, {
      i18nKey: 'sqlite.error.foreign_key_constraint',
    })
  }
}

export async function importBackupJsonAsNewLedgers(jsonText, options = {}) {
  // Structural gate shared with Drive restore wipe path (smb299): reject before DB writes.
  assertBackupJsonStructureImportable(jsonText)

  const payload = parseJson(jsonText)
  const allLedgersPayload = Array.isArray(payload?.ledgers) ? payload.ledgers : null

  if (!allLedgersPayload || payload?.backup_scope !== 'all_ledgers') {
    const imported = await importLedgerPayloadAsNewLedger(payload, options)
    return {
      mode: 'single',
      importedLedgers: [imported],
      firstLedgerId: imported.ledgerId,
      firstLedgerName: imported.ledgerName,
      totalInsertedRows: Number(imported.insertedRows ?? 0),
      schemaVersion: imported.schemaVersion ?? null,
      integrityCheck: imported.integrityCheck ?? null,
    }
  }

  const importedLedgers = []
  let totalInsertedRows = 0

  for (const ledgerPayload of allLedgersPayload) {
    const imported = await importLedgerPayloadAsNewLedger(ledgerPayload, options)
    importedLedgers.push(imported)
    totalInsertedRows += Number(imported.insertedRows ?? 0)
  }

  return {
    mode: 'all_ledgers',
    importedLedgers,
    firstLedgerId: importedLedgers[0]?.ledgerId ?? '',
    firstLedgerName: importedLedgers[0]?.ledgerName ?? '',
    totalInsertedRows,
    schemaVersion: payload.schema_version ?? null,
    integrityCheck: null,
  }
}

export { assertBackupJsonStructureImportable, resolveSourceLedger }

function parseCsvLine(line) {
  const values = []
  let current = ''
  let inQuote = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]

    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuote = !inQuote
      }
      continue
    }

    if (ch === ',' && !inQuote) {
      values.push(current)
      current = ''
      continue
    }

    current += ch
  }

  values.push(current)
  return values
}

function parseCsv(text) {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0)

  if (lines.length < 2) {
    throw new Error('CSV 至少需要標題與一筆資料')
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim())
  const rows = []

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    const row = {}
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? ''
    })
    rows.push(row)
  }

  return { headers, rows }
}

async function importTransactionsCsv(ledgerId, rows) {
  const accountRows = await listAccounts(ledgerId, { includeArchived: true })
  const categoryRows = await listCategories(ledgerId, { includeArchived: true })
  const accountIds = new Set(accountRows.map((item) => item.id))
  const categoryIds = new Set(categoryRows.map((item) => item.id))

  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    const type = row.type?.trim()
    const amountMinor = Math.round(Number(row.amount_minor))
    const accountId = row.account_id?.trim()
    const categoryId = row.category_id?.trim() || null

    if (!['expense', 'income', 'adjustment', 'transfer'].includes(type)) {
      skipped += 1
      continue
    }

    if (!Number.isFinite(amountMinor) || amountMinor === 0 || !accountIds.has(accountId)) {
      skipped += 1
      continue
    }

    if (categoryId && !categoryIds.has(categoryId)) {
      skipped += 1
      continue
    }

    await addTransaction(ledgerId, {
      type,
      transferGroupId: row.transfer_group_id?.trim() || null,
      accountId,
      peerAccountId: row.peer_account_id?.trim() || null,
      categoryId,
      amountMinor,
      occurredAt: row.occurred_at?.trim() || new Date().toISOString(),
      note: row.note?.trim() || null,
      location: row.location?.trim() || null,
      tagsJson: row.tags_json?.trim() || null,
      originType: row.origin_type?.trim() || 'import',
      externalRefId: row.external_ref_id?.trim() || null,
      idempotencyKey: row.idempotency_key?.trim() || null,
    })

    inserted += 1
  }

  return { inserted, skipped }
}

async function importAccountsCsv(ledgerId, rows) {
  const existingGroups = await listAccountGroups(ledgerId)
  const groupMap = new Map(existingGroups.map((item) => [item.name.toLowerCase(), item]))

  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    const groupName = row.group_name?.trim()
    const accountName = row.name?.trim() || row.account_name?.trim()

    if (!groupName || !accountName) {
      skipped += 1
      continue
    }

    let group = groupMap.get(groupName.toLowerCase())
    if (!group) {
      group = await createAccountGroup(ledgerId, {
        name: groupName,
        type: row.group_type?.trim() || 'other',
        sortOrder: groupMap.size,
      })
      groupMap.set(groupName.toLowerCase(), group)
    }

    await createAccount(ledgerId, {
      groupId: group.id,
      name: accountName,
      accountType: row.account_type?.trim() || 'asset',
      accountKind: row.account_kind?.trim() || 'cash',
      allowNegative: parseBooleanLike(row.allow_negative, false),
      openingBalanceMinor: Math.round(Number(row.opening_balance_minor ?? 0)),
      currencyCode: row.currency_code?.trim() || 'TWD',
      icon: normalizeFaIcon(row.icon),
      creditLimitMinor: Math.round(Number(row.credit_limit_minor ?? 0)),
      repaymentReminderDay: row.repayment_reminder_day?.trim() || null,
      includeInAssets: parseBooleanLike(row.include_in_assets ?? row.includeInAssets, true),
      includeInGroupStatistics: parseBooleanLike(
        row.include_in_group_statistics ?? row.includeInGroupStatistics,
        true,
      ),
      sortOrder: inserted,
    })

    inserted += 1
  }

  return { inserted, skipped }
}

async function importCategoriesCsv(ledgerId, rows) {
  const existingGroups = await listCategoryGroups(ledgerId)
  const groupMap = new Map(existingGroups.map((item) => [item.name.toLowerCase(), item]))

  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    const groupName = row.group_name?.trim() || row.category_group_name?.trim()
    const categoryName = row.name?.trim() || row.category_name?.trim()

    if (!groupName || !categoryName) {
      skipped += 1
      continue
    }

    let group = groupMap.get(groupName.toLowerCase())
    if (!group) {
      group = await createCategoryGroup(ledgerId, {
        name: groupName,
        kind: row.group_kind?.trim() || 'expense',
        sortOrder: groupMap.size,
      })
      groupMap.set(groupName.toLowerCase(), group)
    }

    await createCategory(ledgerId, {
      groupId: group.id,
      name: categoryName,
      kind: row.kind?.trim() || group.kind || 'expense',
      icon: normalizeFaIcon(row.icon),
      isBudgetable: ['0', 'false', 'no'].includes((row.is_budgetable ?? '').toLowerCase()) ? 0 : 1,
      sortOrder: inserted,
    })

    inserted += 1
  }

  return { inserted, skipped }
}

export async function importLedgerCsv(ledgerId, csvText, type) {
  const { rows } = parseCsv(csvText)

  return withTransaction(async () => {
    if (type === 'transactions') {
      return importTransactionsCsv(ledgerId, rows)
    }

    if (type === 'accounts') {
      return importAccountsCsv(ledgerId, rows)
    }

    if (type === 'categories') {
      return importCategoriesCsv(ledgerId, rows)
    }

    throw new Error('不支援的 CSV 匯入類型')
  })
}

export async function previewCsvType(csvText) {
  const { headers, rows } = parseCsv(csvText)

  const headerSet = new Set(headers.map((item) => item.toLowerCase()))
  let suggestedType = 'transactions'

  if (headerSet.has('group_name') && (headerSet.has('account_name') || headerSet.has('opening_balance_minor'))) {
    suggestedType = 'accounts'
  } else if (headerSet.has('group_name') && (headerSet.has('category_name') || headerSet.has('kind'))) {
    suggestedType = 'categories'
  } else if (headerSet.has('type') && headerSet.has('amount_minor') && headerSet.has('account_id')) {
    suggestedType = 'transactions'
  }

  return {
    headers,
    rowCount: rows.length,
    suggestedType,
  }
}
