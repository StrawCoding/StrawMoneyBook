import {
  createEinvoiceLinkSession,
  disconnectEinvoiceAuth,
  exchangeEinvoiceAuth,
  listEinvoiceCarrierProviders,
  syncEinvoiceInvoices,
} from '../../services/einvoice-carrier/backend.js'
import { buildDefaultEinvoiceSyncFilter, normalizeEinvoiceSyncFilter } from '../../services/einvoice-carrier/shared.js'

function assertLedgerId(ledgerId) {
  if (!ledgerId) throw new Error('缺少帳本 ID')
}

async function defaultClearInvoiceCarrierMirrorDataByConnection(...args) {
  const mod = await import('../../core/repositories/einvoice-carrier.repo.js')
  return mod.clearInvoiceCarrierMirrorDataByConnection(...args)
}

async function defaultDeleteEncryptedSetting(...args) {
  const mod = await import('./secure-setting.service.js')
  return mod.deleteEncryptedSetting(...args)
}

async function defaultFindInvoiceCarrierConnectionById(...args) {
  const mod = await import('../../core/repositories/einvoice-carrier.repo.js')
  return mod.findInvoiceCarrierConnectionById(...args)
}

async function defaultGetEncryptedSetting(...args) {
  const mod = await import('./secure-setting.service.js')
  return mod.getEncryptedSetting(...args)
}

async function defaultListInvoiceCarrierConnections(...args) {
  const mod = await import('../../core/repositories/einvoice-carrier.repo.js')
  return mod.listInvoiceCarrierConnections(...args)
}

async function defaultListInvoiceCarrierInvoices(...args) {
  const mod = await import('../../core/repositories/einvoice-carrier.repo.js')
  return mod.listInvoiceCarrierInvoices(...args)
}

async function defaultMarkInvoiceCarrierInvoicesViewed(...args) {
  const mod = await import('../../core/repositories/einvoice-carrier.repo.js')
  return mod.markInvoiceCarrierInvoicesViewed(...args)
}

async function defaultSetEncryptedSetting(...args) {
  const mod = await import('./secure-setting.service.js')
  return mod.setEncryptedSetting(...args)
}

async function defaultUpdateInvoiceCarrierConnection(...args) {
  const mod = await import('../../core/repositories/einvoice-carrier.repo.js')
  return mod.updateInvoiceCarrierConnection(...args)
}

async function defaultUpsertInvoiceCarrierConnection(...args) {
  const mod = await import('../../core/repositories/einvoice-carrier.repo.js')
  return mod.upsertInvoiceCarrierConnection(...args)
}

async function defaultUpsertInvoiceCarrierInvoices(...args) {
  const mod = await import('../../core/repositories/einvoice-carrier.repo.js')
  return mod.upsertInvoiceCarrierInvoices(...args)
}

const defaultDependencies = {
  clearInvoiceCarrierMirrorDataByConnection: defaultClearInvoiceCarrierMirrorDataByConnection,
  createEinvoiceLinkSession,
  deleteEncryptedSetting: defaultDeleteEncryptedSetting,
  disconnectEinvoiceAuth,
  exchangeEinvoiceAuth,
  findInvoiceCarrierConnectionById: defaultFindInvoiceCarrierConnectionById,
  getEncryptedSetting: defaultGetEncryptedSetting,
  listInvoiceCarrierConnections: defaultListInvoiceCarrierConnections,
  listInvoiceCarrierInvoices: defaultListInvoiceCarrierInvoices,
  listEinvoiceCarrierProviders,
  markInvoiceCarrierInvoicesViewed: defaultMarkInvoiceCarrierInvoicesViewed,
  setEncryptedSetting: defaultSetEncryptedSetting,
  syncEinvoiceInvoices,
  updateInvoiceCarrierConnection: defaultUpdateInvoiceCarrierConnection,
  upsertInvoiceCarrierConnection: defaultUpsertInvoiceCarrierConnection,
  upsertInvoiceCarrierInvoices: defaultUpsertInvoiceCarrierInvoices,
}

