import { createMockAccounts, createMockConnectionId } from './_mock-provider.js'
import {
  clientGuard,
  isMockProvider,
  methodGuard,
  normalizeProvider,
  normalizeText,
  parseBody,
  sendJson,
} from './_utils.js'

const CONSUMED_MOCK_SESSION_MAX_ENTRIES = 1000
const consumedMockSessions = new Map()

function parseMockSessionId(rawSessionId) {
  const sessionId = normalizeText(rawSessionId)
  if (!sessionId.startsWith('mock_session_')) return null
  const rest = sessionId.slice('mock_session_'.length)
  const splitAt = rest.lastIndexOf('_')
  if (splitAt <= 0) return null
  const nonce = rest.slice(0, splitAt)
  const expiresAtMs = Number(rest.slice(splitAt + 1))
  if (!nonce || !Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs) return null
  return {
    sessionId,
    expiresAtMs,
  }
}

function pruneConsumedMockSessions(nowMs = Date.now()) {
  for (const [sessionId, expiresAtMs] of consumedMockSessions.entries()) {
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
      consumedMockSessions.delete(sessionId)
    }
  }

  while (consumedMockSessions.size > CONSUMED_MOCK_SESSION_MAX_ENTRIES) {
    const oldest = consumedMockSessions.keys().next().value
    if (!oldest) break
    consumedMockSessions.delete(oldest)
  }
}

function consumeMockSession(session) {
  if (!session?.sessionId) return false
  const nowMs = Date.now()
  pruneConsumedMockSessions(nowMs)
  if (session.expiresAtMs <= nowMs) return false
  if (consumedMockSessions.has(session.sessionId)) return false
  consumedMockSessions.set(session.sessionId, session.expiresAtMs)
  pruneConsumedMockSessions(nowMs)
  return true
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
    const session = parseMockSessionId(sessionId)
    if (!session || !code.startsWith('mock') || !consumeMockSession(session)) {
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
