import { nowIso } from '../utils/id.js'
import {
  buildInvoiceCarrierCredentialSettingKey,
  createInvoiceCarrierError,
  formatInvoiceCarrierErrorForStorage,
  getInvoiceCarrierErrorCode,
  isInvoiceCarrierReauthError,
  normalizeCarrierOptions,
  normalizeInvoiceCarrierCredentialState,
  normalizeText,
  parseInvoiceDateText,
  shouldRewriteInvoiceCarrierCredentialState,
} from '../../services/invoice-carrier/shared.js'

async function defaultAddTransaction(...args) {
  const mod = await import('../repositories/transaction.repo.js')
  return mod.addTransaction(...args)
}

async function defaultAddInvoiceCarrierConnection(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.addInvoiceCarrierConnection(...args)
}

async function defaultDeleteEncryptedSetting(...args) {
  const mod = await import('../../ui/services/secure-setting.service.js')
  return mod.deleteEncryptedSetting(...args)
}

async function defaultDeleteInvoiceCarrierConnection(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.deleteInvoiceCarrierConnection(...args)
}

async function defaultFindInvoiceCarrierConnectionById(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.findInvoiceCarrierConnectionById(...args)
}

async function defaultFindInvoiceCarrierConnectionByMobilePhone(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.findInvoiceCarrierConnectionByMobilePhone(...args)
}

async function defaultFindInvoiceCarrierConnectionByProviderRef(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.findInvoiceCarrierConnectionByProviderRef(...args)
}

async function defaultFindInvoiceCarrierInvoiceById(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.findInvoiceCarrierInvoiceById(...args)
}

async function defaultGetEncryptedSetting(...args) {
  const mod = await import('../../ui/services/secure-setting.service.js')
  return mod.getEncryptedSetting(...args)
}

async function defaultListInvoiceCarrierConnections(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.listInvoiceCarrierConnections(...args)
}

async function defaultListInvoiceCarrierInvoices(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.listInvoiceCarrierInvoices(...args)
}

async function defaultMarkInvoiceCarrierInvoiceImported(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.markInvoiceCarrierInvoiceImported(...args)
}

async function defaultSetEncryptedSetting(...args) {
  const mod = await import('../../ui/services/secure-setting.service.js')
  return mod.setEncryptedSetting(...args)
}

async function defaultSyncInvoiceCarrierData(...args) {
  const mod = await import('../../services/invoice-carrier/backend.js')
  return mod.syncInvoiceCarrierData(...args)
}

async function defaultUpdateInvoiceCarrierConnection(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.updateInvoiceCarrierConnection(...args)
}

async function defaultUpdateInvoiceCarrierConnectionSyncStatus(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.updateInvoiceCarrierConnectionSyncStatus(...args)
}

async function defaultUpsertManyInvoiceCarrierInvoices(...args) {
  const mod = await import('../repositories/invoice-carrier.repo.js')
  return mod.upsertManyInvoiceCarrierInvoices(...args)
}

const defaultDependencies = {
  addTransaction: defaultAddTransaction,
  addInvoiceCarrierConnection: defaultAddInvoiceCarrierConnection,
  deleteEncryptedSetting: defaultDeleteEncryptedSetting,
  deleteInvoiceCarrierConnection: defaultDeleteInvoiceCarrierConnection,
  findInvoiceCarrierConnectionById: defaultFindInvoiceCarrierConnectionById,
  findInvoiceCarrierConnectionByMobilePhone: defaultFindInvoiceCarrierConnectionByMobilePhone,
  findInvoiceCarrierConnectionByProviderRef: defaultFindInvoiceCarrierConnectionByProviderRef,
  findInvoiceCarrierInvoiceById: defaultFindInvoiceCarrierInvoiceById,
  getEncryptedSetting: defaultGetEncryptedSetting,
  listInvoiceCarrierConnections: defaultListInvoiceCarrierConnections,
  listInvoiceCarrierInvoices: defaultListInvoiceCarrierInvoices,
  markInvoiceCarrierInvoiceImported: defaultMarkInvoiceCarrierInvoiceImported,
  setEncryptedSetting: defaultSetEncryptedSetting,
  syncInvoiceCarrierData: defaultSyncInvoiceCarrierData,
  updateInvoiceCarrierConnection: defaultUpdateInvoiceCarrierConnection,
  updateInvoiceCarrierConnectionSyncStatus: defaultUpdateInvoiceCarrierConnectionSyncStatus,
  upsertManyInvoiceCarrierInvoices: defaultUpsertManyInvoiceCarrierInvoices,
}

