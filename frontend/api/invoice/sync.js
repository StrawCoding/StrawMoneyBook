import { syncInvoiceCarrierData, closeInvoiceCarrierSession } from './_einvoice-provider.js'
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
    const result = await syncInvoiceCarrierData(body)
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, 400, {
      error: 'einvoice_sync_failed',
      message: String(error?.message ?? error ?? 'E-Invoice sync failed'),
    })
  } finally {
    // 由呼叫端決定何時關閉 session
  }
}
