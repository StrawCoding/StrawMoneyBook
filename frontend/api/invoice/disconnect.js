import { closeInvoiceCarrierSession } from './_einvoice-provider.js'
import {
  methodGuard,
  parseBody,
  sendJson,
} from '../bank/_utils.js'

export default async function handler(req, res) {
  if (methodGuard(req, res)) return

  const body = parseBody(req)
  const sessionId = body.session_id

  try {
    if (sessionId) {
      await closeInvoiceCarrierSession(sessionId)
    }
    sendJson(res, 200, {
      ok: true,
      message: 'E-Invoice session closed',
    })
  } catch (error) {
    sendJson(res, 400, {
      error: 'einvoice_disconnect_failed',
      message: String(error?.message ?? error ?? 'E-Invoice disconnect failed'),
    })
  }
}
