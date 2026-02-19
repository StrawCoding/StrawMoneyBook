import { syncMockTransactions } from './_mock-provider.js'
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
    const connectionId = normalizeText(body.connection_id)
    if (!connectionId) {
      sendJson(res, 400, { error: 'missing_connection_id', message: 'connection_id is required' })
      return
    }

    const payload = syncMockTransactions({
      cursor: normalizeText(body.cursor || body.next_cursor),
      accountIds: Array.isArray(body.account_ids) ? body.account_ids : [],
    })
    sendJson(res, 200, payload)
    return
  }

  sendJson(res, 501, {
    error: 'provider_not_supported',
    message: `provider "${provider}" is not configured yet`,
  })
}
