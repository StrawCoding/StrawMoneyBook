const FALLBACK_LEDGER_TIME_ZONE = 'Asia/Taipei'

function normalizeTimeZone(value) {
  const timeZone = String(value ?? '').trim()
  if (!timeZone) return FALLBACK_LEDGER_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date('2026-01-01T00:00:00.000Z'))
    return timeZone
  } catch {
    return FALLBACK_LEDGER_TIME_ZONE
  }
}

function normalizeAmountMode(value) {
  return String(value ?? '').trim() === 'daily_average' ? 'daily_average' : 'fixed'
}

function normalizeDayRuleUnit(value) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'weekday' || normalized === 'monthday') return normalized
  return 'none'
}

function normalizeDayRuleValues(rawValues, unit) {
  const rawList = Array.isArray(rawValues)
    ? rawValues
    : (typeof rawValues === 'string'
      ? (() => {
        try {
          const parsed = JSON.parse(rawValues)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })()
      : [])
  const max = unit === 'monthday' ? 31 : 7
  return Array.from(
    new Set(
      rawList
        .map((value) => Math.trunc(Number(value)))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= max),
    ),
  ).sort((a, b) => a - b)
}

function parseMonthKey(monthKey) {
  const matched = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? '').trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}

function getDatePartsInTimeZone(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const year = Number(map.year)
  const month = Number(map.month)
  const day = Number(map.day)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  return { year, month, day }
}

function countMatchingRuleDaysInMonth(year, month, unit, values) {
  if (unit === 'none' || !Array.isArray(values) || values.length <= 0) return 0
  const lastDate = new Date(year, month, 0).getDate()
  if (!Number.isFinite(lastDate) || lastDate <= 0) return 0

  if (unit === 'monthday') {
    return values.filter((value) => value >= 1 && value <= lastDate).length
  }

  const valueSet = new Set(values)
  let total = 0
  for (let day = 1; day <= lastDate; day += 1) {
    const date = new Date(year, month - 1, day)
    const weekday = date.getDay() === 0 ? 7 : date.getDay()
    if (valueSet.has(weekday)) total += 1
  }
  return total
}

function countPendingRuleDays(item, monthKey, referenceDate, timeZone, options = {}) {
  if (normalizeAmountMode(item?.amount_mode) !== 'daily_average') return 0
  const monthInfo = parseMonthKey(monthKey)
  const referenceParts = getDatePartsInTimeZone(referenceDate, timeZone)
  if (!monthInfo || !referenceParts) return 0

  const unit = normalizeDayRuleUnit(item?.day_rule_unit)
  const values = normalizeDayRuleValues(item?.day_rule_values ?? item?.day_rule_values_json, unit)
  if (unit === 'none' || values.length <= 0) return 0

  const monthSortKey = monthInfo.year * 100 + monthInfo.month
  const referenceSortKey = referenceParts.year * 100 + referenceParts.month
  if (monthSortKey < referenceSortKey) return 0
  if (monthSortKey > referenceSortKey) {
    return countMatchingRuleDaysInMonth(monthInfo.year, monthInfo.month, unit, values)
  }

  const lastDate = new Date(monthInfo.year, monthInfo.month, 0).getDate()
  const startDay = options.includeReferenceDay === false ? referenceParts.day + 1 : referenceParts.day
  if (startDay > lastDate) return 0

  if (unit === 'monthday') {
    return values.filter((value) => value >= startDay && value <= lastDate).length
  }

  const valueSet = new Set(values)
  let total = 0
  for (let day = Math.max(1, startDay); day <= lastDate; day += 1) {
    const date = new Date(monthInfo.year, monthInfo.month - 1, day)
    const weekday = date.getDay() === 0 ? 7 : date.getDay()
    if (valueSet.has(weekday)) total += 1
  }
  return total
}

export function computeReservedMinor(items = [], monthKey, referenceDate = new Date(), timeZone, options = {}) {
  return (items ?? []).reduce((total, item) => {
    const amountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0) || 0))
    if (amountMinor <= 0) return total
    const pendingCount = countPendingRuleDays(item, monthKey, referenceDate, timeZone, options)
    return total + (amountMinor * pendingCount)
  }, 0)
}
