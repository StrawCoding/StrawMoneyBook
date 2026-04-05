import { query, run } from '@/core/db/sqlite'
import { firstRow, rowsOf } from '@/core/repositories/base.repo'
import { createId, nowIso } from '@/core/utils/id'

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeConnectionStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()
  if (value === 'inactive') return 'inactive'
  return 'active'
}

function normalizeSyncStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()
  if (value === 'ok' || value === 'error') return value
  return 'idle'
}

export async function listInvoiceCarrierConnections() {
  const result = await query(
    `SELECT id, provider, user_label, mobile_phone, status,
            last_sync_at, last_sync_status, last_error, created_at, updated_at
     FROM invoice_carrier_connections
     WHERE status = 'active'
     ORDER BY updated_at DESC, created_at DESC;`,
  )
  return rowsOf(result)
}

export async function findInvoiceCarrierConnectionById(connectionId) {
  if (!connectionId) return null
  const result = await query(
    `SELECT id, provider, user_label, mobile_phone, status,
            last_sync_at, last_sync_status, last_error, created_at, updated_at
     FROM invoice_carrier_connections
     WHERE id = ?
     LIMIT 1;`,
    [connectionId],
  )
  return firstRow(result)
}

export async function findInvoiceCarrierConnectionByMobilePhone(mobilePhone) {
  const normalized = normalizeText(mobilePhone)
  if (!normalized) return null
  const result = await query(
    `SELECT id, provider, user_label, mobile_phone, status,
            last_sync_at, last_sync_status, last_error, created_at, updated_at
     FROM invoice_carrier_connections
     WHERE mobile_phone = ?
       AND status = 'active'
     LIMIT 1;`,
    [normalized],
  )
  return firstRow(result)
}

export async function addInvoiceCarrierConnection(input) {
  const id = createId('einvconn')
  const provider = 'einvoice_tw'
  const mobilePhone = normalizeText(input?.mobile_phone)
  const userLabel = normalizeText(input?.user_label) || mobilePhone
  const status = 'active'
  const now = nowIso()

  if (!mobilePhone) {
    throw new Error('mobile_phone is required')
  }

  await run(
    `INSERT INTO invoice_carrier_connections (
      id, provider, user_label, mobile_phone, status,
      last_sync_at, last_sync_status, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, 'idle', NULL, ?, ?);`,
    [id, provider, userLabel, mobilePhone, status, now, now],
  )

  return findInvoiceCarrierConnectionById(id)
}

export async function updateInvoiceCarrierConnectionSyncStatus(connectionId, input) {
  if (!connectionId) throw new Error('connectionId is required')

  const lastSyncStatus = normalizeSyncStatus(input?.last_sync_status)
  const lastError = normalizeText(input?.last_error)
  const now = nowIso()

  await run(
    `UPDATE invoice_carrier_connections
     SET last_sync_at = ?,
         last_sync_status = ?,
         last_error = ?,
         updated_at = ?
     WHERE id = ?;`,
    [now, lastSyncStatus, lastError, now, connectionId],
  )

  return findInvoiceCarrierConnectionById(connectionId)
}

export async function deleteInvoiceCarrierConnection(connectionId) {
  if (!connectionId) throw new Error('connectionId is required')

  // 軟刪除：標記為 inactive 而不實際刪除
  const now = nowIso()
  await run(
    `UPDATE invoice_carrier_connections
     SET status = 'inactive', updated_at = ?
     WHERE id = ?;`,
    [now, connectionId],
  )
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

export async function addInvoiceCarrierInvoice(input) {
  const id = createId('einvinv')
  const connectionId = normalizeText(input?.connection_id)
  const invoiceNumber = normalizeText(input?.invoice_number)
  const invoiceDate = normalizeText(input?.invoice_date) // ISO YYYY-MM-DD
  const sellerName = normalizeText(input?.seller_name)
  const amount = Math.round(Number(input?.amount) || 0)
  const carrierLabel = normalizeText(input?.carrier_label)
  const now = nowIso()

  if (!connectionId || !invoiceNumber) {
    throw new Error('connection_id and invoice_number are required')
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

  const now = nowIso()
  const promises = invoices.map((invoice) => {
    if (!invoice.invoice_number) {
      console.warn('Skipping invoice without invoice_number', invoice)
      return Promise.resolve()
    }

    return run(
      `INSERT INTO invoice_carrier_invoices (
        id, connection_id, invoice_number, invoice_date, seller_name,
        amount, carrier_label, imported_transaction_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
      ON CONFLICT(id)
      DO UPDATE SET
        invoice_date = excluded.invoice_date,
        seller_name = excluded.seller_name,
        amount = excluded.amount,
        carrier_label = excluded.carrier_label;`,
      [
        createId('einvinv'),
        connectionId,
        normalizeText(invoice.invoice_number),
        normalizeText(invoice.invoice_date),
        normalizeText(invoice.seller_name),
        Math.round(Number(invoice.amount) || 0),
        normalizeText(invoice.carrier_label),
        now,
      ],
    )
  })

  return Promise.all(promises)
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
