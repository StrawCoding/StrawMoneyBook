import { query, run } from '../db/sqlite.js'
import { assertLedgerId, firstRow, rowsOf } from './base.repo.js'
import { createId, nowIso } from '../utils/id.js'

const defaultDependencies = {
  query,
  run,
  createId,
  nowIso,
}

const dependencies = { ...defaultDependencies }

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(String(text ?? '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseJsonArray(text) {
  try {
    const parsed = JSON.parse(String(text ?? '[]'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeConnectionStatus(status) {
  const value = normalizeText(status).toLowerCase()
  if (value === 'reauth_required' || value === 'disabled') return value
  return 'active'
}

function normalizeSyncStatus(status) {
  const value = normalizeText(status).toLowerCase()
  if (value === 'ok' || value === 'error') return value
  return 'idle'
}

function normalizeAuthMode(authMode) {
  const value = normalizeText(authMode).toLowerCase()
  if (value === 'mobile_barcode') return value
  return 'mobile_barcode'
}

function normalizeDateInput(value) {
  const text = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function normalizeCarrierOptions(options = []) {
  if (!Array.isArray(options)) return []
  return options
    .map((item) => ({
      value: normalizeText(item?.value),
      label: normalizeText(item?.label),
    }))
    .filter((item) => item.value || item.label)
}

function normalizeConnectionRow(row) {
  if (!row || typeof row !== 'object') return null
  const source = row
  return {
    ...source,
    status: normalizeConnectionStatus(source.status),
    auth_mode: normalizeAuthMode(source.auth_mode),
    last_sync_status: normalizeSyncStatus(source.last_sync_status),
    sync_filter: parseJsonObject(source.sync_filter_json),
    carrier_options: normalizeCarrierOptions(parseJsonArray(source.carrier_options_json)),
  }
}

function normalizeInvoiceStatus(status) {
  const value = normalizeText(status).toLowerCase()
  return value || 'all'
}

function normalizeInvoiceRow(row) {
  const source = row && typeof row === 'object' ? row : {}
  return {
    ...source,
    invoice_status: normalizeInvoiceStatus(source.invoice_status),
    is_viewed: Number(source.is_viewed ?? 0) === 1 ? 1 : 0,
    amount_minor: Math.round(Number(source.amount_minor ?? 0) || 0),
    raw: parseJsonObject(source.raw_json),
  }
}

export function resetEinvoiceCarrierRepoDependenciesForTest() {
  Object.assign(dependencies, defaultDependencies)
}

export function setEinvoiceCarrierRepoDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export async function listInvoiceCarrierConnections(ledgerId) {
  assertLedgerId(ledgerId)
  const result = await dependencies.query(
    `SELECT ledger_id, id, provider, auth_mode, provider_connection_id, status, user_label,
            last_sync_at, last_sync_status, last_error, sync_filter_json, carrier_options_json,
            created_at, updated_at, deleted_at
     FROM invoice_carrier_connections
     WHERE ledger_id = ?
       AND deleted_at IS NULL
     ORDER BY updated_at DESC, created_at DESC;`,
    [ledgerId],
  )
  return rowsOf(result).map(normalizeConnectionRow)
}

export async function findInvoiceCarrierConnectionById(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  const normalizedConnectionId = normalizeText(connectionId)
  if (!normalizedConnectionId) return null
  const result = await dependencies.query(
    `SELECT ledger_id, id, provider, auth_mode, provider_connection_id, status, user_label,
            last_sync_at, last_sync_status, last_error, sync_filter_json, carrier_options_json,
            created_at, updated_at, deleted_at
     FROM invoice_carrier_connections
     WHERE ledger_id = ?
       AND id = ?
       AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, normalizedConnectionId],
  )
  const row = firstRow(result)
  return row ? normalizeConnectionRow(row) : null
}

export async function findInvoiceCarrierConnectionByProviderRef(ledgerId, provider, authMode, providerConnectionId) {
  assertLedgerId(ledgerId)
  const normalizedProvider = normalizeText(provider)
  const normalizedAuthMode = normalizeAuthMode(authMode)
  const normalizedProviderConnectionId = normalizeText(providerConnectionId)
  if (!normalizedProvider || !normalizedProviderConnectionId) return null
  const result = await dependencies.query(
    `SELECT ledger_id, id, provider, auth_mode, provider_connection_id, status, user_label,
            last_sync_at, last_sync_status, last_error, sync_filter_json, carrier_options_json,
            created_at, updated_at, deleted_at
     FROM invoice_carrier_connections
     WHERE ledger_id = ?
       AND provider = ?
       AND auth_mode = ?
       AND provider_connection_id = ?
       AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, normalizedProvider, normalizedAuthMode, normalizedProviderConnectionId],
  )
  const row = firstRow(result)
  return row ? normalizeConnectionRow(row) : null
}

export async function upsertInvoiceCarrierConnection(ledgerId, input = {}) {
  assertLedgerId(ledgerId)
  const provider = normalizeText(input.provider)
  const providerConnectionId = normalizeText(input.providerConnectionId)
  if (!provider || !providerConnectionId) {
    throw new Error('provider and providerConnectionId are required')
  }

  const authMode = normalizeAuthMode(input.authMode)
  const existing = await findInvoiceCarrierConnectionByProviderRef(ledgerId, provider, authMode, providerConnectionId)
  const id = normalizeText(input.id || existing?.id) || dependencies.createId('iconn')
  const status = normalizeConnectionStatus(input.status ?? existing?.status)
  const now = dependencies.nowIso()

  await dependencies.run(
    `INSERT INTO invoice_carrier_connections (
      ledger_id, id, provider, auth_mode, provider_connection_id, status, user_label,
      last_sync_at, last_sync_status, last_error, sync_filter_json, carrier_options_json,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(ledger_id, id)
    DO UPDATE SET
      provider = excluded.provider,
      auth_mode = excluded.auth_mode,
      provider_connection_id = excluded.provider_connection_id,
      status = excluded.status,
      user_label = excluded.user_label,
      last_sync_at = excluded.last_sync_at,
      last_sync_status = excluded.last_sync_status,
      last_error = excluded.last_error,
      sync_filter_json = excluded.sync_filter_json,
      carrier_options_json = excluded.carrier_options_json,
      updated_at = excluded.updated_at,
      deleted_at = NULL;`,
    [
      ledgerId,
      id,
      provider,
      authMode,
      providerConnectionId,
      status,
      normalizeText(input.userLabel ?? existing?.user_label) || null,
      normalizeText(input.lastSyncAt ?? existing?.last_sync_at) || null,
      normalizeSyncStatus(input.lastSyncStatus ?? existing?.last_sync_status),
      normalizeText(input.lastError ?? existing?.last_error) || null,
      JSON.stringify(input.syncFilter ?? existing?.sync_filter ?? {}),
      JSON.stringify(normalizeCarrierOptions(input.carrierOptions ?? existing?.carrier_options ?? [])),
      existing?.created_at || now,
      now,
    ],
  )

  return findInvoiceCarrierConnectionById(ledgerId, id)
}

export async function updateInvoiceCarrierConnection(ledgerId, connectionId, patch = {}) {
  assertLedgerId(ledgerId)
  const existing = await findInvoiceCarrierConnectionById(ledgerId, connectionId)
  if (!existing) throw new Error('找不到發票載具連線')

  await dependencies.run(
    `UPDATE invoice_carrier_connections
     SET status = ?,
         user_label = ?,
         last_sync_at = ?,
         last_sync_status = ?,
         last_error = ?,
         sync_filter_json = ?,
         carrier_options_json = ?,
         updated_at = ?,
         deleted_at = ?
     WHERE ledger_id = ? AND id = ?;`,
    [
      normalizeConnectionStatus(patch.status ?? existing.status),
      normalizeText(patch.userLabel ?? existing.user_label) || null,
      normalizeText(patch.lastSyncAt ?? existing.last_sync_at) || null,
      normalizeSyncStatus(patch.lastSyncStatus ?? existing.last_sync_status),
      normalizeText(patch.lastError ?? existing.last_error) || null,
      JSON.stringify(patch.syncFilter ?? existing.sync_filter ?? {}),
      JSON.stringify(normalizeCarrierOptions(patch.carrierOptions ?? existing.carrier_options ?? [])),
      dependencies.nowIso(),
      patch.deletedAt === undefined ? (existing.deleted_at || null) : (normalizeText(patch.deletedAt) || null),
      ledgerId,
      connectionId,
    ],
  )

  return findInvoiceCarrierConnectionById(ledgerId, connectionId)
}

export async function listInvoiceCarrierInvoices(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const values = [ledgerId]
  let whereSql = 'WHERE ici.ledger_id = ? AND ici.deleted_at IS NULL'

  const normalizedConnectionId = normalizeText(options.connectionId)
  if (normalizedConnectionId) {
    whereSql += ' AND ici.connection_id = ?'
    values.push(normalizedConnectionId)
  }

  const result = await dependencies.query(
    `SELECT ici.ledger_id, ici.id, ici.connection_id, ici.provider_invoice_key, ici.invoice_number,
            ici.invoice_date, ici.amount_minor, ici.seller_name, ici.carrier_label, ici.buyer_ban,
            ici.invoice_status, ici.is_viewed, ici.raw_json, ici.first_seen_at, ici.last_seen_at,
            ici.created_at, ici.updated_at, ici.deleted_at,
            ic.provider, ic.auth_mode, ic.user_label AS connection_user_label
     FROM invoice_carrier_invoices ici
     INNER JOIN invoice_carrier_connections ic
       ON ic.ledger_id = ici.ledger_id
      AND ic.id = ici.connection_id
      AND ic.deleted_at IS NULL
     ${whereSql}
     ORDER BY ici.invoice_date DESC, ici.updated_at DESC, ici.created_at DESC;`,
    values,
  )

  return rowsOf(result).map(normalizeInvoiceRow)
}

export async function upsertInvoiceCarrierInvoices(ledgerId, connectionId, rows = []) {
  assertLedgerId(ledgerId)
  const normalizedConnectionId = normalizeText(connectionId)
  if (!normalizedConnectionId || !Array.isArray(rows) || !rows.length) {
    return { upsertedCount: 0 }
  }

  const now = dependencies.nowIso()
  for (const row of rows) {
    const providerInvoiceKey = normalizeText(row.providerInvoiceKey)
    const invoiceNumber = normalizeText(row.invoiceNumber)
    const invoiceDate = normalizeDateInput(row.invoiceDate)
    if (!providerInvoiceKey || !invoiceNumber || !invoiceDate) continue
    const amountMinor = Math.round(Number(row.amountMinor ?? 0) || 0)
    const existingResult = await dependencies.query(
      `SELECT id, first_seen_at
       FROM invoice_carrier_invoices
       WHERE ledger_id = ?
         AND connection_id = ?
         AND provider_invoice_key = ?
         AND deleted_at IS NULL
       LIMIT 1;`,
      [ledgerId, normalizedConnectionId, providerInvoiceKey],
    )
    const existing = firstRow(existingResult)
    const id = normalizeText(existing?.id) || dependencies.createId('iinv')
    const firstSeenAt = normalizeText(existing?.first_seen_at) || normalizeText(row.firstSeenAt) || now

    await dependencies.run(
      `INSERT INTO invoice_carrier_invoices (
        ledger_id, id, connection_id, provider_invoice_key, invoice_number, invoice_date, amount_minor,
        seller_name, carrier_label, buyer_ban, invoice_status, is_viewed, raw_json,
        first_seen_at, last_seen_at, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(ledger_id, connection_id, provider_invoice_key)
      DO UPDATE SET
        invoice_number = excluded.invoice_number,
        invoice_date = excluded.invoice_date,
        amount_minor = excluded.amount_minor,
        seller_name = excluded.seller_name,
        carrier_label = excluded.carrier_label,
        buyer_ban = excluded.buyer_ban,
        invoice_status = excluded.invoice_status,
        raw_json = excluded.raw_json,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at,
        deleted_at = NULL;`,
      [
        ledgerId,
        id,
        normalizedConnectionId,
        providerInvoiceKey,
        invoiceNumber,
        invoiceDate,
        amountMinor,
        normalizeText(row.sellerName) || null,
        normalizeText(row.carrierLabel) || null,
        normalizeText(row.buyerBan) || null,
        normalizeInvoiceStatus(row.invoiceStatus),
        Number(row.isViewed ?? 0) === 1 ? 1 : 0,
        JSON.stringify(row.raw ?? row.rawJson ?? {}),
        firstSeenAt,
        normalizeText(row.lastSeenAt) || now,
        existing ? (normalizeText(row.createdAt) || existing.created_at || now) : (normalizeText(row.createdAt) || now),
        now,
      ],
    )
  }

  return { upsertedCount: rows.length }
}

export async function markInvoiceCarrierInvoicesViewed(ledgerId, invoiceIds = [], isViewed = true) {
  assertLedgerId(ledgerId)
  const normalizedIds = Array.isArray(invoiceIds)
    ? invoiceIds.map((item) => normalizeText(item)).filter(Boolean)
    : []
  if (!normalizedIds.length) return { updatedCount: 0 }
  const placeholders = normalizedIds.map(() => '?').join(', ')
  await dependencies.run(
    `UPDATE invoice_carrier_invoices
     SET is_viewed = ?,
         updated_at = ?
     WHERE ledger_id = ?
       AND id IN (${placeholders})
       AND deleted_at IS NULL;`,
    [
      isViewed ? 1 : 0,
      dependencies.nowIso(),
      ledgerId,
      ...normalizedIds,
    ],
  )
  return { updatedCount: normalizedIds.length }
}

export async function clearInvoiceCarrierMirrorDataByConnection(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  const normalizedConnectionId = normalizeText(connectionId)
  if (!normalizedConnectionId) return
  await dependencies.run(
    'DELETE FROM invoice_carrier_invoices WHERE ledger_id = ? AND connection_id = ?;',
    [ledgerId, normalizedConnectionId],
  )
}
