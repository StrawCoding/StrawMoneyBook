import { Capacitor } from '@capacitor/core'

const DEFAULT_BANK_API_BASE = String(import.meta.env.VITE_BANK_SYNC_API_BASE_URL ?? '').trim()
const BANK_SYNC_CLIENT_SHARED_KEY = String(import.meta.env.VITE_BANK_SYNC_CLIENT_SHARED_KEY ?? '').trim()

const PROVIDERS_FALLBACK = [
  {
    id: 'first_bank_tw',
    name: '第一銀行',
    country: 'TW',
  },
  {
    id: 'mock_bank_tw',
    name: 'Mock Bank TW (Sandbox)',
    country: 'TW',
  },
]

function buildApiUrl(path) {
  const normalizedPath = String(path ?? '').trim()
  if (!normalizedPath.startsWith('/')) {
    throw new Error(`invalid bank api path: ${normalizedPath}`)
  }
  if (!DEFAULT_BANK_API_BASE) return normalizedPath
  return `${DEFAULT_BANK_API_BASE.replace(/\/$/, '')}${normalizedPath}`
}

function shouldRequireExplicitBankApiBase() {
  if (DEFAULT_BANK_API_BASE) return false
  return Capacitor.getPlatform() !== 'web'
}

function createMissingBankApiError() {
  const platform = Capacitor.getPlatform()
  const message = platform === 'web'
    ? '銀行同步 API 未設定，請部署 /api/bank 或設定 VITE_BANK_SYNC_API_BASE_URL'
    : '手機 App 需設定銀行同步 API URL，請先部署 /api/bank，並將完整網址填入 VITE_BANK_SYNC_API_BASE_URL'
  const error = new Error(message)
  error.code = 'bank_sync_api_unavailable'
  return error
}

export function isBankSyncApiConfigured() {
  return !shouldRequireExplicitBankApiBase()
}

export function getBankSyncApiUnavailableMessage() {
  return createMissingBankApiError().message
}

function parseProviderListFromEnv() {
  const raw = String(import.meta.env.VITE_BANK_SYNC_PROVIDERS_JSON ?? '').trim()
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
    if (response.status === 404 && !DEFAULT_BANK_API_BASE && path.startsWith('/api/bank/')) {
      throw createMissingBankApiError()
    }
    const message = String(data?.message ?? data?.error ?? text ?? '').trim()
    throw new Error(message || `HTTP ${response.status}`)
  }

  if (!data || typeof data !== 'object') {
    throw new Error('銀行同步後端回應格式錯誤')
  }
  return data
}

export function listBankProviders() {
  return parseProviderListFromEnv()
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