const dependencies = { ...defaultDependencies }

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeProvider(provider) {
  return normalizeText(provider || 'tw_einvoice_mobile_barcode').toLowerCase()
}

function normalizeAuthMode(authMode) {
  return normalizeText(authMode || 'mobile_barcode').toLowerCase() || 'mobile_barcode'
}

function buildCredentialSettingKey(connectionId) {
  return `einvoice.credentials.${normalizeText(connectionId)}`
}

function buildSessionSettingKey(connectionId) {
  return `einvoice.session.${normalizeText(connectionId)}`
}

function sanitizeCredentialState(value) {
  if (!value || typeof value !== 'object') return null
  return {
    provider: normalizeProvider(value.provider),
    authMode: normalizeAuthMode(value.authMode),
    mobilePhone: normalizeText(value.mobilePhone),
    password: String(value.password ?? ''),
    updatedAt: normalizeText(value.updatedAt) || new Date().toISOString(),
  }
}

function sanitizeSessionState(value) {
  if (!value || typeof value !== 'object') return null
  return {
    provider: normalizeProvider(value.provider),
    authMode: normalizeAuthMode(value.authMode),
    sessionToken: normalizeText(value.sessionToken || value.accessTokenRef),
    accessTokenRef: normalizeText(value.accessTokenRef || value.sessionToken),
    updatedAt: normalizeText(value.updatedAt) || new Date().toISOString(),
  }
}

function parseStoredConnection(connection) {
  if (!connection || typeof connection !== 'object') return null
  return {
    ...connection,
    sync_filter: connection.sync_filter && typeof connection.sync_filter === 'object'
      ? connection.sync_filter
      : {},
    carrier_options: Array.isArray(connection.carrier_options) ? connection.carrier_options : [],
  }
}

function normalizeInvoiceViewRow(row) {
  const source = row && typeof row === 'object' ? row : {}
  return {
    ...source,
    invoice_status: normalizeText(source.invoice_status || 'all') || 'all',
    is_viewed: Number(source.is_viewed ?? 0) === 1 ? 1 : 0,
    amount_minor: Math.round(Number(source.amount_minor ?? 0) || 0),
  }
}

async function hydrateConnectionSummary(ledgerId, connection) {
  const invoices = await dependencies.listInvoiceCarrierInvoices(ledgerId, { connectionId: connection.id })
  const totalInvoiceCount = invoices.length
  const unviewedInvoiceCount = invoices.filter((item) => Number(item.is_viewed ?? 0) !== 1).length
  return {
    ...connection,
    totalInvoiceCount,
    unviewedInvoiceCount,
  }
}

export function resetEinvoiceCarrierServiceDependenciesForTest() {
  Object.assign(dependencies, defaultDependencies)
}

export function setEinvoiceCarrierServiceDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export function getDefaultEinvoiceSyncFilter() {
  return buildDefaultEinvoiceSyncFilter()
}

export function getEinvoiceCarrierProviderOptions() {
  return dependencies.listEinvoiceCarrierProviders()
}

export async function createInvoiceCarrierLinkSession(options = {}) {
  const provider = normalizeProvider(options.provider)
  return dependencies.createEinvoiceLinkSession({
    provider,
    auth_mode: normalizeAuthMode(options.authMode),
    session_id: normalizeText(options.sessionId) || undefined,
    refresh_captcha: Boolean(options.refreshCaptcha),
  })
}

export async function getInvoiceCarrierCredentialDraft(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  const normalizedConnectionId = normalizeText(connectionId)
  if (!normalizedConnectionId) return null
  const saved = await dependencies.getEncryptedSetting(ledgerId, buildCredentialSettingKey(normalizedConnectionId))
  return sanitizeCredentialState(saved)
}

export async function getInvoiceCarrierState(ledgerId) {
  assertLedgerId(ledgerId)
  const connections = await dependencies.listInvoiceCarrierConnections(ledgerId)
  const summaries = await Promise.all(connections.map((connection) => hydrateConnectionSummary(ledgerId, parseStoredConnection(connection))))
  return summaries
}

