import { timingSafeEqual } from 'node:crypto'

const BANK_SYNC_CLIENT_SHARED_KEY = String(process.env.BANK_SYNC_CLIENT_SHARED_KEY ?? '').trim()
const BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS = parseBooleanEnv(
  process.env.BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS,
  false,
)

// Allowlist mirrors backend/src/collab/http.js. Capacitor apps send capacitor://localhost.
const PROD_ALLOWED_ORIGINS = new Set([
  'https://strawmb.com',
  'https://www.strawmb.com',
  'https://api.strawmb.com',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
])
const DEV_ALLOWED_ORIGINS = new Set([
  ...PROD_ALLOWED_ORIGINS,
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'https://127.0.0.1:5173',
  'https://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'https://127.0.0.1:4173',
  'https://localhost:4173',
  'http://127.0.0.1:8787',
  'http://localhost:8787',
])

function parseBooleanEnv(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

function isProductionRuntime() {
  const vercelEnv = String(process.env.VERCEL_ENV ?? '').trim().toLowerCase()
  if (vercelEnv) return vercelEnv === 'production'
  return String(process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production'
}

function resolveAllowedOrigin(requestOrigin) {
  if (!requestOrigin) return null
  const allowed = isProductionRuntime() ? PROD_ALLOWED_ORIGINS : DEV_ALLOWED_ORIGINS
  if (allowed.has(requestOrigin)) return requestOrigin
  try {
    const parsed = new URL(requestOrigin)
    if (parsed.protocol === 'https:'
      && (parsed.hostname === 'strawmb.com' || parsed.hostname.endsWith('.strawmb.com'))) {
      return requestOrigin
    }
  } catch {
    // malformed origin — deny
  }
  return null
}

function setCorsHeaders(req, res) {
  const requestOrigin = String(req?.headers?.origin ?? '').trim()
  const allowedOrigin = resolveAllowedOrigin(requestOrigin)
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Straw-Client-Key')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res.__request ?? {}, res)
  res.status(statusCode).json(payload)
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return {}
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeProvider(value) {
  return normalizeText(value).toLowerCase()
}

function isFirstBankProvider(provider) {
  return normalizeProvider(provider) === 'first_bank_tw'
}

function isMockProvider(provider) {
  const value = normalizeProvider(provider)
  return value === 'mock' || value === 'mock_bank_tw'
}

function isSupportedProvider(provider) {
  if (isFirstBankProvider(provider)) return BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS
  return false
}

function createUnsupportedProviderMessage(provider) {
  const normalized = normalizeProvider(provider)
  if (!normalized) {
    return BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS
      ? '目前支援 First Bank TW。'
      : '目前尚未開放任何銀行 provider。'
  }
  if (BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS) {
    return `provider "${normalized}" 目前未開放；請改用 First Bank TW。`
  }
  return `provider "${normalized}" 目前未開放。`
}

function unsupportedProviderGuard(provider, res) {
  if (isSupportedProvider(provider)) return false
  sendJson(res, 501, {
    error: 'provider_not_supported',
    message: createUnsupportedProviderMessage(provider),
  })
  return true
}

function methodGuard(req, res) {
  res.__request = req
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res)
    res.status(204).end()
    return true
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return true
  }
  return false
}

function secureEquals(left, right) {
  const leftBytes = Buffer.from(String(left ?? ''), 'utf8')
  const rightBytes = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBytes.length !== rightBytes.length) return false
  return timingSafeEqual(leftBytes, rightBytes)
}

function isClientAuthorized(req) {
  if (!BANK_SYNC_CLIENT_SHARED_KEY) return false
  const provided = String(
    req.headers?.['x-straw-client-key']
      ?? req.headers?.['X-Straw-Client-Key']
      ?? '',
  ).trim()
  return secureEquals(provided, BANK_SYNC_CLIENT_SHARED_KEY)
}

function shouldEnforceClientAuth() {
  if (isProductionRuntime()) return true
  return Boolean(BANK_SYNC_CLIENT_SHARED_KEY)
}

function clientGuard(req, res) {
  res.__request = req
  if (!shouldEnforceClientAuth()) return false
  if (!BANK_SYNC_CLIENT_SHARED_KEY) {
    sendJson(res, 500, {
      error: 'missing_bank_sync_client_shared_key',
      message: 'BANK_SYNC_CLIENT_SHARED_KEY is not configured',
    })
    return true
  }
  if (isClientAuthorized(req)) return false
  sendJson(res, 401, {
    error: 'unauthorized_client',
    message: 'missing or invalid x-straw-client-key',
  })
  return true
}

function simpleHash(input) {
  const source = String(input ?? '')
  let hash = 2166136261
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(36)
}

export {
  clientGuard,
  createUnsupportedProviderMessage,
  isFirstBankProvider,
  isMockProvider,
  isClientAuthorized,
  isSupportedProvider,
  methodGuard,
  normalizeProvider,
  normalizeText,
  parseBody,
  sendJson,
  simpleHash,
  unsupportedProviderGuard,
}
