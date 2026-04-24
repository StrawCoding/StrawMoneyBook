import { Capacitor, registerPlugin } from '@capacitor/core'

const InvoiceCarrierAutomation = registerPlugin('InvoiceCarrierAutomation')

function createNativeInvoiceCarrierError(message, code = 'invoice_carrier_native_error', data = null) {
  const error = new Error(String(message ?? '').trim() || 'Invoice carrier automation error')
  error.code = String(code ?? '').trim() || 'invoice_carrier_native_error'
  if (data && typeof data === 'object') {
    error.data = data
    error.debugTrace = data.debugTrace ?? null
    error.debugHint = String(data.debugTrace?.debugHint ?? '').trim()
    error.debugLastStep = String(data.debugTrace?.debugLastStep ?? '').trim()
  }
  return error
}

export function isNativeInvoiceCarrierAutomationRuntimeSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function ensureNativeInvoiceCarrierAutomationAvailable() {
  if (!isNativeInvoiceCarrierAutomationRuntimeSupported()) {
    throw createNativeInvoiceCarrierError('目前僅支援 Android App 的本地電子發票載具自動化', 'invoice_carrier_android_only')
  }
  try {
    const result = await InvoiceCarrierAutomation.isAvailable()
    if (!result?.available) {
      throw createNativeInvoiceCarrierError('Invoice carrier automation is unavailable', 'invoice_carrier_native_unavailable')
    }
    return result
  } catch (error) {
    if (error instanceof Error && error.code) throw error
    throw createNativeInvoiceCarrierError(error?.message || error, error?.code || 'invoice_carrier_native_unavailable', error?.data)
  }
}

function normalizePluginError(error, fallbackMessage) {
  return createNativeInvoiceCarrierError(
    String(error?.message ?? fallbackMessage ?? 'Invoice carrier automation failed'),
    String(error?.code ?? '').trim() || 'invoice_carrier_native_failed',
    error?.data,
  )
}

export async function createNativeInvoiceCarrierLinkSession(payload = {}) {
  await ensureNativeInvoiceCarrierAutomationAvailable()
  try {
    return await InvoiceCarrierAutomation.createLinkSession(payload)
  } catch (error) {
    throw normalizePluginError(error, 'Invoice carrier link session failed')
  }
}

export async function connectNativeInvoiceCarrier(payload = {}) {
  await ensureNativeInvoiceCarrierAutomationAvailable()
  try {
    return await InvoiceCarrierAutomation.connect(payload)
  } catch (error) {
    throw normalizePluginError(error, 'Invoice carrier connect failed')
  }
}

export async function getNativeInvoiceCarrierSessionStatus(payload = {}) {
  await ensureNativeInvoiceCarrierAutomationAvailable()
  try {
    return await InvoiceCarrierAutomation.getSessionStatus(payload)
  } catch (error) {
    throw normalizePluginError(error, 'Invoice carrier session status failed')
  }
}

export async function exchangeNativeInvoiceCarrierAuth(payload = {}) {
  await ensureNativeInvoiceCarrierAutomationAvailable()
  try {
    return await InvoiceCarrierAutomation.exchangeAuth(payload)
  } catch (error) {
    throw normalizePluginError(error, 'Invoice carrier auth exchange failed')
  }
}

export async function syncNativeInvoiceCarrierData(payload = {}) {
  await ensureNativeInvoiceCarrierAutomationAvailable()
  try {
    return await InvoiceCarrierAutomation.sync(payload)
  } catch (error) {
    throw normalizePluginError(error, 'Invoice carrier sync failed')
  }
}

export async function disconnectNativeInvoiceCarrierSession(payload = {}) {
  await ensureNativeInvoiceCarrierAutomationAvailable()
  try {
    return await InvoiceCarrierAutomation.disconnect(payload)
  } catch (error) {
    throw normalizePluginError(error, 'Invoice carrier disconnect failed')
  }
}
