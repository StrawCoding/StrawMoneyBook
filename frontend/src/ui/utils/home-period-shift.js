export function shiftDayKey(dayKey, delta) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey ?? '').trim())
  const base = matched
    ? new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]))
    : new Date()
  if (Number.isNaN(base.getTime())) return String(dayKey ?? '')
  base.setDate(base.getDate() + Number(delta || 0))
  const year = base.getFullYear()
  const month = String(base.getMonth() + 1).padStart(2, '0')
  const day = String(base.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function shiftMonthKey(monthKey, delta) {
  const matched = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? '').trim())
  const year = matched ? Number(matched[1]) : new Date().getFullYear()
  const monthIndex = matched ? Number(matched[2]) - 1 : new Date().getMonth()
  const next = new Date(year, monthIndex + Number(delta || 0), 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}
