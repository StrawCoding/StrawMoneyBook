import { Capacitor } from '@capacitor/core'

const PROD_DEFAULT_SHARED_LEDGER_API_BASE = 'https://api.strawmb.com'
const EXPLICIT_SHARED_LEDGER_API_BASE = String(import.meta.env.VITE_SHARED_LEDGER_API_BASE_URL ?? '').trim()
const VERSION_PROGRESS_ENDPOINT = '/api/meta/version-progress'
const REQUEST_TIMEOUT_MS = 12_000

function shouldUseSameOriginLocalApi() {
  if (EXPLICIT_SHARED_LEDGER_API_BASE) return false
  if (Capacitor.getPlatform() !== 'web') return false
  if (typeof window === 'undefined') return false
  const origin = String(window.location?.origin ?? '').trim()
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin)
}

function getSharedLedgerApiBase() {
  if (EXPLICIT_SHARED_LEDGER_API_BASE) return EXPLICIT_SHARED_LEDGER_API_BASE
  if (shouldUseSameOriginLocalApi()) return ''
  if (import.meta.env.PROD) return PROD_DEFAULT_SHARED_LEDGER_API_BASE
  return ''
}

function buildApiUrl(path) {
  const normalizedPath = String(path ?? '').trim()
  if (!normalizedPath.startsWith('/')) {
    throw new Error(`invalid backend api path: ${normalizedPath}`)
  }
  const apiBase = getSharedLedgerApiBase()
  if (!apiBase) return normalizedPath
  return `${apiBase.replace(/\/$/, '')}${normalizedPath}`
}

function shouldRequireExplicitApiBase() {
  return !getSharedLedgerApiBase()
}

function resolveErrorMessage(rawMessage) {
  const text = String(rawMessage ?? '').trim()
  if (!text) return '載入開發進度失敗'
  if (/failed to fetch|networkerror|load failed|fetch failed|timed out/i.test(text)) {
    return '無法連線到開發進度服務'
  }
  return text
}

export async function listVersionProgressItems() {
  if (shouldRequireExplicitApiBase()) {
    throw new Error('尚未設定後端 API，無法載入開發進度')
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutId = controller
    ? globalThis.setTimeout(() => {
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
    : null

  try {
    const response = await fetch(buildApiUrl(VERSION_PROGRESS_ENDPOINT), {
      method: 'GET',
      signal: controller?.signal,
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(resolveErrorMessage(payload?.message))
    }

    return Array.isArray(payload?.items)
      ? payload.items.map((item) => ({
        title: String(item?.title ?? '').trim(),
        status: String(item?.status ?? '').trim() || 'Unknown',
      })).filter((item) => item.title)
      : []
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('載入開發進度逾時')
    }
    throw new Error(resolveErrorMessage(error?.message ?? error))
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId)
    }
  }
}
