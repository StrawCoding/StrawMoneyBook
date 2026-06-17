export const MAX_PAGES = 20
export const MAX_QUERY_DAYS = 62

export function parseInputDate(dateStr) {
  const raw = String(dateStr ?? '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (!Number.isFinite(date.getTime())) return null
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

export function parseInvoiceDate(dateStr) {
  const parts = String(dateStr ?? '').split('/')
  if (parts.length !== 3) return 0
  const d = new Date(`${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}T00:00:00+08:00`)
  return Number.isFinite(d.getTime()) ? d.getTime() : 0
}

export function formatPortalDate(dateStr) {
  return String(dateStr ?? '').replace(/-/g, '/')
}

export function validateQueryInput({ cardNo, cardEncrypt, startDate, endDate }) {
  if (!cardNo || !cardEncrypt || !startDate || !endDate) {
    return { error: 'missing_params', message: '缺少必要參數（cardNo、cardEncrypt、startDate、endDate）' }
  }

  if (!/^\/[A-Za-z0-9+.\-]{7}$/.test(cardNo)) {
    return { error: 'invalid_card_no', message: '手機條碼格式錯誤，應為 / 開頭接 7 位英數字或 + . - 符號（如 /ABC1234）' }
  }

  if (!/^[A-Za-z0-9!#$%&()*+,.\-/:;<=>?@[\]^_`{|}~]{4,32}$/.test(cardEncrypt)) {
    return { error: 'invalid_card_encrypt', message: '手機條碼驗證碼格式錯誤，請確認長度與內容後再試' }
  }

  const from = parseInputDate(startDate)
  const to = parseInputDate(endDate)
  if (!from || !to) {
    return { error: 'invalid_date', message: '日期格式錯誤，請使用 YYYY-MM-DD' }
  }
  if (to.getTime() < from.getTime()) {
    return { error: 'invalid_date_range', message: '結束日期不可早於開始日期' }
  }
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1
  if (days > MAX_QUERY_DAYS) {
    return { error: 'date_range_too_large', message: `單次查詢最多 ${MAX_QUERY_DAYS} 天，請縮小日期範圍` }
  }

  return null
}
