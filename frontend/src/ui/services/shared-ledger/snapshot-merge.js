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

function buildIdSet(rows = [], key = 'id') {
  return new Set(
    rows
      .map((row) => normalizeText(row?.[key]))
      .filter(Boolean),
  )
}

function cloneRowWithNullMissingRefs(row, fields = [], existingIds = new Set()) {
  let nextRow = row
  for (const field of fields) {
    const refId = normalizeText(nextRow?.[field])
    if (refId && !existingIds.has(refId)) {
      nextRow = { ...nextRow, [field]: null }
    }
  }
  return nextRow
}

function pruneSharedLedgerSnapshotForeignKeys(tables) {
  const nextTables = { ...tables }

  nextTables.accounts = listTableRows({ tables: nextTables }, 'accounts')
    .filter((row) => buildIdSet(nextTables.account_groups).has(normalizeText(row?.group_id)))
  const accountIds = buildIdSet(nextTables.accounts)

  nextTables.categories = listTableRows({ tables: nextTables }, 'categories')
    .filter((row) => buildIdSet(nextTables.category_groups).has(normalizeText(row?.group_id)))
  const categoryIds = buildIdSet(nextTables.categories)

  nextTables.transactions = listTableRows({ tables: nextTables }, 'transactions')
    .map((row) => cloneRowWithNullMissingRefs(row, ['peer_account_id'], accountIds))
    .map((row) => cloneRowWithNullMissingRefs(row, ['category_id'], categoryIds))
    .filter((row) => accountIds.has(normalizeText(row?.account_id)))
  const transactionIds = buildIdSet(nextTables.transactions)

  nextTables.transaction_attachments = listTableRows({ tables: nextTables }, 'transaction_attachments')
    .filter((row) => transactionIds.has(normalizeText(row?.transaction_id)))

  nextTables.loans = listTableRows({ tables: nextTables }, 'loans')
    .filter((row) => buildIdSet(nextTables.counterparties).has(normalizeText(row?.counterparty_id)))
  const loanIds = buildIdSet(nextTables.loans)

  nextTables.loan_payments = listTableRows({ tables: nextTables }, 'loan_payments')
    .map((row) => cloneRowWithNullMissingRefs(row, ['generated_tx_id', 'generated_interest_tx_id'], transactionIds))
    .filter((row) => loanIds.has(normalizeText(row?.loan_id)) && accountIds.has(normalizeText(row?.account_id)))

  nextTables.reimbursement_advances = listTableRows({ tables: nextTables }, 'reimbursement_advances')
    .map((row) => cloneRowWithNullMissingRefs(row, ['source_tx_id'], transactionIds))
    .filter((row) => accountIds.has(normalizeText(row?.account_id)))
  const advanceIds = buildIdSet(nextTables.reimbursement_advances)

  nextTables.reimbursement_advance_usages = listTableRows({ tables: nextTables }, 'reimbursement_advance_usages')
    .filter((row) => advanceIds.has(normalizeText(row?.advance_id)) && transactionIds.has(normalizeText(row?.expense_tx_id)))

  nextTables.reimbursements = listTableRows({ tables: nextTables }, 'reimbursements')
    .map((row) => cloneRowWithNullMissingRefs(row, ['counterparty_id'], buildIdSet(nextTables.counterparties)))
    .map((row) => cloneRowWithNullMissingRefs(row, ['paid_tx_id'], transactionIds))
  const reimbursementIds = buildIdSet(nextTables.reimbursements)

  nextTables.reimbursement_items = listTableRows({ tables: nextTables }, 'reimbursement_items')
    .map((row) => cloneRowWithNullMissingRefs(row, ['transaction_id'], transactionIds))
    .map((row) => cloneRowWithNullMissingRefs(row, ['category_id'], categoryIds))
    .map((row) => cloneRowWithNullMissingRefs(row, ['account_id'], accountIds))
    .filter((row) => reimbursementIds.has(normalizeText(row?.reimbursement_id)))

  nextTables.budget_containers = listTableRows({ tables: nextTables }, 'budget_containers')
    .filter((row) => buildIdSet(nextTables.budgets).has(normalizeText(row?.budget_id)))

  nextTables.budget_items = listTableRows({ tables: nextTables }, 'budget_items')
    .filter((row) => buildIdSet(nextTables.budgets).has(normalizeText(row?.budget_id)))
    .filter((row) => {
      const scopeType = normalizeText(row?.scope_type)
      if (scopeType === 'category') return categoryIds.has(normalizeText(row?.category_id))
      if (scopeType === 'group') return buildIdSet(nextTables.category_groups).has(normalizeText(row?.category_group_id))
      return true
    })

  nextTables.savings_jars = listTableRows({ tables: nextTables }, 'savings_jars')
    .filter((row) => accountIds.has(normalizeText(row?.account_id)))

  nextTables.bank_accounts = listTableRows({ tables: nextTables }, 'bank_accounts')
    .map((row) => cloneRowWithNullMissingRefs(row, ['mapped_account_id'], accountIds))
    .filter((row) => buildIdSet(nextTables.bank_connections).has(normalizeText(row?.connection_id)))
  const bankAccountIds = buildIdSet(nextTables.bank_accounts)

  nextTables.bank_transactions = listTableRows({ tables: nextTables }, 'bank_transactions')
    .map((row) => cloneRowWithNullMissingRefs(row, ['imported_txn_id'], transactionIds))
    .filter((row) => buildIdSet(nextTables.bank_connections).has(normalizeText(row?.connection_id)))
    .filter((row) => bankAccountIds.has(normalizeText(row?.bank_account_id)))

  nextTables.bank_sync_rules = listTableRows({ tables: nextTables }, 'bank_sync_rules')
    .filter((row) => buildIdSet(nextTables.bank_connections).has(normalizeText(row?.connection_id)))

  return nextTables
}

