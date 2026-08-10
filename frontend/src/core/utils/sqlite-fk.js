/**
 * SQLite FOREIGN KEY helpers (code 1811 / SQLITE_CONSTRAINT_FOREIGNKEY).
 * Keep PRAGMA foreign_keys ON; never swallow constraint failures as success.
 */

export const SQLITE_FOREIGN_KEY_ERROR_CODE = 'SQLITE_CONSTRAINT_FOREIGNKEY'
export const SQLITE_FOREIGN_KEY_ERROR_NUMERIC = 1811

const FOREIGN_KEY_MESSAGE_RE = /foreign\s*key|SQLITE_CONSTRAINT_FOREIGNKEY|\b1811\b/i

export function isForeignKeyError(error) {
  if (!error) return false
  if (error?.code === SQLITE_FOREIGN_KEY_ERROR_CODE) return true
  if (Number(error?.numericCode ?? error?.resultCode ?? error?.errno) === SQLITE_FOREIGN_KEY_ERROR_NUMERIC) {
    return true
  }
  const message = String(error?.message ?? error ?? '')
  if (/unique\s*constraint/i.test(message) && !/foreign\s*key/i.test(message)) {
    return false
  }
  // Capacitor / sql.js often report only "constraint failed" for FK; prefer explicit foreign key / 1811.
  if (/foreign\s*key/i.test(message) || /SQLITE_CONSTRAINT_FOREIGNKEY/i.test(message) || /\b1811\b/.test(message)) {
    return true
  }
  // Generic "CONSTRAINT failed" without UNIQUE/CHECK/NOT NULL — treat as FK only when code hints exist.
  if (/constraint\s*failed/i.test(message) && /FOREIGN KEY/i.test(message)) {
    return true
  }
  return FOREIGN_KEY_MESSAGE_RE.test(message)
}

export function getForeignKeyUserMessage(fallback = '') {
  const text = String(fallback ?? '').trim()
  if (text && !FOREIGN_KEY_MESSAGE_RE.test(text)) return text
  return '資料關聯不一致（外鍵約束）。請重試同步／匯入，或先修復本機資料後再操作。'
}

/**
 * Wrap a raw SQLite FK failure as a typed, user-visible Error.
 * Preserves the original as `cause` when the runtime supports it.
 */
export function createForeignKeyConstraintError(cause, options = {}) {
  const originalMessage = String(cause?.message ?? cause ?? '').trim()
  const message = String(options.message ?? '').trim() || getForeignKeyUserMessage(originalMessage)
  const error = new Error(message)
  error.code = SQLITE_FOREIGN_KEY_ERROR_CODE
  error.numericCode = SQLITE_FOREIGN_KEY_ERROR_NUMERIC
  error.i18nKey = options.i18nKey || 'sqlite.error.foreign_key_constraint'
  error.recoverable = options.recoverable !== false
  error.originalMessage = originalMessage
  if (cause && typeof cause === 'object') {
    try {
      error.cause = cause
    } catch {
      // older runtimes may reject assigning cause
    }
  }
  return error
}

export function rethrowAsForeignKeyError(error, options = {}) {
  if (!isForeignKeyError(error)) throw error
  if (error?.code === SQLITE_FOREIGN_KEY_ERROR_CODE && error?.i18nKey) throw error
  throw createForeignKeyConstraintError(error, options)
}

export function formatSyncForeignKeyError(error) {
  if (!isForeignKeyError(error)) {
    return String(error?.message ?? error ?? '同步失敗').slice(0, 240)
  }
  return getForeignKeyUserMessage(error?.message).slice(0, 240)
}
