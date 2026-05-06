import { Capacitor } from '@capacitor/core'
import {
  connectNativeInvoiceCarrier,
  disconnectNativeInvoiceCarrierSession,
  isNativeInvoiceCarrierAutomationRuntimeSupported,
  syncNativeInvoiceCarrierData,
} from './native-automation.js'

export { isNativeInvoiceCarrierAutomationRuntimeSupported }

const INVOICE_CARRIER_FEATURE_ENABLED = true

function normalizeText(value) {
  return String(value ?? '').trim()
}

function createUnsupportedInvoiceCarrierError(platform = Capacitor.getPlatform()) {
  const normalizedPlatform = normalizeText(platform).toLowerCase()
  const message = normalizedPlatform === 'web'
    ? '電子發票載具目前僅支援 Android App 自動化。Web 版僅提供診斷與說明，不能新增、重新驗證或同步載具。'
    : '電子發票載具目前僅支援 Android App 自動化。'
  const error = new Error(message)
  error.code = normalizedPlatform === 'web'
    ? 'invoice_carrier_android_required'
    : 'invoice_carrier_platform_unsupported'
  return error
}

function createInvoiceCarrierDisabledError() {
  const error = new Error('電子發票載具功能目前未開放')
  error.code = 'invoice_carrier_feature_disabled'
  return error
}

function assertInvoiceCarrierFeatureEnabled() {
  if (INVOICE_CARRIER_FEATURE_ENABLED) return
  throw createInvoiceCarrierDisabledError()
}

async function rejectUnsupportedProductPath() {
  throw createUnsupportedInvoiceCarrierError(Capacitor.getPlatform())
}

export function isInvoiceCarrierApiConfiguredFor(options = {}) {
  if (!INVOICE_CARRIER_FEATURE_ENABLED) return false
  const platform = normalizeText(options?.platform || Capacitor.getPlatform()).toLowerCase()
  return platform === 'android'
}

export function isInvoiceCarrierApiConfigured() {
  return isInvoiceCarrierApiConfiguredFor()
}

export function isInvoiceCarrierLinkingSupportedFor({
  platform = Capacitor.getPlatform(),
} = {}) {
  if (!INVOICE_CARRIER_FEATURE_ENABLED) return false
  return normalizeText(platform).toLowerCase() === 'android'
}

export function isInvoiceCarrierLinkingSupported() {
  return isInvoiceCarrierLinkingSupportedFor()
}

export function isInvoiceCarrierFeatureEnabled() {
  return INVOICE_CARRIER_FEATURE_ENABLED
}

export function getInvoiceCarrierApiUnavailableMessage() {
  if (!INVOICE_CARRIER_FEATURE_ENABLED) {
    return createInvoiceCarrierDisabledError().message
  }
  return createUnsupportedInvoiceCarrierError(Capacitor.getPlatform()).message
}

export function getInvoiceCarrierLinkingUnavailableMessage() {
  return createUnsupportedInvoiceCarrierError(Capacitor.getPlatform()).message
}

export async function connectInvoiceCarrier(payload = {}) {
  assertInvoiceCarrierFeatureEnabled()
  if (isNativeInvoiceCarrierAutomationRuntimeSupported()) {
    return connectNativeInvoiceCarrier(payload)
  }
  return rejectUnsupportedProductPath()
}

export async function syncInvoiceCarrierData(payload = {}) {
  assertInvoiceCarrierFeatureEnabled()
  if (isNativeInvoiceCarrierAutomationRuntimeSupported()) {
    return syncNativeInvoiceCarrierData(payload)
  }
  return rejectUnsupportedProductPath()
}

export async function disconnectInvoiceCarrierSession(payload = {}) {
  if (isNativeInvoiceCarrierAutomationRuntimeSupported()) {
    return disconnectNativeInvoiceCarrierSession(payload)
  }
  return {
    ok: true,
    unsupported: true,
  }
}
