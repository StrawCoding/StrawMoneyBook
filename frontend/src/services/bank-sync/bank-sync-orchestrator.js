import { Capacitor } from '@capacitor/core'
import {
  connectNativeBank,
  disconnectNativeBank,
  isNativeBankAutomationRuntimeSupported,
  syncNativeBank,
} from './native-automation.js'
import { getBankProviderDefinition, isRegisteredBankProviderId } from './provider-registry.js'
import { normalizeText } from './shared.js'

export function resolveBankSyncBackend() {
  return isNativeBankAutomationRuntimeSupported() ? 'native' : 'unavailable'
}

export function isBankSyncBackendReady({ featureEnabled = false } = {}) {
  if (!featureEnabled) return false
  return isNativeBankAutomationRuntimeSupported()
}

function normalizeProviderPayload(payload = {}) {
  const providerId = normalizeText(payload?.providerId ?? payload?.provider).toLowerCase()
  return {
    ...payload,
    providerId,
    provider: providerId || payload?.provider,
  }
}

function assertRegisteredProvider(providerId) {
  if (!isRegisteredBankProviderId(providerId)) {
    const error = new Error('Unsupported bank provider')
    error.code = 'bank_provider_unsupported'
    throw error
  }
}

/**
 * Platform router: Architecture B uses Android WebView native Java only (no backend Playwright).
 */
export async function connectBankBackend(payload = {}) {
  const next = normalizeProviderPayload(payload)
  assertRegisteredProvider(next.providerId)
  if (resolveBankSyncBackend() !== 'native') {
    const error = new Error('目前僅支援 Android App 的本地銀行同步')
    error.code = 'bank_automation_android_only'
    throw error
  }
  return connectNativeBank(next)
}

export async function syncBankBackend(payload = {}) {
  const next = normalizeProviderPayload(payload)
  assertRegisteredProvider(next.providerId)
  if (resolveBankSyncBackend() !== 'native') {
    const error = new Error('目前僅支援 Android App 的本地銀行同步')
    error.code = 'bank_automation_android_only'
    throw error
  }
  const result = await syncNativeBank(next)
  return aggregatePartialSuccess(result, next.providerId)
}

export async function disconnectBankBackend(payload = {}) {
  const next = normalizeProviderPayload(payload)
  if (resolveBankSyncBackend() !== 'native') {
    return { ok: true, skipped: true }
  }
  if (!next.providerId || !isRegisteredBankProviderId(next.providerId)) {
    return disconnectNativeBank(next)
  }
  return disconnectNativeBank(next)
}

/**
 * Merge per-account sync outcomes into PARTIAL_SUCCESS when some accounts fail.
 */
export function aggregatePartialSuccess(result = {}, providerId = '') {
  const accounts = Array.isArray(result?.accounts) ? result.accounts : []
  const accountErrors = Array.isArray(result?.accountErrors) ? result.accountErrors : []
  const transactions = Array.isArray(result?.transactions) ? result.transactions : []
  const partial = Boolean(result?.partialSuccess)
    || accountErrors.length > 0
    || String(result?.status ?? '').toLowerCase() === 'partial_success'

  if (!partial) {
    return {
      ...result,
      providerId: normalizeText(providerId || result?.providerId).toLowerCase(),
      partialSuccess: false,
      transactions,
      accounts,
    }
  }

  const def = getBankProviderDefinition(providerId || result?.providerId)
  return {
    ...result,
    providerId: normalizeText(providerId || result?.providerId).toLowerCase(),
    partialSuccess: true,
    status: 'partial_success',
    providerName: def?.name ?? result?.providerName ?? '',
    transactions,
    accounts,
    accountErrors,
  }
}

export function describeBankSyncRuntime() {
  return {
    backend: resolveBankSyncBackend(),
    platform: Capacitor.getPlatform(),
    nativeRuntime: isNativeBankAutomationRuntimeSupported(),
  }
}