const dependencies = { ...defaultDependencies }

export function setInvoiceCarrierServiceDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export function resetInvoiceCarrierServiceDependenciesForTest() {
  for (const key of Object.keys(dependencies)) {
    if (!(key in defaultDependencies)) {
      delete dependencies[key]
    }
  }
  Object.assign(dependencies, defaultDependencies)
}

function assertLedgerId(ledgerId) {
  if (!ledgerId) throw new Error('ledgerId is required')
}

function buildInvoiceOccurredAt(invoiceDate) {
  const normalizedDate = parseInvoiceDateText(invoiceDate)
  if (!normalizedDate) return nowIso()
  return new Date(`${normalizedDate}T12:00:00+08:00`).toISOString()
}

function resolveInvoiceCarrierConnectionStatusForError(error) {
  const code = getInvoiceCarrierErrorCode(error)
  if (isInvoiceCarrierReauthError(error)) return 'reauth_required'
  if (code === 'invoice_carrier_automation_blocked') return 'automation_blocked'
  return 'error'
}

async function loadSavedCredentialState(connection, fallbackLedgerId = '') {
  const settingsLedgerId = normalizeText(connection?.settings_ledger_id) || normalizeText(fallbackLedgerId)
  if (!settingsLedgerId) return { settingsLedgerId: '', value: null }

  const key = buildInvoiceCarrierCredentialSettingKey(connection?.id)
  const raw = await dependencies.getEncryptedSetting(settingsLedgerId, key)
  const sanitized = normalizeInvoiceCarrierCredentialState(raw)

  if (shouldRewriteInvoiceCarrierCredentialState(raw) && sanitized) {
    await dependencies.setEncryptedSetting(settingsLedgerId, key, sanitized)
  }

  return {
    settingsLedgerId,
    value: sanitized ?? raw,
  }
}

async function saveCredentialState(connectionId, settingsLedgerId, credentialState) {
  const normalizedLedgerId = normalizeText(settingsLedgerId)
  const sanitized = normalizeInvoiceCarrierCredentialState(credentialState)
  if (!normalizedLedgerId || !sanitized) return null
  const key = buildInvoiceCarrierCredentialSettingKey(connectionId)
  await dependencies.setEncryptedSetting(normalizedLedgerId, key, sanitized)
  return sanitized
}

async function deleteCredentialState(connection) {
  const settingsLedgerId = normalizeText(connection?.settings_ledger_id)
  if (!settingsLedgerId || !connection?.id) return
  const key = buildInvoiceCarrierCredentialSettingKey(connection.id)
  await dependencies.deleteEncryptedSetting(settingsLedgerId, key)
}

async function persistConnectionAuth({
  connectionId = '',
  settingsLedgerId,
  input = {},
  credentialState = null,
}) {
  assertLedgerId(settingsLedgerId)

  const mobilePhone = normalizeText(input?.mobile_phone || input?.mobilePhone)
  if (!mobilePhone) throw new Error('mobilePhone is required')

  const providerConnectionId = normalizeText(input?.provider_connection_id || input?.providerConnectionId)
  const carrierOptions = normalizeCarrierOptions(input?.carrier_options || input?.carrierOptions)
  const userLabel = normalizeText(input?.user_label || input?.userLabel) || `電子發票 ${mobilePhone}`

  let connection = null
  if (connectionId) {
    connection = await dependencies.updateInvoiceCarrierConnection(connectionId, {
      settings_ledger_id: settingsLedgerId,
      mobile_phone: mobilePhone,
      provider_connection_id: providerConnectionId || connectionId,
      user_label: userLabel,
      carrier_options: carrierOptions,
      status: 'active',
      last_sync_status: 'idle',
      last_error: '',
    })
  } else {
    const existing = providerConnectionId
      ? await dependencies.findInvoiceCarrierConnectionByProviderRef(providerConnectionId)
      : await dependencies.findInvoiceCarrierConnectionByMobilePhone(mobilePhone)

    if (existing && existing.status !== 'inactive') {
      throw new Error('Connection with this mobile phone already exists')
    }

    if (existing?.id) {
      connection = await dependencies.updateInvoiceCarrierConnection(existing.id, {
        settings_ledger_id: settingsLedgerId,
        mobile_phone: mobilePhone,
        provider_connection_id: providerConnectionId || existing.provider_connection_id || existing.id,
        user_label: userLabel,
        carrier_options: carrierOptions,
        status: 'active',
        last_sync_status: 'idle',
        last_error: '',
      })
    } else {
      connection = await dependencies.addInvoiceCarrierConnection({
        settings_ledger_id: settingsLedgerId,
        mobile_phone: mobilePhone,
        provider_connection_id: providerConnectionId,
        user_label: userLabel,
        carrier_options: carrierOptions,
        status: 'active',
      })
    }
  }

  await saveCredentialState(connection.id, settingsLedgerId, credentialState)
  return connection
}

