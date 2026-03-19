const SNAPSHOT_TABLE_ORDER = [
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
  'budgets',
  'budget_items',
  'savings_jars',
  'bank_connections',
  'bank_accounts',
  'bank_transactions',
  'bank_sync_rules',
  'app_settings',
  'deleted_log',
]

const ROW_KEY_FIELDS = Object.freeze({
  app_settings: 'key',
  bank_sync_rules: 'connection_id',
  savings_jars: 'account_id',
})

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function toEpochMs(value) {
  if (value === null || value === undefined || value === '') return Number.NaN

  if (value instanceof Date) {
    const dateMs = value.getTime()
    return Number.isFinite(dateMs) ? dateMs : Number.NaN
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return Number.NaN
    const absValue = Math.abs(value)
    if (absValue < 1e11) {
      return Math.round(value * 1000)
    }
    return Math.round(value)
  }

  const text = normalizeText(value)
  if (!text) return Number.NaN

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return toEpochMs(Number(text))
  }

  const parsedMs = Date.parse(text)
  return Number.isFinite(parsedMs) ? parsedMs : Number.NaN
}

function toIso(value) {
  const epochMs = toEpochMs(value)
  if (!Number.isFinite(epochMs)) return ''
  return new Date(epochMs).toISOString()
}

function listTableRows(snapshot, tableName) {
  const rows = snapshot?.tables?.[tableName]
  if (!Array.isArray(rows)) return []
  return rows.map((row) => cloneJson(row))
}

function getAllTableNames(leftSnapshot, rightSnapshot) {
  const known = SNAPSHOT_TABLE_ORDER.filter((tableName) => tableName !== 'deleted_log')
  const extras = new Set()

  for (const snapshot of [leftSnapshot, rightSnapshot]) {
    const tableEntries = snapshot?.tables && typeof snapshot.tables === 'object'
      ? Object.keys(snapshot.tables)
      : []
    for (const tableName of tableEntries) {
      const normalizedTableName = normalizeText(tableName)
      if (!normalizedTableName || normalizedTableName === 'deleted_log') continue
      if (!known.includes(normalizedTableName)) {
        extras.add(normalizedTableName)
      }
    }
  }

  return [...known, ...Array.from(extras).sort((left, right) => left.localeCompare(right))]
}

function getRowKey(tableName, row, index = 0) {
  const keyField = ROW_KEY_FIELDS[tableName]
  if (keyField) {
    const keyValue = normalizeText(row?.[keyField])
    if (keyValue) return keyValue
  }

  const idValue = normalizeText(row?.id)
  if (idValue) return idValue

  return `__row_${tableName}_${index}_${JSON.stringify(row ?? {})}`
}

function getRowUpdatedAt(row) {
  const candidates = [
    row?.deleted_at,
    row?.updated_at,
    row?.occurred_at,
    row?.posted_at,
    row?.paid_at,
    row?.received_at,
    row?.submitted_at,
    row?.approved_at,
    row?.settled_at,
    row?.last_seen_at,
    row?.first_seen_at,
    row?.last_sync_at,
    row?.created_at,
  ]

  for (const candidate of candidates) {
    const epochMs = toEpochMs(candidate)
    if (Number.isFinite(epochMs)) {
      return epochMs
    }
  }

  return 0
}

function sortRows(tableName, rows) {
  return [...rows].sort((left, right) => {
    const leftKey = getRowKey(tableName, left)
    const rightKey = getRowKey(tableName, right)
    const keyCompare = leftKey.localeCompare(rightKey)
    if (keyCompare !== 0) return keyCompare

    const timeCompare = getRowUpdatedAt(left) - getRowUpdatedAt(right)
    if (timeCompare !== 0) return timeCompare

    return JSON.stringify(left).localeCompare(JSON.stringify(right))
  })
}

