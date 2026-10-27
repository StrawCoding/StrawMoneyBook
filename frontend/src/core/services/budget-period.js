/**
 * ART-18 — Budget period / calendar / pay-cycle helpers (pure + timezone).
 */
import { monthKeyFromDate } from '../utils/id.js'

export function createBudgetError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

export function isBudgetPeriodConflict(error) {
  return /UNIQUE constraint failed: budgets\.ledger_id, budgets\.(?:month_key|period_key)/u.test(
    String(error?.message ?? error),
  )
}

export function normalizeText(value) {
  return String(value ?? '').trim()
}

export function normalizeAmountMode(value) {
  return value === 'daily_average' ? 'daily_average' : 'fixed'
}

export function normalizeContainerPeriodMode(value) {
  return String(value ?? '').trim() === 'daily' ? 'daily' : 'monthly'
}

export function parseMonthKey(monthKey) {
  const matched = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? '').trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}

export function monthKeyIndex(monthKey) {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) return null
  return parsed.year * 12 + (parsed.month - 1)
}

export function monthKeyFromIndex(index) {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

export function normalizeBudgetPeriodMode(value) {
  return String(value ?? '').trim() === 'pay_cycle' ? 'pay_cycle' : 'calendar_month'
}

export function normalizeLedgerTimeZone(value) {
  const timeZone = normalizeText(value)
  if (!timeZone) return 'Asia/Taipei'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date('2026-01-01T00:00:00.000Z'))
    return timeZone
  } catch {
    return 'Asia/Taipei'
  }
}

export function normalizePayDay(value) {
  return Math.min(31, Math.max(1, Math.trunc(Number(value ?? 1)) || 1))
}

export function parseDayKey(dayKey) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey ?? '').trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(year, month - 1, day)
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null
  return { year, month, day }
}

export function parsePayCycleMonthKey(value) {
  const matched = /^pay:(\d{4}-\d{2}-\d{2})(?::\d{4}-\d{2}-\d{2})?$/.exec(String(value ?? '').trim())
  return matched?.[1] ?? ''
}

export function dayKeyFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function shiftMonth(year, month, offset) {
  const index = year * 12 + (month - 1) + offset
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  }
}

export function startDayForMonth(year, month, payDay) {
  return Math.min(normalizePayDay(payDay), new Date(year, month, 0).getDate())
}

export function shiftDayKey(dayKey, offsetDays) {
  const parts = parseDayKey(dayKey)
  if (!parts) return ''
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays)).toISOString().slice(0, 10)
}

