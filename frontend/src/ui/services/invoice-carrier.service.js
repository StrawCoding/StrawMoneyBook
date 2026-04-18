import {
  createInvoiceCarrierLinkSession,
  disconnectInvoiceCarrierSession,
  exchangeInvoiceCarrierAuth,
  getInvoiceCarrierSessionStatus,
} from '@/services/invoice-carrier/backend'
import { normalizeCarrierOptions, normalizeText } from '@/services/invoice-carrier/shared'

export async function startInvoiceCarrierLinkSession() {
  return createInvoiceCarrierLinkSession({})
}

export async function pollInvoiceCarrierSessionStatus(sessionId, options = {}) {
  return getInvoiceCarrierSessionStatus({
    session_id: sessionId,
    refresh_captcha: Boolean(options.refreshCaptcha),
  })
}

export async function completeInvoiceCarrierAuth(sessionId, mobilePhone, password, captchaCode) {
  const result = await exchangeInvoiceCarrierAuth({
    session_id: sessionId,
    mobile_phone: mobilePhone,
    password,
    captcha_code: captchaCode,
  })

  return {
    ...result,
    credentialState: {
      provider: normalizeText(result.provider),
      mobilePhone: normalizeText(mobilePhone),
      password: String(password ?? ''),
      storageState: result.storage_state ?? null,
      carrierOptions: normalizeCarrierOptions(result.available_carriers || result.carrier_options),
      updatedAt: new Date().toISOString(),
    },
  }
}

export async function disconnectInvoiceCarrierLinkSession(sessionId) {
  if (!normalizeText(sessionId)) return { ok: true }
  return disconnectInvoiceCarrierSession({
    session_id: sessionId,
  })
}
