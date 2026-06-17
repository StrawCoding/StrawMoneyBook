import { query, run } from '@/core/db/sqlite'
import { createId } from '@/core/utils/id'

const DEFAULT_CONFIG_ID = 'einvoice_sync_default'

function nowMs() {
  return Date.now()
}

function normalizeConfigRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: String(row.id ?? DEFAULT_CONFIG_ID),
    ledgerId: row.ledger_id ? String(row.ledger_id) : null,
    autoSyncEnabled: Boolean(Number(row.auto_sync_enabled ?? 0)),
    lookbackDays: Math.min(14, Math.max(1, Number(row.lookback_days ?? 7) || 7)),
    defaultAccountId: row.default_account_id ? String(row.default_account_id) : null,
    defaultCategoryId: row.default_category_id ? String(row.default_category_id) : null,
    lastSyncAt: row.last_sync_at != null ? Number(row.last_sync_at) : null,
    lastSyncStatus: String(row.last_sync_status ?? 'idle'),
    lastError: row.last_error ? String(row.last_error) : null,
    updatedAt: Number(row.updated_at ?? 0),
  }
}

function normalizePendingRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: String(row.id ?? ''),
    invoiceNumber: String(row.invoice_number ?? ''),
    amount: Number(row.amount ?? 0),
    invoiceDate: Number(row.invoice_date ?? 0),
    merchantName: row.merchant_name ? String(row.merchant_name) : null,
    carrierName: row.carrier_name ? String(row.carrier_name) : null,
    status: String(row.status ?? 'pending'),
    scrapedAt: Number(row.scraped_at ?? 0),
    sourceSyncRunId: row.source_sync_run_id ? String(row.source_sync_run_id) : null,
  }
}

function normalizeSyncRunRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: String(row.id ?? ''),
    startedAt: Number(row.started_at ?? 0),
    finishedAt: row.finished_at != null ? Number(row.finished_at) : null,
    status: String(row.status ?? ''),
    fetchedCount: Number(row.fetched_count ?? 0),
    newPendingCount: Number(row.new_pending_count ?? 0),
    errorCode: row.error_code ? String(row.error_code) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
  }
}

export async function getEInvoiceSyncConfig(configId = DEFAULT_CONFIG_ID) {
  const result = await query('SELECT * FROM einvoice_sync_config WHERE id = ? LIMIT 1;', [configId])
  const row = result?.values?.[0]
  return row ? normalizeConfigRow(row) : null
}

export async function upsertEInvoiceSyncConfig(patch = {}, configId = DEFAULT_CONFIG_ID) {
  const existing = await getEInvoiceSyncConfig(configId)
  const now = nowMs()
  if (existing) {
    await run(
      `UPDATE einvoice_sync_config
       SET ledger_id = ?, auto_sync_enabled = ?, lookback_days = ?, default_account_id = ?, default_category_id = ?,
           last_sync_at = ?, last_sync_status = ?, last_error = ?, updated_at = ?
       WHERE id = ?;`,
      [
        patch.ledgerId ?? existing.ledgerId,
        patch.autoSyncEnabled != null ? (patch.autoSyncEnabled ? 1 : 0) : (existing.autoSyncEnabled ? 1 : 0),
        patch.lookbackDays ?? existing.lookbackDays,
        patch.defaultAccountId ?? existing.defaultAccountId,
        patch.defaultCategoryId ?? existing.defaultCategoryId,
        patch.lastSyncAt !== undefined ? patch.lastSyncAt : existing.lastSyncAt,
        patch.lastSyncStatus ?? existing.lastSyncStatus,
        patch.lastError !== undefined ? patch.lastError : existing.lastError,
        now,
        configId,
      ],
    )
  } else {
    await run(
      `INSERT INTO einvoice_sync_config
        (id, ledger_id, auto_sync_enabled, lookback_days, default_account_id, default_category_id,
         last_sync_at, last_sync_status, last_error, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        configId,
        patch.ledgerId ?? null,
        patch.autoSyncEnabled ? 1 : 0,
        patch.lookbackDays ?? 7,
        patch.defaultAccountId ?? null,
        patch.defaultCategoryId ?? null,
        patch.lastSyncAt ?? null,
        patch.lastSyncStatus ?? 'idle',
        patch.lastError ?? null,
        now,
      ],
    )
  }
  return getEInvoiceSyncConfig(configId)
}

export async function listPendingEInvoiceInvoices() {
  const result = await query(
    `SELECT * FROM einvoice_pending_invoices
     WHERE status = 'pending'
     ORDER BY invoice_date DESC, scraped_at DESC;`,
    [],
  )
  return (result?.values ?? []).map(normalizePendingRow).filter(Boolean)
}

export async function listDismissedInvoiceNumbers() {
  const result = await query(
    `SELECT invoice_number FROM einvoice_pending_invoices WHERE status = 'dismissed';`,
    [],
  )
  return new Set((result?.values ?? []).map((row) => String(row.invoice_number)))
}

export async function insertPendingEInvoiceInvoices(invoices = [], syncRunId = null) {
  let inserted = 0
  for (const invoice of invoices) {
    const id = createId('einv_pending')
    const result = await run(
      `INSERT OR IGNORE INTO einvoice_pending_invoices
        (id, invoice_number, amount, invoice_date, merchant_name, carrier_name, status, scraped_at, source_sync_run_id)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?);`,
      [
        id,
        invoice.invoiceNumber,
        invoice.amount,
        invoice.invoiceDate,
        invoice.merchantName ?? null,
        invoice.carrierName ?? null,
        nowMs(),
        syncRunId,
      ],
    )
    if (Number(result?.changes ?? 0) > 0) inserted += 1
  }
  return inserted
}

export async function markPendingInvoicesStatus(invoiceNumbers = [], status = 'imported') {
  if (!invoiceNumbers.length) return 0
  const placeholders = invoiceNumbers.map(() => '?').join(', ')
  const result = await run(
    `UPDATE einvoice_pending_invoices SET status = ? WHERE invoice_number IN (${placeholders});`,
    [status, ...invoiceNumbers],
  )
  return Number(result?.changes ?? 0)
}

export async function insertEInvoiceSyncRun({
  id = createId('einv_sync_run'),
  startedAt = nowMs(),
  finishedAt = null,
  status,
  fetchedCount = 0,
  newPendingCount = 0,
  errorCode = null,
  errorMessage = null,
} = {}) {
  await run(
    `INSERT INTO einvoice_sync_runs
      (id, started_at, finished_at, status, fetched_count, new_pending_count, error_code, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, startedAt, finishedAt, status, fetchedCount, newPendingCount, errorCode, errorMessage],
  )
  return getEInvoiceSyncRun(id)
}

export async function getEInvoiceSyncRun(id) {
  const result = await query('SELECT * FROM einvoice_sync_runs WHERE id = ? LIMIT 1;', [id])
  const row = result?.values?.[0]
  return row ? normalizeSyncRunRow(row) : null
}

export async function listRecentEInvoiceSyncRuns(limit = 5) {
  const result = await query(
    'SELECT * FROM einvoice_sync_runs ORDER BY started_at DESC LIMIT ?;',
    [Math.max(1, limit)],
  )
  return (result?.values ?? []).map(normalizeSyncRunRow).filter(Boolean)
}
