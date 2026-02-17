export function createId(prefix = '') {
  const time = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return prefix ? `${prefix}_${time}_${random}` : `${time}_${random}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function monthKeyFromDate(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}
