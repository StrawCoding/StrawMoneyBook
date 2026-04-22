function pad2(value) {
  return String(value).padStart(2, '0')
}

function buildSubscriptionDate(year, monthIndex, day) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function clampSubscriptionDay(day, maxDay) {
  return Math.min(Math.max(1, Number(day) || 1), maxDay)
}

export function normalizeSubscriptionChargeDay(value, fallbackDateLike) {
  const parsed = Math.trunc(Number(value))
  if (parsed >= 1 && parsed <= 31) return parsed

  const fallbackDate = parseSubscriptionDate(fallbackDateLike)
  if (!fallbackDate) return 1
  return fallbackDate.getDate()
}

export function toSubscriptionDateInput(dateLike = new Date()) {
  const date = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function normalizeSubscriptionDateInput(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (matched) {
    const normalized = `${matched[1]}-${matched[2]}-${matched[3]}`
    const parsed = new Date(`${normalized}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? '' : normalized
  }
  return toSubscriptionDateInput(text)
}

export function parseSubscriptionDate(value) {
  const normalized = normalizeSubscriptionDateInput(value)
  if (!normalized) return null
  const parsed = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function addSubscriptionInterval(baseDateLike, intervalValue, intervalUnit, options = {}) {
  const baseDate = parseSubscriptionDate(baseDateLike)
  if (!baseDate) {
    return toSubscriptionDateInput(new Date())
  }

  const step = Math.max(1, Number(intervalValue) || 1)
  const unit = String(intervalUnit ?? '').trim().toLowerCase()

  if (unit === 'year') {
    const nextYear = baseDate.getFullYear() + step
    const monthIndex = baseDate.getMonth()
    const day = clampSubscriptionDay(baseDate.getDate(), getDaysInMonth(nextYear, monthIndex))
    return buildSubscriptionDate(nextYear, monthIndex, day)
  }

  if (unit === 'day') {
    const next = new Date(baseDate)
    next.setDate(next.getDate() + step)
    return toSubscriptionDateInput(next)
  }

  const totalMonths = (baseDate.getFullYear() * 12) + baseDate.getMonth() + step
  const nextYear = Math.floor(totalMonths / 12)
  const monthIndex = totalMonths % 12
  const day = clampSubscriptionDay(
    normalizeSubscriptionChargeDay(options?.chargeDay, baseDate),
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
  let nextDateValue = parseSubscriptionDate(nextDate)
  let guard = 0

  while (nextDateValue && nextDateValue.getTime() <= today.getTime() && guard < 1200) {
    nextDate = addSubscriptionInterval(nextDate, item?.intervalValue, item?.intervalUnit, {
      chargeDay: item?.chargeDay,
    })
    nextDateValue = parseSubscriptionDate(nextDate)
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
  let nextDateValue = parseSubscriptionDate(nextDate)
  let guard = 0
  const maxOccurrences = Math.max(1, Number(options?.maxOccurrences ?? 1200) || 1200)

  while (nextDateValue && nextDateValue.getTime() <= today.getTime() && guard < maxOccurrences) {
    dates.push(nextDate)
    nextDate = addSubscriptionInterval(nextDate, item?.intervalValue, item?.intervalUnit, {
      chargeDay: item?.chargeDay,
    })
    nextDateValue = parseSubscriptionDate(nextDate)
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