/**
 * 同步電子發票載具資料
 * @param {string} connectionId - 連線 ID
 * @param {string} fallbackLedgerId - 發起同步時的帳本 ID
 * @param {object} opts - 同步選項 { startDate, endDate, carrierCode }
 * @returns {Promise<object>}
 */
export async function syncInvoiceCarrierConnection(connectionId, fallbackLedgerId = '', opts = {}) {
  if (!connectionId) throw new Error('connectionId is required')

  const connection = await dependencies.findInvoiceCarrierConnectionById(connectionId)
  if (!connection) {
    throw new Error('Connection not found')
  }
  if (String(connection.status ?? '').toLowerCase() === 'inactive') {
    throw new Error('Connection is inactive')
  }

  const { settingsLedgerId, value: savedCredentialState } = await loadSavedCredentialState(connection, fallbackLedgerId)
  const credentialState = normalizeInvoiceCarrierCredentialState(savedCredentialState)

  if (!credentialState?.mobilePhone || !credentialState?.password) {
    const error = createInvoiceCarrierError('invoice_carrier_reauth_required', '載具憑證遺失，請重新驗證')
    await dependencies.updateInvoiceCarrierConnectionSyncStatus(connectionId, {
      status: 'reauth_required',
      last_sync_status: 'error',
      last_error: formatInvoiceCarrierErrorForStorage(error),
    })
    throw error
  }

  try {
    await dependencies.updateInvoiceCarrierConnectionSyncStatus(connectionId, {
      status: 'syncing',
      last_sync_status: 'idle',
    })

    const syncResult = await dependencies.syncInvoiceCarrierData({
      connection_id: connection.provider_connection_id || connection.id,
      start_date: opts.startDate,
      end_date: opts.endDate,
      carrier_code: opts.carrierCode,
      storage_state: credentialState.storageState,
      credentials: {
        mobile_phone: credentialState.mobilePhone,
        password: credentialState.password,
      },
    })

    if (!Array.isArray(syncResult?.invoices)) {
      throw new Error('Invalid sync result: missing invoices')
    }

    const syncSummary = await dependencies.upsertManyInvoiceCarrierInvoices(connectionId, syncResult.invoices)
    const nextCarrierOptions = normalizeCarrierOptions(
      syncResult.available_carriers
      || syncResult.carrier_options
      || connection.carrier_options
      || credentialState.carrierOptions,
    )

    const nextStorageState = normalizeInvoiceCarrierCredentialState({
      ...credentialState,
      storageState: syncResult.storage_state || syncResult.next_storage_state || credentialState.storageState,
      carrierOptions: nextCarrierOptions,
      updatedAt: new Date().toISOString(),
    })

    if (nextStorageState && settingsLedgerId) {
      await saveCredentialState(connectionId, settingsLedgerId, nextStorageState)
    }

    const updatedConnection = await dependencies.updateInvoiceCarrierConnectionSyncStatus(connectionId, {
      status: 'active',
      last_sync_at: normalizeText(syncResult.sync_time) || new Date().toISOString(),
      last_sync_status: 'ok',
      last_error: '',
      carrier_options: nextCarrierOptions,
    })

    return {
      invoices: await dependencies.listInvoiceCarrierInvoices(connectionId, { limit: 500 }),
      addedCount: syncSummary.addedCount,
      updatedCount: syncSummary.updatedCount,
      unchangedCount: syncSummary.unchangedCount,
      connection: updatedConnection,
      carrierOptions: nextCarrierOptions,
      syncStatus: 'ok',
    }
  } catch (error) {
    const nextStatus = resolveInvoiceCarrierConnectionStatusForError(error)
    await dependencies.updateInvoiceCarrierConnectionSyncStatus(connectionId, {
      status: nextStatus,
      last_sync_status: 'error',
      last_error: formatInvoiceCarrierErrorForStorage(error),
    })
    throw error
  }
}

