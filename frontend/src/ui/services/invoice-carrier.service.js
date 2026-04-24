import {
  connectInvoiceCarrier as connectInvoiceCarrierBackend,
  createInvoiceCarrierLinkSession as createInvoiceCarrierLinkSessionBackend,
  exchangeInvoiceCarrierAuth as exchangeInvoiceCarrierAuthBackend,
  getInvoiceCarrierSessionStatus as getInvoiceCarrierSessionStatusBackend,
} from '@/services/invoice-carrier/backend'
import { normalizeCarrierOptions, normalizeText } from '@/services/invoice-carrier/shared'

function buildCredentialState(result, mobilePhone, password) {
  return {
    provider: normalizeText(result.provider),
    mobilePhone: normalizeText(mobilePhone),
    password: String(password ?? ''),
    storageState: result.storage_state ?? null,
    carrierOptions: normalizeCarrierOptions(result.available_carriers || result.carrier_options),
    updatedAt: new Date().toISOString(),
  }
}

export async function connectInvoiceCarrier(mobilePhone, password, options = {}) {
  void options
  const result = await connectInvoiceCarrierBackend({
    mobile_phone: mobilePhone,
    password,
  })

  return {
    ...result,
    credentialState: buildCredentialState(result, mobilePhone, password),
  }
}

export async function startInvoiceCarrierLinkSession() {
  return createInvoiceCarrierLinkSessionBackend()
}

export async function refreshInvoiceCarrierLinkSession(sessionId, options = {}) {
  return getInvoiceCarrierSessionStatusBackend({
    session_id: sessionId,
    refresh_captcha: Boolean(options.refreshCaptcha),
  })
}

export async function completeInvoiceCarrierLinkSession(mobilePhone, password, captchaCode, options = {}) {
  const result = await exchangeInvoiceCarrierAuthBackend({
    session_id: normalizeText(options.sessionId),
    mobile_phone: mobilePhone,
    password,
    captcha_code: captchaCode,
  })

  return {
    ...result,
    credentialState: buildCredentialState(result, mobilePhone, password),
  }
}
