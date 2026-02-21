import { createMockAccounts, createMockConnectionId } from './_mock-provider.js'
import {
  isMockProvider,
  methodGuard,
  normalizeProvider,
  normalizeText,
  parseBody,
  sendJson,
} from './_utils.js'

export default async function handler(req, res) {
  if (methodGuard(req, res)) return
  const body = parseBody(req)
  const provider = normalizeProvider(body.provider)
  if (!provider) {
    sendJson(res, 400, { error: 'missing_provider', message: 'provider is required' })
    return
  }

  if (isMockProvider(provider)) {
    const sessionId = normalizeText(body.session_id)
    const code = normalizeText(body.code || body.public_token)
    if (!sessionId) {
      sendJson(res, 400, { error: 'missing_session_id', message: 'session_id is required' })
      return
    }
    if (!code) {
      sendJson(res, 400, { error: 'missing_code', message: 'code is required' })
      return
    }
    if (!sessionId.startsWith('mock_session_') || !code.startsWith('mock')) {
      sendJson(res, 400, { error: 'invalid_mock_code', message: 'invalid mock authorization code' })
      return
    }
    const seed = `${sessionId}_${code}`
    const connectionId = createMockConnectionId(seed)
    const accounts = createMockAccounts(connectionId)
    sendJson(res, 200, {
      provider: 'mock_bank_tw',
      institution_name: 'Mock Bank TW',
      connection_id: connectionId,
      connection_name: 'Mock Bank TW',
      accounts,
      access_token_ref: `mock_token_ref_${connectionId}`,
      created_at: new Date().toISOString(),
    })
    return
  }

  sendJson(res, 501, {
    error: 'provider_not_supported',
    message: `provider "${provider}" is not configured yet`,
  })
}