function sortDeletedLogRows(rows) {
  return [...rows].sort((left, right) => {
    const leftTable = normalizeText(left?.table_name)
    const rightTable = normalizeText(right?.table_name)
    const tableCompare = leftTable.localeCompare(rightTable)
    if (tableCompare !== 0) return tableCompare

    const leftPk = normalizeText(left?.row_pk)
    const rightPk = normalizeText(right?.row_pk)
    const pkCompare = leftPk.localeCompare(rightPk)
    if (pkCompare !== 0) return pkCompare

    const timeCompare = getRowUpdatedAt(left) - getRowUpdatedAt(right)
    if (timeCompare !== 0) return timeCompare

    return JSON.stringify(left).localeCompare(JSON.stringify(right))
  })
}

function normalizeDeletedLogRow(row) {
  if (!row || typeof row !== 'object') return null

  const tableName = normalizeText(row.table_name)
  const rowPk = normalizeText(row.row_pk)
  if (!tableName || !rowPk) return null

  const deletedAt = toIso(row.deleted_at || row.updated_at || row.created_at) || new Date().toISOString()

  return {
    ...cloneJson(row),
    table_name: tableName,
    row_pk: rowPk,
    payload_json: String(row?.payload_json ?? '{}'),
    deleted_at: deletedAt,
  }
}

function buildTombstoneMap(rows = []) {
  const tombstoneMap = new Map()

  for (const row of rows) {
    const normalizedRow = normalizeDeletedLogRow(row)
    if (!normalizedRow) continue

    const mapKey = `${normalizedRow.table_name}::${normalizedRow.row_pk}`
    const deletedMs = toEpochMs(normalizedRow.deleted_at)
    const current = tombstoneMap.get(mapKey)
    const currentDeletedMs = toEpochMs(current?.deleted_at)

    if (!current || deletedMs >= currentDeletedMs) {
      tombstoneMap.set(mapKey, normalizedRow)
    }
  }

  return tombstoneMap
}

function pickPreferredRow(leftRow, rightRow, preferredSource = 'remote') {
  if (!leftRow) return rightRow ? cloneJson(rightRow) : null
  if (!rightRow) return cloneJson(leftRow)

  const leftUpdatedMs = getRowUpdatedAt(leftRow)
  const rightUpdatedMs = getRowUpdatedAt(rightRow)
  if (leftUpdatedMs !== rightUpdatedMs) {
    return cloneJson(leftUpdatedMs > rightUpdatedMs ? leftRow : rightRow)
  }

  if (preferredSource === 'local') {
    return cloneJson(leftRow)
  }
  return cloneJson(rightRow)
}

function canonicalizeSnapshot(snapshot) {
  const normalizedSnapshot = cloneJson(snapshot)
  if (!normalizedSnapshot || typeof normalizedSnapshot !== 'object') {
    return {
      schema_version: null,
      ledger_id: '',
      exported_at: '',
      tables: {},
    }
  }

  const tableNames = getAllTableNames(normalizedSnapshot, null)
  const tombstoneMap = buildTombstoneMap(listTableRows(normalizedSnapshot, 'deleted_log'))
  const tables = {}

  for (const tableName of tableNames) {
    const rowMap = new Map()
    for (const [index, row] of listTableRows(normalizedSnapshot, tableName).entries()) {
      const rowKey = getRowKey(tableName, row, index)
      const currentRow = rowMap.get(rowKey)
      rowMap.set(rowKey, pickPreferredRow(currentRow, row, 'remote'))
    }

    const mergedRows = []
    for (const [rowKey, row] of rowMap.entries()) {
      const tombstoneKey = `${tableName}::${rowKey}`
      const tombstone = tombstoneMap.get(tombstoneKey)
      const rowUpdatedMs = getRowUpdatedAt(row)
      const deletedMs = toEpochMs(tombstone?.deleted_at)

      if (tombstone && Number.isFinite(deletedMs) && deletedMs >= rowUpdatedMs) {
        continue
      }

      if (tombstone && rowUpdatedMs > deletedMs) {
        tombstoneMap.delete(tombstoneKey)
      }

      mergedRows.push(row)
    }

    tables[tableName] = sortRows(tableName, mergedRows)
  }

  tables.deleted_log = sortDeletedLogRows(Array.from(tombstoneMap.values()))

  return {
    schema_version: normalizedSnapshot.schema_version ?? null,
    ledger_id: normalizeText(normalizedSnapshot.ledger_id),
    exported_at: toIso(normalizedSnapshot.exported_at),
    tables,
  }
}

