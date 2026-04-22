function pad2(value) {
  return String(value).padStart(2, '0')
}

function buildSubscriptionDate(year, monthIndex, day) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`
}

function getDaysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function clampSubscriptionDay(day, maxDay) {
  return Math.min(Math.max(1, Number(day) || 1), maxDay)
}

function readSubscriptionDateParts(value) {
  const normalized = normalizeSubscriptionDateInput(value)
  const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  const maxDay = getDaysInMonth(year, month - 1)
  if (month < 1 || month > 12 || day < 1 || day > maxDay) return null
  return { year, monthIndex: month - 1, day }
}

function compareSubscriptionDates(left, right) {
  return String(left).localeCompare(String(right))
}

export function normalizeSubscriptionChargeDay(value, fallbackDateLike) {
  const parsed = Math.trunc(Number(value))
  if (parsed >= 1 && parsed <= 31) return parsed

  const fallbackDate = readSubscriptionDateParts(fallbackDateLike)
  if (!fallbackDate) return 1
  return fallbackDate.day
}

export function toSubscriptionDateInput(dateLike = new Date(), timeZone = 'Asia/Taipei') {
  if (typeof dateLike === 'string') {
    const matched = dateLike.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (matched) {
      const normalized = `${matched[1]}-${matched[2]}-${matched[3]}`
      const year = Number(matched[1])
      const month = Number(matched[2])
      const day = Number(matched[3])
      const maxDay = getDaysInMonth(year, month - 1)
      if (month >= 1 && month <= 12 && day >= 1 && day <= maxDay) return normalized
    }
  }

  const date = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike)
  if (Number.isNaN(date.getTime())) return ''

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const read = (type) => parts.find((item) => item.type === type)?.value
    const year = read('year')
    const month = read('month')
    const day = read('day')
    if (year && month && day) return `${year}-${month}-${day}`
  } catch {
    // Fall through to the host timezone when an invalid timezone is supplied.
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function normalizeSubscriptionDateInput(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (matched) {
    const normalized = `${matched[1]}-${matched[2]}-${matched[3]}`
    const year = Number(matched[1])
    const month = Number(matched[2])
    const day = Number(matched[3])
    const maxDay = getDaysInMonth(year, month - 1)
    return month >= 1 && month <= 12 && day >= 1 && day <= maxDay ? normalized : ''
  }
  return toSubscriptionDateInput(text)
}

export function parseSubscriptionDate(value) {
  const parts = readSubscriptionDateParts(value)
  if (!parts) return null
  return new Date(Date.UTC(parts.year, parts.monthIndex, parts.day))
}

export function addSubscriptionInterval(baseDateLike, intervalValue, intervalUnit, options = {}) {
  const baseDate = readSubscriptionDateParts(baseDateLike)
  if (!baseDate) {
    return toSubscriptionDateInput(new Date())
  }

  const step = Math.max(1, Number(intervalValue) || 1)
  const unit = String(intervalUnit ?? '').trim().toLowerCase()

  if (unit === 'year') {
    const nextYear = baseDate.year + step
    const monthIndex = baseDate.monthIndex
    const day = clampSubscriptionDay(baseDate.day, getDaysInMonth(nextYear, monthIndex))
    return buildSubscriptionDate(nextYear, monthIndex, day)
  }

  if (unit === 'day') {
    const next = new Date(Date.UTC(baseDate.year, baseDate.monthIndex, baseDate.day + step))
    return buildSubscriptionDate(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate())
  }

  const totalMonths = (baseDate.year * 12) + baseDate.monthIndex + step
  const nextYear = Math.floor(totalMonths / 12)
  const monthIndex = totalMonths % 12
  const baseDateInput = buildSubscriptionDate(baseDate.year, baseDate.monthIndex, baseDate.day)
  const day = clampSubscriptionDay(
    normalizeSubscriptionChargeDay(options?.chargeDay, baseDateInput),
    getDaysInMonth(nextYear, monthIndex),
  )
  return buildSubscriptionDate(nextYear, monthIndex, day)
}

export function resolveSubscriptionNextChargeDate(item, now = new Date()) {
  const startDate = normalizeSubscriptionDateInput(item?.startDate)
  if (!startDate) return ''

  const today = parseSubscriptionDate(toSubscriptionDateInput(now))
  if (!today) return startDate

  let nextDate = startDate
  let guard = 0

  while (compareSubscriptionDates(nextDate, toSubscriptionDateInput(now)) <= 0 && guard < 1200) {
    nextDate = addSubscriptionInterval(nextDate, item?.intervalValue, item?.intervalUnit, {
      chargeDay: item?.chargeDay,
    })
    guard += 1
  }

  return nextDate
}

export function listSubscriptionChargeDatesThrough(item, now = new Date(), options = {}) {
  if (item?.paused) return []

  const startDate = normalizeSubscriptionDateInput(item?.startDate)
  if (!startDate) return []

  const today = parseSubscriptionDate(toSubscriptionDateInput(now))
  if (!today) return []

  const dates = []
  let nextDate = startDate
  let guard = 0
  const maxOccurrences = Math.max(1, Number(options?.maxOccurrences ?? 1200) || 1200)
  const todayInput = toSubscriptionDateInput(now)

  while (compareSubscriptionDates(nextDate, todayInput) <= 0 && guard < maxOccurrences) {
    dates.push(nextDate)
    nextDate = addSubscriptionInterval(nextDate, item?.intervalValue, item?.intervalUnit, {
      chargeDay: item?.chargeDay,
    })
    guard += 1
  }

  return dates
}

export function isSubscriptionChargeDue(item, now = new Date()) {
  if (item?.paused) return false
  const today = toSubscriptionDateInput(now)
  if (!today) return false
  return listSubscriptionChargeDatesThrough(item, now, { maxOccurrences: 1200 }).includes(today)
}