function tryParseTombstonePayload(tombstone) {
  try {
    const parsed = JSON.parse(String(tombstone?.payload_json ?? '{}'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function maxChildUpdatedMs(rows = []) {
  let maxMs = 0
  for (const row of rows) {
    maxMs = Math.max(maxMs, getRowUpdatedAt(row))
  }
  return maxMs
}

/**
 * When a parent row was tombstoned but newer children still reference it,
 * resurrect the parent from the tombstone payload so FK prune does not cascade
 * delete surviving transactions / accounts / categories (smb290).
 */
function resurrectReferencedParentsFromTombstones(tables, tombstoneMap) {
  const nextTables = { ...tables }

  const ensureParentRow = (tableName, parentId, childRows) => {
    const normalizedParentId = normalizeText(parentId)
    if (!normalizedParentId) return
    const existingIds = buildIdSet(nextTables[tableName])
    if (existingIds.has(normalizedParentId)) return

    const tombstoneKey = `${tableName}::${normalizedParentId}`
    const tombstone = tombstoneMap.get(tombstoneKey)
    if (!tombstone) return

    const deletedMs = toEpochMs(tombstone.deleted_at)
    const childMaxMs = maxChildUpdatedMs(childRows)
    if (!Number.isFinite(deletedMs) || !(childMaxMs > deletedMs)) return

    const payload = tryParseTombstonePayload(tombstone)
    if (!payload) return

    const restored = {
      ...cloneJson(payload),
      id: normalizedParentId,
      updated_at: toIso(payload.updated_at) || toIso(childMaxMs) || new Date().toISOString(),
    }
    nextTables[tableName] = sortRows(tableName, [
      ...listTableRows({ tables: nextTables }, tableName),
      restored,
    ])
    tombstoneMap.delete(tombstoneKey)
  }

  for (const account of listTableRows({ tables: nextTables }, 'accounts')) {
    ensureParentRow(
      'account_groups',
      account?.group_id,
      [account, ...listTableRows({ tables: nextTables }, 'transactions').filter((tx) => (
        normalizeText(tx?.account_id) === normalizeText(account?.id)
        || normalizeText(tx?.peer_account_id) === normalizeText(account?.id)
      ))],
    )
  }

  for (const category of listTableRows({ tables: nextTables }, 'categories')) {
    ensureParentRow(
      'category_groups',
      category?.group_id,
      [category, ...listTableRows({ tables: nextTables }, 'transactions').filter((tx) => (
        normalizeText(tx?.category_id) === normalizeText(category?.id)
      ))],
    )
  }

  for (const tx of listTableRows({ tables: nextTables }, 'transactions')) {
    ensureParentRow('accounts', tx?.account_id, [tx])
    ensureParentRow('categories', tx?.category_id, [tx])
  }

  return nextTables
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

function rowEquals(leftRow, rightRow) {
  return JSON.stringify(leftRow) === JSON.stringify(rightRow)
}

function pickPreferredRow(leftRow, rightRow, preferredSource = 'remote') {
  return pickPreferredRowWithSource(leftRow, rightRow, preferredSource).row
}

function decisionKey(tableName, rowKey) {
  return `${tableName}::${rowKey}`
}

function pickPreferredRowWithSource(leftRow, rightRow, preferredSource = 'remote') {
  if (!leftRow && !rightRow) return { row: null, source: 'none' }
  if (!leftRow) return { row: cloneJson(rightRow), source: 'remote' }
  if (!rightRow) return { row: cloneJson(leftRow), source: 'local' }
  if (rowEquals(leftRow, rightRow)) return { row: cloneJson(leftRow), source: 'same' }

  const leftUpdatedMs = getRowUpdatedAt(leftRow)
  const rightUpdatedMs = getRowUpdatedAt(rightRow)
  if (leftUpdatedMs > rightUpdatedMs) {
    return { row: cloneJson(leftRow), source: 'local' }
  }
  if (rightUpdatedMs > leftUpdatedMs) {
    return { row: cloneJson(rightRow), source: 'remote' }
  }

  const source = preferredSource === 'local' ? 'local' : 'remote'
  return {
    row: cloneJson(source === 'local' ? leftRow : rightRow),
    source,
  }
}

function findRowInTables(tables, tableName, rowKey) {
  for (const [index, row] of listTableRows({ tables }, tableName).entries()) {
    if (getRowKey(tableName, row, index) === rowKey) {
      return row
    }
  }
  return null
}

function addMergeUnitMember(unitMap, type, unitKey, tableName, rowKey) {
  const normalizedUnitKey = normalizeText(unitKey)
  if (!normalizedUnitKey || !tableName || !rowKey) return

  const mapKey = `${type}::${normalizedUnitKey}`
  if (!unitMap.has(mapKey)) {
    unitMap.set(mapKey, {
      type,
      unitKey: normalizedUnitKey,
      members: [],
    })
  }

  const unit = unitMap.get(mapKey)
  if (!unit.members.some((member) => member.tableName === tableName && member.rowKey === rowKey)) {
    unit.members.push({ tableName, rowKey })
  }
}

function collectMergeUnits(localTables, remoteTables) {
  const unitMap = new Map()

  for (const tables of [localTables, remoteTables]) {
    for (const row of listTableRows({ tables }, 'transactions')) {
      const transferGroupId = normalizeText(row?.transfer_group_id)
      if (!transferGroupId) continue
      const rowKey = getRowKey('transactions', row)
      addMergeUnitMember(unitMap, 'transfer_group', transferGroupId, 'transactions', rowKey)
    }
  }

  // NOTE (smb290): Do NOT bundle accounts with all referencing transactions as a
  // single "account_coherence" unit. That made a newer remote account metadata
  // edit wipe the other side's transactions (silent data loss). Account rows
  // still merge by last-write-wins independently; only true atomic bundles
  // (transfers / loan payments / reimbursements / advances) stay as units.

  for (const tables of [localTables, remoteTables]) {
    for (const payment of listTableRows({ tables }, 'loan_payments')) {
      const unitKey = normalizeText(payment?.id) || getRowKey('loan_payments', payment)
      addMergeUnitMember(unitMap, 'loan_payment_bundle', unitKey, 'loan_payments', getRowKey('loan_payments', payment))

      for (const txId of [payment?.generated_tx_id, payment?.generated_interest_tx_id]) {
        const normalizedTxId = normalizeText(txId)
        if (!normalizedTxId) continue
        const txRow = listTableRows({ tables }, 'transactions')
          .find((row) => normalizeText(row?.id) === normalizedTxId)
        if (txRow) {
          addMergeUnitMember(
            unitMap,
            'loan_payment_bundle',
            unitKey,
            'transactions',
            getRowKey('transactions', txRow),
          )
        }
      }
    }
  }

  for (const tables of [localTables, remoteTables]) {
    for (const reimbursement of listTableRows({ tables }, 'reimbursements')) {
      const reimbursementId = normalizeText(reimbursement?.id)
      if (!reimbursementId) continue
      addMergeUnitMember(
        unitMap,
        'reimbursement_bundle',
        reimbursementId,
        'reimbursements',
        getRowKey('reimbursements', reimbursement),
      )

      for (const item of listTableRows({ tables }, 'reimbursement_items')) {
        if (normalizeText(item?.reimbursement_id) !== reimbursementId) continue
        addMergeUnitMember(
          unitMap,
          'reimbursement_bundle',
          reimbursementId,
          'reimbursement_items',
          getRowKey('reimbursement_items', item),
        )
      }
    }
  }

  for (const tables of [localTables, remoteTables]) {
    for (const advance of listTableRows({ tables }, 'reimbursement_advances')) {
      const advanceId = normalizeText(advance?.id)
      if (!advanceId) continue
      addMergeUnitMember(
        unitMap,
        'advance_bundle',
        advanceId,
        'reimbursement_advances',
        getRowKey('reimbursement_advances', advance),
      )

      for (const usage of listTableRows({ tables }, 'reimbursement_advance_usages')) {
        if (normalizeText(usage?.advance_id) !== advanceId) continue
        addMergeUnitMember(
          unitMap,
          'advance_bundle',
          advanceId,
          'reimbursement_advance_usages',
          getRowKey('reimbursement_advance_usages', usage),
        )
      }
    }
  }

  return Array.from(unitMap.values())
}

function pickUnitWinningSource(unit, localTables, remoteTables, prefer) {
  let localMax = 0
  let remoteMax = 0

  for (const member of unit.members) {
    const localRow = findRowInTables(localTables, member.tableName, member.rowKey)
    const remoteRow = findRowInTables(remoteTables, member.tableName, member.rowKey)
    if (localRow) localMax = Math.max(localMax, getRowUpdatedAt(localRow))
    if (remoteRow) remoteMax = Math.max(remoteMax, getRowUpdatedAt(remoteRow))
  }

  if (localMax > remoteMax) return 'local'
  if (remoteMax > localMax) return 'remote'
  return prefer === 'local' ? 'local' : 'remote'
}

function setMergedTableRow(mergedTables, tableName, rowKey, row) {
  const nextRows = (mergedTables[tableName] ?? [])
    .filter((existingRow, index) => getRowKey(tableName, existingRow, index) !== rowKey)
  if (row) nextRows.push(cloneJson(row))
  mergedTables[tableName] = sortRows(tableName, nextRows)
}

function resolveCrossTableConflicts({
  mergedTables,
  rowDecisions,
  localTables,
  remoteTables,
  prefer,
}) {
  const conflicts = []
  const nextTables = { ...mergedTables }

  for (const unit of collectMergeUnits(localTables, remoteTables)) {
    const activeSources = new Set()
    for (const member of unit.members) {
      const decision = rowDecisions.get(decisionKey(member.tableName, member.rowKey))
      if (decision?.source === 'local' || decision?.source === 'remote') {
        activeSources.add(decision.source)
      }
    }
    if (activeSources.size < 2) continue

    const winningSource = pickUnitWinningSource(unit, localTables, remoteTables, prefer)
    conflicts.push({
      tableName: unit.members[0]?.tableName ?? '',
      rowKey: unit.unitKey,
      conflictType: unit.type,
      unitKey: unit.unitKey,
      resolution: winningSource,
    })

    const sourceTables = winningSource === 'local' ? localTables : remoteTables
    for (const member of unit.members) {
      const winnerRow = findRowInTables(sourceTables, member.tableName, member.rowKey)
      setMergedTableRow(nextTables, member.tableName, member.rowKey, winnerRow)
      rowDecisions.set(decisionKey(member.tableName, member.rowKey), {
        source: winnerRow ? winningSource : 'none',
        row: winnerRow ? cloneJson(winnerRow) : null,
      })
    }
  }

  return { conflicts, mergedTables: nextTables }
}

function applyTombstonesToMergedRows(tableName, rowMap, tombstoneMap) {
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
  return sortRows(tableName, mergedRows)
}

function mergeSnapshotTablesTwoWay(normalizedLocalSnapshot, normalizedRemoteSnapshot, options = {}) {
  const preferredSource = options?.prefer === 'local' ? 'local' : 'remote'
  const tableNames = getAllTableNames(normalizedLocalSnapshot, normalizedRemoteSnapshot)
  const combinedTombstones = buildTombstoneMap([
    ...listTableRows(normalizedLocalSnapshot, 'deleted_log'),
    ...listTableRows(normalizedRemoteSnapshot, 'deleted_log'),
  ])
  const mergedTables = {}
  const rowDecisions = new Map()

  for (const tableName of tableNames) {
    const rowMap = new Map()

    for (const [index, row] of listTableRows(normalizedLocalSnapshot, tableName).entries()) {
      const rowKey = getRowKey(tableName, row, index)
      const clonedRow = cloneJson(row)
      rowMap.set(rowKey, clonedRow)
      rowDecisions.set(decisionKey(tableName, rowKey), { source: 'local', row: clonedRow })
    }

    for (const [index, row] of listTableRows(normalizedRemoteSnapshot, tableName).entries()) {
      const rowKey = getRowKey(tableName, row, index)
      const picked = pickPreferredRowWithSource(rowMap.get(rowKey), row, preferredSource)
      if (picked.row) {
        rowMap.set(rowKey, picked.row)
      } else {
        rowMap.delete(rowKey)
      }
      rowDecisions.set(decisionKey(tableName, rowKey), picked)
    }

    mergedTables[tableName] = applyTombstonesToMergedRows(tableName, rowMap, combinedTombstones)
  }

  mergedTables.deleted_log = sortDeletedLogRows(Array.from(combinedTombstones.values()))

  const crossTable = resolveCrossTableConflicts({
    mergedTables,
    rowDecisions,
    localTables: normalizedLocalSnapshot.tables,
    remoteTables: normalizedRemoteSnapshot.tables,
    prefer: preferredSource,
  })

  return {
    mergedTables: crossTable.mergedTables,
    conflicts: crossTable.conflicts,
  }
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

  const resurrectedTables = resurrectReferencedParentsFromTombstones(tables, tombstoneMap)
  const prunedTables = pruneSharedLedgerSnapshotForeignKeys(resurrectedTables)
  prunedTables.deleted_log = sortDeletedLogRows(Array.from(tombstoneMap.values()))

  return {
    schema_version: normalizedSnapshot.schema_version ?? null,
    ledger_id: normalizeText(normalizedSnapshot.ledger_id),
    exported_at: toIso(normalizedSnapshot.exported_at),
    tables: prunedTables,
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

  const { mergedTables, conflicts } = mergeSnapshotTablesTwoWay(
    normalizedLocalSnapshot,
    normalizedRemoteSnapshot,
    options,
  )

  const mergedSnapshot = canonicalizeSnapshot({
    schema_version: normalizedRemoteSnapshot.schema_version ?? normalizedLocalSnapshot.schema_version ?? null,
    ledger_id: ledgerId,
    exported_at: new Date().toISOString(),
    tables: mergedTables,
  })

  if (options?.detectConflicts) {
    return {
      mergedSnapshot,
      conflicts,
      hasConflicts: conflicts.length > 0,
    }
  }

  return mergedSnapshot
}

export function threeWayMergeSnapshots(baseSnapshot, localSnapshot, remoteSnapshot, options = {}) {
  const normalizedBase = canonicalizeSnapshot(baseSnapshot)
  const normalizedLocal = canonicalizeSnapshot(localSnapshot)
  const normalizedRemote = canonicalizeSnapshot(remoteSnapshot)
  const ledgerId = normalizeText(normalizedLocal.ledger_id || normalizedRemote.ledger_id || normalizedBase.ledger_id)

  if (
    normalizedLocal.ledger_id
    && normalizedRemote.ledger_id
    && normalizedLocal.ledger_id !== normalizedRemote.ledger_id
  ) {
    throw new Error('共同帳本快照 ledger_id 不一致，無法合併')
  }

  const prefer = options?.prefer === 'local' ? 'local' : 'remote'
  const tableNames = getAllTableNames(normalizedLocal, normalizedRemote)
  const combinedTombstones = buildTombstoneMap([
    ...listTableRows(normalizedBase, 'deleted_log'),
    ...listTableRows(normalizedLocal, 'deleted_log'),
    ...listTableRows(normalizedRemote, 'deleted_log'),
  ])
  const mergedTables = {}
  const conflicts = []
  const rowDecisions = new Map()

  for (const tableName of tableNames) {
    const baseRowMap = new Map()
    for (const [index, row] of listTableRows(normalizedBase, tableName).entries()) {
      baseRowMap.set(getRowKey(tableName, row, index), cloneJson(row))
    }

    const localRowMap = new Map()
    for (const [index, row] of listTableRows(normalizedLocal, tableName).entries()) {
      localRowMap.set(getRowKey(tableName, row, index), cloneJson(row))
    }

    const remoteRowMap = new Map()
    for (const [index, row] of listTableRows(normalizedRemote, tableName).entries()) {
      remoteRowMap.set(getRowKey(tableName, row, index), cloneJson(row))
    }

    const allKeys = new Set([...baseRowMap.keys(), ...localRowMap.keys(), ...remoteRowMap.keys()])
    const rowMap = new Map()

    for (const rowKey of allKeys) {
      const baseRow = baseRowMap.get(rowKey) ?? null
      const localRow = localRowMap.get(rowKey) ?? null
      const remoteRow = remoteRowMap.get(rowKey) ?? null

      let chosenRow = null
      let chosenSource = 'same'

      if (rowEquals(localRow, baseRow)) {
        chosenRow = remoteRow
        chosenSource = remoteRow && !rowEquals(remoteRow, baseRow) ? 'remote' : 'same'
      } else if (rowEquals(remoteRow, baseRow)) {
        chosenRow = localRow
        chosenSource = localRow && !rowEquals(localRow, baseRow) ? 'local' : 'same'
      } else if (rowEquals(localRow, remoteRow)) {
        chosenRow = localRow
        chosenSource = 'same'
      } else {
        const localUpdatedMs = getRowUpdatedAt(localRow)
        const remoteUpdatedMs = getRowUpdatedAt(remoteRow)
        if (localUpdatedMs !== remoteUpdatedMs) {
          const remoteWins = remoteUpdatedMs > localUpdatedMs
          chosenRow = prefer === 'local'
            ? (localUpdatedMs >= remoteUpdatedMs ? localRow : remoteRow)
            : (remoteUpdatedMs >= localUpdatedMs ? remoteRow : localRow)
          chosenSource = remoteWins ? 'remote' : 'local'
        } else {
          chosenRow = prefer === 'local' ? localRow : remoteRow
          chosenSource = prefer
        }
        conflicts.push({
          tableName,
          rowKey,
          baseRow,
          localRow,
          remoteRow,
          chosenRow,
          resolution: prefer,
        })
      }

      if (!chosenRow) {
        rowDecisions.set(decisionKey(tableName, rowKey), { source: 'none', row: null })
        continue
      }

      rowMap.set(rowKey, chosenRow)
      rowDecisions.set(decisionKey(tableName, rowKey), { source: chosenSource, row: chosenRow })
    }

    mergedTables[tableName] = applyTombstonesToMergedRows(tableName, rowMap, combinedTombstones)
  }

  mergedTables.deleted_log = sortDeletedLogRows(Array.from(combinedTombstones.values()))

  const crossTable = resolveCrossTableConflicts({
    mergedTables,
    rowDecisions,
    localTables: normalizedLocal.tables,
    remoteTables: normalizedRemote.tables,
    prefer,
  })
  conflicts.push(...crossTable.conflicts)

  const mergedSnapshot = canonicalizeSnapshot({
    schema_version: normalizedRemote.schema_version ?? normalizedLocal.schema_version ?? normalizedBase.schema_version ?? null,
    ledger_id: ledgerId,
    exported_at: new Date().toISOString(),
    tables: crossTable.mergedTables,
  })

  return {
    mergedSnapshot,
    conflicts,
    hasConflicts: conflicts.length > 0,
  }
}

export function buildMergeLog(conflicts = [], options = {}) {
  const prefer = options?.prefer === 'local' ? 'local' : 'remote'
  const mergeMode = normalizeText(options?.mergeMode) || 'unknown'
  const normalizedConflicts = Array.isArray(conflicts) ? conflicts : []
  return {
    mergeMode,
    prefer,
    conflictCount: normalizedConflicts.length,
    conflicts: normalizedConflicts.map((conflict) => ({
      tableName: normalizeText(conflict?.tableName),
      rowKey: normalizeText(conflict?.rowKey),
      conflictType: normalizeText(conflict?.conflictType) || 'row',
      unitKey: normalizeText(conflict?.unitKey),
      resolution: normalizeText(conflict?.resolution) || prefer,
    })),
    recordedAt: new Date().toISOString(),
  }
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

/**
 * Stable integrity fingerprint for sync acceptance tests (smb290).
 * Counts rows and sums transaction amounts so merge/pull/push can prove
 * no silent drop/duplication of bookkeeping data.
 */
export function summarizeSharedLedgerSnapshotIntegrity(snapshot) {
  const normalized = canonicalizeSnapshot(snapshot)
  const tables = normalized.tables ?? {}
  const transactions = listTableRows({ tables }, 'transactions')
  const amountMinorTotal = transactions.reduce((sum, row) => {
    const amount = Number(row?.amount_minor)
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)

  const countMap = {}
  for (const tableName of getAllTableNames(normalized, null)) {
    countMap[tableName] = listTableRows({ tables }, tableName).length
  }
  countMap.deleted_log = listTableRows({ tables }, 'deleted_log').length

  return {
    ledgerId: normalized.ledger_id,
    rowCounts: countMap,
    transactionCount: transactions.length,
    transactionIds: transactions.map((row) => normalizeText(row?.id)).filter(Boolean).sort(),
    amountMinorTotal,
    accountIds: listTableRows({ tables }, 'accounts').map((row) => normalizeText(row?.id)).filter(Boolean).sort(),
    categoryIds: listTableRows({ tables }, 'categories').map((row) => normalizeText(row?.id)).filter(Boolean).sort(),
    budgetIds: listTableRows({ tables }, 'budgets').map((row) => normalizeText(row?.id)).filter(Boolean).sort(),
  }
}
