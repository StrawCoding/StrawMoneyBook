import { query, run } from '../db/sqlite.js'
import { firstRow, rowsOf } from './base.repo.js'
import { createId, nowIso } from '../utils/id.js'
import {
  INVOICE_CARRIER_PROVIDER_ID,
  normalizeCarrierOptions,
  normalizeText,
  parseInvoiceDateText,
} from '../../services/invoice-carrier/shared.js'

function normalizeConnectionStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()
  if (value === 'inactive' || value === 'error' || value === 'reauth_required') return value
  return 'active'
}

function normalizeSyncStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()
  if (value === 'ok' || value === 'error') return value
  return 'idle'
}

function normalizeAmount(amount) {
  return Math.max(0, Math.round(Number(amount) || 0))
}

function parseCarrierOptionsJson(text) {
  try {
    const parsed = JSON.parse(String(text ?? '[]'))
    return normalizeCarrierOptions(parsed)
  } catch {
    return []
  }
}

function normalizeConnectionRow(row) {
  const source = row && typeof row === 'object' ? row : {}
  return {
    ...source,
    carrier_options: parseCarrierOptionsJson(source.carrier_options_json),
  }
}

function connectionSelectSql() {
  return `SELECT id, provider, provider_connection_id, settings_ledger_id,
                 user_label, mobile_phone, status, carrier_options_json,
                 last_sync_at, last_sync_status, last_error, created_at, updated_at
          FROM invoice_carrier_connections`
}

export async function listInvoiceCarrierConnections() {
  const result = await query(
    `${connectionSelectSql()}
     WHERE status != 'inactive'
     ORDER BY updated_at DESC, created_at DESC;`,
  )
  return rowsOf(result).map(normalizeConnectionRow)
}

export async function findInvoiceCarrierConnectionById(connectionId) {
  if (!connectionId) return null
  const result = await query(
    `${connectionSelectSql()}
     WHERE id = ?
     LIMIT 1;`,
    [connectionId],
  )
  return normalizeConnectionRow(firstRow(result))
}

export async function findInvoiceCarrierConnectionByProviderRef(providerConnectionId, provider = INVOICE_CARRIER_PROVIDER_ID) {
  const normalizedRef = normalizeText(providerConnectionId)
  const normalizedProvider = normalizeText(provider) || INVOICE_CARRIER_PROVIDER_ID
  if (!normalizedRef) return null
  const result = await query(
    `${connectionSelectSql()}
     WHERE provider = ?
       AND provider_connection_id = ?
     LIMIT 1;`,
    [normalizedProvider, normalizedRef],
  )
  return normalizeConnectionRow(firstRow(result))
}

export async function findInvoiceCarrierConnectionByMobilePhone(mobilePhone) {
  const normalized = normalizeText(mobilePhone)
  if (!normalized) return null
  const result = await query(
    `${connectionSelectSql()}
     WHERE mobile_phone = ?
       AND status != 'inactive'
     LIMIT 1;`,
    [normalized],
  )
  return normalizeConnectionRow(firstRow(result))
}

export async function addInvoiceCarrierConnection(input) {
  const id = createId('einvconn')
  const provider = normalizeText(input?.provider) || INVOICE_CARRIER_PROVIDER_ID
  const providerConnectionId = normalizeText(input?.provider_connection_id || input?.providerConnectionId) || id
  const settingsLedgerId = normalizeText(input?.settings_ledger_id || input?.settingsLedgerId)
  const mobilePhone = normalizeText(input?.mobile_phone || input?.mobilePhone)
  const userLabel = normalizeText(input?.user_label || input?.userLabel) || mobilePhone
  const status = normalizeConnectionStatus(input?.status)
  const carrierOptions = normalizeCarrierOptions(input?.carrier_options || input?.carrierOptions)
  const now = nowIso()

  if (!mobilePhone) {
    throw new Error('mobile_phone is required')
  }

  await run(
    `INSERT INTO invoice_carrier_connections (
      id, provider, provider_connection_id, settings_ledger_id, user_label, mobile_phone, status,
      carrier_options_json, last_sync_at, last_sync_status, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'idle', NULL, ?, ?);`,
    [
      id,
      provider,
      providerConnectionId,
      settingsLedgerId || null,
      userLabel,
      mobilePhone,
      status,
      JSON.stringify(carrierOptions),
      now,
      now,
    ],
  )

  return findInvoiceCarrierConnectionById(id)
}

