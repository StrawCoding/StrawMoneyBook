/**
 * Daily budget vs spent rows for the current budget period (aligns with home day-mode semantics).
 */
import { normalizeAmountMode, parseDayKey } from './budget-period.js'
import { normalizeDayRuleUnit, normalizeDayRuleValues } from './budget-spent.js'
import { resolvePoolStatsForDate } from './budget-pool-daily.js'

function toFiniteMinor(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return numeric
}

function parseDayKeyToDate(dayKey) {
  const parts = parseDayKey(dayKey)
  if (!parts) return null
  return new Date(parts.year, parts.month - 1, parts.day)
}

export function listPeriodDayKeys(period) {
  const start = parseDayKey(period?.startDate)
  const end = parseDayKey(period?.endDate)
  if (!start || !end) return []
  const startMs = Date.UTC(start.year, start.month - 1, start.day)
  const endMs = Date.UTC(end.year, end.month - 1, end.day)
  if (endMs < startMs) return []
  const keys = []
  for (let ms = startMs; ms <= endMs; ms += 86400000) {
    const date = new Date(ms)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    keys.push(`${year}-${month}-${day}`)
  }
  return keys
}

export function isBudgetItemActiveOnDate(item, date) {
  const amountMode = normalizeAmountMode(item?.amount_mode)
  if (amountMode !== 'daily_average') return true

  const ruleUnit = normalizeDayRuleUnit(item?.day_rule_unit)
  const ruleValues = normalizeDayRuleValues(item?.day_rule_values_json, ruleUnit)
  if (ruleUnit === 'none' || !ruleValues.length) return false

  if (ruleUnit === 'monthday') {
    return ruleValues.includes(date.getDate())
  }

  const weekday = date.getDay() === 0 ? 7 : date.getDay()
  return ruleValues.includes(weekday)
}

function buildSpentByCategoryDayMap(rows = []) {
  const map = new Map()
  for (const row of rows) {
    const categoryId = String(row?.category_id ?? '').trim()
    const dayKey = String(row?.occurred_day ?? '').trim()
    if (!categoryId || !dayKey) continue
    if (!map.has(categoryId)) map.set(categoryId, new Map())
    map.get(categoryId).set(dayKey, toFiniteMinor(row?.spent_minor))
  }
  return map
}

function sumCategorySpent(categoryIds, spentByCategoryDay, { onDayKey = null, beforeDayKey = null, periodStart = null } = {}) {
  let total = 0
  for (const categoryId of categoryIds) {
    const dayMap = spentByCategoryDay.get(categoryId)
    if (!dayMap) continue
    for (const [dayKey, spentMinor] of dayMap.entries()) {
      if (periodStart && dayKey < periodStart) continue
      if (onDayKey && dayKey !== onDayKey) continue
      if (beforeDayKey && !(dayKey < beforeDayKey)) continue
      total += spentMinor
    }
  }
  return total
}

function resolveDailyBudgetMinorForDay({
  dayKey,
  period,
  items = [],
  containers = [],
  spentByCategoryDay,
}) {
  const date = parseDayKeyToDate(dayKey)
  if (!date) return 0

  let total = 0
  for (const item of items) {
    if (String(item?.budget_container_id ?? '').trim()) continue
    if (normalizeAmountMode(item?.amount_mode) !== 'daily_average') continue
    if (!isBudgetItemActiveOnDate(item, date)) continue
    total += Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
  }

  const poolCategoryIdsByContainer = new Map()
  for (const item of items) {
    const containerId = String(item?.budget_container_id ?? '').trim()
    const categoryId = String(item?.category_id ?? '').trim()
    if (!containerId || !categoryId) continue
    if (!poolCategoryIdsByContainer.has(containerId)) {
      poolCategoryIdsByContainer.set(containerId, new Set())
    }
    poolCategoryIdsByContainer.get(containerId).add(categoryId)
  }

  for (const container of containers) {
    const categoryIds = poolCategoryIdsByContainer.get(String(container.id)) ?? new Set()
    const spentOnDayMinor = sumCategorySpent(categoryIds, spentByCategoryDay, { onDayKey: dayKey })
    const spentBeforeMinor = sumCategorySpent(categoryIds, spentByCategoryDay, {
      beforeDayKey: dayKey,
      periodStart: period?.startDate,
    })
    const stats = resolvePoolStatsForDate({
      container,
      period,
      spentPeriodMinor: spentBeforeMinor + spentOnDayMinor,
      spentOnDayMinor,
      dayKey,
    })
    total += Math.max(0, stats.todayAllowanceMinor)
  }

  return total
}

