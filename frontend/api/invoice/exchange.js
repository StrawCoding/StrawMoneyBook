import { exchangeInvoiceCarrierAuth, closeInvoiceCarrierSession } from './_einvoice-provider.js'
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
    const result = await exchangeInvoiceCarrierAuth(body)
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, 400, {
      error: 'einvoice_exchange_failed',
      message: String(error?.message ?? error ?? 'E-Invoice authentication failed'),
    })
  } finally {
    // 不立即關閉 session，保留給 sync 使用
  }
}
