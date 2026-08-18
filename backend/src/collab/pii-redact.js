const SENSITIVE_KEY = /password|secret|token|authorization|cookie|email|national.?id|cardencrypt|query.?code/i
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export function redactPiiText(value) {
  return String(value ?? '').replace(EMAIL_RE, '[redacted-email]')
}

export function redactPiiValue(value, key = '', depth = 0) {
  if (value == null) return null
  if (SENSITIVE_KEY.test(String(key))) return '[redacted]'
  if (depth >= 4) return redactPiiText(String(value)).slice(0, 240)
  if (typeof value === 'string') return redactPiiText(value).slice(0, 600)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactPiiValue(item, key, depth + 1))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([entryKey, entryValue]) => [entryKey, redactPiiValue(entryValue, entryKey, depth + 1)]),
    )
  }
  return redactPiiText(String(value)).slice(0, 240)
}
