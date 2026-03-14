const PROD_ALLOWED_ORIGINS = [
  'https://strawmb.com',
  'https://www.strawmb.com',
  'https://api.strawmb.com',
  'capacitor://localhost',
  'ionic://localhost',
]

const DEV_ALLOWED_ORIGINS = [
  ...PROD_ALLOWED_ORIGINS,
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:8787',
  'http://localhost:8787',
]

const ENV_ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const ALLOW_ALL_ORIGINS = ENV_ALLOWED_ORIGINS.includes('*')

const ALLOWED_ORIGINS = new Set(
  ENV_ALLOWED_ORIGINS.length && !ALLOW_ALL_ORIGINS
    ? ENV_ALLOWED_ORIGINS
    : (process.env.NODE_ENV === 'production' ? PROD_ALLOWED_ORIGINS : DEV_ALLOWED_ORIGINS),
)

function isAllowedStawmbOrigin(origin) {
  let parsed = null
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false
  const hostname = String(parsed.hostname ?? '').trim().toLowerCase()
  return hostname === 'strawmb.com' || hostname.endsWith('.strawmb.com')
}

function getRequestOrigin(req) {
  return String(req?.headers?.origin ?? '').trim()
}

function getClientIp(req) {
  const forwardedFor = String(req?.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim()
  const socketIp = String(req?.socket?.remoteAddress ?? '').trim()
  return forwardedFor || socketIp || 'unknown'
}

function getUserAgent(req) {
  return String(req?.headers?.['user-agent'] ?? '').trim()
}

function isOriginAllowed(req) {
  if (ALLOW_ALL_ORIGINS) return true
  const origin = getRequestOrigin(req)
  if (!origin) return true
  if (ALLOWED_ORIGINS.has(origin)) return true
  if (origin === 'null') return true
  return isAllowedStawmbOrigin(origin)
}

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
}

function setCorsHeaders(res) {
  const req = res.__request
  const origin = getRequestOrigin(req)
  setSecurityHeaders(res)
  res.setHeader('Vary', 'Origin')
  if (ALLOW_ALL_ORIGINS) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  } else if (origin && isOriginAllowed(req)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res)
  res.status(statusCode).json(payload)
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return {}
}

function normalizePath(req, mountBasePath = '') {
  const host = String(req.headers?.host ?? 'localhost')
  const url = new URL(String(req.url ?? '/'), `http://${host}`)
  let pathname = String(url.pathname ?? '/').trim() || '/'
  if (mountBasePath && pathname.startsWith(mountBasePath)) {
    pathname = pathname.slice(mountBasePath.length) || '/'
  }
  pathname = pathname.replace(/\/+$/, '') || '/'
  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

function methodGuard(req, res, allowedMethods = []) {
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) {
      sendJson(res, 403, { error: 'origin_not_allowed', message: 'origin not allowed' })
      return true
    }
    setCorsHeaders(res)
    res.status(204).end()
    return true
  }

  if (!allowedMethods.includes(req.method)) {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return true
  }

  return false
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function extractBearerToken(req) {
  const header = String(req.headers?.authorization ?? req.headers?.Authorization ?? '').trim()
  if (!header.toLowerCase().startsWith('bearer ')) return ''
  return header.slice(7).trim()
}

export {
  extractBearerToken,
  getClientIp,
  getUserAgent,
  isOriginAllowed,
  methodGuard,
  normalizePath,
  normalizeText,
  parseBody,
  sendJson,
  setSecurityHeaders,
}