export async function updateInvoiceCarrierConnection(connectionId, input = {}) {
  if (!connectionId) throw new Error('connectionId is required')
  const existing = await findInvoiceCarrierConnectionById(connectionId)
  if (!existing) throw new Error('Connection not found')

  const next = {
    providerConnectionId: normalizeText(input?.provider_connection_id || input?.providerConnectionId) || existing.provider_connection_id || existing.id,
    settingsLedgerId: normalizeText(input?.settings_ledger_id || input?.settingsLedgerId) || existing.settings_ledger_id || null,
    userLabel: normalizeText(input?.user_label || input?.userLabel) || existing.user_label || existing.mobile_phone,
    mobilePhone: normalizeText(input?.mobile_phone || input?.mobilePhone) || existing.mobile_phone,
    status: normalizeConnectionStatus(input?.status ?? existing.status),
    carrierOptions: normalizeCarrierOptions(
      input?.carrier_options
      ?? input?.carrierOptions
      ?? existing.carrier_options,
    ),
    lastSyncAt: input?.last_sync_at === undefined && input?.lastSyncAt === undefined
      ? existing.last_sync_at
      : (normalizeText(input?.last_sync_at || input?.lastSyncAt) || null),
    lastSyncStatus: normalizeSyncStatus(input?.last_sync_status ?? input?.lastSyncStatus ?? existing.last_sync_status),
    lastError: normalizeText(input?.last_error || input?.lastError) || null,
  }

  await run(
    `UPDATE invoice_carrier_connections
     SET provider_connection_id = ?,
         settings_ledger_id = ?,
         user_label = ?,
         mobile_phone = ?,
         status = ?,
         carrier_options_json = ?,
         last_sync_at = ?,
         last_sync_status = ?,
         last_error = ?,
         updated_at = ?
     WHERE id = ?;`,
    [
      next.providerConnectionId,
      next.settingsLedgerId,
      next.userLabel,
      next.mobilePhone,
      next.status,
      JSON.stringify(next.carrierOptions),
      next.lastSyncAt,
      next.lastSyncStatus,
      next.lastError,
      nowIso(),
      connectionId,
    ],
  )

  return findInvoiceCarrierConnectionById(connectionId)
}

export async function updateInvoiceCarrierConnectionSyncStatus(connectionId, input) {
  return updateInvoiceCarrierConnection(connectionId, {
    status: input?.status,
    last_sync_at: input?.last_sync_at,
    last_sync_status: input?.last_sync_status,
    last_error: input?.last_error,
    carrier_options: input?.carrier_options,
  })
}

export async function deleteInvoiceCarrierConnection(connectionId) {
  if (!connectionId) throw new Error('connectionId is required')
  return updateInvoiceCarrierConnection(connectionId, {
    status: 'inactive',
  })
}

export async function listInvoiceCarrierInvoices(connectionId, opts = {}) {
  if (!connectionId) throw new Error('connectionId is required')

  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0))
  const limit = Math.max(1, Math.min(1000, Math.floor(Number(opts.limit) || 100)))

  const result = await query(
    `SELECT id, connection_id, invoice_number, invoice_date, seller_name,
            amount, carrier_label, imported_transaction_id, created_at
     FROM invoice_carrier_invoices
     WHERE connection_id = ?
     ORDER BY invoice_date DESC, created_at DESC
     LIMIT ? OFFSET ?;`,
    [connectionId, limit, offset],
  )
  return rowsOf(result)
}

export async function findInvoiceCarrierInvoiceById(invoiceId) {
  if (!invoiceId) return null
  const result = await query(
    `SELECT id, connection_id, invoice_number, invoice_date, seller_name,
            amount, carrier_label, imported_transaction_id, created_at
     FROM invoice_carrier_invoices
     WHERE id = ?
     LIMIT 1;`,
    [invoiceId],
  )
  return firstRow(result)
}

export async function findInvoiceCarrierInvoiceByUniqueKey(connectionId, invoiceNumber, invoiceDate) {
  if (!connectionId) return null
  const normalizedInvoiceNumber = normalizeText(invoiceNumber)
  const normalizedInvoiceDate = parseInvoiceDateText(invoiceDate)
  if (!normalizedInvoiceNumber || !normalizedInvoiceDate) return null
  const result = await query(
    `SELECT id, connection_id, invoice_number, invoice_date, seller_name,
            amount, carrier_label, imported_transaction_id, created_at
     FROM invoice_carrier_invoices
     WHERE connection_id = ?
       AND invoice_number = ?
       AND invoice_date = ?
     LIMIT 1;`,
    [connectionId, normalizedInvoiceNumber, normalizedInvoiceDate],
  )
  return firstRow(result)
}

