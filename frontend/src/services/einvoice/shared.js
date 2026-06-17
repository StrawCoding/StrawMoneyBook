export const EINVOICE_PLATFORM = 'einvoice'

export function createEInvoiceError(message, code = 'einvoice_error') {
  const error = new Error(String(message ?? '').trim() || 'E-invoice error')
  error.code = String(code ?? 'einvoice_error')
  return error
}

export function isEInvoiceError(error) {
  return error instanceof Error && typeof error.code === 'string'
}

/**
 * 將載具名稱轉成交易標籤 JSON（spec §3.3.2：載具名稱 → 標籤/tag）。
 * - 去除前後空白
 * - 空值 / 純空白 / 無法安全轉成文字 → 回傳 null（避免寫入空標籤）
 * - 回傳格式與 transactions.tags_json 一致：JSON 化的字串陣列
 */
export function buildCarrierTagsJson(carrierName) {
  if (carrierName === null || carrierName === undefined) return null
  if (typeof carrierName === 'object') return null
  const name = String(carrierName).trim()
  if (!name) return null
  return JSON.stringify([name])
}

export function normalizeCarrierPhone(phone) {
  let raw = String(phone ?? '').trim().replace(/[\s-]/g, '')
  if (raw.startsWith('+886')) raw = `0${raw.slice(4)}`
  if (/^886\d{9}$/.test(raw)) raw = `0${raw.slice(3)}`
  return raw
}

export function isValidCarrierPhone(phone) {
  return /^09\d{8}$/.test(normalizeCarrierPhone(phone))
}