export async function getInvoiceCarrierConnectionDetail(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  const connection = await dependencies.findInvoiceCarrierConnectionById(ledgerId, connectionId)
  if (!connection) throw new Error('找不到發票載具連線')
  return hydrateConnectionSummary(ledgerId, parseStoredConnection(connection))
}

export async function connectInvoiceCarrier(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const provider = normalizeProvider(options.provider)
  const authMode = normalizeAuthMode(options.authMode)
  const mobilePhone = normalizeText(options.mobilePhone)
  const password = String(options.password ?? '')
  const captchaCode = normalizeText(options.captchaCode)
  const normalizedFilter = normalizeEinvoiceSyncFilter(options.filter, getDefaultEinvoiceSyncFilter())

  const exchanged = await dependencies.exchangeEinvoiceAuth({
    provider,
    auth_mode: authMode,
    session_id: normalizeText(options.sessionId) || undefined,
    mobile_phone: mobilePhone,
    password,
    captcha_code: captchaCode,
  })

  const providerConnectionId = normalizeText(exchanged.provider_connection_id || mobilePhone)
  const connection = await dependencies.upsertInvoiceCarrierConnection(ledgerId, {
    provider,
    authMode,
    providerConnectionId,
    status: 'active',
    userLabel: normalizeText(exchanged.connection_name) || `手機條碼 ${providerConnectionId.slice(-4)}`,
    lastSyncStatus: 'idle',
    lastError: '',
    syncFilter: normalizedFilter,
    carrierOptions: Array.isArray(exchanged.carrier_options) ? exchanged.carrier_options : [],
  })

  await dependencies.setEncryptedSetting(ledgerId, buildCredentialSettingKey(connection.id), {
    provider,
    authMode,
    mobilePhone,
    password,
    updatedAt: new Date().toISOString(),
  })

  await dependencies.setEncryptedSetting(ledgerId, buildSessionSettingKey(connection.id), {
    provider,
    authMode,
    sessionToken: normalizeText(exchanged.session_token || exchanged.access_token_ref),
    accessTokenRef: normalizeText(exchanged.access_token_ref || exchanged.session_token),
    updatedAt: new Date().toISOString(),
  })

  await syncInvoiceCarrierNow(ledgerId, connection.id, { filter: normalizedFilter })
  return getInvoiceCarrierConnectionDetail(ledgerId, connection.id)
}

