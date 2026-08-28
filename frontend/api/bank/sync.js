import {
  clientGuard,
  createUnsupportedProviderMessage,
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

  // Architecture B: remote scrape providers are retired. Production sync is Android native only.
  sendJson(res, 501, {
    error: 'provider_not_supported',
    message: createUnsupportedProviderMessage(provider),
  })
}
