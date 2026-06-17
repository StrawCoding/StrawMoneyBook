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

export function normalizeCarrierPhone(phone) {
  let raw = String(phone ?? '').trim().replace(/[\s-]/g, '')
  if (raw.startsWith('+886')) raw = `0${raw.slice(4)}`
  if (/^886\d{9}$/.test(raw)) raw = `0${raw.slice(3)}`
  return raw
}

export function validateScrapeCredentials({ cardNo, cardEncrypt }) {
  const phone = normalizeCarrierPhone(cardNo)
  const password = String(cardEncrypt ?? '').trim()

  if (!phone || !password) {
    return { error: 'missing_params', message: '缺少必要參數（手機號碼、密碼）' }
  }

  if (!/^09\d{8}$/.test(phone)) {
    return {
      error: 'invalid_phone',
      message: '手機號碼格式錯誤，應為 09 開頭的 10 碼數字（例：0912345678）',
    }
  }

  if (password.length < 4) {
    return { error: 'invalid_password', message: '密碼至少需要 4 位' }
  }

  return null
}

export function validateQueryInput({ cardNo, cardEncrypt, startDate, endDate }) {
  const credentialError = validateScrapeCredentials({ cardNo, cardEncrypt })
  if (credentialError) return credentialError

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

export function toRocDate(dateStr) {
  const parsed = parseInputDate(dateStr)
  if (!parsed) return String(dateStr ?? '').replace(/-/g, '')
  const rocYear = parsed.getUTCFullYear() - 1911
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const day = String(parsed.getUTCDate()).padStart(2, '0')
  return `${String(rocYear).padStart(3, '0')}${month}${day}`
}