export function normalizeSharedLedgerSnapshot(snapshot) {
  return canonicalizeSnapshot(snapshot)
}

export function mergeSharedLedgerSnapshots(localSnapshot, remoteSnapshot, options = {}) {
  const normalizedLocalSnapshot = canonicalizeSnapshot(localSnapshot)
  const normalizedRemoteSnapshot = canonicalizeSnapshot(remoteSnapshot)
  const ledgerId = normalizeText(normalizedLocalSnapshot.ledger_id || normalizedRemoteSnapshot.ledger_id)

  if (
    normalizedLocalSnapshot.ledger_id
    && normalizedRemoteSnapshot.ledger_id
    && normalizedLocalSnapshot.ledger_id !== normalizedRemoteSnapshot.ledger_id
  ) {
    throw new Error('共同帳本快照 ledger_id 不一致，無法合併')
  }

  const preferredSource = options?.prefer === 'local' ? 'local' : 'remote'
  const tableNames = getAllTableNames(normalizedLocalSnapshot, normalizedRemoteSnapshot)
  const combinedTombstones = buildTombstoneMap([
    ...listTableRows(normalizedLocalSnapshot, 'deleted_log'),
    ...listTableRows(normalizedRemoteSnapshot, 'deleted_log'),
  ])
  const mergedTables = {}

  for (const tableName of tableNames) {
    const rowMap = new Map()

    for (const [index, row] of listTableRows(normalizedLocalSnapshot, tableName).entries()) {
      rowMap.set(getRowKey(tableName, row, index), cloneJson(row))
    }

    for (const [index, row] of listTableRows(normalizedRemoteSnapshot, tableName).entries()) {
      const rowKey = getRowKey(tableName, row, index)
      const currentRow = rowMap.get(rowKey)
      rowMap.set(
        rowKey,
        pickPreferredRow(currentRow, row, preferredSource === 'local' ? 'local' : 'remote'),
      )
    }

    const mergedRows = []
    for (const [rowKey, row] of rowMap.entries()) {
      const tombstoneKey = `${tableName}::${rowKey}`
      const tombstone = combinedTombstones.get(tombstoneKey)
      const rowUpdatedMs = getRowUpdatedAt(row)
      const deletedMs = toEpochMs(tombstone?.deleted_at)

      if (tombstone && Number.isFinite(deletedMs) && deletedMs >= rowUpdatedMs) {
        continue
      }

      if (tombstone && rowUpdatedMs > deletedMs) {
        combinedTombstones.delete(tombstoneKey)
      }

      mergedRows.push(row)
    }

    mergedTables[tableName] = sortRows(tableName, mergedRows)
  }

  mergedTables.deleted_log = sortDeletedLogRows(Array.from(combinedTombstones.values()))

  return canonicalizeSnapshot({
    schema_version: normalizedRemoteSnapshot.schema_version ?? normalizedLocalSnapshot.schema_version ?? null,
    ledger_id: ledgerId,
    exported_at: new Date().toISOString(),
    tables: mergedTables,
  })
}

export function areSharedLedgerSnapshotsEquivalent(leftSnapshot, rightSnapshot) {
  const normalizedLeft = canonicalizeSnapshot(leftSnapshot)
  const normalizedRight = canonicalizeSnapshot(rightSnapshot)

  const comparableLeft = {
    schema_version: normalizedLeft.schema_version ?? null,
    ledger_id: normalizedLeft.ledger_id,
    tables: normalizedLeft.tables,
  }
  const comparableRight = {
    schema_version: normalizedRight.schema_version ?? null,
    ledger_id: normalizedRight.ledger_id,
    tables: normalizedRight.tables,
  }

  return JSON.stringify(comparableLeft) === JSON.stringify(comparableRight)
}
