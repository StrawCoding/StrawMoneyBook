import { Capacitor, registerPlugin } from '@capacitor/core'

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

export async function connectNativeFirstBank(payload = {}) {
  await ensureNativeBankAutomationAvailable()
  try {
    return await BankAutomation.connectFirstBank(payload)
  } catch (error) {
    throw normalizePluginError(error, 'First Bank connect failed')
  }
}

export async function syncNativeFirstBank(payload = {}) {
  await ensureNativeBankAutomationAvailable()
  try {
    return await BankAutomation.syncFirstBank(payload)
  } catch (error) {
    throw normalizePluginError(error, 'First Bank sync failed')
  }
}

export async function disconnectNativeBankConnection(payload = {}) {
  await ensureNativeBankAutomationAvailable()
  try {
    return await BankAutomation.disconnectConnection(payload)
  } catch (error) {
    throw normalizePluginError(error, 'Bank disconnect failed')
  }
}
