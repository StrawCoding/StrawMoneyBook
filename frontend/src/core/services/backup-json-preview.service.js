/**
 * Pure helpers: summarize backup / sync JSON and compare against local coverage.
 * Used by Drive appData 選檔／revision 還原預覽（smb299）.
 */

function isDeletedRow(row) {
  const deletedAt = row?.deleted_at
  if (deletedAt == null) return false
  return String(deletedAt).trim() !== ''
}

function monthKeyFromOccurredAt(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  // Prefer ISO / SQLite datetime prefix YYYY-MM-DD
  const match = raw.match(/^(\d{4})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}`
  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed)) return ''
  const date = new Date(parsed)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function collectLedgerPayloads(payload) {
  if (!payload || typeof payload !== 'object') return []
  if (Array.isArray(payload.ledgers) && payload.backup_scope === 'all_ledgers') {
    return payload.ledgers.filter((item) => item && typeof item === 'object')
  }
  // Single-ledger export / sync snapshot
  if (payload.tables && typeof payload.tables === 'object') {
    return [payload]
  }
  return []
}

function ledgerNameFromPayload(ledgerPayload) {
  const rows = Array.isArray(ledgerPayload?.tables?.ledgers) ? ledgerPayload.tables.ledgers : []
  const active = rows.find((row) => row && !isDeletedRow(row)) || rows[0]
  const name = String(active?.name ?? ledgerPayload?.ledger_name ?? '').trim()
  if (name) return name
  const id = String(ledgerPayload?.ledger_id ?? active?.id ?? '').trim()
  return id || ''
}

function countValidTransactions(ledgerPayload) {
  const rows = Array.isArray(ledgerPayload?.tables?.transactions)
    ? ledgerPayload.tables.transactions
    : []
  let count = 0
  const monthDistribution = Object.create(null)
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    if (isDeletedRow(row)) continue
    count += 1
    const monthKey = monthKeyFromOccurredAt(row.occurred_at)
    if (!monthKey) continue
    monthDistribution[monthKey] = (monthDistribution[monthKey] || 0) + 1
  }
  return { count, monthDistribution }
}

function mergeMonthMaps(...maps) {
  const out = Object.create(null)
  for (const map of maps) {
    if (!map || typeof map !== 'object') continue
    for (const [key, value] of Object.entries(map)) {
      out[key] = (out[key] || 0) + Number(value || 0)
    }
  }
  return out
}

/**
 * @param {unknown} payload
 * @returns {{
 *   ok: boolean,
 *   parseError: string,
 *   backupScope: string,
 *   exportedAt: string,
 *   ledgerNames: string[],
 *   ledgerCount: number,
 *   transactionCount: number,
 *   monthDistribution: Record<string, number>,
 *   months: string[],
 *   earliestMonth: string,
 *   latestMonth: string,
 * }}
 */
export function summarizeBackupPayload(payload) {
  const empty = {
    ok: false,
    parseError: '',
    backupScope: '',
    exportedAt: '',
    ledgerNames: [],
    ledgerCount: 0,
    transactionCount: 0,
    monthDistribution: {},
    months: [],
    earliestMonth: '',
    latestMonth: '',
  }

  if (!payload || typeof payload !== 'object') {
    return { ...empty, parseError: 'invalid_payload' }
  }

  const ledgerPayloads = collectLedgerPayloads(payload)
  if (!ledgerPayloads.length) {
    return {
      ...empty,
      parseError: 'missing_ledgers',
      backupScope: String(payload.backup_scope ?? '').trim(),
      exportedAt: String(payload.exported_at ?? '').trim(),
    }
  }

  const ledgerNames = []
  let transactionCount = 0
  let monthDistribution = Object.create(null)

  for (const ledgerPayload of ledgerPayloads) {
    const name = ledgerNameFromPayload(ledgerPayload)
    if (name) ledgerNames.push(name)
    const counted = countValidTransactions(ledgerPayload)
    transactionCount += counted.count
    monthDistribution = mergeMonthMaps(monthDistribution, counted.monthDistribution)
  }

  const months = Object.keys(monthDistribution).sort()
  return {
    ok: true,
    parseError: '',
    backupScope: String(payload.backup_scope ?? (ledgerPayloads.length > 1 ? 'all_ledgers' : 'single')).trim(),
    exportedAt: String(payload.exported_at ?? '').trim(),
    ledgerNames,
    ledgerCount: ledgerPayloads.length,
    transactionCount,
    monthDistribution,
    months,
    earliestMonth: months[0] || '',
    latestMonth: months[months.length - 1] || '',
  }
}

/**
 * @param {string} jsonText
 */
export function summarizeBackupJsonText(jsonText) {
  const text = String(jsonText ?? '')
  if (!text.trim()) {
    return summarizeBackupPayload(null)
  }
  try {
    return summarizeBackupPayload(JSON.parse(text))
  } catch {
    return {
      ...summarizeBackupPayload(null),
      parseError: 'json_parse_error',
    }
  }
}

/**
 * Compare remote backup summary vs local summary / file modified times.
 * @returns {{
 *   ageRelation: 'older'|'newer'|'same'|'unknown',
 *   coverage: 'remote_narrower'|'remote_wider'|'equal'|'disjoint'|'overlapping'|'unknown',
 *   monthsOnlyInLocal: string[],
 *   monthsOnlyInRemote: string[],
 *   localTxCount: number,
 *   remoteTxCount: number,
 *   warnIncompleteRemote: boolean,
 *   warnOlderRemote: boolean,
 *   warnNewerRemote: boolean,
 * }}
 */
export function compareBackupSummaries(remoteSummary, localSummary, options = {}) {
  const remote = remoteSummary && typeof remoteSummary === 'object' ? remoteSummary : {}
  const local = localSummary && typeof localSummary === 'object' ? localSummary : {}
  const remoteModifiedAt = String(options.remoteModifiedAt ?? remote.exportedAt ?? '').trim()
  const localModifiedAt = String(options.localModifiedAt ?? local.exportedAt ?? '').trim()

  let ageRelation = 'unknown'
  const remoteMs = Date.parse(remoteModifiedAt)
  const localMs = Date.parse(localModifiedAt)
  if (Number.isFinite(remoteMs) && Number.isFinite(localMs)) {
    if (remoteMs < localMs - 1000) ageRelation = 'older'
    else if (remoteMs > localMs + 1000) ageRelation = 'newer'
    else ageRelation = 'same'
  }

  const remoteMonths = Array.isArray(remote.months) ? remote.months : []
  const localMonths = Array.isArray(local.months) ? local.months : []
  const remoteSet = new Set(remoteMonths)
  const localSet = new Set(localMonths)
  const monthsOnlyInLocal = localMonths.filter((m) => !remoteSet.has(m))
  const monthsOnlyInRemote = remoteMonths.filter((m) => !localSet.has(m))

  let coverage = 'unknown'
  if (!remote.ok && !local.ok) coverage = 'unknown'
  else if (!remoteMonths.length && !localMonths.length) coverage = 'equal'
  else if (!monthsOnlyInLocal.length && !monthsOnlyInRemote.length) coverage = 'equal'
  else if (!monthsOnlyInLocal.length && monthsOnlyInRemote.length) coverage = 'remote_wider'
  else if (monthsOnlyInLocal.length && !monthsOnlyInRemote.length) coverage = 'remote_narrower'
  else if (remoteMonths.length && localMonths.length) coverage = 'overlapping'
  else coverage = 'disjoint'

  const localTxCount = Number(local.transactionCount ?? 0) || 0
  const remoteTxCount = Number(remote.transactionCount ?? 0) || 0
  const warnIncompleteRemote = Boolean(
    remote.ok
    && local.ok
    && (
      monthsOnlyInLocal.length > 0
      || (localTxCount > 0 && remoteTxCount < localTxCount)
    ),
  )
  const warnOlderRemote = ageRelation === 'older'
  const warnNewerRemote = ageRelation === 'newer'

  return {
    ageRelation,
    coverage,
    monthsOnlyInLocal,
    monthsOnlyInRemote,
    localTxCount,
    remoteTxCount,
    warnIncompleteRemote,
    warnOlderRemote,
    warnNewerRemote,
  }
}

export function formatMonthDistributionLabel(monthDistribution, { limit = 8 } = {}) {
  const entries = Object.entries(monthDistribution || {}).sort(([a], [b]) => a.localeCompare(b))
  if (!entries.length) return ''
  const shown = entries.slice(0, Math.max(1, limit)).map(([month, count]) => `${month}:${count}`)
  const rest = entries.length - shown.length
  return rest > 0 ? `${shown.join(', ')} (+${rest})` : shown.join(', ')
}
