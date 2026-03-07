import { disconnectFirstBankAuth } from './_first-bank-provider.js'
import { clientGuard, isFirstBankProvider, methodGuard, normalizeProvider, parseBody, sendJson } from './_utils.js'

export default async function handler(req, res) {
  if (methodGuard(req, res)) return
  if (clientGuard(req, res)) return
  const body = parseBody(req)
  const provider = normalizeProvider(body.provider)
  if (!provider) {
    sendJson(res, 400, { error: 'missing_provider', message: 'provider is required' })
    return
  }

  if (isFirstBankProvider(provider)) {
    try {
      const payload = await disconnectFirstBankAuth(body)
      sendJson(res, 200, payload)
    } catch (error) {
      sendJson(res, 400, {
        error: 'first_bank_disconnect_failed',
        message: String(error?.message ?? error ?? 'First Bank disconnect failed'),
      })
    }
    return
  }

  sendJson(res, 200, {
    ok: true,
    provider,
    disconnected_at: new Date().toISOString(),
  })
}
