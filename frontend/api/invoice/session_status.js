import { getInvoiceCarrierSessionStatus } from './_einvoice-provider.js'
import {
  clientGuard,
  methodGuard,
  parseBody,
  sendJson,
} from '../bank/_utils.js'

export default async function handler(req, res) {
  if (methodGuard(req, res)) return
  if (clientGuard(req, res)) return

  const body = parseBody(req)

  try {
    const result = await getInvoiceCarrierSessionStatus(body)
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, 400, {
      error: String(error?.code ?? '').trim() || 'einvoice_session_status_failed',
      message: String(error?.message ?? error ?? 'E-Invoice session status failed'),
    })
  }
}
