import {
  clientGuard,
  isMockProvider,
  methodGuard,
  normalizeProvider,
  parseBody,
  sendJson,
  simpleHash,
} from './_utils.js'
import { createPlaywrightBankLinkSession } from './_playwright-provider.js'

const MOCK_SESSION_TTL_MS = 5 * 60 * 1000

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
  if (clientGuard(req, res)) return
  const body = parseBody(req)
  const provider = normalizeProvider(body.provider)
  if (!provider) {
    sendJson(res, 400, { error: 'missing_provider', message: 'provider is required' })
    return
  }

  if (isMockProvider(provider)) {
    const nonce = createNonce()
    const expiresAtMs = Date.now() + MOCK_SESSION_TTL_MS
    sendJson(res, 200, {
      provider: 'mock_bank_tw',
      session_id: `mock_session_${nonce}_${expiresAtMs}`,
      link_url: `https://mock-bank.local/authorize?session=${nonce}`,
      mock_code: 'mock_approved',
      expires_at: new Date(expiresAtMs).toISOString(),
    })
    return
  }

  try {
    const session = await createPlaywrightBankLinkSession({
      ...body,
      provider,
    })
    sendJson(res, 200, session)
  } catch (error) {
    const message = String(error?.message ?? '').trim()
    const statusCode = message.includes('not configured yet') ? 501 : 400
    sendJson(res, statusCode, {
      error: statusCode === 501 ? 'provider_not_supported' : 'playwright_link_failed',
      message: message || 'failed to create bank link session',
    })
  }
}
