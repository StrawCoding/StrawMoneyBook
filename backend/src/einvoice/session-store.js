const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000

const sessions = new Map()
const releaseListeners = new Set()

function nowMs() {
  return Date.now()
}

export function createSessionRecord(sessionId, data = {}) {
  const id = String(sessionId ?? '').trim()
  if (!id) throw new Error('session_id is required')

  const expiresAt = nowMs() + (Number(data.ttlMs) > 0 ? Number(data.ttlMs) : DEFAULT_SESSION_TTL_MS)
  const record = {
    sessionId: id,
    createdAt: nowMs(),
    expiresAt,
    status: 'open',
    needsCaptcha: Boolean(data.needsCaptcha),
    captchaSubmitted: Boolean(data.captchaSubmitted),
    captchaToken: String(data.captchaToken ?? ''),
    cardNo: String(data.cardNo ?? ''),
    cardEncrypt: String(data.cardEncrypt ?? ''),
    metadata: data.metadata && typeof data.metadata === 'object' ? { ...data.metadata } : {},
    cleanup: typeof data.cleanup === 'function' ? data.cleanup : null,
  }
  sessions.set(id, record)
  return record
}

function notifySessionReleased(record, reason = 'deleted') {
  if (!record) return
  for (const listener of releaseListeners) {
    try {
      listener(record, reason)
    } catch {
      // Ignore observer errors; session cleanup must continue.
    }
  }
}

async function cleanupSessionRecord(record, reason = 'deleted') {
  notifySessionReleased(record, reason)
  if (typeof record?.cleanup !== 'function') return
  await record.cleanup(record, reason)
}

export function getSessionRecord(sessionId) {
  purgeExpiredSessions()
  const id = String(sessionId ?? '').trim()
  if (!id) return null
  const record = sessions.get(id)
  if (!record) return null
  if (record.expiresAt <= nowMs()) {
    sessions.delete(id)
    void cleanupSessionRecord(record, 'expired')
    return null
  }
  return record
}

export function updateSessionRecord(sessionId, patch = {}) {
  const record = getSessionRecord(sessionId)
  if (!record) return null
  Object.assign(record, patch)
  sessions.set(record.sessionId, record)
  return record
}

export function deleteSessionRecord(sessionId) {
  const id = String(sessionId ?? '').trim()
  if (!id) return false
  const record = sessions.get(id)
  const deleted = sessions.delete(id)
  if (deleted) void cleanupSessionRecord(record, 'deleted')
  return deleted
}

export async function releaseSessionRecord(sessionId, reason = 'deleted') {
  const id = String(sessionId ?? '').trim()
  if (!id) return false
  const record = sessions.get(id)
  const deleted = sessions.delete(id)
  if (deleted) await cleanupSessionRecord(record, reason)
  return deleted
}

export function purgeExpiredSessions() {
  const current = nowMs()
  for (const [id, record] of sessions.entries()) {
    if (!record || record.expiresAt <= current) {
      sessions.delete(id)
      void cleanupSessionRecord(record, 'expired')
    }
  }
}

export function clearAllSessions() {
  sessions.clear()
}

export function subscribeSessionReleased(listener) {
  if (typeof listener !== 'function') return () => {}
  releaseListeners.add(listener)
  return () => {
    releaseListeners.delete(listener)
  }
}
