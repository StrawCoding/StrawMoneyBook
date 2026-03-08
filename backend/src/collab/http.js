function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res)
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
  methodGuard,
  normalizePath,
  normalizeText,
  parseBody,
  sendJson,
}