export async function syncInvoiceCarrierNow(ledgerId, connectionId, options = {}) {
  assertLedgerId(ledgerId)
  const connection = await dependencies.findInvoiceCarrierConnectionById(ledgerId, connectionId)
  if (!connection) throw new Error('找不到發票載具連線')
  if (normalizeText(connection.status).toLowerCase() === 'disabled') {
    throw new Error('此發票載具連線已停用')
  }

  const sessionState = sanitizeSessionState(
    await dependencies.getEncryptedSetting(ledgerId, buildSessionSettingKey(connectionId)),
  )
  const sessionToken = normalizeText(sessionState?.sessionToken || sessionState?.accessTokenRef)
  if (!sessionToken) {
    const error = new Error('電子發票登入 Session 已失效，請重新驗證')
    error.code = 'einvoice_session_expired'
    await dependencies.updateInvoiceCarrierConnection(ledgerId, connectionId, {
      status: 'reauth_required',
      lastSyncStatus: 'error',
      lastError: `${error.code}: ${error.message}`,
    })
    throw error
  }

  const syncFilter = normalizeEinvoiceSyncFilter(options.filter, connection.sync_filter || getDefaultEinvoiceSyncFilter())

  try {
    const syncRes = await dependencies.syncEinvoiceInvoices({
      provider: connection.provider,
      auth_mode: connection.auth_mode,
      connection_id: connection.id,
      provider_connection_id: connection.provider_connection_id,
      session_token: sessionToken,
      access_token_ref: sessionToken,
      filter: syncFilter,
    })

    const invoices = Array.isArray(syncRes.invoices) ? syncRes.invoices : []
    await dependencies.upsertInvoiceCarrierInvoices(
      ledgerId,
      connection.id,
      invoices.map((item) => ({
        providerInvoiceKey: normalizeText(item.providerInvoiceKey),
        invoiceNumber: normalizeText(item.invoiceNumber),
        invoiceDate: normalizeText(item.invoiceDate),
        amountMinor: Math.round(Number(item.amountMinor ?? 0) || 0),
        sellerName: normalizeText(item.sellerName),
        carrierLabel: normalizeText(item.carrierLabel),
        buyerBan: normalizeText(item.buyerBan),
        invoiceStatus: normalizeText(item.invoiceStatus || syncFilter.status) || 'all',
        raw: item.raw && typeof item.raw === 'object' ? item.raw : {},
      })),
    )

    const nextSessionToken = normalizeText(syncRes.session_token || syncRes.access_token_ref)
    if (nextSessionToken) {
      await dependencies.setEncryptedSetting(ledgerId, buildSessionSettingKey(connection.id), {
        provider: connection.provider,
        authMode: connection.auth_mode,
        sessionToken: nextSessionToken,
        accessTokenRef: nextSessionToken,
        updatedAt: new Date().toISOString(),
      })
    }

    await dependencies.updateInvoiceCarrierConnection(ledgerId, connection.id, {
      status: 'active',
      lastSyncAt: normalizeText(syncRes.sync_time) || new Date().toISOString(),
      lastSyncStatus: 'ok',
      lastError: '',
      syncFilter,
      carrierOptions: Array.isArray(syncRes.carrier_options) ? syncRes.carrier_options : connection.carrier_options,
    })

    return {
      syncedCount: invoices.length,
      syncTime: normalizeText(syncRes.sync_time) || new Date().toISOString(),
      filter: syncFilter,
    }
  } catch (error) {
    const code = normalizeText(error?.code)
    const message = normalizeText(error?.message ?? error)
    await dependencies.updateInvoiceCarrierConnection(ledgerId, connection.id, {
      status: code === 'einvoice_session_expired' ? 'reauth_required' : 'active',
      lastSyncStatus: 'error',
      lastError: `${code || 'einvoice_sync_failed'}: ${message}`,
      syncFilter,
    })
    throw error
  }
}

export async function listInvoiceCarrierMirrorInvoices(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const rows = await dependencies.listInvoiceCarrierInvoices(ledgerId, options)
  return rows.map(normalizeInvoiceViewRow)
}

export async function markInvoiceCarrierMirrorInvoicesViewed(ledgerId, invoiceIds = [], isViewed = true) {
  assertLedgerId(ledgerId)
  return dependencies.markInvoiceCarrierInvoicesViewed(ledgerId, invoiceIds, isViewed)
}

export async function disconnectInvoiceCarrier(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  const connection = await dependencies.findInvoiceCarrierConnectionById(ledgerId, connectionId)
  if (!connection) return { ok: true }

  const sessionState = sanitizeSessionState(
    await dependencies.getEncryptedSetting(ledgerId, buildSessionSettingKey(connectionId)),
  )

  try {
    await dependencies.disconnectEinvoiceAuth({
      provider: connection.provider,
      auth_mode: connection.auth_mode,
      provider_connection_id: connection.provider_connection_id,
      session_token: normalizeText(sessionState?.sessionToken || sessionState?.accessTokenRef),
      access_token_ref: normalizeText(sessionState?.accessTokenRef || sessionState?.sessionToken),
    })
  } catch {
    // Disconnect is best effort. Local cleanup still proceeds.
  }

  await dependencies.deleteEncryptedSetting(ledgerId, buildCredentialSettingKey(connection.id))
  await dependencies.deleteEncryptedSetting(ledgerId, buildSessionSettingKey(connection.id))
  await dependencies.clearInvoiceCarrierMirrorDataByConnection(ledgerId, connection.id)
  await dependencies.updateInvoiceCarrierConnection(ledgerId, connection.id, {
    status: 'disabled',
    deletedAt: new Date().toISOString(),
  })
  return { ok: true }
}
