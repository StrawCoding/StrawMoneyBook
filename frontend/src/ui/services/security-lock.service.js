import { computed, ref } from 'vue'
import { Capacitor, registerPlugin } from '@capacitor/core'

const SECURITY_LOCK_STORAGE_KEY = 'strawmoneybook.security_lock.enabled'
const SECURITY_LOCK_UNSUPPORTED_CODE = 'security_lock_unsupported'
const SecurityLock = registerPlugin('SecurityLock')

const securityLockEnabledRef = ref(readStoredSecurityLockEnabled())

function readStoredSecurityLockEnabled() {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(SECURITY_LOCK_STORAGE_KEY) === '1'
}

function persistSecurityLockEnabled(enabled) {
  if (typeof localStorage === 'undefined') return
  if (enabled) {
    localStorage.setItem(SECURITY_LOCK_STORAGE_KEY, '1')
    return
  }
  localStorage.removeItem(SECURITY_LOCK_STORAGE_KEY)
}

function isSecurityLockRuntimeSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function normalizePluginError(error, fallbackMessage) {
  const normalized = new Error(String(error?.message ?? fallbackMessage))
  normalized.code = String(error?.code ?? '')
  return normalized
}

export function useSecurityLockEnabled() {
  return computed(() => securityLockEnabledRef.value)
}

export function isSecurityLockEnabled() {
  return securityLockEnabledRef.value
}

export function setSecurityLockEnabled(enabled) {
  const next = Boolean(enabled)
  securityLockEnabledRef.value = next
  persistSecurityLockEnabled(next)
  return next
}

export async function getSecurityLockAvailability(fallbackUnsupportedMessage = '此裝置不支援安全鎖') {
  if (!isSecurityLockRuntimeSupported()) {
    return {
      available: false,
      code: SECURITY_LOCK_UNSUPPORTED_CODE,
      message: fallbackUnsupportedMessage,
    }
  }

  try {
    const result = await SecurityLock.isAvailable()
    return {
      available: Boolean(result?.available),
      code: String(result?.code ?? ''),
      message: String(result?.message ?? ''),
    }
  } catch (error) {
    const normalized = normalizePluginError(error, fallbackUnsupportedMessage)
    return {
      available: false,
      code: normalized.code || SECURITY_LOCK_UNSUPPORTED_CODE,
      message: normalized.message,
    }
  }
}

export async function authenticateSecurityLock(options = {}) {
  const fallbackUnsupportedMessage = String(options.unsupportedMessage ?? '此裝置不支援安全鎖')
  if (!isSecurityLockRuntimeSupported()) {
    throw normalizePluginError({ code: SECURITY_LOCK_UNSUPPORTED_CODE }, fallbackUnsupportedMessage)
  }

  try {
    await SecurityLock.authenticate({
      title: String(options.title ?? 'App 安全鎖'),
      subtitle: String(options.subtitle ?? ''),
      description: String(options.description ?? ''),
      reason: String(options.reason ?? ''),
    })
    return true
  } catch (error) {
    throw normalizePluginError(error, String(options.failureMessage ?? '解鎖失敗'))
  }
}
