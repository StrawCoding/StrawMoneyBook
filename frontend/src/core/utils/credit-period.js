/**
 * Credit statement period math (v1.1 hard contract).
 * period_end_exclusive = (closeDay D + 1) 00:00 — D 全天仍屬本期。
 */

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function clampDayOfMonth(year, monthIndex0, day) {
  const last = new Date(year, monthIndex0 + 1, 0).getDate()
  const d = Math.max(1, Math.min(31, Math.round(Number(day) || 1)))
  return Math.min(d, last)
}

/** Local calendar Y-M-D + time → Date (no TZ shift). */
export function localDateTime(year, monthIndex0, day, hour = 0, minute = 0, second = 0, ms = 0) {
  return new Date(year, monthIndex0, day, hour, minute, second, ms)
}

export function toLocalIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('invalid date')
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

export function parseLocalIso(value) {
  const text = String(value ?? '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2})?:?(\d{2})?:?(\d{2})?(?:\.(\d{1,3}))?)?/.exec(text)
  if (!m) {
    const fallback = new Date(text)
    if (Number.isNaN(fallback.getTime())) throw new Error(`invalid posted_at: ${text}`)
    return fallback
  }
  return localDateTime(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
    Number(String(m[7] ?? '0').padEnd(3, '0')),
  )
}

/** Close calendar day D in month of `anchor` (short-month clamp). */
export function closingCalendarDate(anchor, statementCloseDay) {
  const d = parseLocalIso(anchor instanceof Date ? toLocalIso(anchor) : anchor)
  const day = clampDayOfMonth(d.getFullYear(), d.getMonth(), statementCloseDay)
  return localDateTime(d.getFullYear(), d.getMonth(), day, 0, 0, 0, 0)
}

/** period_end_exclusive = day after close day at 00:00. */
export function periodEndExclusiveFromCloseDay(closeCalendarDate) {
  const close = closeCalendarDate instanceof Date ? closeCalendarDate : parseLocalIso(closeCalendarDate)
  return localDateTime(close.getFullYear(), close.getMonth(), close.getDate() + 1, 0, 0, 0, 0)
}

export function previousMonthCloseDay(anchor, statementCloseDay) {
  const d = parseLocalIso(anchor instanceof Date ? toLocalIso(anchor) : anchor)
  const prev = localDateTime(d.getFullYear(), d.getMonth() - 1, 1)
  const day = clampDayOfMonth(prev.getFullYear(), prev.getMonth(), statementCloseDay)
  return localDateTime(prev.getFullYear(), prev.getMonth(), day, 0, 0, 0, 0)
}

/**
 * Resolve the open period that contains `postedAt` given close day.
 * Returns { periodStartInclusive, periodEndExclusive, closeDayDate }.
 */
export function resolvePeriodBoundsForPostedAt(postedAt, statementCloseDay) {
  const posted = postedAt instanceof Date ? postedAt : parseLocalIso(postedAt)
  let closeThis = closingCalendarDate(posted, statementCloseDay)
  let endEx = periodEndExclusiveFromCloseDay(closeThis)
  // If posted is on/after endEx, it belongs to the next period (close is this month's D already passed).
  if (posted.getTime() >= endEx.getTime()) {
    const nextMonthAnchor = localDateTime(posted.getFullYear(), posted.getMonth() + 1, 1)
    closeThis = closingCalendarDate(nextMonthAnchor, statementCloseDay)
    endEx = periodEndExclusiveFromCloseDay(closeThis)
    const start = periodEndExclusiveFromCloseDay(
      closingCalendarDate(
        localDateTime(closeThis.getFullYear(), closeThis.getMonth() - 1, 1),
        statementCloseDay,
      ),
    )
    return {
      periodStartInclusive: toLocalIso(start),
      periodEndExclusive: toLocalIso(endEx),
      closeDayDate: toLocalIso(closeThis).slice(0, 10),
    }
  }
  // posted < endEx: still in period ending at endEx.
  // start = previous close day's next day 00:00 = periodEndExclusive of previous close.
  const prevClose = previousMonthCloseDay(closeThis, statementCloseDay)
  // If posted is before this period's start, walk back.
  let start = periodEndExclusiveFromCloseDay(prevClose)
  let close = closeThis
  let end = endEx
  while (posted.getTime() < start.getTime()) {
    close = previousMonthCloseDay(close, statementCloseDay)
    end = periodEndExclusiveFromCloseDay(close)
    start = periodEndExclusiveFromCloseDay(previousMonthCloseDay(close, statementCloseDay))
  }
  // If somehow posted >= end, step forward (defensive).
  while (posted.getTime() >= end.getTime()) {
    const nextAnchor = localDateTime(close.getFullYear(), close.getMonth() + 1, 1)
    const nextClose = closingCalendarDate(nextAnchor, statementCloseDay)
    start = end
    close = nextClose
    end = periodEndExclusiveFromCloseDay(nextClose)
  }
  return {
    periodStartInclusive: toLocalIso(start),
    periodEndExclusive: toLocalIso(end),
    closeDayDate: toLocalIso(close).slice(0, 10),
  }
}

export function isPostedInPeriod(postedAt, periodStartInclusive, periodEndExclusive) {
  const t = (postedAt instanceof Date ? postedAt : parseLocalIso(postedAt)).getTime()
  const a = parseLocalIso(periodStartInclusive).getTime()
  const b = parseLocalIso(periodEndExclusive).getTime()
  return t >= a && t < b
}

/** due_on = payment_due_day clamped in the month of (close day + offset heuristic): typically next month after close. */
export function computeDueOn(closeDayDateYmd, paymentDueDay) {
  const close = parseLocalIso(`${String(closeDayDateYmd).slice(0, 10)}T00:00:00`)
  // Bank practice: due usually in the following month after statement close.
  const dueMonth = localDateTime(close.getFullYear(), close.getMonth() + 1, 1)
  const day = clampDayOfMonth(dueMonth.getFullYear(), dueMonth.getMonth(), paymentDueDay)
  const due = localDateTime(dueMonth.getFullYear(), dueMonth.getMonth(), day, 0, 0, 0, 0)
  return toLocalIso(due).slice(0, 10)
}

export function isOverdue({ dueOn, remainingMinor, now = new Date() }) {
  const remaining = Math.round(Number(remainingMinor) || 0)
  if (remaining <= 0) return false
  const due = String(dueOn ?? '').trim()
  if (!due) return false
  const dueEnd = parseLocalIso(`${due}T23:59:59.999`)
  const n = now instanceof Date ? now : parseLocalIso(now)
  return n.getTime() > dueEnd.getTime()
}

/** Reminder must NEVER drive overdue — only notification scheduling. */
export function shouldNotifyRepaymentReminder({
  dueOn,
  repaymentReminderDay,
  remainingMinor,
  now = new Date(),
}) {
  const remaining = Math.round(Number(remainingMinor) || 0)
  if (remaining <= 0) return false
  const n = now instanceof Date ? now : parseLocalIso(now)
  const reminderDay = Number(repaymentReminderDay)
  if (Number.isInteger(reminderDay) && reminderDay >= 1 && reminderDay <= 31) {
    if (n.getDate() === clampDayOfMonth(n.getFullYear(), n.getMonth(), reminderDay)) {
      return true
    }
  }
  // Also notify on due_on day (notification only; overdue uses due_on separately).
  const due = String(dueOn ?? '').trim()
  if (due && toLocalIso(n).slice(0, 10) === due.slice(0, 10)) return true
  return false
}

export function normalizeCloseDay(value, fallback = 25) {
  const n = Math.round(Number(value))
  if (!Number.isInteger(n) || n < 1 || n > 31) return fallback
  return n
}

export function normalizeDueDay(value, fallback = 15) {
  const n = Math.round(Number(value))
  if (!Number.isInteger(n) || n < 1 || n > 31) return fallback
  return n
}

export function derivePaidMinorFromAllocations(allocations = []) {
  return (Array.isArray(allocations) ? allocations : []).reduce((sum, row) => {
    const amount = Math.round(Number(row?.amount_minor ?? row?.amountMinor ?? 0))
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0)
  }, 0)
}

export function computeRemainingMinor({
  closingBalanceMinor,
  paidMinor,
  openLiabilityMinor = 0,
  status = 'closed',
}) {
  if (status === 'open') {
    return Math.max(0, Math.round(Number(openLiabilityMinor) || 0) - Math.round(Number(paidMinor) || 0))
  }
  return Math.max(0, Math.round(Number(closingBalanceMinor) || 0) - Math.round(Number(paidMinor) || 0))
}
