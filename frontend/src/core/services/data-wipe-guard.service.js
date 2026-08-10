/**
 * smb297: Guard against silent local-ledger wipes.
 * Any full DB wipe must pass an explicit, user-confirmed reason + audit trail.
 */

export const DATA_WIPE_REASON = Object.freeze({
  USER_RESET_ALL: 'user_reset_all',
  USER_IMPORT_JSON: 'user_import_json',
  USER_RESTORE_GOOGLE_BACKUP: 'user_restore_google_backup',
  USER_RESTORE_WEBDAV_BACKUP: 'user_restore_webdav_backup',
})

export const LOCAL_DB_INTEGRITY_ERROR_CODE = 'LOCAL_DB_INTEGRITY'
export const EMPTY_REMOTE_REPLACE_BLOCKED_CODE = 'EMPTY_REMOTE_REPLACE_BLOCKED'
export const DATA_WIPE_DENIED_CODE = 'DATA_WIPE_DENIED'

const AUDIT_STORAGE_KEY = 'straw.data_wipe_audit.v1'
const AUDIT_LIMIT = 40

const ALLOWED_REASONS = new Set(Object.values(DATA_WIPE_REASON))

export function createLocalDatabaseIntegrityError(cause, options = {}) {
  const originalMessage = String(cause?.message ?? cause ?? '').trim()
  const message =
    String(options.message ?? '').trim()
    || '本機資料庫無法安全開啟。系統不會自動清空帳本；請從備份／Google Drive／匯入還原，或至資料管理明確重設。'
  const error = new Error(message)
  error.code = LOCAL_DB_INTEGRITY_ERROR_CODE
  error.i18nKey = options.i18nKey || 'app.local_db_integrity'
  error.originalMessage = originalMessage
  error.recoverable = false
  error.silentWipeBlocked = true
  if (cause && typeof cause === 'object') {
    try {
      error.cause = cause
    } catch {
      // older runtimes may reject assigning cause
    }
  }
  return error
}

export function createEmptyRemoteReplaceBlockedError(options = {}) {
  const localCount = Number(options.localTransactionCount ?? 0)
  const remoteCount = Number(options.remoteTransactionCount ?? 0)
  const message =
    String(options.message ?? '').trim()
    || `遠端帳本快照交易數（${remoteCount}）為空，但本機仍有 ${localCount} 筆交易；已阻止覆蓋以避免 silent wipe。請改用合併同步、從備份還原，或在確認後以匯入／重設路徑處理。`
  const error = new Error(message)
  error.code = EMPTY_REMOTE_REPLACE_BLOCKED_CODE
  error.i18nKey = options.i18nKey || 'settings_google_sync.error.empty_remote_replace_blocked'
  error.localTransactionCount = localCount
  error.remoteTransactionCount = remoteCount
  error.silentWipeBlocked = true
  return error
}

export function assertExplicitDataWipe(options = {}) {
  const reason = String(options.reason ?? '').trim()
  const source = String(options.source ?? '').trim()
  const confirmed = options.confirmed === true

  if (!confirmed || !ALLOWED_REASONS.has(reason) || !source) {
    const error = new Error(
      '本機資料清空被拒絕：缺少使用者確認或合法 wipe 理由。FK／migration／bootstrap 不得靜默 wipe。',
    )
    error.code = DATA_WIPE_DENIED_CODE
    error.i18nKey = 'sqlite.error.data_wipe_denied'
    error.silentWipeBlocked = true
    throw error
  }

  return { reason, source, confirmed: true }
}

function readAuditStore() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAuditStore(entries) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(entries.slice(0, AUDIT_LIMIT)))
  } catch {
    // storage full / private mode — audit best-effort only
  }
}

export function recordDataWipeAudit(entry = {}) {
  const next = {
    at: String(entry.at ?? new Date().toISOString()),
    reason: String(entry.reason ?? ''),
    source: String(entry.source ?? ''),
    confirmed: entry.confirmed === true,
    note: String(entry.note ?? '').slice(0, 240),
  }
  const list = [next, ...readAuditStore()].slice(0, AUDIT_LIMIT)
  writeAuditStore(list)
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info('[data-wipe-audit]', next)
  }
  return next
}

export function listDataWipeAudit() {
  return readAuditStore()
}

export const RECOVERY_BACKUP_REQUIRED_CODE = 'RECOVERY_BACKUP_REQUIRED'

/**
 * smb297: Local recovery backup is mandatory before any full wipe.
 * Backup failure must abort the wipe — never continue into resetDatabase.
 */
export function createRecoveryBackupRequiredError(cause, options = {}) {
  const originalMessage = String(cause?.message ?? cause ?? '').trim()
  const message =
    String(options.message ?? '').trim()
    || '本機 recovery 備份建立失敗，已中止清空本機資料。請先手動匯出備份後再重試還原／匯入／重設。'
  const error = new Error(message)
  error.code = RECOVERY_BACKUP_REQUIRED_CODE
  error.i18nKey = options.i18nKey || 'settings_data.toast.recovery_backup_required'
  error.source = String(options.source ?? '').trim()
  error.originalMessage = originalMessage
  error.silentWipeBlocked = true
  if (cause && typeof cause === 'object') {
    try {
      error.cause = cause
    } catch {
      // older runtimes may reject assigning cause
    }
  }
  return error
}

