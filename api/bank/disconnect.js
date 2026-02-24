import { clientGuard, methodGuard, normalizeProvider, parseBody, sendJson } from './_utils.js'

export default async function handler(req, res) {
  if (methodGuard(req, res)) return
  if (clientGuard(req, res)) return
  const body = parseBody(req)
  const provider = normalizeProvider(body.provider)
  if (!provider) {
    sendJson(res, 400, { error: 'missing_provider', message: 'provider is required' })
    return
  }

  sendJson(res, 200, {
    ok: true,
    provider,
    disconnected_at: new Date().toISOString(),
  })
}
