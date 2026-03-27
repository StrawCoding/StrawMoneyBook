import { Capacitor, registerPlugin } from '@capacitor/core'

const BankAutomation = registerPlugin('BankAutomation')

function createNativeEinvoiceAutomationError(message, code = 'einvoice_automation_error', data = null) {
  const error = new Error(String(message ?? '').trim() || 'E-invoice automation error')
  error.code = String(code ?? '').trim() || 'einvoice_automation_error'
  if (data && typeof data === 'object') {
    error.data = data
    error.debugTrace = data.debugTrace ?? null
    error.debugHint = String(data.debugTrace?.debugHint ?? '').trim()
    error.debugLastStep = String(data.debugTrace?.debugLastStep ?? '').trim()
  }
  return error
}

export function isNativeEinvoiceAutomationRuntimeSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function ensureNativeEinvoiceAutomationAvailable() {
  if (!isNativeEinvoiceAutomationRuntimeSupported()) {
    throw createNativeEinvoiceAutomationError('目前僅支援 Android App 的本地發票載具同步', 'einvoice_automation_android_only')
  }
  try {
    const result = await BankAutomation.isAvailable()
    if (!result?.available) {
      throw createNativeEinvoiceAutomationError('E-invoice automation is unavailable', 'einvoice_automation_unavailable')
    }
    if (result?.busy) {
      throw createNativeEinvoiceAutomationError('E-invoice automation is already running', 'einvoice_automation_busy')
    }
    return result
  } catch (error) {
    if (error instanceof Error && error.code) throw error
    throw createNativeEinvoiceAutomationError(
      error?.message || error,
      error?.code || 'einvoice_automation_unavailable',
      error?.data,
    )
  }
}

function normalizePluginError(error, fallbackMessage) {
  return createNativeEinvoiceAutomationError(
    String(error?.message ?? fallbackMessage ?? 'E-invoice automation failed'),
    String(error?.code ?? '').trim() || 'einvoice_automation_failed',
    error?.data,
  )
}

export async function connectNativeEinvoiceCarrier(payload = {}) {
  await ensureNativeEinvoiceAutomationAvailable()
  try {
    return await BankAutomation.connectEinvoiceCarrier(payload)
  } catch (error) {
    throw normalizePluginError(error, 'E-invoice carrier connect failed')
  }
}

export async function syncNativeEinvoiceCarrier(payload = {}) {
  await ensureNativeEinvoiceAutomationAvailable()
  try {
    return await BankAutomation.syncEinvoiceCarrier(payload)
  } catch (error) {
    throw normalizePluginError(error, 'E-invoice carrier sync failed')
  }
}

export async function disconnectNativeEinvoiceCarrier(payload = {}) {
  await ensureNativeEinvoiceAutomationAvailable()
  try {
    return await BankAutomation.disconnectConnection(payload)
  } catch (error) {
    throw normalizePluginError(error, 'E-invoice carrier disconnect failed')
  }
}
