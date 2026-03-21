import { exchangeEinvoiceAuth } from './_mobile-barcode-provider.js'
import {
  clientGuard,
  isEinvoiceMobileBarcodeProvider,
  methodGuard,
  normalizeProvider,
  parseBody,
  sendJson,
} from './_utils.js'

export default async function handler(req, res) {
  if (methodGuard(req, res)) return
  if (clientGuard(req, res)) return

  const body = parseBody(req)
  const provider = normalizeProvider(body.provider || 'tw_einvoice_mobile_barcode')
  if (!isEinvoiceMobileBarcodeProvider(provider)) {
    sendJson(res, 400, {
      error: 'einvoice_provider_not_supported',
      message: '目前僅支援電子發票手機條碼登入',
    })
    return
  }

  try {
    const exchanged = await exchangeEinvoiceAuth(body)
    sendJson(res, 200, exchanged)
  } catch (error) {
    sendJson(res, 400, {
      error: normalizeText(error?.code || 'einvoice_exchange_failed'),
      message: String(error?.message ?? error ?? '電子發票登入失敗'),
    })
  }
}

function normalizeText(value) {
  return String(value ?? '').trim()
}
