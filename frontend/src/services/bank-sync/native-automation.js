import { Capacitor, registerPlugin } from '@capacitor/core'
import { logBankSyncAction } from '../../core/services/bank-sync-debug.service.js'
import { isRegisteredBankProviderId } from './provider-registry.js'

const BankAutomation = registerPlugin('BankAutomation')

function createNativeBankAutomationError(message, code = 'bank_automation_error', data = null) {
  const error = new Error(String(message ?? '').trim() || 'Bank automation error')
  error.code = String(code ?? '').trim() || 'bank_automation_error'
  if (data && typeof data === 'object') {
    error.data = data
    error.debugTrace = data.debugTrace ?? null
    error.debugHint = String(data.debugTrace?.debugHint ?? '').trim()
    error.debugLastStep = String(data.debugTrace?.debugLastStep ?? '').trim()
  }
  return error
}

export function isNativeBankAutomationRuntimeSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function ensureNativeBankAutomationAvailable() {
  logBankSyncAction('native.ensureAvailable', {
    platform: Capacitor.getPlatform(),
    nativeRuntime: isNativeBankAutomationRuntimeSupported(),
  })
  if (!isNativeBankAutomationRuntimeSupported()) {
    throw createNativeBankAutomationError('目前僅支援 Android App 的本地銀行同步', 'bank_automation_android_only')
  }
  try {
    const result = await BankAutomation.isAvailable()
    if (!result?.available) {
      throw createNativeBankAutomationError('Bank automation is unavailable', 'bank_automation_unavailable')
    }
    return result
  } catch (error) {
    if (error instanceof Error && error.code) throw error
    throw createNativeBankAutomationError(error?.message || error, error?.code || 'bank_automation_unavailable', error?.data)
  }
}

function normalizePluginError(error, fallbackMessage) {
  const normalized = createNativeBankAutomationError(
    String(error?.message ?? fallbackMessage ?? 'Bank automation failed'),
    String(error?.code ?? '').trim() || 'bank_automation_failed',
    error?.data,
  )
  const errorData = error?.data?.errorData
  if (errorData && typeof errorData === 'object') {
    normalized.data = errorData
    normalized.captchaImageBase64 = String(errorData.captchaImageBase64 ?? '').trim()
  }
  return normalized
}

function withProviderId(payload = {}) {
  const providerId = String(payload?.providerId ?? payload?.provider ?? '').trim().toLowerCase()
  return {
    ...payload,
    providerId,
    provider: providerId || payload?.provider,
  }
}

/** Architecture B generic connect. */
export async function connectNativeBank(payload = {}) {
  logBankSyncAction('native.connect', {
    providerId: String(payload?.providerId ?? payload?.provider ?? '').trim().toLowerCase(),
  })
  await ensureNativeBankAutomationAvailable()
  const next = withProviderId(payload)
  if (!isRegisteredBankProviderId(next.providerId)) {
    throw createNativeBankAutomationError('Unsupported bank provider', 'bank_provider_unsupported')
  }
  try {
    return await BankAutomation.connectBank(next)
  } catch (error) {
    throw normalizePluginError(error, 'Bank connect failed')
  }
}

export async function syncNativeBank(payload = {}) {
  logBankSyncAction('native.sync', {
    providerId: String(payload?.providerId ?? payload?.provider ?? '').trim().toLowerCase(),
    connectionId: String(payload?.connectionId ?? payload?.provider_connection_id ?? '').trim(),
  })
  await ensureNativeBankAutomationAvailable()
  const next = withProviderId(payload)
  if (!isRegisteredBankProviderId(next.providerId)) {
    throw createNativeBankAutomationError('Unsupported bank provider', 'bank_provider_unsupported')
  }
  try {
    return await BankAutomation.syncBank(next)
  } catch (error) {
    throw normalizePluginError(error, 'Bank sync failed')
  }
}

export async function disconnectNativeBank(payload = {}) {
  logBankSyncAction('native.disconnect', {
    providerId: String(payload?.providerId ?? payload?.provider ?? '').trim().toLowerCase(),
    connectionId: String(payload?.connectionId ?? payload?.provider_connection_id ?? '').trim(),
  })
  await ensureNativeBankAutomationAvailable()
  const next = withProviderId(payload)
  try {
    return await BankAutomation.disconnectBank(next)
  } catch (error) {
    throw normalizePluginError(error, 'Bank disconnect failed')
  }
}

/** @deprecated legacy alias — use disconnectNativeBank */
export async function disconnectNativeBankConnection(payload = {}) {
  return disconnectNativeBank(payload)
}
