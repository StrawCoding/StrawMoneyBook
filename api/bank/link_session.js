import { isMockProvider, methodGuard, normalizeProvider, parseBody, sendJson, simpleHash } from './_utils.js'

function createNonce() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }
  if (typeof crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return simpleHash(`${Date.now()}_${Math.random()}`)
}

export default async function handler(req, res) {
  if (methodGuard(req, res)) return
  const body = parseBody(req)
  const provider = normalizeProvider(body.provider)
  if (!provider) {
    sendJson(res, 400, { error: 'missing_provider', message: 'provider is required' })
    return
  }

  if (isMockProvider(provider)) {
    const nonce = createNonce()
    sendJson(res, 200, {
      provider: 'mock_bank_tw',
      session_id: `mock_session_${nonce}`,
      link_url: `https://mock-bank.local/authorize?session=${nonce}`,
      mock_code: 'mock_approved',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    return
  }

  sendJson(res, 501, {
    error: 'provider_not_supported',
    message: `provider "${provider}" is not configured yet`,
  })
}