function isVerifiedRecoveryBackupProof(proof) {
  return Boolean(
    proof
    && typeof proof === 'object'
    && proof.verified === true
    && Number(proof.byteLength) > 0
    && String(proof.backupId || '').trim()
    && String(proof.storage || '').trim(),
  )
}

/**
 * Mandatory gate before resetDatabase / full wipe.
 * createBackup must return a verified durable proof — void / download-only does not count.
 */
export async function requireRecoveryBackupBeforeWipe(createBackup, options = {}) {
  if (typeof createBackup !== 'function') {
    throw createRecoveryBackupRequiredError(new Error('recovery backup creator missing'), options)
  }
  let proof
  try {
    proof = await createBackup()
  } catch (cause) {
    if (cause?.code === RECOVERY_BACKUP_REQUIRED_CODE) throw cause
    throw createRecoveryBackupRequiredError(cause, options)
  }
  if (!isVerifiedRecoveryBackupProof(proof)) {
    throw createRecoveryBackupRequiredError(
      new Error('recovery backup proof missing or unverified (download-only is not enough)'),
      options,
    )
  }
  return proof
}

/**
 * Orchestrates: verified recovery backup → wipe. Used by Google/WebDAV restore and tests.
 * Backup failure must never call wipeFn.
 */
export async function runConfirmedWipeAfterRecoveryBackup({
  createRecoveryBackup,
  wipeFn,
  source,
  i18nKey,
} = {}) {
  await requireRecoveryBackupBeforeWipe(createRecoveryBackup, { source, i18nKey })
  if (typeof wipeFn !== 'function') {
    throw new Error('wipe function missing after recovery backup')
  }
  return wipeFn()
}

export function countSnapshotActiveTransactions(snapshot) {
  const rows = snapshot?.tables?.transactions
  if (!Array.isArray(rows)) return 0
  return rows.filter((row) => !row?.deleted_at).length
}

export const LEDGER_REPAIR_REASON = Object.freeze({
  USER_EXPLICIT: 'user_explicit_repair',
  USER_IMPORT_JSON: 'user_import_integrity_repair',
  USER_RESTORE_BACKUP: 'user_restore_integrity_repair',
})

const ALLOWED_REPAIR_REASONS = new Set(Object.values(LEDGER_REPAIR_REASON))
const INTEGRITY_SCAN_KEY = 'straw.ledger_integrity_scan.v1'
const REPAIR_AUDIT_KEY = 'straw.ledger_repair_audit.v1'
export const LEDGER_REPAIR_DENIED_CODE = 'LEDGER_REPAIR_DENIED'

export function assertExplicitLedgerRepair(options = {}) {
  const reason = String(options.reason ?? '').trim()
  const source = String(options.source ?? '').trim()
  const confirmed = options.confirmed === true

  if (!confirmed || !ALLOWED_REPAIR_REASONS.has(reason) || !source) {
    const error = new Error(
      '帳本修復被拒絕：缺少使用者確認。啟動／migration／orphan prune 不得靜默改寫帳本語意。',
    )
    error.code = LEDGER_REPAIR_DENIED_CODE
    error.i18nKey = 'sqlite.error.ledger_repair_denied'
    error.silentRewriteBlocked = true
    throw error
  }

  return { reason, source, confirmed: true }
}

export function recordLedgerIntegrityScan(entry = {}) {
  const next = {
    at: String(entry.at ?? new Date().toISOString()),
    ledgerId: String(entry.ledgerId ?? ''),
    issueCount: Number(entry.issueCount ?? 0) || 0,
    autoRepaired: entry.autoRepaired === true,
    issues: entry.issues && typeof entry.issues === 'object' ? entry.issues : {},
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(INTEGRITY_SCAN_KEY, JSON.stringify(next))
    } catch {
      // best-effort
    }
  }
  return next
}

export function readLastLedgerIntegrityScan() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(INTEGRITY_SCAN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function recordLedgerRepairAudit(entry = {}) {
  const next = {
    at: String(entry.at ?? new Date().toISOString()),
    reason: String(entry.reason ?? ''),
    source: String(entry.source ?? ''),
    ledgerId: String(entry.ledgerId ?? ''),
    confirmed: entry.confirmed === true,
    fixedCount: Number(entry.fixedCount ?? 0) || 0,
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const prev = JSON.parse(localStorage.getItem(REPAIR_AUDIT_KEY) || '[]')
      const list = Array.isArray(prev) ? prev : []
      localStorage.setItem(REPAIR_AUDIT_KEY, JSON.stringify([next, ...list].slice(0, AUDIT_LIMIT)))
    } catch {
      // best-effort
    }
  }
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info('[ledger-repair-audit]', next)
  }
  return next
}
