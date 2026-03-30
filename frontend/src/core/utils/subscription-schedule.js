function pad2(value) {
  return String(value).padStart(2, '0')
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

export function addSubscriptionInterval(baseDateLike, intervalValue, intervalUnit) {
  const baseDate = parseSubscriptionDate(baseDateLike)
  if (!baseDate) {
    return toSubscriptionDateInput(new Date())
  }

  const next = new Date(baseDate)
  const step = Math.max(1, Number(intervalValue) || 1)
  const unit = String(intervalUnit ?? '').trim().toLowerCase()

  if (unit === 'year') {
    next.setFullYear(next.getFullYear() + step)
  } else if (unit === 'day') {
    next.setDate(next.getDate() + step)
  } else {
    next.setMonth(next.getMonth() + step)
  }

  return toSubscriptionDateInput(next)
}

export function resolveSubscriptionNextChargeDate(item, now = new Date()) {
  const startDate = normalizeSubscriptionDateInput(item?.startDate)
  if (!startDate) return ''

  const today = parseSubscriptionDate(toSubscriptionDateInput(now))
  if (!today) return startDate

  let nextDate = startDate
  let nextDateValue = parseSubscriptionDate(nextDate)
  let guard = 0

  while (nextDateValue && nextDateValue.getTime() < today.getTime() && guard < 1200) {
    nextDate = addSubscriptionInterval(nextDate, item?.intervalValue, item?.intervalUnit)
    nextDateValue = parseSubscriptionDate(nextDate)
    guard += 1
  }

  return nextDate
}

export function isSubscriptionChargeDue(item, now = new Date()) {
  if (item?.paused) return false
  const today = toSubscriptionDateInput(now)
  if (!today) return false
  return resolveSubscriptionNextChargeDate(item, now) === today
}
