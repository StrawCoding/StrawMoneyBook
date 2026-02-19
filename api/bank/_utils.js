function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
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

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeProvider(value) {
  return normalizeText(value).toLowerCase()
}

function isMockProvider(provider) {
  const value = normalizeProvider(provider)
  return value === 'mock' || value === 'mock_bank_tw'
}

function methodGuard(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res)
    res.status(204).end()
    return true
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return true
  }
  return false
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
  isMockProvider,
  methodGuard,
  normalizeProvider,
  normalizeText,
  parseBody,
  sendJson,
  simpleHash,
}
