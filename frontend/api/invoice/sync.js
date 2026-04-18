import { syncInvoiceCarrierData } from './_einvoice-provider.js'
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
    const result = await syncInvoiceCarrierData(body)
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, 400, {
      error: String(error?.code ?? '').trim() || 'einvoice_sync_failed',
      message: String(error?.message ?? error ?? 'E-Invoice sync failed'),
    })
  }
}