/**
 * 批量匯入電子發票為交易
 * @param {string} connectionId - 連線 ID
 * @param {string[]} invoiceIds - 欲匯入的發票 ID 陣列
 * @param {string} ledgerId - 帳本 ID
 * @param {string} targetAccountId - 目標帳戶 ID
 * @param {string} categoryId - 分類 ID（可選）
 * @returns {Promise<object[]>}
 */
export async function importInvoicesAsTransactions(
  connectionId,
  invoiceIds,
  ledgerId,
  targetAccountId,
  categoryId = null,
) {
  if (!connectionId) throw new Error('connectionId is required')
  if (!Array.isArray(invoiceIds) || !invoiceIds.length) throw new Error('invoiceIds must be non-empty array')
  assertLedgerId(ledgerId)
  if (!targetAccountId) throw new Error('targetAccountId is required')

  const createdTransactions = []

  for (const invoiceId of invoiceIds) {
    const invoice = await dependencies.findInvoiceCarrierInvoiceById(invoiceId)
    if (!invoice || invoice.connection_id !== connectionId) {
      continue
    }
    if (invoice.imported_transaction_id) {
      continue
    }

    const transactionId = await dependencies.addTransaction(ledgerId, {
      type: 'expense',
      accountId: targetAccountId,
      categoryId,
      amountMinor: Math.abs(Math.round(Number(invoice.amount) || 0)),
      occurredAt: buildInvoiceOccurredAt(invoice.invoice_date),
      note: `電子發票 ${invoice.invoice_number}${invoice.seller_name ? ` - ${invoice.seller_name}` : ''}`,
      originType: 'invoice_import',
      externalRefId: `invoice:${connectionId}:${invoice.id}`,
      includeInBudget: true,
      includeInAnalysis: true,
      })

    await dependencies.markInvoiceCarrierInvoiceImported(invoiceId, transactionId)
    createdTransactions.push({
      invoiceId,
      transactionId,
    })
  }

  return createdTransactions
}

export async function createInvoiceCarrierConnection(settingsLedgerId, input = {}, credentialState = null) {
  return persistConnectionAuth({
    settingsLedgerId,
    input,
    credentialState,
  })
}

export async function reconnectInvoiceCarrierConnection(connectionId, settingsLedgerId, input = {}, credentialState = null) {
  if (!connectionId) throw new Error('connectionId is required')
  return persistConnectionAuth({
    connectionId,
    settingsLedgerId,
    input,
    credentialState,
  })
}

export async function deleteInvoiceCarrierConnection(connectionId) {
  if (!connectionId) throw new Error('connectionId is required')
  const connection = await dependencies.findInvoiceCarrierConnectionById(connectionId)
  if (connection) {
    await deleteCredentialState(connection)
  }
  return dependencies.deleteInvoiceCarrierConnection(connectionId)
}

export async function listInvoiceCarrierConnections() {
  return dependencies.listInvoiceCarrierConnections()
}

export async function getInvoiceCarrierConnection(connectionId) {
  if (!connectionId) return null
  return dependencies.findInvoiceCarrierConnectionById(connectionId)
}

export async function listInvoiceCarrierInvoices(connectionId, opts = {}) {
  if (!connectionId) throw new Error('connectionId is required')
  return dependencies.listInvoiceCarrierInvoices(connectionId, opts)
}