function resolveBudgetSpentMinorForDay(dayKey, budgetCategoryIds, spentByCategoryDay) {
  let total = 0
  for (const categoryId of budgetCategoryIds) {
    total += toFiniteMinor(spentByCategoryDay.get(categoryId)?.get(dayKey))
  }
  return total
}

export function spentByCategoryOnDay(spentByCategoryDayRows = [], dayKey) {
  const target = String(dayKey ?? '').trim()
  if (!target) return []
  const totals = new Map()
  for (const row of spentByCategoryDayRows) {
    if (String(row?.occurred_day ?? '').trim() !== target) continue
    const categoryId = String(row?.category_id ?? '').trim()
    if (!categoryId) continue
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + toFiniteMinor(row?.spent_minor))
  }
  return [...totals.entries()]
    .map(([categoryId, spentMinor]) => ({ categoryId, spentMinor }))
    .filter((row) => row.spentMinor !== 0)
    .sort((a, b) => b.spentMinor - a.spentMinor)
}

export function isDayKeyInBudgetPeriod(dayKey, periodStartDate, periodEndDate) {
  const day = String(dayKey ?? '').trim()
  const start = String(periodStartDate ?? '').trim()
  const end = String(periodEndDate ?? '').trim()
  if (!day || !start || !end) return false
  return day >= start && day <= end
}

export function shiftBudgetMonthKey(monthKey, delta = 0) {
  const matched = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? '').trim())
  if (!matched) return ''
  const year = Number(matched[1])
  const month = Number(matched[2])
  const shift = Number(delta)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(shift)) return ''
  const date = new Date(year, month - 1 + shift, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function buildBudgetMonthCalendarCells({
  monthKey,
  dailyStatsRows = [],
  periodStartDate,
  periodEndDate,
  todayKey = '',
} = {}) {
  const matched = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? '').trim())
  if (!matched) return []
  const yearText = matched[1]
  const monthText = matched[2]
  const year = Number(yearText)
  const month = Number(monthText)
  const statsByDay = new Map(
    dailyStatsRows.map((row) => [String(row?.dayKey ?? '').trim(), row]),
  )
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = []

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({
      key: `empty-${index}`,
      dateKey: '',
      dayLabel: '',
      spentMinor: 0,
      plannedMinor: 0,
      diffMinor: 0,
      inPeriod: false,
      isToday: false,
      isOver: false,
      selectable: false,
    })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${yearText}-${monthText}-${String(day).padStart(2, '0')}`
    const stats = statsByDay.get(dateKey)
    const inPeriod = isDayKeyInBudgetPeriod(dateKey, periodStartDate, periodEndDate)
    const spentMinor = inPeriod ? toFiniteMinor(stats?.spentMinor) : 0
    const plannedMinor = inPeriod ? toFiniteMinor(stats?.plannedMinor) : 0
    const diffMinor = inPeriod
      ? toFiniteMinor(stats?.diffMinor ?? (plannedMinor - spentMinor))
      : 0
    cells.push({
      key: dateKey,
      dateKey,
      dayLabel: String(day),
      spentMinor,
      plannedMinor,
      diffMinor,
      inPeriod,
      isToday: dateKey === todayKey,
      isOver: inPeriod && plannedMinor > 0 && diffMinor < 0,
      selectable: inPeriod,
    })
  }

  return cells
}

export function buildBudgetDailyStatsRows({
  period,
  items = [],
  containers = [],
  spentByCategoryDayRows = [],
} = {}) {
  const spentByCategoryDay = buildSpentByCategoryDayMap(spentByCategoryDayRows)
  const budgetCategoryIds = new Set(
    items.map((item) => String(item?.category_id ?? '').trim()).filter(Boolean),
  )
  const dayKeys = listPeriodDayKeys(period)
  let cumulativeSpentMinor = 0

  return dayKeys.map((dayKey) => {
    const plannedMinor = resolveDailyBudgetMinorForDay({
      dayKey,
      period,
      items,
      containers,
      spentByCategoryDay,
    })
    const spentMinor = resolveBudgetSpentMinorForDay(dayKey, budgetCategoryIds, spentByCategoryDay)
    cumulativeSpentMinor += spentMinor
    return {
      dayKey,
      plannedMinor,
      spentMinor,
      diffMinor: plannedMinor - spentMinor,
      cumulativeSpentMinor,
    }
  })
}
