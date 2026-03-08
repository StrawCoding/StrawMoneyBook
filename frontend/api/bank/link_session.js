import { createFirstBankLinkSession } from './_first-bank-provider.js'
import {
  clientGuard,
  isFirstBankProvider,
  methodGuard,
  normalizeProvider,
  parseBody,
  sendJson,
  simpleHash,
  unsupportedProviderGuard,
} from './_utils.js'

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

  if (unsupportedProviderGuard(provider, res)) return

  if (isFirstBankProvider(provider)) {
    try {
      const session = await createFirstBankLinkSession(body)
      sendJson(res, 200, session)
    } catch (error) {
      sendJson(res, 400, {
        error: 'first_bank_link_session_failed',
        message: String(error?.message ?? error ?? 'First Bank link session failed'),
      })
    }
    return
  }

  const nonce = createNonce()
  const expiresAtMs = Date.now() + MOCK_SESSION_TTL_MS
  sendJson(res, 200, {
    provider: 'mock_bank_tw',
    session_id: `mock_session_${nonce}_${expiresAtMs}`,
    link_url: `https://mock-bank.local/authorize?session=${nonce}`,
    mock_code: 'mock_approved',
    expires_at: new Date(expiresAtMs).toISOString(),
  })
}
