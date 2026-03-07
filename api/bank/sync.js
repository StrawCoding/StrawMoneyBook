import { syncFirstBankTransactions } from './_first-bank-provider.js'
import { syncMockTransactions } from './_mock-provider.js'
import {
  clientGuard,
  isFirstBankProvider,
  methodGuard,
  normalizeProvider,
  normalizeText,
  parseBody,
  sendJson,
  unsupportedProviderGuard,
} from './_utils.js'

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
      const payload = await syncFirstBankTransactions(body)
      sendJson(res, 200, payload)
    } catch (error) {
      sendJson(res, 400, {
        error: 'first_bank_sync_failed',
        message: String(error?.message ?? error ?? 'First Bank sync failed'),
      })
    }
    return
  }

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
}