export async function addInvoiceCarrierInvoice(input) {
  const id = createId('einvinv')
  const connectionId = normalizeText(input?.connection_id)
  const invoiceNumber = normalizeText(input?.invoice_number)
  const invoiceDate = parseInvoiceDateText(input?.invoice_date)
  const sellerName = normalizeText(input?.seller_name)
  const amount = normalizeAmount(input?.amount)
  const carrierLabel = normalizeText(input?.carrier_label)
  const now = nowIso()

  if (!connectionId || !invoiceNumber || !invoiceDate) {
    throw new Error('connection_id, invoice_number and invoice_date are required')
  }

  await run(
    `INSERT INTO invoice_carrier_invoices (
      id, connection_id, invoice_number, invoice_date, seller_name,
      amount, carrier_label, imported_transaction_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?);`,
    [id, connectionId, invoiceNumber, invoiceDate, sellerName, amount, carrierLabel, now],
  )

  return findInvoiceCarrierInvoiceById(id)
}

export async function updateInvoiceCarrierInvoice(invoiceId, input = {}) {
  if (!invoiceId) throw new Error('invoiceId is required')
  const existing = await findInvoiceCarrierInvoiceById(invoiceId)
  if (!existing) throw new Error('Invoice not found')

  const next = {
    invoiceDate: parseInvoiceDateText(input?.invoice_date || input?.invoiceDate) || existing.invoice_date,
    sellerName: normalizeText(input?.seller_name || input?.sellerName) || existing.seller_name,
    amount: input?.amount === undefined ? existing.amount : normalizeAmount(input.amount),
    carrierLabel: normalizeText(input?.carrier_label || input?.carrierLabel) || existing.carrier_label,
  }

  await run(
    `UPDATE invoice_carrier_invoices
     SET invoice_date = ?,
         seller_name = ?,
         amount = ?,
         carrier_label = ?
     WHERE id = ?;`,
    [next.invoiceDate, next.sellerName, next.amount, next.carrierLabel, invoiceId],
  )

  return findInvoiceCarrierInvoiceById(invoiceId)
}

export async function markInvoiceCarrierInvoiceImported(invoiceId, transactionId) {
  if (!invoiceId || !transactionId) {
    throw new Error('invoiceId and transactionId are required')
  }

  await run(
    `UPDATE invoice_carrier_invoices
     SET imported_transaction_id = ?
     WHERE id = ?;`,
    [transactionId, invoiceId],
  )

  return findInvoiceCarrierInvoiceById(invoiceId)
}

export async function upsertManyInvoiceCarrierInvoices(connectionId, invoices) {
  if (!connectionId || !Array.isArray(invoices)) {
    throw new Error('connectionId and invoices array are required')
  }

  const summary = {
    addedCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    invoices: [],
  }

  for (const invoice of invoices) {
    const invoiceNumber = normalizeText(invoice?.invoice_number)
    const invoiceDate = parseInvoiceDateText(invoice?.invoice_date)
    if (!invoiceNumber || !invoiceDate) {
      continue
    }

    const normalized = {
      connection_id: connectionId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      seller_name: normalizeText(invoice?.seller_name),
      amount: normalizeAmount(invoice?.amount),
      carrier_label: normalizeText(invoice?.carrier_label),
    }

    const existing = await findInvoiceCarrierInvoiceByUniqueKey(connectionId, invoiceNumber, invoiceDate)
    if (!existing) {
      const created = await addInvoiceCarrierInvoice(normalized)
      summary.addedCount += 1
      summary.invoices.push(created)
      continue
    }

    const hasChanges =
      normalizeText(existing.seller_name) !== normalized.seller_name
      || normalizeAmount(existing.amount) !== normalized.amount
      || normalizeText(existing.carrier_label) !== normalized.carrier_label

    if (!hasChanges) {
      summary.unchangedCount += 1
      summary.invoices.push(existing)
      continue
    }

    const updated = await updateInvoiceCarrierInvoice(existing.id, normalized)
    summary.updatedCount += 1
    summary.invoices.push(updated)
  }

  return summary
}

export async function countInvoiceCarrierInvoices(connectionId, opts = {}) {
  if (!connectionId) throw new Error('connectionId is required')

  const result = await query(
    `SELECT COUNT(*) as count
     FROM invoice_carrier_invoices
     WHERE connection_id = ? ${opts.imported_only ? ' AND imported_transaction_id IS NOT NULL' : ''};`,
    [connectionId],
  )
  return (firstRow(result)?.count ?? 0)
}
