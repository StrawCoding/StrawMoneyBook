import { Capacitor } from '@capacitor/core'
import { translateMessage } from '../../ui/services/i18n.service.js'
import {
  isBankSyncDebugEnabled,
  logBankSyncAction,
  resolveBankSyncDebugWebOpen,
} from '../../core/services/bank-sync-debug.service.js'
import {
  connectNativeBank,
  disconnectNativeBank,
  isNativeBankAutomationRuntimeSupported,
  syncNativeBank,
} from './native-automation.js'
import {
  isRegisteredBankProviderId,
  listRegisteredBankProviders,
} from './provider-registry.js'

const IMPORT_META_ENV = import.meta.env ?? {}
const PROD_DEFAULT_BANK_API_BASE = 'https://api.strawmb.com'
const EXPLICIT_BANK_API_BASE = String(IMPORT_META_ENV.VITE_BANK_SYNC_API_BASE_URL ?? '').trim()
const BANK_SYNC_CLIENT_SHARED_KEY = String(IMPORT_META_ENV.VITE_BANK_SYNC_CLIENT_SHARED_KEY ?? '').trim()
const BANK_SYNC_FEATURE_ENABLED = parseBooleanEnv(
  IMPORT_META_ENV.VITE_BANK_SYNC_FEATURE_ENABLED,
  false,
)
const BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS = parseBooleanEnv(
  IMPORT_META_ENV.VITE_BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS,
  false,
)
const t = (key, params, fallback) => translateMessage(key, params, fallback)

const PROVIDERS_FALLBACK = listRegisteredBankProviders()

function isLocalDevOrigin() {
  if (typeof window === 'undefined') return false
  const origin = String(window.location?.origin ?? '').trim()
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin)
}

function getBankApiBase() {
  if (EXPLICIT_BANK_API_BASE) return EXPLICIT_BANK_API_BASE
  if (Capacitor.getPlatform() !== 'web') return PROD_DEFAULT_BANK_API_BASE
  if (isLocalDevOrigin()) return ''
  if (IMPORT_META_ENV.PROD) return PROD_DEFAULT_BANK_API_BASE
  return ''
}

function parseBooleanEnv(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

function isNativeBankProvider(providerId) {
  return isRegisteredBankProviderId(providerId)
}

function shouldExposeProvider(providerId) {
  if (isRegisteredBankProviderId(providerId)) {
    return BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS
  }
  return false
}

function buildApiUrl(path) {
  const normalizedPath = String(path ?? '').trim()
  if (!normalizedPath.startsWith('/')) {
    throw new Error(`invalid bank api path: ${normalizedPath}`)
  }
  const bankApiBase = getBankApiBase()
  if (!bankApiBase) return normalizedPath
  return `${bankApiBase.replace(/\/$/, '')}${normalizedPath}`
}

function shouldRequireExplicitBankApiBase() {
  if (getBankApiBase()) return false
  if (isNativeBankAutomationRuntimeSupported()) return false
  return Capacitor.getPlatform() !== 'web'
}

function createMissingBankApiError() {
  const platform = Capacitor.getPlatform()
  let message
  if (platform === 'web') {
    message = t('bank_sync.error.api_unavailable_web')
  } else if (!isNativeBankAutomationRuntimeSupported()) {
    message = t('bank_sync.error.android_only')
  } else {
    message = t('bank_sync.error.api_unavailable_native')
  }
  const error = new Error(message)
  error.code = 'bank_sync_api_unavailable'
  return error
}

function createBankSyncDisabledError() {
  const error = new Error(t('bank_sync.error.feature_disabled', '銀行同步功能目前已暫時關閉'))
  error.code = 'bank_sync_feature_disabled'
  return error
}

function assertBankSyncFeatureEnabled() {
  if (BANK_SYNC_FEATURE_ENABLED) return
  throw createBankSyncDisabledError()
}

export function isBankSyncPlatformSupported() {
  if (isBankSyncDebugEnabled()) return true
  return isNativeBankAutomationRuntimeSupported() || Boolean(getBankApiBase())
}

export function isBankSyncNativeAutomationAvailable() {
  return BANK_SYNC_FEATURE_ENABLED
    && BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS
    && isNativeBankAutomationRuntimeSupported()
}

export function isBankSyncApiConfigured() {
  if (!BANK_SYNC_FEATURE_ENABLED) return false
  if (isBankSyncNativeAutomationAvailable()) return true
  if (isBankSyncDebugEnabled() && listBankProviders().length > 0) return true
  if (Boolean(getBankApiBase()) && listBankProviders().length > 0) return true
  return false
}

export function isBankSyncFeatureEnabled() {
  return BANK_SYNC_FEATURE_ENABLED
}

export function getBankSyncSupportMatrix() {
  const platform = Capacitor.getPlatform()
  const providers = listBankProviders()
  const debugEnabled = isBankSyncDebugEnabled()
  const platforms = debugEnabled ? ['android', 'web'] : ['android']
  return {
    featureEnabled: BANK_SYNC_FEATURE_ENABLED,
    platform,
    androidOnly: !debugEnabled,
    debugEnabled,
    webDebugOpen: resolveBankSyncDebugWebOpen({
      nativeRuntimeSupported: isNativeBankAutomationRuntimeSupported(),
      debugEnabled,
    }) && platform === 'web',
    nativeAutomationAvailable: isBankSyncNativeAutomationAvailable(),
    csvFallbackAvailable: true,
    supportedBanks: providers.map((item) => ({
      id: item.id,
      name: item.name,
      country: item.country,
      platforms,
    })),
    checkedAt: Date.now(),
  }
}

export function getBankSyncApiUnavailableMessage() {
  if (!BANK_SYNC_FEATURE_ENABLED) {
    return createBankSyncDisabledError().message
  }
  if (isBankSyncDebugEnabled()) {
    return t('bank_sync.debug.web_open_hint', '銀行同步修正期：網頁已開放操作，步驟會輸出到 Console。')
  }
  if (!isNativeBankAutomationRuntimeSupported()) {
    return t('bank_sync.error.android_only')
  }
  return createMissingBankApiError().message
}

function parseProviderListFromEnv() {
  const raw = String(IMPORT_META_ENV.VITE_BANK_SYNC_PROVIDERS_JSON ?? '').trim()
  if (!raw) return PROVIDERS_FALLBACK
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return PROVIDERS_FALLBACK
    const providers = parsed
      .map((item) => ({
        id: String(item?.id ?? '').trim(),
        name: String(item?.name ?? '').trim(),
        country: String(item?.country ?? '').trim().toUpperCase(),
      }))
      .filter((item) => item.id && item.name)
    return providers.length ? providers : PROVIDERS_FALLBACK
  } catch {
    return PROVIDERS_FALLBACK
  }
}

