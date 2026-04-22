export const INVOICE_CARRIER_PROVIDER_ID = 'einvoice_tw'
export const INVOICE_CARRIER_REAUTH_ERROR_CODES = new Set([
  'invoice_carrier_reauth_required',
  'invoice_carrier_cloudflare_verification_required',
  'invoice_carrier_login_required',
  'invoice_carrier_session_expired',
  'invoice_carrier_captcha_ocr_failed',
])

export function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function buildInvoiceCarrierCredentialSettingKey(connectionId) {
  return `invoice_carrier.credentials.${normalizeText(connectionId)}`
}

export function normalizeCarrierOptions(options = []) {
  if (!Array.isArray(options)) return []

  const seen = new Set()
  return options
    .map((item) => {
      const value = normalizeText(item?.value)
      const label = normalizeText(item?.label)
      if (!value || !label) return null
      const dedupeKey = `${value}::${label}`
      if (seen.has(dedupeKey)) return null
      seen.add(dedupeKey)
      return { value, label }
    })
    .filter(Boolean)
}

export function normalizeInvoiceCarrierCredentialState(value) {
  if (!value || typeof value !== 'object') return null

  const storageState = value.storageState && typeof value.storageState === 'object'
    ? normalizeInvoiceCarrierStorageState(value.storageState)
    : null

  return {
    provider: normalizeText(value.provider) || INVOICE_CARRIER_PROVIDER_ID,
    mobilePhone: normalizeText(value.mobilePhone || value.mobile_phone),
    password: String(value.password ?? ''),
    storageState,
    carrierOptions: normalizeCarrierOptions(value.carrierOptions || value.carrier_options),
    updatedAt: normalizeText(value.updatedAt || value.updated_at) || new Date().toISOString(),
  }
}

function normalizeInvoiceCarrierStorageState(value) {
  const storageState = {
    cookies: Array.isArray(value.cookies) ? value.cookies : [],
    origins: Array.isArray(value.origins) ? value.origins : [],
  }
  if (value.native) {
    storageState.native = true
    storageState.provider = normalizeText(value.provider)
    storageState.connectionId = normalizeText(value.connectionId || value.connection_id)
  }
  return storageState
}

export function shouldRewriteInvoiceCarrierCredentialState(value) {
  if (!value || typeof value !== 'object') return false
  const allowedKeys = new Set(['provider', 'mobilePhone', 'password', 'storageState', 'carrierOptions', 'updatedAt'])
  return Object.keys(value).some((key) => !allowedKeys.has(key))
}

export function parseInvoiceDateText(value) {
  const text = normalizeText(value)
  if (!text) return ''

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  const zhMatch = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (!zhMatch) return ''

  const year = zhMatch[1]
  const month = zhMatch[2].padStart(2, '0')
  const day = zhMatch[3].padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatInvoiceDateRangeLabel(startDate, endDate) {
  const start = parseInvoiceDateText(startDate) || normalizeText(startDate)
  const end = parseInvoiceDateText(endDate) || normalizeText(endDate)
  if (!start || !end) return ''

  const [startYear, startMonth, startDay] = start.split('-')
  const [endYear, endMonth, endDay] = end.split('-')
  if (!startYear || !endYear) return ''
  return `${Number(startYear)}年${Number(startMonth)}月${Number(startDay)}日 ~ ${Number(endYear)}年${Number(endMonth)}月${Number(endDay)}日`
}

export function formatInvoiceCarrierErrorForStorage(error) {
  const code = normalizeText(error?.code || error?.error)
  const message = normalizeText(error?.message ?? error)
  if (code && message) return `${code}: ${message}`
  return message || 'invoice_carrier_unknown_error'
}

export function isInvoiceCarrierReauthError(error) {
  const code = normalizeText(error?.code || error?.error)
  if (code && INVOICE_CARRIER_REAUTH_ERROR_CODES.has(code)) return true
  const message = normalizeText(error?.message ?? error).toLowerCase()
  return (
    message.includes('reauth')
    || message.includes('重新驗證')
    || message.includes('cloudflare')
    || message.includes('security verification')
  )
}

export function createInvoiceCarrierError(code, message) {
  const error = new Error(message)
  error.code = normalizeText(code) || 'invoice_carrier_error'
  return error
}