export function getZonedDateParts(dateLike, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeLedgerTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(dateLike instanceof Date ? dateLike : new Date(dateLike))
  const read = (type) => Number(parts.find((item) => item.type === type)?.value ?? 0)
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

export function dateKeyForLedgerTimeZone(timeZone = 'Asia/Taipei', referenceDate = new Date()) {
  const parts = getZonedDateParts(referenceDate, timeZone)
  return dayKeyFromParts(parts.year, parts.month, parts.day)
}

export function monthKeyForLedgerTimeZone(timeZone = 'Asia/Taipei', referenceDate = new Date()) {
  const parts = getZonedDateParts(referenceDate, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`
}

export function resolveZonedDateTimeUtcIso(parts, timeZone = 'Asia/Taipei') {
  const desiredEpochMs = Date.UTC(
    Number(parts?.year ?? 0),
    Number(parts?.month ?? 1) - 1,
    Number(parts?.day ?? 1),
    Number(parts?.hour ?? 0),
    Number(parts?.minute ?? 0),
    Number(parts?.second ?? 0),
  )
  let resolvedEpochMs = desiredEpochMs

  for (let index = 0; index < 3; index += 1) {
    const actual = getZonedDateParts(resolvedEpochMs, timeZone)
    const actualEpochMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    const diffMs = desiredEpochMs - actualEpochMs
    if (diffMs === 0) break
    resolvedEpochMs += diffMs
  }

  return new Date(resolvedEpochMs).toISOString()
}

export function resolveCalendarBudgetPeriod(monthKey) {
  const parsed = parseMonthKey(monthKey)
  const fallback = monthKeyFromDate()
  const { year, month } = parsed ?? parseMonthKey(fallback)
  const key = dayKeyFromParts(year, month, 1).slice(0, 7)
  return {
    mode: 'calendar_month',
    key,
    monthKey: key,
    startDate: `${key}-01`,
    endDate: dayKeyFromParts(year, month, new Date(year, month, 0).getDate()),
    label: key,
  }
}

export function resolvePayCycleBudgetPeriod(dateKeyOrDate = new Date(), payDay = 1) {
  const dateKey = dateKeyOrDate instanceof Date
    ? monthKeyFromDate(dateKeyOrDate) + `-${String(dateKeyOrDate.getDate()).padStart(2, '0')}`
    : String(dateKeyOrDate ?? '').trim()
  const parts = parseDayKey(dateKey) ?? parseDayKey(`${String(dateKey).slice(0, 7)}-01`) ?? parseDayKey(monthKeyFromDate() + '-01')
  const currentStartDay = startDayForMonth(parts.year, parts.month, payDay)
  const startMonth = parts.day >= currentStartDay
    ? { year: parts.year, month: parts.month }
    : shiftMonth(parts.year, parts.month, -1)
  const nextMonth = shiftMonth(startMonth.year, startMonth.month, 1)
  const startDate = dayKeyFromParts(
    startMonth.year,
    startMonth.month,
    startDayForMonth(startMonth.year, startMonth.month, payDay),
  )
  const nextStartDate = dayKeyFromParts(
    nextMonth.year,
    nextMonth.month,
    startDayForMonth(nextMonth.year, nextMonth.month, payDay),
  )
  const endDate = shiftDayKey(nextStartDate, -1)
  return {
    mode: 'pay_cycle',
    key: `pay:${startDate}:${endDate}`,
    monthKey: `pay:${startDate}`,
    startDate,
    endDate,
    label: `${startDate}~${endDate}`,
    nextPayDate: nextStartDate,
  }
}

export function resolveBudgetPeriodForLedger(ledger, dateKeyOrMonth = monthKeyFromDate()) {
  if (normalizeBudgetPeriodMode(ledger?.budget_period_mode) === 'pay_cycle') {
    const normalized = String(dateKeyOrMonth ?? '').trim()
    const payCycleStartDate = parsePayCycleMonthKey(normalized)
    const dateKey = payCycleStartDate || (/^\d{4}-\d{2}$/.test(normalized)
      ? `${normalized}-01`
      : normalized)
    return resolvePayCycleBudgetPeriod(dateKey, ledger?.budget_pay_day)
  }
  const slicedMonthKey = String(dateKeyOrMonth ?? '').slice(0, 7)
  const calendarMonthKey = parseMonthKey(slicedMonthKey)
    ? slicedMonthKey
    : monthKeyForLedgerTimeZone(ledger?.timezone)
  return resolveCalendarBudgetPeriod(calendarMonthKey)
}

export function resolveCurrentBudgetPeriodForLedger(ledger, referenceDate = new Date()) {
  return resolveBudgetPeriodForLedger(
    ledger,
    dateKeyForLedgerTimeZone(ledger?.timezone, referenceDate),
  )
}

export function previousBudgetPeriod(period, ledger = {}) {
  if (period?.mode === 'pay_cycle') {
    return resolvePayCycleBudgetPeriod(shiftDayKey(period.startDate, -1), ledger?.budget_pay_day)
  }
  return resolveCalendarBudgetPeriod(previousMonthKey(period?.monthKey ?? period?.key))
}

export function nextBudgetPeriod(period, ledger = {}) {
  if (period?.mode === 'pay_cycle') {
    return resolvePayCycleBudgetPeriod(shiftDayKey(period.endDate, 1), ledger?.budget_pay_day)
  }
  const index = monthKeyIndex(period?.monthKey ?? period?.key)
  return resolveCalendarBudgetPeriod(monthKeyFromIndex((index ?? monthKeyIndex(monthKeyFromDate())) + 1))
}

export function listInclusiveMonthKeys(startMonthKey, endMonthKey = startMonthKey) {
  const startIndex = monthKeyIndex(startMonthKey)
  const endIndex = monthKeyIndex(endMonthKey)
  if (startIndex === null || endIndex === null || endIndex < startIndex) {
    throw createBudgetError('budgeting.container.error.invalid_month_range')
  }

  const months = []
  for (let index = startIndex; index <= endIndex; index += 1) {
    months.push(monthKeyFromIndex(index))
  }
  return months
}

export function daysInPeriod(period) {
  const start = parseDayKey(period?.startDate)
  const end = parseDayKey(period?.endDate)
  if (!start || !end) return 30
  const startMs = Date.UTC(start.year, start.month - 1, start.day)
  const endMs = Date.UTC(end.year, end.month - 1, end.day)
  return Math.max(1, Math.round((endMs - startMs) / 86400000) + 1)
}

export function daysInMonthForKey(monthKey) {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) return 30
  const monthIndex = parsed.month - 1
  return new Date(parsed.year, monthIndex + 1, 0).getDate()
}

export function resolveContainerMonthlyAmountMinor(container, monthKey) {
  const amountMinor = Math.max(0, Math.round(Number(container?.amount_minor ?? 0)))
  if (normalizeContainerPeriodMode(container?.period_mode) !== 'daily') return amountMinor
  return amountMinor * daysInMonthForKey(monthKey)
}

export function resolveContainerPeriodAmountMinor(container, period) {
  const amountMinor = Math.max(0, Math.round(Number(container?.amount_minor ?? 0)))
  if (normalizeContainerPeriodMode(container?.period_mode) !== 'daily') return amountMinor
  return amountMinor * daysInPeriod(period)
}

export function isDailyPoolContainer(container) {
  return normalizeContainerPeriodMode(container?.period_mode ?? container?.periodMode) === 'daily'
}

export function isDailyPoolChildItem(item, containers = []) {
  const containerId = normalizeText(item?.budget_container_id)
  if (!containerId) return false
  const container = (containers ?? []).find((entry) => String(entry?.id ?? '') === containerId)
  return Boolean(container) && isDailyPoolContainer(container)
}

function toDisplayMinor(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

/** Period spent for a budget row. Daily-pool children still show category spend; they do not own a budget. */
export function itemDisplaySpentMinor(item, spentMap = {}) {
  return Math.max(0, toDisplayMinor(spentMap?.[item?.category_id]))
}

/** Own budget amount. Daily-pool children contribute 0 so pool math is not double-counted. */
export function itemDisplayBudgetMinor(item, containers = []) {
  if (isDailyPoolChildItem(item, containers)) return 0
  return Math.max(0, toDisplayMinor(item?.resolved_amount_minor ?? item?.amount_minor))
}

/** Own remaining. Daily-pool children stay 0; leftover lives on the parent pool. */
export function itemDisplayRemainMinor(item, spentMap = {}, containers = []) {
  if (isDailyPoolChildItem(item, containers)) return 0
  return itemDisplayBudgetMinor(item, containers) - itemDisplaySpentMinor(item, spentMap)
}

export function dailyPoolParentContainer(item, containers = []) {
  const containerId = normalizeText(item?.budget_container_id)
  if (!containerId) return null
  const container = (containers ?? []).find((entry) => String(entry?.id ?? '') === containerId)
  if (!container || !isDailyPoolContainer(container)) return null
  return container
}

/** Sum period spent for all categories bound to a daily pool container. */
export function dailyPoolContainerPeriodSpentMinor(containerId, items = [], spentMap = {}) {
  const normalizedContainerId = normalizeText(containerId)
  if (!normalizedContainerId) return 0
  return (items ?? [])
    .filter((entry) => normalizeText(entry?.budget_container_id) === normalizedContainerId)
    .reduce((total, entry) => total + itemDisplaySpentMinor(entry, spentMap), 0)
}

/** Display denominator for used%. Daily-pool children use the parent pool period budget. */
export function itemDisplayUsedBudgetMinor(item, containers = []) {
  if (isDailyPoolChildItem(item, containers)) {
    const parent = dailyPoolParentContainer(item, containers)
    return Math.max(0, toDisplayMinor(parent?.periodBudgetMinor ?? parent?.amount_minor))
  }
  return itemDisplayBudgetMinor(item, containers)
}

/**
 * Used ratio for progress bars.
 * Daily-pool children: share of pool spending (category spent ÷ total pool spent).
 * Other items: spent ÷ own budget.
 */
export function itemDisplayUsedRatio(item, spentMap = {}, containers = [], items = []) {
  if (isDailyPoolChildItem(item, containers)) {
    const parent = dailyPoolParentContainer(item, containers)
    if (!parent) return 0
    const poolSpentMinor = dailyPoolContainerPeriodSpentMinor(parent.id, items, spentMap)
    if (poolSpentMinor <= 0) return 0
    const ratio = itemDisplaySpentMinor(item, spentMap) / poolSpentMinor
    return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0
  }
  const budgetMinor = itemDisplayUsedBudgetMinor(item, containers)
  if (budgetMinor <= 0) return 0
  const ratio = itemDisplaySpentMinor(item, spentMap) / budgetMinor
  return Number.isFinite(ratio) ? Math.max(0, ratio) : 0
}

export function itemDisplayUsedPercentLabel(item, spentMap = {}, containers = [], items = []) {
  return `${Math.round(itemDisplayUsedRatio(item, spentMap, containers, items) * 100)}%`
}

export function monthRangeUtc(monthKey, timeZone = 'Asia/Taipei') {
  const payCycleStartMonthKey = parsePayCycleMonthKey(monthKey).slice(0, 7)
  const parsed = parseMonthKey(monthKey) ?? parseMonthKey(payCycleStartMonthKey) ?? parseMonthKey(monthKeyFromDate())
  const { year, month } = parsed
  const next = shiftMonth(year, month, 1)

  return {
    startUtc: resolveZonedDateTimeUtcIso({ year, month, day: 1, hour: 0, minute: 0, second: 0 }, timeZone),
    endUtc: resolveZonedDateTimeUtcIso({ year: next.year, month: next.month, day: 1, hour: 0, minute: 0, second: 0 }, timeZone),
  }
}

export function previousMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map((part) => Number(part))
  const date = new Date(year, month - 2, 1)
  return monthKeyFromDate(date)
}

export function dateRangeUtc(startDate, endDate, timeZone = 'Asia/Taipei') {
  const start = parseDayKey(startDate)
  const end = parseDayKey(endDate)
  if (!start || !end) return monthRangeUtc(monthKeyFromDate(), timeZone)
  const endNext = shiftDayKey(endDate, 1)
  const endParts = parseDayKey(endNext)
  return {
    startUtc: resolveZonedDateTimeUtcIso({ ...start, hour: 0, minute: 0, second: 0 }, timeZone),
    endUtc: resolveZonedDateTimeUtcIso({ ...endParts, hour: 0, minute: 0, second: 0 }, timeZone),
  }
}

export function todayRangeUtc(timeZone = 'Asia/Taipei') {
  const nowParts = getZonedDateParts(new Date(), timeZone)
  const todayKey = dayKeyFromParts(nowParts.year, nowParts.month, nowParts.day)
  const tomorrow = parseDayKey(shiftDayKey(todayKey, 1))
  return {
    startUtc: resolveZonedDateTimeUtcIso({ ...nowParts, hour: 0, minute: 0, second: 0 }, timeZone),
    endUtc: resolveZonedDateTimeUtcIso({ ...tomorrow, hour: 0, minute: 0, second: 0 }, timeZone),
  }
}
