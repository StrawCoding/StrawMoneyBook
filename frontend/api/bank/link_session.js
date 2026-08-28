import { createFirstBankLinkSession } from './_first-bank-provider.js'
import {
  clientGuard,
  createUnsupportedProviderMessage,
  isFirstBankProvider,
  methodGuard,
  normalizeProvider,
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

  sendJson(res, 501, {
    error: 'provider_not_supported',
    message: createUnsupportedProviderMessage(provider),
  })
}
