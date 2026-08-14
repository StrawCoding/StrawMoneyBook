/**
 * ART-19 — Minimal app error taxonomy (not a God ErrorManager).
 * Callers decide throw / retry / rollback / UI / log from `kind`.
 */

export const APP_ERROR_KIND = Object.freeze({
  DOMAIN: 'domain',
  DATABASE: 'database',
  NETWORK: 'network',
  AUTH: 'auth',
  CONFLICT: 'conflict',
  RECOVERY: 'recovery',
  UNKNOWN: 'unknown',
})

/**
 * @param {unknown} error
 * @returns {{ kind: string, code: string, message: string, retriable: boolean, cause: unknown }}
 */
export function classifyAppError(error) {
  const code = String(error?.code ?? error?.name ?? '').trim()
  const message = String(error?.message ?? error ?? '').trim()
  const status = Number(error?.status ?? error?.statusCode ?? 0) || 0
  const lower = `${code} ${message}`.toLowerCase()

  if (
    code === 'shared_ledger_replace_restore_failed'
    || code === 'RECOVERY_BACKUP_REQUIRED'
    || lower.includes('recovery')
    || lower.includes('restore_failed')
  ) {
    return { kind: APP_ERROR_KIND.RECOVERY, code: code || 'recovery_failed', message, retriable: false, cause: error }
  }

  if (
    status === 401
    || status === 403
    || code === 'auth_required'
    || code === 'admin_required'
    || lower.includes('unauthorized')
    || lower.includes('forbidden')
  ) {
    return { kind: APP_ERROR_KIND.AUTH, code: code || 'auth_error', message, retriable: false, cause: error }
  }

  if (
    status === 409
    || code === 'VERSION_CONFLICT'
    || code === 'conflict'
    || lower.includes('conflict')
    || lower.includes('cas')
  ) {
    return { kind: APP_ERROR_KIND.CONFLICT, code: code || 'conflict', message, retriable: true, cause: error }
  }

  if (
    status >= 500
    || code === 'NETWORK_ERROR'
    || lower.includes('network')
    || lower.includes('fetch failed')
    || lower.includes('timeout')
  ) {
    return { kind: APP_ERROR_KIND.NETWORK, code: code || 'network_error', message, retriable: true, cause: error }
  }

  if (
    code === 'SQLITE_CONSTRAINT'
    || code === 'FOREIGN_KEY'
    || lower.includes('sqlite')
    || lower.includes('foreign key')
    || lower.includes('database')
  ) {
    return { kind: APP_ERROR_KIND.DATABASE, code: code || 'database_error', message, retriable: false, cause: error }
  }

  if (
    code.startsWith('CLOSED_')
    || code === 'MEMBERSHIP_LIMIT'
    || lower.includes('amountminor')
    || lower.includes('不可')
    || lower.includes('必須')
  ) {
    return { kind: APP_ERROR_KIND.DOMAIN, code: code || 'domain_error', message, retriable: false, cause: error }
  }

  return { kind: APP_ERROR_KIND.UNKNOWN, code: code || 'unknown_error', message, retriable: false, cause: error }
}

/**
 * Tag an Error with taxonomy fields without wrapping message.
 * @param {Error} error
 * @param {Partial<{ kind: string, code: string, retriable: boolean }>} patch
 */
export function tagAppError(error, patch = {}) {
  if (!error || typeof error !== 'object') return error
  const classified = classifyAppError(error)
  error.appErrorKind = patch.kind || classified.kind
  error.appErrorCode = patch.code || classified.code || error.code
  error.appErrorRetriable = patch.retriable ?? classified.retriable
  return error
}