async function postJson(path, payload) {
  assertBankSyncFeatureEnabled()
  const providerId = String(payload?.providerId ?? payload?.provider ?? '').trim().toLowerCase()
  logBankSyncAction('backend.post', {
    path,
    providerId,
    nativeProvider: isNativeBankProvider(providerId),
  })

  if (isNativeBankProvider(providerId)) {
    const nativePayload = { ...payload, providerId, provider: providerId }
    if (path === '/api/bank/exchange') {
      return connectNativeBank(nativePayload)
    }
    if (path === '/api/bank/sync') {
      return syncNativeBank(nativePayload)
    }
    if (path === '/api/bank/disconnect') {
      return disconnectNativeBank(nativePayload)
    }
  }

  // Architecture B: remote scrape providers removed from default path (delete_dead).
  if (shouldRequireExplicitBankApiBase()) {
    throw createMissingBankApiError()
  }

  const headers = {
    'Content-Type': 'application/json',
  }
  if (BANK_SYNC_CLIENT_SHARED_KEY) {
    headers['X-Straw-Client-Key'] = BANK_SYNC_CLIENT_SHARED_KEY
  }

  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload ?? {}),
  })

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    if (response.status === 404 && !getBankApiBase() && path.startsWith('/api/bank/')) {
      throw createMissingBankApiError()
    }
    const message = String(data?.message ?? data?.error ?? text ?? '').trim()
    throw new Error(message || `HTTP ${response.status}`)
  }

  if (!data || typeof data !== 'object') {
    throw new Error(t('bank_sync.error.response_invalid'))
  }
  return data
}

export function listBankProviders() {
  if (!BANK_SYNC_FEATURE_ENABLED) return []
  return parseProviderListFromEnv().filter((item) => shouldExposeProvider(item.id))
}

export async function createBankLinkSession(payload = {}) {
  return postJson('/api/bank/link_session', payload)
}

export async function exchangeBankAuth(payload = {}) {
  return postJson('/api/bank/exchange', payload)
}

export async function syncBankTransactions(payload = {}) {
  return postJson('/api/bank/sync', payload)
}

export async function disconnectBankAuth(payload = {}) {
  return postJson('/api/bank/disconnect', payload)
}

export async function markImportedBankTransactions(payload = {}) {
  return postJson('/api/bank/mark_imported', payload)
}
