import { createInvoiceCarrierLinkSession } from './_einvoice-provider.js'
import {
  methodGuard,
  parseBody,
  sendJson,
} from '../bank/_utils.js'

export default async function handler(req, res) {
  if (methodGuard(req, res)) return

  try {
    const session = await createInvoiceCarrierLinkSession({})
    sendJson(res, 200, session)
  } catch (error) {
    sendJson(res, 400, {
      error: 'einvoice_link_session_failed',
      message: String(error?.message ?? error ?? 'E-Invoice link session failed'),
    })
  }
}
